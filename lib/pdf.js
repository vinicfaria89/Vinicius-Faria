// Converte HTML -> PDF via Chromium headless (Puppeteer) — multiplataforma, funciona em qualquer
// servidor (Linux/Windows/Mac) sem depender de um navegador já instalado no sistema, diferente da
// versão anterior que chamava o Microsoft Edge do Windows diretamente.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Reaproveita uma única instância do Chromium entre as requisições — abrir/fechar o navegador a
// cada PDF seria caro demais num servidor atendendo vários usuários ao mesmo tempo.
//
// Atenção: se puppeteer.launch() falhar (Chromium ausente/corrompido, antivírus bloqueando,
// permissões do SO), a promise cacheada precisa ser descartada — do contrário TODA tentativa
// seguinte volta a falhar instantaneamente com o mesmo erro, para sempre, até reiniciar o
// processo. Bug real encontrado numa revisão anterior: a versão antiga nunca resetava
// `browserPromise` em caso de falha.
//
// Segundo bug real encontrado (2026-08-16, via logs/erros.log): o Chromium pode CAIR depois de já
// ter iniciado com sucesso (falta de memória, processo morto externamente, etc.) — nesse caso
// `browserPromise` continua resolvida para um browser MORTO, e toda chamada seguinte falha
// imediatamente com "Protocol error: Connection closed", pra sempre, até reiniciar o processo
// (mesma classe de bug do comentário acima, mas disparada por uma falha DEPOIS do launch, não
// durante). Corrigido escutando o evento 'disconnected' do browser pra resetar o cache assim que
// ele cair, permitindo que a próxima chamada suba um Chromium novo automaticamente.
let browserPromise = null;
function obterBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000, // evita ficar pendurado indefinidamente se o Chromium não subir
    }).then((browser) => {
      browser.once('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    }).catch((err) => {
      browserPromise = null; // permite tentar de novo na próxima chamada, em vez de travar pra sempre
      throw new Error(`Falha ao iniciar o Chromium (Puppeteer): ${err.message}`);
    });
  }
  return browserPromise;
}

async function gerarPdfDeHtml(html, nomeArquivoSaida, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const pdfPath = path.join(outputDir, nomeArquivoSaida);

  const browser = await obterBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true, // respeita o tamanho de página definido no CSS do relatório (A4)
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
  } finally {
    await page.close();
  }
  return pdfPath;
}

// Renderiza um HTML "de medição" (fora do fluxo do PDF final) e roda `evaluateFn` dentro da página
// pra extrair medidas reais de layout (alturas de elementos etc.) — usado pelo relatório oficial
// pra decidir onde quebrar página com base no espaço realmente disponível, em vez de um número fixo
// de cards por página (ver lib/reportOficial.js: um card de Cash Sweep é bem mais alto que um card
// bullet simples, então "3 por página" nem sempre cabe).
async function medirAlturasCards(html, evaluateFn) {
  const browser = await obterBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.evaluate(evaluateFn);
  } finally {
    await page.close();
  }
}

// Encerra o Chromium compartilhado — útil num shutdown gracioso do servidor.
async function encerrarBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = { gerarPdfDeHtml, medirAlturasCards, encerrarBrowser };
