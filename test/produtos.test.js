const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { compararProdutos } = require('../lib/produtos');

describe('compararProdutos — ordenação do catálogo', () => {
  test('agrupa por categoria em ordem alfabética', () => {
    const lista = [
      { categoria: 'Debênture', nome: 'Z', vencimento: '2027-01-01' },
      { categoria: 'CRA', nome: 'A' },
      { categoria: 'CRI', nome: 'B' },
    ];
    const ordenado = lista.slice().sort(compararProdutos).map((p) => p.categoria);
    assert.deepEqual(ordenado, ['CRA', 'CRI', 'Debênture']);
  });

  test('dentro da mesma categoria (não Debênture), ordena por nome alfabético', () => {
    const lista = [
      { categoria: 'CRI', nome: 'Souza Prado' },
      { categoria: 'CRI', nome: 'Lumière' },
      { categoria: 'CRI', nome: 'Midtown' },
    ];
    const ordenado = lista.slice().sort(compararProdutos).map((p) => p.nome);
    assert.deepEqual(ordenado, ['Lumière', 'Midtown', 'Souza Prado']);
  });

  test('Debênture ordena por vencimento (cronológico), não por nome', () => {
    const lista = [
      { categoria: 'Debênture', nome: 'Debênture Julho de 2028', vencimento: '2028-07-21' },
      { categoria: 'Debênture', nome: 'Debênture Novembro de 2026', vencimento: '2026-11-08' },
      { categoria: 'Debênture', nome: 'Debênture Janeiro de 2027', vencimento: '2027-01-31' },
    ];
    const ordenado = lista.slice().sort(compararProdutos).map((p) => p.nome);
    assert.deepEqual(ordenado, ['Debênture Novembro de 2026', 'Debênture Janeiro de 2027', 'Debênture Julho de 2028']);
  });

  test('Debênture sem vencimento cadastrado vai para o final do grupo', () => {
    const lista = [
      { categoria: 'Debênture', nome: 'Sem data', vencimento: null },
      { categoria: 'Debênture', nome: 'Com data', vencimento: '2027-01-01' },
    ];
    const ordenado = lista.slice().sort(compararProdutos).map((p) => p.nome);
    assert.deepEqual(ordenado, ['Com data', 'Sem data']);
  });
});
