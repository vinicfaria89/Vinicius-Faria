// Histórico de simulações geradas — registra cada PDF gerado (cliente, assessor, modelo, produtos
// simulados) num arquivo JSON local. Simples de propósito: é um log de uso interno do time, não um
// banco de dados transacional — não precisa de mais que isso pra um punhado de assessores gerando
// alguns relatórios por dia.
//
// Atenção ao hospedar num serviço com disco EFÊMERO (ex.: plano free do Render/Railway sem volume
// persistente): o histórico some a cada reinício/deploy do container, porque fica só no disco local.
// Pra manter o histórico entre deploys, é preciso montar um volume persistente apontando pra
// DATA_DIR (ou trocar por um banco de dados de verdade) — fora do escopo desta primeira versão.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORICO_PATH = path.join(DATA_DIR, 'historico.json');
const LIMITE_ENTRADAS = 2000; // evita crescimento sem fim do arquivo

function lerHistorico() {
  if (!fs.existsSync(HISTORICO_PATH)) return [];
  try {
    const raw = fs.readFileSync(HISTORICO_PATH, 'utf8');
    const dados = JSON.parse(raw);
    return Array.isArray(dados) ? dados : [];
  } catch (err) {
    console.warn(`Aviso: histórico.json corrompido ou ilegível, tratando como vazio (${err.message})`);
    return [];
  }
}

function salvarHistorico(entradas) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORICO_PATH, JSON.stringify(entradas, null, 2), 'utf8');
}

// Registra uma simulação gerada. `entrada` já vem pronta (id, data, cliente, assessor,
// templateType, produtos[], resumo) — ver formato montado em server.js.
function registrarSimulacao(entrada) {
  const entradas = lerHistorico();
  entradas.unshift(entrada); // mais recente primeiro
  if (entradas.length > LIMITE_ENTRADAS) entradas.length = LIMITE_ENTRADAS;
  salvarHistorico(entradas);
  return entrada;
}

// Lista o histórico, mais recente primeiro, com filtro opcional por texto (cliente/assessor/produto)
// e por assessor exato (usado pelo filtro dedicado da tela, separado da busca livre).
function listarHistorico({ limit = 200, busca = '', assessor = '' } = {}) {
  const entradas = lerHistorico();
  const buscaLower = busca.trim().toLowerCase();
  const assessorFiltro = assessor.trim();
  let filtradas = entradas;
  if (assessorFiltro) {
    filtradas = filtradas.filter((e) => e.assessor === assessorFiltro);
  }
  if (buscaLower) {
    filtradas = filtradas.filter((e) => {
      const alvo = [
        e.cliente,
        e.assessor,
        ...(e.produtos || []).map((p) => p.nome),
        ...(e.produtos || []).map((p) => p.categoria),
      ].join(' ').toLowerCase();
      return alvo.includes(buscaLower);
    });
  }
  return filtradas.slice(0, limit);
}

// Lista de assessores distintos presentes no histórico, ordenada alfabeticamente — alimenta o
// filtro dedicado da tela sem precisar de um cadastro separado de assessores.
function listarAssessores() {
  const entradas = lerHistorico();
  const nomes = new Set(entradas.map((e) => e.assessor).filter(Boolean));
  return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Remove uma entrada do histórico pelo id. Não apaga o PDF em output/ nem a cópia na pasta
// Simulação — só o registro do histórico; o arquivo pode ser removido separadamente se necessário.
function removerSimulacao(id) {
  const entradas = lerHistorico();
  const restantes = entradas.filter((e) => e.id !== id);
  if (restantes.length === entradas.length) throw new Error(`Simulação ${id} não encontrada no histórico.`);
  salvarHistorico(restantes);
}

module.exports = { registrarSimulacao, listarHistorico, listarAssessores, removerSimulacao };
