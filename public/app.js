const ativosBody = document.getElementById('ativosBody');
const linhaTpl = document.getElementById('linhaTpl');
const totalInvestidoEl = document.getElementById('totalInvestido');

// Estado "ativo" nos botões do header (Produtos/Calculadora/Novação) — reflete qual painel está
// aberto no momento, já que os 3 podem ficar visualmente idênticos sem isso. Chamado depois de toda
// ação que abre/fecha um dos 3 cards (ver toggleCatalogo/toggleCalculadora/toggleNovacao e os
// respectivos botões "Fechar" mais abaixo).
function nvAtualizarBotaoAtivoHeader() {
  [
    { btnId: 'toggleCatalogo', cardId: 'catalogoCard' },
    { btnId: 'toggleCalculadora', cardId: 'calculadoraCard' },
    { btnId: 'toggleNovacao', cardId: 'novacaoCard' },
  ].forEach(({ btnId, cardId }) => {
    const btn = document.getElementById(btnId);
    const card = document.getElementById(cardId);
    if (btn && card) btn.classList.toggle('ativo', card.style.display !== 'none');
  });
}

// --- Rascunho automático da Novação (autosave) ---------------------------------------------------
// Salva o preenchimento no localStorage a cada mudança, pra não perder tudo se a aba fechar sem
// querer, o navegador travar, ou algo (ex.: sincronização do OneDrive) roubar o foco no meio de uma
// das 20-50 operações do dia. Não mexe em cálculo nem em nada que vai pro servidor — puro
// front-end; se o localStorage não estiver disponível (modo privado, por ex.), falha em silêncio e
// o app funciona normalmente, só sem esse recurso.
const NV_RASCUNHO_KEY = 'gcbNovacaoRascunho_v1';

// Campos de topo (formulário de uma debênture) — id -> valor. Cobre etapas 1/2/3 do fluxo único,
// incluindo o Cenário 1 (reaplicação) do modo completo.
const NV_RASCUNHO_CAMPOS_TOPO = [
  'cliente', 'nv-dataAplicacaoOriginal', 'nv-valorInvestido', 'nv-nomeAtual', 'nv-tipoAtual', 'nv-taxaAtual',
  'nv-dataAplicacao', 'nv-vencimentoAtual', 'nv-valorAtualPosicao', 'nv-isentoAtual',
  'nv-modoNovacao', 'nv-dataAssinatura',
  'nv-nomeReaplicacao', 'nv-tipoReaplicacao', 'nv-taxaReaplicacao', 'nv-vencimentoReaplicacao', 'nv-isentoReaplicacao',
  'nv-fluxoReaplicacao', 'nv-periodicidadeReaplicacao', 'nv-cashSweepReaplicacao',
  'nv-periodicidadeJurosCSReaplicacao', 'nv-periodicidadeAmortCSReaplicacao',
];
// Etapa 3 compartilhada do modo "várias debêntures".
const NV_RASCUNHO_CAMPOS_PROPOSTA = [
  'nv-multiplasModoNovacao', 'nv-multiplasDataAssinatura', 'nv-multiplasSugeridaCatalogo',
  'nv-multiplasNomeNovacao', 'nv-multiplasTipoNovacao', 'nv-multiplasTaxaNovacao', 'nv-multiplasVencimentoNovacao',
];
// Campos (por classe) de cada card repetível — debênture sugerida (formulário único) e posição
// (várias debêntures) — na mesma ordem em que aparecem no card.
const NV_RASCUNHO_CAMPOS_SUGERIDA = ['nv-pos-sugeridaCatalogo', 'nv-pos-nomeNovacao', 'nv-pos-tipoNovacao', 'nv-pos-taxaNovacao', 'nv-pos-vencimentoNovacao'];
const NV_RASCUNHO_CAMPOS_POSICAO = ['nv-pos-dataAplicacaoOriginal', 'nv-pos-valorInvestido', 'nv-pos-nome', 'nv-pos-tipoAtual', 'nv-pos-taxaAtual', 'nv-pos-dataAplicacao', 'nv-pos-vencimentoAtual', 'nv-pos-valorAtual', 'nv-pos-isentoAtual', 'nv-pos-cliente'];

function nvLerCampoParaRascunho(el) {
  return el.type === 'checkbox' ? el.checked : el.value;
}

function nvEscreverCampoDoRascunho(el, valor) {
  if (el.type === 'checkbox') el.checked = !!valor;
  else el.value = valor ?? '';
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Serializa uma lista repetível (cards de sugerida ou de posição) num array de objetos {classe: valor}.
function nvSerializarListaRascunho(containerId, cardSelector, camposClasses) {
  return Array.from(document.querySelectorAll(`#${containerId} ${cardSelector}`)).map((card) => {
    const obj = {};
    camposClasses.forEach((cls) => {
      const el = card.querySelector(`.${cls}`);
      if (el) obj[cls] = nvLerCampoParaRascunho(el);
    });
    return obj;
  });
}

// Reconstrói uma lista repetível a partir do array salvo — limpa o container e recria um card por
// item, na mesma ordem, preenchendo cada campo (dispara "change" pra acionar toggles condicionais,
// mesmo padrão já usado em nvDuplicarBloco).
function nvRestaurarListaRascunho(containerId, criarFn, itens, camposClasses) {
  const container = document.getElementById(containerId);
  if (!container || !itens.length) return;
  container.innerHTML = '';
  itens.forEach((item) => {
    const card = criarFn();
    camposClasses.forEach((cls) => {
      const el = card.querySelector(`.${cls}`);
      if (el && cls in item) nvEscreverCampoDoRascunho(el, item[cls]);
    });
    container.appendChild(card);
  });
}

function nvColetarRascunho() {
  const topo = {};
  NV_RASCUNHO_CAMPOS_TOPO.forEach((id) => {
    const el = document.getElementById(id);
    if (el) topo[id] = nvLerCampoParaRascunho(el);
  });
  const proposta = {};
  NV_RASCUNHO_CAMPOS_PROPOSTA.forEach((id) => {
    const el = document.getElementById(id);
    if (el) proposta[id] = nvLerCampoParaRascunho(el);
  });
  const qtdCard = document.querySelector('#nv-perguntaQtd .nv-cenario-card.selecionado');
  const comparacaoCard = document.querySelector('#nv-perguntaComparacao .nv-cenario-card.selecionado');
  return {
    v: 1,
    savedAt: Date.now(),
    qtd: qtdCard ? qtdCard.dataset.qtd : 'uma',
    comparacao: comparacaoCard ? comparacaoCard.dataset.comparacao : 'simplificado',
    topo,
    proposta,
    sugeridas: nvSerializarListaRascunho('nv-sugeridasLista', '.nov-sugerida-card', NV_RASCUNHO_CAMPOS_SUGERIDA),
    posicoes: nvSerializarListaRascunho('nv-posicoesLista', '.nov-posicao-card', NV_RASCUNHO_CAMPOS_POSICAO),
  };
}

function nvRascunhoTemDados(rascunho) {
  if (!rascunho) return false;
  const topoPreenchido = Object.values(rascunho.topo || {}).some((v) => v && v !== '0');
  return topoPreenchido || (rascunho.sugeridas || []).some((s) => Object.values(s).some(Boolean)) || (rascunho.posicoes || []).length > 0;
}

function nvSalvarRascunho() {
  try {
    localStorage.setItem(NV_RASCUNHO_KEY, JSON.stringify(nvColetarRascunho()));
  } catch (err) {
    // localStorage indisponível (modo privado, cota cheia etc.) — autosave só não funciona.
  }
}

function nvLerRascunhoSalvo() {
  try {
    const raw = localStorage.getItem(NV_RASCUNHO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function nvLimparRascunho() {
  try { localStorage.removeItem(NV_RASCUNHO_KEY); } catch (err) { /* ver nvSalvarRascunho */ }
}

function nvRestaurarRascunho(rascunho) {
  Object.entries(rascunho.topo || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) nvEscreverCampoDoRascunho(el, val);
  });
  Object.entries(rascunho.proposta || {}).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) nvEscreverCampoDoRascunho(el, val);
  });
  nvRestaurarListaRascunho('nv-sugeridasLista', () => nvCriarBlocoSugerida(document.getElementById('nv-sugeridasLista')), rascunho.sugeridas || [], NV_RASCUNHO_CAMPOS_SUGERIDA);
  nvRestaurarListaRascunho('nv-posicoesLista', nvCriarBlocoPosicao, rascunho.posicoes || [], NV_RASCUNHO_CAMPOS_POSICAO);
  // O seletor de cenário (qtd/comparação) decide qual seção fica visível — refeito por último, pra
  // não esconder/ignorar os campos que acabaram de ser preenchidos acima.
  const cardQtd = document.querySelector(`#nv-perguntaQtd [data-qtd="${rascunho.qtd}"]`);
  if (cardQtd) cardQtd.click();
  const cardComparacao = document.querySelector(`#nv-perguntaComparacao [data-comparacao="${rascunho.comparacao}"]`);
  if (cardComparacao) cardComparacao.click();
}

// "há Xh" / "há Xmin" em vez de timestamp cru, pra ficar claro sem exigir conta de cabeça.
function nvFormatarTempoDecorrido(timestampMs) {
  const minutos = Math.max(1, Math.round((Date.now() - timestampMs) / 60000));
  if (minutos < 60) return `há ${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.round(minutos / 60);
  return `há ${horas} hora${horas === 1 ? '' : 's'}`;
}

function nvVerificarRascunho() {
  const rascunho = nvLerRascunhoSalvo();
  const banner = document.getElementById('nv-rascunhoBanner');
  if (!banner) return;
  if (!nvRascunhoTemDados(rascunho)) {
    banner.style.display = 'none';
    return;
  }
  document.getElementById('nv-rascunhoQuando').textContent = nvFormatarTempoDecorrido(rascunho.savedAt);
  banner.style.display = 'flex';
}

document.getElementById('nv-rascunhoRestaurar').addEventListener('click', () => {
  const rascunho = nvLerRascunhoSalvo();
  if (rascunho) nvRestaurarRascunho(rascunho);
  document.getElementById('nv-rascunhoBanner').style.display = 'none';
});
document.getElementById('nv-rascunhoDescartar').addEventListener('click', () => {
  nvLimparRascunho();
  document.getElementById('nv-rascunhoBanner').style.display = 'none';
});

// Salva a cada mudança dentro do painel de Novação, com debounce (evita gravar no localStorage a
// cada tecla digitada) — delegado no document porque os cards de posição/sugerida são criados
// dinamicamente depois do carregamento da página.
let nvSalvarRascunhoTimeout = null;
['input', 'change'].forEach((evento) => document.addEventListener(evento, (e) => {
  if (!e.target.closest('#novacaoCard')) return;
  if (e.target.closest('#nv-rascunhoBanner')) return;
  clearTimeout(nvSalvarRascunhoTimeout);
  nvSalvarRascunhoTimeout = setTimeout(nvSalvarRascunho, 600);
}));

// Modal de confirmação (Sim/Não) reaproveitável — substitui o confirm() nativo do navegador nos
// pontos onde uma exclusão precisa de confirmação explícita, mantendo a identidade visual do app.
function confirmarAcao(mensagem) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmOverlay');
    document.getElementById('confirmMensagem').textContent = mensagem;
    const simBtn = document.getElementById('confirmSim');
    const naoBtn = document.getElementById('confirmNao');
    function limpar(resultado) {
      overlay.classList.remove('show');
      simBtn.removeEventListener('click', onSim);
      naoBtn.removeEventListener('click', onNao);
      resolve(resultado);
    }
    function onSim() { limpar(true); }
    function onNao() { limpar(false); }
    simBtn.addEventListener('click', onSim);
    naoBtn.addEventListener('click', onNao);
    overlay.classList.add('show');
  });
}

// Data-base pré-preenchida com o dia de hoje (fuso local, não UTC) — o usuário pode editar livremente.
(() => {
  const dataBaseInput = document.getElementById('dataBase');
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  dataBaseInput.value = `${yyyy}-${mm}-${dd}`;
})();

function fmtBRL(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// CRI e CRA são sempre isentos de IR para pessoa física (Lei 11.033/2004, art. 3º, XVII e XVIII) —
// diferente de Debênture, cuja isenção depende de ser incentivada (decisão manual do usuário).
const CATEGORIAS_SEMPRE_ISENTAS = ['CRI', 'CRA'];

// Catálogo de produtos por tipo, para sugerir no campo "Produto" (via <datalist>) — o campo continua
// sendo texto livre, então também serve para cadastrar um produto novo que ainda não está na lista.
const PRODUTOS_POR_TIPO = {
  'Debênture': [
    'Debênture 3 meses', 'Debênture 6 meses', 'Debênture 1 ano', 'Debênture 2 anos',
    'Debênture 3 anos', 'Debênture 5 anos', 'Debênture 7 anos',
  ],
  'Recebível Judicial': [
    'Cesta de Créditos Trabalhistas', 'Cesta de Pré-RPVs', 'Operação Aloés', 'Renda Fixa Previdenciária | INSS',
  ],
  'Operações Estruturadas': [
    'Ecofort', 'Grid Co.', 'Operação Easy Tech',
  ],
  'CRI': [
    'Amoreiras', 'FH Jockey', 'Gran Vellas', 'Harmony Ipeúva', 'Harmony Vila Maria', 'Housi Cambuí',
    'Lumière', 'Midtown', 'Porto Cavalli', 'Smart Living', 'Souza Prado', 'Vilas do Palácio',
  ],
  'CRA': [
    'Avanço', 'Fazenda Canaã', 'Lazarotto', 'Rio Bonito', 'Rizzi',
  ],
};

let contadorLinhas = 0;

// Catálogo de produtos CADASTRADOS pelo usuário (via "📦 Cadastrar Produto"), carregado do servidor —
// diferente do PRODUTOS_POR_TIPO acima, que é só uma lista fixa de sugestões de nome. Um produto
// cadastrado aqui preenche TODOS os campos da linha automaticamente quando o nome é digitado/escolhido.
let produtosRegistrados = [];

async function carregarProdutosRegistrados() {
  try {
    const resp = await fetch('/api/produtos');
    const data = await resp.json();
    produtosRegistrados = data.produtos || [];
  } catch (err) {
    produtosRegistrados = [];
  }
  atualizarTodosDatalists();
}
carregarProdutosRegistrados();

function atualizarTodosDatalists() {
  document.querySelectorAll('#ativosBody tr').forEach(atualizarDatalistProdutos);
}

function atualizarDatalistProdutos(tr) {
  const categoria = tr.querySelector('.f-tipoProdutoLabel').value;
  const sugeridos = PRODUTOS_POR_TIPO[categoria] || [];
  const cadastrados = produtosRegistrados.filter((p) => p.categoria === categoria).map((p) => p.nome);
  const nomes = [...new Set([...cadastrados, ...sugeridos])];
  const datalist = tr.querySelector('.f-produtos-datalist');
  datalist.innerHTML = nomes.map((p) => `<option value="${p.replace(/"/g, '&quot;')}"></option>`).join('');
}

// Aplica (ou limpa, se `valorMinimo` for vazio/undefined) o valor mínimo de aporte na linha: guarda em
// data-valor-minimo (lido pela validação em validarFormulario) e dá uma dica visual no próprio campo.
function aplicarValorMinimo(tr, valorMinimo) {
  const viEl = tr.querySelector('.f-vi');
  if (valorMinimo) {
    tr.dataset.valorMinimo = valorMinimo;
    viEl.min = valorMinimo;
    viEl.title = `Valor mínimo deste produto: ${fmtBRL(Number(valorMinimo))}`;
  } else {
    delete tr.dataset.valorMinimo;
    viEl.removeAttribute('min');
    viEl.title = '';
  }
}

// Aplica um produto cadastrado a uma linha já existente da tabela (usado quando o usuário digita/escolhe
// um nome que bate com o catálogo) — mesmos campos que addLinha(prefill) preenche na criação da linha.
function preencherLinhaComProduto(tr, p) {
  tr.querySelector('.f-tipoProdutoLabel').value = p.categoria || 'Debênture';
  tr.querySelector('.f-tipo').value = p.tipo || 'fixo';
  tr.querySelector('.f-taxa').value = p.taxa ?? '';
  if (p.vencimento) tr.querySelector('.f-vencimento').value = p.vencimento;
  tr.querySelector('.f-isento').checked = !!p.isento;
  tr.querySelector('.f-fluxoPagamento').value = p.fluxoPagamento || 'bullet';
  tr.querySelector('.f-cashSweep').checked = !!p.cashSweep;
  tr.querySelector('.f-periodicidade').value = p.periodicidadeCupom || 'mensal';
  tr.querySelector('.f-periodicidadeJurosCS').value = p.periodicidadeJurosCashSweep || 'mensal';
  tr.querySelector('.f-periodicidadeAmortCS').value = p.periodicidadeAmortizacaoCashSweep || 'mensal';
  aplicarValorMinimo(tr, p.valorMinimo);
  atualizarIsentoAutomatico(tr);
  atualizarModoCashSweep(tr);
  atualizarDatalistProdutos(tr);
}

function buscarProdutoCadastradoPorNome(nome) {
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return null;
  return produtosRegistrados.find((p) => p.nome.trim().toLowerCase() === alvo) || null;
}

function atualizarIsentoAutomatico(tr) {
  const categoria = tr.querySelector('.f-tipoProdutoLabel').value;
  const isentoCheckbox = tr.querySelector('.f-isento');
  if (CATEGORIAS_SEMPRE_ISENTAS.includes(categoria)) {
    isentoCheckbox.checked = true;
    isentoCheckbox.disabled = true;
    isentoCheckbox.title = 'CRI e CRA são sempre isentos de IR para pessoa física';
  } else {
    isentoCheckbox.checked = false;
    isentoCheckbox.disabled = false;
    isentoCheckbox.title = '';
  }
}

// Cash Sweep tem fluxo de caixa próprio (amortização programada + juros sobre saldo devedor), então
// substitui o "Fluxo de Pagamento" e troca o seletor único de periodicidade por dois (juros e amortização).
function atualizarModoCashSweep(tr) {
  const ativo = tr.querySelector('.f-cashSweep').checked;
  const fluxoSelect = tr.querySelector('.f-fluxoPagamento');
  fluxoSelect.disabled = ativo;
  if (ativo) fluxoSelect.value = 'bullet';
  atualizarPeriodicidadeVisivel(tr);
}

// A periodicidade só faz sentido quando os juros são distribuídos ou reinvestidos periodicamente —
// num ativo Bullet não há pagamento periódico algum, então o seletor fica escondido.
function atualizarPeriodicidadeVisivel(tr) {
  const cashSweep = tr.querySelector('.f-cashSweep').checked;
  const fluxo = tr.querySelector('.f-fluxoPagamento').value;
  const mostrarNormal = !cashSweep && fluxo !== 'bullet';
  tr.querySelector('.periodicidade-normal').style.display = cashSweep ? 'none' : (mostrarNormal ? '' : 'none');
  tr.querySelector('.periodicidade-cashsweep').style.display = cashSweep ? '' : 'none';
}

function addLinha(prefill) {
  const frag = linhaTpl.content.cloneNode(true);
  const tr = frag.querySelector('tr');
  if (prefill) {
    tr.querySelector('.f-nome').value = prefill.nome || '';
    tr.querySelector('.f-tipoProdutoLabel').value = prefill.tipoProdutoLabel || 'Debênture';
    tr.querySelector('.f-tipo').value = prefill.tipo || 'fixo';
    tr.querySelector('.f-taxa').value = prefill.taxa ?? '';
    tr.querySelector('.f-vi').value = prefill.vi ?? '';
    tr.querySelector('.f-vencimento').value = prefill.vencimento || '';
    tr.querySelector('.f-isento').checked = prefill.isento !== false;
    tr.querySelector('.f-fluxoPagamento').value = prefill.reinvestir ? 'reinvestido' : (prefill.pagaCupomMensal ? 'distribuido' : 'bullet');
    tr.querySelector('.f-cashSweep').checked = !!prefill.cashSweep;
    tr.querySelector('.f-periodicidade').value = prefill.periodicidadeCupom || 'mensal';
    tr.querySelector('.f-periodicidadeJurosCS').value = prefill.periodicidadeJurosCashSweep || 'mensal';
    tr.querySelector('.f-periodicidadeAmortCS').value = prefill.periodicidadeAmortizacaoCashSweep || 'mensal';
  }
  tr.querySelector('.f-remover').addEventListener('click', () => { tr.remove(); atualizarTotal(); });
  if (prefill && prefill.valorMinimo) aplicarValorMinimo(tr, prefill.valorMinimo);
  tr.querySelector('.f-vi').addEventListener('input', atualizarTotal);

  // O <datalist> nativo só sugere opções que "casam" com o texto já digitado — depois de escolher um
  // produto, o campo fica com esse texto e, ao clicar de novo pra trocar, só ele mesmo aparece como
  // sugestão (some tudo mais). Pra sempre listar todas as opções do catálogo, limpamos o campo ao
  // focar (mostrando a lista cheia) e restauramos o valor anterior se o usuário sair sem escolher nada.
  const nomeInput = tr.querySelector('.f-nome');
  nomeInput.addEventListener('focus', () => {
    nomeInput.dataset.valorAnterior = nomeInput.value;
    nomeInput.value = '';
  });
  nomeInput.addEventListener('blur', () => {
    if (nomeInput.value.trim() === '' && nomeInput.dataset.valorAnterior) {
      nomeInput.value = nomeInput.dataset.valorAnterior;
    }
  });
  // Se o nome digitado/escolhido bate com um produto cadastrado no catálogo, preenche o resto da
  // linha sozinho — é o principal ganho de ter cadastrado o produto antes.
  nomeInput.addEventListener('change', () => {
    const produto = buscarProdutoCadastradoPorNome(nomeInput.value);
    if (produto) preencherLinhaComProduto(tr, produto);
    else aplicarValorMinimo(tr, null);
  });
  tr.querySelector('.f-tipoProdutoLabel').addEventListener('change', () => {
    atualizarIsentoAutomatico(tr);
    atualizarDatalistProdutos(tr);
  });
  tr.querySelector('.f-cashSweep').addEventListener('change', () => atualizarModoCashSweep(tr));
  tr.querySelector('.f-fluxoPagamento').addEventListener('change', () => atualizarPeriodicidadeVisivel(tr));

  // Cada linha precisa de um <datalist> com id próprio (não pode ser compartilhado entre linhas com
  // categorias diferentes selecionadas ao mesmo tempo).
  contadorLinhas++;
  const dlId = `produtos-dl-${contadorLinhas}`;
  const datalist = tr.querySelector('.f-produtos-datalist');
  datalist.id = dlId;
  tr.querySelector('.f-nome').setAttribute('list', dlId);

  ativosBody.appendChild(frag);
  atualizarIsentoAutomatico(tr);
  atualizarModoCashSweep(tr);
  atualizarDatalistProdutos(tr);
  atualizarTotal();
}

function atualizarTotal() {
  let total = 0;
  document.querySelectorAll('#ativosBody tr').forEach((tr) => {
    total += Number(tr.querySelector('.f-vi').value || 0);
  });
  totalInvestidoEl.textContent = fmtBRL(total);
}

document.getElementById('addAtivo').addEventListener('click', () => addLinha());

// Carrega premissas de mercado do BACEN — usado no aviso informativo do formulário principal E,
// em cache, como base do "benchmark contextual" ao lado do indexador na novação (ver
// nvHintBenchmark abaixo).
let premissasCache = null;
fetch('/api/premissas').then((r) => r.json()).then((p) => {
  const el = document.getElementById('premissasInfo');
  if (p.erro) { el.textContent = `Não foi possível consultar o BACEN agora: ${p.erro}`; return; }
  premissasCache = p;
  const anoAtual = new Date().getFullYear();
  el.textContent = `BACEN (ao vivo): Selic Meta ${p.selicMetaAtual.valorPctAA}% a.a. · IPCA acumulado 12m ${p.ipcaAcumulado12m.toFixed(2)}% · IPCA projetado ${anoAtual}: ${p.ipcaProjetadoPorAno[anoAtual] ?? '—'}% a.a. · CDI projetado ${anoAtual}: ${p.cdiProjetadoPorAno[anoAtual] ?? '—'}% a.a.`;
  document.querySelectorAll('.nv-hint-benchmark').forEach(nvAtualizarHintBenchmark);
}).catch(() => {
  document.getElementById('premissasInfo').textContent = 'Não foi possível consultar o BACEN agora.';
});

// Texto curto de contexto de mercado pro indexador selecionado (CDI/IPCA), usando as premissas do
// BACEN em cache. Retorna '' pros indexadores prefixados (fixo/fixoAA), onde não há o que comparar.
function nvTextoHintBenchmark(tipo) {
  if (!premissasCache) return '';
  const anoAtual = new Date().getFullYear();
  if (tipo === 'cdi' || tipo === 'pctcdi') {
    const cdi = premissasCache.cdiProjetadoPorAno[anoAtual];
    return cdi != null ? `CDI projetado ${anoAtual}: ${cdi}% a.a.` : '';
  }
  if (tipo === 'ipca') {
    const ipca = premissasCache.ipcaProjetadoPorAno[anoAtual];
    return ipca != null ? `IPCA projetado ${anoAtual}: ${ipca}% a.a.` : '';
  }
  return '';
}

// "Faltam N dias" / "Venceu há N dias" ao lado de qualquer campo de Vencimento Atual — delegado no
// document (em vez de um listener por bloco) porque os blocos de posição são criados dinamicamente
// (múltiplas debêntures) e este mesmo padrão cobre o campo único do formulário simples sem duplicar
// código. `input.nextElementSibling` é sempre o `.nv-prazo-restante` (ver markup em index.html e em
// nvCriarBlocoPosicao acima).
function nvAtualizarPrazoRestante(input) {
  const el = input.nextElementSibling;
  if (!el || !el.classList.contains('nv-prazo-restante')) return;
  if (!input.value) { el.style.display = 'none'; return; }
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = input.value.split('-').map(Number);
  const venc = new Date(ano, mes - 1, dia);
  const dias = Math.round((venc - hoje) / 86400000);
  el.textContent = dias >= 0 ? `faltam ${dias} dia${dias === 1 ? '' : 's'}` : `venceu há ${-dias} dia${-dias === 1 ? '' : 's'}`;
  el.style.display = '';
}
// Botão "ⓘ" ao lado do rótulo — clique/toque revela uma legenda curta abaixo do campo (em vez do
// title nativo, que só funciona com mouse-hover e é invisível em touch/tablet, ruim justamente pra
// quem está aprendendo a usar o formulário). Delegado no document porque os blocos de posição são
// criados dinamicamente. A legenda (`.nv-info-texto`) é sempre o próximo elemento depois do campo,
// dentro do mesmo <div> que envolve rótulo + campo — ver markup em index.html e nvCriarBlocoPosicao.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.nv-info-btn');
  if (!btn) return;
  const texto = btn.closest('div').querySelector('.nv-info-texto');
  if (texto) texto.classList.toggle('show');
});

['input', 'change'].forEach((evento) => document.addEventListener(evento, (e) => {
  if (e.target.classList && e.target.classList.contains('nv-prazo-restante-input')) nvAtualizarPrazoRestante(e.target);
}));

// Atualiza um elemento `.nv-hint-benchmark` (guarda o <select> de indexador irmão em
// data-select-selector) com o texto de contexto do indexador atualmente selecionado.
function nvAtualizarHintBenchmark(hintEl) {
  const select = hintEl.previousElementSibling;
  if (!select || select.tagName !== 'SELECT') return;
  const texto = nvTextoHintBenchmark(select.value);
  hintEl.textContent = texto;
  hintEl.style.display = texto ? '' : 'none';
}

// Assessor: "Vinícius Faria" ou "Outro" com campo livre
const assessorSelect = document.getElementById('assessorSelect');
const assessorOutroWrap = document.getElementById('assessorOutroWrap');
const assessorOutro = document.getElementById('assessorOutro');
assessorSelect.addEventListener('change', () => {
  assessorOutroWrap.style.display = assessorSelect.value === '__outro__' ? 'block' : 'none';
});
function obterAssessor() {
  if (assessorSelect.value === '__outro__') return assessorOutro.value.trim();
  return assessorSelect.value;
}

// Remove o destaque de erro assim que o usuário mexe no campo (não precisa clicar em "Gerar PDF" de novo pra ver que corrigiu).
document.addEventListener('input', (e) => e.target.classList && e.target.classList.remove('campo-erro'));
document.addEventListener('change', (e) => e.target.classList && e.target.classList.remove('campo-erro'));

function limparErros() {
  document.querySelectorAll('.campo-erro').forEach((el) => el.classList.remove('campo-erro'));
}

function marcarErro(el) {
  if (el) el.classList.add('campo-erro');
}

// Valida o formulário inteiro e destaca em vermelho os campos com problema. Retorna a lista de
// mensagens de erro encontradas (vazia = formulário válido).
function validarFormulario(dataBase) {
  const mensagens = [];
  const clienteEl = document.getElementById('cliente');
  const dataBaseEl = document.getElementById('dataBase');

  if (!clienteEl.value.trim()) {
    marcarErro(clienteEl);
    mensagens.push('Cliente é obrigatório.');
  }
  if (!dataBase) {
    marcarErro(dataBaseEl);
    mensagens.push('Data-base é obrigatória.');
  }
  if (!obterAssessor()) {
    marcarErro(assessorSelect.value === '__outro__' ? assessorOutro : assessorSelect);
    mensagens.push('Assessor é obrigatório.');
  }

  const linhas = [...document.querySelectorAll('#ativosBody tr')];
  if (linhas.length === 0) mensagens.push('Adicione ao menos um ativo.');

  linhas.forEach((tr, i) => {
    const n = i + 1;
    const nomeEl = tr.querySelector('.f-nome');
    const taxaEl = tr.querySelector('.f-taxa');
    const viEl = tr.querySelector('.f-vi');
    const vencimentoEl = tr.querySelector('.f-vencimento');

    if (!nomeEl.value.trim()) {
      marcarErro(nomeEl);
      mensagens.push(`Ativo ${n}: nome do produto é obrigatório.`);
    }
    if (!(Number(taxaEl.value) > 0)) {
      marcarErro(taxaEl);
      mensagens.push(`Ativo ${n}: taxa deve ser maior que 0.`);
    }
    if (!(Number(viEl.value) > 0)) {
      marcarErro(viEl);
      mensagens.push(`Ativo ${n}: valor investido deve ser maior que 0.`);
    } else if (tr.dataset.valorMinimo && Number(viEl.value) < Number(tr.dataset.valorMinimo)) {
      marcarErro(viEl);
      mensagens.push(`Ativo ${n}: valor investido abaixo do mínimo deste produto (${fmtBRL(Number(tr.dataset.valorMinimo))}).`);
    }
    if (!vencimentoEl.value) {
      marcarErro(vencimentoEl);
      mensagens.push(`Ativo ${n}: vencimento é obrigatório.`);
    } else if (dataBase && vencimentoEl.value <= dataBase) {
      marcarErro(vencimentoEl);
      mensagens.push(`Ativo ${n}: vencimento deve ser posterior à data-base.`);
    }
  });

  return mensagens;
}

document.getElementById('gerarBtn').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('resultado');
  resultadoEl.className = '';
  resultadoEl.style.display = 'none';
  limparErros();

  const cliente = document.getElementById('cliente').value.trim();
  const dataBase = document.getElementById('dataBase').value;
  const templateType = document.getElementById('templateType').value;
  const assessor = obterAssessor();

  const ativos = [...document.querySelectorAll('#ativosBody tr')].map((tr) => {
    const tipo = tr.querySelector('.f-tipo').value;
    const taxa = Number(tr.querySelector('.f-taxa').value || 0);
    const fluxo = tr.querySelector('.f-fluxoPagamento').value;
    const ativo = {
      nome: tr.querySelector('.f-nome').value.trim(),
      tipoProdutoLabel: tr.querySelector('.f-tipoProdutoLabel').value,
      tipo,
      vi: Number(tr.querySelector('.f-vi').value || 0),
      vencimento: tr.querySelector('.f-vencimento').value,
      isento: CATEGORIAS_SEMPRE_ISENTAS.includes(tr.querySelector('.f-tipoProdutoLabel').value) || tr.querySelector('.f-isento').checked,
      pagaCupomMensal: fluxo === 'distribuido' || fluxo === 'reinvestido',
      reinvestir: fluxo === 'reinvestido',
      cashSweep: tr.querySelector('.f-cashSweep').checked,
      periodicidadeCupom: tr.querySelector('.f-periodicidade').value,
      periodicidadeJurosCashSweep: tr.querySelector('.f-periodicidadeJurosCS').value,
      periodicidadeAmortizacaoCashSweep: tr.querySelector('.f-periodicidadeAmortCS').value,
    };
    if (tipo === 'fixo') ativo.taxaAM = taxa;
    else if (tipo === 'fixoAA') ativo.taxaAA = taxa;
    else if (tipo === 'pctcdi') ativo.percentualCDI = taxa;
    else ativo.spread = taxa; // cdi / ipca
    return ativo;
  });

  const errosValidacao = validarFormulario(dataBase);
  if (errosValidacao.length > 0) {
    resultadoEl.className = 'erro';
    resultadoEl.style.display = 'block';
    resultadoEl.textContent = errosValidacao.join(' ');
    return;
  }

  const totalInvestido = ativos.reduce((s, a) => s + a.vi, 0);

  document.getElementById('gerarBtn').disabled = true;
  document.getElementById('gerarBtn').textContent = 'Gerando (buscando dados ANBIMA/BACEN)…';

  try {
    const resp = await fetch('/api/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente, dataBase, templateType, assessor, ativos, valorTotal: totalInvestido }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao gerar o relatório.');

    resultadoEl.className = 'ok';
    resultadoEl.style.display = 'block';
    resultadoEl.innerHTML = `PDF gerado com sucesso — Valor Futuro Líquido: <b>${fmtBRL(Math.round(data.resumo.vfLiquidoTotal))}</b> ·
      Retorno: <b>~${data.resumo.retornoLiquidoPct.toFixed(1)}%</b> ·
      <b>≈${Math.round(data.resumo.pctDoCdi)}% do CDI projetado</b><br>
      <a class="btn" href="${data.downloadUrl}" download>Baixar PDF</a>`;
    carregarHistorico();
  } catch (err) {
    resultadoEl.className = 'erro';
    resultadoEl.style.display = 'block';
    resultadoEl.textContent = `Erro: ${err.message}`;
  } finally {
    document.getElementById('gerarBtn').disabled = false;
    document.getElementById('gerarBtn').textContent = 'Gerar PDF';
  }
});

// --- Calculadora Financeira (avulsa, fora do fluxo de simulação de carteira) ---

const CALC_MODOS = {
  vf: { showIndexador: true, showIsento: true, showVI: true, showVF: false, showValorBruto: false, showComparar: true, showTipoVF: false, vencimentoLabel: 'Vencimento' },
  vp: { showIndexador: true, showIsento: true, showVI: false, showVF: true, showValorBruto: false, showComparar: false, showTipoVF: true, vfLabel: 'Valor Futuro Desejado', vencimentoLabel: 'Vencimento' },
  rentabilidade: { showIndexador: false, showIsento: false, showVI: true, showVF: true, showValorBruto: false, showComparar: false, showTipoVF: false, vfLabel: 'Valor Futuro (conhecido)', vencimentoLabel: 'Data Final' },
  taxaEquivalente: { showIndexador: true, showIsento: true, showVI: false, showVF: false, showValorBruto: false, showComparar: false, showTipoVF: false, vencimentoLabel: 'Vencimento' },
  ir: { showIndexador: false, showIsento: true, showVI: false, showVF: false, showValorBruto: true, showComparar: false, showTipoVF: false, vencimentoLabel: 'Data Final (resgate)' },
  rendaPassiva: { custom: true },
};
let calcModoAtual = 'vf';
let calcComparando = false;
let calcUltimoContexto = null; // guarda o payload/label do último cálculo, pra montar o resumo de WhatsApp

(() => {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  const cfDataBase = document.getElementById('cf-dataBase');
  if (cfDataBase) cfDataBase.value = `${yyyy}-${mm}-${dd}`;
})();

function calcAtualizarCamposVisiveis() {
  const cfg = CALC_MODOS[calcModoAtual];
  document.getElementById('calculadoraForm').style.display = cfg.custom ? 'none' : '';
  document.getElementById('calc-rendaPassiva-painel').style.display = cfg.custom ? '' : 'none';
  if (cfg.custom) {
    document.getElementById('calc-resultado').className = 'calc-resultado';
    document.getElementById('calc-erro').style.display = 'none';
    return;
  }
  document.getElementById('calc-linha-indexador').style.display = cfg.showIndexador ? '' : 'none';
  document.getElementById('calc-campo-isento').style.display = cfg.showIsento ? '' : 'none';
  document.getElementById('calc-campo-vi').style.display = cfg.showVI ? '' : 'none';
  document.getElementById('calc-linha-vf').style.display = cfg.showVF ? '' : 'none';
  document.getElementById('calc-campo-tipoVF').style.display = cfg.showTipoVF ? '' : 'none';
  if (!cfg.showTipoVF) document.querySelector('input[name="cf-tipoValorFuturo"][value="bruto"]').checked = true;
  document.getElementById('calc-linha-valorBruto').style.display = cfg.showValorBruto ? '' : 'none';
  document.getElementById('calc-campo-comparar').style.display = cfg.showComparar ? '' : 'none';
  if (!cfg.showComparar && calcComparando) {
    calcComparando = false;
    document.getElementById('calc-linha-produtoB').style.display = 'none';
    document.getElementById('calc-toggleComparar').textContent = '⚖️ Comparar com outro produto';
  }
  document.getElementById('calc-label-indexador').textContent = calcModoAtual === 'vf' && calcComparando ? 'Indexador — Produto A' : 'Indexador';
  document.getElementById('calc-label-taxa').textContent = calcModoAtual === 'vf' && calcComparando ? 'Taxa — Produto A' : 'Taxa';
  document.getElementById('calc-label-vencimento').textContent = cfg.vencimentoLabel;
  if (cfg.vfLabel) document.getElementById('calc-label-vf').textContent = cfg.vfLabel;
  document.getElementById('calc-resultado').className = 'calc-resultado';
  document.getElementById('calc-erro').style.display = 'none';
}

document.getElementById('calc-toggleComparar').addEventListener('click', () => {
  calcComparando = !calcComparando;
  document.getElementById('calc-linha-produtoB').style.display = calcComparando ? '' : 'none';
  document.getElementById('calc-toggleComparar').textContent = calcComparando ? '✕ Cancelar comparação' : '⚖️ Comparar com outro produto';
  calcAtualizarCamposVisiveis();
});

document.querySelectorAll('.calc-modo-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.calc-modo-btn').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    calcModoAtual = btn.dataset.modo;
    calcAtualizarCamposVisiveis();
  });
});
calcAtualizarCamposVisiveis();

function calcFmtPct(v) {
  return v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// Rótulo curto "IPCA+8", "CDI+2", "110% CDI", "12,5% a.a." — usado tanto no resumo de WhatsApp quanto
// nos cabeçalhos do comparador de ativos.
function calcTaxaResumoLabel(tipo, taxa) {
  const t = Number(taxa).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (tipo === 'fixo') return `${t}% a.m.`;
  if (tipo === 'fixoAA') return `${t}% a.a.`;
  if (tipo === 'pctcdi') return `${t}% CDI`;
  return `${CSV_INDEXADOR_LABEL[tipo] || tipo}${t}`;
}

function calcFmtPrazo(dias) {
  if (dias == null) return '—';
  const anos = dias / 365;
  return anos >= 1 ? `≈${anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos (${dias} dias)` : `${dias} dias`;
}

// Formata uma data ISO "AAAA-MM-DD" (valor cru de <input type="date">) pra "DD/MM/AAAA" sem passar
// por new Date() — evita o deslocamento de fuso horário que faria a data "voltar" um dia.
function calcFmtDataDDMMAAAA(isoDate) {
  if (!isoDate) return '—';
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Botão "Copiar resumo" — aparece em todo resultado (qualquer modo), pra colar direto numa conversa
// com o cliente. Pedido explícito do time comercial: é a função mais usada depois de calcular.
// Nunca aparece sozinho como uma taxa "crua" — sempre junto do indexador contratado (ver
// calcTaxaResumoLabel), porque pra ativos indexados (CDI+/IPCA+/% CDI) essa taxa efetiva anual é só
// a leitura de HOJE das curvas de mercado, não um número fixo prometido ao cliente.
const CALC_DISCLAIMER_TEXTO = 'Considera taxas e curvas de mercado do dia desta simulação — não é garantia de rentabilidade futura.';

function calcDisclaimerHtml() {
  return `<p style="font-size:9.5px; color:#8a886f; margin-top:10px; font-style:italic;">⚠️ ${CALC_DISCLAIMER_TEXTO}</p>`;
}

function calcBotaoCopiarHtml() {
  return `${calcDisclaimerHtml()}<div style="margin-top:10px;"><button class="btn secondary small" type="button" id="calc-btn-copiar">📱 Copiar resumo</button></div>`;
}

function calcLigarBotaoCopiar() {
  const btn = document.getElementById('calc-btn-copiar');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const texto = calcMontarResumoWhatsapp();
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      const original = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = original; }, 1800);
    } catch (err) {
      alert('Não foi possível copiar automaticamente. Selecione o texto manualmente:\n\n' + texto);
    }
  });
}

// Monta o texto do resumo a partir do último cálculo feito (calcUltimoContexto) — formato enxuto,
// pronto pra colar no WhatsApp, sem jargão técnico de planilha.
function calcMontarResumoWhatsapp() {
  const ctx = calcUltimoContexto;
  if (!ctx) return '';
  const { modo, r, taxaLabel, prazoTexto, vencimentoTexto } = ctx;
  let texto = '';
  if (modo === 'vf') {
    texto = `Simulação\n\nValor: ${fmtBRL(ctx.valorInvestido)}\nIndexador: ${taxaLabel}\nPrazo: ${prazoTexto}\nVencimento: ${vencimentoTexto}\nValor líquido estimado: ${fmtBRL(r.vfLiquido)}`;
  } else if (modo === 'vp') {
    const alvoLabel = r.tipoValorFuturo === 'liquido' ? 'Valor futuro líquido (alvo)' : 'Valor futuro bruto (alvo)';
    const alvoValor = r.tipoValorFuturo === 'liquido' ? r.vfLiquidoResultante : r.vfBruto;
    texto = `Simulação\n\nValor a investir hoje: ${fmtBRL(r.viNecessario)}\nIndexador: ${taxaLabel}\nPrazo: ${prazoTexto}\nVencimento: ${vencimentoTexto}\n${alvoLabel}: ${fmtBRL(alvoValor)}\nValor futuro líquido estimado: ${fmtBRL(r.vfLiquidoResultante)}`;
  } else if (modo === 'rentabilidade') {
    texto = `Simulação\n\nValor investido: ${fmtBRL(ctx.valorInvestido)}\nValor futuro: ${fmtBRL(ctx.valorFuturo)}\nPrazo: ${prazoTexto}\nVencimento: ${vencimentoTexto}\nRentabilidade: ${calcFmtPct(r.rentabilidadePct)} (${fmtBRL(r.rentabilidadeRS)})\nTaxa anualizada implícita (equivalente hoje): ${calcFmtPct(r.taxaAnualizadaPct)} a.a.`;
  } else if (modo === 'taxaEquivalente') {
    const brutaLinha = r.isento ? `\nTaxa bruta equivalente (produto tributado): ${calcFmtPct(r.taxaBrutaEquivalentePct)} a.a.` : '';
    texto = `Simulação\n\nIndexador: ${taxaLabel}\nPrazo: ${prazoTexto}\nVencimento: ${vencimentoTexto}\nTaxa efetiva anual (equivalente hoje): ${calcFmtPct(r.iAnualPct)} a.a.\nEquivalente mensal: ${calcFmtPct(r.taxaMensalPct)} a.m.${brutaLinha}`;
  } else if (modo === 'ir') {
    texto = `Simulação de IR\n\nValor bruto: ${fmtBRL(r.valorBruto)}\nPrazo: ${prazoTexto}\nAlíquota de IR: ${r.isento ? 'Isento' : calcFmtPct(r.aliquotaPct)}\nIR: ${fmtBRL(r.ir)}\nValor líquido: ${fmtBRL(r.valorLiquido)}`;
  } else if (modo === 'comparar') {
    const { rA, rB, taxaLabelA, taxaLabelB } = ctx;
    const melhor = rA.vfLiquido >= rB.vfLiquido ? 'A' : 'B';
    texto = `Comparação de Ativos\n\nValor: ${fmtBRL(ctx.valorInvestido)}\nPrazo: ${prazoTexto}\nVencimento: ${vencimentoTexto}\n\nProduto A — Indexador: ${taxaLabelA} — líquido ${fmtBRL(rA.vfLiquido)}\nProduto B — Indexador: ${taxaLabelB} — líquido ${fmtBRL(rB.vfLiquido)}\n\nMelhor opção: Produto ${melhor}`;
  } else if (modo === 'rendaPassiva') {
    const linhas = r.resultados.map((item) => {
      const label = item.taxaLabel || calcFmtPct(item.iAnualPct);
      return `${item.nome || 'Ativo'} — Indexador: ${label} — Vencimento: ${item.vencimentoTexto || '—'} — ${fmtBRL(item.rendaMensalEquivalente)}/mês`;
    }).join('\n');
    texto = `Renda Passiva Líquida Estimada\n\n${linhas}\n\nTotal líquido: ${fmtBRL(r.rendaMensalTotal)}/mês (${fmtBRL(r.rendaAnualTotal)}/ano)\nValor total investido: ${fmtBRL(r.viTotal)}`;
  }
  if (!texto) return '';
  return `${texto}\n\n⚠️ ${CALC_DISCLAIMER_TEXTO}`;
}

function calcRenderResultado(modo, r) {
  const el = document.getElementById('calc-resultado');
  const isentoLabel = (isento) => (isento ? 'Isento' : null);
  if (modo === 'vf') {
    el.innerHTML = `
      <div class="cr-principal"><span class="lbl">Valor Futuro Líquido</span>${fmtBRL(r.vfLiquido)}</div>
      <div class="calc-grid">
        <div class="ci"><div class="lbl">Indexador Contratado</div><div class="val">${escapeHtmlCalc(calcUltimoContexto.taxaLabel)}</div></div>
        <div class="ci"><div class="lbl">Valor Futuro Bruto</div><div class="val">${fmtBRL(r.vfBruto)}</div></div>
        <div class="ci"><div class="lbl">Imposto de Renda</div><div class="val">${fmtBRL(r.ir)}</div></div>
        <div class="ci"><div class="lbl">Alíquota de IR</div><div class="val">${isentoLabel(calcUltimoContexto && calcUltimoContexto.isento) || calcFmtPct(r.aliquotaPct)}</div></div>
        <div class="ci"><div class="lbl">Taxa Efetiva Equivalente (hoje)</div><div class="val">${calcFmtPct(r.iAnualPct)} a.a.</div></div>
        <div class="ci"><div class="lbl">Rentabilidade Líquida</div><div class="val">${calcFmtPct(r.rentabilidadePct)}</div></div>
        <div class="ci"><div class="lbl">Rent. Anualizada</div><div class="val">${calcFmtPct(r.rentabilidadeAnualizadaPct)}</div></div>
        <div class="ci"><div class="lbl">% do CDI (no período)</div><div class="val">${r.pctCdi == null ? '—' : `≈${Math.round(r.pctCdi)}%`}</div></div>
        <div class="ci"><div class="lbl">Prazo</div><div class="val">${r.dias} dias (${r.du} du)</div></div>
      </div>${calcBotaoCopiarHtml()}`;
  } else if (modo === 'vp') {
    el.innerHTML = `
      <div class="cr-principal"><span class="lbl">Valor a Investir Hoje</span>${fmtBRL(r.viNecessario)}</div>
      <div class="calc-grid">
        <div class="ci"><div class="lbl">Indexador Contratado</div><div class="val">${escapeHtmlCalc(calcUltimoContexto.taxaLabel)}</div></div>
        <div class="ci"><div class="lbl">Valor Futuro Bruto${r.tipoValorFuturo === 'bruto' ? ' (alvo)' : ''}</div><div class="val">${fmtBRL(r.vfBruto)}</div></div>
        <div class="ci"><div class="lbl">Imposto de Renda</div><div class="val">${fmtBRL(r.ir)}</div></div>
        <div class="ci"><div class="lbl">Alíquota de IR</div><div class="val">${isentoLabel(calcUltimoContexto && calcUltimoContexto.isento) || calcFmtPct(r.aliquotaPct)}</div></div>
        <div class="ci"><div class="lbl">Valor Futuro Líquido${r.tipoValorFuturo === 'liquido' ? ' (alvo)' : ''}</div><div class="val">${fmtBRL(r.vfLiquidoResultante)}</div></div>
        <div class="ci"><div class="lbl">Taxa Efetiva Equivalente (hoje)</div><div class="val">${calcFmtPct(r.iAnualPct)} a.a.</div></div>
        <div class="ci"><div class="lbl">Prazo</div><div class="val">${r.dias} dias (${r.du} du)</div></div>
      </div>${calcBotaoCopiarHtml()}`;
  } else if (modo === 'rentabilidade') {
    el.innerHTML = `
      <div class="cr-principal"><span class="lbl">Rentabilidade</span>${calcFmtPct(r.rentabilidadePct)} <span style="font-size:14px; color:#5a5847; font-weight:600;">(${fmtBRL(r.rentabilidadeRS)})</span></div>
      <div class="calc-grid">
        <div class="ci"><div class="lbl">Taxa Anualizada Implícita (equivalente hoje)</div><div class="val">${calcFmtPct(r.taxaAnualizadaPct)} a.a.</div></div>
        <div class="ci"><div class="lbl">% do CDI (no período)</div><div class="val">${r.pctCdi == null ? '—' : `≈${Math.round(r.pctCdi)}%`}</div></div>
        <div class="ci"><div class="lbl">CDI de Referência</div><div class="val">${calcFmtPct(r.cdiRefPct)} a.a.</div></div>
        <div class="ci"><div class="lbl">Vencimento</div><div class="val">${calcUltimoContexto.vencimentoTexto}</div></div>
        <div class="ci"><div class="lbl">Prazo</div><div class="val">${r.dias} dias (${r.du} du)</div></div>
      </div>${calcBotaoCopiarHtml()}`;
  } else if (modo === 'taxaEquivalente') {
    const brutaHtml = r.isento
      ? `<div class="ci"><div class="lbl">Taxa Bruta Equivalente</div><div class="val">${calcFmtPct(r.taxaBrutaEquivalentePct)} a.a.</div></div>`
      : '';
    el.innerHTML = `
      <div class="cr-principal"><span class="lbl">Taxa Efetiva Anual (equivalente hoje)</span>${calcFmtPct(r.iAnualPct)} a.a.</div>
      <div class="calc-grid">
        <div class="ci"><div class="lbl">Indexador Contratado</div><div class="val">${escapeHtmlCalc(calcUltimoContexto.taxaLabel)}</div></div>
        <div class="ci"><div class="lbl">Equivalente Mensal</div><div class="val">${calcFmtPct(r.taxaMensalPct)} a.m.</div></div>
        <div class="ci"><div class="lbl">CDI de Referência (no prazo)</div><div class="val">${calcFmtPct(r.cdiRefPct)} a.a.</div></div>
        <div class="ci"><div class="lbl">Equivale a % do CDI</div><div class="val">${r.pctCdiEquivalente == null ? '—' : `≈${Math.round(r.pctCdiEquivalente)}%`}</div></div>
        <div class="ci"><div class="lbl">Vencimento</div><div class="val">${calcUltimoContexto.vencimentoTexto}</div></div>
        <div class="ci"><div class="lbl">Prazo</div><div class="val">${r.du} dias úteis</div></div>
        ${brutaHtml}
      </div>${r.isento ? '<p style="font-size:10.5px; color:#5a5847; margin-top:10px;">Taxa bruta equivalente: o que um produto TRIBUTADO precisaria pagar, antes do IR, para entregar o mesmo retorno líquido que este produto isento.</p>' : ''}${calcBotaoCopiarHtml()}`;
  } else if (modo === 'ir') {
    el.innerHTML = `
      <div class="cr-principal"><span class="lbl">Valor Líquido</span>${fmtBRL(r.valorLiquido)}</div>
      <div class="calc-grid">
        <div class="ci"><div class="lbl">Valor Bruto</div><div class="val">${fmtBRL(r.valorBruto)}</div></div>
        <div class="ci"><div class="lbl">Alíquota de IR</div><div class="val">${r.isento ? 'Isento' : calcFmtPct(r.aliquotaPct)}</div></div>
        <div class="ci"><div class="lbl">Imposto de Renda</div><div class="val">${fmtBRL(r.ir)}</div></div>
        <div class="ci"><div class="lbl">Data Final</div><div class="val">${calcUltimoContexto.vencimentoTexto}</div></div>
        <div class="ci"><div class="lbl">Prazo</div><div class="val">${r.dias} dias</div></div>
      </div>${calcBotaoCopiarHtml()}`;
  }
  el.classList.add('show');
  calcLigarBotaoCopiar();
}

// Comparador de ativos: mesmo Valor Investido e mesmo prazo pros dois produtos — só o
// indexador/taxa/isenção muda — pra comparação ser de fato "maçã com maçã".
function calcRenderComparacao(rA, rB, taxaLabelA, taxaLabelB) {
  const el = document.getElementById('calc-resultado');
  const aVence = rA.vfLiquido >= rB.vfLiquido;
  const linhaProduto = (r, label, venceu) => `
    <div class="calc-comparar-col${venceu ? ' venceu' : ''}">
      ${venceu ? '<div class="calc-comparar-selo">★ Melhor opção</div>' : ''}
      <div class="calc-comparar-titulo">${escapeHtmlCalc(label)}</div>
      <div class="cr-principal" style="font-size:19px;"><span class="lbl">Valor Futuro Líquido</span>${fmtBRL(r.vfLiquido)}</div>
      <div class="calc-grid">
        <div class="ci"><div class="lbl">Valor Futuro Bruto</div><div class="val">${fmtBRL(r.vfBruto)}</div></div>
        <div class="ci"><div class="lbl">Imposto de Renda</div><div class="val">${fmtBRL(r.ir)}</div></div>
        <div class="ci"><div class="lbl">Rentabilidade Líquida</div><div class="val">${calcFmtPct(r.rentabilidadePct)}</div></div>
        <div class="ci"><div class="lbl">% do CDI</div><div class="val">${r.pctCdi == null ? '—' : `≈${Math.round(r.pctCdi)}%`}</div></div>
      </div>
    </div>`;
  const diferenca = Math.abs(rA.vfLiquido - rB.vfLiquido);
  const ctx = calcUltimoContexto;
  el.innerHTML = `
    <p style="text-align:center; font-size:10.5px; color:#8a886f; margin-bottom:10px;">${fmtBRL(ctx.valorInvestido)} investidos · prazo ${ctx.prazoTexto} · vencimento ${ctx.vencimentoTexto}</p>
    <div class="calc-comparar-grid">
      ${linhaProduto(rA, taxaLabelA, aVence)}
      <div class="calc-comparar-vs">VS</div>
      ${linhaProduto(rB, taxaLabelB, !aVence)}
    </div>
    <p style="text-align:center; font-size:11.5px; color:#5a5847; margin-top:12px;">Diferença: <b>${fmtBRL(diferenca)}</b> líquidos a favor do Produto ${aVence ? 'A' : 'B'}</p>
    ${calcBotaoCopiarHtml()}`;
  el.classList.add('show');
  calcLigarBotaoCopiar();
}

function escapeHtmlCalc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Renda Passiva: lista dinâmica de ativos (1 ou vários), cada um com pagamento periódico de
// juros — soma tudo numa renda mensal combinada. Diferente dos outros modos (um único formulário
// fixo), aqui a UI é uma lista de cards que crescem/encolhem, então tem lógica própria de
// adicionar/remover em vez de só alternar a visibilidade de campos fixos. ---
function calcHojeISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

function calcCriarCardRendaPassiva() {
  const div = document.createElement('div');
  div.className = 'calc-rp-card';
  div.innerHTML = `
    <div class="calc-rp-topo">
      <span class="calc-rp-titulo">Ativo</span>
      <button class="btn secondary small calc-rp-remover" type="button">Remover</button>
    </div>
    <div class="grid3">
      <div><label>Nome (opcional)</label><input type="text" class="calc-rp-nome" placeholder="CRI Shopping X"></div>
      <div><label>Indexador</label><select class="calc-rp-tipo">
        <option value="fixo">Prefixado (a.m.)</option>
        <option value="fixoAA">Prefixado (a.a.)</option>
        <option value="cdi">CDI +</option>
        <option value="ipca" selected>IPCA +</option>
        <option value="pctcdi">% CDI</option>
      </select></div>
      <div><label>Taxa</label><input type="number" step="0.01" min="0" class="calc-rp-taxa" placeholder="8"></div>
    </div>
    <div class="grid3" style="margin-top:10px;">
      <div><label>Data-base</label><input type="date" class="calc-rp-dataBase" value="${calcHojeISO()}"></div>
      <div><label>Vencimento</label><input type="date" class="calc-rp-vencimento"></div>
      <div><label>Valor Investido</label><input type="number" step="0.01" min="0" class="calc-rp-valorInvestido" placeholder="50000"></div>
    </div>
    <div class="grid3" style="margin-top:10px;">
      <div><label>Periodicidade do Cupom</label><select class="calc-rp-periodicidade">
        <option value="mensal">Mensal</option>
        <option value="semestral">Semestral</option>
      </select></div>
      <div class="field-inline" style="align-self:end; margin-bottom:8px;"><input type="checkbox" class="calc-rp-isento"> Isento de IR</div>
    </div>`;
  div.querySelector('.calc-rp-remover').addEventListener('click', () => {
    const lista = document.getElementById('calc-rp-lista');
    if (lista.children.length > 1) div.remove();
  });
  return div;
}

document.getElementById('calc-rp-lista').appendChild(calcCriarCardRendaPassiva());
document.getElementById('calc-rp-adicionar').addEventListener('click', () => {
  document.getElementById('calc-rp-lista').appendChild(calcCriarCardRendaPassiva());
});

function calcRenderRendaPassiva(resultado) {
  const el = document.getElementById('calc-resultado');
  const itens = resultado.resultados.map((r) => {
    const periodicidadeLabel = r.periodicidadeCupom === 'semestral' ? 'semestral — convertido pra base mensal' : 'mensal';
    // Nunca mostra só a taxa efetiva "crua" (ex.: "13,68% a.a.") — pra ativos indexados (CDI+/IPCA+/%
    // CDI) esse número é só a leitura de hoje das curvas, não o que está contratado. O indexador
    // (ex.: "IPCA+7,00%") é o que de fato foi informado e o que continua valendo amanhã.
    const label = r.taxaLabel || calcFmtPct(r.iAnualPct);
    return `<div class="calc-rp-resultado-item">
      <div class="nome">${escapeHtmlCalc(r.nome || 'Ativo')}</div>
      <div class="sub">${fmtBRL(r.vi)} investidos · Indexador: ${escapeHtmlCalc(label)} · vence ${r.vencimentoTexto || '—'} · pagamento ${periodicidadeLabel}${r.isento ? ' · isento' : ''}</div>
      <div class="valor">${fmtBRL(r.rendaMensalEquivalente)} / mês</div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="cr-principal"><span class="lbl">Renda Mensal Líquida Total Estimada</span>${fmtBRL(resultado.rendaMensalTotal)}</div>
    <div class="calc-grid" style="grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); margin-bottom:14px;">
      <div class="ci"><div class="lbl">Renda Anual Líquida Estimada</div><div class="val">${fmtBRL(resultado.rendaAnualTotal)}</div></div>
      <div class="ci"><div class="lbl">Valor Total Investido</div><div class="val">${fmtBRL(resultado.viTotal)}</div></div>
      <div class="ci"><div class="lbl">Rendimento Mensal Líquido (% do total)</div><div class="val">${resultado.rendimentoMensalPct == null ? '—' : calcFmtPct(resultado.rendimentoMensalPct)}</div></div>
    </div>
    <div class="calc-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px,1fr));">${itens}</div>
    ${calcBotaoCopiarHtml()}`;
  el.classList.add('show');
  calcLigarBotaoCopiar();
}

document.getElementById('calc-rp-calcular').addEventListener('click', async () => {
  const erroEl = document.getElementById('calc-erro');
  erroEl.style.display = 'none';
  document.getElementById('calc-resultado').classList.remove('show');

  const cards = Array.from(document.querySelectorAll('#calc-rp-lista .calc-rp-card'));
  const ativos = cards.map((card) => ({
    nome: card.querySelector('.calc-rp-nome').value.trim(),
    tipo: card.querySelector('.calc-rp-tipo').value,
    taxa: Number(card.querySelector('.calc-rp-taxa').value || 0),
    dataBase: card.querySelector('.calc-rp-dataBase').value,
    vencimento: card.querySelector('.calc-rp-vencimento').value,
    valorInvestido: Number(card.querySelector('.calc-rp-valorInvestido').value || 0),
    periodicidadeCupom: card.querySelector('.calc-rp-periodicidade').value,
    isento: card.querySelector('.calc-rp-isento').checked,
  }));

  if (ativos.some((a) => a.taxa < 0 || a.valorInvestido < 0)) {
    erroEl.textContent = 'Taxa e valores não podem ser negativos.';
    erroEl.style.display = 'block';
    return;
  }

  try {
    const resp = await fetch('/api/calculadora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'rendaPassiva', ativos }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao calcular.');
    // O backend devolve só o iAnualPct (número já convertido) — junta de volta o indexador/taxa
    // originalmente digitados (calcTaxaResumoLabel) e o vencimento, pra nunca exibir só a taxa
    // efetiva "crua" como se fosse um número fixo prometido ao cliente.
    data.resultado.resultados = data.resultado.resultados.map((item, i) => ({
      ...item,
      taxaLabel: calcTaxaResumoLabel(ativos[i].tipo, ativos[i].taxa),
      vencimentoTexto: calcFmtDataDDMMAAAA(ativos[i].vencimento),
    }));
    calcUltimoContexto = { modo: 'rendaPassiva', r: data.resultado };
    calcRenderRendaPassiva(data.resultado);
  } catch (err) {
    erroEl.textContent = `Erro: ${err.message}`;
    erroEl.style.display = 'block';
  }
});

document.getElementById('calculadoraForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById('calc-erro');
  erroEl.style.display = 'none';
  document.getElementById('calc-resultado').classList.remove('show');

  const camposNumericos = ['cf-taxa', 'cf-valorInvestido', 'cf-valorFuturo', 'cf-valorBruto', 'cf-taxaB'];
  const negativos = camposNumericos.filter((id) => Number(document.getElementById(id).value) < 0);
  if (negativos.length) {
    erroEl.textContent = 'Taxa e valores não podem ser negativos.';
    erroEl.style.display = 'block';
    return;
  }

  const dataBase = document.getElementById('cf-dataBase').value;
  const vencimento = document.getElementById('cf-vencimento').value;
  const valorInvestido = Number(document.getElementById('cf-valorInvestido').value || 0);
  const prazoTexto = (dataBase && vencimento) ? calcFmtPrazo(Math.round((new Date(vencimento) - new Date(dataBase)) / 86400000)) : '—';
  const vencimentoTexto = calcFmtDataDDMMAAAA(vencimento);

  try {
    if (calcModoAtual === 'vf' && calcComparando) {
      const base = {
        modo: 'vf', dataBase, vencimento, valorInvestido,
        valorFuturoDesejado: 0, valorFuturo: 0,
      };
      const payloadA = { ...base, tipo: document.getElementById('cf-tipo').value, taxa: Number(document.getElementById('cf-taxa').value || 0), isento: document.getElementById('cf-isento').checked };
      const payloadB = { ...base, tipo: document.getElementById('cf-tipoB').value, taxa: Number(document.getElementById('cf-taxaB').value || 0), isento: document.getElementById('cf-isentoB').checked };
      const [respA, respB] = await Promise.all([
        fetch('/api/calculadora', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadA) }),
        fetch('/api/calculadora', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadB) }),
      ]);
      const dataA = await respA.json();
      const dataB = await respB.json();
      if (!respA.ok) throw new Error(`Produto A: ${dataA.erro || 'Falha ao calcular.'}`);
      if (!respB.ok) throw new Error(`Produto B: ${dataB.erro || 'Falha ao calcular.'}`);
      const taxaLabelA = calcTaxaResumoLabel(payloadA.tipo, payloadA.taxa);
      const taxaLabelB = calcTaxaResumoLabel(payloadB.tipo, payloadB.taxa);
      calcUltimoContexto = { modo: 'comparar', rA: dataA.resultado, rB: dataB.resultado, taxaLabelA, taxaLabelB, valorInvestido, prazoTexto, vencimentoTexto };
      calcRenderComparacao(dataA.resultado, dataB.resultado, taxaLabelA, taxaLabelB);
      return;
    }

    const payload = {
      modo: calcModoAtual,
      tipo: document.getElementById('cf-tipo').value,
      taxa: Number(document.getElementById('cf-taxa').value || 0),
      dataBase,
      vencimento,
      isento: document.getElementById('cf-isento').checked,
      valorInvestido,
      valorFuturoDesejado: Number(document.getElementById('cf-valorFuturo').value || 0),
      valorFuturo: Number(document.getElementById('cf-valorFuturo').value || 0),
      valorBruto: Number(document.getElementById('cf-valorBruto').value || 0),
      tipoValorFuturo: (document.querySelector('input[name="cf-tipoValorFuturo"]:checked') || {}).value || 'bruto',
    };

    const resp = await fetch('/api/calculadora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao calcular.');

    calcUltimoContexto = {
      modo: calcModoAtual,
      r: data.resultado,
      isento: payload.isento,
      taxaLabel: calcModoAtual === 'rentabilidade' ? null : calcTaxaResumoLabel(payload.tipo, payload.taxa),
      prazoTexto,
      vencimentoTexto,
      valorInvestido,
      valorFuturo: payload.valorFuturo,
    };
    calcRenderResultado(calcModoAtual, data.resultado);
  } catch (err) {
    erroEl.textContent = `Erro: ${err.message}`;
    erroEl.style.display = 'block';
  }
});

document.getElementById('toggleCalculadora').addEventListener('click', () => {
  const card = document.getElementById('calculadoraCard');
  const abrindo = card.style.display === 'none';
  card.style.display = abrindo ? 'block' : 'none';
  if (abrindo) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  nvAtualizarBotaoAtivoHeader();
});
document.getElementById('fecharCalculadora').addEventListener('click', () => {
  document.getElementById('calculadoraCard').style.display = 'none';
  nvAtualizarBotaoAtivoHeader();
});

// --- Novação de Debênture ---

function fmtBRL2(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

document.getElementById('toggleNovacao').addEventListener('click', () => {
  const card = document.getElementById('novacaoCard');
  const abrindo = card.style.display === 'none';
  card.style.display = abrindo ? 'block' : 'none';
  if (abrindo) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nvVerificarRascunho();
  }
  nvAtualizarBotaoAtivoHeader();
});
document.getElementById('fecharNovacao').addEventListener('click', () => {
  document.getElementById('novacaoCard').style.display = 'none';
  nvAtualizarBotaoAtivoHeader();
});

// Data de hoje (fuso local) em 'AAAA-MM-DD' — usada pra pré-preencher "Data da Assinatura" (ver
// abaixo e nvCriarBlocoPosicao): esse campo só importa quando o modo "Dia seguinte à Assinatura"
// está selecionado, mas o caso comum É assinar no mesmo dia, então já fica pronto sem exigir que o
// assessor abra o seletor de data pra digitar uma data que, na prática, quase sempre é hoje mesmo.
function nvDataHojeISO() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

(() => {
  const nvDataAssinatura = document.getElementById('nv-dataAssinatura');
  if (nvDataAssinatura) nvDataAssinatura.value = nvDataHojeISO();
})();

document.getElementById('nv-modoNovacao').addEventListener('change', function () {
  document.getElementById('nv-campoAssinatura').style.display = this.value === 'assinatura' ? '' : 'none';
});

// "Já foi novada antes" não é mais um checkbox — é inferido comparando as duas datas do formulário:
// Aplicação Original (etapa 1) e Válida desde (etapa 2, a condição atual). Se o assessor nunca mexer
// na segunda, ela some junto com a primeira — cobre o caso comum (nunca novada) sem exigir nenhuma
// ação; só precisa editar "Válida desde" quando a posição realmente já passou por uma novação antes
// desta. Ver nvColetarPayload (deriva jaFoiNovadaAntes) e o mesmo padrão em nvCriarBlocoPosicao.
document.getElementById('nv-dataAplicacaoOriginal').addEventListener('change', function () {
  const campoAtual = document.getElementById('nv-dataAplicacao');
  if (!campoAtual.value) campoAtual.value = this.value;
});

// Histórico de "Aplicação Atual" — evita recadastrar os dados da debênture do cliente toda vez que
// for comparar novação vs. resgate pro mesmo ativo.
let aplicacoesSalvas = [];

async function nvCarregarAplicacoesSalvas() {
  const select = document.getElementById('nv-aplicacaoSalva');
  const selecionadoAntes = select.value;
  try {
    const resp = await fetch('/api/novacao/aplicacoes');
    const data = await resp.json();
    aplicacoesSalvas = data.aplicacoes || [];
  } catch (err) {
    aplicacoesSalvas = [];
  }
  select.innerHTML = '<option value="">Carregar aplicação salva...</option>'
    + aplicacoesSalvas.map((a) => `<option value="${a.id}">${a.nome} — ${fmtBRL(a.valorAtualPosicao || a.valorInvestido)} (vence ${a.vencimentoAtual.split('-').reverse().join('/')})</option>`).join('');
  select.value = selecionadoAntes;
}
nvCarregarAplicacoesSalvas();

document.getElementById('nv-aplicacaoSalva').addEventListener('change', function () {
  const aplicacao = aplicacoesSalvas.find((a) => a.id === this.value);
  document.getElementById('nv-removerAplicacao').style.display = aplicacao ? '' : 'none';
  if (!aplicacao) return;
  document.getElementById('nv-nomeAtual').value = aplicacao.nome;
  document.getElementById('nv-valorAtualPosicao').value = aplicacao.valorAtualPosicao || '';
  document.getElementById('nv-valorInvestido').value = aplicacao.valorInvestido;
  document.getElementById('nv-dataAplicacao').value = aplicacao.dataAplicacao;
  document.getElementById('nv-dataAplicacaoOriginal').value = aplicacao.dataAplicacaoOriginal || aplicacao.dataAplicacao;
  document.getElementById('nv-tipoAtual').value = aplicacao.tipo;
  document.getElementById('nv-taxaAtual').value = aplicacao.taxa;
  document.getElementById('nv-vencimentoAtual').value = aplicacao.vencimentoAtual;
  document.getElementById('nv-isentoAtual').checked = !!aplicacao.isentoAtual;
});

document.getElementById('nv-salvarAplicacao').addEventListener('click', async () => {
  const payload = {
    nome: document.getElementById('nv-nomeAtual').value.trim(),
    valorAtualPosicao: Number(document.getElementById('nv-valorAtualPosicao').value || 0),
    valorInvestido: Number(document.getElementById('nv-valorInvestido').value || 0),
    dataAplicacao: document.getElementById('nv-dataAplicacao').value,
    dataAplicacaoOriginal: document.getElementById('nv-dataAplicacaoOriginal').value,
    tipo: document.getElementById('nv-tipoAtual').value,
    taxa: Number(document.getElementById('nv-taxaAtual').value || 0),
    vencimentoAtual: document.getElementById('nv-vencimentoAtual').value,
    isentoAtual: document.getElementById('nv-isentoAtual').checked,
  };
  if (!payload.nome) {
    alert('Preencha o "Nome do ativo" antes de salvar, pra reconhecer essa aplicação depois.');
    return;
  }
  try {
    const resp = await fetch('/api/novacao/aplicacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao salvar.');
    await nvCarregarAplicacoesSalvas();
    document.getElementById('nv-aplicacaoSalva').value = data.aplicacao.id;
    document.getElementById('nv-removerAplicacao').style.display = '';
  } catch (err) {
    alert(`Não foi possível salvar: ${err.message}`);
  }
});

document.getElementById('nv-removerAplicacao').addEventListener('click', async () => {
  const select = document.getElementById('nv-aplicacaoSalva');
  if (!select.value) return;
  const confirmado = await confirmarAcao('Remover esta aplicação salva? Isso não afeta nenhum relatório já gerado.');
  if (!confirmado) return;
  try {
    await fetch(`/api/novacao/aplicacoes/${encodeURIComponent(select.value)}`, { method: 'DELETE' });
    await nvCarregarAplicacoesSalvas();
    document.getElementById('nv-removerAplicacao').style.display = 'none';
  } catch (err) {
    alert(`Não foi possível remover: ${err.message}`);
  }
});

function nvAtualizarModoReaplicacao() {
  const ativo = document.getElementById('nv-cashSweepReaplicacao').checked;
  const fluxoSelect = document.getElementById('nv-fluxoReaplicacao');
  fluxoSelect.disabled = ativo;
  if (ativo) fluxoSelect.value = 'bullet';
  document.getElementById('nv-periodicidadeCashSweepReaplicacaoWrap').style.display = ativo ? '' : 'none';
  document.getElementById('nv-periodicidadeReaplicacaoWrap').style.display = ativo ? 'none' : '';
}
document.getElementById('nv-cashSweepReaplicacao').addEventListener('change', nvAtualizarModoReaplicacao);

// Modo simplificado: dispensa o produto de reaplicação inteiramente — a Novação passa a ser
// comparada só contra "deixar o capital parado a 90% do CDI" (ver lib/novacao.js).
document.getElementById('nv-modoSimplificado').addEventListener('change', function () {
  document.getElementById('nv-secaoReaplicacao').style.display = this.checked ? 'none' : '';
});

// Atalho pra quando o cliente for reaplicar na mesma debênture da novação (em vez de resgatar pra
// outro produto) — copia nome/indexador/taxa/vencimento do Cenário 2 pro Cenário 1, sem mexer em
// isenção/fluxo de pagamento (ficam do jeito que o assessor já tiver configurado).
document.getElementById('nv-copiarNovacao').addEventListener('click', () => {
  const primeira = nvColetarPrimeiraSugerida();
  document.getElementById('nv-nomeReaplicacao').value = primeira.nomeAtivoNovacao;
  document.getElementById('nv-tipoReaplicacao').value = primeira.tipoNovacao;
  document.getElementById('nv-taxaReaplicacao').value = primeira.taxaNovacao || '';
  document.getElementById('nv-vencimentoReaplicacao').value = primeira.vencimentoNovacao;
});

// Filtro por Tipo + seleção de um produto já cadastrado no Catálogo, pra preencher o Produto de
// Reaplicação sem digitar tudo de novo — usa o mesmo `produtosRegistrados` já carregado pro
// autocomplete da tabela de ativos principal.
document.getElementById('nv-reaplicacaoFiltroTipo').innerHTML = 'Todos os tipos,CRA,CRI,Debênture,Operações Estruturadas,Precatório Estadual,Precatório Federal,Precatório Municipal,Recebível Judicial'
  .split(',').map((c, i) => `<option value="${i === 0 ? '' : c}">${c}</option>`).join('');

function nvAtualizarFiltroProdutoReaplicacao() {
  const tipoSelecionado = document.getElementById('nv-reaplicacaoFiltroTipo').value;
  const select = document.getElementById('nv-reaplicacaoFiltroProduto');
  const candidatos = produtosRegistrados
    .filter((p) => !tipoSelecionado || p.categoria === tipoSelecionado)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  select.innerHTML = '<option value="">Selecionar (opcional)...</option>'
    + candidatos.map((p) => `<option value="${p.id}">${p.nome} — ${p.categoria} (${p.taxa}${p.tipo === 'pctcdi' ? '% do CDI' : p.tipo === 'cdi' ? '% CDI+' : p.tipo === 'ipca' ? '% IPCA+' : '% a.a.'})</option>`).join('');
}
document.getElementById('nv-reaplicacaoFiltroTipo').addEventListener('change', nvAtualizarFiltroProdutoReaplicacao);

document.getElementById('nv-reaplicacaoFiltroProduto').addEventListener('change', function () {
  const produto = produtosRegistrados.find((p) => p.id === this.value);
  if (!produto) return;
  document.getElementById('nv-nomeReaplicacao').value = produto.nome;
  document.getElementById('nv-tipoReaplicacao').value = produto.tipo;
  document.getElementById('nv-taxaReaplicacao').value = produto.taxa;
  if (produto.vencimento) document.getElementById('nv-vencimentoReaplicacao').value = produto.vencimento;
  document.getElementById('nv-isentoReaplicacao').checked = !!produto.isento;
  document.getElementById('nv-fluxoReaplicacao').value = produto.fluxoPagamento || 'bullet';
  document.getElementById('nv-periodicidadeReaplicacao').value = produto.periodicidadeCupom || 'mensal';
  document.getElementById('nv-cashSweepReaplicacao').checked = !!produto.cashSweep;
  document.getElementById('nv-periodicidadeJurosCSReaplicacao').value = produto.periodicidadeJurosCashSweep || 'mensal';
  document.getElementById('nv-periodicidadeAmortCSReaplicacao').value = produto.periodicidadeAmortizacaoCashSweep || 'mensal';
  nvAtualizarModoReaplicacao();
});

function nvColetarPayload() {
  const modoSimplificado = document.getElementById('nv-modoSimplificado').checked;
  const dataAplicacao = document.getElementById('nv-dataAplicacao').value;
  const dataAplicacaoOriginal = document.getElementById('nv-dataAplicacaoOriginal').value;
  return {
    valorInvestido: Number(document.getElementById('nv-valorInvestido').value || 0),
    valorAtualPosicao: Number(document.getElementById('nv-valorAtualPosicao').value || 0),
    dataAplicacao,
    tipoAtual: document.getElementById('nv-tipoAtual').value,
    taxaAtual: Number(document.getElementById('nv-taxaAtual').value || 0),
    vencimentoAtual: document.getElementById('nv-vencimentoAtual').value,
    isentoAtual: document.getElementById('nv-isentoAtual').checked,
    // "Já foi novada antes" não é mais escolhido pelo assessor — é verdade sempre que a "Válida
    // desde" (etapa 2) for uma data diferente da Aplicação Original (etapa 1). Ver comentário no
    // listener acima.
    jaFoiNovadaAntes: !!(dataAplicacaoOriginal && dataAplicacao && dataAplicacaoOriginal !== dataAplicacao),
    dataAplicacaoOriginal,
    modoNovacao: document.getElementById('nv-modoNovacao').value,
    dataAssinatura: document.getElementById('nv-dataAssinatura').value,
    modoSimplificado,
    tipoReaplicacao: document.getElementById('nv-tipoReaplicacao').value,
    taxaReaplicacao: Number(document.getElementById('nv-taxaReaplicacao').value || 0),
    vencimentoReaplicacao: document.getElementById('nv-vencimentoReaplicacao').value,
    isentoReaplicacao: document.getElementById('nv-isentoReaplicacao').checked,
    fluxoReaplicacao: document.getElementById('nv-fluxoReaplicacao').value,
    periodicidadeReaplicacao: document.getElementById('nv-periodicidadeReaplicacao').value,
    cashSweepReaplicacao: document.getElementById('nv-cashSweepReaplicacao').checked,
    periodicidadeJurosCSReaplicacao: document.getElementById('nv-periodicidadeJurosCSReaplicacao').value,
    periodicidadeAmortCSReaplicacao: document.getElementById('nv-periodicidadeAmortCSReaplicacao').value,
    ...nvColetarPrimeiraSugerida(),
  };
}

// A "Debênture Sugerida" do formulário padrão virou uma lista repetível (ver nvCriarBlocoSugerida,
// compartilhada com o modo de várias debêntures) — este helper lê a PRIMEIRA sugerida da lista, pra
// manter compatibilidade com o caminho antigo de 1 sugerida só (modo completo, ou modo simplificado
// com só uma opção): /api/novacao e /api/novacao/gerar continuam recebendo os campos tipoNovacao/
// taxaNovacao/vencimentoNovacao/nomeAtivoNovacao no formato de sempre.
function nvColetarSugeridasUnicas() {
  return Array.from(document.querySelectorAll('#nv-sugeridasLista .nov-sugerida-card')).map((div) => ({
    nomeAtivoNovacao: div.querySelector('.nv-pos-nomeNovacao').value.trim(),
    tipoNovacao: div.querySelector('.nv-pos-tipoNovacao').value,
    taxaNovacao: Number(div.querySelector('.nv-pos-taxaNovacao').value || 0),
    vencimentoNovacao: div.querySelector('.nv-pos-vencimentoNovacao').value,
  }));
}

function nvColetarPrimeiraSugerida() {
  const sugeridas = nvColetarSugeridasUnicas();
  return sugeridas[0] || { nomeAtivoNovacao: '', tipoNovacao: 'fixoAA', taxaNovacao: 0, vencimentoNovacao: '' };
}

let nvUltimoResultado = null;

function nvRenderResultado(r) {
  document.querySelector('.nov-cols').style.display = '';
  document.getElementById('nv-ganho-box').style.display = '';
  document.getElementById('nv-resultados-multiplas-sugeridas').style.display = 'none';

  const linhaVal = (label, valor) => `<div class="nov-row"><span>${label}</span><span class="v">${fmtBRL2(valor)}</span></div>`;
  const linhaIR = (label, valor, aliquotaPct) => `<div class="nov-row neg"><span>${label} (${calcFmtPct(aliquotaPct)})</span><span class="v">-${fmtBRL2(valor)}</span></div>`;
  const linhaFinal = (label, valor) => `<div class="nov-row final"><span>${label}</span><span class="v">${fmtBRL2(valor)}</span></div>`;

  const nomeReaplicacao = document.getElementById('nv-nomeReaplicacao').value.trim();
  const nomeNovacao = nvColetarPrimeiraSugerida().nomeAtivoNovacao;
  document.getElementById('nv-titulo-resgate').textContent = r.cenarioResgate.modoSimplificado
    ? 'Parado a 90% do CDI'
    : `Resgate e Reaplicação${nomeReaplicacao ? ` em ${nomeReaplicacao}` : ''}`;
  document.getElementById('nv-titulo-novacao').textContent = `Novação${nomeNovacao ? ` em ${nomeNovacao}` : ''}`;

  const notas = [];
  if (r.periodoVencido) {
    notas.push(`<div class="nov-vencida-box">
      <b>Novação tardia — debênture já vencida:</b> como a data da novação é posterior ao vencimento atual, no cenário de <b>Novação</b> o período entre as duas datas (${r.periodoVencido.diasVencida} dias corridos) rendeu automaticamente a <b>90% do CDI</b> (${calcFmtPct(r.periodoVencido.iAnualPct)} a.a.) em vez de parar de render — de ${fmtBRL2(r.periodoVencido.vfBrutoAntesVencida)} para ${fmtBRL2(r.periodoVencido.vfBrutoAposVencida)} bruto até a data da novação. O cenário de Resgate não é afetado: o resgate sempre ocorre no vencimento contratual.
    </div>`);
  } else if (r.antecipacao) {
    notas.push(`<div class="nov-vencida-box">
      <b>Novação antecipada:</b> a data da novação é anterior ao vencimento atual — no cenário de <b>Novação</b>, a debênture rendeu à taxa contratada só até a data da novação (${r.antecipacao.diasAntecipados} dias antes do vencimento original) e passou a render pela taxa da debênture sugerida a partir daí. O cenário de Resgate não é afetado: o resgate sempre ocorre no vencimento contratual.
    </div>`);
  }
  if (r.horizonteAjustado) {
    notas.push(`<div class="nov-vencida-box">
      <b>Horizonte de comparação ajustado:</b> os dois destinos têm vencimentos diferentes — não faz sentido comparar prazos diferentes diretamente. Os dois cenários abaixo foram avaliados até o vencimento mais curto entre os dois, pra a comparação ser justa.
    </div>`);
  }
  document.getElementById('nv-vencida-box').innerHTML = notas.join('');

  document.getElementById('nv-col-resgate').innerHTML = r.cenarioResgate.modoSimplificado ? `
    <div class="nov-etapa">
      <div class="etapa-titulo">Sem resgate: rende 90% do CDI a partir do vencimento contratual</div>
      ${linhaVal('Valor bruto acumulado', r.cenarioResgate.parado.vfBruto)}
      ${linhaIR('Imposto de Renda', r.cenarioResgate.parado.ir, r.cenarioResgate.parado.aliquotaPct)}
      ${linhaFinal('Valor líquido final', r.cenarioResgate.vfLiquidoFinal)}
    </div>` : `
    <div class="nov-etapa">
      <div class="etapa-titulo">Resgate no vencimento contratual</div>
      ${linhaVal('Valor bruto acumulado', r.cenarioResgate.resgate.vfBruto)}
      ${linhaIR('Imposto de Renda', r.cenarioResgate.resgate.ir, r.cenarioResgate.resgate.aliquotaPct)}
      ${linhaFinal('Valor líquido', r.cenarioResgate.resgate.vfLiquido)}
    </div>
    <div class="nov-etapa">
      <div class="etapa-titulo">Reaplicado até o novo vencimento</div>
      ${linhaVal('Valor bruto', r.cenarioResgate.reaplicacao.vfBruto)}
      ${linhaIR('Imposto de Renda', r.cenarioResgate.reaplicacao.ir, r.cenarioResgate.reaplicacao.aliquotaPct)}
      ${linhaFinal('Valor líquido final', r.cenarioResgate.vfLiquidoFinal)}
    </div>`;

  document.getElementById('nv-col-novacao').innerHTML = `
    <div class="nov-etapa">
      <div class="etapa-titulo">Capitalização contínua até o novo vencimento, sem resgate</div>
      ${linhaVal('Valor bruto acumulado', r.cenarioNovacao.vfBruto)}
      ${linhaIR('Imposto de Renda', r.cenarioNovacao.ir, r.cenarioNovacao.aliquotaPct)}
      ${linhaFinal('Valor líquido final', r.cenarioNovacao.vfLiquidoFinal)}
    </div>`;

  const ganhoPositivo = r.ganhoNovacao >= 0;
  document.getElementById('nv-ganho-box').innerHTML = `
    <div>
      <div class="titulo">${ganhoPositivo ? 'Vantagem da Novação' : 'Diferença frente à Novação'}</div>
      <div class="sub">Mais resultado líquido para o cliente frente a${r.cenarioResgate.modoSimplificado ? ' deixar o capital parado a 90% do CDI' : 'o resgate e reaplicação'}</div>
    </div>
    <div class="valor">${ganhoPositivo ? '+' : ''}${fmtBRL2(r.ganhoNovacao)}${r.ganhoNovacaoPct != null ? ` (${ganhoPositivo ? '+' : ''}${calcFmtPct(r.ganhoNovacaoPct)})` : ''}</div>`;

  document.getElementById('nv-resultado').classList.add('show');
  document.getElementById('nv-relatorio-link').innerHTML = '';
}

// Modo simplificado com MAIS de uma Debênture Sugerida — mesma ideia do relatório de várias
// debêntures (ver montarNotasNovacao/montarBoxesSimplificado/montarNotaBeneficioFiscal em
// lib/reportOficial.js), só que renderizada no navegador: as notas sobre a debênture ATUAL (vencida,
// antecipação) aparecem uma vez só, e o benefício fiscal + custo/ganho aparecem por sugerida.
function nvRenderResultadosMultiplasSugeridas(sugeridas) {
  document.querySelector('.nov-cols').style.display = 'none';
  document.getElementById('nv-ganho-box').style.display = 'none';
  const container = document.getElementById('nv-resultados-multiplas-sugeridas');
  container.style.display = '';

  const primeira = sugeridas[0].resultado;
  const notas = [];
  if (primeira.periodoVencido) {
    notas.push(`<div class="nov-vencida-box">
      <b>Novação tardia — debênture já vencida:</b> como a data da novação é posterior ao vencimento atual, o período entre as duas datas (${primeira.periodoVencido.diasVencida} dias corridos) rendeu automaticamente a <b>90% do CDI</b> (${calcFmtPct(primeira.periodoVencido.iAnualPct)} a.a.) até a novação.
    </div>`);
  } else if (primeira.antecipacao) {
    notas.push(`<div class="nov-vencida-box">
      <b>Novação antecipada:</b> a data da novação é anterior ao vencimento atual — a debênture rendeu à taxa contratada só até lá (${primeira.antecipacao.diasAntecipados} dias antes do vencimento original).
    </div>`);
  }
  document.getElementById('nv-vencida-box').innerHTML = notas.join('');

  container.innerHTML = sugeridas.length > 1 ? nvMontarTabelaSugeridas(sugeridas) : nvMontarCaixasSugerida(sugeridas[0]);

  document.getElementById('nv-resultado').classList.add('show');
  document.getElementById('nv-relatorio-link').innerHTML = '';
}

function nvFmtDataCurta(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Valor usado tanto pra ordenar as sugeridas quanto pra decidir a "melhor opção" — mesma lógica do
// servidor (ver ganhoRankeavel em lib/reportOficial.js), reaproveitada aqui pro preview ao vivo.
function nvGanhoRankeavel(resultado) {
  const rs = resultado.resumoSimplificado;
  return rs.vencida ? rs.ganhoFuturo.diferencaLiquida : rs.ganhoTotal;
}

// Caixas detalhadas (Custo de ter Esperado / Ganho) — usadas quando só há UMA sugerida, sem nada
// pra comparar.
function nvMontarCaixasSugerida(s) {
  const r = s.resultado;
  const bf = r.beneficioFiscal;
  const notaBeneficioFiscal = bf.isento ? '' : bf.diferencaPP > 0.05
    ? `<div class="nov-vencida-box"><b>Benefício fiscal da novação:</b> resgatando no vencimento contratual, a alíquota de IR seria de ${calcFmtPct(bf.aliquotaSeResgatasseNoVencimentoPct)}. Como a novação preserva a contagem de prazo desde a aplicação original, a alíquota final cai para ${calcFmtPct(bf.aliquotaComNovacaoPct)} — economia estimada de ${fmtBRL2(bf.valorEstimado)}.</div>`
    : `<div class="nov-vencida-box"><b>Benefício fiscal da novação:</b> não há economia adicional de IR — a alíquota já está no mesmo patamar (${calcFmtPct(bf.aliquotaComNovacaoPct)}) tanto resgatando no vencimento quanto novando.</div>`;

  const rs = r.resumoSimplificado;
  let boxes;
  if (rs.vencida) {
    const futuroPositivo = rs.ganhoFuturo.diferencaLiquida >= 0;
    boxes = `<div class="nov-ganho-box custo">
      <div>
        <div class="titulo">Custo de ter esperado</div>
        <div class="sub">Parada a 90% do CDI entre o vencimento e a novação (${rs.custoEsperar.dias} dias), rendeu menos do que renderia se já estivesse novada</div>
      </div>
      <div class="valor">-${fmtBRL2(rs.custoEsperar.diferencaBruta)}</div>
    </div>
    <div class="nov-ganho-box" style="margin-top:8px;">
      <div>
        <div class="titulo">${futuroPositivo ? 'Ganho com a novação, a partir de agora' : 'Diferença frente à novação, a partir de agora'}</div>
        <div class="sub">Mais resultado líquido até o novo vencimento, frente a continuar parado a 90% do CDI</div>
      </div>
      <div class="valor">${futuroPositivo ? '+' : ''}${fmtBRL2(rs.ganhoFuturo.diferencaLiquida)}${rs.ganhoFuturo.diferencaLiquidaPct != null ? ` (${futuroPositivo ? '+' : ''}${calcFmtPct(rs.ganhoFuturo.diferencaLiquidaPct)})` : ''}</div>
    </div>`;
  } else {
    const ganhoPositivo = rs.ganhoTotal >= 0;
    boxes = `<div class="nov-ganho-box">
      <div>
        <div class="titulo">${ganhoPositivo ? 'Vantagem da Novação' : 'Diferença frente à Novação'}</div>
        <div class="sub">Mais resultado líquido até o novo vencimento, frente a deixar o capital parado a 90% do CDI</div>
      </div>
      <div class="valor">${ganhoPositivo ? '+' : ''}${fmtBRL2(rs.ganhoTotal)}${rs.ganhoTotalPct != null ? ` (${ganhoPositivo ? '+' : ''}${calcFmtPct(rs.ganhoTotalPct)})` : ''}</div>
    </div>`;
  }

  return `<div class="nov-sugerida-resultado">
    <div class="nome">${s.nomeAtivoNovacao || 'Debênture sugerida'}</div>
    ${notaBeneficioFiscal}
    ${boxes}
  </div>`;
}

// Tabela comparativa ranqueada — usada quando há MAIS de uma sugerida, pra não obrigar o assessor a
// ler N caixas empilhadas e comparar de cabeça (mesma lógica de montarTabelaSugeridas no servidor).
function nvMontarTabelaSugeridas(sugeridas) {
  const vencida = sugeridas[0].resultado.resumoSimplificado.vencida;
  const linhas = sugeridas
    .map((s) => ({ s, ganho: nvGanhoRankeavel(s.resultado) }))
    .sort((a, b) => b.ganho - a.ganho);

  const corpo = linhas.map(({ s, ganho }, idx) => {
    const rs = s.resultado.resumoSimplificado;
    const pct = vencida ? rs.ganhoFuturo.diferencaLiquidaPct : rs.ganhoTotalPct;
    const positivo = ganho >= 0;
    const ehMelhor = idx === 0;
    return `<tr class="${ehMelhor ? 'melhor' : ''}">
      <td>${s.nomeAtivoNovacao || 'Debênture sugerida'}${ehMelhor ? ' <span class="selo">★ Melhor opção</span>' : ''}</td>
      <td>${s.taxaLabel}</td>
      <td>${nvFmtDataCurta(s.vencimentoNovacao)}</td>
      <td>${calcFmtPct(s.resultado.beneficioFiscal.aliquotaComNovacaoPct)}</td>
      ${vencida ? `<td class="valor neg">-${fmtBRL2(rs.custoEsperar.diferencaBruta)}</td>` : ''}
      <td class="valor ${positivo ? 'pos' : 'neg'}">${positivo ? '+' : ''}${fmtBRL2(ganho)}${pct != null ? ` (${positivo ? '+' : ''}${calcFmtPct(pct)})` : ''}</td>
    </tr>`;
  }).join('');

  return `<table class="nov-tabela-sugeridas">
    <thead><tr>
      <th>Debênture sugerida</th><th>Taxa</th><th>Novo vencimento</th><th>IR</th>
      ${vencida ? '<th>Custo de ter esperado</th>' : ''}
      <th>${vencida ? 'Ganho a partir de agora' : 'Ganho projetado'}</th>
    </tr></thead>
    <tbody>${corpo}</tbody>
  </table>`;
}

let nvUltimasSugeridas = null; // caminho de N sugeridas (modo simplificado); mutuamente exclusivo com nvUltimoResultado

document.getElementById('novacaoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById('nv-erro');
  erroEl.style.display = 'none';
  document.getElementById('nv-resultado').classList.remove('show');
  nvUltimoResultado = null;
  nvUltimasSugeridas = null;

  const modoSimplificado = document.getElementById('nv-modoSimplificado').checked;
  const sugeridasUnicas = nvColetarSugeridasUnicas();
  const payload = nvColetarPayload();
  const negativos = ['valorInvestido', 'taxaAtual', 'taxaReaplicacao'].filter((k) => payload[k] < 0);
  if (negativos.length || sugeridasUnicas.some((s) => s.taxaNovacao < 0)) {
    erroEl.textContent = 'Valor investido e taxas não podem ser negativos.';
    erroEl.style.display = 'block';
    return;
  }
  if (!modoSimplificado && sugeridasUnicas.length > 1) {
    erroEl.textContent = 'No modo completo (com produto de reaplicação), só é possível comparar uma Debênture Sugerida por vez. Marque "Modo simplificado" pra comparar várias, ou remova as extras.';
    erroEl.style.display = 'block';
    return;
  }

  try {
    if (modoSimplificado && sugeridasUnicas.length > 1) {
      const posicao = { ...payload, nomeAtivoAtual: document.getElementById('nv-nomeAtual').value.trim(), sugeridas: sugeridasUnicas };
      const resp = await fetch('/api/novacao/multiplas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posicoes: [posicao] }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || 'Falha ao calcular.');
      nvUltimasSugeridas = data.resultados[0].sugeridas;
      nvRenderResultadosMultiplasSugeridas(nvUltimasSugeridas);
    } else {
      const resp = await fetch('/api/novacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || 'Falha ao calcular.');
      nvUltimoResultado = data.resultado;
      nvRenderResultado(data.resultado);
    }
  } catch (err) {
    erroEl.textContent = `Erro: ${err.message}`;
    erroEl.style.display = 'block';
  }
});

document.getElementById('nv-gerarRelatorio').addEventListener('click', async () => {
  const linkEl = document.getElementById('nv-relatorio-link');
  const clienteEl = document.getElementById('cliente');
  const cliente = clienteEl.value.trim();
  if (!cliente) {
    linkEl.innerHTML = '<span style="color:#7a2b2b;">Preencha o campo "Cliente" (no card "Dados gerais" abaixo) antes de gerar o relatório.</span>';
    return;
  }
  if (!nvUltimoResultado && !nvUltimasSugeridas) return;

  linkEl.textContent = 'Gerando relatório...';
  try {
    if (nvUltimasSugeridas) {
      const posicao = {
        ...nvColetarPayload(),
        nomeAtivoAtual: document.getElementById('nv-nomeAtual').value.trim(),
        sugeridas: nvColetarSugeridasUnicas(),
      };
      const resp = await fetch('/api/novacao/multiplas/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente, assessor: obterAssessor(), posicoes: [posicao] }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || 'Falha ao gerar o relatório.');
      linkEl.innerHTML = `<a class="btn" href="${data.downloadUrl}" download style="text-decoration:none; display:inline-block;">Baixar Relatório PDF</a>`;
      nvLimparRascunho();
      return;
    }
    const payload = {
      ...nvColetarPayload(),
      cliente,
      assessor: obterAssessor(),
      nomeAtivoAtual: document.getElementById('nv-nomeAtual').value.trim(),
      nomeAtivoReaplicacao: document.getElementById('nv-nomeReaplicacao').value.trim(),
    };
    const resp = await fetch('/api/novacao/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao gerar o relatório.');
    linkEl.innerHTML = `<a class="btn" href="${data.downloadUrl}" download style="text-decoration:none; display:inline-block;">Baixar Relatório PDF</a>`;
    nvLimparRascunho();
  } catch (err) {
    linkEl.innerHTML = `<span style="color:#7a2b2b;">Erro: ${err.message}</span>`;
  }
});

// --- Novação de MÚLTIPLAS debêntures (vencidas ou a vencer) num único relatório — cada posição usa
// o modo simplificado (comparação contra deixar parado a 90% do CDI). Ver /api/novacao/multiplas* em
// server.js e montarRelatorioNovacaoMultipla em lib/reportOficial.js. ---

let nvPosicaoContador = 0;
let nvSugeridasCache = [];

function nvLabelTaxa(tipo) {
  if (tipo === 'pctcdi') return '% CDI';
  if (tipo === 'cdi') return '% CDI+';
  if (tipo === 'ipca') return '% IPCA+';
  return '% a.a.';
}

async function nvCarregarSugeridas() {
  try {
    const resp = await fetch('/api/novacao/sugeridas');
    const data = await resp.json();
    nvSugeridasCache = data.sugeridas || [];
  } catch (err) {
    nvSugeridasCache = [];
  }
  document.querySelectorAll('.nv-pos-sugeridaCatalogo').forEach(nvPopularSelectSugeridas);
  nvRenderListaSugeridas();
}

function nvPopularSelectSugeridas(select) {
  const selecionadoAntes = select.value;
  select.innerHTML = '<option value="">Selecionar do catálogo (opcional)...</option>'
    + nvSugeridasCache.map((s) => `<option value="${s.id}">${s.nome} — ${s.taxa}${nvLabelTaxa(s.tipo)}</option>`).join('');
  select.value = selecionadoAntes;
}

function nvRenderListaSugeridas() {
  const container = document.getElementById('nv-listaSugeridas');
  if (!container) return;
  container.innerHTML = nvSugeridasCache.length
    ? nvSugeridasCache.map((s) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; font-size:10.5px;">
        <span>${s.nome} — ${s.taxa}${nvLabelTaxa(s.tipo)}${s.vencimento ? ` (vence ${s.vencimento.split('-').reverse().join('/')})` : ''}</span>
        <button type="button" class="btn danger small nv-sug-remover" data-id="${s.id}">Remover</button>
      </div>`).join('')
    : '<p style="font-size:10px; color:#8a886f; margin:0;">Nenhuma debênture sugerida cadastrada ainda.</p>';
  container.querySelectorAll('.nv-sug-remover').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmado = await confirmarAcao('Remover esta debênture sugerida do catálogo?');
      if (!confirmado) return;
      await fetch(`/api/novacao/sugeridas/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
      await nvCarregarSugeridas();
    });
  });
}

document.getElementById('nv-toggleSugeridas').addEventListener('click', () => {
  const painel = document.getElementById('nv-sugeridasPainel');
  const mostrando = painel.style.display !== 'none';
  painel.style.display = mostrando ? 'none' : '';
  if (!mostrando) nvCarregarSugeridas();
});

document.getElementById('nv-salvarSugerida').addEventListener('click', async () => {
  const payload = {
    nome: document.getElementById('nv-sugNome').value.trim(),
    tipo: document.getElementById('nv-sugTipo').value,
    taxa: Number(document.getElementById('nv-sugTaxa').value || 0),
    vencimento: document.getElementById('nv-sugVencimento').value,
  };
  if (!payload.nome || !(payload.taxa > 0)) {
    alert('Preencha nome e taxa (maior que 0) antes de adicionar ao catálogo.');
    return;
  }
  try {
    const resp = await fetch('/api/novacao/sugeridas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao salvar.');
    document.getElementById('nv-sugNome').value = '';
    document.getElementById('nv-sugTaxa').value = '';
    document.getElementById('nv-sugVencimento').value = '';
    await nvCarregarSugeridas();
  } catch (err) {
    alert(`Não foi possível salvar: ${err.message}`);
  }
});

function nvCriarBlocoPosicao() {
  nvPosicaoContador += 1;
  const div = document.createElement('div');
  div.className = 'nov-posicao-card';
  div.innerHTML = `
    <div class="cabecalho">
      <strong>Debênture ${nvPosicaoContador}</strong>
      <button type="button" class="btn danger small nv-pos-remover">Remover</button>
    </div>
    <div class="nv-etapa-titulo" style="margin-top:10px;">1. Primeira Aplicação <span class="nv-etapa-sub">— data e valor aplicado</span></div>
    <div class="grid3">
      <div>
        <label>Data da Primeira Aplicação</label>
        <input type="date" class="nv-pos-dataAplicacaoOriginal">
      </div>
      <div>
        <label>Valor Investido (aporte inicial) <button type="button" class="nv-info-btn" aria-label="Mais informações">ⓘ</button></label>
        <input type="number" step="0.01" min="0" class="nv-pos-valorInvestido" placeholder="10000">
        <div class="nv-info-texto">Base do Imposto de Renda: o ganho tributável é o valor final menos este aporte original. Não muda mesmo se a debênture já foi novada antes.</div>
      </div>
    </div>

    <div class="nv-etapa-titulo" style="margin-top:14px;">2. Debênture a ser novada <span class="nv-etapa-sub">— condição vigente hoje, desde quando, e até quando</span></div>
    <div class="grid3">
      <div>
        <label>Nome do ativo atual</label>
        <input type="text" class="nv-pos-nome" placeholder="ex.: Debênture Liquidez Diária">
      </div>
      <div>
        <label>Indexador</label>
        <select class="nv-pos-tipoAtual">
          <option value="fixo">Prefixado (a.m.)</option>
          <option value="fixoAA" selected>Prefixado (a.a.)</option>
          <option value="cdi">CDI +</option>
          <option value="ipca">IPCA +</option>
          <option value="pctcdi">% CDI</option>
        </select>
      </div>
      <div>
        <label>Taxa</label>
        <input type="number" step="0.01" min="0" class="nv-pos-taxaAtual" placeholder="ex.: 90 (se % CDI)">
      </div>
    </div>
    <div class="grid3" style="margin-top:10px;">
      <div>
        <label>Aplicada em <button type="button" class="nv-info-btn" aria-label="Mais informações">ⓘ</button></label>
        <input type="date" class="nv-pos-dataAplicacao">
        <div class="nv-info-texto">Data em que essa condição passou a valer. Se nunca foi novada, é a mesma da Primeira Aplicação. Se já foi novada antes, é a data dessa novação anterior — preenchida automaticamente, mas pode ajustar.</div>
      </div>
      <div>
        <label>Vencimento</label>
        <input type="date" class="nv-pos-vencimentoAtual nv-prazo-restante-input">
        <div class="nv-prazo-restante" style="display:none; font-size:9.5px; color:#8a886f; margin-top:2px;"></div>
      </div>
      <div>
        <label>Valor Atual da Posição <button type="button" class="nv-info-btn" aria-label="Mais informações">ⓘ</button></label>
        <input type="number" step="0.01" min="0" class="nv-pos-valorAtual" placeholder="12500">
        <div class="nv-info-texto">O valor real, de hoje (do extrato ou do app do cliente) — usado em todos os cálculos a partir daqui, sem recalcular.</div>
      </div>
    </div>
    <div class="field-inline" style="margin-top:10px;">
      <input type="checkbox" class="nv-pos-isentoAtual"> Isento de IR
    </div>
    <div style="margin-top:10px; max-width:260px;">
      <label>Cliente desta posição (opcional) <button type="button" class="nv-info-btn" aria-label="Mais informações">ⓘ</button></label>
      <input type="text" class="nv-pos-cliente" placeholder="deixe vazio p/ usar o Cliente geral">
      <div class="nv-info-texto">Deixe em branco pra usar o campo 'Cliente' geral (card 'Dados gerais') — preencha só quando esta posição pertence a um cliente DIFERENTE, pra gerar um PDF separado por cliente no lote.</div>
    </div>
    <div style="margin-top:12px;">
      <button type="button" class="btn secondary small nv-pos-duplicar">+ Adicionar Debênture</button>
    </div>
  `;

  // "Já foi novada antes" é inferido comparando Aplicação Original (etapa 1) com Válida desde
  // (etapa 2) — ver mesmo padrão e comentário completo no formulário de uma debênture só.
  div.querySelector('.nv-pos-dataAplicacaoOriginal').addEventListener('change', function () {
    const campoAtual = div.querySelector('.nv-pos-dataAplicacao');
    if (!campoAtual.value) campoAtual.value = this.value;
  });
  div.querySelector('.nv-pos-remover').addEventListener('click', () => {
    div.remove();
  });
  div.querySelector('.nv-pos-duplicar').addEventListener('click', () => {
    nvDuplicarBloco(div, nvCriarBlocoPosicao);
  });

  return div;
}

// Clona um bloco (posição ou sugerida) copiando o VALOR de cada campo, na mesma ordem em que
// aparecem no DOM — funciona pra qualquer bloco criado pelas funções acima porque os dois lados
// (origem e novo) sempre têm exatamente os mesmos campos, na mesma ordem. Dispara "change" em cada
// campo copiado pra também acionar os toggles condicionais (já-novada, modo de novação, catálogo).
function nvDuplicarBloco(origemDiv, criarFn, ...criarArgs) {
  const novoDiv = criarFn(...criarArgs);
  const camposOrigem = origemDiv.querySelectorAll('input, select');
  const camposNovo = novoDiv.querySelectorAll('input, select');
  camposOrigem.forEach((campoOrigem, i) => {
    const campoNovo = camposNovo[i];
    if (!campoNovo) return;
    if (campoOrigem.type === 'checkbox') campoNovo.checked = campoOrigem.checked;
    else campoNovo.value = campoOrigem.value;
    campoNovo.dispatchEvent(new Event('change'));
  });
  origemDiv.after(novoDiv);
  return novoDiv;
}

function nvCriarBlocoSugerida(sugeridasLista) {
  const div = document.createElement('div');
  div.className = 'nov-sugerida-card';
  div.innerHTML = `
    <div class="grid3">
      <div>
        <label>Usar do catálogo</label>
        <select class="nv-pos-sugeridaCatalogo"></select>
      </div>
      <div>
        <label>Nome do ativo</label>
        <input type="text" class="nv-pos-nomeNovacao" placeholder="ex.: Debênture 2029">
      </div>
      <div>
        <label>Indexador</label>
        <select class="nv-pos-tipoNovacao">
          <option value="fixo">Prefixado (a.m.)</option>
          <option value="fixoAA" selected>Prefixado (a.a.)</option>
          <option value="cdi">CDI +</option>
          <option value="ipca">IPCA +</option>
          <option value="pctcdi">% CDI</option>
        </select>
        <div class="nv-hint-benchmark" style="display:none; font-size:9.5px; color:#8a886f; margin-top:2px;"></div>
      </div>
    </div>
    <div class="grid3" style="margin-top:8px;">
      <div>
        <label>Taxa</label>
        <input type="number" step="0.01" min="0" class="nv-pos-taxaNovacao" placeholder="23,42">
      </div>
      <div>
        <label>Novo Vencimento (após novação)</label>
        <input type="date" class="nv-pos-vencimentoNovacao">
      </div>
      <div style="align-self:end; display:flex; gap:6px;">
        <button type="button" class="btn secondary small nv-pos-duplicarSugerida">Duplicar</button>
        <button type="button" class="btn danger small nv-pos-removerSugerida">Remover</button>
      </div>
    </div>
  `;
  const hintBenchmark = div.querySelector('.nv-hint-benchmark');
  const tipoNovacaoSelect = div.querySelector('.nv-pos-tipoNovacao');
  tipoNovacaoSelect.addEventListener('change', () => nvAtualizarHintBenchmark(hintBenchmark));
  nvAtualizarHintBenchmark(hintBenchmark);

  div.querySelector('.nv-pos-sugeridaCatalogo').addEventListener('change', function () {
    const s = nvSugeridasCache.find((x) => x.id === this.value);
    if (!s) return;
    div.querySelector('.nv-pos-nomeNovacao').value = s.nome;
    tipoNovacaoSelect.value = s.tipo;
    div.querySelector('.nv-pos-taxaNovacao').value = s.taxa;
    if (s.vencimento) div.querySelector('.nv-pos-vencimentoNovacao').value = s.vencimento;
    nvAtualizarHintBenchmark(hintBenchmark);
  });
  div.querySelector('.nv-pos-removerSugerida').addEventListener('click', () => {
    // Sempre deixa ao menos uma sugerida — cada posição precisa de pelo menos uma debênture sugerida.
    if (sugeridasLista.children.length > 1) div.remove();
  });
  div.querySelector('.nv-pos-duplicarSugerida').addEventListener('click', () => {
    nvDuplicarBloco(div, nvCriarBlocoSugerida, sugeridasLista);
  });
  nvPopularSelectSugeridas(div.querySelector('.nv-pos-sugeridaCatalogo'));
  return div;
}

document.getElementById('nv-adicionarPosicao').addEventListener('click', () => {
  document.getElementById('nv-posicoesLista').appendChild(nvCriarBlocoPosicao());
});

// Etapa 3 (Novação Proposta) — única pro lote inteiro, fora dos cards de posição. Mesmo padrão de
// "Data da Novação é" + catálogo já usado nas sugeridas de posição única.
document.getElementById('nv-multiplasModoNovacao').addEventListener('change', function () {
  document.getElementById('nv-multiplasCampoAssinatura').style.display = this.value === 'assinatura' ? '' : 'none';
});
document.getElementById('nv-multiplasDataAssinatura').value = nvDataHojeISO();
document.getElementById('nv-multiplasSugeridaCatalogo').addEventListener('change', function () {
  const s = nvSugeridasCache.find((x) => x.id === this.value);
  if (!s) return;
  document.getElementById('nv-multiplasNomeNovacao').value = s.nome;
  document.getElementById('nv-multiplasTipoNovacao').value = s.tipo;
  document.getElementById('nv-multiplasTaxaNovacao').value = s.taxa;
  if (s.vencimento) document.getElementById('nv-multiplasVencimentoNovacao').value = s.vencimento;
});

// Converte "25/07/2027" (colado do Excel) ou "2027-07-25" (já ISO) pro formato ISO que o <input
// type="date"> espera. Retorna '' se não reconhecer o formato, pra deixar o campo em branco em vez
// de quebrar a importação inteira por causa de uma data mal formatada.
function nvParseDataImportada(txt) {
  const s = (txt || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

document.getElementById('nv-toggleImportar').addEventListener('click', () => {
  const painel = document.getElementById('nv-importarPainel');
  painel.style.display = painel.style.display !== 'none' ? 'none' : '';
});

document.getElementById('nv-confirmarImportar').addEventListener('click', () => {
  const erroEl = document.getElementById('nv-importarErro');
  erroEl.style.display = 'none';
  const linhas = document.getElementById('nv-importarTexto').value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!linhas.length) {
    erroEl.textContent = 'Cole ao menos uma linha antes de importar.';
    erroEl.style.display = '';
    return;
  }
  const posicoesLista = document.getElementById('nv-posicoesLista');
  const falhas = [];
  linhas.forEach((linha, i) => {
    const campos = linha.split('\t').length > 1 ? linha.split('\t') : linha.split(';');
    const [nome, valorAtual, vencimentoAtual, valorInvestido, dataAplicacao] = campos.map((c) => (c || '').trim());
    if (!nome || !(Number(valorAtual.replace(',', '.')) > 0) || !nvParseDataImportada(vencimentoAtual)) {
      falhas.push(i + 1);
      return;
    }
    const div = nvCriarBlocoPosicao();
    div.querySelector('.nv-pos-nome').value = nome;
    div.querySelector('.nv-pos-valorAtual').value = Number(valorAtual.replace(',', '.'));
    div.querySelector('.nv-pos-vencimentoAtual').value = nvParseDataImportada(vencimentoAtual);
    nvAtualizarPrazoRestante(div.querySelector('.nv-pos-vencimentoAtual'));
    if (valorInvestido && Number(valorInvestido.replace(',', '.')) > 0) {
      div.querySelector('.nv-pos-valorInvestido').value = Number(valorInvestido.replace(',', '.'));
    }
    if (dataAplicacao && nvParseDataImportada(dataAplicacao)) {
      // A coluna opcional de data representa a Aplicação Original (etapa 1) — o formato colado não
      // tem como expressar uma novação anterior com condição diferente da original, então a mesma
      // data também vale pra "Válida desde" (etapa 2), cobrindo o caso comum (nunca novada).
      const dataImportada = nvParseDataImportada(dataAplicacao);
      div.querySelector('.nv-pos-dataAplicacaoOriginal').value = dataImportada;
      div.querySelector('.nv-pos-dataAplicacao').value = dataImportada;
    }
    posicoesLista.appendChild(div);
  });
  if (falhas.length) {
    erroEl.textContent = `Linha(s) ${falhas.join(', ')} ignorada(s): preencha nome, valor (maior que 0) e vencimento (dd/mm/aaaa) válidos.`;
    erroEl.style.display = '';
  }
  if (falhas.length < linhas.length) {
    document.getElementById('nv-importarTexto').value = '';
    if (!falhas.length) document.getElementById('nv-importarPainel').style.display = 'none';
  }
});

document.getElementById('nv-modoMultiplas').addEventListener('change', function () {
  document.getElementById('nv-multiplasContainer').style.display = this.checked ? '' : 'none';
  if (this.checked && !document.getElementById('nv-posicoesLista').children.length) {
    nvCarregarSugeridas();
    document.getElementById('nv-posicoesLista').appendChild(nvCriarBlocoPosicao());
  }
});

// Campos da posição "atual" (etapas 1 e 2, sem a sugerida — essa é compartilhada, ver
// nvColetarNovacaoPropostaCompartilhada) — mesmo formato esperado por lerEValidarNovacao no servidor.
function nvColetarCamposPosicao(div) {
  const dataAplicacao = div.querySelector('.nv-pos-dataAplicacao').value;
  const dataAplicacaoOriginal = div.querySelector('.nv-pos-dataAplicacaoOriginal').value;
  return {
    cliente: div.querySelector('.nv-pos-cliente').value.trim(),
    nomeAtivoAtual: div.querySelector('.nv-pos-nome').value.trim(),
    valorAtualPosicao: Number(div.querySelector('.nv-pos-valorAtual').value || 0),
    valorInvestido: Number(div.querySelector('.nv-pos-valorInvestido').value || 0),
    dataAplicacao,
    tipoAtual: div.querySelector('.nv-pos-tipoAtual').value,
    taxaAtual: Number(div.querySelector('.nv-pos-taxaAtual').value || 0),
    vencimentoAtual: div.querySelector('.nv-pos-vencimentoAtual').value,
    isentoAtual: div.querySelector('.nv-pos-isentoAtual').checked,
    // Ver comentário completo no formulário de uma debênture só (nvColetarPayload).
    jaFoiNovadaAntes: !!(dataAplicacaoOriginal && dataAplicacao && dataAplicacaoOriginal !== dataAplicacao),
    dataAplicacaoOriginal,
  };
}

// Etapa 3 (Novação Proposta) é única pro lote inteiro, não por posição — mesma debênture sugerida e
// mesma "data da novação é" aplicadas a todas. Lida uma vez só e reaproveitada em cada posição.
function nvColetarNovacaoPropostaCompartilhada() {
  return {
    modoNovacao: document.getElementById('nv-multiplasModoNovacao').value,
    dataAssinatura: document.getElementById('nv-multiplasDataAssinatura').value,
    nomeAtivoNovacao: document.getElementById('nv-multiplasNomeNovacao').value.trim(),
    tipoNovacao: document.getElementById('nv-multiplasTipoNovacao').value,
    taxaNovacao: Number(document.getElementById('nv-multiplasTaxaNovacao').value || 0),
    vencimentoNovacao: document.getElementById('nv-multiplasVencimentoNovacao').value,
  };
}

function nvColetarPosicoesMultiplas() {
  const { modoNovacao, dataAssinatura, ...sugerida } = nvColetarNovacaoPropostaCompartilhada();
  return Array.from(document.querySelectorAll('#nv-posicoesLista .nov-posicao-card')).map((div) => ({
    ...nvColetarCamposPosicao(div),
    modoNovacao,
    dataAssinatura,
    sugeridas: [sugerida],
  }));
}

document.getElementById('nv-gerarRelatorioMultiplo').addEventListener('click', async () => {
  const linkEl = document.getElementById('nv-multiplas-relatorio-link');
  const cliente = document.getElementById('cliente').value.trim();
  if (!cliente) {
    linkEl.innerHTML = '<span style="color:#7a2b2b;">Preencha o campo "Cliente" (no card "Dados gerais" abaixo) antes de gerar o relatório.</span>';
    return;
  }
  const posicoes = nvColetarPosicoesMultiplas();
  if (!posicoes.length) {
    linkEl.innerHTML = '<span style="color:#7a2b2b;">Adicione ao menos uma debênture.</span>';
    return;
  }
  linkEl.textContent = 'Gerando relatório...';
  try {
    const resp = await fetch('/api/novacao/multiplas/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente, assessor: obterAssessor(), posicoes }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.erro || 'Falha ao gerar o relatório.');
    linkEl.innerHTML = `<a class="btn" href="${data.downloadUrl}" download style="text-decoration:none; display:inline-block;">Baixar Relatório PDF</a>`;
    nvLimparRascunho();
  } catch (err) {
    linkEl.innerHTML = `<span style="color:#7a2b2b;">Erro: ${err.message}</span>`;
  }
});

// Geração em lote multi-cliente: agrupa as posições coletadas pelo campo `cliente` de cada uma (já
// resolvido pro Cliente geral quando vazio — ver nvColetarCamposPosicao/nvColetarPosicoesMultiplas)
// e chama /api/novacao/multiplas/gerar uma vez por grupo, sequencialmente (evita disparar N chamadas
// simultâneas de geração de PDF, que é a etapa mais pesada do backend). Devolve uma lista de links,
// um por cliente, em vez de um único PDF — cada cliente recebe só o relatório com as posições dele.
document.getElementById('nv-gerarRelatorioLote').addEventListener('click', async () => {
  const linkEl = document.getElementById('nv-multiplas-relatorio-link');
  const clienteGeral = document.getElementById('cliente').value.trim();
  const posicoes = nvColetarPosicoesMultiplas();
  if (!posicoes.length) {
    linkEl.innerHTML = '<span style="color:#7a2b2b;">Adicione ao menos uma debênture.</span>';
    return;
  }

  const grupos = new Map();
  for (const p of posicoes) {
    const clienteEfetivo = p.cliente || clienteGeral;
    if (!clienteEfetivo) {
      linkEl.innerHTML = `<span style="color:#7a2b2b;">"${p.nomeAtivoAtual || 'Uma das posições'}" não tem cliente definido — preencha o "Cliente desta posição" no card ou o Cliente geral.</span>`;
      return;
    }
    if (!grupos.has(clienteEfetivo)) grupos.set(clienteEfetivo, []);
    grupos.get(clienteEfetivo).push(p);
  }

  linkEl.textContent = `Gerando ${grupos.size} relatório(s), um por cliente...`;
  const assessor = obterAssessor();
  const links = [];
  const erros = [];
  for (const [cliente, posicoesDoCliente] of grupos) {
    try {
      const resp = await fetch('/api/novacao/multiplas/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente, assessor, posicoes: posicoesDoCliente }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || 'Falha ao gerar o relatório.');
      links.push({ cliente, downloadUrl: data.downloadUrl });
    } catch (err) {
      erros.push(`${cliente}: ${err.message}`);
    }
  }

  const linksHtml = links.map((l) => `<a class="btn" href="${l.downloadUrl}" download style="text-decoration:none; display:inline-block; margin:0 8px 8px 0;">${l.cliente} — Baixar PDF</a>`).join('');
  const errosHtml = erros.length ? `<div style="color:#7a2b2b; margin-top:6px;">${erros.map((e) => `Erro em ${e}`).join('<br>')}</div>` : '';
  linkEl.innerHTML = `<div>${linksHtml}</div>${errosHtml}` || '<span style="color:#7a2b2b;">Nenhum relatório gerado.</span>';
  // Só limpa o rascunho se pelo menos um cliente saiu com sucesso — se todos falharam, o assessor
  // provavelmente ainda vai precisar corrigir e tentar de novo, sem perder o que já preencheu.
  if (links.length) nvLimparRascunho();
});

// --- Formulário padrão (uma debênture atual): a lista de Debêntures Sugeridas reaproveita o mesmo
// bloco (nvCriarBlocoSugerida) do modo de várias debêntures. No modo completo (com produto de
// reaplicação), fica restrito a 1 sugerida — o botão de adicionar some quando marcado. ---
(function nvInicializarSugeridasUnicas() {
  const lista = document.getElementById('nv-sugeridasLista');
  const btnAdicionar = document.getElementById('nv-adicionarSugeridaUnica');
  lista.appendChild(nvCriarBlocoSugerida(lista));
  nvCarregarSugeridas();

  btnAdicionar.addEventListener('click', () => {
    lista.appendChild(nvCriarBlocoSugerida(lista));
  });

  function nvAtualizarBotaoAdicionarSugerida() {
    const completo = !document.getElementById('nv-modoSimplificado').checked;
    btnAdicionar.style.display = completo ? 'none' : '';
  }
  document.getElementById('nv-modoSimplificado').addEventListener('change', nvAtualizarBotaoAdicionarSugerida);
  nvAtualizarBotaoAdicionarSugerida();
})();

// --- Seletor de cenário no topo do painel de Novação — direciona direto pra qual formulário mostrar
// (uma debênture em modo simples ou completo; ou várias debêntures de uma vez), em vez de deixar tudo
// empilhado com checkboxes soltos pro assessor descobrir sozinho. Por baixo dos panos continua usando
// os mesmos checkboxes/containers de sempre (#nv-modoSimplificado, #nv-modoMultiplas) — só que agora
// escondidos da tela e controlados só por aqui, então toda a lógica de cálculo/render já existente
// continua funcionando sem mudança.
// Duas perguntas independentes, não três cartões que misturam "quantas debêntures" com "contra o
// que comparar" — o modelo mental fica mais simples e evita forçar uma combinação que o sistema não
// suporta (várias debêntures + produto de reaplicação específico continua fora de escopo, ver
// lib/reportOficial.js). Por baixo dos panos ainda usa os mesmos checkboxes de sempre.
(function nvInicializarSeletorCenario() {
  const cardsQtd = document.querySelectorAll('#nv-perguntaQtd .nv-cenario-card');
  const cardsComparacao = document.querySelectorAll('#nv-perguntaComparacao .nv-cenario-card');
  const pergunta2Wrap = document.getElementById('nv-pergunta2Wrap');
  const secaoUnica = document.getElementById('nv-secaoUnica');
  const secaoMultiplas = document.getElementById('nv-secaoMultiplas');
  const checkboxSimplificado = document.getElementById('nv-modoSimplificado');
  const checkboxMultiplas = document.getElementById('nv-modoMultiplas');

  let qtd = 'uma';
  let comparacao = 'simplificado';

  function aplicar() {
    cardsQtd.forEach((c) => c.classList.toggle('selecionado', c.dataset.qtd === qtd));
    cardsComparacao.forEach((c) => c.classList.toggle('selecionado', c.dataset.comparacao === comparacao));
    pergunta2Wrap.style.display = qtd === 'varias' ? 'none' : '';

    if (qtd === 'varias') {
      secaoUnica.style.display = 'none';
      secaoMultiplas.style.display = '';
      if (!checkboxMultiplas.checked) {
        checkboxMultiplas.checked = true;
        checkboxMultiplas.dispatchEvent(new Event('change'));
      }
      return;
    }

    secaoUnica.style.display = '';
    secaoMultiplas.style.display = 'none';
    if (checkboxMultiplas.checked) {
      checkboxMultiplas.checked = false;
      checkboxMultiplas.dispatchEvent(new Event('change'));
    }
    const querSimplificado = comparacao === 'simplificado';
    if (checkboxSimplificado.checked !== querSimplificado) {
      checkboxSimplificado.checked = querSimplificado;
      checkboxSimplificado.dispatchEvent(new Event('change'));
    }
  }

  cardsQtd.forEach((c) => c.addEventListener('click', () => { qtd = c.dataset.qtd; aplicar(); }));
  cardsComparacao.forEach((c) => c.addEventListener('click', () => { comparacao = c.dataset.comparacao; aplicar(); }));
  aplicar(); // estado padrão ao abrir o painel: uma debênture, contra 90% do CDI
})();

// Atalhos de teclado — Ctrl/Cmd+Enter avança pro próximo passo (calcula, ou gera o relatório se já
// tiver calculado); Ctrl/Cmd+D duplica o bloco (debênture ou sugerida) onde o foco estiver.
document.addEventListener('keydown', (e) => {
  const painelAberto = document.getElementById('novacaoCard') && document.getElementById('novacaoCard').style.display !== 'none';
  if (!painelAberto || !(e.ctrlKey || e.metaKey)) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    const modoMultiplas = getComputedStyle(document.getElementById('nv-secaoMultiplas')).display !== 'none';
    if (modoMultiplas) {
      document.getElementById('nv-gerarRelatorioMultiplo').click();
    } else if (document.getElementById('nv-resultado').classList.contains('show')) {
      document.getElementById('nv-gerarRelatorio').click();
    } else {
      document.getElementById('novacaoForm').requestSubmit();
    }
    return;
  }

  if (e.key === 'd' || e.key === 'D') {
    const sugeridaCard = e.target.closest('.nov-sugerida-card');
    const posicaoCard = e.target.closest('.nov-posicao-card');
    if (sugeridaCard) {
      e.preventDefault();
      sugeridaCard.querySelector('.nv-pos-duplicarSugerida').click();
    } else if (posicaoCard) {
      e.preventDefault();
      posicaoCard.querySelector('.nv-pos-duplicar').click();
    }
  }
});

// --- Histórico de simulações ---

function fmtDataHora(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtmlCliente(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function renderHistorico(entradas) {
  const lista = document.getElementById('historicoLista');
  if (!entradas.length) {
    lista.innerHTML = '<div class="hist-vazio">Nenhuma simulação encontrada.</div>';
    return;
  }
  lista.innerHTML = entradas.map((e) => {
    const modeloLabel = e.templateType === 'renda' ? 'Renda Mensal' : 'Crescimento de Patrimônio';
    const produtosHtml = (e.produtos || []).map((p) => `
      <span class="hist-produto"><b>${escapeHtmlCliente(p.nome)}</b> <span class="cat">(${escapeHtmlCliente(p.categoria)} · ${escapeHtmlCliente(p.taxa)} · ${fmtBRL(p.vi)} · vence ${p.vencimento} · ${p.fluxo}${p.isento ? ' · isento' : ''})</span></span>
    `).join('');
    return `
      <div class="hist-item" data-hist-id="${escapeHtmlCliente(e.id)}">
        <div class="hist-topo">
          <span><b>${escapeHtmlCliente(e.cliente)}</b> — ${escapeHtmlCliente(e.assessor)}</span>
          <span>${fmtDataHora(e.geradoEm)}</span>
        </div>
        <div class="hist-meta">${modeloLabel} · ${(e.produtos || []).length} produto(s)</div>
        <div class="hist-resumo">
          Investido: <b>${fmtBRL(e.resumo.viTotal)}</b> ·
          VF líquido: <b>${fmtBRL(Math.round(e.resumo.vfLiquidoTotal))}</b> ·
          ≈${Math.round(e.resumo.pctDoCdi)}% do CDI
          <a class="hist-link" href="${e.downloadUrl}" download>Baixar PDF</a>
          <button class="btn danger small hist-excluir" type="button" data-id="${escapeHtmlCliente(e.id)}" style="margin-left:6px;">Excluir</button>
        </div>
        <div class="hist-produtos">${produtosHtml}</div>
      </div>
    `;
  }).join('');

  lista.querySelectorAll('.hist-excluir').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta simulação do histórico? O PDF já gerado não será apagado.')) return;
      try {
        const resp = await fetch(`/api/historico/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.erro || `Falha ao excluir (HTTP ${resp.status})`);
        }
        carregarHistorico();
      } catch (err) {
        alert(`Não foi possível excluir: ${err.message}`);
      }
    });
  });
}

function renderFiltroAssessores(assessores, selecionado) {
  const select = document.getElementById('historicoFiltroAssessor');
  const atual = selecionado ?? select.value;
  select.innerHTML = '<option value="">Todos os assessores</option>' +
    assessores.map((a) => `<option value="${escapeHtmlCliente(a)}">${escapeHtmlCliente(a)}</option>`).join('');
  select.value = atual;
}

let historicoCarregado = false;
async function carregarHistorico() {
  const lista = document.getElementById('historicoLista');
  const busca = document.getElementById('historicoBusca').value;
  const assessor = document.getElementById('historicoFiltroAssessor').value;
  try {
    const resp = await fetch(`/api/historico?busca=${encodeURIComponent(busca)}&assessor=${encodeURIComponent(assessor)}`);
    const data = await resp.json();
    renderHistorico(data.entradas || []);
    renderFiltroAssessores(data.assessores || [], assessor);
  } catch (err) {
    lista.innerHTML = `<div class="hist-vazio">Não foi possível carregar o histórico: ${err.message}</div>`;
  }
}

// --- Catálogo de Produtos (cadastro reaproveitável) ---

const CP_CATEGORIAS_SEMPRE_ISENTAS = CATEGORIAS_SEMPRE_ISENTAS;

function cpAtualizarIsentoAutomatico() {
  const categoria = document.getElementById('cp-categoria').value;
  const isentoCheckbox = document.getElementById('cp-isento');
  if (CP_CATEGORIAS_SEMPRE_ISENTAS.includes(categoria)) {
    isentoCheckbox.checked = true;
    isentoCheckbox.disabled = true;
  } else {
    isentoCheckbox.checked = false;
    isentoCheckbox.disabled = false;
  }
}

function cpAtualizarModoCashSweep() {
  const ativo = document.getElementById('cp-cashSweep').checked;
  const fluxoSelect = document.getElementById('cp-fluxoPagamento');
  fluxoSelect.disabled = ativo;
  if (ativo) fluxoSelect.value = 'bullet';
  document.getElementById('cp-periodicidadeCS').style.display = ativo ? '' : 'none';
  document.getElementById('cp-periodicidade').closest('div').style.display = ativo ? 'none' : '';
}

document.getElementById('cp-categoria').addEventListener('change', cpAtualizarIsentoAutomatico);
document.getElementById('cp-cashSweep').addEventListener('change', cpAtualizarModoCashSweep);
cpAtualizarIsentoAutomatico();

function cpLimparFormulario() {
  document.getElementById('cp-id').value = '';
  document.getElementById('catalogoForm').reset();
  cpAtualizarIsentoAutomatico();
  cpAtualizarModoCashSweep();
  document.getElementById('cp-cancelarEdicao').style.display = 'none';
  document.getElementById('cp-salvar').textContent = 'Salvar Produto';
}

function cpResumoProduto(p) {
  const indexadorLabel = { fixo: 'Prefixado (a.m.)', fixoAA: 'Prefixado (a.a.)', cdi: 'CDI +', ipca: 'IPCA +', pctcdi: '% CDI' }[p.tipo] || p.tipo;
  const fluxoLabel = { bullet: 'Bullet', distribuido: 'Distribuído', reinvestido: 'Reinvestido' }[p.fluxoPagamento] || p.fluxoPagamento;
  const partes = [`${indexadorLabel} ${p.taxa}`, p.cashSweep ? 'Cash Sweep' : fluxoLabel, p.isento ? 'isento' : 'tributado'];
  if (p.valorMinimo) partes.push(`mín. ${fmtBRL(Number(p.valorMinimo))}`);
  if (p.vencimento) partes.push(`vence ${p.vencimento.split('-').reverse().join('/')}`);
  return partes.join(' · ');
}

// Preenche o select "Filtrar por Produto" com os nomes únicos do catálogo, restrito ao Tipo
// selecionado (se houver) — evita listar produtos de outra categoria como opção de nome.
function cpAtualizarFiltroNome() {
  const tipoSelecionado = document.getElementById('catalogoFiltroTipo').value;
  const nomeSelect = document.getElementById('catalogoFiltroNome');
  const nomeAtual = nomeSelect.value;
  const nomes = [...new Set(
    produtosRegistrados
      .filter((p) => !tipoSelecionado || p.categoria === tipoSelecionado)
      .map((p) => p.nome)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  nomeSelect.innerHTML = '<option value="">Todos os produtos</option>'
    + nomes.map((n) => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
  if (nomes.includes(nomeAtual)) nomeSelect.value = nomeAtual;
}

async function cpCarregarLista() {
  const lista = document.getElementById('catalogoLista');
  const busca = document.getElementById('catalogoBusca').value;
  try {
    const resp = await fetch(`/api/produtos?busca=${encodeURIComponent(busca)}`);
    const data = await resp.json();
    produtosRegistrados = data.produtos || [];
    atualizarTodosDatalists();
    cpAtualizarFiltroNome();

    const filtroTipo = document.getElementById('catalogoFiltroTipo').value;
    const filtroNome = document.getElementById('catalogoFiltroNome').value;
    const filtrados = produtosRegistrados.filter((p) =>
      (!filtroTipo || p.categoria === filtroTipo) && (!filtroNome || p.nome === filtroNome));

    if (!filtrados.length) {
      lista.innerHTML = `<div class="hist-vazio">${produtosRegistrados.length ? 'Nenhum produto bate com esse filtro.' : 'Nenhum produto cadastrado ainda.'}</div>`;
      return;
    }
    lista.innerHTML = filtrados.map((p) => `
      <div class="prod-item" data-id="${p.id}">
        <div class="prod-info">
          <span class="nome">${escapeHtmlCliente(p.nome)}</span><span class="cat">${escapeHtmlCliente(p.categoria)}</span>
          <div class="resumo">${escapeHtmlCliente(cpResumoProduto(p))}</div>
        </div>
        <div class="prod-actions">
          <button class="btn secondary small cp-usar" type="button">Usar</button>
          <button class="btn secondary small cp-editar" type="button">Editar</button>
          <button class="btn danger small cp-remover" type="button">Remover</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    lista.innerHTML = `<div class="hist-vazio">Não foi possível carregar o catálogo: ${err.message}</div>`;
  }
}

document.getElementById('catalogoLista').addEventListener('click', async (e) => {
  const item = e.target.closest('.prod-item');
  if (!item) return;
  const produto = produtosRegistrados.find((p) => p.id === item.dataset.id);
  if (!produto) return;

  if (e.target.classList.contains('cp-usar')) {
    addLinha({
      nome: produto.nome,
      tipoProdutoLabel: produto.categoria,
      tipo: produto.tipo,
      taxa: produto.taxa,
      valorMinimo: produto.valorMinimo,
      vencimento: produto.vencimento || '',
      isento: produto.isento,
      pagaCupomMensal: produto.fluxoPagamento === 'distribuido' || produto.fluxoPagamento === 'reinvestido',
      reinvestir: produto.fluxoPagamento === 'reinvestido',
      cashSweep: produto.cashSweep,
      periodicidadeCupom: produto.periodicidadeCupom,
      periodicidadeJurosCashSweep: produto.periodicidadeJurosCashSweep,
      periodicidadeAmortizacaoCashSweep: produto.periodicidadeAmortizacaoCashSweep,
    });
  } else if (e.target.classList.contains('cp-editar')) {
    document.getElementById('cp-id').value = produto.id;
    document.getElementById('cp-categoria').value = produto.categoria;
    document.getElementById('cp-nome').value = produto.nome;
    document.getElementById('cp-tipo').value = produto.tipo;
    document.getElementById('cp-taxa').value = produto.taxa;
    document.getElementById('cp-valorMinimo').value = produto.valorMinimo || '';
    document.getElementById('cp-vencimento').value = produto.vencimento || '';
    document.getElementById('cp-isento').checked = !!produto.isento;
    document.getElementById('cp-fluxoPagamento').value = produto.fluxoPagamento;
    document.getElementById('cp-cashSweep').checked = !!produto.cashSweep;
    document.getElementById('cp-periodicidade').value = produto.periodicidadeCupom || 'mensal';
    document.getElementById('cp-periodicidadeJurosCS').value = produto.periodicidadeJurosCashSweep || 'mensal';
    document.getElementById('cp-periodicidadeAmortCS').value = produto.periodicidadeAmortizacaoCashSweep || 'mensal';
    cpAtualizarModoCashSweep();
    document.getElementById('cp-cancelarEdicao').style.display = 'inline-block';
    document.getElementById('cp-salvar').textContent = 'Salvar Alterações';
    document.querySelector('[data-catalogo-tab="cadastrar"]').click();
    document.getElementById('catalogoCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (e.target.classList.contains('cp-remover')) {
    const confirmado = await confirmarAcao(`Tem certeza que deseja excluir o produto "${produto.nome}" do catálogo? Esta ação não pode ser desfeita.`);
    if (!confirmado) return;
    await fetch(`/api/produtos/${produto.id}`, { method: 'DELETE' });
    cpCarregarLista();
  }
});

document.getElementById('cp-cancelarEdicao').addEventListener('click', cpLimparFormulario);

document.getElementById('catalogoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('cp-nome').value.trim();
  if (!nome) { document.getElementById('cp-nome').focus(); return; }

  const taxaEl = document.getElementById('cp-taxa');
  const valorMinimoEl = document.getElementById('cp-valorMinimo');
  if (Number(taxaEl.value) < 0) { alert('A taxa não pode ser negativa.'); taxaEl.focus(); return; }
  if (Number(valorMinimoEl.value) < 0) { alert('O valor mínimo não pode ser negativo.'); valorMinimoEl.focus(); return; }

  const payload = {
    id: document.getElementById('cp-id').value || undefined,
    categoria: document.getElementById('cp-categoria').value,
    nome,
    tipo: document.getElementById('cp-tipo').value,
    taxa: Number(document.getElementById('cp-taxa').value || 0),
    valorMinimo: Number(document.getElementById('cp-valorMinimo').value || 0) || null,
    vencimento: document.getElementById('cp-vencimento').value || null,
    isento: document.getElementById('cp-isento').checked,
    fluxoPagamento: document.getElementById('cp-fluxoPagamento').value,
    cashSweep: document.getElementById('cp-cashSweep').checked,
    periodicidadeCupom: document.getElementById('cp-periodicidade').value,
    periodicidadeJurosCashSweep: document.getElementById('cp-periodicidadeJurosCS').value,
    periodicidadeAmortizacaoCashSweep: document.getElementById('cp-periodicidadeAmortCS').value,
  };

  await fetch('/api/produtos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  cpLimparFormulario();
  cpCarregarLista();
});

let buscaCatalogoTimeout = null;
document.getElementById('catalogoBusca').addEventListener('input', () => {
  clearTimeout(buscaCatalogoTimeout);
  buscaCatalogoTimeout = setTimeout(cpCarregarLista, 300);
});

// --- Importação em lote do catálogo via CSV ---

// Parser CSV minimalista (RFC 4180: suporta campos entre aspas com vírgulas/quebras de linha
// internas e aspas duplicadas escapadas) — sem dependência externa, suficiente pra planilhas simples.
function parseCSV(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else dentroAspas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ',') {
      linha.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      linhas.push(linha); linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

const CSV_CAMPO_POR_CABECALHO = {
  categoria: 'categoria', nome: 'nome', indexador: 'indexador', taxa: 'taxa',
  valorminimo: 'valorMinimo', vencimento: 'vencimento', isento: 'isento',
  fluxopagamento: 'fluxoPagamento', cashsweep: 'cashSweep',
  periodicidadecupom: 'periodicidadeCupom',
  periodicidadejuroscashsweep: 'periodicidadeJurosCashSweep',
  periodicidadeamortizacaocashsweep: 'periodicidadeAmortizacaoCashSweep',
};
const CSV_INDEXADOR_MAP = {
  'prefixado (a.m.)': 'fixo', fixo: 'fixo',
  'prefixado (a.a.)': 'fixoAA', fixoaa: 'fixoAA',
  'cdi+': 'cdi', 'cdi +': 'cdi', cdi: 'cdi',
  'ipca+': 'ipca', 'ipca +': 'ipca', ipca: 'ipca',
  '% cdi': 'pctcdi', pctcdi: 'pctcdi',
};
const CSV_FLUXO_MAP = { bullet: 'bullet', 'distribuído': 'distribuido', distribuido: 'distribuido', reinvestido: 'reinvestido' };
const CSV_CATEGORIAS_VALIDAS = ['CRA', 'CRI', 'Debênture', 'Operações Estruturadas', 'Precatório Estadual', 'Precatório Federal', 'Precatório Municipal', 'Recebível Judicial'];

function csvNormalizarCategoria(v) {
  const alvo = (v || '').trim().toLowerCase();
  const achou = CSV_CATEGORIAS_VALIDAS.find((c) => c.toLowerCase() === alvo);
  if (!achou) throw new Error(`categoria "${v}" não reconhecida`);
  return achou;
}
function csvNormalizarIndexador(v) {
  const achou = CSV_INDEXADOR_MAP[(v || '').trim().toLowerCase()];
  if (!achou) throw new Error(`indexador "${v}" não reconhecido`);
  return achou;
}
function csvNormalizarFluxo(v) {
  if (!v || !v.trim()) return 'bullet';
  const achou = CSV_FLUXO_MAP[v.trim().toLowerCase()];
  if (!achou) throw new Error(`fluxo de pagamento "${v}" não reconhecido`);
  return achou;
}
function csvNormalizarBooleano(v) {
  const alvo = (v || '').trim().toLowerCase();
  return alvo === 'sim' || alvo === 'true' || alvo === '1' || alvo === 'x';
}
function csvNormalizarPeriodicidade(v) {
  return (v || '').trim().toLowerCase() === 'semestral' ? 'semestral' : 'mensal';
}
function csvNormalizarData(v) {
  if (!v || !v.trim()) return null;
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`data "${v}" inválida (use DD/MM/AAAA)`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function csvLinhaParaProduto(obj) {
  if (!obj.nome || !obj.nome.trim()) throw new Error('nome é obrigatório');
  return {
    categoria: csvNormalizarCategoria(obj.categoria),
    nome: obj.nome.trim(),
    tipo: csvNormalizarIndexador(obj.indexador),
    taxa: Number(String(obj.taxa || '0').replace(',', '.')),
    valorMinimo: obj.valorMinimo && obj.valorMinimo.trim() ? Number(String(obj.valorMinimo).replace(',', '.')) : null,
    vencimento: csvNormalizarData(obj.vencimento),
    isento: csvNormalizarBooleano(obj.isento),
    fluxoPagamento: csvNormalizarFluxo(obj.fluxoPagamento),
    cashSweep: csvNormalizarBooleano(obj.cashSweep),
    periodicidadeCupom: csvNormalizarPeriodicidade(obj.periodicidadeCupom),
    periodicidadeJurosCashSweep: csvNormalizarPeriodicidade(obj.periodicidadeJurosCashSweep),
    periodicidadeAmortizacaoCashSweep: csvNormalizarPeriodicidade(obj.periodicidadeAmortizacaoCashSweep),
  };
}

const CSV_INDEXADOR_LABEL = { fixo: 'Prefixado (a.m.)', fixoAA: 'Prefixado (a.a.)', cdi: 'CDI+', ipca: 'IPCA+', pctcdi: '% CDI' };
const CSV_FLUXO_LABEL = { bullet: 'Bullet', distribuido: 'Distribuído', reinvestido: 'Reinvestido' };
const CSV_PERIODICIDADE_LABEL = { mensal: 'Mensal', semestral: 'Semestral' };

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvBaixarArquivo(nomeArquivo, conteudo) {
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('catalogoExportar').addEventListener('click', async () => {
  const btn = document.getElementById('catalogoExportar');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exportando…';
  try {
    const resp = await fetch('/api/produtos');
    const data = await resp.json();
    const produtos = data.produtos || [];
    const cabecalho = 'Categoria,Nome,Indexador,Taxa,ValorMinimo,Vencimento,Isento,FluxoPagamento,CashSweep,PeriodicidadeCupom,PeriodicidadeJurosCashSweep,PeriodicidadeAmortizacaoCashSweep';
    const linhas = produtos.map((p) => [
      p.categoria,
      p.nome,
      CSV_INDEXADOR_LABEL[p.tipo] || p.tipo,
      p.taxa,
      p.valorMinimo ?? '',
      p.vencimento ? p.vencimento.split('-').reverse().join('/') : '',
      p.isento ? 'Sim' : 'Não',
      CSV_FLUXO_LABEL[p.fluxoPagamento] || p.fluxoPagamento,
      p.cashSweep ? 'Sim' : 'Não',
      CSV_PERIODICIDADE_LABEL[p.periodicidadeCupom] || 'Mensal',
      CSV_PERIODICIDADE_LABEL[p.periodicidadeJurosCashSweep] || 'Mensal',
      CSV_PERIODICIDADE_LABEL[p.periodicidadeAmortizacaoCashSweep] || 'Mensal',
    ].map(csvEscape).join(','));
    const conteudo = [cabecalho, ...linhas].join('\r\n');
    const dataHoje = new Date().toISOString().slice(0, 10);
    csvBaixarArquivo(`catalogo_produtos_${dataHoje}.csv`, conteudo);
  } catch (err) {
    alert(`Não foi possível exportar o catálogo: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

document.getElementById('catalogoBaixarModelo').addEventListener('click', () => {
  const conteudo = [
    'Categoria,Nome,Indexador,Taxa,ValorMinimo,Vencimento,Isento,FluxoPagamento,CashSweep,PeriodicidadeCupom,PeriodicidadeJurosCashSweep,PeriodicidadeAmortizacaoCashSweep',
    'CRI,CRI Exemplo A,CDI+,2.5,50000,,Não,Distribuído,Não,Mensal,,',
    'Debênture,Debênture Exemplo B,Prefixado (a.a.),14,,15/12/2028,Não,Bullet,Não,,,',
    'CRA,CRA Exemplo C,IPCA+,6,20000,,Sim,Bullet,Não,,,',
  ].join('\r\n');
  csvBaixarArquivo('catalogo_produtos_modelo.csv', conteudo);
});

document.getElementById('catalogoImportarInput').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  const resultadoEl = document.getElementById('catalogoImportarResultado');
  resultadoEl.textContent = 'Lendo arquivo…';

  const texto = await arquivo.text();
  const linhasCsv = parseCSV(texto);
  if (linhasCsv.length < 2) {
    resultadoEl.textContent = 'Arquivo vazio ou sem linhas de dados.';
    e.target.value = '';
    return;
  }

  const cabecalhos = linhasCsv[0].map((h) => h.trim().toLowerCase());
  const erros = [];
  const produtos = [];
  for (let i = 1; i < linhasCsv.length; i++) {
    const obj = {};
    cabecalhos.forEach((h, idx) => {
      const campo = CSV_CAMPO_POR_CABECALHO[h];
      if (campo) obj[campo] = linhasCsv[i][idx] || '';
    });
    try {
      produtos.push(csvLinhaParaProduto(obj));
    } catch (err) {
      erros.push(`Linha ${i + 1}: ${err.message}`);
    }
  }

  let salvos = 0;
  if (produtos.length) {
    try {
      const resp = await fetch('/api/produtos/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos }),
      });
      const data = await resp.json();
      salvos = (data.salvos || []).length;
      (data.erros || []).forEach((er) => erros.push(`"${er.nome}": ${er.mensagem}`));
    } catch (err) {
      erros.push(`Falha ao enviar ao servidor: ${err.message}`);
    }
  }

  resultadoEl.innerHTML = `<b>${salvos}</b> produto(s) importado(s) com sucesso.`
    + (erros.length ? `<br><span style="color:#7a2b2b;">${erros.length} erro(s):<br>${erros.map(escapeHtmlCliente).join('<br>')}</span>` : '');
  e.target.value = '';
  cpCarregarLista();
});

// Abas "Catálogo" / "Cadastrar Produto" dentro do card de Produtos — Catálogo é a aba padrão,
// já que consultar/reaproveitar um produto já cadastrado é o uso mais comum do dia a dia.
document.querySelectorAll('[data-catalogo-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-catalogo-tab]').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    const aba = btn.dataset.catalogoTab;
    document.getElementById('catalogoTabCatalogo').style.display = aba === 'catalogo' ? '' : 'none';
    document.getElementById('catalogoForm').style.display = aba === 'cadastrar' ? '' : 'none';
  });
});

document.getElementById('catalogoFiltroTipo').innerHTML = 'Todos os tipos,CRA,CRI,Debênture,Operações Estruturadas,Precatório Estadual,Precatório Federal,Precatório Municipal,Recebível Judicial'
  .split(',').map((c, i) => `<option value="${i === 0 ? '' : c}">${c}</option>`).join('');
document.getElementById('catalogoFiltroTipo').addEventListener('change', () => {
  cpAtualizarFiltroNome();
  cpCarregarLista();
});
document.getElementById('catalogoFiltroNome').addEventListener('change', cpCarregarLista);

document.getElementById('toggleCatalogo').addEventListener('click', () => {
  const card = document.getElementById('catalogoCard');
  const abrindo = card.style.display === 'none';
  card.style.display = abrindo ? 'block' : 'none';
  if (abrindo) {
    document.querySelector('[data-catalogo-tab="catalogo"]').click();
    cpCarregarLista();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  nvAtualizarBotaoAtivoHeader();
});
document.getElementById('fecharCatalogo').addEventListener('click', () => {
  document.getElementById('catalogoCard').style.display = 'none';
  nvAtualizarBotaoAtivoHeader();
});

document.getElementById('toggleHistorico').addEventListener('click', () => {
  const wrap = document.getElementById('historicoWrap');
  const btn = document.getElementById('toggleHistorico');
  const abrindo = wrap.style.display === 'none';
  wrap.style.display = abrindo ? 'block' : 'none';
  btn.textContent = abrindo ? 'Ocultar' : 'Mostrar';
  if (abrindo && !historicoCarregado) {
    historicoCarregado = true;
    carregarHistorico();
  }
});

let buscaHistoricoTimeout = null;
document.getElementById('historicoBusca').addEventListener('input', () => {
  clearTimeout(buscaHistoricoTimeout);
  buscaHistoricoTimeout = setTimeout(carregarHistorico, 300);
});
document.getElementById('historicoFiltroAssessor').addEventListener('change', carregarHistorico);
