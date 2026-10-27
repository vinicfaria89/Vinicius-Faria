// Base de clientes importada do Pipedrive (data/clientes.json) — ver scripts/importar-clientes.js.
// Fica só em memória/arquivo local (data/ não vai pro Git). A atualização é mensal (dia 5), feita
// pelo Claude via conector do Pipedrive; o app só lê.

const fs = require('fs');
const path = require('path');

const ARQ_CLIENTES = path.join(__dirname, '..', 'data', 'clientes.json');
const ARQ_MUDANCAS = path.join(__dirname, '..', 'data', 'clientes-mudancas.json');

let cache = { mtime: 0, dados: null };

function carregar() {
  try {
    const mtime = fs.statSync(ARQ_CLIENTES).mtimeMs;
    if (cache.dados && cache.mtime === mtime) return cache.dados;
    const dados = JSON.parse(fs.readFileSync(ARQ_CLIENTES, 'utf8'));
    cache = { mtime, dados };
    return dados;
  } catch (_) {
    return { atualizadoEm: null, total: 0, clientes: [] };
  }
}

// Formato compacto pro navegador (4,7 mil registros): chaves curtas, só o que a tela usa.
function listaCompacta() {
  const { clientes } = carregar();
  return clientes.map((c) => ({
    i: c.id,
    n: c.nome,
    s: c.status || null,
    c: c.custodia ?? null,
    d: c.saldo ?? null,
    r: c.renda ?? null,
    w: c.sowValor ?? null,
    u: c.ultimoInvestimento || null,
    b: c.bu || null,
  }));
}

function meta() {
  const { atualizadoEm, total } = carregar();
  let mudancas = null;
  try { mudancas = JSON.parse(fs.readFileSync(ARQ_MUDANCAS, 'utf8')); } catch (_) { /* sem resumo ainda */ }
  const dias = atualizadoEm ? Math.floor((Date.now() - new Date(atualizadoEm).getTime()) / 86400000) : null;
  // A revisão é mensal (dia 5): passa de ~35 dias sem atualizar, o app avisa.
  return { atualizadoEm, total, diasDesdeAtualizacao: dias, desatualizada: dias == null || dias > 35, mudancas };
}

module.exports = { listaCompacta, meta };
