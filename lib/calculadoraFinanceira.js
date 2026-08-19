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

// Valor Presente: dado um Valor Futuro BRUTO desejado, taxa/indexador e prazo, quanto é preciso
// investir hoje — inverso direto de VF = VI × (1+i)^(du/252).
function calcularValorPresente({ ativoTaxa, dataBase, vencimento, isento, valorFuturoDesejado }, curvas) {
  const iAnual = taxaEfetivaAnual({ ...ativoTaxa, dataBase, vencimento }, curvas);
  const du = diasUteisEntre(dataBase, vencimento);
  const dias = diasEntre(dataBase, vencimento);
  const viNecessario = valorFuturoDesejado / Math.pow(1 + iAnual, du / 252);
  const aliquota = aliquotaIR(dias);
  const ir = isento ? 0 : (valorFuturoDesejado - viNecessario) * aliquota;
  const vfLiquidoResultante = valorFuturoDesejado - ir;
  const cdiRefPct = interpolar(du, curvas.b3Pre.pontos);
  return {
    dias,
    du,
    iAnualPct: iAnual * 100,
    viNecessario,
    vfBruto: valorFuturoDesejado,
    aliquotaPct: aliquota * 100,
    ir,
    vfLiquidoResultante,
    cdiRefPct,
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
// Quando o produto é isento de IR, também calcula a "taxa bruta equivalente": a taxa que um produto
// TRIBUTADO precisaria pagar, ANTES do IR, para entregar o mesmo retorno líquido que este produto
// isento já entrega — útil para comparar, por exemplo, uma LCI/CRI isenta contra um CDB tributado
// (regra do "gross-up": taxaBruta = taxaIsenta / (1 - alíquota)).
function calcularTaxaEquivalente({ ativoTaxa, dataBase, vencimento, isento }, curvas) {
  const iAnual = taxaEfetivaAnual({ ...ativoTaxa, dataBase, vencimento }, curvas);
  const du = diasUteisEntre(dataBase, vencimento);
  const dias = diasEntre(dataBase, vencimento);
  const taxaMensalPct = (Math.pow(1 + iAnual, 1 / 12) - 1) * 100;
  const cdiRefPct = interpolar(du, curvas.b3Pre.pontos);
  const pctCdiEquivalente = cdiRefPct !== 0 ? ((iAnual * 100) / cdiRefPct) * 100 : null;
  const resultado = { dias, du, iAnualPct: iAnual * 100, taxaMensalPct, cdiRefPct, pctCdiEquivalente, isento: !!isento };
  if (isento) {
    const aliquota = aliquotaIR(dias);
    resultado.aliquotaComparacaoPct = aliquota * 100;
    resultado.taxaBrutaEquivalentePct = (iAnual / (1 - aliquota)) * 100;
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

module.exports = { calcularValorFuturo, calcularValorPresente, calcularRentabilidade, calcularTaxaEquivalente, calcularIR };
