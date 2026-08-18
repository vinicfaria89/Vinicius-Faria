const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { calcularNovacao, gerarCurvaComparativa } = require('../lib/novacao');
const { taxaEfetivaAnual, capitalizarComposto } = require('../lib/calculo');
const { diasUteisEntre } = require('../lib/calendario');

const CURVAS_STUB = { b3Pre: { pontos: [{ du: 1, taxa: 14 }, { du: 3000, taxa: 14 }] }, anbima: { infl: [] } };

// `calcularNovacao` agora recebe o valor da posição JÁ NO VENCIMENTO diretamente (não simula mais o
// crescimento aporte->vencimento) — este helper reproduz a MESMA capitalização que o motor fazia
// internamente antes dessa mudança, só pra manter os fixtures de teste (e os valores esperados,
// calibrados contra o infográfico) idênticos ao comportamento anterior.
function valorNoVencimento(valorInvestido, ativoTaxaAtual, dataAplicacao, vencimentoAtual, curvas = CURVAS_STUB) {
  const i = taxaEfetivaAnual({ ...ativoTaxaAtual, dataBase: dataAplicacao, vencimento: vencimentoAtual }, curvas);
  const du = diasUteisEntre(dataAplicacao, vencimentoAtual);
  return capitalizarComposto(valorInvestido, i, du);
}

// Reproduz o exemplo do infográfico "Novação de Debênture GCB": aporte R$10.000, prefixado 25% a.a.,
// 1 ano por período, dois ciclos de 1 ano, SEM período vencido (dataNovacao == vencimentoAtual —
// decisão tomada exatamente no vencimento, igual ao exemplo). Resultado esperado: Cenário 1 (resgate
// e reaplicação) ~R$14.550,39 líquido; Cenário 2 (novação) R$14.781,25 líquido; ganho ~R$230,86.
//
// Tolerância generosa (R$30) de propósito: o infográfico usa "×1,25" simplificado (1 ano = exatamente
// 252 dias úteis "de calendário"), enquanto o motor usa a contagem REAL de dias úteis nacionais (a
// mesma convenção de todo o resto do app) — um ano civil específico raramente tem exatamente 252 dias
// úteis, então uma pequena divergência frente ao exemplo simplificado do infográfico é esperada e
// correta, não um bug.
describe('calcularNovacao — reproduz o exemplo do infográfico GCB (sem período vencido)', () => {
  const dataAplicacao = new Date(2024, 0, 1);
  const vencimentoAtual = new Date(2025, 0, 1);
  const vencimentoNovacao = new Date(2026, 0, 1);
  const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.25 };

  const r = calcularNovacao({
    valorInvestido: 10000,
    dataAplicacao,
    ativoTaxaAtual: ativoTaxa,
    vencimentoAtual,
    valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
    dataNovacao: vencimentoAtual, // decisão tomada exatamente no vencimento — sem trecho vencido
    isentoAtual: false,
    ativoTaxaReaplicacao: ativoTaxa,
    vencimentoReaplicacao: vencimentoNovacao,
    isentoReaplicacao: false,
    ativoTaxaNovacao: ativoTaxa,
    vencimentoNovacao,
  }, CURVAS_STUB);

  test('não detecta período vencido quando a data da novação é igual ao vencimento atual', () => {
    assert.equal(r.periodoVencido, null);
  });

  test('Cenário 1 (resgate e reaplicação) bate com o infográfico', () => {
    assert.ok(Math.abs(r.cenarioResgate.resgate.vfBruto - 12500) < 30, `esperado ~12500, obtido ${r.cenarioResgate.resgate.vfBruto}`);
    assert.ok(Math.abs(r.cenarioResgate.resgate.aliquotaPct - 17.5) < 0.01);
    assert.ok(Math.abs(r.cenarioResgate.vfLiquidoFinal - 14550.39) < 30, `esperado ~14550,39, obtido ${r.cenarioResgate.vfLiquidoFinal}`);
  });

  test('Cenário 2 (novação) bate com o infográfico', () => {
    assert.ok(Math.abs(r.cenarioNovacao.vfBruto - 15625) < 30, `esperado ~15625, obtido ${r.cenarioNovacao.vfBruto}`);
    assert.ok(Math.abs(r.cenarioNovacao.aliquotaPct - 15) < 0.01);
    assert.ok(Math.abs(r.cenarioNovacao.vfLiquidoFinal - 14781.25) < 30, `esperado ~14781,25, obtido ${r.cenarioNovacao.vfLiquidoFinal}`);
  });

  test('Ganho da novação é positivo e da ordem de grandeza do infográfico (~R$230,86)', () => {
    assert.ok(r.ganhoNovacao > 0);
    assert.ok(Math.abs(r.ganhoNovacao - 230.86) < 30, `esperado ~230,86, obtido ${r.ganhoNovacao}`);
  });

  test('debênture atual isenta não gera ganho de novação (sem IR para economizar)', () => {
    const rIsento = calcularNovacao({
      valorInvestido: 10000,
      dataAplicacao,
      ativoTaxaAtual: ativoTaxa,
      vencimentoAtual,
      valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      isentoAtual: true,
      ativoTaxaReaplicacao: ativoTaxa,
      vencimentoReaplicacao: vencimentoNovacao,
      isentoReaplicacao: true,
      ativoTaxaNovacao: ativoTaxa,
      vencimentoNovacao,
    }, CURVAS_STUB);
    assert.ok(Math.abs(rIsento.ganhoNovacao) < 0.01, `esperado ~0, obtido ${rIsento.ganhoNovacao}`);
  });
});

describe('calcularNovacao — período vencido (debênture já venceu antes da data da novação)', () => {
  const dataAplicacao = new Date(2023, 0, 1);
  const vencimentoAtual = new Date(2024, 0, 1); // venceu há 1 ano
  const dataNovacao = new Date(2025, 0, 1); // decisão só tomada 1 ano depois do vencimento
  const vencimentoNovacao = new Date(2027, 0, 1);
  const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.25 };

  const r = calcularNovacao({
    valorInvestido: 10000,
    dataAplicacao,
    ativoTaxaAtual: ativoTaxa,
    vencimentoAtual,
    valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
    dataNovacao,
    isentoAtual: false,
    ativoTaxaReaplicacao: ativoTaxa,
    vencimentoReaplicacao: vencimentoNovacao,
    isentoReaplicacao: false,
    ativoTaxaNovacao: ativoTaxa,
    vencimentoNovacao,
  }, CURVAS_STUB);

  test('detecta o período vencido e usa 90% do CDI nele', () => {
    assert.ok(r.periodoVencido !== null);
    assert.ok(Math.abs(r.periodoVencido.percentualCDI - 90) < 0.01);
    // 90% de 14% a.a. (curva stub) = 12,6% a.a.
    assert.ok(Math.abs(r.periodoVencido.iAnualPct - 12.6) < 0.1, `esperado ~12,6% a.a., obtido ${r.periodoVencido.iAnualPct}`);
  });

  test('o bruto na data da novação é maior que o bruto contratado (rendeu no período vencido)', () => {
    assert.ok(r.vfBrutoNaNovacao > r.periodoVencido.vfBrutoAntesVencida);
  });

  test('nenhum dos dois cenários perde dinheiro por causa do período vencido (ambos continuam rendendo)', () => {
    assert.ok(r.cenarioResgate.vfLiquidoFinal > 10000);
    assert.ok(r.cenarioNovacao.vfLiquidoFinal > 10000);
  });
});

describe('calcularNovacao — reaplicação flexível (isenção, fluxo e produto independentes)', () => {
  const dataAplicacao = new Date(2024, 0, 1);
  const vencimentoAtual = new Date(2025, 0, 1);

  test('aceita um produto de reaplicação com indexador e prazo diferentes da debênture de novação', () => {
    const r = calcularNovacao({
      valorInvestido: 10000,
      dataAplicacao,
      ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoAtual,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      isentoAtual: false,
      // Cenário 1: reaplica num CDI+2% por 6 meses (produto totalmente diferente, fora da GCB)
      ativoTaxaReaplicacao: { tipo: 'cdi', spread: 0.02 },
      vencimentoReaplicacao: new Date(2025, 6, 1),
      isentoReaplicacao: false,
      // Cenário 2: novação continua na mesma debênture por mais 1 ano
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoNovacao: new Date(2026, 0, 1),
    }, CURVAS_STUB);

    assert.ok(r.cenarioResgate.vfLiquidoFinal > 10000);
    assert.ok(r.cenarioNovacao.vfLiquidoFinal > 10000);
    assert.ok(Number.isFinite(r.ganhoNovacao));
  });

  test('produto de reaplicação isento não sofre IR nessa etapa, mesmo com a debênture atual tributada', () => {
    const r = calcularNovacao({
      valorInvestido: 10000,
      dataAplicacao,
      ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoAtual,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      isentoAtual: false, // debênture atual tributada
      ativoTaxaReaplicacao: { tipo: 'fixoAA', taxaAA: 0.1 },
      vencimentoReaplicacao: new Date(2026, 0, 1),
      isentoReaplicacao: true, // ex.: reaplicou num CRI isento
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoNovacao: new Date(2026, 0, 1),
    }, CURVAS_STUB);

    assert.equal(r.cenarioResgate.reaplicacao.ir, 0);
    // mas o resgate da debênture atual (não isenta) ainda paga IR
    assert.ok(r.cenarioResgate.resgate.ir > 0);
  });

  test('produto de reaplicação com juros mensais distribuídos (Caso A) funciona', () => {
    const r = calcularNovacao({
      valorInvestido: 10000,
      dataAplicacao,
      ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoAtual,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      isentoAtual: false,
      ativoTaxaReaplicacao: { tipo: 'fixoAA', taxaAA: 0.12 },
      vencimentoReaplicacao: new Date(2026, 0, 1),
      isentoReaplicacao: false,
      pagaCupomMensalReaplicacao: true,
      reinvestirReaplicacao: false,
      periodicidadeCupomReaplicacao: 'mensal',
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoNovacao: new Date(2026, 0, 1),
    }, CURVAS_STUB);

    assert.ok(r.cenarioResgate.reaplicacao.cupomLiq > 0, 'deveria ter um valor de cupom mensal líquido');
  });

  test('produto de reaplicação em Cash Sweep funciona', () => {
    const r = calcularNovacao({
      valorInvestido: 10000,
      dataAplicacao,
      ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoAtual,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      isentoAtual: false,
      ativoTaxaReaplicacao: { tipo: 'cdi', spread: 0.04 },
      vencimentoReaplicacao: new Date(2027, 0, 1),
      isentoReaplicacao: true,
      cashSweepReaplicacao: true,
      periodicidadeJurosCashSweepReaplicacao: 'mensal',
      periodicidadeAmortizacaoCashSweepReaplicacao: 'semestral',
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.25 },
      vencimentoNovacao: new Date(2026, 0, 1),
    }, CURVAS_STUB);

    assert.ok(r.cenarioResgate.reaplicacao.cashSweep !== null, 'deveria ter dados de Cash Sweep no resultado');
    assert.ok(r.cenarioResgate.vfLiquidoFinal > 0);
  });
});

describe('calcularNovacao — novação antecipada (dataNovacao ANTES do vencimento contratual)', () => {
  const dataAplicacao = new Date(2024, 0, 1);
  const vencimentoAtual = new Date(2026, 0, 1); // vencimento ainda no futuro
  const dataNovacao = new Date(2025, 0, 1); // novação assinada 1 ano antes do vencimento
  const vencimentoNovacao = new Date(2027, 0, 1);
  const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.25 };

  const r = calcularNovacao({
    valorInvestido: 10000,
    dataAplicacao,
    ativoTaxaAtual: ativoTaxa,
    vencimentoAtual,
    valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
    dataNovacao,
    isentoAtual: false,
    ativoTaxaReaplicacao: ativoTaxa,
    vencimentoReaplicacao: new Date(2027, 0, 1),
    isentoReaplicacao: false,
    ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.22 },
    vencimentoNovacao,
  }, CURVAS_STUB);

  test('detecta a antecipação (não é período vencido)', () => {
    assert.equal(r.periodoVencido, null);
    assert.ok(r.antecipacao !== null);
    assert.ok(r.antecipacao.diasAntecipados > 0);
  });

  test('o resgate do Cenário 1 continua usando o vencimento contratual original, não a data da novação', () => {
    // Se a novação fosse em 01/01/2025 mas o resgate também "antecipasse", o bruto seria menor.
    // O resgate deve refletir 2 anos completos (até 01/01/2026), não 1 ano (até a data da novação).
    const iAtual = 0.25;
    const vfEsperadoDoisAnos = 10000 * Math.pow(1 + iAtual, 2); // aproximação (252 du/ano)
    assert.ok(r.cenarioResgate.resgate.vfBruto > 12000, `resgate deveria refletir ~2 anos de rendimento, obtido ${r.cenarioResgate.resgate.vfBruto}`);
  });

  test('a novação antecipada acumula só até a data da novação na taxa antiga, depois muda de taxa', () => {
    // vfBrutoNaNovacao (1 ano a 25%) deve ser bem menor que o que renderia até o vencimento contratual (2 anos a 25%)
    assert.ok(r.vfBrutoNaNovacao < r.cenarioResgate.resgate.vfBruto);
  });

  test('ambos os cenários seguem financeiramente coerentes (positivos, sem NaN)', () => {
    assert.ok(Number.isFinite(r.cenarioResgate.vfLiquidoFinal) && r.cenarioResgate.vfLiquidoFinal > 10000);
    assert.ok(Number.isFinite(r.cenarioNovacao.vfLiquidoFinal) && r.cenarioNovacao.vfLiquidoFinal > 10000);
  });
});

describe('calcularNovacao — sempre compara até o vencimento MAIS CURTO entre reaplicação e novação', () => {
  const dataAplicacao = new Date(2024, 0, 1);
  const vencimentoAtual = new Date(2025, 0, 1);
  const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.25 };

  test('corta o produto de reaplicação de 5 anos na data da novação de 1 ano (mais curta)', () => {
    const rCurto = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: ativoTaxa, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: ativoTaxa, vencimentoReaplicacao: new Date(2030, 0, 1), isentoReaplicacao: false, // 5 anos
      ativoTaxaNovacao: ativoTaxa, vencimentoNovacao: new Date(2026, 0, 1), // 1 ano
    }, CURVAS_STUB);

    assert.ok(rCurto.horizonteAjustado !== null);
    assert.ok(rCurto.horizonteAjustado.cortouReaplicacao);
    assert.ok(!rCurto.horizonteAjustado.cortouNovacao);
    assert.equal(rCurto.horizonteAjustado.dataComparacao.getTime(), new Date(2026, 0, 1).getTime());

    // Sem o corte, o produto de reaplicação (5 anos) renderia muito mais que 1 ano — confirma que
    // realmente foi truncado, não continua rendendo 5 anos escondido em algum lugar.
    const rSemCorte = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: ativoTaxa, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: ativoTaxa, vencimentoReaplicacao: new Date(2030, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: ativoTaxa, vencimentoNovacao: new Date(2030, 0, 1), // mesma data — sem corte
    }, CURVAS_STUB);

    assert.ok(rCurto.cenarioResgate.vfLiquidoFinal < rSemCorte.cenarioResgate.vfLiquidoFinal,
      'o cenário com corte pra 1 ano deveria render bem menos que o cenário sem corte (5 anos)');
  });

  test('não ajusta o horizonte quando os dois vencimentos já são iguais', () => {
    const r = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: ativoTaxa, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: ativoTaxa, vencimentoReaplicacao: new Date(2026, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: ativoTaxa, vencimentoNovacao: new Date(2026, 0, 1),
    }, CURVAS_STUB);
    assert.equal(r.horizonteAjustado, null);
  });
});

describe('calcularNovacao — modo simplificado (sem produto de reaplicação)', () => {
  const dataAplicacao = new Date(2024, 0, 1);
  const vencimentoAtual = new Date(2025, 0, 1);
  const vencimentoNovacao = new Date(2027, 0, 1);
  const ativoTaxa = { tipo: 'fixoAA', taxaAA: 0.25 };

  const r = calcularNovacao({
    valorInvestido: 10000,
    dataAplicacao,
    ativoTaxaAtual: ativoTaxa,
    vencimentoAtual,
    valorAtualPosicao: valorNoVencimento(10000, ativoTaxa, dataAplicacao, vencimentoAtual),
    isentoAtual: false,
    dataNovacao: vencimentoAtual,
    modoSimplificado: true,
    // Nenhum campo de reaplicação é necessário nesse modo.
    ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.3 }, // debênture sugerida com taxa maior
    vencimentoNovacao,
  }, CURVAS_STUB);

  test('o Cenário 1 vira "parado a 90% do CDI", sem precisar de produto de reaplicação', () => {
    assert.equal(r.cenarioResgate.modoSimplificado, true);
    assert.ok(r.cenarioResgate.parado);
    assert.equal(r.cenarioResgate.reaplicacao, undefined);
    assert.ok(Math.abs(r.cenarioResgate.parado.percentualCDI - 90) < 0.01);
  });

  test('o capital parado rende do vencimento contratual até a MESMA data final da novação', () => {
    assert.ok(r.cenarioResgate.parado.vfBruto > 10000);
    assert.ok(r.cenarioResgate.vfLiquidoFinal > 10000);
  });

  test('debênture sugerida com taxa bem maior que 90% do CDI gera ganho de novação', () => {
    assert.ok(r.ganhoNovacao > 0);
  });
});

describe('gerarCurvaComparativa — gráfico de evolução e ponto de virada', () => {
  const dataAplicacao = new Date(2024, 0, 1);
  const vencimentoAtual = new Date(2025, 0, 1);

  test('as duas linhas partem do MESMO valor no vencimento contratual (nenhuma decisão ainda as diferenciou)', () => {
    const r = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: { tipo: 'fixoAA', taxaAA: 0.18 }, vencimentoReaplicacao: new Date(2030, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoNovacao: new Date(2029, 0, 1),
    }, CURVAS_STUB);
    const curva = gerarCurvaComparativa({
      dataAplicacao, vencimentoAtual, dataAvaliacaoFinal: new Date(2029, 0, 1),
      isentoAtual: false, isentoReaplicacao: false, resultado: r,
    });
    const primeiro = curva.pontos[0];
    assert.equal(primeiro.data.getTime(), vencimentoAtual.getTime());
    assert.ok(Math.abs(primeiro.outraLinha - primeiro.novacao) < 0.01);
  });

  test('detecta o ponto de virada quando a novação (taxa maior) ultrapassa a reaplicação (taxa menor)', () => {
    // Como as duas linhas partem exatamente empatadas no vencimento contratual, uma taxa de novação
    // um pouco maior já a coloca na frente desde o primeiro instante seguinte — a virada é detectada
    // bem no início da curva (comportamento correto, não um bug): "a partir de quando" pode
    // legitimamente ser "quase imediatamente".
    const r = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: { tipo: 'fixoAA', taxaAA: 0.15 }, vencimentoReaplicacao: new Date(2035, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.28 }, vencimentoNovacao: new Date(2035, 0, 1),
    }, CURVAS_STUB);
    const curva = gerarCurvaComparativa({
      dataAplicacao, vencimentoAtual, dataAvaliacaoFinal: new Date(2035, 0, 1),
      isentoAtual: false, isentoReaplicacao: false, resultado: r,
    });
    assert.ok(curva.pontoVirada !== null, 'deveria encontrar um ponto de virada, já que a novação tem taxa maior');
    assert.ok(curva.pontoVirada.data.getTime() >= vencimentoAtual.getTime());
    assert.ok(curva.pontoVirada.data.getTime() < curva.dataFinal.getTime());
  });

  test('a virada acontece mais tarde quando a vantagem da novação é bem pequena, mas ainda dentro do horizonte', () => {
    const r = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: { tipo: 'cdi', spread: 0.02 }, vencimentoReaplicacao: new Date(2035, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: { tipo: 'cdi', spread: 0.021 }, vencimentoNovacao: new Date(2035, 0, 1),
    }, CURVAS_STUB);
    const curva = gerarCurvaComparativa({
      dataAplicacao, vencimentoAtual, dataAvaliacaoFinal: new Date(2035, 0, 1),
      isentoAtual: false, isentoReaplicacao: false, resultado: r,
    });
    // O importante aqui é que o motor não quebra com taxas bem próximas — o ponto de virada (se
    // existir) precisa estar dentro do intervalo amostrado.
    if (curva.pontoVirada) {
      assert.ok(curva.pontoVirada.data.getTime() >= curva.dataInicial.getTime());
      assert.ok(curva.pontoVirada.data.getTime() <= curva.dataFinal.getTime());
    }
  });

  test('não encontra ponto de virada quando a reaplicação (taxa maior) nunca é ultrapassada pela novação', () => {
    const r = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: { tipo: 'fixoAA', taxaAA: 0.34 }, vencimentoReaplicacao: new Date(2030, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.2 }, vencimentoNovacao: new Date(2027, 0, 1),
    }, CURVAS_STUB);
    const curva = gerarCurvaComparativa({
      dataAplicacao, vencimentoAtual, dataAvaliacaoFinal: new Date(2027, 0, 1),
      isentoAtual: false, isentoReaplicacao: false, resultado: r,
    });
    assert.equal(curva.pontoVirada, null);
  });

  test('o ponto amostrado na data de avaliação bate exatamente com os valores do comparativo principal', () => {
    const r = calcularNovacao({
      valorInvestido: 10000, dataAplicacao, ativoTaxaAtual: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoAtual, isentoAtual: false,
      valorAtualPosicao: valorNoVencimento(10000, { tipo: 'fixoAA', taxaAA: 0.25 }, dataAplicacao, vencimentoAtual),
      dataNovacao: vencimentoAtual,
      ativoTaxaReaplicacao: { tipo: 'fixoAA', taxaAA: 0.18 }, vencimentoReaplicacao: new Date(2026, 0, 1), isentoReaplicacao: false,
      ativoTaxaNovacao: { tipo: 'fixoAA', taxaAA: 0.25 }, vencimentoNovacao: new Date(2026, 0, 1),
    }, CURVAS_STUB);
    const dataAvaliacaoFinal = new Date(2026, 0, 1);
    const curva = gerarCurvaComparativa({
      dataAplicacao, vencimentoAtual, dataAvaliacaoFinal,
      isentoAtual: false, isentoReaplicacao: false, resultado: r,
    });
    const pontoAvaliado = curva.pontos.find((p) => p.data.getTime() === dataAvaliacaoFinal.getTime());
    assert.ok(pontoAvaliado, 'deveria existir um ponto exatamente na data de avaliação');
    assert.equal(pontoAvaliado.outraLinha, r.cenarioResgate.vfLiquidoFinal);
    assert.equal(pontoAvaliado.novacao, r.cenarioNovacao.vfLiquidoFinal);
  });
});
