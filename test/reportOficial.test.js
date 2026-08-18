const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { agruparCardsPorAltura } = require('../lib/reportOficial');

describe('agruparCardsPorAltura — paginação por espaço útil real', () => {
  test('cards pequenos cabem 3 por página quando o orçamento permite', () => {
    const alturas = [100, 100, 100, 100, 100, 100];
    const grupos = agruparCardsPorAltura(alturas, 320, 320);
    assert.deepEqual(grupos, [[0, 1, 2], [3, 4, 5]]);
  });

  test('cards altos (ex.: Cash Sweep) cabem só 2 por página quando 3 estourariam o orçamento', () => {
    // Reproduz o bug relatado: 3 cards de ~110 cada não cabem num orçamento de 320 (330 > 320) —
    // o 3º precisa ir pra próxima página, em vez de ficar cortado embaixo do rodapé.
    const alturas = [110, 110, 110];
    const grupos = agruparCardsPorAltura(alturas, 320, 320);
    assert.deepEqual(grupos, [[0, 1], [2]]);
  });

  test('primeira página usa orçamento menor (tem o título h2) que as seguintes', () => {
    const alturas = [90, 90, 90, 90];
    // orçamento da 1ª página só cabe 2 (180 <= 200, mas 3 = 270 > 200); demais páginas cabem 4 (360 <= 400)
    const grupos = agruparCardsPorAltura(alturas, 200, 400);
    assert.deepEqual(grupos, [[0, 1], [2, 3]]);
  });

  test('nunca deixa um grupo vazio: card maior que o orçamento inteiro ainda ocupa uma página sozinho', () => {
    const alturas = [50, 500, 50];
    const grupos = agruparCardsPorAltura(alturas, 320, 320);
    assert.deepEqual(grupos, [[0], [1], [2]]);
  });

  test('lista vazia não gera grupos', () => {
    assert.deepEqual(agruparCardsPorAltura([], 320, 320), []);
  });
});
