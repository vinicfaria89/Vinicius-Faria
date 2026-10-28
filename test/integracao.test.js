const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { ativoDoCatalogo, ativosDeItens, normalizarCorpo } = require('../lib/integracao');

const catalogo = [
  { id: 'a1', nome: 'Souza Prado', categoria: 'CRI', tipo: 'ipca', taxa: 10, vencimento: '2030-02-13', isento: true, fluxoPagamento: 'bullet', cashSweep: true, periodicidadeCupom: 'mensal', periodicidadeJurosCashSweep: 'mensal', periodicidadeAmortizacaoCashSweep: 'mensal' },
  { id: 'a2', nome: 'Souza Prado', categoria: 'CRI', tipo: 'ipca', taxa: 13, vencimento: '2030-02-13', isento: true, fluxoPagamento: 'bullet', cashSweep: true },
  { id: 'b1', nome: 'Favaretto', categoria: 'CRA', tipo: 'cdi', taxa: 5.5, vencimento: '2028-10-15', isento: true, fluxoPagamento: 'distribuido', cronogramaPersonalizado: true, cronograma: [{ data: '2027-04-15', pctAmortizar: 0 }, { data: '2028-10-15', pctAmortizar: 100 }] },
  { id: 'c1', nome: 'Debênture 24%', categoria: 'Debênture', tipo: 'fixoAA', taxa: 24, vencimento: '2028-02-25', isento: false, fluxoPagamento: 'bullet' },
];

describe('integração — contrato enxuto (itens do catálogo)', () => {
  test('ativoDoCatalogo escolhe o campo de taxa certo pro indexador e leva o cronograma', () => {
    assert.equal(ativoDoCatalogo(catalogo[0], 1000).spread, 10);
    assert.equal(ativoDoCatalogo(catalogo[3], 1000).taxaAA, 24);
    const fav = ativoDoCatalogo(catalogo[2], 5000);
    assert.equal(fav.spread, 5.5);
    assert.equal(fav.cronogramaPersonalizado, true);
    assert.equal(fav.cronograma.length, 2);
    assert.equal(fav.pagaCupomMensal, true);
  });

  test('taxa informada vale quando válida; zero/vazia cai na do catálogo', () => {
    assert.equal(ativoDoCatalogo(catalogo[0], 1000, 11.5).spread, 11.5);
    assert.equal(ativoDoCatalogo(catalogo[0], 1000, 0).spread, 10);
    assert.equal(ativoDoCatalogo(catalogo[0], 1000, '').spread, 10);
  });

  test('homônimos: desempata pela taxa informada; por id é exato; produto inexistente é erro 400', () => {
    assert.equal(ativosDeItens([{ nome: 'souza prado', vi: 1, taxa: 13 }], catalogo)[0].spread, 13);
    assert.equal(ativosDeItens([{ produtoId: 'a2', vi: 1 }], catalogo)[0].spread, 13);
    assert.throws(() => ativosDeItens([{ nome: 'Não existe', vi: 1 }], catalogo), (e) => e.status === 400 && /não encontrado/.test(e.message));
  });

  test('normalizarCorpo: monta ativos/valorTotal a partir de itens e aplica padrões; não muta a entrada', () => {
    const entrada = { cliente: 'X', itens: [{ nome: 'Favaretto', vi: 7000 }, { nome: 'Debênture 24%', vi: 3000 }] };
    const b = normalizarCorpo(entrada, catalogo);
    assert.equal(b.ativos.length, 2);
    assert.equal(b.valorTotal, 10000);
    assert.equal(b.templateType, 'renda');
    assert.match(b.dataBase, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(entrada.ativos, undefined);
  });

  test('corpo que já traz ativos (formato da tela) passa direto', () => {
    const ativos = [{ nome: 'A', vi: 5 }];
    assert.equal(normalizarCorpo({ ativos, cliente: 'X', dataBase: '2026-01-01', templateType: 'crescimento' }, catalogo).ativos, ativos);
  });
});
