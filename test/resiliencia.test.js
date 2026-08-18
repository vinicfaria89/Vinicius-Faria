// Confirma que uma fonte externa fora do ar (falha de REDE, não HTTP — é o cenário mais comum numa
// queda de verdade: conexão recusada, DNS, timeout) ainda produz um erro final prefixado com o nome
// da fonte (ANBIMA/B3/BACEN). É esse prefixo que server.js usa pra montar a mensagem amigável — sem
// ele, o usuário veria o genérico "erro inesperado" em vez de saber que foi a fonte de dados que caiu.
// Regressão real: originalmente só HTTP não-ok (ex.: 503) ganhava o prefixo; erro de rede cru vazava
// sem prefixo. Ver lib/bacen.js, lib/anbima.js, lib/b3.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');

// Esconde temporariamente qualquer cache de hoje pro `name` dado, forçando a função a bater na rede
// de verdade (nesse teste, mockada pra falhar) em vez de cair silenciosamente no cache — sem isso o
// teste ficaria não-determinístico (passa ou não dependendo se o app já rodou hoje nesta máquina).
function comCacheEscondido(prefixo, fn) {
  const escondidos = [];
  if (fs.existsSync(CACHE_DIR)) {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.startsWith(prefixo)) {
        const de = path.join(CACHE_DIR, f);
        const para = `${de}.escondido-teste`;
        fs.renameSync(de, para);
        escondidos.push({ de, para });
      }
    }
  }
  return fn().finally(() => {
    for (const { de, para } of escondidos) fs.renameSync(para, de);
  });
}

function comFetchQuebrado(fn) {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('ECONNREFUSED (simulado)'); };
  return fn().finally(() => { global.fetch = original; });
}

describe('resiliência — erro de rede (não só HTTP) deve carregar o prefixo da fonte', () => {
  test('BACEN: fetchSgs propaga erro prefixado com "BACEN"', async () => {
    delete require.cache[require.resolve('../lib/bacen')];
    const bacen = require('../lib/bacen');
    await comCacheEscondido('bacen_selic_meta', () =>
      comFetchQuebrado(async () => {
        await assert.rejects(() => bacen.getSelicMetaAtual(), /^Error: BACEN /);
      })
    );
  });

  test('ANBIMA: getCurvaANBIMA propaga erro prefixado com "ANBIMA"', async () => {
    delete require.cache[require.resolve('../lib/anbima')];
    const anbima = require('../lib/anbima');
    await comCacheEscondido('anbima_ettj_pre', () =>
      comFetchQuebrado(async () => {
        await assert.rejects(() => anbima.getCurvaANBIMA(), /ANBIMA/);
      })
    );
  });

  test('B3: getCurvaPRE propaga erro prefixado com "B3"', async () => {
    delete require.cache[require.resolve('../lib/b3')];
    const b3 = require('../lib/b3');
    await comCacheEscondido('b3_curva_pre', () =>
      comFetchQuebrado(async () => {
        await assert.rejects(() => b3.getCurvaPRE(), /^Error: B3/);
      })
    );
  });
});
