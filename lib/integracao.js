// Contrato enxuto pra outros sistemas (ex.: Planejador Financeiro GCB) pedirem uma simulação sem
// conhecer o formato interno do formulário: em vez de mandar cada campo do ativo, mandam só
// `itens: [{ produtoId | nome, vi, taxa? }]` e o simulador completa o resto a partir do catálogo —
// a mesma fonte da verdade (taxa, vencimento, fluxo, cronograma travado) que a tela usa.

const normalizar = (s) => String(s || '').trim().toLowerCase();

// Produto do catálogo -> ativo no formato que /api/gerar espera (taxa em %, datas ISO).
function ativoDoCatalogo(produto, vi, taxaInformada) {
  const taxa = taxaInformada != null && taxaInformada !== '' && Number(taxaInformada) > 0 ? Number(taxaInformada) : produto.taxa;
  const ativo = {
    nome: produto.nome,
    tipoProdutoLabel: produto.categoria,
    tipo: produto.tipo,
    vi: Number(vi),
    vencimento: produto.vencimento,
    isento: !!produto.isento,
    pagaCupomMensal: produto.fluxoPagamento === 'distribuido' || produto.fluxoPagamento === 'reinvestido',
    reinvestir: produto.fluxoPagamento === 'reinvestido',
    cashSweep: !!produto.cashSweep,
    periodicidadeCupom: produto.periodicidadeCupom,
    periodicidadeJurosCashSweep: produto.periodicidadeJurosCashSweep,
    periodicidadeAmortizacaoCashSweep: produto.periodicidadeAmortizacaoCashSweep,
  };
  if (produto.tipo === 'fixo') ativo.taxaAM = taxa;
  else if (produto.tipo === 'fixoAA') ativo.taxaAA = taxa;
  else if (produto.tipo === 'pctcdi') ativo.percentualCDI = taxa;
  else ativo.spread = taxa; // cdi / ipca
  if (produto.cronogramaPersonalizado && Array.isArray(produto.cronograma) && produto.cronograma.length) {
    ativo.cronogramaPersonalizado = true;
    ativo.cronograma = produto.cronograma;
  }
  return ativo;
}

function acharProduto(catalogo, item) {
  if (item.produtoId) return catalogo.find((p) => p.id === item.produtoId) || null;
  const alvo = normalizar(item.nome);
  const candidatos = catalogo.filter((p) => normalizar(p.nome) === alvo);
  if (!candidatos.length) return null;
  // Homônimos (ex.: dois "Souza Prado" com taxas diferentes): se informaram a taxa, desempata por ela.
  if (candidatos.length > 1 && item.taxa != null) {
    const exato = candidatos.find((p) => Number(p.taxa) === Number(item.taxa));
    if (exato) return exato;
  }
  return candidatos[0];
}

// Converte `itens` em `ativos`; lança Error com `.status = 400` se algum item não existir no catálogo.
function ativosDeItens(itens, catalogo) {
  return itens.map((item, i) => {
    const produto = acharProduto(catalogo, item);
    if (!produto) {
      const e = new Error(`Item ${i + 1}: produto "${item.nome || item.produtoId}" não encontrado no catálogo.`);
      e.status = 400;
      throw e;
    }
    return ativoDoCatalogo(produto, item.vi, item.taxa);
  });
}

// Se o corpo veio com `itens` (e sem `ativos`), completa `ativos` + `valorTotal` + padrões. Não muta o original.
function normalizarCorpo(body, catalogo) {
  const b = { ...(body || {}) };
  if (!Array.isArray(b.ativos) && Array.isArray(b.itens)) {
    b.ativos = ativosDeItens(b.itens, catalogo);
    b.valorTotal = b.ativos.reduce((s, a) => s + a.vi, 0);
  }
  if (!b.templateType) b.templateType = 'renda';
  if (!b.dataBase) {
    const d = new Date();
    b.dataBase = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return b;
}

module.exports = { ativoDoCatalogo, ativosDeItens, normalizarCorpo };
