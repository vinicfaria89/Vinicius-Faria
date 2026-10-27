const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarItens } = require('../lib/modelos');

describe('carteiras-modelo — normalizarItens', () => {
  test('percentuais somam exatamente 100, com a sobra no primeiro item', () => {
    const r = normalizarItens([{ nome: 'A', pct: 1 }, { nome: 'B', pct: 1 }, { nome: 'C', pct: 1 }]);
    assert.equal(Math.round(r.reduce((s, i) => s + i.pct, 0) * 100) / 100, 100);
    assert.equal(r[0].pct, 33.34);
    assert.equal(r[1].pct, 33.33);
  });

  test('pesos proporcionais são reescalados (70/30 a partir de 7 e 3)', () => {
    const r = normalizarItens([{ nome: 'A', pct: 7 }, { nome: 'B', pct: 3 }]);
    assert.deepEqual(r.map((i) => i.pct), [70, 30]);
  });

  test('todos zerados dividem igualmente; lista vazia é erro', () => {
    assert.deepEqual(normalizarItens([{ nome: 'A', pct: 0 }, { nome: 'B', pct: 0 }]).map((i) => i.pct), [50, 50]);
    assert.throws(() => normalizarItens([]), /ao menos um ativo/);
  });
});
