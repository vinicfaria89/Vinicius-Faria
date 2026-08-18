const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { diasUteisEntre, ehFeriado, pascoa, feriadosNacionais } = require('../lib/calendario');

describe('pascoa — domingo de Páscoa (valores conhecidos, conferidos contra o calendário oficial)', () => {
  test('datas de Páscoa conhecidas em anos variados', () => {
    assert.equal(pascoa(2024).toDateString(), new Date(2024, 2, 31).toDateString());
    assert.equal(pascoa(2025).toDateString(), new Date(2025, 3, 20).toDateString());
    assert.equal(pascoa(2026).toDateString(), new Date(2026, 3, 5).toDateString());
    assert.equal(pascoa(2027).toDateString(), new Date(2027, 2, 28).toDateString());
    assert.equal(pascoa(2028).toDateString(), new Date(2028, 3, 16).toDateString());
  });
});

describe('feriadosNacionais — feriados fixos e móveis', () => {
  test('feriados fixos de 2026', () => {
    const f = feriadosNacionais(2026);
    assert.ok(f.has('2026-01-01'), 'Confraternização Universal');
    assert.ok(f.has('2026-04-21'), 'Tiradentes');
    assert.ok(f.has('2026-05-01'), 'Dia do Trabalho');
    assert.ok(f.has('2026-09-07'), 'Independência');
    assert.ok(f.has('2026-10-12'), 'N. Sra. Aparecida');
    assert.ok(f.has('2026-11-02'), 'Finados');
    assert.ok(f.has('2026-11-15'), 'Proclamação da República');
    assert.ok(f.has('2026-12-25'), 'Natal');
  });

  test('feriados móveis de 2026 (a partir da Páscoa em 05/04/2026)', () => {
    const f = feriadosNacionais(2026);
    assert.ok(f.has('2026-02-16'), 'Carnaval (segunda)');
    assert.ok(f.has('2026-02-17'), 'Carnaval (terça)');
    assert.ok(f.has('2026-04-03'), 'Sexta-feira Santa');
    assert.ok(f.has('2026-06-04'), 'Corpus Christi');
  });

  test('Consciência Negra (20/nov) só é feriado nacional a partir de 2024', () => {
    assert.ok(!feriadosNacionais(2023).has('2023-11-20'), 'ainda não era feriado nacional em 2023');
    assert.ok(feriadosNacionais(2024).has('2024-11-20'), 'feriado nacional a partir de 2024 (Lei 14.759/2023)');
  });

  test('não inclui feriados estaduais/municipais (fora da convenção 252 de mercado)', () => {
    const f = feriadosNacionais(2026);
    assert.ok(!f.has('2026-01-25'), 'Aniversário de SP não é feriado nacional bancário');
    assert.ok(!f.has('2026-07-09'), 'Revolução Constitucionalista (SP) não é feriado nacional bancário');
  });
});

describe('diasUteisEntre — contagem real de dias úteis (convenção 252)', () => {
  test('data-base não conta; cada dia útil seguinte soma 1', () => {
    // Segunda 05/01/2026 até sexta 09/01/2026 (mesma semana, sem feriados): 4 dias úteis (ter,qua,qui,sex).
    assert.equal(diasUteisEntre(new Date(2026, 0, 5), new Date(2026, 0, 9)), 4);
  });

  test('pula fins de semana', () => {
    // Sexta 09/01/2026 -> segunda 12/01/2026: só 1 dia útil (a própria segunda).
    assert.equal(diasUteisEntre(new Date(2026, 0, 9), new Date(2026, 0, 12)), 1);
  });

  test('pula feriados nacionais que caem em dia de semana', () => {
    // 20/04/2026 (segunda) -> 22/04/2026 (quarta): Tiradentes (21/04, terça) é feriado, então só
    // a quarta-feira (22/04) conta — 1 du, não 2.
    assert.equal(diasUteisEntre(new Date(2026, 3, 20), new Date(2026, 3, 22)), 1);
    // Confirma por contraste: mesmo intervalo de 2 dias corridos SEM feriado no meio dá 2 du.
    assert.equal(diasUteisEntre(new Date(2026, 3, 27), new Date(2026, 3, 29)), 2);
  });

  test('um ano corrido (365 dias) NÃO equivale a exatamente 252 du — depende dos feriados do período', () => {
    const du = diasUteisEntre(new Date(2026, 0, 1), new Date(2027, 0, 1));
    assert.notEqual(du, 252, 'a aproximação antiga (dc*252/365) mascarava essa diferença real');
    assert.ok(du > 240 && du < 252, 'deve ficar num intervalo plausível (poucos dias úteis "perdidos" para feriados)');
  });

  test('data final anterior ou igual à inicial: zero dias úteis', () => {
    assert.equal(diasUteisEntre(new Date(2026, 0, 10), new Date(2026, 0, 10)), 0);
    assert.equal(diasUteisEntre(new Date(2026, 0, 10), new Date(2026, 0, 5)), 0);
  });
});

describe('ehFeriado', () => {
  test('reconhece feriados fixos e móveis', () => {
    assert.ok(ehFeriado(new Date(2026, 11, 25)), 'Natal');
    assert.ok(ehFeriado(new Date(2026, 3, 3)), 'Sexta-feira Santa (móvel, Páscoa - 2 dias)');
  });
  test('dia útil comum não é feriado', () => {
    assert.ok(!ehFeriado(new Date(2026, 0, 6)), 'terça-feira comum de janeiro');
  });
});
