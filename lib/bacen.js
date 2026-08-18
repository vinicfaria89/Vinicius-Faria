// Integração com dados oficiais do Banco Central do Brasil (BACEN).
// Fontes: API SGS (séries históricas) e OLINDA/Expectativas (Boletim Focus, projeções de mercado).
// Documentação: https://dadosabertos.bcb.gov.br/  |  https://olinda.bcb.gov.br/olinda/servico/Expectativas/

const { getOrFetch } = require('./cache');
const { fetchComRetentativa } = require('./httpUtil');

const SGS_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';
const OLINDA_BASE = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';

const SERIES = {
  CDI_DIARIO: 12,       // Taxa de juros - CDI, % a.d.
  SELIC_META: 432,      // Meta Selic definida pelo Copom, % a.a.
  IPCA_MENSAL: 433,      // IPCA - variação mensal, %
};

// Erros de rede (conexão recusada, DNS, timeout) não têm status HTTP — o fetch nativo lança a
// exceção crua, sem o prefixo "BACEN". Sem isso, a mensagem amigável do server.js (que decide o que
// mostrar pelo prefixo do erro) cairia no genérico em vez de identificar a fonte certa — e falha de
// rede é justamente o cenário mais comum numa queda de verdade, mais até que HTTP 5xx.
async function fetchComPrefixoDeErro(url, contexto) {
  try {
    return await fetchComRetentativa(url);
  } catch (err) {
    throw new Error(`BACEN ${contexto}: ${err.message}`);
  }
}

async function fetchSgs(codigo, ultimos = 30) {
  const url = `${SGS_BASE}.${codigo}/dados/ultimos/${ultimos}?formato=json`;
  const res = await fetchComPrefixoDeErro(url, `SGS ${codigo}`);
  if (!res.ok) throw new Error(`BACEN SGS ${codigo} respondeu ${res.status}`);
  return res.json(); // [{ data: 'dd/mm/aaaa', valor: 'x.xx' }, ...]
}

async function fetchFocusExpectativaAnual(indicador) {
  // Retorna as projeções (mediana) mais recentes do Boletim Focus para o indicador,
  // por ano de referência (ex.: { "2026": 4.2, "2027": 4.0 }).
  const filtro = encodeURIComponent(`Indicador eq '${indicador}'`);
  const url = `${OLINDA_BASE}/ExpectativasMercadoAnuais?$top=200&$filter=${filtro}&$orderby=Data%20desc&$format=json`;
  const res = await fetchComPrefixoDeErro(url, `OLINDA Focus (${indicador})`);
  if (!res.ok) throw new Error(`BACEN OLINDA Focus (${indicador}) respondeu ${res.status}`);
  const json = await res.json();
  const rows = json.value || [];
  const porAno = {};
  for (const row of rows) {
    const ano = row.DataReferencia;
    if (!porAno[ano] || row.Data > porAno[ano].Data) porAno[ano] = row; // mantém a leitura mais recente por ano
  }
  const resultado = {};
  for (const ano of Object.keys(porAno)) resultado[ano] = porAno[ano].Mediana;
  return resultado;
}

async function getCDIDiarioRecente() {
  const { data } = await getOrFetch('bacen_cdi_diario', () => fetchSgs(SERIES.CDI_DIARIO, 5));
  return data;
}

async function getSelicMetaAtual() {
  const { data } = await getOrFetch('bacen_selic_meta', () => fetchSgs(SERIES.SELIC_META, 3));
  const ultimo = data[data.length - 1];
  return { data: ultimo.data, valorPctAA: parseFloat(ultimo.valor.replace(',', '.')) };
}

async function getIPCAMensalRecente(meses = 12) {
  const { data } = await getOrFetch(`bacen_ipca_${meses}m`, () => fetchSgs(SERIES.IPCA_MENSAL, meses));
  return data.map((d) => ({ data: d.data, valorPct: parseFloat(d.valor.replace(',', '.')) }));
}

async function getIPCAAcumulado12m() {
  const serie = await getIPCAMensalRecente(12);
  const fator = serie.reduce((acc, m) => acc * (1 + m.valorPct / 100), 1);
  return (fator - 1) * 100;
}

async function getFocusIPCAProjetado() {
  const { data } = await getOrFetch('bacen_focus_ipca', () => fetchFocusExpectativaAnual('IPCA'));
  return data; // { "2026": x.x, "2027": y.y, ... } % a.a.
}

async function getFocusSelicProjetada() {
  const { data } = await getOrFetch('bacen_focus_selic', () => fetchFocusExpectativaAnual('Selic'));
  return data; // % a.a. (fim de período) — usado como proxy do CDI projetado
}

// Premissas de mercado consolidadas, prontas para alimentar a curva de referência das simulações.
async function getPremissasMercado() {
  const [selicMeta, ipcaAcum12m, focusIpca, focusSelic] = await Promise.all([
    getSelicMetaAtual(),
    getIPCAAcumulado12m(),
    getFocusIPCAProjetado(),
    getFocusSelicProjetada(),
  ]);
  return {
    selicMetaAtual: selicMeta,
    ipcaAcumulado12m: ipcaAcum12m,
    ipcaProjetadoPorAno: focusIpca,
    cdiProjetadoPorAno: focusSelic, // CDI ≈ Meta Selic (spread histórico ~0,10 p.p. abaixo, ignorado nesta aproximação)
  };
}

module.exports = {
  getCDIDiarioRecente,
  getSelicMetaAtual,
  getIPCAMensalRecente,
  getIPCAAcumulado12m,
  getFocusIPCAProjetado,
  getFocusSelicProjetada,
  getPremissasMercado,
};
