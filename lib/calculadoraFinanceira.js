// Calculadora financeira avulsa — Valor Futuro, Valor Presente, Rentabilidade e Taxa Equivalente,
// para os 4 indexadores suportados (Pré, CDI+, IPCA+, % CDI). Reaproveita o MESMO motor de cálculo
// das simulações de carteira (lib/calculo.js) — mesma convenção 252 dias úteis / capitalização
// composta / combinação multiplicativa — para garantir que um número calculado aqui bate exatamente
// com o que apareceria se o mesmo produto fosse simulado numa Carteira Simulada.

const { diasEntre, aliquotaIR, taxaEfetivaAnual, calcularAtivo } = require('./calculo');
const { diasUteisEntre } = require('./calendario');
const { interpolar } = require('./anbima');

// Valor Futuro: dado o valor investido, taxa/indexador e prazo, quanto isso vira no vencimento.
// Reaproveita calcularAtivo — no modo bullet (pagamento único) por padrão, ou no modo Cash Sweep
// (amortização programada + juros sobre saldo devedor) quando `cashSweep` é passado — é exatamente o
// mesmo cálculo que a linha correspondente faria numa Carteira Simulada.
function calcularValorFuturo({
  ativoTaxa, dataBase, vencimento, isento, valorInvestido,
  cashSweep, periodicidadeJurosCashSweep, periodicidadeAmortizacaoCashSweep,
}, curvas) {
  const ativo = {
    ...ativoTaxa, vi: valorInvestido, dataBase, vencimento, isento,
    pagaCupomMensal: false, reinvestir: false,
    cashSweep: !!cashSweep,
    periodicidadeJurosCashSweep, periodicidadeAmortizacaoCashSweep,
  };
  const calc = calcularAtivo(ativo, curvas);
  const cdiRefPct = interpolar(calc.du, curvas.b3Pre.pontos);
  const cdiAcumuladoPct = (Math.pow(1 + cdiRefPct / 100, calc.du / 252) - 1) * 100;
  const rentabilidadePct = (calc.vfLiquido / valorInvestido - 1) * 100;
  const rentabilidadeAnualizadaPct = (Math.pow(calc.vfLiquido / valorInvestido, 252 / calc.du) - 1) * 100;
  const pctCdi = cdiAcumuladoPct !== 0 ? (rentabilidadePct / cdiAcumuladoPct) * 100 : null;
  const resultado = {
    dias: calc.dias,
    du: calc.du,
    iAnualPct: calc.iAnual * 100,
    aliquotaPct: calc.aliquotaTotal * 100,
    vfBruto: calc.vfBruto,
    ir: calc.ir,
    vfLiquido: calc.vfLiquido,
    rentabilidadePct,
    rentabilidadeAnualizadaPct,
    cdiRefPct,
    cdiAcumuladoPct,
    pctCdi,
  };
  if (calc.cashSweep) {
    resultado.cashSweep = {
      periodicidadeJuros: calc.cashSweep.periodicidadeJuros,
      periodicidadeAmortizacao: calc.cashSweep.periodicidadeAmortizacao,
      nAmortizacoes: calc.cashSweep.nAmortizacoes,
      amortizacaoConstante: calc.cashSweep.amortizacaoConstante,
      nPeriodos: calc.cashSweep.nPeriodos,
      primeiroJurosLiquido: calc.cashSweep.cupomLiq,
    };
  }
  return resultado;
}

// Valor Presente: dado um Valor Futuro desejado (BRUTO ou LÍQUIDO, ver `tipoValorFuturo`),
// taxa/indexador e prazo, quanto é preciso investir hoje.
//   - alvo BRUTO (padrão): inverso direto de VF = VI × (1+i)^(du/252) -> VI = VFbruto / (1+i)^(du/252).
//   - alvo LÍQUIDO: o cliente já sabe quanto quer "no bolso" no vencimento (ex.: "preciso de
//     R$150.000 líquidos pra dar entrada num imóvel") — como o IR incide sobre o GANHO (VFbruto - VI),
//     e não sobre o VF inteiro, a fórmula precisa isolar VI de dentro da própria definição de líquido:
//     VFliq = VFbruto×(1-alíq) + VI×alíq, com VFbruto = VI×fator  =>  VI = VFliq / (fator×(1-alíq) + alíq).
//     Isento equivale a alíquota 0, o que reduz essa fórmula exatamente ao caso bruto.
function calcularValorPresente({ ativoTaxa, dataBase, vencimento, isento, valorFuturoDesejado, tipoValorFuturo }, curvas) {
  const iAnual = taxaEfetivaAnual({ ...ativoTaxa, dataBase, vencimento }, curvas);
  const du = diasUteisEntre(dataBase, vencimento);
  const dias = diasEntre(dataBase, vencimento);
  const fator = Math.pow(1 + iAnual, du / 252);
  const aliquota = isento ? 0 : aliquotaIR(dias);
  const alvoLiquido = tipoValorFuturo === 'liquido';

  let viNecessario, vfBruto;
  if (alvoLiquido) {
    viNecessario = valorFuturoDesejado / (fator * (1 - aliquota) + aliquota);
    vfBruto = viNecessario * fator;
  } else {
    vfBruto = valorFuturoDesejado;
    viNecessario = vfBruto / fator;
  }
  const ir = (vfBruto - viNecessario) * aliquota;
  const vfLiquidoResultante = vfBruto - ir;
  const cdiRefPct = interpolar(du, curvas.b3Pre.pontos);
  return {
    dias,
    du,
    iAnualPct: iAnual * 100,
    viNecessario,
    vfBruto,
    aliquotaPct: aliquota * 100,
    ir,
    vfLiquidoResultante,
    cdiRefPct,
    tipoValorFuturo: alvoLiquido ? 'liquido' : 'bruto',
  };
}

// Rentabilidade: dado um Valor Investido e um Valor Futuro já conhecidos (ex.: extrato de um produto
// já em carteira), descobre a taxa implícita — não depende de indexador/taxa informados, ao contrário
// dos outros três modos.
function calcularRentabilidade({ dataBase, dataFinal, valorInvestido, valorFuturo }, curvas) {
  const dias = diasEntre(dataBase, dataFinal);
  const du = diasUteisEntre(dataBase, dataFinal);
  const rentabilidadeRS = valorFuturo - valorInvestido;
  const rentabilidadePct = (valorFuturo / valorInvestido - 1) * 100;
  const taxaAnualizadaPct = du > 0 ? (Math.pow(valorFuturo / valorInvestido, 252 / du) - 1) * 100 : null;
  const cdiRefPct = interpolar(du, curvas.b3Pre.pontos);
  const cdiAcumuladoPct = (Math.pow(1 + cdiRefPct / 100, du / 252) - 1) * 100;
  const pctCdi = cdiAcumuladoPct !== 0 ? (rentabilidadePct / cdiAcumuladoPct) * 100 : null;
  return { dias, du, rentabilidadeRS, rentabilidadePct, taxaAnualizadaPct, cdiRefPct, cdiAcumuladoPct, pctCdi };
}

// Taxa Equivalente: dado qualquer taxa/indexador e um prazo, mostra a mesma taxa sob outras óticas —
// efetiva anual, mensal equivalente, e quanto ela representa em % do CDI vigente naquele prazo.
// A taxa informada é sempre tratada como BRUTA (a taxa contratada do papel) — a partir dela, também
// calcula a taxa LÍQUIDA equivalente (anual e mensal): o que sobra depois do IR do prazo informado,
// "desfeito" de volta pra uma taxa anualizada/mensal comparável — pergunta comum de quem quer saber
// "essa debênture de X% a.a. bruto equivale a quanto por mês, líquido, no bolso". Quando o produto é
// isento de IR, também calcula a "taxa bruta equivalente": a taxa que um produto TRIBUTADO
// precisaria pagar, ANTES do IR, para entregar o mesmo retorno líquido que este produto isento já
// entrega — útil para comparar, por exemplo, uma LCI/CRI isenta contra um CDB tributado (regra do
// "gross-up": taxaBruta = taxaIsenta / (1 - alíquota)).
function calcularTaxaEquivalente({ ativoTaxa, dataBase, vencimento, isento }, curvas) {
  const iAnual = taxaEfetivaAnual({ ...ativoTaxa, dataBase, vencimento }, curvas);
  const du = diasUteisEntre(dataBase, vencimento);
  const dias = diasEntre(dataBase, vencimento);
  const taxaMensalPct = (Math.pow(1 + iAnual, 1 / 12) - 1) * 100;
  const cdiRefPct = interpolar(du, curvas.b3Pre.pontos);
  const pctCdiEquivalente = cdiRefPct !== 0 ? ((iAnual * 100) / cdiRefPct) * 100 : null;

  // Taxa líquida equivalente: aplica o IR do prazo informado sobre o ganho (mesma lógica de
  // calcularValorFuturo — VI=1 pra trabalhar só com fatores) e "desfaz" a capitalização composta
  // pra achar a taxa anual/mensal, sem desconto nenhum, que chegaria nesse mesmo valor líquido.
  const aliquotaAplicada = isento ? 0 : aliquotaIR(dias);
  const fatorBruto = Math.pow(1 + iAnual, du / 252);
  const fatorLiquido = fatorBruto * (1 - aliquotaAplicada) + aliquotaAplicada;
  const iAnualLiquido = Math.pow(fatorLiquido, 252 / du) - 1;
  const taxaMensalLiquidaPct = (Math.pow(1 + iAnualLiquido, 1 / 12) - 1) * 100;

  const resultado = {
    dias, du, iAnualPct: iAnual * 100, taxaMensalPct, cdiRefPct, pctCdiEquivalente, isento: !!isento,
    aliquotaAplicadaPct: aliquotaAplicada * 100,
    iAnualLiquidoPct: iAnualLiquido * 100,
    taxaMensalLiquidaPct,
  };
  if (isento) {
    const aliquotaHipotetica = aliquotaIR(dias);
    resultado.aliquotaComparacaoPct = aliquotaHipotetica * 100;
    resultado.taxaBrutaEquivalentePct = (iAnual / (1 - aliquotaHipotetica)) * 100;
  }
  return resultado;
}

// Simulador de IR: dado um valor de rendimento (ganho) BRUTO já conhecido e o prazo decorrido desde a
// aplicação, mostra quanto de Imposto de Renda incide e o valor líquido resultante — pergunta que o
// cliente faz em praticamente toda reunião, sem precisar simular um produto inteiro (indexador/taxa)
// pra chegar na resposta.
function calcularIR({ valorBruto, dataBase, dataFinal, isento }) {
  const dias = diasEntre(dataBase, dataFinal);
  const aliquota = isento ? 0 : aliquotaIR(dias);
  const ir = valorBruto * aliquota;
  const valorLiquido = valorBruto - ir;
  return { dias, isento: !!isento, aliquotaPct: aliquota * 100, valorBruto, ir, valorLiquido };
}

// Renda Passiva: dado um ou vários ativos com pagamento PERIÓDICO de juros (mensal ou semestral),
// calcula quanto cada um rende por período e o total combinado, convertido pra uma base mensal comum
// — pergunta de quem já vive (ou está planejando viver) de renda de investimentos, e quer somar o
// que vários produtos diferentes entregam juntos. Reaproveita calcularAtivo no Caso A (juros
// distribuídos, não reinvestidos) — o mesmo cálculo usado nos cards de "Juros Mensais" da Carteira
// Simulada — e usa a MÉDIA sobre todos os pagamentos do período (não só o 1º), pela mesma razão já
// aplicada lá: a alíquota regressiva cai ao longo do tempo, então o 1º pagamento é sempre o menor
// líquido, não o representativo.
function calcularRendaPassiva({ ativos }, curvas) {
  const resultados = ativos.map((a) => {
    const ativoCalc = {
      ...a.ativoTaxa,
      vi: a.valorInvestido,
      dataBase: a.dataBase,
      vencimento: a.vencimento,
      isento: !!a.isento,
      pagaCupomMensal: true,
      reinvestir: false,
      periodicidadeCupom: a.periodicidadeCupom === 'semestral' ? 'semestral' : 'mensal',
      cashSweep: false,
    };
    const calc = calcularAtivo(ativoCalc, curvas);
    const cupomMedioLiq = (calc.cupomLiquidos && calc.cupomLiquidos.length)
      ? calc.cupomLiquidos.reduce((s, v) => s + v, 0) / calc.cupomLiquidos.length
      : 0;
    const rendaMensalEquivalente = calc.periodicidadeCupom === 'semestral' ? cupomMedioLiq / 6 : cupomMedioLiq;
    return {
      nome: a.nome || '',
      vi: a.valorInvestido,
      isento: !!a.isento,
      periodicidadeCupom: calc.periodicidadeCupom,
      iAnualPct: calc.iAnual * 100,
      nPeriodos: calc.nPeriodos || 0,
      cupomPrimeiroLiq: calc.cupomLiq,
      cupomMedioLiq,
      rendaMensalEquivalente,
    };
  });
  const viTotal = resultados.reduce((s, r) => s + r.vi, 0);
  const rendaMensalTotal = resultados.reduce((s, r) => s + r.rendaMensalEquivalente, 0);
  const rendaAnualTotal = rendaMensalTotal * 12;
  const rendimentoMensalPct = viTotal > 0 ? (rendaMensalTotal / viTotal) * 100 : null;
  return { resultados, viTotal, rendaMensalTotal, rendaAnualTotal, rendimentoMensalPct };
}

module.exports = {
  calcularValorFuturo, calcularValorPresente, calcularRentabilidade, calcularTaxaEquivalente, calcularIR, calcularRendaPassiva,
};
