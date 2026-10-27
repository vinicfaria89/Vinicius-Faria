const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretarLamina, detectarTaxa } = require('../lib/leitorLamina');

const textoBase = (extra) => `Material de Distribuição\nCRA Exemplo\nRentabilidade prevista\nCDI + 5,5% ao ano\nInvestimento mínimo: R$ 1.000,00\nVencimento previsto: 30/04/2030\n${extra || ''}`;

describe('leitor de lâmina em PDF', () => {
  test('detecta indexador e taxa nas formas usadas nas lâminas', () => {
    assert.deepEqual(detectarTaxa('CDI + 5,5% ao ano'), { tipo: 'cdi', taxa: 5.5 });
    assert.deepEqual(detectarTaxa('IPCA+12,50% a.a.'), { tipo: 'ipca', taxa: 12.5 });
    assert.deepEqual(detectarTaxa('175% do CDI'), { tipo: 'pctcdi', taxa: 175 });
    assert.deepEqual(detectarTaxa('1,7% a.m.'), { tipo: 'fixo', taxa: 1.7 });
    assert.deepEqual(detectarTaxa('24,32% a.a.'), { tipo: 'fixoAA', taxa: 24.32 });
  });

  test('campos básicos: categoria, mínimo (ignora "R$ 30 milhões"), vencimento, isenção de CRA', () => {
    const { campos } = interpretarLamina(textoBase('fluxo mínimo mensal de R$ 30 milhões'), 'Lâmina CRA Exemplo.pdf');
    assert.equal(campos.categoria, 'CRA');
    assert.equal(campos.valorMinimo, 1000);
    assert.equal(campos.vencimento, '2030-04-30');
    assert.equal(campos.isento, true);
  });

  test('cronograma lido por tokens vira fluxo fixo e usa a data da última parcela como vencimento', () => {
    const tokens = ['1', '30/05/2029', 'Sim', '40,5%', '2', '30/04/2030', 'Sim', '100%'];
    const { campos, avisos } = interpretarLamina(textoBase('Parcela Sim'), 'x.pdf', tokens, true);
    assert.equal(campos.cronogramaPersonalizado, true);
    assert.deepEqual(campos.cronograma.map((c) => [c.data, c.pctAmortizar]), [['2029-05-30', 40.5], ['2030-04-30', 100]]);
    assert.equal(campos.vencimento, '2030-04-30');
    assert.equal(avisos.length, 0);
  });

  test('linha da tabela sem percentual legível: NÃO cadastra cronograma parcial e avisa', () => {
    const tokens = ['1', '30/05/2029', 'Sim', '2', '30/06/2029', 'Sim', '0,12345678%', '3', '30/07/2029', 'Sim', '100%'];
    const { campos, avisos } = interpretarLamina(textoBase('Parcela Sim'), 'x.pdf', tokens, true);
    assert.equal(campos.cronograma, undefined);
    assert.ok(avisos.some((a) => /não ficou legível/.test(a)));
  });

  test('leitura só com pdfjs (sem poppler) não arrisca cronograma quando há tabela', () => {
    const tokens = ['30/05/2029', 'Sim', '40,5%', '30/04/2030', 'Sim', '100%'];
    const { campos, avisos } = interpretarLamina(textoBase('Parcela Sim'), 'x.pdf', tokens, false);
    assert.equal(campos.cronograma, undefined);
    assert.ok(avisos.some((a) => /poppler/.test(a)));
  });
});
