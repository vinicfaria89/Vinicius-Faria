const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  aliquotaIR,
  diasEntre,
  mesesEntre,
  taxaEfetivaAnual,
  capitalizarComposto,
  calcularAtivo,
  calcularDurationAtivo,
  calcularCarteira,
} = require('../lib/calculo');

const EPS = 1e-6;
function assertClose(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < EPS, `${msg}: esperado ${expected}, obtido ${actual}`);
}

// Curva "achatada" (mesma taxa em qualquer prazo) — usada nos testes para isolar a lógica de
// cálculo do motor sem depender da interpolação real da ANBIMA/B3.
function curvaConstante(taxaPct) {
  return [{ du: 0, taxa: taxaPct }, { du: 100000, taxa: taxaPct }];
}

describe('aliquotaIR — tabela regressiva de IR sobre renda fixa', () => {
  test('faixas de corte corretas (180/360/720 dias)', () => {
    assert.equal(aliquotaIR(180), 0.225);
    assert.equal(aliquotaIR(181), 0.20);
    assert.equal(aliquotaIR(360), 0.20);
    assert.equal(aliquotaIR(361), 0.175);
    assert.equal(aliquotaIR(720), 0.175);
    assert.equal(aliquotaIR(721), 0.15);
  });
});

describe('diasEntre / mesesEntre', () => {
  test('conta dias corridos entre duas datas', () => {
    assert.equal(diasEntre(new Date(2026, 0, 1), new Date(2027, 0, 1)), 365);
  });
  test('conta meses cheios, ajustando se o dia do vencimento for anterior ao da data-base', () => {
    assert.equal(mesesEntre(new Date(2026, 0, 1), new Date(2027, 0, 1)), 12);
    assert.equal(mesesEntre(new Date(2026, 0, 15), new Date(2027, 0, 1)), 11);
  });
});

describe('capitalizarComposto — VF = VI x (1+i)^(du/252)', () => {
  test('recebe `du` (dias úteis) diretamente — 252 du equivale a exatamente 1 ano de capitalização', () => {
    const vf = capitalizarComposto(1000, 0.10, 252);
    assertClose(vf, 1100, 'VF com 10% a.a. em 252 du (1 ano)');
  });
});

describe('taxaEfetivaAnual — conversão de taxa por tipo de ativo', () => {
  const dataBase = new Date(2026, 0, 1);
  const vencimento = new Date(2027, 0, 1); // 365 dias corridos -> 252 du

  test('fixo (a.m.): converte taxa mensal composta para anual', () => {
    const i = taxaEfetivaAnual({ tipo: 'fixo', taxaAM: 0.01 }, {});
    assertClose(i, Math.pow(1.01, 12) - 1, 'fixo a.m. -> a.a.');
  });

  test('fixoAA: usa a taxa anual diretamente, sem conversão', () => {
    const i = taxaEfetivaAnual({ tipo: 'fixoAA', taxaAA: 0.12 }, {});
    assertClose(i, 0.12, 'fixoAA');
  });

  test('cdi: combinação MULTIPLICATIVA entre referência (curva PRE) e spread', () => {
    const curvas = { b3Pre: { pontos: curvaConstante(10) } };
    const i = taxaEfetivaAnual({ tipo: 'cdi', spread: 0.05, dataBase, vencimento }, curvas);
    assertClose(i, 1.10 * 1.05 - 1, 'CDI+5% sobre referência de 10% a.a.');
  });

  test('ipca: combinação MULTIPLICATIVA entre referência (inflação implícita ANBIMA) e spread', () => {
    const curvas = { anbima: { infl: curvaConstante(4) } };
    const i = taxaEfetivaAnual({ tipo: 'ipca', spread: 0.06, dataBase, vencimento }, curvas);
    assertClose(i, 1.04 * 1.06 - 1, 'IPCA+6% sobre inflação implícita de 4% a.a.');
  });

  test('pctcdi: percentual direto da referência, SEM soma de spread', () => {
    const curvas = { b3Pre: { pontos: curvaConstante(10) } };
    const i = taxaEfetivaAnual({ tipo: 'pctcdi', percentualCDI: 1.10, dataBase, vencimento }, curvas);
    assertClose(i, 0.10 * 1.10, '110% de uma referência de 10% a.a.');
  });
});

describe('calcularAtivo — Caso B: bullet (pagaCupomMensal=false)', () => {
  const ativo = {
    nome: 'Debênture Teste',
    tipo: 'fixo',
    taxaAM: 0.01,
    vi: 1000,
    dataBase: new Date(2026, 0, 1),
    vencimento: new Date(2027, 0, 1), // 365 dias -> 252 du
    isento: true,
    pagaCupomMensal: false,
  };

  test('isento: VF líquido = VF bruto (sem IR)', () => {
    const c = calcularAtivo(ativo, {});
    // du real (calendário nacional) entre 01/01/2026 e 01/01/2027 = 249 dias úteis (não 252 —
    // a diferença são os feriados nacionais caindo em dias de semana nesse intervalo).
    const iAnual = Math.pow(1.01, 12) - 1;
    const vfEsperado = 1000 * Math.pow(1 + iAnual, 249 / 252);
    assert.equal(c.du, 249, 'du real do período (calendário nacional)');
    assertClose(c.vfBruto, vfEsperado, 'VF bruto bullet isento');
    assertClose(c.vfLiquido, c.vfBruto, 'VF líquido = VF bruto quando isento');
    assertClose(c.ir, 0, 'IR = 0 quando isento');
    assert.equal(c.cupomLiq, null, 'bullet não tem cupom distribuído');
  });

  test('não isento: aplica alíquota regressiva sobre o rendimento (não sobre o principal)', () => {
    const c = calcularAtivo({ ...ativo, isento: false }, {});
    const rendimentoBruto = c.vfBruto - 1000;
    const vfLiquidoEsperado = 1000 + rendimentoBruto * (1 - 0.175); // 365 dias -> faixa 17,5%
    assertClose(c.aliquotaTotal, 0.175, 'alíquota da faixa de 365 dias');
    assertClose(c.vfLiquido, vfLiquidoEsperado, 'VF líquido com IR sobre o rendimento');
  });
});

describe('calcularAtivo — Caso A: cupom mensal distribuído (pagaCupomMensal=true, reinvestir=false)', () => {
  const base = {
    nome: 'CRA Teste',
    tipo: 'fixo',
    taxaAM: 0.01, // cupom mensal bruto exato de 1% ao mês sobre o VI
    vi: 1000,
    dataBase: new Date(2026, 0, 1),
    vencimento: new Date(2027, 0, 1), // 12 meses cheios, 365 dias
    pagaCupomMensal: true,
    reinvestir: false,
  };

  test('isento: soma os 12 cupons brutos ao principal, sem desconto', () => {
    const c = calcularAtivo({ ...base, isento: true }, {});
    assertClose(c.cupomBruto, 10, 'cupom bruto mensal (1% de 1000)');
    assert.equal(c.nPeriodos, 12, '12 pagamentos mensais entre as datas');
    assertClose(c.vfBruto, 1120, 'VF bruto = principal + 12 cupons de 10');
    assertClose(c.vfLiquido, 1120, 'isento: líquido = bruto');
    assertClose(c.cupomLiq, 10, 'cupom líquido = cupom bruto quando isento');
  });

  test('não isento: cada pagamento é tributado pela alíquota regressiva do prazo decorrido ATÉ ELE — não um percentual único', () => {
    const c = calcularAtivo({ ...base, isento: false }, {});
    // Pagamentos 1-5 (31 a 151 dias corridos) caem na faixa até 180 dias -> 22,5%.
    // Pagamentos 6-11 (181 a 334 dias corridos) caem na faixa até 360 dias -> 20,0%.
    // Pagamento 12 (365 dias corridos) já passa de 360 dias -> 17,5%.
    assertClose(c.cupomLiq, 10 * (1 - 0.225), 'cupom líquido do 1º pagamento, na faixa de até 180 dias (22,5%)');
    assert.equal(c.cupomLiquidos.length, 12, 'um valor líquido por pagamento');
    assertClose(c.cupomLiquidos[0], 10 * (1 - 0.225), 'pagamentos 1-5: 22,5%');
    assertClose(c.cupomLiquidos[4], 10 * (1 - 0.225), 'pagamentos 1-5: 22,5%');
    assertClose(c.cupomLiquidos[5], 10 * (1 - 0.20), 'pagamento 6 (181 dias): já caiu para 20,0%');
    assertClose(c.cupomLiquidos[10], 10 * (1 - 0.20), 'pagamento 11 (334 dias): 20,0%');
    assertClose(c.cupomLiquidos[11], 10 * (1 - 0.175), 'pagamento 12 (365 dias): já caiu para 17,5%');
    const somaEsperada = 5 * 10 * (1 - 0.225) + 6 * 10 * (1 - 0.20) + 1 * 10 * (1 - 0.175);
    assertClose(c.vfLiquido, 1000 + somaEsperada, 'VF líquido = soma real dos 12 pagamentos, cada um na sua própria faixa');
  });
});

describe('calcularAtivo — periodicidade do cupom (mensal vs. semestral)', () => {
  test('periodicidadeCupom="semestral": cupom maior e um pagamento a cada 6 meses', () => {
    const ativo = {
      nome: 'CRI Semestral',
      tipo: 'fixo',
      taxaAM: 0.01,
      vi: 1000,
      dataBase: new Date(2026, 0, 1),
      vencimento: new Date(2027, 6, 1), // 18 meses -> 3 pagamentos semestrais
      isento: true,
      pagaCupomMensal: true,
      reinvestir: false,
      periodicidadeCupom: 'semestral',
    };
    const c = calcularAtivo(ativo, {});
    const iAnual = Math.pow(1.01, 12) - 1;
    const cupomEsperado = 1000 * (Math.pow(1 + iAnual, 6 / 12) - 1);
    assert.equal(c.periodicidadeCupom, 'semestral');
    assert.equal(c.periodicidadeMeses, 6);
    assert.equal(c.nPeriodos, 3, '3 pagamentos semestrais em 18 meses');
    assertClose(c.cupomBruto, cupomEsperado, 'cupom bruto semestral (maior que o equivalente mensal)');
    assertClose(c.vfBruto, 1000 + 3 * cupomEsperado, 'VF bruto = principal + 3 cupons semestrais');
  });

  test('sem periodicidadeCupom informado, o padrão é mensal', () => {
    const c = calcularAtivo({
      nome: 'x', tipo: 'fixo', taxaAM: 0.01, vi: 1000,
      dataBase: new Date(2026, 0, 1), vencimento: new Date(2027, 0, 1),
      isento: true, pagaCupomMensal: true, reinvestir: false,
    }, {});
    assert.equal(c.periodicidadeCupom, 'mensal');
    assert.equal(c.periodicidadeMeses, 1);
  });
});

describe('calcularAtivo — Cash Sweep (amortização SAC + juros sobre saldo devedor)', () => {
  test('amortização e juros mensais: saldo cai igualmente a cada mês, juros incidem sobre o saldo declinante', () => {
    const ativo = {
      nome: 'CRI Cash Sweep',
      tipo: 'fixoAA',
      taxaAA: Math.pow(1.01, 12) - 1, // taxa mensal equivalente exata de 1%
      vi: 1200,
      dataBase: new Date(2026, 0, 1),
      vencimento: new Date(2027, 0, 1), // 12 meses
      isento: true,
      cashSweep: true,
      periodicidadeJurosCashSweep: 'mensal',
      periodicidadeAmortizacaoCashSweep: 'mensal',
    };
    const c = calcularAtivo(ativo, {});
    assert.equal(c.cashSweep.nAmortizacoes, 12, '12 parcelas de amortização em 12 meses');
    assertClose(c.cashSweep.amortizacaoConstante, 100, 'parcela constante = 1200/12');
    assert.equal(c.cashSweep.saldoHistorico.length, 13, '13 pontos no histórico (saldo inicial + 12 amortizações)');
    assertClose(c.cashSweep.saldoHistorico[0].saldo, 1200, 'saldo inicial = VI');
    assertClose(c.cashSweep.saldoHistorico[12].saldo, 0, 'saldo final = 0 (quitado)');
    assertClose(c.cashSweep.saldoHistorico[6].saldo, 600, 'saldo na metade do prazo = metade do principal');
    assert.equal(c.nPeriodos, 12, '12 pagamentos de juros (mensal)');
    // 1º pagamento de juros: 1% sobre o saldo de 1200 (ainda não amortizado no início do mês 1)
    assertClose(c.cupomLiquidos[0], 1200 * 0.01, 'juros do 1º mês incidem sobre o saldo cheio');
    // Juros vão diminuindo mês a mês porque o saldo sobre o qual incidem também diminui.
    assert.ok(c.cupomLiquidos[11] < c.cupomLiquidos[0], 'último pagamento de juros é menor que o primeiro (saldo menor)');
    // Isento: principal (1200) retorna integralmente via amortização + juros líquidos = bruto.
    const somaJuros = c.cupomLiquidos.reduce((s, v) => s + v, 0);
    assertClose(c.vfLiquido, 1200 + somaJuros, 'VF líquido = principal + soma dos juros recebidos');
  });

  test('amortização semestral com juros mensais: saldo só cai a cada 6 meses, mas os juros são pagos todo mês sobre o saldo vigente', () => {
    const ativo = {
      nome: 'CRA Cash Sweep',
      tipo: 'fixoAA',
      taxaAA: Math.pow(1.01, 12) - 1,
      vi: 1200,
      dataBase: new Date(2026, 0, 1),
      vencimento: new Date(2027, 0, 1),
      isento: true,
      cashSweep: true,
      periodicidadeJurosCashSweep: 'mensal',
      periodicidadeAmortizacaoCashSweep: 'semestral',
    };
    const c = calcularAtivo(ativo, {});
    assert.equal(c.cashSweep.nAmortizacoes, 2, '2 parcelas semestrais em 12 meses');
    assertClose(c.cashSweep.amortizacaoConstante, 600, 'parcela semestral constante = 1200/2');
    assert.equal(c.nPeriodos, 12, '12 pagamentos de juros (mensal), mesmo com amortização semestral');
    // Juros dos meses 1-6 incidem todos sobre o saldo cheio (1200) -> valor igual entre si.
    assertClose(c.cupomLiquidos[0], c.cupomLiquidos[5], 'juros iguais enquanto o saldo não amortizou (meses 1-6)');
    // A partir do mês 7 (após a 1ª amortização semestral), o saldo caiu para 600 -> juros menores.
    assert.ok(c.cupomLiquidos[6] < c.cupomLiquidos[5], 'juros caem após a amortização semestral reduzir o saldo');
  });
});

describe('calcularAtivo — Caso C: juros reinvestidos periodicamente (pagaCupomMensal=true, reinvestir=true)', () => {
  const base = {
    nome: 'CRI Reinvestido',
    tipo: 'fixo',
    taxaAM: 0.01, // fatorPeriodo mensal = exatamente 1% (ver cálculo em calcularReinvestimentoComIR)
    vi: 1000,
    dataBase: new Date(2026, 0, 1),
    vencimento: new Date(2027, 0, 1), // 12 meses cheios
    pagaCupomMensal: true,
    reinvestir: true,
  };

  test('isento: reinveste o juro bruto integralmente a cada mês — equivale à capitalização composta mensal', () => {
    const c = calcularAtivo({ ...base, isento: true }, {});
    assert.equal(c.nPeriodos, 12, '12 reinvestimentos mensais em 12 meses');
    assertClose(c.vfBruto, 1000 * Math.pow(1.01, 12), 'sem IR, os 12 reinvestimentos mensais de 1% equivalem à capitalização composta anual');
    assertClose(c.vfLiquido, c.vfBruto, 'isento: líquido = bruto (nenhum desconto em nenhum reinvestimento)');
  });

  test('não isento: cada reinvestimento desconta o IR regressivo do prazo decorrido ANTES de somar ao saldo', () => {
    const c = calcularAtivo({ ...base, isento: false }, {});
    assert.equal(c.cupomLiquidos.length, 12, 'um valor líquido por reinvestimento');
    // 1º juro bruto = 1% de 1000 = 10; líquido (faixa até 180 dias = 22,5%) = 7,75 — reinvestido, não distribuído.
    assertClose(c.cupomBruto, 10, 'juro bruto do 1º período');
    assertClose(c.cupomLiquidos[0], 10 * (1 - 0.225), '1º reinvestimento tributado a 22,5% (31 dias corridos)');
    // Com IR incidindo a cada reinvestimento, o saldo composto fica abaixo do cenário isento (sem IR).
    assert.ok(c.vfLiquido < 1000 * Math.pow(1.01, 12), 'com IR a cada período, o saldo final fica abaixo da capitalização composta bruta');
    assert.ok(c.vfLiquido > 1000, 'ainda assim cresce em relação ao principal investido');
  });
});

describe('calcularDurationAtivo — duration de Macaulay pondera pelos fluxos de caixa reais', () => {
  const dataBase = new Date(2026, 0, 1);
  const vencimento = new Date(2027, 0, 1); // 365 dias corridos

  test('bullet: fluxo único no vencimento -> duration = prazo até o vencimento', () => {
    const ativo = { nome: 'x', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento, isento: true, pagaCupomMensal: false, reinvestir: false };
    const c = calcularAtivo(ativo, {});
    const d = calcularDurationAtivo(ativo, c);
    assertClose(d, c.dias / 365, 'bullet: duration = fluxo único no vencimento');
  });

  test('reinvestido: nenhum fluxo intermediário chega ao investidor -> duration = prazo até o vencimento', () => {
    const ativo = { nome: 'x', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento, isento: false, pagaCupomMensal: true, reinvestir: true };
    const c = calcularAtivo(ativo, {});
    const d = calcularDurationAtivo(ativo, c);
    assertClose(d, c.dias / 365, 'reinvestido: só recebe caixa no vencimento, igual ao bullet');
  });

  test('cupom distribuído: recebendo caixa antes do vencimento, duration é sempre MENOR que o prazo até o vencimento', () => {
    const ativo = { nome: 'x', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento, isento: true, pagaCupomMensal: true, reinvestir: false };
    const c = calcularAtivo(ativo, {});
    const d = calcularDurationAtivo(ativo, c);
    assert.ok(d < c.dias / 365, 'cupom distribuído antecipa caixa -> duration menor que o prazo contratual');
    assert.ok(d > 0, 'duration positiva');

    // Confere o resultado contra uma fórmula de Macaulay computada de forma independente aqui no teste.
    const iAnual = Math.pow(1.01, 12) - 1;
    let somaVP = 0;
    let somaVPxT = 0;
    for (let p = 1; p <= 12; p++) {
      const dataPag = new Date(2026, p, 1);
      const t = diasEntre(dataBase, dataPag) / 365;
      const vp = 10 / Math.pow(1 + iAnual, t);
      somaVP += vp;
      somaVPxT += vp * t;
    }
    const tFinal = c.dias / 365;
    const vpFinal = 1000 / Math.pow(1 + iAnual, tFinal);
    somaVP += vpFinal;
    somaVPxT += vpFinal * tFinal;
    assertClose(d, somaVPxT / somaVP, 'duration bate com o cálculo independente de Macaulay');
  });

  test('cash sweep: amortização de principal antecipa caixa -> duration bem menor que o prazo até o vencimento', () => {
    const ativo = {
      nome: 'x', tipo: 'fixoAA', taxaAA: Math.pow(1.01, 12) - 1, vi: 1200, dataBase, vencimento: new Date(2027, 0, 1),
      isento: true, cashSweep: true, periodicidadeJurosCashSweep: 'mensal', periodicidadeAmortizacaoCashSweep: 'mensal',
    };
    const c = calcularAtivo(ativo, {});
    const d = calcularDurationAtivo(ativo, c);
    assert.ok(d < c.dias / 365, 'amortização SAC antecipa devolução de principal -> duration menor');
    assert.ok(d > 0, 'duration positiva');
  });
});

describe('calcularCarteira — durationAnos agregada (ponderada pelo VI)', () => {
  test('média ponderada pelo VI da duration de Macaulay de cada ativo', () => {
    const dataBase = new Date(2026, 0, 1);
    const vencimento = new Date(2027, 0, 1);
    const curvas = { b3Pre: { pontos: curvaConstante(10) } };
    const ativos = [
      { nome: 'A - cupom distribuído', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento, isento: true, pagaCupomMensal: true, reinvestir: false },
      { nome: 'B - bullet puro', tipo: 'fixo', taxaAM: 0.01, vi: 3000, dataBase, vencimento, isento: true, pagaCupomMensal: false, reinvestir: false },
    ];
    const carteira = calcularCarteira(ativos, curvas);
    const esperado = (1000 * carteira.resultados[0].calc.durationAnos + 3000 * carteira.resultados[1].calc.durationAnos) / 4000;
    assertClose(carteira.durationAnos, esperado, 'duration da carteira = média ponderada pelo VI');
    assert.ok(carteira.durationAnos < carteira.prazoMedioAnos, 'com um ativo de cupom distribuído na mistura, a duration fica abaixo do prazo médio simples');
  });
});

describe('calcularCarteira — agregados da carteira', () => {
  test('soma VI/VF, e "juros líquidos totais" só conta cupom DISTRIBUÍDO (não reinvestido)', () => {
    const dataBase = new Date(2026, 0, 1);
    const vencimento = new Date(2027, 0, 1);
    const curvas = { b3Pre: { pontos: curvaConstante(10) } };

    const ativos = [
      // Caso A: distribui cupom -> entra em jurosLiquidosTotal
      { nome: 'A - cupom distribuído', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento, isento: true, pagaCupomMensal: true, reinvestir: false },
      // Caso B com reinvestir: NÃO entra em jurosLiquidosTotal, mesmo tendo cupomLiq nulo
      { nome: 'B - bullet puro', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento, isento: true, pagaCupomMensal: false, reinvestir: false },
    ];

    const carteira = calcularCarteira(ativos, curvas);

    assertClose(carteira.viTotal, 2000, 'VI total');
    assertClose(carteira.jurosLiquidosTotal, 10, 'apenas o ativo A contribui para juros líquidos totais (1 cupom neste ponto do teste = 10)');
    assertClose(carteira.vfBrutoTotal, carteira.resultados[0].calc.vfBruto + carteira.resultados[1].calc.vfBruto, 'VF bruto total = soma dos ativos');
    assertClose(carteira.retornoLiquidoPct, (carteira.vfLiquidoTotal / carteira.viTotal - 1) * 100, 'retorno líquido % consistente com VF líquido total');
  });
});
