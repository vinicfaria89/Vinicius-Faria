// Identidade visual oficial da GCB — fonte única de verdade pra cor, tipografia e logo, usada tanto
// nos relatórios em PDF (Puppeteer, HTML autocontido — por isso os assets vêm em base64 aqui, sem
// depender de um servidor rodando) quanto no app web (que serve os mesmos arquivos estaticamente em
// /assets/brand/, ver server.js: express.static('public')).
//
// Origem: kit de mídia oficial da GCB (Brand Guidelines - Resumo.md). Os tons de apoio (variações
// mais claras/escuras usadas pra profundidade em cards, cabeçalhos aninhados etc.) não são
// especificados no guia — são derivados aqui das 2 cores primárias por mistura com branco/preto, em
// vez de inventados à parte, pra manter tudo dentro da mesma família cromática oficial.

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');

function lerBase64(nomeArquivo) {
  return fs.readFileSync(path.join(ASSETS_DIR, nomeArquivo)).toString('base64');
}

// Mistura uma cor hex com branco (fator > 0, tint) ou preto (fator < 0, shade). fator em [-1, 1].
function misturar(hex, fator) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const alvo = fator >= 0 ? 255 : 0;
  const f = Math.abs(fator);
  const mix = (c) => Math.round(c + (alvo - c) * f);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const VERDE_CLARO = '#A8D18B';
const VERDE_ESCURO = '#312F14';
const CINZA_CLARO = '#DCD8D5';

const COLORS = {
  verdeClaro: VERDE_CLARO,
  verdeEscuro: VERDE_ESCURO,
  cinzaClaro: CINZA_CLARO,
  // Tons de apoio derivados — usados onde o design já pedia uma variação mais clara/escura pra dar
  // profundidade (ex.: card dentro de um header escuro, texto verde legível sobre fundo branco).
  verdeEscuroClaro1: misturar(VERDE_ESCURO, 0.18), // cards dentro de fundos escuros
  verdeEscuroClaro2: misturar(VERDE_ESCURO, 0.35), // headers de card, um nível acima
  verdeEscuroEscuro1: misturar(VERDE_ESCURO, -0.25), // decoração/detalhe mais escuro que o fundo
  verdeClaroTexto: misturar(VERDE_CLARO, -0.42), // verde escuro o bastante pra ler como texto no branco
  verdeClaroTextoForte: misturar(VERDE_CLARO, -0.58), // idem, mais contraste ainda
  verdeClaroFundo: misturar(VERDE_CLARO, 0.75), // fundo bem claro pra selos/destaques suaves
};

let cache = null;
function obterAssetsBrand() {
  if (cache) return cache;
  cache = {
    logoBrancoDataUri: `data:image/png;base64,${lerBase64('logo-branco.png')}`,
    logoMarromDataUri: `data:image/png;base64,${lerBase64('logo-marrom.png')}`,
    fontHostGroteskBase64: lerBase64('HostGrotesk-Variable.ttf'),
    fontLeksikalBase64: lerBase64('LeksikalFlare-Regular.ttf'),
  };
  return cache;
}

// CSS @font-face das 2 fontes oficiais, pronto pra injetar no <style> de qualquer HTML gerado (PDF
// ou tela de medição) — embutido em base64 pra funcionar sem servidor (Puppeteer via page.setContent).
function gerarFontFaceCss() {
  const a = obterAssetsBrand();
  return `
  @font-face {
    font-family: 'Leksikal Flare';
    src: url(data:font/ttf;base64,${a.fontLeksikalBase64}) format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Host Grotesk';
    src: url(data:font/ttf;base64,${a.fontHostGroteskBase64}) format('truetype');
    font-weight: 300 700;
    font-style: normal;
  }`;
}

const FONT_DISPLAY = "'Leksikal Flare', 'Segoe UI', Arial, sans-serif";
const FONT_BODY = "'Host Grotesk', 'Segoe UI', Arial, sans-serif";

module.exports = {
  COLORS,
  obterAssetsBrand,
  gerarFontFaceCss,
  FONT_DISPLAY,
  FONT_BODY,
};
