const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { calcularAtivo } = require('../lib/calculo');
const {
  calcularValorFuturo,
  calcularValorPresente,
  calcularRentabilidade,
  calcularTaxaEquivalente,
  calcularIR,
} = require('../lib/calculadoraFinanceira');

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < EPS, `${msg}: esperado ${expected}, obtido ${actual}`);
}

function curvaConstante(taxaPct) {
  return [{ du: 0, taxa: taxaPct }, { du: 100000, taxa: taxaPct }];
}

const dataBase = new Date(2026, 0, 1);
const vencimento = new Date(2027, 0, 1); // 365 dias corridos, 249 du (calendário nacional)
const curvas = { b3Pre: { pontos: curvaConstante(10) }, anbima: { infl: curvaConstante(4) } };

describe('calcularValorFuturo — bate exatamente com calcularAtivo no modo bullet', () => {
  test('prefixado (a.a.), não isento', () => {
    const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.12 };
    const r = calcularValorFuturo({ ativoTaxa, dataBase, vencimento, isento: false, valorInvestido: 1000 }, curvas);

    const calcDireto = calcularAtivo({ ...ativoTaxa, vi: 1000, dataBase, vencimento, isento: false, pagaCupomMensal: false, reinvestir: false, cashSweep: false }, curvas);
    assertClose(r.vfBruto, calcDireto.vfBruto, 'VF bruto bate com calcularAtivo');
    assertClose(r.vfLiquido, calcDireto.vfLiquido, 'VF líquido bate com calcularAtivo');
    assertClose(r.ir, calcDireto.ir, 'IR bate com calcularAtivo');
    assert.equal(r.dias, 365);
    assert.equal(r.du, calcDireto.du);
  });

  test('CDI+, isento — VF líquido = VF bruto', () => {
    const ativoTaxa = { tipo: 'cdi', spread: 0.02 };
    const r = calcularValorFuturo({ ativoTaxa, dataBase, vencimento, isento: true, valorInvestido: 5000 }, curvas);
    assertClose(r.vfLiquido, r.vfBruto, 'isento: líquido = bruto');
    assertClose(r.ir, 0, 'isento: IR = 0');
  });
});

describe('calcularValorFuturo — modo Cash Sweep bate exatamente com calcularAtivo', () => {
  test('amortização e juros mensais: saldo cai e juros diminuem, igual à Carteira Simulada', () => {
    const ativoTaxa = { tipo: 'fixoAA', taxaAA: Math.pow(1.01, 12) - 1 };
    const r = calcularValorFuturo({
      ativoTaxa, dataBase, vencimento, isento: true, valorInvestido: 1200,
      cashSweep: true, periodicidadeJurosCashSweep: 'mensal', periodicidadeAmortizacaoCashSweep: 'mensal',
    }, curvas);

    const calcDireto = calcularAtivo({
      ...ativoTaxa, vi: 1200, dataBase, vencimento, isento: true, pagaCupomMensal: false, reinvestir: false,
      cashSweep: true, periodicidadeJurosCashSweep: 'mensal', periodicidadeAmortizacaoCashSweep: 'mensal',
    }, curvas);

    assertClose(r.vfBruto, calcDireto.vfBruto, 'VF bruto bate com calcularAtivo (cash sweep)');
    assertClose(r.vfLiquido, calcDireto.vfLiquido, 'VF líquido bate com calcularAtivo (cash sweep)');
    assert.ok(r.cashSweep, 'resultado inclui detalhes de cash sweep');
    assert.equal(r.cashSweep.nAmortizacoes, calcDireto.cashSweep.nAmortizacoes);
    assertClose(r.cashSweep.amortizacaoConstante, calcDireto.cashSweep.amortizacaoConstante, 'amortização constante bate');
    assertClose(r.cashSweep.primeiroJurosLiquido, calcDireto.cashSweep.cupomLiq, '1º pagamento de juros bate');
  });
});

describe('calcularValorPresente — inverso de calcularValorFuturo', () => {
  test('VP(VF(VI)) recupera o VI original (prefixado, não isento)', () => {
    const ativoTaxa = { tipo: 'fixo', taxaAM: 0.01 };
    const vi = 12345.67;
    const vf = calcularValorFuturo({ ativoTaxa, dataBase, vencimento, isento: false, valorInvestido: vi }, curvas);
    const vp = calcularValorPresente({ ativoTaxa, dataBase, vencimento, isento: false, valorFuturoDesejado: vf.vfBruto }, curvas);
    assertClose(vp.viNecessario, vi, 'VP do VF bruto recupera o VI original');
    assertClose(vp.vfLiquidoResultante, vf.vfLiquido, 'VF líquido resultante bate com o calculado no modo VF');
  });
});

describe('calcularRentabilidade — descobre a taxa implícita a partir de VI e VF conhecidos', () => {
  test('taxa anualizada implícita bate com a fórmula (VF/VI)^(252/du) - 1', () => {
    const dataFinal = new Date(2027, 0, 1);
    const r = calcularRentabilidade({ dataBase, dataFinal, valorInvestido: 1000, valorFuturo: 1200 }, curvas);
    const esperado = (Math.pow(1200 / 1000, 252 / r.du) - 1) * 100;
    assertClose(r.taxaAnualizadaPct, esperado, 'taxa anualizada implícita');
    assertClose(r.rentabilidadePct, 20, 'rentabilidade % simples = 20%');
    assertClose(r.rentabilidadeRS, 200, 'rentabilidade em R$');
  });
});

describe('calcularTaxaEquivalente — mesma taxa sob outras óticas', () => {
  test('prefixado a.a. -> mensal equivalente e % do CDI', () => {
    const ativoTaxa = { tipo: 'fixoAA', taxaAA: Math.pow(1.01, 12) - 1 }; // == 1% a.m. exato
    const r = calcularTaxaEquivalente({ ativoTaxa, dataBase, vencimento }, curvas);
    assertClose(r.taxaMensalPct, 1, 'equivalente mensal = 1%');
    assertClose(r.cdiRefPct, 10, 'curva constante de 10% a.a.');
  });

  test('isento: taxa bruta equivalente aplica o gross-up pela alíquota do prazo', () => {
    const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.10 };
    const r = calcularTaxaEquivalente({ ativoTaxa, dataBase, vencimento, isento: true }, curvas);
    assert.equal(r.dias, 365);
    assertClose(r.aliquotaComparacaoPct, 17.5, 'prazo de 365 dias (>360 e <=720) cai na faixa de 17,5%');
    assertClose(r.taxaBrutaEquivalentePct, (0.10 / (1 - 0.175)) * 100, 'taxaBruta = taxaIsenta / (1 - alíquota)');
  });

  test('não isento: não calcula taxa bruta equivalente', () => {
    const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.10 };
    const r = calcularTaxaEquivalente({ ativoTaxa, dataBase, vencimento, isento: false }, curvas);
    assert.equal(r.taxaBrutaEquivalentePct, undefined);
  });
});

describe('calcularIR — Bruto / IR / Líquido a partir de um rendimento já conhecido', () => {
  test('não isento: aplica a alíquota regressiva pelo prazo decorrido', () => {
    const r = calcularIR({ valorBruto: 10000, dataBase, dataFinal: vencimento, isento: false });
    assert.equal(r.dias, 365);
    assertClose(r.aliquotaPct, 17.5, '365 dias corridos (>360 e <=720) cai na faixa de 17,5%');
    assertClose(r.ir, 1750, 'IR = 10000 * 17,5%');
    assertClose(r.valorLiquido, 8250, 'líquido = bruto - IR');
  });

  test('isento: IR zero e líquido = bruto', () => {
    const r = calcularIR({ valorBruto: 10000, dataBase, dataFinal: vencimento, isento: true });
    assertClose(r.ir, 0, 'isento: IR = 0');
    assertClose(r.valorLiquido, 10000, 'isento: líquido = bruto');
  });

  test('prazo curto (≤180 dias) cai na faixa de 22,5%', () => {
    const dataFinalCurta = new Date(2026, 5, 1); // ~150 dias corridos a partir de 01/01/2026
    const r = calcularIR({ valorBruto: 2000, dataBase, dataFinal: dataFinalCurta, isento: false });
    assertClose(r.aliquotaPct, 22.5, 'prazo curto cai na faixa de 22,5%');
  });
});
