// Integração com a curva ETTJ (Estrutura a Termo de Taxas de Juros) da ANBIMA.
// Fonte oficial: https://www.anbima.com.br/informacoes/est-termo/CZ.asp
// A página carrega o gráfico a partir de feeds XML estáticos (formato FusionCharts) publicados
// diariamente após o fechamento do pregão — usamos esses feeds diretamente (sem simular cliques):
//   .../est-termo/xml/CurvaZero_PREF.xml   -> curva prefixada (nominal), vértice = dias úteis a partir de 1
//   .../est-termo/xml/CurvaZero_IPCA.xml   -> curva IPCA (juros reais), vértice = dias úteis a partir de 126
//   .../est-termo/xml/CurvaZero_INFL.xml   -> inflação implícita, vértice = dias úteis a partir de 126

const { getOrFetch } = require('./cache');
const { fetchComRetentativa } = require('./httpUtil');

const BASE = 'https://www.anbima.com.br/informacoes/est-termo/xml';
const FEEDS = {
  PRE: `${BASE}/CurvaZero_PREF.xml`,
  IPCA: `${BASE}/CurvaZero_IPCA.xml`,
  INFL: `${BASE}/CurvaZero_INFL.xml`,
};

async function fetchCurva(url) {
  // Erro de rede (sem status HTTP) não vem com o prefixo "ANBIMA" — ver nota equivalente em
  // lib/bacen.js sobre por que isso importa pra mensagem amigável do server.js.
  let res;
  try {
    res = await fetchComRetentativa(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GCB-Simulador/0.1)' } });
  } catch (err) {
    throw new Error(`ANBIMA ETTJ: ${err.message}`);
  }
  if (!res.ok) throw new Error(`ANBIMA ETTJ (${url}) respondeu ${res.status}`);
  const xml = await res.text();
  return parseFusionChartCurve(xml);
}

// Extrai pares {du, taxa} do XML tipo FusionCharts: <category name='126' .../> ... <set value='13.80...'/>
function parseFusionChartCurve(xml) {
  const nomes = [...xml.matchAll(/<category\s+name='([\d.]+)'/g)].map((m) => parseFloat(m[1]));
  const valores = [...xml.matchAll(/<set\s+value='([-\d.]+)'/g)].map((m) => parseFloat(m[1]));
  if (nomes.length === 0 || valores.length === 0) {
    throw new Error('ANBIMA ETTJ: XML não continha categorias/valores esperados (layout pode ter mudado)');
  }
  const n = Math.min(nomes.length, valores.length);
  const pontos = [];
  for (let i = 0; i < n; i++) pontos.push({ du: nomes[i], taxa: valores[i] });
  return pontos; // ordenado por du crescente (conforme publicado)
}

async function getCurvaANBIMA() {
  const [pre, ipca, infl] = await Promise.all([
    getOrFetch('anbima_ettj_pre', () => fetchCurva(FEEDS.PRE)),
    getOrFetch('anbima_ettj_ipca', () => fetchCurva(FEEDS.IPCA)),
    getOrFetch('anbima_ettj_infl', () => fetchCurva(FEEDS.INFL)),
  ]);
  return { pre: pre.data, ipca: ipca.data, infl: infl.data, fetchedAt: pre.fetchedAt };
}

// Interpola linearmente a taxa (% a.a.) para um prazo em dias úteis, a partir de uma lista de
// pontos {du, taxa} ordenada por du crescente (mesmo método usado nas simulações manuais).
function interpolar(du, pontos) {
  if (du <= pontos[0].du) return pontos[0].taxa;
  const last = pontos[pontos.length - 1];
  if (du >= last.du) return last.taxa;
  // busca binária pelo par de vértices que envolve `du`
  let lo = 0;
  let hi = pontos.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pontos[mid].du <= du) lo = mid; else hi = mid;
  }
  const p1 = pontos[lo];
  const p2 = pontos[hi];
  if (p2.du === p1.du) return p1.taxa;
  return p1.taxa + ((du - p1.du) / (p2.du - p1.du)) * (p2.taxa - p1.taxa);
}

module.exports = { getCurvaANBIMA, interpolar };
