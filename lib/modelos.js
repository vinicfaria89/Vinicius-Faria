// Carteiras-modelo: uma composição reaproveitável (quais produtos e quanto de cada, em % do total),
// por exemplo "Renda mensal conservadora". Ao aplicar, o assessor informa o valor total do cliente e a
// carteira é montada já distribuída. Guarda o produto pelo id do catálogo (assim taxas/vencimentos
// atualizados no catálogo valem na próxima aplicação) mais um instantâneo pra o caso de o produto ter
// saído do catálogo. Mesmo padrão de persistência simples de lib/produtos.js (JSON em data/).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MODELOS_PATH = path.join(DATA_DIR, 'modelos.json');

function lerModelos() {
  if (!fs.existsSync(MODELOS_PATH)) return [];
  try {
    const dados = JSON.parse(fs.readFileSync(MODELOS_PATH, 'utf8'));
    return Array.isArray(dados) ? dados : [];
  } catch (err) {
    console.warn(`Aviso: modelos.json ilegível, tratando como vazio (${err.message})`);
    return [];
  }
}

function salvarModelos(lista) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MODELOS_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

// Normaliza os percentuais pra somarem exatamente 100 (2 casas), com a sobra de arredondamento no
// primeiro item. Itens sem peso (todos zerados) dividem igualmente.
function normalizarItens(itens) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('o modelo precisa ter ao menos um ativo');
  const pesos = itens.map((i) => Math.max(0, Number(i.pct) || 0));
  const soma = pesos.reduce((s, v) => s + v, 0);
  const base = soma > 0 ? pesos.map((p) => (p / soma) * 100) : itens.map(() => 100 / itens.length);
  const arred = base.map((p) => Math.floor(p * 100) / 100);
  const resto = Math.round((100 - arred.reduce((s, v) => s + v, 0)) * 100) / 100;
  arred[0] = Math.round((arred[0] + resto) * 100) / 100;
  return itens.map((i, k) => ({ ...i, pct: arred[k] }));
}

function listarModelos() {
  return lerModelos().slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}

// Cria (sem `id`) ou substitui (com `id`) um modelo. Um nome já existente é atualizado, não duplicado.
function salvarModelo({ id, nome, templateType, itens }) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) throw new Error('dê um nome ao modelo');
  const itensOk = normalizarItens(itens);
  const lista = lerModelos();
  const agora = new Date().toISOString();
  let idx = id ? lista.findIndex((m) => m.id === id) : -1;
  if (idx === -1) idx = lista.findIndex((m) => (m.nome || '').trim().toLowerCase() === nomeLimpo.toLowerCase());
  const base = { nome: nomeLimpo, templateType: templateType === 'crescimento' ? 'crescimento' : 'renda', itens: itensOk, atualizadoEm: agora };
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ...base };
    salvarModelos(lista);
    return lista[idx];
  }
  const novo = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, criadoEm: agora, ...base };
  lista.push(novo);
  salvarModelos(lista);
  return novo;
}

function removerModelo(id) {
  const lista = lerModelos();
  const restantes = lista.filter((m) => m.id !== id);
  if (restantes.length === lista.length) throw new Error(`Modelo ${id} não encontrado.`);
  salvarModelos(restantes);
}

module.exports = { listarModelos, salvarModelo, removerModelo, normalizarItens };
