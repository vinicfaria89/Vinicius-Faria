// Histórico de "Aplicação Atual" da ferramenta de Novação de Debênture — guarda os dados da
// debênture que o cliente já possui (nome, valor investido, data de aplicação, taxa, vencimento,
// isenção) pra reaproveitar depois, sem precisar recadastrar tudo toda vez que for comparar novação
// vs. resgate pro mesmo cliente/ativo. Mesmo padrão de persistência simples do lib/historico.js.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const APLICACOES_PATH = path.join(DATA_DIR, 'novacaoAplicacoes.json');

function lerAplicacoes() {
  if (!fs.existsSync(APLICACOES_PATH)) return [];
  try {
    const raw = fs.readFileSync(APLICACOES_PATH, 'utf8');
    const dados = JSON.parse(raw);
    return Array.isArray(dados) ? dados : [];
  } catch (err) {
    console.warn(`Aviso: novacaoAplicacoes.json corrompido ou ilegível, tratando como vazio (${err.message})`);
    return [];
  }
}

function salvarAplicacoes(lista) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(APLICACOES_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

// Lista ordenada por nome (mais fácil de achar num select do que por data).
function listarAplicacoes() {
  return lerAplicacoes().slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}

function salvarAplicacao(dados) {
  if (!dados.nome || !dados.nome.trim()) throw new Error('nome é obrigatório para salvar a aplicação');
  const lista = lerAplicacoes();
  const agora = new Date().toISOString();
  const nova = { ...dados, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, criadoEm: agora };
  lista.unshift(nova);
  salvarAplicacoes(lista);
  return nova;
}

function removerAplicacao(id) {
  const lista = lerAplicacoes();
  const restantes = lista.filter((a) => a.id !== id);
  if (restantes.length === lista.length) throw new Error(`Aplicação ${id} não encontrada.`);
  salvarAplicacoes(restantes);
}

module.exports = { listarAplicacoes, salvarAplicacao, removerAplicacao };
