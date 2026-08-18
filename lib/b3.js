// Integração com a curva de juros (DI Futuro / "PRE") da B3, via a API pública que alimenta a
// página oficial "Taxas de Referência" (https://www.b3.com.br/.../taxas-referenciais-bm-fbovespa/).
// Descoberta por engenharia reversa do bundle JS da SPA (sistemaswebb3-derivativos.b3.com.br):
// os parâmetros vão em JSON, codificados em base64, na própria URL.

const { getOrFetch } = require('./cache');
const { fetchComRetentativa } = require('./httpUtil');

const BASE = 'https://sistemaswebb3-derivativos.b3.com.br/referenceRatesProxy/Search';

function b64(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

async function fetchJson(url) {
  // Erro de rede (sem status HTTP) não vem com o prefixo "B3" — ver nota equivalente em
  // lib/bacen.js sobre por que isso importa pra mensagem amigável do server.js.
  let res;
  try {
    res = await fetchComRetentativa(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GCB-Simulador/0.1)' } });
  } catch (err) {
    throw new Error(`B3: ${err.message}`);
  }
  if (!res.ok) throw new Error(`B3 (${url}) respondeu ${res.status}`);
  return res.json();
}

async function getUltimaDataDisponivel(id = 'PRE') {
  const params = { language: 'pt-br', id };
  const json = await fetchJson(`${BASE}/GetDate/${b64(params)}`);
  if (!Array.isArray(json) || json.length === 0) throw new Error('B3: nenhuma data disponível retornada.');
  return json[0].slice(0, 10); // "AAAA-MM-DD"
}

async function fetchCurvaCompleta(id, date) {
  let pagina = 1;
  const todos = [];
  while (true) {
    const params = { language: 'pt-br', id, pageNumber: pagina, pageSize: 100, date };
    const json = await fetchJson(`${BASE}/GetList/${b64(params)}`);
    todos.push(...json.results);
    if (pagina >= json.page.totalPages || json.page.totalPages === 0) break;
    pagina++;
  }
  // curva "T1" é a curva principal/mais líquida publicada pela B3 para cada produto
  return todos
    .filter((p) => p.curve === 'T1')
    .map((p) => ({ du: p.day252, taxa: parseFloat(String(p.rate).replace(',', '.')) }))
    .sort((a, b) => a.du - b.du);
}

// Curva PRE (DI Futuro / prefixado) — referência oficial para ativos CDI+.
async function getCurvaPRE() {
  const cached = await getOrFetch('b3_curva_pre', async () => {
    const dataRef = await getUltimaDataDisponivel('PRE');
    return { dataRef, pontos: await fetchCurvaCompleta('PRE', dataRef) };
  });
  return cached.data; // { dataRef, pontos }
}

module.exports = { getCurvaPRE, getUltimaDataDisponivel, fetchCurvaCompleta };
