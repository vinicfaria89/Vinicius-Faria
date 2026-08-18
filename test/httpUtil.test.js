const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { fetchComRetentativa } = require('../lib/httpUtil');

function respostaFake(status, ok) {
  return { ok, status, json: async () => ({}), text: async () => '' };
}

describe('fetchComRetentativa', () => {
  test('sucesso de primeira: não tenta de novo', async () => {
    let chamadas = 0;
    const fetchOriginal = global.fetch;
    global.fetch = async () => { chamadas++; return respostaFake(200, true); };
    try {
      const res = await fetchComRetentativa('http://x', {}, { tentativas: 3, timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(chamadas, 1, 'só deve chamar fetch uma vez quando dá certo de cara');
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  test('erro de rede nas 2 primeiras tentativas, sucesso na 3ª', async () => {
    let chamadas = 0;
    const fetchOriginal = global.fetch;
    global.fetch = async () => {
      chamadas++;
      if (chamadas < 3) throw new Error('network blip');
      return respostaFake(200, true);
    };
    try {
      const res = await fetchComRetentativa('http://x', {}, { tentativas: 3, timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(chamadas, 3, 'deve ter tentado 3 vezes até dar certo');
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  test('erro 5xx é retentado', async () => {
    let chamadas = 0;
    const fetchOriginal = global.fetch;
    global.fetch = async () => {
      chamadas++;
      if (chamadas < 2) return respostaFake(503, false);
      return respostaFake(200, true);
    };
    try {
      const res = await fetchComRetentativa('http://x', {}, { tentativas: 3, timeoutMs: 1000 });
      assert.equal(res.status, 200);
      assert.equal(chamadas, 2, '503 deve disparar nova tentativa');
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  test('erro 4xx NÃO é retentado — devolve a resposta de erro direto', async () => {
    let chamadas = 0;
    const fetchOriginal = global.fetch;
    global.fetch = async () => { chamadas++; return respostaFake(404, false); };
    try {
      const res = await fetchComRetentativa('http://x', {}, { tentativas: 3, timeoutMs: 1000 });
      assert.equal(res.status, 404);
      assert.equal(chamadas, 1, '404 é erro de contrato, não deve tentar de novo');
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  test('esgota todas as tentativas: propaga o erro', async () => {
    let chamadas = 0;
    const fetchOriginal = global.fetch;
    global.fetch = async () => { chamadas++; throw new Error('sempre falha'); };
    try {
      await assert.rejects(
        () => fetchComRetentativa('http://x', {}, { tentativas: 3, timeoutMs: 1000 }),
        /sempre falha/
      );
      assert.equal(chamadas, 3, 'deve ter esgotado as 3 tentativas antes de desistir');
    } finally {
      global.fetch = fetchOriginal;
    }
  });
});
