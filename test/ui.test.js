// Testes de tela (smoke): sobem o servidor numa porta própria e dirigem a página com o Puppeteer (que o
// projeto já usa pra gerar PDF). Só LEEM dados (catálogo/clientes/histórico) — nada é salvo nem gerado.
// Se o Chromium não estiver disponível ou o catálogo estiver vazio, os testes são pulados em vez de falhar.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORTA = 4399;
const BASE = `http://localhost:${PORTA}`;
let servidor; let navegador; let pagina; let produtos = []; let erros = [];

async function esperarServidor() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${BASE}/api/produtos`); if (r.ok) return r.json(); } catch (_) { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('servidor não subiu');
}

describe('interface — fluxos principais', { timeout: 120000 }, () => {
  before(async () => {
    servidor = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORTA), NODE_ENV: 'production' }, stdio: 'ignore' });
    produtos = (await esperarServidor()).produtos || [];
    try {
      const puppeteer = require('puppeteer');
      navegador = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      pagina = await navegador.newPage();
      await pagina.setViewport({ width: 1280, height: 900 });
      pagina.on('pageerror', (e) => erros.push(String(e)));
      await pagina.goto(BASE, { waitUntil: 'networkidle0' });
    } catch (e) { navegador = null; }
  });

  after(async () => {
    if (navegador) await navegador.close();
    if (servidor) servidor.kill();
  });

  test('carrega sem erros de JavaScript e com os rótulos ligados aos campos', async (t) => {
    if (!navegador) return t.skip('Chromium indisponível');
    assert.deepEqual(erros, []);
    const r = await pagina.evaluate(() => ({
      clienteComRotulo: document.getElementById('cliente').labels.length > 0,
      dataBaseComRotulo: document.getElementById('dataBase').labels.length > 0,
      assessor: document.getElementById('assessorSelect').value,
      viewport: !!document.querySelector('meta[name=viewport]'),
    }));
    assert.equal(r.clienteComRotulo, true);
    assert.equal(r.dataBaseComRotulo, true);
    assert.equal(r.assessor, 'Vinícius Faria');
    assert.equal(r.viewport, true);
  });

  test('Ctrl+K cria a linha e o seletor de produto preenche a linha ao escolher', async (t) => {
    if (!navegador) return t.skip('Chromium indisponível');
    if (!produtos.length) return t.skip('catálogo vazio');
    const alvo = produtos.find((p) => !p.vencimento || p.vencimento > new Date().toISOString().slice(0, 10)) || produtos[0];
    await pagina.keyboard.down('Control'); await pagina.keyboard.press('k'); await pagina.keyboard.up('Control');
    await pagina.keyboard.type(alvo.nome.slice(0, 6));
    await pagina.waitForSelector('#ativosBody tr .cb-produtos li[role=option]', { visible: true });
    await pagina.keyboard.press('Enter');
    const linha = await pagina.evaluate(() => {
      const tr = document.querySelector('#ativosBody tr');
      return { nome: tr.querySelector('.f-nome').value, taxa: Number(tr.querySelector('.f-taxa').value), venc: tr.querySelector('.f-vencimento').value };
    });
    assert.ok(linha.nome.toLowerCase().startsWith(alvo.nome.slice(0, 6).toLowerCase()));
    assert.ok(linha.taxa > 0, 'a taxa do produto escolhido foi preenchida');
    assert.ok(linha.venc, 'o vencimento foi preenchido');
  });

  test('"Dividir igualmente" reparte o valor e a barra fixa mostra o total', async (t) => {
    if (!navegador) return t.skip('Chromium indisponível');
    if (!produtos.length) return t.skip('catálogo vazio');
    await pagina.evaluate(() => addLinha());
    await pagina.type('#totalDividir', '100001');
    await pagina.click('#dividirIgual');
    const r = await pagina.evaluate(() => ({
      valores: [...document.querySelectorAll('#ativosBody .f-vi')].map((e) => Number(e.value)),
      barra: !document.getElementById('barraResumo').hidden,
      total: document.getElementById('brTotal').textContent,
    }));
    assert.equal(r.valores.length, 2);
    assert.equal(Math.round(r.valores.reduce((s, v) => s + v, 0) * 100) / 100, 100001);
    assert.equal(r.barra, true);
    assert.match(r.total, /100\.001/);
  });

  test('gaveta de Produtos: "Usar" adiciona o ativo e avisa', async (t) => {
    if (!navegador) return t.skip('Chromium indisponível');
    if (!produtos.length) return t.skip('catálogo vazio');
    const antes = await pagina.evaluate(() => document.querySelectorAll('#ativosBody tr').length);
    await pagina.click('#toggleCatalogo');
    await pagina.waitForSelector('#catalogoLista .cp-usar', { visible: true });
    await pagina.click('#catalogoLista .cp-usar');
    const r = await pagina.evaluate(() => ({ linhas: document.querySelectorAll('#ativosBody tr').length, toast: (document.getElementById('toast') || {}).textContent }));
    assert.equal(r.linhas, antes + 1);
    assert.match(r.toast, /adicionado à carteira/);
  });

  test('a tela de comparação abre com a carteira atual como opção', async (t) => {
    if (!navegador) return t.skip('Chromium indisponível');
    await pagina.click('#fecharCatalogo'); // a gaveta de Produtos cobre parte da página; fecha antes de seguir
    await pagina.evaluate(() => document.getElementById('compararBtn').scrollIntoView({ block: 'center' }));
    await pagina.click('#compararBtn');
    await pagina.waitForFunction(() => !document.getElementById('compararOverlay').hidden && document.getElementById('cmpA').options.length > 0);
    const valor = await pagina.evaluate(() => document.getElementById('cmpA').value);
    assert.equal(valor, 'atual');
  });
});
