// Novação de Debênture — compara o resultado líquido de duas estratégias:
//   Cenário 1 (Resgate e Reaplicação) — modo padrão: o resgate SEMPRE ocorre no vencimento
//     CONTRATUAL da debênture atual — é a data em que o capital naturalmente retornaria se o cliente
//     não novasse — e o valor líquido (após IR) é reaplicado em OUTRO produto — de qualquer tipo,
//     dentro ou fora da GCB: isento ou não, bullet, juros distribuídos/reinvestidos ou Cash Sweep.
//     Reaproveita o MESMO motor (calcularAtivo) usado nas simulações de carteira. Para a comparação
//     fazer sentido (não comparar um produto de 1 ano com um de 5 anos, por exemplo), os DOIS
//     cenários são sempre avaliados até o vencimento MAIS CURTO entre o produto de reaplicação e a
//     debênture sugerida — o mais longo é "cortado" nessa data.
//   Cenário 1 (Sem Novação, parado a 90% do CDI) — modo simplificado (`modoSimplificado: true`),
//     usado quando o assessor não quer especificar um produto de reaplicação: assume que o cliente
//     simplesmente NÃO resgata e NÃO nova — o capital continua rendendo 90% do CDI a partir do
//     vencimento contratual até a MESMA data final da Novação (vencimentoNovacao), sem nenhum evento
//     de resgate no meio. Isola o benefício "puro" de novar (taxa da debênture sugerida vs. 90% do
//     CDI parado), sem introduzir a variável de "em que outro produto o cliente reaplicaria".
//   Cenário 2 (Novação): NÃO há resgate — o título é renovado (novado) na "data da novação", que pode
//     ser ANTES, EXATAMENTE NO, ou DEPOIS do vencimento contratual da debênture atual:
//       - Antes (novação antecipada): a debênture só acumula à taxa contratada até a data da
//         novação — não chega a completar o prazo original — e passa a render a taxa da nova
//         debênture a partir daí.
//       - Depois (novação tardia): a debênture completa o prazo contratado normalmente e, no
//         intervalo entre o vencimento e a data da novação (ainda não formalizada), passa a render
//         automaticamente 90% do CDI — a debênture vencida não some, só muda de taxa.
//     Em qualquer um dos três casos, não há evento de resgate: o capital nunca é tocado, e o IR incide
//     UMA ÚNICA VEZ, no final, sobre o prazo TOTAL acumulado desde a aplicação original — o que tende
//     a cair numa alíquota menor da tabela regressiva.
//
// Reaproveita o mesmo motor de lib/calculo.js (252 dias úteis, capitalização composta, combinação
// multiplicativa de taxa+spread, tabela regressiva de IR) para garantir consistência total com as
// demais simulações do app.

const { diasEntre, aliquotaIR, taxaEfetivaAnual, capitalizarComposto, calcularAtivo } = require('./calculo');
const { diasUteisEntre } = require('./calendario');

const PERCENTUAL_CDI_VENCIDA = 0.9; // taxa de mercado usada quando o capital fica parado após o vencimento (novação tardia, ou modo simplificado)

function calcularNovacao({
  valorInvestido,
  dataAplicacao,
  // Se a debênture já foi novada antes, `dataAplicacao` é a data/valor/taxa da posição ATUAL (desde
  // a última novação) — usada pra calcular a EVOLUÇÃO do valor. O IR, porém, nunca reseta numa
  // novação (não é evento tributável): a contagem de prazo pra fins de alíquota sempre conta desde o
  // PRIMEIRO investimento — `dataAplicacaoOriginal`, quando informada (senão, é a própria dataAplicacao).
  dataAplicacaoOriginal,
  // Valor da posição JÁ NO VENCIMENTO contratual, informado diretamente pelo assessor (do extrato ou
  // do contrato) — substitui a simulação de crescimento aporte->vencimento: não reconstruímos esse
  // trecho "passado", só calculamos o que vem a partir do vencimento (o que é, de fato, "referente à
  // novação"). `ativoTaxaAtual`/`taxaAtual` continuam sendo coletados no formulário só a título de
  // informação/registro — e como fallback pro caso raro de novação ANTECIPADA (ver abaixo), onde a
  // debênture ainda não chegou ao vencimento contratual quando é novada, então "valor no vencimento"
  // ainda não existe e precisa ser projetado.
  valorAtualPosicao,
  ativoTaxaAtual, vencimentoAtual, isentoAtual,
  dataNovacao,
  // Cenário 1 — modo padrão: produto de reaplicação (qualquer tipo/fluxo, com sua própria isenção).
  // Ignorado se modoSimplificado for true.
  modoSimplificado,
  ativoTaxaReaplicacao, vencimentoReaplicacao, isentoReaplicacao,
  pagaCupomMensalReaplicacao, reinvestirReaplicacao, periodicidadeCupomReaplicacao,
  cashSweepReaplicacao, periodicidadeJurosCashSweepReaplicacao, periodicidadeAmortizacaoCashSweepReaplicacao,
  // Cenário 2 — debênture sugerida para novação (continuação do mesmo título, herda isentoAtual).
  ativoTaxaNovacao, vencimentoNovacao,
}, curvas) {
  // Só usada como referência de exibição e como fallback no caso raro de novação ANTECIPADA (ver
  // abaixo) — não entra mais no cálculo do valor no vencimento, que agora é informado diretamente.
  const iAtual = taxaEfetivaAnual({ ...ativoTaxaAtual, dataBase: dataAplicacao, vencimento: vencimentoAtual }, curvas);

  // Data usada SÓ pra contar o prazo de IR (tabela regressiva) — nunca pra capitalização de valor.
  const dataIR = dataAplicacaoOriginal || dataAplicacao;

  // --- Trecho comum ao Cenário 1 e ao Cenário 2: valor da posição no vencimento contratual (nenhum
  // resgate ocorre aqui) — informado diretamente, sem simular o crescimento desde o aporte. ---
  const diasAteVencimento = diasEntre(dataIR, vencimentoAtual);
  const vfBrutoNoVencimento = valorAtualPosicao;

  // Comparação sempre até o vencimento MAIS CURTO entre os dois destinos (produto de reaplicação vs.
  // debênture sugerida) — não faz sentido comparar um produto de 1 ano com um de 5, por exemplo. Só
  // se aplica no modo padrão; no modo simplificado só existe um horizonte (vencimentoNovacao).
  let vencimentoReaplicacaoEfetivo = vencimentoReaplicacao;
  let vencimentoNovacaoEfetivo = vencimentoNovacao;
  let horizonteAjustado = null;
  if (!modoSimplificado && vencimentoReaplicacao.getTime() !== vencimentoNovacao.getTime()) {
    const maisCurto = vencimentoReaplicacao.getTime() < vencimentoNovacao.getTime() ? vencimentoReaplicacao : vencimentoNovacao;
    vencimentoReaplicacaoEfetivo = maisCurto;
    vencimentoNovacaoEfetivo = maisCurto;
    horizonteAjustado = {
      dataComparacao: maisCurto,
      vencimentoReaplicacaoOriginal: vencimentoReaplicacao,
      vencimentoNovacaoOriginal: vencimentoNovacao,
      cortouReaplicacao: vencimentoReaplicacao.getTime() !== maisCurto.getTime(),
      cortouNovacao: vencimentoNovacao.getTime() !== maisCurto.getTime(),
    };
  }

  // --- Cenário 1 ---
  let cenarioResgate;
  if (modoSimplificado) {
    // Sem Novação, parado a 90% do CDI: resgate NUNCA ocorre — o capital segue rendendo 90% do CDI
    // do vencimento contratual até a mesma data final da Novação (vencimentoNovacaoEfetivo), e o IR
    // incide uma única vez ali, sobre o prazo TOTAL — mesma lógica de "sem resgate" do Cenário 2,
    // só que à taxa de mercado parada em vez da debênture sugerida.
    const iParado = taxaEfetivaAnual({ tipo: 'pctcdi', percentualCDI: PERCENTUAL_CDI_VENCIDA, dataBase: vencimentoAtual, vencimento: vencimentoNovacaoEfetivo }, curvas);
    const duParado = diasUteisEntre(vencimentoAtual, vencimentoNovacaoEfetivo);
    const vfBrutoParado = capitalizarComposto(vfBrutoNoVencimento, iParado, duParado);
    const diasTotaisParado = diasEntre(dataIR, vencimentoNovacaoEfetivo);
    const aliquotaParado = aliquotaIR(diasTotaisParado);
    const irParado = isentoAtual ? 0 : (vfBrutoParado - valorInvestido) * aliquotaParado;
    const vfLiquidoParado = vfBrutoParado - irParado;
    cenarioResgate = {
      modoSimplificado: true,
      parado: {
        iAnualPct: iParado * 100, percentualCDI: PERCENTUAL_CDI_VENCIDA * 100,
        vfBruto: vfBrutoParado, aliquotaPct: aliquotaParado * 100, ir: irParado, vfLiquido: vfLiquidoParado,
      },
      irTotal: irParado,
      vfLiquidoFinal: vfLiquidoParado,
    };
  } else {
    const aliquotaResgate = aliquotaIR(diasAteVencimento);
    const irResgate = isentoAtual ? 0 : (vfBrutoNoVencimento - valorInvestido) * aliquotaResgate;
    const vfLiquidoAposResgate = vfBrutoNoVencimento - irResgate;

    const ativoReaplicacao = {
      ...ativoTaxaReaplicacao,
      vi: vfLiquidoAposResgate,
      dataBase: vencimentoAtual,
      vencimento: vencimentoReaplicacaoEfetivo,
      isento: !!isentoReaplicacao,
      pagaCupomMensal: !!pagaCupomMensalReaplicacao,
      reinvestir: !!reinvestirReaplicacao,
      periodicidadeCupom: periodicidadeCupomReaplicacao === 'semestral' ? 'semestral' : 'mensal',
      cashSweep: !!cashSweepReaplicacao,
      periodicidadeJurosCashSweep: periodicidadeJurosCashSweepReaplicacao === 'semestral' ? 'semestral' : 'mensal',
      periodicidadeAmortizacaoCashSweep: periodicidadeAmortizacaoCashSweepReaplicacao === 'semestral' ? 'semestral' : 'mensal',
    };
    const calcReaplicacao = calcularAtivo(ativoReaplicacao, curvas);
    cenarioResgate = {
      modoSimplificado: false,
      resgate: {
        iAnualPct: iAtual * 100, vfBruto: vfBrutoNoVencimento,
        aliquotaPct: aliquotaResgate * 100, ir: irResgate, vfLiquido: vfLiquidoAposResgate,
      },
      reaplicacao: {
        iAnualPct: calcReaplicacao.iAnual * 100, dias: calcReaplicacao.dias, du: calcReaplicacao.du,
        vfBruto: calcReaplicacao.vfBruto, aliquotaPct: calcReaplicacao.aliquotaTotal * 100,
        ir: calcReaplicacao.ir, vfLiquido: calcReaplicacao.vfLiquido,
        cupomLiq: calcReaplicacao.cupomLiq, cashSweep: calcReaplicacao.cashSweep,
      },
      irTotal: irResgate + calcReaplicacao.ir,
      vfLiquidoFinal: calcReaplicacao.vfLiquido,
    };
  }

  // --- Cenário 2: Novação — a taxa contratada vale até min(vencimentoAtual, dataNovacao); depois
  // disso, dois casos possíveis: novação antecipada (fica pronta a taxa nova antes do vencimento
  // contratual, o resto do prazo original é abdicado) ou tardia (o intervalo entre o vencimento
  // contratual e a data da novação rende 90% do CDI). ---
  let vfBrutoNaNovacao;
  let periodoVencidoInfo = null;
  let antecipacaoInfo = null;

  if (dataNovacao.getTime() > vencimentoAtual.getTime()) {
    // Novação tardia: completa o prazo contratado e, depois, rende 90% do CDI até a novação.
    const iVencida = taxaEfetivaAnual({ tipo: 'pctcdi', percentualCDI: PERCENTUAL_CDI_VENCIDA, dataBase: vencimentoAtual, vencimento: dataNovacao }, curvas);
    const duVencida = diasUteisEntre(vencimentoAtual, dataNovacao);
    vfBrutoNaNovacao = capitalizarComposto(vfBrutoNoVencimento, iVencida, duVencida);
    periodoVencidoInfo = {
      diasVencida: diasEntre(vencimentoAtual, dataNovacao),
      iAnualPct: iVencida * 100,
      percentualCDI: PERCENTUAL_CDI_VENCIDA * 100,
      vfBrutoAntesVencida: vfBrutoNoVencimento,
      vfBrutoAposVencida: vfBrutoNaNovacao,
    };
  } else if (dataNovacao.getTime() < vencimentoAtual.getTime()) {
    // Novação antecipada: só acumula à taxa contratada até a data da novação — não chega a
    // completar o prazo original.
    const duAteNovacaoAntecipada = diasUteisEntre(dataAplicacao, dataNovacao);
    vfBrutoNaNovacao = capitalizarComposto(valorInvestido, iAtual, duAteNovacaoAntecipada);
    antecipacaoInfo = {
      diasAntecipados: diasEntre(dataNovacao, vencimentoAtual),
      vfBrutoNaNovacaoAntecipada: vfBrutoNaNovacao,
    };
  } else {
    vfBrutoNaNovacao = vfBrutoNoVencimento;
  }

  const iNovacao = taxaEfetivaAnual({ ...ativoTaxaNovacao, dataBase: dataNovacao, vencimento: vencimentoNovacaoEfetivo }, curvas);
  const duNovacao = diasUteisEntre(dataNovacao, vencimentoNovacaoEfetivo);
  const vfBrutoNovacaoFinal = capitalizarComposto(vfBrutoNaNovacao, iNovacao, duNovacao);
  const diasTotaisNovacao = diasEntre(dataIR, vencimentoNovacaoEfetivo); // prazo TOTAL, sem resetar
  const aliquotaNovacao = aliquotaIR(diasTotaisNovacao);
  const irNovacao = isentoAtual ? 0 : (vfBrutoNovacaoFinal - valorInvestido) * aliquotaNovacao;
  const vfLiquidoCenarioNovacao = vfBrutoNovacaoFinal - irNovacao;

  const ganhoNovacao = vfLiquidoCenarioNovacao - cenarioResgate.vfLiquidoFinal;
  const ganhoNovacaoPct = cenarioResgate.vfLiquidoFinal !== 0 ? (ganhoNovacao / cenarioResgate.vfLiquidoFinal) * 100 : null;

  // --- Benefício fiscal da novação — métrica independente de qual alternativa está sendo
  // comparada acima (parado a 90% do CDI ou resgate e reaplicação): compara a alíquota de IR que a
  // novação vai pagar (prazo contínuo desde a aplicação original) contra a alíquota que seria paga
  // se a debênture fosse resgatada no vencimento contratual (prazo mais curto, resetado). NÃO é uma
  // decomposição do `ganhoNovacao` (que depende da alternativa escolhida) — é uma resposta direta e
  // autocontida a "a novação tem benefício fiscal?", válida pros dois modos de relatório.
  const aliquotaSeResgatasseNoVencimento = aliquotaIR(diasAteVencimento);
  const diferencaAliquotaPP = (aliquotaSeResgatasseNoVencimento - aliquotaNovacao) * 100;
  const ganhoBrutoTotalNovacao = vfBrutoNovacaoFinal - valorInvestido;
  const beneficioFiscalReais = (!isentoAtual && diferencaAliquotaPP > 0)
    ? ganhoBrutoTotalNovacao * (diferencaAliquotaPP / 100)
    : 0;
  const beneficioFiscal = {
    isento: !!isentoAtual,
    aliquotaSeResgatasseNoVencimentoPct: aliquotaSeResgatasseNoVencimento * 100,
    aliquotaComNovacaoPct: aliquotaNovacao * 100,
    diferencaPP: diferencaAliquotaPP,
    valorEstimado: beneficioFiscalReais,
  };

  // --- Resumo do modo simplificado — usado no relatório reduzido (sem gráfico, sem "Cenário 1/2"),
  // que mostra ao cliente só o que importa: se a debênture já venceu, quanto ela rendeu a MENOS
  // parada a 90% do CDI (frente a já ter sido novada) e quanto vai render a MAIS a partir de agora;
  // se ainda não venceu, só o ganho total da novação. Não se aplica ao modo completo (Cenário 1 com
  // produto de reaplicação próprio), onde a comparação de "Cenário 1 vs Cenário 2" já é o conteúdo.
  let resumoSimplificado = null;
  if (modoSimplificado) {
    if (periodoVencidoInfo) {
      const duVencida = diasUteisEntre(vencimentoAtual, dataNovacao);
      const iNovacaoNoVencido = taxaEfetivaAnual({ ...ativoTaxaNovacao, dataBase: vencimentoAtual, vencimento: dataNovacao }, curvas);
      const vfBrutoHipoteticoVencido = capitalizarComposto(vfBrutoNoVencimento, iNovacaoNoVencido, duVencida);
      const custoEsperarBruto = vfBrutoHipoteticoVencido - vfBrutoNaNovacao;

      const iParadoDesdeNovacao = taxaEfetivaAnual({ tipo: 'pctcdi', percentualCDI: PERCENTUAL_CDI_VENCIDA, dataBase: dataNovacao, vencimento: vencimentoNovacaoEfetivo }, curvas);
      const vfBrutoParadoDesdeNovacao = capitalizarComposto(vfBrutoNaNovacao, iParadoDesdeNovacao, duNovacao);
      const irParadoDesdeNovacao = isentoAtual ? 0 : (vfBrutoParadoDesdeNovacao - vfBrutoNaNovacao) * aliquotaNovacao;
      const vfLiquidoParadoDesdeNovacao = vfBrutoParadoDesdeNovacao - irParadoDesdeNovacao;
      const ganhoFuturoBruto = vfBrutoNovacaoFinal - vfBrutoParadoDesdeNovacao;
      const ganhoFuturoLiquido = isentoAtual ? ganhoFuturoBruto : ganhoFuturoBruto * (1 - aliquotaNovacao);
      const ganhoFuturoPct = vfLiquidoParadoDesdeNovacao !== 0 ? (ganhoFuturoLiquido / vfLiquidoParadoDesdeNovacao) * 100 : null;

      resumoSimplificado = {
        vencida: true,
        custoEsperar: { dias: periodoVencidoInfo.diasVencida, diferencaBruta: custoEsperarBruto },
        ganhoFuturo: { diferencaBruta: ganhoFuturoBruto, diferencaLiquida: ganhoFuturoLiquido, diferencaLiquidaPct: ganhoFuturoPct },
      };
    } else {
      resumoSimplificado = { vencida: false, ganhoTotal: ganhoNovacao, ganhoTotalPct: ganhoNovacaoPct };
    }
  }

  return {
    valorInvestido,
    dataIR,
    periodoVencido: periodoVencidoInfo,
    antecipacao: antecipacaoInfo,
    horizonteAjustado,
    vfBrutoNoVencimento,
    vfBrutoNaNovacao,
    cenarioResgate,
    cenarioNovacao: {
      iAnualPct: iNovacao * 100,
      diasTotais: diasTotaisNovacao,
      vfBruto: vfBrutoNovacaoFinal,
      aliquotaPct: aliquotaNovacao * 100,
      ir: irNovacao,
      vfLiquidoFinal: vfLiquidoCenarioNovacao,
    },
    ganhoNovacao,
    ganhoNovacaoPct,
    resumoSimplificado,
    beneficioFiscal,
  };
}

// Gera a curva "valor líquido ao longo do tempo" dos dois cenários, do vencimento contratual (onde
// os dois SEMPRE partem do mesmo valor — nenhuma decisão ainda os diferenciou) até um horizonte
// estendido no futuro — usada pro gráfico "a partir de quando a novação passa a valer mais" do
// relatório. Reaproveita as taxas EFETIVAS já calculadas em `resultado` (não consulta a curva de
// novo): pra produtos de reaplicação com Cash Sweep ou cupom distribuído, a curva usa a taxa efetiva
// equivalente (capitalização composta simples) como aproximação de tendência — o ponto exatamente no
// vencimento avaliado é sempre travado (snapped) nos valores reais do comparativo, então nunca diverge
// do que está reportado ali; só o trajeto entre os pontos é aproximado.
function gerarCurvaComparativa({
  dataAplicacao, vencimentoAtual, dataAvaliacaoFinal,
  isentoAtual, isentoReaplicacao, resultado,
}) {
  const r = resultado;
  const modoSimplificado = r.cenarioResgate.modoSimplificado;
  const iOutraLinha = (modoSimplificado ? r.cenarioResgate.parado.iAnualPct : r.cenarioResgate.reaplicacao.iAnualPct) / 100;
  const iNovacao = r.cenarioNovacao.iAnualPct / 100;
  const iVencida = r.periodoVencido ? r.periodoVencido.iAnualPct / 100 : null;
  const dataNovacaoEfetiva = r.periodoVencido
    ? new Date(vencimentoAtual.getTime() + r.periodoVencido.diasVencida * 86400000)
    : vencimentoAtual; // só precisamos saber ONDE a taxa muda de 90%CDI pra taxa da novação, não a data exata da novação em si

  function outraLinhaLiquidoEm(T) {
    const duT = diasUteisEntre(vencimentoAtual, T);
    if (modoSimplificado) {
      const brutoT = capitalizarComposto(r.vfBrutoNoVencimento, iOutraLinha, duT);
      const irT = isentoAtual ? 0 : aliquotaIR(diasEntre(dataAplicacao, T)) * (brutoT - r.valorInvestido);
      return brutoT - irT;
    }
    const vfLiquidoAposResgate = r.cenarioResgate.resgate.vfLiquido;
    const brutoT = capitalizarComposto(vfLiquidoAposResgate, iOutraLinha, duT);
    const irT = isentoReaplicacao ? 0 : aliquotaIR(diasEntre(vencimentoAtual, T)) * (brutoT - vfLiquidoAposResgate);
    return brutoT - irT;
  }

  function novacaoLiquidoEm(T) {
    let brutoT;
    if (iVencida != null && T.getTime() <= dataNovacaoEfetiva.getTime()) {
      brutoT = capitalizarComposto(r.vfBrutoNoVencimento, iVencida, diasUteisEntre(vencimentoAtual, T));
    } else {
      brutoT = capitalizarComposto(r.vfBrutoNaNovacao, iNovacao, diasUteisEntre(dataNovacaoEfetiva, T));
    }
    const irT = isentoAtual ? 0 : aliquotaIR(diasEntre(dataAplicacao, T)) * (brutoT - r.valorInvestido);
    return brutoT - irT;
  }

  // Horizonte do gráfico: do vencimento contratual até o novo vencimento (data de avaliação) — não
  // faz sentido projetar além do prazo que está de fato sendo comparado.
  const diasTotal = Math.max(diasEntre(vencimentoAtual, dataAvaliacaoFinal), 1);
  const nPontos = 48;

  const pontos = [];
  for (let i = 0; i <= nPontos; i++) {
    const diasOffset = Math.round((diasTotal * i) / nPontos);
    const data = new Date(vencimentoAtual.getTime() + diasOffset * 86400000);
    pontos.push({
      data,
      outraLinha: outraLinhaLiquidoEm(data),
      novacao: novacaoLiquidoEm(data),
    });
  }

  // Trava (snap) o ponto no vencimento avaliado nos valores EXATOS já reportados no comparativo
  // principal, pra o gráfico nunca divergir do que está escrito acima dele.
  let idxMaisProximo = 0;
  let menorDiff = Infinity;
  pontos.forEach((p, i) => {
    const diff = Math.abs(p.data.getTime() - dataAvaliacaoFinal.getTime());
    if (diff < menorDiff) { menorDiff = diff; idxMaisProximo = i; }
  });
  pontos[idxMaisProximo] = {
    data: dataAvaliacaoFinal,
    outraLinha: r.cenarioResgate.vfLiquidoFinal,
    novacao: r.cenarioNovacao.vfLiquidoFinal,
  };

  // Ponto de virada: primeiro ponto em que a Novação passa a valer MAIS que a outra linha —
  // interpola linearmente entre as duas amostras que envolvem a mudança de sinal.
  let pontoVirada = null;
  for (let i = 1; i < pontos.length; i++) {
    const anterior = pontos[i - 1];
    const atual = pontos[i];
    const diffAnterior = anterior.novacao - anterior.outraLinha;
    const diffAtual = atual.novacao - atual.outraLinha;
    if (diffAnterior <= 0 && diffAtual > 0) {
      const frac = diffAnterior === diffAtual ? 0 : -diffAnterior / (diffAtual - diffAnterior);
      const dataCruzamento = new Date(anterior.data.getTime() + frac * (atual.data.getTime() - anterior.data.getTime()));
      const valorCruzamento = anterior.outraLinha + frac * (atual.outraLinha - anterior.outraLinha);
      pontoVirada = { data: dataCruzamento, valor: valorCruzamento };
      break;
    }
  }

  return {
    pontos,
    pontoVirada,
    dataAvaliacaoFinal,
    dataInicial: vencimentoAtual,
    dataFinal: pontos[pontos.length - 1].data,
  };
}

module.exports = { calcularNovacao, gerarCurvaComparativa, PERCENTUAL_CDI_VENCIDA };
