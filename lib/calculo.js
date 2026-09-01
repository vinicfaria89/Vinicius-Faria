// Motor de cálculo das simulações GCB.
//
// Metodologia: convenção padrão do mercado de renda fixa brasileiro (ANBIMA/B3), a mesma usada por
// bancos e corretoras de referência (XP, BTG, Itaú etc.) e pela própria calculadora da ANBIMA:
//  - Base 252 dias úteis, capitalização COMPOSTA: VF = VI × (1 + i)^(du/252), para TODOS os tipos de
//    ativo (prefixado, CDI+, IPCA+) — sem distinção entre "juros simples" e "compostos" por tipo.
//  - Taxa efetiva de ativos indexados = combinação MULTIPLICATIVA entre a taxa de referência de
//    mercado e o spread contratado: i = (1 + taxa_referência) × (1 + spread) − 1.
//  - Referência de CDI+: curva PRE (DI Futuro) da B3.
//  - Referência de IPCA+: Inflação Implícita (ETTJ) da ANBIMA.
//
// (Nota: uma reconciliação numérica anterior contra o site oficial da GCB — 12/08/2026 — havia levado
// a usar juros simples + combinação aditiva para bater com esse site específico; por decisão do
// usuário, voltamos à convenção de mercado 252/composto, mais alinhada a fontes oficiais e ao padrão
// de bancos/corretoras conceituadas, mesmo que isso reintroduza um pequeno desvio frente àquele site
// específico.)

const anbimaLib = require('./anbima');
const { interpolar } = anbimaLib;
const { diasUteisEntre } = require('./calendario');

function diasEntre(dataBase, dataVenc) {
  return Math.round((dataVenc.getTime() - dataBase.getTime()) / 86400000);
}

function mesesEntre(dataBase, dataVenc) {
  let m = (dataVenc.getFullYear() - dataBase.getFullYear()) * 12 + (dataVenc.getMonth() - dataBase.getMonth());
  if (dataVenc.getDate() < dataBase.getDate()) m -= 1;
  return m;
}

// Soma meses a uma data preservando o dia (o overflow de mês/ano é normalizado pelo próprio Date do JS).
function adicionarMeses(data, meses) {
  return new Date(data.getFullYear(), data.getMonth() + meses, data.getDate());
}

// Tabela regressiva de IR sobre renda fixa (dias corridos desde a data-base).
function aliquotaIR(diasCorridos) {
  if (diasCorridos <= 180) return 0.225;
  if (diasCorridos <= 360) return 0.20;
  if (diasCorridos <= 720) return 0.175;
  return 0.15;
}

// curvas = { anbima: {infl, pre, ipca}, b3Pre: {pontos, dataRef} }
// ativo.tipo:
//   'fixo'    -> prefixado, taxa informada ao mês (taxaAM), convertida para efetiva anual
//   'fixoAA'  -> prefixado, taxa já informada ao ano (taxaAA), usada diretamente
//   'cdi'     -> CDI + spread (taxa de referência PRE/DI Futuro, fonte B3, combinação multiplicativa)
//   'ipca'    -> IPCA + spread (taxa de referência Inflação Implícita, fonte ANBIMA, combinação multiplicativa)
//   'pctcdi'  -> percentual do CDI (ex.: 110% CDI) — taxa efetiva = referência × percentual (não soma spread)
function taxaEfetivaAnual(ativo, curvas) {
  if (ativo.tipo === 'fixo') return Math.pow(1 + ativo.taxaAM, 12) - 1;
  if (ativo.tipo === 'fixoAA') return ativo.taxaAA;

  // Dias úteis REAIS (calendário nacional de feriados bancários), não uma aproximação estatística —
  // necessário tanto para interpolar a curva no vértice correto quanto para o expoente da capitalização.
  const du = diasUteisEntre(ativo.dataBase, ativo.vencimento);

  if (ativo.tipo === 'pctcdi') {
    const refCdi = interpolar(du, curvas.b3Pre.pontos);
    return (refCdi / 100) * ativo.percentualCDI; // % do CDI — sem soma de spread
  }

  let ref;
  if (ativo.tipo === 'cdi') ref = interpolar(du, curvas.b3Pre.pontos);
  else if (ativo.tipo === 'ipca') ref = interpolar(du, curvas.anbima.infl);
  else throw new Error(`Tipo de ativo desconhecido: ${ativo.tipo}`);
  return (1 + ref / 100) * (1 + ativo.spread) - 1; // combinação MULTIPLICATIVA (padrão de mercado)
}

// Capitalização composta padrão do mercado: VF = VI × (1 + i)^(du/252), em que `du` é a contagem
// REAL de dias úteis (calendário nacional de feriados bancários) — ver lib/calendario.js.
function capitalizarComposto(vi, iAnual, du) {
  return vi * Math.pow(1 + iAnual, du / 252);
}

// Amortização SAC (parcelas de principal constantes) com juros calculados sobre o saldo devedor —
// modelo-base para ativos Cash Sweep. Juros e amortização podem ter periodicidades independentes
// (mensal ou semestral cada); o cálculo caminha mês a mês para lidar com as duas ao mesmo tempo.
//   - Cada mês: acumula juros sobre o saldo devedor do início do mês (taxa mensal equivalente a iAnual).
//   - Nos meses de amortização, abate uma parcela constante de principal do saldo (a última parcela
//     zera o saldo, absorvendo qualquer resíduo de arredondamento).
//   - Nos meses de pagamento de juros, libera o IR pela alíquota regressiva do prazo decorrido e zera
//     o acumulador de juros.
// Isto modela a AMORTIZAÇÃO PROGRAMADA de um Cash Sweep; não modela a aceleração por excesso de caixa
// em si (que depende do desempenho da operação subjacente e não pode ser simulada de antemão) — ver
// ressalva no relatório.
const MESES_POR_PERIODICIDADE = { mensal: 1, semestral: 6, anual: 12 };

function calcularAmortizacaoCashSweep(ativo, curvas, iAnual) {
  const periodicidadeJuros = MESES_POR_PERIODICIDADE[ativo.periodicidadeJurosCashSweep] ? ativo.periodicidadeJurosCashSweep : 'mensal';
  const jurosMeses = MESES_POR_PERIODICIDADE[periodicidadeJuros];
  const periodicidadeAmortizacao = MESES_POR_PERIODICIDADE[ativo.periodicidadeAmortizacaoCashSweep] ? ativo.periodicidadeAmortizacaoCashSweep : 'mensal';
  const amortMeses = MESES_POR_PERIODICIDADE[periodicidadeAmortizacao];

  const mesesTotais = mesesEntre(ativo.dataBase, ativo.vencimento);
  const nAmortizacoes = Math.max(1, Math.floor(mesesTotais / amortMeses));
  const amortizacaoConstante = ativo.vi / nAmortizacoes;
  const taxaMensal = Math.pow(1 + iAnual, 1 / 12) - 1;

  let saldo = ativo.vi;
  let jurosAcumuladoNoPeriodo = 0;
  let contadorAmortizacoes = 0;
  const cupomLiquidos = [];
  const cupomBrutos = [];
  const saldoHistorico = [{ mes: 0, saldo }];
  const jurosHistorico = [];

  for (let m = 1; m <= mesesTotais; m++) {
    jurosAcumuladoNoPeriodo += saldo * taxaMensal;

    if (m % amortMeses === 0 && contadorAmortizacoes < nAmortizacoes) {
      const ultima = contadorAmortizacoes === nAmortizacoes - 1;
      const valorAmort = ultima ? saldo : amortizacaoConstante;
      saldo -= valorAmort;
      contadorAmortizacoes++;
      saldoHistorico.push({ mes: m, saldo });
    }

    if (m % jurosMeses === 0) {
      const dataPagamento = adicionarMeses(ativo.dataBase, m);
      const diasAtePagamento = diasEntre(ativo.dataBase, dataPagamento);
      const aliquotaPagamento = aliquotaIR(diasAtePagamento);
      const liq = ativo.isento ? jurosAcumuladoNoPeriodo : jurosAcumuladoNoPeriodo * (1 - aliquotaPagamento);
      cupomBrutos.push(jurosAcumuladoNoPeriodo);
      cupomLiquidos.push(liq);
      jurosHistorico.push({ mes: m, valor: liq });
      jurosAcumuladoNoPeriodo = 0;
    }
  }

  const somaJurosBrutos = cupomBrutos.reduce((s, v) => s + v, 0);
  const somaJurosLiquidos = cupomLiquidos.reduce((s, v) => s + v, 0);

  return {
    periodicidadeJuros,
    periodicidadeAmortizacao,
    mesesTotais,
    nAmortizacoes,
    amortizacaoConstante,
    saldoHistorico,
    jurosHistorico,
    cupomBruto: cupomBrutos.length ? cupomBrutos[0] : null,
    cupomLiq: cupomLiquidos.length ? cupomLiquidos[0] : null,
    cupomLiquidos,
    nPeriodos: cupomLiquidos.length,
    vfBruto: ativo.vi + somaJurosBrutos,
    vfLiquido: ativo.vi + somaJurosLiquidos,
  };
}

// Cronograma de amortização PERSONALIZADO: em vez de uma periodicidade fixa com parcelas iguais
// (SAC, ver calcularAmortizacaoCashSweep acima), o assessor informa a lista real de pagamentos do
// ativo (datas de calendário fixas — não "meses desde a data-base", porque o título já foi emitido
// numa data própria, e simular a partir de hoje não deveria inventar um cronograma novo) e o
// percentual do SALDO REMANESCENTE amortizado em cada uma — exatamente a leitura da coluna "Saldo a
// Amortizar" de um material de distribuição real (ex.: CRA com juros semestrais e amortização
// irregular por parcela). Cada percentual incide sobre o saldo NAQUELE MOMENTO, não sobre o principal
// original — por isso os percentuais de todas as parcelas costumam somar bem mais que 100%.
// Parcelas cuja data já passou em relação à data-base da simulação são ignoradas (não fazem mais
// parte do fluxo futuro de quem for simular esse ativo a partir de hoje).
function calcularCronogramaPersonalizado(ativo, curvas, iAnual) {
  const parcelas = [...ativo.cronograma]
    .filter((p) => p.data > ativo.dataBase)
    .sort((a, b) => a.data - b.data);

  let saldo = ativo.vi;
  let dataAnterior = ativo.dataBase;
  const cupomLiquidos = [];
  const cupomBrutos = [];
  const saldoHistorico = [{ mes: 0, saldo }];
  const jurosHistorico = [];

  parcelas.forEach((p, idx) => {
    const duPeriodo = diasUteisEntre(dataAnterior, p.data);
    const jurosBruto = saldo * (Math.pow(1 + iAnual, duPeriodo / 252) - 1);
    const diasAtePagamento = diasEntre(ativo.dataBase, p.data);
    const aliquotaPagamento = aliquotaIR(diasAtePagamento);
    const liq = ativo.isento ? jurosBruto : jurosBruto * (1 - aliquotaPagamento);
    cupomBrutos.push(jurosBruto);
    cupomLiquidos.push(liq);
    // "mes" aqui é só uma posição aproximada pro eixo do gráfico (reaproveita gerarFluxoCashSweepSVG,
    // que espera offsets em meses inteiros) — o cálculo financeiro em si usa dias úteis reais acima.
    const mesAproximado = Math.round(diasAtePagamento / 30.4368);
    jurosHistorico.push({ mes: mesAproximado, dias: diasAtePagamento, valor: liq });

    const ultima = idx === parcelas.length - 1;
    const valorAmort = ultima ? saldo : saldo * (p.pctAmortizar / 100);
    saldo = Math.max(0, saldo - valorAmort);
    saldoHistorico.push({ mes: mesAproximado, dias: diasAtePagamento, saldo });
    dataAnterior = p.data;
  });

  const somaJurosBrutos = cupomBrutos.reduce((s, v) => s + v, 0);
  const somaJurosLiquidos = cupomLiquidos.reduce((s, v) => s + v, 0);
  const mesesTotais = saldoHistorico.length > 1 ? saldoHistorico[saldoHistorico.length - 1].mes : 1;

  return {
    periodicidadeJuros: 'personalizada',
    periodicidadeAmortizacao: 'personalizada',
    mesesTotais: Math.max(1, mesesTotais),
    nAmortizacoes: parcelas.length,
    amortizacaoConstante: null,
    saldoHistorico,
    jurosHistorico,
    cupomBruto: cupomBrutos.length ? cupomBrutos[0] : null,
    cupomLiq: cupomLiquidos.length ? cupomLiquidos[0] : null,
    cupomLiquidos,
    nPeriodos: cupomLiquidos.length,
    vfBruto: ativo.vi + somaJurosBrutos,
    vfLiquido: ativo.vi + somaJurosLiquidos,
  };
}

// Juros reinvestidos periodicamente, com IR descontado A CADA PAGAMENTO antes de somar ao saldo —
// diferente de tratar como bullet puro (que ignoraria a tributação periódica e superestimaria o VF).
// O saldo cresce por ADIÇÃO do juro líquido de cada período (não por capitalização contínua da taxa
// bruta), pela mesma lógica de tributação regressiva já usada no Caso A (cada pagamento é tributado
// pela alíquota do prazo decorrido ATÉ ELE, não um percentual único fixo).
function calcularReinvestimentoComIR(ativo, iAnual) {
  const periodicidadeCupom = ativo.periodicidadeCupom === 'semestral' ? 'semestral' : 'mensal';
  const periodicidadeMeses = periodicidadeCupom === 'semestral' ? 6 : 1;
  const mesesTotais = mesesEntre(ativo.dataBase, ativo.vencimento);
  const nPeriodos = Math.floor(mesesTotais / periodicidadeMeses);
  const fatorPeriodo = Math.pow(1 + iAnual, periodicidadeMeses / 12) - 1;

  let saldo = ativo.vi;
  const cupomLiquidos = [];
  const cupomBrutos = [];
  for (let p = 1; p <= nPeriodos; p++) {
    const jurosBruto = saldo * fatorPeriodo;
    const dataPagamento = adicionarMeses(ativo.dataBase, p * periodicidadeMeses);
    const diasAtePagamento = diasEntre(ativo.dataBase, dataPagamento);
    const aliquotaPagamento = aliquotaIR(diasAtePagamento);
    const jurosLiquido = ativo.isento ? jurosBruto : jurosBruto * (1 - aliquotaPagamento);
    cupomBrutos.push(jurosBruto);
    cupomLiquidos.push(jurosLiquido);
    saldo += jurosLiquido; // reinveste o valor JÁ LÍQUIDO de IR
  }

  const somaJurosBrutos = cupomBrutos.reduce((s, v) => s + v, 0);
  return {
    periodicidadeCupom,
    periodicidadeMeses,
    nPeriodos,
    cupomBruto: cupomBrutos.length ? cupomBrutos[0] : null,
    cupomLiq: cupomLiquidos.length ? cupomLiquidos[0] : null,
    cupomLiquidos,
    vfBruto: ativo.vi + somaJurosBrutos,
    vfLiquido: saldo,
  };
}

// Calcula um ativo da carteira.
// ativo: { nome, tipo, vi, dataBase, vencimento, taxaAM?, spread?, isento, pagaCupomMensal, reinvestir?,
//          periodicidadeCupom? ('mensal' | 'semestral'), cashSweep?, periodicidadeJurosCashSweep?,
//          periodicidadeAmortizacaoCashSweep? }
//   - cashSweep=true                                    -> Amortização SAC com juros sobre saldo devedor,
//     nas periodicidades de juros/amortização escolhidas (ver calcularAmortizacaoCashSweep) — tem
//     prioridade sobre pagaCupomMensal/reinvestir, que são ignorados nesse caso.
//   - pagaCupomMensal=true, reinvestir=false (padrão)  -> Caso A (Renda periódica): juros distribuídos,
//     não reinvestidos, na periodicidade contratada (mensal ou semestral — ver periodicidadeCupom)
//   - pagaCupomMensal=false, reinvestir=false           -> Caso B (bullet): pagamento único no vencimento
//   - pagaCupomMensal=true, reinvestir=true              -> Caso C (reinvestido): juros periódicos, cada
//     um descontado de IR pela alíquota regressiva do prazo decorrido ANTES de somar ao saldo (ver
//     calcularReinvestimentoComIR) — usado quando o cliente opta por reinvestir os juros
function calcularAtivo(ativo, curvas) {
  const dias = diasEntre(ativo.dataBase, ativo.vencimento);
  const du = diasUteisEntre(ativo.dataBase, ativo.vencimento);
  const iAnual = taxaEfetivaAnual(ativo, curvas);
  const aliquotaTotal = aliquotaIR(dias);
  const pagaCupom = !!ativo.pagaCupomMensal;
  const reinvestir = !!ativo.reinvestir;
  const periodicidadeCupom = ativo.periodicidadeCupom === 'semestral' ? 'semestral' : 'mensal';
  const periodicidadeMeses = periodicidadeCupom === 'semestral' ? 6 : 1;

  let cupomBruto = null;
  let cupomLiq = null;
  let cupomLiquidos = null;
  let nPeriodos = null;
  let vfBruto;
  let vfLiquido;
  let cashSweepInfo = null;

  if (ativo.cronogramaPersonalizado && Array.isArray(ativo.cronograma) && ativo.cronograma.length) {
    // Cronograma personalizado — datas e percentuais de amortização reais do ativo (ver
    // calcularCronogramaPersonalizado), pra reproduzir fielmente um fluxo irregular de um material de
    // distribuição real, em vez de forçar numa periodicidade fixa (SAC) que não bateria com os
    // números do papel. Tem prioridade sobre Cash Sweep e os Casos A/B/C abaixo.
    cashSweepInfo = calcularCronogramaPersonalizado(ativo, curvas, iAnual);
    cupomBruto = cashSweepInfo.cupomBruto;
    cupomLiq = cashSweepInfo.cupomLiq;
    cupomLiquidos = cashSweepInfo.cupomLiquidos;
    nPeriodos = cashSweepInfo.nPeriodos;
    vfBruto = cashSweepInfo.vfBruto;
    vfLiquido = cashSweepInfo.vfLiquido;
  } else if (ativo.cashSweep) {
    // Cash Sweep — amortização programada (SAC) com juros sobre o saldo devedor; substitui inteiramente
    // os casos A/B abaixo, pois o principal não fica constante até o vencimento.
    cashSweepInfo = calcularAmortizacaoCashSweep(ativo, curvas, iAnual);
    cupomBruto = cashSweepInfo.cupomBruto;
    cupomLiq = cashSweepInfo.cupomLiq;
    cupomLiquidos = cashSweepInfo.cupomLiquidos;
    nPeriodos = cashSweepInfo.nPeriodos;
    vfBruto = cashSweepInfo.vfBruto;
    vfLiquido = cashSweepInfo.vfLiquido;
  } else if (pagaCupom && !reinvestir) {
    // Caso A — juros distribuídos periodicamente, não reinvestidos. Cada pagamento sofre retenção de
    // IR pela tabela regressiva com base nos dias corridos ATÉ AQUELE PAGAMENTO especificamente (não
    // um percentual único fixo para todos) — por isso a alíquota efetiva cai ao longo do tempo, igual
    // ao que acontece de fato num CDB/CRI/CRA/Debênture com cupom periódico.
    cupomBruto = ativo.vi * (Math.pow(1 + iAnual, periodicidadeMeses / 12) - 1);
    const mesesTotais = mesesEntre(ativo.dataBase, ativo.vencimento);
    nPeriodos = Math.floor(mesesTotais / periodicidadeMeses);
    cupomLiquidos = [];
    let somaCuponsLiquidos = 0;
    for (let p = 1; p <= nPeriodos; p++) {
      const dataPagamento = adicionarMeses(ativo.dataBase, p * periodicidadeMeses);
      const diasAtePagamento = diasEntre(ativo.dataBase, dataPagamento);
      const aliquotaPagamento = aliquotaIR(diasAtePagamento);
      const liq = ativo.isento ? cupomBruto : cupomBruto * (1 - aliquotaPagamento);
      cupomLiquidos.push(liq);
      somaCuponsLiquidos += liq;
    }
    cupomLiq = cupomLiquidos.length ? cupomLiquidos[0] : null; // valor do 1º pagamento
    const somaCuponsBrutos = nPeriodos * cupomBruto;
    vfBruto = ativo.vi + somaCuponsBrutos;
    vfLiquido = ativo.vi + somaCuponsLiquidos;
  } else if (pagaCupom && reinvestir) {
    // Caso C — juros reinvestidos periodicamente: cada pagamento sofre o desconto de IR pela alíquota
    // regressiva do prazo decorrido ANTES de ser somado ao saldo (não é capitalização composta "cega"
    // sobre a taxa bruta) — ver calcularReinvestimentoComIR.
    const reinvestInfo = calcularReinvestimentoComIR(ativo, iAnual);
    cupomBruto = reinvestInfo.cupomBruto;
    cupomLiq = reinvestInfo.cupomLiq;
    cupomLiquidos = reinvestInfo.cupomLiquidos;
    nPeriodos = reinvestInfo.nPeriodos;
    vfBruto = reinvestInfo.vfBruto;
    vfLiquido = reinvestInfo.vfLiquido;
  } else {
    // Caso B — bullet puro: pagamento único no vencimento, capitalização composta base 252 dias úteis.
    vfBruto = capitalizarComposto(ativo.vi, iAnual, du);
    vfLiquido = ativo.isento ? vfBruto : ativo.vi + (vfBruto - ativo.vi) * (1 - aliquotaTotal);
  }

  return {
    nome: ativo.nome,
    dias,
    du,
    iAnual,
    aliquotaTotal,
    cupomBruto,
    cupomLiq,
    cupomLiquidos,
    periodicidadeCupom: cashSweepInfo ? cashSweepInfo.periodicidadeJuros : periodicidadeCupom,
    periodicidadeMeses,
    nPeriodos,
    vfBruto,
    vfLiquido,
    ir: vfBruto - vfLiquido,
    cashSweep: cashSweepInfo,
  };
}

// Duration de Macaulay do ativo, em anos — pondera cada fluxo de caixa EFETIVAMENTE recebido pelo
// investidor (cupom líquido, amortização de principal, ou o pagamento único final) pelo seu valor
// presente, descontado à taxa efetiva do próprio ativo: D = Σ(t_i × VP(FC_i)) / Σ VP(FC_i).
// Diferente do "prazo médio ponderado" (que usa só a data de vencimento contratual de cada ativo),
// aqui entram as datas REAIS de cada pagamento — por isso é sempre <= prazo até o vencimento, e só
// coincide com ele quando não há fluxo intermediário nenhum (bullet ou reinvestido, ver abaixo).
//   - Cash Sweep: cada amortização de principal (devolução de capital, não tributada) e cada
//     pagamento líquido de juros, na data em que efetivamente ocorrem.
//   - Caso A (cupom distribuído): cada cupom líquido na sua data de pagamento, mais a devolução do
//     principal (VI) no vencimento.
//   - Caso B (bullet) e Caso C (reinvestido): o investidor só recebe caixa uma única vez, no
//     vencimento — duration de um fluxo único é sempre igual ao prazo desse fluxo, então coincide
//     com o prazo até o vencimento (nesses dois casos, e só nesses, as duas métricas são iguais).
function calcularDurationAtivo(ativo, calc) {
  const iAnual = calc.iAnual;
  const fluxos = []; // { anos, valor }

  // Datas de cada fluxo: cronograma personalizado guarda os dias corridos EXATOS de cada parcela
  // (ver calcularCronogramaPersonalizado — o "mes" ali é só uma aproximação pro eixo do gráfico);
  // Cash Sweep de periodicidade fixa não tem esse campo, mas seu "mes" já é exato (múltiplo da
  // periodicidade), então reconstruir a data via adicionarMeses funciona igualmente bem.
  function diasDoFluxo(item) {
    return item.dias != null ? item.dias : diasEntre(ativo.dataBase, adicionarMeses(ativo.dataBase, item.mes));
  }

  if (ativo.cashSweep || ativo.cronogramaPersonalizado) {
    const cs = calc.cashSweep;
    for (let i = 1; i < cs.saldoHistorico.length; i++) {
      const valorAmort = cs.saldoHistorico[i - 1].saldo - cs.saldoHistorico[i].saldo;
      fluxos.push({ anos: diasDoFluxo(cs.saldoHistorico[i]) / 365, valor: valorAmort });
    }
    for (const j of cs.jurosHistorico) {
      fluxos.push({ anos: diasDoFluxo(j) / 365, valor: j.valor });
    }
  } else if (!!ativo.pagaCupomMensal && !ativo.reinvestir) {
    for (let p = 1; p <= calc.nPeriodos; p++) {
      const data = adicionarMeses(ativo.dataBase, p * calc.periodicidadeMeses);
      fluxos.push({ anos: diasEntre(ativo.dataBase, data) / 365, valor: calc.cupomLiquidos[p - 1] });
    }
    fluxos.push({ anos: calc.dias / 365, valor: ativo.vi });
  } else {
    fluxos.push({ anos: calc.dias / 365, valor: calc.vfLiquido });
  }

  let somaVP = 0;
  let somaVPxT = 0;
  for (const f of fluxos) {
    const vp = f.valor / Math.pow(1 + iAnual, f.anos);
    somaVP += vp;
    somaVPxT += vp * f.anos;
  }
  return somaVP > 0 ? somaVPxT / somaVP : calc.dias / 365;
}

// Calcula a carteira inteira e agregados (totais, prazo médio ponderado, comparativo com CDI/DI Futuro).
function calcularCarteira(ativos, curvas) {
  const resultados = ativos.map((a) => {
    const calc = calcularAtivo(a, curvas);
    return { ativo: a, calc: { ...calc, durationAnos: calcularDurationAtivo(a, calc) } };
  });

  const viTotal = ativos.reduce((s, a) => s + a.vi, 0);
  const vfLiquidoTotal = resultados.reduce((s, r) => s + r.calc.vfLiquido, 0);
  const vfBrutoTotal = resultados.reduce((s, r) => s + r.calc.vfBruto, 0);
  const jurosLiquidosTotal = resultados.reduce((s, r) => s + (r.calc.cupomLiq && !r.ativo.reinvestir ? r.calc.cupomLiq : 0), 0);
  const irTotal = vfBrutoTotal - vfLiquidoTotal;
  const retornoLiquidoPct = (vfLiquidoTotal / viTotal - 1) * 100;

  const prazoMedioDias = resultados.reduce((s, r) => s + r.ativo.vi * r.calc.dias, 0) / viTotal;
  // Duration da carteira: média ponderada pelo VI da duration de Macaulay de cada ativo — ponderar
  // pelo VI é consistente aqui porque, por construção, o VP de cada ativo descontado à SUA PRÓPRIA
  // taxa efetiva é o próprio VI (é a definição de taxa efetiva/yield), então VI-weighting equivale a
  // VP-weighting sem precisar de uma taxa de desconto única para a carteira toda.
  const durationAnos = resultados.reduce((s, r) => s + r.ativo.vi * r.calc.durationAnos, 0) / viTotal;
  // Média ponderada dos `du` REAIS de cada ativo (calendário nacional), não uma conversão
  // aproximada da média de dias corridos — mais precisa quando os ativos têm prazos diferentes.
  // Usada só para a métrica "Prazo Médio até o Vencimento" (data contratual do capital).
  const duMedio = resultados.reduce((s, r) => s + r.ativo.vi * r.calc.du, 0) / viTotal;
  // Comparativo com o CDI: usa a DURATION (prazo médio de exposição real do capital), não o prazo
  // até o vencimento contratual — em ativos com Cash Sweep/cronograma personalizado, parte do
  // capital já voltou por amortização antecipada bem antes do vencimento, então comparar contra o
  // CDI acumulado no prazo CHEIO até o vencimento penalizaria artificialmente o % do CDI desses
  // ativos, mesmo quando pagam um spread real acima do CDI (ver duração vs. prazo no relatório).
  // Aproxima du a partir da duration em anos (252 du/ano) só pra alimentar a curva/composição —
  // suficiente aqui porque o objetivo é comparar prazos equivalentes, não recalcular o rendimento
  // do ativo (que já usa o du exato em calcularAtivo).
  const duDuracaoMedia = durationAnos * 252;
  const diasDuracaoMedia = durationAnos * 365;
  const cdiRefMedio = interpolar(duDuracaoMedia, curvas.b3Pre.pontos); // DI Futuro (B3)
  const cdiAcumuladoPct = (Math.pow(1 + cdiRefMedio / 100, duDuracaoMedia / 252) - 1) * 100;
  const pctDoCdi = (retornoLiquidoPct / cdiAcumuladoPct) * 100;

  return {
    resultados,
    viTotal,
    vfLiquidoTotal,
    vfBrutoTotal,
    jurosLiquidosTotal,
    irTotal,
    retornoLiquidoPct,
    prazoMedioDias,
    prazoMedioAnos: prazoMedioDias / 365,
    durationAnos,
    duMedio,
    diasDuracaoMedia,
    duDuracaoMedia,
    cdiRefMedio,
    cdiAcumuladoPct,
    pctDoCdi,
  };
}

module.exports = { diasEntre, mesesEntre, aliquotaIR, taxaEfetivaAnual, capitalizarComposto, calcularAtivo, calcularDurationAtivo, calcularCarteira };
