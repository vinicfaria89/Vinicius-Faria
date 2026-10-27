const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { converterPessoa, compararListas } = require('../scripts/importar-clientes');

describe('importação de clientes do Pipedrive', () => {
  test('converterPessoa: pega e-mail/telefone principais, campos personalizados por prefixo e ignora documento', () => {
    const c = converterPessoa({
      id: 7, name: ' Maria Souza ', update_time: '2026-10-01T00:00:00Z',
      emails: [{ value: 'b@x.com', primary: false }, { value: 'a@x.com', primary: true }],
      phones: [{ value: '5511999990000', primary: true }],
      custom_fields: {
        e4c5c0aaaa: { id: 1, label: 'Aprovado' },
        '1d241bbbbb': { value: 1500.5, currency: 'BRL' },
        '0163a5cccc': '123.456.789-00', // Documento: não deve ser copiado
        '2032feffff': 12,
      },
    });
    assert.equal(c.nome, 'Maria Souza');
    assert.equal(c.email, 'a@x.com');
    assert.equal(c.status, 'Aprovado');
    assert.equal(c.custodia, 1500.5);
    assert.equal(c.sowPct, 12);
    assert.ok(!JSON.stringify(c).includes('123.456'), 'documento não pode ir para a base local');
  });

  test('compararListas: novos, removidos e mudança de status', () => {
    const antiga = [{ id: 1, nome: 'A', status: 'X' }, { id: 2, nome: 'B', status: 'Y' }, { id: 3, nome: 'C', status: 'Z' }];
    const nova = [{ id: 1, nome: 'A', status: 'W' }, { id: 2, nome: 'B', status: 'Y' }, { id: 4, nome: 'D', status: 'Z' }];
    const d = compararListas(antiga, nova);
    assert.deepEqual(d.adicionados.map((c) => c.id), [4]);
    assert.deepEqual(d.removidos.map((c) => c.id), [3]);
    assert.deepEqual(d.statusAlterado.map((c) => [c.id, c.de, c.para]), [[1, 'X', 'W']]);
  });
});
