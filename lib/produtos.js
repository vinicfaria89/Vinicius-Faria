// Catálogo de produtos cadastrados — salva as características de um produto (categoria, indexador,
// taxa, isenção, fluxo de pagamento etc.) para reaproveitar em simulações futuras, sem precisar
// redigitar tudo toda vez. Mesmo padrão de persistência simples do lib/historico.js: arquivo JSON
// local, suficiente para o volume de uso de um punhado de assessores.
//
// Atenção ao hospedar num serviço com disco EFÊMERO (ex.: plano free do Render/Railway sem volume
// persistente): o catálogo some a cada reinício/deploy do container — ver mesma ressalva em
// lib/historico.js.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUTOS_PATH = path.join(DATA_DIR, 'produtos.json');

function lerProdutos() {
  if (!fs.existsSync(PRODUTOS_PATH)) return [];
  try {
    const raw = fs.readFileSync(PRODUTOS_PATH, 'utf8');
    const dados = JSON.parse(raw);
    return Array.isArray(dados) ? dados : [];
  } catch (err) {
    console.warn(`Aviso: produtos.json corrompido ou ilegível, tratando como vazio (${err.message})`);
    return [];
  }
}

function salvarProdutos(produtos) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PRODUTOS_PATH, JSON.stringify(produtos, null, 2), 'utf8');
}

// Ordena o catálogo por categoria (alfabética, agrupando produtos da mesma categoria) e, dentro de
// cada categoria, por nome (alfabético) — EXCETO Debênture, que ordena por vencimento (cronológico,
// sem data por último), já que pra debêntures o prazo importa mais pra localizar o produto do que o
// nome (frequentemente batizado só com mês/ano, ex.: "Debênture Julho de 2028").
function compararProdutos(a, b) {
  const catCompare = (a.categoria || '').localeCompare(b.categoria || '', 'pt-BR');
  if (catCompare !== 0) return catCompare;
  if (a.categoria === 'Debênture') {
    if (!a.vencimento && !b.vencimento) return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    if (!a.vencimento) return 1;
    if (!b.vencimento) return -1;
    return a.vencimento.localeCompare(b.vencimento);
  }
  return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
}

// Lista o catálogo ordenado (ver compararProdutos), com filtro opcional por texto (nome/categoria).
function listarProdutos({ busca = '' } = {}) {
  const produtos = lerProdutos();
  const buscaLower = busca.trim().toLowerCase();
  const filtrados = buscaLower
    ? produtos.filter((p) => `${p.nome} ${p.categoria}`.toLowerCase().includes(buscaLower))
    : produtos;
  return filtrados.slice().sort(compararProdutos);
}

// Cria (sem `id`) ou atualiza (com `id` existente) um produto do catálogo. `dados` já vem pronto no
// formato usado pelo formulário de simulação (nome, categoria, tipo, taxa, isento, fluxoPagamento,
// cashSweep, periodicidadeCupom, periodicidadeJurosCashSweep, periodicidadeAmortizacaoCashSweep,
// vencimento opcional) — ver formato montado em server.js.
function salvarProduto(dados) {
  if (!(Number(dados.taxa) > 0)) throw new Error('taxa deve ser maior que 0');
  if (dados.valorMinimo != null && Number(dados.valorMinimo) < 0) throw new Error('valor mínimo não pode ser negativo');

  const produtos = lerProdutos();
  const agora = new Date().toISOString();

  if (dados.id) {
    const idx = produtos.findIndex((p) => p.id === dados.id);
    if (idx === -1) throw new Error(`Produto ${dados.id} não encontrado.`);
    const atualizado = { ...produtos[idx], ...dados, atualizadoEm: agora };
    produtos[idx] = atualizado;
    salvarProdutos(produtos);
    return atualizado;
  }

  const novo = { ...dados, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, criadoEm: agora, atualizadoEm: agora };
  produtos.unshift(novo);
  salvarProdutos(produtos);
  return novo;
}

function removerProduto(id) {
  const produtos = lerProdutos();
  const restantes = produtos.filter((p) => p.id !== id);
  if (restantes.length === produtos.length) throw new Error(`Produto ${id} não encontrado.`);
  salvarProdutos(restantes);
}

// Importação em lote (ex.: upload de CSV) — cada item de `lista` já vem no mesmo formato de
// salvarProduto(). Uma linha com erro não derruba as demais: cada produto é salvo individualmente,
// e o resultado separa o que foi salvo do que falhou (com o motivo), pra a tela de importação
// mostrar um resumo claro em vez de tudo-ou-nada.
function importarProdutos(lista) {
  const salvos = [];
  const erros = [];
  lista.forEach((dados, i) => {
    try {
      if (!dados.nome || !dados.nome.trim()) throw new Error('nome do produto é obrigatório');
      salvos.push(salvarProduto(dados));
    } catch (err) {
      erros.push({ linha: i + 1, nome: dados.nome || '(sem nome)', mensagem: err.message });
    }
  });
  return { salvos, erros };
}

module.exports = { listarProdutos, salvarProduto, removerProduto, importarProdutos, compararProdutos };
