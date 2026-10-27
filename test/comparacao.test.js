const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { vencedores, destaques, resumirCarteira } = require('../lib/comparacao');
const { calcularCarteira } = require('../lib/calculo');

describe('comparação de simulações', () => {
  test('vencedores: maior/menor, empate e "nada ganho"', () => {
    assert.deepEqual(vencedores([10, 30, 20], 'maior'), [1]);
    assert.deepEqual(vencedores([10, 30, 20], 'menor'), [0]);
    assert.deepEqual(vencedores([5, 5, 3], 'maior'), [0, 1]);
    assert.deepEqual(vencedores([7, 7], 'maior'), [], 'todos iguais: ninguém é destacado');
    assert.deepEqual(vencedores([0, 0, 0], 'maior'), []);
    assert.deepEqual(vencedores([0, 100], 'menor'), [0], 'IR zero é o melhor');
    assert.deepEqual(vencedores([10, null], 'maior'), [], 'precisa de ao menos 2 valores válidos');
  });

  test('destaques só cobre métricas com critério de melhor', () => {
    const d = destaques([{ vfLiquidoTotal: 100, irTotal: 5, viTotal: 50 }, { vfLiquidoTotal: 120, irTotal: 9, viTotal: 80 }]);
    assert.deepEqual(d.vfLiquidoTotal, [1]);
    assert.deepEqual(d.irTotal, [0]);
    assert.equal(d.viTotal, undefined, 'total investido é informativo, sem vencedor');
  });

  test('resumirCarteira: totais e % de cada produto batem com a carteira calculada', () => {
    const dataBase = new Date(2026, 0, 1);
    const venc = new Date(2027, 0, 1);
    const curvas = { b3Pre: { pontos: [{ du: 0, taxa: 10 }, { du: 100000, taxa: 10 }] } };
    const ativos = [
      { nome: 'A', tipoProdutoLabel: 'CRA', tipo: 'fixo', taxaAM: 0.01, vi: 3000, dataBase, vencimento: venc, isento: true, pagaCupomMensal: true, reinvestir: false },
      { nome: 'B', tipoProdutoLabel: 'Debênture', tipo: 'fixo', taxaAM: 0.01, vi: 1000, dataBase, vencimento: venc, isento: false, pagaCupomMensal: false, reinvestir: false },
    ];
    const r = resumirCarteira(calcularCarteira(ativos, curvas), 'Teste');
    assert.equal(r.viTotal, 4000);
    assert.equal(r.nAtivos, 2);
    assert.equal(r.produtos[0].pctCarteira, 75);
    assert.equal(r.vencimentoMaisLongo, '2027-01-01');
    assert.ok(r.rendaMensalMedia > 0, 'o ativo A distribui juros mensais');
    assert.ok(Math.abs(r.ganhoLiquido - (r.vfLiquidoTotal - 4000)) < 1e-9);
  });
});
