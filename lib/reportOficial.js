// Relatório no layout do site oficial da GCB (Visão Consolidada + Simulações Individuais) — usado
// para os dois modelos, Renda Mensal e Crescimento de Patrimônio. Na Renda Mensal, cada card de
// ativo destaca o "Juros Mensais (líquido)" recebido periodicamente (Caso A do motor de cálculo:
// cupom distribuído, não reinvestido, descontado do fluxo — ver lib/calculo.js).

const { calcularCarteira, aliquotaIR, diasEntre, capitalizarComposto } = require('./calculo');
const { interpolar } = require('./anbima');
const { gerarLinhaComparativaSVG, gerarFluxoCupomSVG, gerarFluxoCashSweepSVG, paletaCores, escapeHtml } = require('./svgCharts');
const { dataDDMMAAAA, dataPorExtenso, parseDataLocal } = require('./format');
const { CAPA_CSS, gerarCapaHtml, logoBrancoHtml } = require('./capa');
const { gerarCapaNovacaoHtml } = require('./capaNovacao');
const { COLORS, FONT_BODY } = require('./brand');

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:${FONT_BODY}; color:#2a2a1e; background:#e7e2d5; }

  ${CAPA_CSS}

  /* Páginas de conteúdo com tamanho A4 fixo — cabeçalho e rodapé embutidos em CADA página (mesma
     técnica comprovada do template de capa), em vez de position:fixed (que se mostrou instável no
     motor de paginação do headless Chrome/print-to-pdf: gerava páginas em branco e cortava conteúdo). */
  .page-oficial { width:210mm; height:297mm; position:relative; page-break-after:always; overflow:hidden; background:#e7e2d5; }
  .page-oficial:last-child { page-break-after:auto; }
  .page-oficial .conteudo { padding: 14mm 12mm 24mm 12mm; }

  .page-header { background:${COLORS.verdeEscuro}; border-radius:14px; padding:14px 24px; display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .page-header .titulo { color:${COLORS.verdeClaro}; font-size:17px; font-weight:800; }
  .page-header .logo { height:17px; }
  .page-header .logo img { height:100%; display:block; }

  .page-footer { position:absolute; bottom:0; left:0; right:0; background:${COLORS.verdeEscuro}; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
  .page-footer .disclaimer { font-size:7px; line-height:1.5; color:#a9a98f; }
  .page-footer .disclaimer .autor { font-weight:700; color:#fff; }
  .page-footer .pagenum { font-size:12px; font-weight:800; color:#fff; white-space:nowrap; }

  .footnotes { background:#f2efe6; border-radius:10px; padding:12px 16px; font-size:7.6px; line-height:1.5; color:#5a5847; margin-bottom:18px; }
  .footnotes p { margin:0 0 4px 0; }

  h2.section { font-size:22px; font-weight:800; text-align:center; margin: 22px 0 14px 0; color:#1f1f14; }

  .consolidada-card { background:#fff; border-radius:14px; padding:20px 24px; display:flex; align-items:center; gap:22px; box-shadow:0 1px 3px rgba(0,0,0,0.08); page-break-inside:avoid; }
  .metric-list { display:flex; flex-direction:column; gap:10px; flex:0 0 220px; }
  .metric-row { background:#f4f2ea; border-radius:8px; padding:9px 12px; display:flex; justify-content:space-between; align-items:center; position:relative; overflow:hidden; }
  .metric-row .lbl { font-size:10.5px; font-weight:700; color:#2a2a1e; }
  .metric-row .lbl .lbl-sub { display:block; font-weight:400; font-size:8.5px; color:#8a886f; margin-top:1px; }
  .metric-row .val { font-size:11px; font-weight:700; color:#1f1f14; white-space:nowrap; }
  .metric-row.neg .val { color:#8a4a4a; }
  .metric-row::after { content:''; position:absolute; right:0; top:0; bottom:0; width:4px; background:${COLORS.verdeClaro}; }
  .metric-row.neg::after { background:#8a4a4a; }
  .metric-row.rentab::after { background:#5b7d3a; }
  .metric-row.jm { background:#eef3e2; }
  .metric-row.jm .val { color:#28451a; }
  .metric-row.jm::after { background:#5b7d3a; }

  .donut-wrap { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; }
  .donut-center-t2 { font-size:10px; fill:#5a5847; font-weight:700; }
  .donut-center-v2 { font-size:13px; fill:#1f1f14; font-weight:800; }

  .legend-list { display:flex; flex-direction:column; gap:8px; flex:1; min-width:150px; }
  .legend-row { display:flex; align-items:center; gap:10px; font-size:10.5px; }
  .legend-row .nome { width:80px; color:#2a2a1e; }
  .legend-row .bar-track { flex:1; height:8px; border-radius:4px; overflow:hidden; }
  .legend-row .bar-fill { display:block; width:100%; height:100%; border-radius:4px; }
  .legend-row .pctval { width:44px; text-align:right; font-weight:700; color:#1f1f14; }

  .indexadores-card { background:#fff; border-radius:14px; padding:18px 24px; margin-top:14px; box-shadow:0 1px 3px rgba(0,0,0,0.08); page-break-inside:avoid; }
  .indexadores-card .titulo-mini { font-size:11px; font-weight:800; color:#2a2a1e; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.4px; }
  .indexadores-bar { display:flex; width:100%; height:14px; border-radius:7px; overflow:hidden; background:#eee9d8; margin-bottom:14px; }
  .indexadores-legend { display:flex; gap:28px; flex-wrap:wrap; }
  .indexadores-legend .item { display:flex; align-items:center; gap:7px; font-size:11px; color:#2a2a1e; }
  .indexadores-legend .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .indexadores-legend .pct { font-weight:800; color:#1f1f14; }

  .stats-extra-card { background:#fff; border-radius:14px; padding:16px 24px; margin-top:14px; box-shadow:0 1px 3px rgba(0,0,0,0.08); display:flex; gap:32px; page-break-inside:avoid; }
  .stats-extra-card .stat-item { flex:1; }
  .stats-extra-card .stat-lbl { font-size:10px; font-weight:700; color:#5a5847; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:5px; }
  .stats-extra-card .stat-val { font-size:16px; font-weight:800; color:#1f1f14; }
  .stats-extra-card .stat-sub { font-size:10.5px; font-weight:600; color:#8a886f; }

  /* Cards para caber 3 por página (em vez de 2), com espaçamento generoso para ocupar bem a página. */
  .sim-card { margin-top:16px; page-break-inside:avoid; }
  .sim-header { background:#4f4f38; border-radius:10px 10px 0 0; padding:11px 18px; display:flex; align-items:center; gap:14px; color:#fff; }
  .sim-header .prod { flex:0 0 185px; min-width:0; }
  .sim-header .prod .cat { font-size:8.5px; color:#c7c9b0; text-transform:uppercase; line-height:1.4; }
  .sim-header .prod .tag-sweep { background:${COLORS.verdeClaro}; color:${COLORS.verdeEscuro}; border-radius:4px; padding:1px 5px; font-size:7.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.3px; display:inline-block; margin-left:4px; white-space:nowrap; }
  .sim-header .prod .nome { font-size:12.5px; font-weight:800; white-space:normal; overflow-wrap:break-word; line-height:1.25; margin-top:1px; }
  .sim-header .campo { flex:0 0 auto; text-align:left; white-space:nowrap; }
  .sim-header .campo .lbl { font-size:8px; color:#c7c9b0; white-space:nowrap; }
  .sim-header .campo .val { font-size:10.5px; font-weight:700; white-space:nowrap; }
  .sim-header .campo-fluxo { flex:1 1 150px; min-width:110px; white-space:normal; }
  .sim-header .campo-fluxo .val { white-space:normal; }
  .sim-header .taxa { flex:0 0 auto; font-size:13.5px; font-weight:800; color:#c9e3a3; text-align:right; white-space:nowrap; margin-left:auto; }

  .sim-body { background:#f2efe6; border-radius:0 0 10px 10px; padding:14px 18px; display:flex; gap:16px; }
  .sim-metrics { flex:0 0 225px; display:flex; flex-direction:column; gap:8px; }
  .sim-metrics .metric-row { padding:8px 12px; }
  .sim-metrics .metric-row .lbl { font-size:10px; }
  .sim-metrics .metric-row .val { font-size:10.5px; }
  .sim-chart-card { flex:1; background:#fff; border-radius:8px; padding:11px 14px; display:flex; flex-direction:column; }
  .sim-chart-legend { display:flex; flex-wrap:wrap; gap:5px 16px; font-size:8.5px; margin-top:auto; padding-top:10px; color:#5a5847; }
  .sim-chart-legend .row { display:flex; align-items:center; gap:4px; }
  .sim-chart-legend .dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
  /* Selo no topo do gráfico identificando o TIPO de gráfico (fluxo distribuído vs. evolução do
     capital) — as duas famílias já usam cores/traçados diferentes, mas o selo deixa explícito, sem
     o leitor precisar inferir a partir da forma do gráfico. */
  .sim-chart-tags { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .sim-chart-tag { display:inline-block; font-size:7.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.3px; border-radius:4px; padding:2px 7px; }
  .sim-chart-tag.evolucao { background:#eaf3dd; color:#3d5a26; }
  .sim-chart-tag.fluxo { background:#e8e6da; color:#5a5847; }
  .sim-chart-tag.ir { background:#f5ead0; color:#7a5a1a; }
  .sim-chart-tag.ir.isento { background:#eaf3dd; color:#3d5a26; }

  .metod-box { background:#fff; border:1px solid #d8d4c4; border-radius:14px; padding:18px 22px; margin-top:24px; font-size:9px; line-height:1.55; color:#3a3a28; page-break-inside:avoid; }
  .metod-box h3 { font-size:15px; margin:0 0 12px 0; color:#1f1f14; }
  .metod-box h4 { font-size:10.5px; margin:12px 0 4px 0; color:#1f1f14; }
  .metod-box h4:first-of-type { margin-top:0; }
  .metod-box p { margin:0 0 4px 0; }

  /* Relatório de Novação de Debênture — resumo executivo (capa + tabela "De → Para" ou tabela-resumo
     + premissas). Ver .nov-comparativo / .nov-tabela-resumo mais abaixo para as tabelas; estas classes
     cobrem os blocos de destaque (ganho, gráfico, notas) compartilhados entre uma e várias debêntures. */
  .nov-ganho-box { background:${COLORS.verdeClaro}; color:${COLORS.verdeEscuro}; border-radius:14px; padding:14px 22px; margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:20px; page-break-inside:avoid; }
  .nov-ganho-box .titulo { font-size:13px; font-weight:800; }
  .nov-ganho-box .sub { font-size:10px; font-weight:600; margin-top:2px; color:#28451a; }
  .nov-ganho-box .valor { font-size:26px; font-weight:800; white-space:nowrap; }
  .nov-vencida-box { background:#f2efe6; border-radius:10px; padding:10px 16px; font-size:9px; line-height:1.45; color:#5a5847; margin-top:10px; }
  .nov-vencida-box b { color:#2a2a1e; }
  .nov-vencida-box p { margin:0; }
  .nov-vencida-box p + p { margin-top:4px; padding-top:4px; border-top:1px solid #e2ded0; }

  /* Resumo executivo (relatório curto) — uma "ficha" por lado (Atual / Resgate+Reaplicação / Nova
     Debênture) em vez de uma tabela só, porque os dois lados têm listas de campos de tamanhos
     diferentes (a Atual tem mais campos de contexto que a Nova); e um bloco de cálculo compacto
     (valor atual → valor futuro → IR → líquido) demonstrando como o Ganho Líquido foi obtido, sem
     reproduzir o memorial de cálculo completo (etapa a etapa dos dois cenários) que o relatório
     antigo mostrava. */
  .nov-fichas { display:flex; gap:12px; margin-top:10px; }
  .nov-ficha { flex:1; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .nov-ficha .cabecalho { background:#4f4f38; color:#fff; padding:10px 14px; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
  .nov-ficha.destaque .cabecalho { background:#3a5a26; }
  .nov-ficha .linha { display:flex; justify-content:space-between; gap:8px; padding:7px 14px; font-size:10px; border-bottom:1px solid #ece8dc; }
  .nov-ficha .linha:last-child { border-bottom:none; }
  .nov-ficha .linha .lbl { color:#5a5847; }
  .nov-ficha .linha .val { font-weight:700; color:#1f1f14; text-align:right; white-space:nowrap; }
  .nov-comparativo-nota { font-size:9px; color:#8a886f; margin:6px 2px 0; font-style:italic; }

  /* Destaque da queda de alíquota de IR com a novação — dado que o cliente costuma valorizar tanto
     quanto o ganho em reais, mas que ficava só implícito numa frase (ver montarFrasePorqueVale). */
  .nov-ir-destaque { background:#eef3e2; border-radius:10px; padding:10px 16px; margin-top:10px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .nov-ir-destaque .lbl { font-size:10.5px; font-weight:800; color:#28451a; text-transform:uppercase; letter-spacing:.03em; }
  .nov-ir-destaque .sub { font-size:9px; color:#5a7a4a; margin-top:2px; }
  .nov-ir-destaque .valores { font-size:14px; font-weight:800; color:#28451a; white-space:nowrap; }

  .nov-calculo { background:#fff; border-radius:14px; padding:12px 16px; margin-top:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); page-break-inside:avoid; }
  .nov-calculo .titulo-mini { font-size:10px; font-weight:800; color:#5a5847; text-transform:uppercase; letter-spacing:.03em; margin-bottom:6px; }
  .nov-calculo .linha { display:flex; justify-content:space-between; font-size:11px; padding:4px 0; color:#2a2a1e; }
  .nov-calculo .linha.neg .val { color:#8a4a4a; }
  .nov-calculo .linha.final { border-top:1px solid #d8d4c4; margin-top:4px; padding-top:7px; font-weight:800; font-size:12px; }

  .obs { display:inline-block; font-size:7.5px; font-weight:700; text-transform:uppercase; letter-spacing:.02em; color:#8a6a1e; background:#f5ecdc; border-radius:4px; padding:2px 5px; margin:2px 4px 0 0; }
  .nov-legenda { font-size:8.5px; color:#8a886f; line-height:1.5; margin-top:6px; }
  .nov-posicao-titulo { font-size:13px; font-weight:800; color:#1f1f14; margin:2px 2px 4px; }
`;

function tipoAnnualPct(ativo) {
  if (ativo.tipo === 'fixo') return (Math.pow(1 + ativo.taxaAM, 12) - 1) * 100;
  if (ativo.tipo === 'fixoAA') return ativo.taxaAA * 100;
  return null;
}

function taxaLabelOficial(ativo) {
  if (ativo.tipo === 'fixo' || ativo.tipo === 'fixoAA') {
    return `${tipoAnnualPct(ativo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.`;
  }
  if (ativo.tipo === 'pctcdi') {
    return `${(ativo.percentualCDI * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% do CDI`;
  }
  const prefixo = ativo.tipo === 'cdi' ? 'CDI' : 'IPCA';
  return `${prefixo} + ${(ativo.spread * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.`;
}

function categoriaLabel(tipoProdutoLabel) {
  if (tipoProdutoLabel === 'Debêntures') return 'Debênture';
  return tipoProdutoLabel;
}

function brl2(v) {
  const sinal = v < 0 ? '-' : '';
  return `${sinal}R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct2(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Roda DENTRO do Chromium (via page.evaluate em lib/pdf.js) — por isso não pode referenciar nada do
// escopo externo (é serializada e reenviada pro browser). Mede, na mesma página de medição montada
// em montarRelatorioOficial, o espaço útil real entre cabeçalho/rodapé e a altura de cada card.
function extrairMedidasCards() {
  const footerTop = document.querySelector('.page-footer').getBoundingClientRect().top;
  const headerBottom = document.getElementById('m-header').getBoundingClientRect().bottom;
  const tituloEl = document.getElementById('m-titulo');
  const tituloBottom = tituloEl ? tituloEl.getBoundingClientRect().bottom : headerBottom;
  const alturasCards = [...document.querySelectorAll('.m-card')].map((el) => {
    const rect = el.getBoundingClientRect();
    const marginTop = parseFloat(getComputedStyle(el).marginTop) || 0;
    return rect.height + marginTop;
  });
  return {
    alturaUtilPrimeira: footerTop - tituloBottom,
    alturaUtilDemais: footerTop - headerBottom,
    alturasCards,
  };
}

// Agrupa os cards em páginas respeitando o espaço útil real (medido) de cada uma — a primeira página
// de "Simulações Individuais" tem menos espaço que as seguintes porque carrega também o título h2.
// Sempre coloca ao menos 1 card por grupo (mesmo que ultrapasse o orçamento) pra nunca travar num
// laço infinito nem perder um card por excesso de zelo.
function agruparCardsPorAltura(alturasCards, alturaUtilPrimeira, alturaUtilDemais) {
  const grupos = [];
  let atual = [];
  let usado = 0;
  alturasCards.forEach((altura, idx) => {
    const orcamento = grupos.length === 0 ? alturaUtilPrimeira : alturaUtilDemais;
    if (atual.length > 0 && usado + altura > orcamento) {
      grupos.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(idx);
    usado += altura;
  });
  if (atual.length) grupos.push(atual);
  return grupos;
}

// Monta uma página A4 fixa com cabeçalho + rodapé embutidos (mesma técnica da capa) — nunca usa
// position:fixed, que se mostrou instável no motor de paginação do headless print-to-pdf. Compartilhada
// entre o relatório de Carteira Simulada e o de Novação de Debênture (mesma identidade visual).
// Rodapé com o disclaimer completo (3 linhas) — extraído à parte pra ser reaproveitado, IDÊNTICO,
// tanto na página real quanto na página de MEDIÇÃO de altura dos cards (ver extrairMedidasCards):
// usar um rodapé mais curto só na medição fazia o algoritmo achar que sobrava mais espaço do que
// realmente sobra (o rodapé real, de 3 linhas, é mais alto e "position:absolute; bottom:0" empurra o
// topo dele pra cima conforme cresce) — resultado: o último card da página vazava por baixo do rodapé
// de verdade, mesmo tendo "cabido" na medição.
function montarDisclaimerFooterHtml(nomeAssessor) {
  return `<div class="disclaimer">
      <div class="autor">Elaborado por ${escapeHtml(nomeAssessor)} · GCB Investimentos</div>
      <div>Material de uso interno · Não constitui oferta pública de valores mobiliários</div>
      <div>Rentabilidade passada não é garantia de rentabilidade futura. Não Invista Antes de Ler as Informações Essenciais da Oferta.</div>
    </div>`;
}

function montarPagina(conteudoHtml, numero, total, nomeAssessor, tituloPagina) {
  return `<div class="page-oficial">
  <div class="conteudo">
    <div class="page-header"><div class="titulo">${escapeHtml(tituloPagina || 'Carteira Simulada')}</div><div class="logo">${logoBrancoHtml()}</div></div>
    ${conteudoHtml}
  </div>
  <div class="page-footer">
    ${montarDisclaimerFooterHtml(nomeAssessor)}
    <div class="pagenum">${numero} / ${total}</div>
  </div>
</div>`;
}

async function montarRelatorioOficial({ cliente, dataBase, ativosInput: ativosInputRaw, curvas, templateType, docTitleSuffix, assessor, medirAlturasCards }) {
  const nomeAssessor = (assessor || '').trim() || 'Vinícius Faria';
  // CRI e CRA são sempre isentos de IR para pessoa física (Lei 11.033/2004, art. 3º, XVII e XVIII) —
  // reforçado aqui para valer independentemente de quem chamou montarRelatorioOficial (não depende do
  // formulário ter marcado a caixa "Isento IR?" corretamente).
  const ativosInput = ativosInputRaw.map((a) => ({
    ...a,
    isento: categoriaLabel(a.tipoProdutoLabel) === 'CRI' || categoriaLabel(a.tipoProdutoLabel) === 'CRA' || a.isento,
  }));
  const ativosCalc = ativosInput.map((a) => ({ ...a, dataBase }));
  const carteira = calcularCarteira(ativosCalc, curvas);
  const viTotal = carteira.viTotal;

  const previstoBrutoTotal = carteira.vfBrutoTotal;
  const irTotal = -(carteira.irTotal); // exibido negativo quando há IR a pagar
  const previstoLiquidoTotal = carteira.vfLiquidoTotal;
  const rentabilidadeTotal = previstoLiquidoTotal - viTotal;
  const temCupomDistribuido = carteira.resultados.some((r) => r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir));
  const temReinvestimento = carteira.resultados.some((r) => !r.ativo.cashSweep && r.ativo.pagaCupomMensal && r.ativo.reinvestir);
  const temCupomMensalDistribuido = carteira.resultados.some((r) => (r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom !== 'semestral');
  const temCupomSemestralDistribuido = carteira.resultados.some((r) => (r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom === 'semestral');
  const temCashSweep = ativosInput.some((a) => a.cashSweep || a.cronogramaPersonalizado);
  const temCronogramaPersonalizado = ativosInput.some((a) => a.cronogramaPersonalizado);
  const todosIsentos = ativosInput.every((a) => a.isento);
  const temCdi = ativosInput.some((a) => a.tipo === 'cdi');
  const temIpca = ativosInput.some((a) => a.tipo === 'ipca');
  const temPctCdi = ativosInput.some((a) => a.tipo === 'pctcdi');
  const subtitulo = templateType === 'renda' ? 'Carteira de juros mensais' : 'Carteira de crescimento de patrimônio';

  // Donut / legenda: agrupado por tipo de produto (categoria), como no site oficial
  const porCategoria = new Map();
  for (const a of ativosInput) {
    const cat = categoriaLabel(a.tipoProdutoLabel);
    porCategoria.set(cat, (porCategoria.get(cat) || 0) + a.vi);
  }
  const categorias = [...porCategoria.entries()]
    .map(([nome, vi]) => ({ nome, vi, pct: (vi / viTotal) * 100 }))
    .sort((a, b) => b.vi - a.vi);
  const cores = paletaCores(categorias.length);

  const R = 70;
  const C = 2 * Math.PI * R;
  let offsetAcumulado = 0;
  const donutCircles = categorias.map((c, i) => {
    const comprimento = (c.pct / 100) * C;
    const svg = `<circle r="${R}" fill="none" stroke="${cores[i]}" stroke-width="26" stroke-dasharray="${comprimento.toFixed(2)} ${(C - comprimento).toFixed(2)}" stroke-dashoffset="${(-offsetAcumulado).toFixed(2)}"/>`;
    offsetAcumulado += comprimento;
    return svg;
  }).join('');

  const legendaHtml = categorias.map((c, i) => (
    `<div class="legend-row"><span class="nome">${escapeHtml(c.nome)}</span><span class="bar-track"><span class="bar-fill" style="background:${cores[i]};"></span></span><span class="pctval">${c.pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></div>`
  )).join('\n        ');

  const totalAbrev = viTotal >= 1000 ? `${Math.round(viTotal / 1000)}K` : viTotal.toLocaleString('pt-BR');

  // Distribuição por indexador (Inflação/Pré/Pós), exibida na Visão Consolidada.
  const INDEXADOR_COR = { 'Inflação': '#c9a227', 'Pré': '#4a7a96', 'Pós': '#5b7d3a' };
  function indexadorGrupo(ativo) {
    if (ativo.tipo === 'ipca') return 'Inflação';
    if (ativo.tipo === 'fixo' || ativo.tipo === 'fixoAA') return 'Pré';
    return 'Pós'; // cdi, pctcdi
  }
  const porIndexador = new Map();
  for (const a of ativosInput) {
    const grupo = indexadorGrupo(a);
    porIndexador.set(grupo, (porIndexador.get(grupo) || 0) + a.vi);
  }
  const indexadores = ['Inflação', 'Pré', 'Pós']
    .filter((nome) => porIndexador.has(nome))
    .map((nome) => ({ nome, pct: (porIndexador.get(nome) / viTotal) * 100 }));

  const indexadoresBarHtml = indexadores.map((ix) => (
    `<span class="seg" style="width:${ix.pct.toFixed(4)}%; background:${INDEXADOR_COR[ix.nome]};"></span>`
  )).join('');

  const indexadoresLegendHtml = indexadores.map((ix) => (
    `<div class="item"><span class="dot" style="background:${INDEXADOR_COR[ix.nome]};"></span>${ix.nome} <span class="pct">${ix.pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></div>`
  )).join('\n        ');

  const partesIndexados = [];
  if (temCdi) partesIndexados.push('nos ativos CDI+, a taxa de referência (DI Futuro) é obtida por interpolação da curva PRE publicada diariamente pela B3');
  if (temIpca) partesIndexados.push('nos ativos IPCA+, a taxa de referência (inflação projetada) é obtida por interpolação da curva de Inflação Implícita (ETTJ) publicada diariamente pela ANBIMA');
  if (temPctCdi) partesIndexados.push('nos ativos % CDI, a taxa de referência (DI Futuro, curva PRE da B3) é multiplicada diretamente pelo percentual contratado (ex.: 110% CDI), sem soma de spread');
  const fraseIndexados = partesIndexados.length
    ? ` Ativos indexados: i = (1 + referência) × (1 + spread) − 1, exceto % CDI, que multiplica a referência direto pelo percentual contratado (sem spread). CDI+ usa a curva DI Futuro (B3); IPCA+ usa a Inflação Implícita/ETTJ (ANBIMA); ambas interpoladas no prazo do ativo.`
    : '';
  const periodicidadeCupomLabel = temCupomMensalDistribuido && temCupomSemestralDistribuido
    ? 'mensal ou semestral, conforme cada ativo'
    : temCupomSemestralDistribuido ? 'semestral' : 'mensal';
  const fraseCupom = temCupomDistribuido
    ? ` Produtos com cupom periódico (${periodicidadeCupomLabel}) pagam os juros na periodicidade contratada, sem reinvestir — o IR de cada pagamento usa a tabela regressiva (22,5%/20,0%/17,5%/15,0%, até 180/360/720/acima de 720 dias) pelo prazo até AQUELE pagamento, então a alíquota efetiva cai ao longo do tempo.`
    : '';
  const fraseCronogramaPersonalizado = temCronogramaPersonalizado
    ? ` Ativo(s) com <b>cronograma personalizado</b>: as datas e os percentuais de amortização (sobre o saldo remanescente em cada parcela) reproduzem os do material de distribuição do próprio ativo, informados no cadastro do produto — não são calculados automaticamente.`
    : '';
  const fraseCashSweep = temCashSweep
    ? ` <h4>Cash Sweep</h4><p>Ativo(s) com <b>Cash Sweep</b>: o principal é amortizado programadamente (não de uma vez no vencimento) e os juros incidem sobre o saldo devedor remanescente, caindo com o tempo. Não considera aceleração além do cronograma programado — consulte os documentos da oferta.${fraseCronogramaPersonalizado}</p>`
    : '';
  const fraseReinvest = temReinvestimento
    ? ' Os juros dos ativos com reinvestimento são reinvestidos a cada pagamento, já líquidos de IR (descontado antes de somar ao saldo) — não por capitalização composta da taxa bruta.'
    : '';
  const temDebentureIsenta = ativosInput.some((a) => categoriaLabel(a.tipoProdutoLabel) === 'Debênture' && a.isento);
  const fraseDebentureIsenta = temDebentureIsenta
    ? ' A isenção aplicada às debêntures pressupõe debênture incentivada (Lei nº 12.431/2011) — confirme nos documentos da oferta; debêntures comuns são tributadas normalmente.'
    : '';
  const fraseIR = (todosIsentos
    ? ' Valores líquidos de IR: todos os ativos desta carteira são isentos para pessoa física.'
    : ' Valores líquidos de IR: CRI/CRA são isentos para pessoa física; os demais seguem a tabela regressiva (22,5%/20,0%/17,5%/15,0%).') + fraseDebentureIsenta;

  // Premissas de mercado efetivamente usadas nesta simulação (curvas cruas, não apenas o resultado
  // já interpolado por ativo) — dá ao leitor como conferir de onde vieram as taxas de referência.
  const pontosPre = curvas.b3Pre ? curvas.b3Pre.pontos : null;
  const preCurto = pontosPre && pontosPre.length ? pontosPre[0] : null;
  const preLongo = pontosPre && pontosPre.length ? pontosPre[pontosPre.length - 1] : null;
  const dataRefB3 = curvas.b3Pre && curvas.b3Pre.dataRef ? dataDDMMAAAA(parseDataLocal(curvas.b3Pre.dataRef)) : null;

  const pontosInfl = curvas.anbima ? curvas.anbima.infl : null;
  const inflCurto = pontosInfl && pontosInfl.length ? pontosInfl[0] : null;
  const inflLongo = pontosInfl && pontosInfl.length ? pontosInfl[pontosInfl.length - 1] : null;
  const dataConsultaAnbima = curvas.anbima && curvas.anbima.fetchedAt ? dataDDMMAAAA(new Date(curvas.anbima.fetchedAt)) : null;

  const linhasMercado = [];
  if ((temCdi || temPctCdi) && preCurto && preLongo) {
    linhasMercado.push(`<p><b>DI Futuro / CDI Futuro (B3)${dataRefB3 ? `, data de referência ${dataRefB3}` : ''}:</b> vértice mais curto da curva ${pct2(preCurto.taxa)}% a.a. · vértice mais longo ${pct2(preLongo.taxa)}% a.a.</p>`);
  }
  if (temIpca && inflCurto && inflLongo) {
    linhasMercado.push(`<p><b>Inflação Implícita / ETTJ (ANBIMA)${dataConsultaAnbima ? `, consultada em ${dataConsultaAnbima}` : ''}:</b> vértice mais curto da curva ${pct2(inflCurto.taxa)}% a.a. · vértice mais longo ${pct2(inflLongo.taxa)}% a.a.</p>`);
  }
  const premissasMercadoHtml = linhasMercado.length
    ? `<h4>Premissas de mercado utilizadas (data-base)</h4>
    ${linhasMercado.join('\n    ')}
    <p>Essas curvas alimentam a taxa efetiva de cada ativo indexado, interpolada no prazo específico até o seu vencimento — o resultado dessa interpolação é exibido em cada card de "Simulações Individuais" (ex.: "100% CDI (X% a.a.)").</p>`
    : '';

  // Prazo médio ponderado (por valor investido) e rentabilidade anualizada equivalente — permitem
  // comparar carteiras com prazos diferentes numa base comum, o que o retorno total acumulado não dá.
  // Anualiza pela DURATION (prazo médio de exposição real do capital), não pelo prazo até o
  // vencimento contratual: em ativos com Cash Sweep/cronograma personalizado, o retorno total
  // (soma nominal dos pagamentos, sem reinvestimento) já reflete um capital que voltou por
  // amortização antecipada bem antes do vencimento — "esticar" essa mesma soma sobre o prazo CHEIO
  // subestimaria bastante a taxa anual equivalente real do ativo (mesmo cálculo de fundo do "%
  // do CDI" abaixo, ver calcularCarteira em lib/calculo.js).
  const prazoMedioAnos = carteira.prazoMedioDias / 365;
  const rentAnualizadaPct = (Math.pow(1 + carteira.retornoLiquidoPct / 100, 365 / carteira.diasDuracaoMedia) - 1) * 100;

  // Explica em linguagem simples o que é o CAGR e por que a base de anualização é a duration, não o
  // prazo contratual — a mesma lógica do comparativo com o CDI logo abaixo, mas isolada aqui porque
  // o CAGR aparece sozinho (sem o "% do CDI" ao lado) no card da Visão Consolidada.
  const fraseCagr = `<h4>Rentabilidade Anualizada Equivalente (CAGR ≈${pct2(rentAnualizadaPct)}% a.a.)</h4>
    <p>CAGR (<i>Compound Annual Growth Rate</i>, "taxa de crescimento anual composta"): a taxa fixa e composta que, aplicada todo ano pelo mesmo período, produziria o mesmo retorno total da carteira — transforma um ganho acumulado (ex.: "${pct2(carteira.retornoLiquidoPct)}% no total") numa taxa "% a.a." comparável diretamente ao CDI, à Selic ou a qualquer outra taxa de mercado.</p>
    <p>A anualização usa a <b>duration</b> (≈${carteira.durationAnos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} anos), não o prazo até o vencimento contratual: em ativos com amortização antecipada (Cash Sweep ou cronograma personalizado), o retorno total já foi ganho num prazo médio de exposição menor que o vencimento — anualizar sobre o prazo cheio sub-representaria a taxa real do ativo.</p>`;

  // Explica de forma auditável como o "≈X% do CDI" da capa foi calculado (usando os mesmos números
  // já produzidos por calcularCarteira) e, no mesmo box, por que ele pode divergir de outras leituras
  // do "% do CDI" que o cliente possa ver em outro lugar — dúvida recorrente, evita a leitura de que
  // um dos números está "errado" quando na verdade são metodologias diferentes.
  const fraseMetodologiaCdi = `<h4>Comparação com o CDI (≈${Math.round(carteira.pctDoCdi)}% do CDI)</h4>
    <p>Retorno líquido da carteira ÷ CDI acumulado na mesma duration — o prazo médio de exposição real do capital (ver "Duration de Fluxo de Caixa" acima), não o prazo até o vencimento contratual, que superestimaria o tempo investido em ativos com amortização antecipada (Cash Sweep ou cronograma personalizado) e penalizaria artificialmente o resultado (${Math.round(carteira.diasDuracaoMedia)} dias corridos, ≈${Math.round(carteira.duDuracaoMedia)} dias úteis; referência DI Futuro/B3 na data-base: ${pct2(carteira.cdiRefMedio)}% a.a. → CDI acumulado ${pct2(carteira.cdiAcumuladoPct)}%). Cálculo: (${pct2(carteira.retornoLiquidoPct)}% ÷ ${pct2(carteira.cdiAcumuladoPct)}%) × 100 ≈ ${Math.round(carteira.pctDoCdi)}%.</p>
    <p>Pode ficar <b>abaixo de 100%</b> mesmo com ativos indexados ao CDI: o CDI acumulado usado aqui é <b>bruto</b> (sem IR), e o retorno da carteira já é <b>líquido</b> — não é sinal de que o produto rendeu menos que o mercado. Também pode ser <b>diferente do % do CDI anunciado no material do produto</b>, que costuma usar uma conta mais simples (taxa bruta contratada ÷ CDI do dia, sem juros compostos e sem IR) — os dois números são corretos, só usam metodologias distintas.</p>`;

  // Nota explicativa em linguagem simples para o cliente entender por que os dois números da "Visão
  // Consolidada" (Prazo Médio e Duration) podem ser diferentes — evita a leitura de que um dos dois
  // está "errado". Só aparece quando os valores realmente divergem (bullet/reinvestido puro faz os
  // dois coincidirem, e nesse caso a nota seria só ruído).
  const divergeDuration = Math.abs(carteira.durationAnos - carteira.prazoMedioAnos) > 0.005;
  const fraseDuration = divergeDuration
    ? `<h4>Prazo Médio até o Vencimento x Duration</h4>
    <p><b>Prazo Médio</b> é a data contratual de devolução do capital. <b>Duration</b> pondera também os cupons/amortizações recebidos no caminho — por isso é menor (≈${carteira.durationAnos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} anos vs. ≈${carteira.prazoMedioAnos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} anos): o capital fica exposto ao risco de prazo por menos tempo do que a data de vencimento sugere.</p>`
    : `<h4>Prazo Médio até o Vencimento x Duration</h4>
    <p>Coincidem nesta carteira: como o(s) produto(s) só devolve(m) o capital no vencimento (sem juros ou amortização antes), não há antecipação de fluxo de caixa a considerar.</p>`;

  const metodBox = `<div class="metod-box">
    <h3>Premissas e Metodologia</h3>
    <h4>Perfil e tipo de investidor</h4>
    <p>Investidores em geral, com perfil de risco moderado, que possuem interesse em renda fixa high yield e foco em retorno de médio e longo prazo. A distribuição é restrita a clientes cujo perfil seja compatível com as características dos ativos.</p>
    <h4>Cenário da simulação</h4>
    <p>O cenário utilizado na simulação é de adimplência integral e nos prazos pactuados, conforme documentos da Oferta. Trata-se de cenário único, de caráter ilustrativo.${fraseReinvest}</p>
    <h4>Metodologia de cálculo (Arts. 12 e 18, III da RCVM 19)</h4>
    <p>Capitalização composta em base 252 dias úteis (convenção ANBIMA/B3), do valor investido em cada ativo, pela taxa contratada, entre a data-base (${dataDDMMAAAA(dataBase)}) e o vencimento: VF = VI × (1 + i)^(dias úteis/252).${fraseIndexados} Não foram consideradas taxas, comissões ou eventos de inadimplência.${fraseCupom}${fraseIR}</p>
    ${premissasMercadoHtml}
    ${fraseDuration}
    ${fraseCagr}
    ${fraseMetodologiaCdi}
    ${fraseCashSweep}
    <h4>Demais premissas</h4>
    <p>Estimativas baseadas nas taxas contratuais e prazos até o vencimento. <b>Rentabilidade passada não garante rentabilidade futura</b>; projeções podem diferir do realizado. Envolve riscos de liquidez, crédito e prazo. O comparativo com o CDI é ilustrativo, usa a projeção vigente na data-base, e a rentabilidade efetiva do CDI pode divergir.</p>
  </div>`;

  const rendaMensalTotal = carteira.resultados.reduce((s, r) => ((r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom !== 'semestral' ? s + r.calc.cupomLiq : s), 0);
  const rendaSemestralTotal = carteira.resultados.reduce((s, r) => ((r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom === 'semestral' ? s + r.calc.cupomLiq : s), 0);
  const jmTotalRow = (temCupomMensalDistribuido
    ? `<div class="metric-row jm"><span class="lbl">Renda Mensal Média Estimada</span><span class="val">${brl2(rendaMensalTotal)}</span></div>`
    : '') + (temCupomSemestralDistribuido
    ? `<div class="metric-row jm"><span class="lbl">Renda Semestral (líq.)</span><span class="val">${brl2(rendaSemestralTotal)}</span></div>`
    : '');

  const consolidada = `
  <div class="consolidada-card">
    <div class="metric-list">
      <div class="metric-row"><span class="lbl">Previsto Bruto</span><span class="val">${brl2(previstoBrutoTotal)}</span></div>
      <div class="metric-row${irTotal < 0 ? ' neg' : ''}"><span class="lbl">Imposto de Renda</span><span class="val">${brl2(irTotal)}</span></div>
      ${jmTotalRow}
      <div class="metric-row"><span class="lbl">Previsto Líquido</span><span class="val">${brl2(previstoLiquidoTotal)}</span></div>
      <div class="metric-row rentab"><span class="lbl">Rentabilidade</span><span class="val">${brl2(rentabilidadeTotal)}</span></div>
    </div>
    <div class="donut-wrap">
      <svg width="150" height="150" viewBox="0 0 190 190">
        <g transform="translate(95,95) rotate(-90)">
          <circle r="${R}" fill="none" stroke="#eee9d8" stroke-width="26"/>
          ${donutCircles}
        </g>
        <text x="95" y="90" text-anchor="middle" class="donut-center-t2">Total Simulado</text>
        <text x="95" y="107" text-anchor="middle" class="donut-center-v2">R$ ${viTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</text>
      </svg>
    </div>
    <div class="legend-list">
      ${legendaHtml}
    </div>
  </div>
  <div class="indexadores-card">
    <div class="titulo-mini">Distribuição por Indexador</div>
    <div class="indexadores-bar">${indexadoresBarHtml}</div>
    <div class="indexadores-legend">
      ${indexadoresLegendHtml}
    </div>
  </div>
  <div class="stats-extra-card">
    <div class="stat-item">
      <div class="stat-lbl">Prazo Médio até o Vencimento</div>
      <div class="stat-val">≈${prazoMedioAnos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} anos <span class="stat-sub">(${Math.round(carteira.prazoMedioDias).toLocaleString('pt-BR')} dias)</span></div>
    </div>
    <div class="stat-item">
      <div class="stat-lbl">Duration de Fluxo de Caixa</div>
      <div class="stat-val">≈${carteira.durationAnos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} anos <span class="stat-sub">ponderada pelos fluxos de caixa reais</span></div>
    </div>
    <div class="stat-item">
      <div class="stat-lbl">Rentabilidade Anualizada Equivalente (CAGR)</div>
      <div class="stat-val">≈${pct2(rentAnualizadaPct)}% a.a. <span class="stat-sub">taxa de crescimento anual composta sobre a duration</span></div>
    </div>
  </div>`;

  const simCardsArr = carteira.resultados.map((r, i) => {
    const a = r.ativo;
    const c = r.calc;
    const dias = diasEntre(dataBase, a.vencimento);
    const du = c.du; // dias úteis reais (calendário nacional) — já calculado em calcularAtivo
    const refCdiIndiv = interpolar(du, curvas.b3Pre.pontos);
    const vfCdiIndiv = capitalizarComposto(a.vi, refCdiIndiv / 100, du);

    const irAtivo = -(c.ir);
    const rentabilidadeAtivo = c.vfLiquido - a.vi;
    const isCronograma = !!a.cronogramaPersonalizado;
    const isCashSweep = !!a.cashSweep || isCronograma;
    const distribuiCupom = !isCashSweep && a.pagaCupomMensal && !a.reinvestir;

    // Ativos com cupom distribuído (ou Cash Sweep / cronograma personalizado) usam um gráfico de fluxo
    // (escada) que separa visualmente o principal da renda recebida; ativos bullet/reinvestidos mantêm
    // a linha diagonal de capitalização composta. Cash Sweep e cronograma personalizado compartilham o
    // mesmo gráfico (saldo devedor caindo + juros somando) — só muda de onde vem a amortização de cada
    // parcela (SAC constante vs. percentuais informados).
    const ehSemestral = c.periodicidadeCupom === 'semestral';
    const periodoLabel = ehSemestral ? 'semestral' : 'mensal';
    const porPeriodoLabel = ehSemestral ? '/ semestre' : '/ mês';
    const periodoAmortLabel = isCashSweep
      ? { semestral: 'semestral', anual: 'anual', personalizada: 'personalizada' }[c.cashSweep.periodicidadeAmortizacao] || 'mensal'
      : 'mensal';

    const chart = isCashSweep
      ? gerarFluxoCashSweepSVG({
          vi: a.vi,
          saldoHistorico: c.cashSweep.saldoHistorico,
          jurosHistorico: c.cashSweep.jurosHistorico,
          mesesTotais: c.cashSweep.mesesTotais,
          vfCdi: vfCdiIndiv,
          dataVencFmt: dataDDMMAAAA(a.vencimento),
        })
      : distribuiCupom
      ? gerarFluxoCupomSVG({
          vi: a.vi,
          cupomLiquidos: c.cupomLiquidos,
          vfCdi: vfCdiIndiv,
          dataVencFmt: dataDDMMAAAA(a.vencimento),
        })
      : gerarLinhaComparativaSVG({
          vi: a.vi,
          vf: c.vfLiquido,
          vfCdi: vfCdiIndiv,
          dataVencFmt: dataDDMMAAAA(a.vencimento),
        });

    // Ativos com cupom distribuído têm o MESMO valor bruto a cada pagamento (só o líquido cai, pela
    // alíquota regressiva); Cash Sweep tem o próprio valor caindo mês a mês (juros sobre saldo devedor
    // decrescente). Nos dois casos, mostrar só o 1º pagamento é enganoso pro cliente estimar sua renda
    // recorrente — a média sobre todos os pagamentos é a estimativa mais representativa do período.
    const mediaJurosLiq = c.cupomLiquidos && c.cupomLiquidos.length
      ? c.cupomLiquidos.reduce((s, v) => s + v, 0) / c.cupomLiquidos.length
      : c.cupomLiq;
    const jmAtivoRow = (distribuiCupom || isCashSweep)
      ? `<div class="metric-row jm"><span class="lbl">Média de Juros ${ehSemestral ? 'Semestrais' : 'Mensais'} (líq.)</span><span class="val">${brl2(mediaJurosLiq)} ${porPeriodoLabel}</span></div>`
      : '';
    const amortAtivoRow = isCashSweep
      ? isCronograma
        ? `<div class="metric-row"><span class="lbl">Amortização (${periodoAmortLabel})</span><span class="val">${c.cashSweep.nAmortizacoes}x, % do saldo por parcela</span></div>`
        : `<div class="metric-row"><span class="lbl">Amortização (${periodoAmortLabel})</span><span class="val">${brl2(c.cashSweep.amortizacaoConstante)} · ${c.cashSweep.nAmortizacoes}x</span></div>`
      : '';

    const legendaGrafico = isCashSweep
      ? `<div class="row"><span class="dot" style="background:#b0ac92"></span>Saldo devedor (amortização ${periodoAmortLabel})</div>
            <div class="row"><span class="dot" style="background:#5b7d3a"></span>Juros recebidos (acumulado, ${periodoLabel})</div>
            <div class="row"><span class="dot" style="background:#9a9a8c"></span>100% CDI (${refCdiIndiv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.)</div>`
      : distribuiCupom
      ? `<div class="row"><span class="dot" style="background:#b0ac92"></span>Principal (não capitalizado)</div>
            <div class="row"><span class="dot" style="background:#5b7d3a"></span>Renda distribuída (acumulada, ${periodoLabel})</div>
            <div class="row"><span class="dot" style="background:#9a9a8c"></span>100% CDI (${refCdiIndiv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.)</div>`
      : `<div class="row"><span class="dot" style="background:${COLORS.verdeClaro}"></span>${escapeHtml(categoriaLabel(a.tipoProdutoLabel))}</div>
            <div class="row"><span class="dot" style="background:#9a9a8c"></span>100% CDI (${refCdiIndiv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.)</div>`;

    const fluxoPagamentoLabel = isCronograma
      ? `Cronograma Personalizado · Juros ${periodoLabel} + Amortização por parcela`
      : isCashSweep
      ? `Cash Sweep · Juros ${periodoLabel} + Amortização ${periodoAmortLabel}`
      : distribuiCupom
      ? `Pagamento ${periodoLabel} de juros`
      : (a.pagaCupomMensal ? `Pagamento ${periodoLabel} de juros (reinvestido)` : 'Pagamento único no vencimento');

    return `<div class="sim-card">
      <div class="sim-header">
        <div class="prod"><div class="cat">${escapeHtml(categoriaLabel(a.tipoProdutoLabel))}${isCronograma ? ' <span class="tag-sweep">Cronograma Personalizado</span>' : a.cashSweep ? ' <span class="tag-sweep">Cash Sweep</span>' : ''}</div><div class="nome">${escapeHtml(a.nome)}</div></div>
        <div class="campo"><div class="lbl">Valor Investido</div><div class="val">${brl2(a.vi)}</div></div>
        <div class="campo"><div class="lbl">Vence em</div><div class="val">${dataDDMMAAAA(a.vencimento)}</div></div>
        <div class="campo campo-fluxo"><div class="lbl">Fluxo de Pagamento</div><div class="val">${fluxoPagamentoLabel}</div></div>
        <div class="taxa">${taxaLabelOficial(a)}</div>
      </div>
      <div class="sim-body">
        <div class="sim-metrics">
          <div class="metric-row"><span class="lbl">Previsto Bruto</span><span class="val">${brl2(c.vfBruto)}</span></div>
          <div class="metric-row${irAtivo < 0 ? ' neg' : ''}"><span class="lbl">Imposto de Renda</span><span class="val">${brl2(irAtivo)}</span></div>
          ${jmAtivoRow}
          ${amortAtivoRow}
          <div class="metric-row"><span class="lbl">Previsto Líquido</span><span class="val">${brl2(c.vfLiquido)}</span></div>
          <div class="metric-row rentab"><span class="lbl">Rentabilidade</span><span class="val">${brl2(rentabilidadeAtivo)}</span></div>
        </div>
        <div class="sim-chart-card">
          <div class="sim-chart-tags">
            <div class="sim-chart-tag ${(distribuiCupom || isCashSweep) ? 'fluxo' : 'evolucao'}">${(distribuiCupom || isCashSweep) ? 'Fluxo de Caixa Distribuído' : 'Evolução Patrimonial'}</div>
            <div class="sim-chart-tag ir${a.isento ? ' isento' : ''}">${a.isento ? 'Isento de IR' : `IR ${pct2(c.aliquotaTotal * 100)}%`}</div>
          </div>
          ${chart}
          <div class="sim-chart-legend">
            ${legendaGrafico}
          </div>
        </div>
      </div>
    </div>`;
  });

  const rodapeCliente = `<div style="text-align:center; font-size:7.4px; color:#8a886f; margin-top:20px;">Cliente: ${escapeHtml(cliente)} · Data-base: ${dataPorExtenso(dataBase)}</div>`;

  // Monta o conteúdo de cada página (sem numerar ainda), para poder contar o total antes de montar.
  const conteudosPaginas = [];

  // Página 1 de conteúdo: Visão Consolidada (a metodologia completa fica só no quadro final, para evitar duplicidade).
  conteudosPaginas.push(`
    <h2 class="section">Visão Consolidada</h2>
    ${consolidada}
  `);

  // Páginas seguintes: cards de "Simulações Individuais". O número de cards por página varia
  // conforme o espaço que cada um realmente ocupa (um card de Cash Sweep, com linhas extras de
  // Juros + Amortização e legenda de 3 itens, é bem mais alto que um card bullet simples) — por
  // isso medimos a altura real de cada card (Chromium) em vez de assumir um número fixo, evitando
  // que um card fique cortado embaixo do rodapé por não caber na página.
  const tituloSimHtml = '<h2 class="section">Simulações Individuais</h2>';
  if (simCardsArr.length) {
    let grupos;
    if (medirAlturasCards) {
      const cardsComId = simCardsArr.map((h, i) => h.replace('class="sim-card"', `class="sim-card m-card" id="m-card-${i}"`));
      const htmlMedicao = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div class="page-oficial" style="overflow:visible;">
  <div class="conteudo">
    <div class="page-header" id="m-header"><div class="titulo">Carteira Simulada</div><div class="logo">${logoBrancoHtml()}</div></div>
    <h2 class="section" id="m-titulo">Simulações Individuais</h2>
    ${cardsComId.join('\n')}
  </div>
  <div class="page-footer">
    ${montarDisclaimerFooterHtml(nomeAssessor)}
    <div class="pagenum">1/1</div>
  </div>
</div>
</body>
</html>`;
      const medidas = await medirAlturasCards(htmlMedicao, extrairMedidasCards);
      grupos = agruparCardsPorAltura(medidas.alturasCards, medidas.alturaUtilPrimeira, medidas.alturaUtilDemais);
    } else {
      // Sem medição disponível (ex.: chamada direta em testes/scripts) — cai de volta no
      // agrupamento fixo de 3 por página, comportamento anterior.
      grupos = [];
      for (let i = 0; i < simCardsArr.length; i += 3) {
        grupos.push(Array.from({ length: Math.min(3, simCardsArr.length - i) }, (_, k) => i + k));
      }
    }
    grupos.forEach((indices, gi) => {
      const grupo = indices.map((idx) => simCardsArr[idx]).join('\n');
      conteudosPaginas.push(`${gi === 0 ? tituloSimHtml : ''}${grupo}`);
    });
  }

  // Última página: Premissas e Metodologia.
  conteudosPaginas.push(`${metodBox}\n${rodapeCliente}`);

  // Total de páginas inclui a capa, que agora é numerada como página 1.
  const totalPaginas = conteudosPaginas.length + 1;
  const paginasHtml = conteudosPaginas.map((c, i) => montarPagina(c, i + 2, totalPaginas, nomeAssessor));

  const capa = gerarCapaHtml({
    cliente,
    dataBase,
    subtitulo,
    ativosInput,
    carteira,
    templateType,
    paginaTotal: totalPaginas,
    assessor: nomeAssessor,
  });

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Carteira Simulada - ${escapeHtml(cliente)}${docTitleSuffix ? ' ' + escapeHtml(docTitleSuffix) : ''}</title>
<style>${CSS}</style>
</head>
<body>
${capa}
${paginasHtml.join('\n')}
</body>
</html>`;

  return { html, carteira };
}

// Ganho líquido "principal" de uma posição, independente do modo de relatório — o mesmo número que
// vai pro card de destaque da capa e pro topo do resumo executivo. No modo simplificado com debênture
// já vencida, é o ganho A PARTIR DE AGORA (resumoSimplificado.ganhoFuturo), não o ganho total desde o
// vencimento — o "custo de ter esperado" já é passado, não uma decisão que o cliente ainda vai tomar.
function ganhoPrincipal(resultado) {
  const r = resultado;
  if (r.cenarioResgate.modoSimplificado) {
    const rs = r.resumoSimplificado;
    return rs.vencida
      ? { valor: rs.ganhoFuturo.diferencaLiquida, pct: rs.ganhoFuturo.diferencaLiquidaPct }
      : { valor: rs.ganhoTotal, pct: rs.ganhoTotalPct };
  }
  return { valor: r.ganhoNovacao, pct: r.ganhoNovacaoPct };
}

// Bloco "Como chegamos neste número" — demonstra, com números que se fecham entre si, como o Ganho
// Líquido em destaque foi calculado. O Imposto de Renda SEMPRE incide sobre (valor futuro − valor da
// 1ª aplicação), nunca sobre o "valor atual" da posição — usar o valor atual como base faria a conta
// não bater com o IR realmente cobrado (ver irNovacao em lib/novacao.js). Debênture VENCIDA é um caso
// à parte: o ganho ali é a diferença incremental "a partir de agora" (novar vs. continuar parado a
// 90% do CDI desde a novação), não a diferença entre os dois totais líquidos completos — por isso
// usa uma cadeia própria, com os únicos números que o motor de cálculo realmente expõe pra esse caso
// (resumoSimplificado.ganhoFuturo), em vez de recalcular algo que pareça bater mas não bata.
function montarCalculoBox(resultado, ganho, ganhoPct) {
  const r = resultado;
  const rs = r.resumoSimplificado;
  const vencida = rs ? rs.vencida : false;

  if (vencida) {
    const irSobreDiferenca = rs.ganhoFuturo.diferencaBruta - rs.ganhoFuturo.diferencaLiquida;
    return `<div class="nov-calculo">
      <div class="titulo-mini">Como chegamos neste número</div>
      <div class="linha"><span>Valor na data da novação (bruto)</span><span>${brl2(r.vfBrutoNaNovacao)}</span></div>
      <div class="linha"><span>Diferença bruta a favor da novação (frente a ficar parado a 90% do CDI)</span><span>${brl2(rs.ganhoFuturo.diferencaBruta)}</span></div>
      <div class="linha neg"><span>Imposto de Renda sobre a diferença (${pct2(r.cenarioNovacao.aliquotaPct)}%)</span><span class="val">-${brl2(irSobreDiferenca)}</span></div>
      <div class="linha final"><span>Ganho Líquido com a Novação, a partir de agora</span><span>${brl2(rs.ganhoFuturo.diferencaLiquida)}${ganhoPct != null ? ` (+${pct2(ganhoPct)}%)` : ''}</span></div>
    </div>`;
  }

  const ganhoPositivo = ganho >= 0;
  // O rótulo da alternativa depende do modo: no simplificado (o caso comum), a alternativa É deixar
  // o capital parado a 90% do CDI — nomear isso explicitamente poupa o leitor de ter que inferir o
  // que "cenário alternativo" significa. No modo completo, a alternativa é o resgate + reaplicação
  // no produto nomeado (já detalhado na ficha correspondente, acima) — "Resgate e Reaplicação" é o
  // rótulo correto ali, não 90% do CDI.
  const labelAlternativa = r.cenarioResgate.modoSimplificado ? 'Manter aplicado a 90% do CDI (líquido)' : 'Resgate e Reaplicação (líquido)';
  return `<div class="nov-calculo">
    <div class="titulo-mini">Como chegamos neste número</div>
    <div class="linha"><span>Valor da 1ª aplicação</span><span>${brl2(r.valorInvestido)}</span></div>
    <div class="linha"><span>Valor futuro com a novação (bruto)</span><span>${brl2(r.cenarioNovacao.vfBruto)}</span></div>
    <div class="linha neg"><span>Imposto de Renda (${pct2(r.cenarioNovacao.aliquotaPct)}%)</span><span class="val">-${brl2(r.cenarioNovacao.ir)}</span></div>
    <div class="linha final"><span>Valor líquido no vencimento</span><span>${brl2(r.cenarioNovacao.vfLiquidoFinal)}</span></div>
    <div class="linha" style="margin-top:6px; padding-top:6px; border-top:1px dashed #d8d4c4;"><span>${labelAlternativa}</span><span>${brl2(r.cenarioResgate.vfLiquidoFinal)}</span></div>
    <div class="linha final"><span>${ganhoPositivo ? 'Ganho Líquido com a Novação' : 'Diferença frente à Novação'}</span><span>${ganhoPositivo ? '+' : ''}${brl2(ganho)}${ganhoPct != null ? ` (${ganhoPositivo ? '+' : ''}${pct2(ganhoPct)}%)` : ''}</span></div>
  </div>`;
}

// Destaque visual da queda de alíquota de IR com a novação — dado importante o bastante pra ter seu
// próprio bloco, não só uma cláusula dentro da frase "por que vale a pena" (ver função abaixo). Só
// aparece quando há uma queda real (>0,05pp) e a debênture não é isenta — mesma condição já usada
// pra decidir se a frase menciona o benefício fiscal.
function montarBeneficioFiscalDestaque(resultado) {
  const bf = resultado.beneficioFiscal;
  if (bf.isento || bf.diferencaPP <= 0.05) return '';
  return `<div class="nov-ir-destaque">
    <div>
      <div class="lbl">Alíquota de Imposto de Renda</div>
      <div class="sub">A novação preserva o prazo contado desde a aplicação original, reduzindo a alíquota</div>
    </div>
    <div class="valores">${pct2(bf.aliquotaSeResgatasseNoVencimentoPct)}% → ${pct2(bf.aliquotaComNovacaoPct)}%</div>
  </div>`;
}

// Frase única "por que vale a pena" — sempre presente (mesmo quando não há benefício fiscal, caso em
// que a frase se apoia só no ganho de rentabilidade). Substitui o antigo parágrafo dedicado de
// benefício fiscal: no relatório resumido, uma frase de contexto vale mais que um bloco à parte.
function montarFrasePorqueVale({ ganho, ganhoPct, nomeAtivoNovacao, resultado }) {
  const r = resultado;
  const ganhoPositivo = ganho >= 0;
  if (!ganhoPositivo) {
    return `Frente ao cenário alternativo considerado, novar${nomeAtivoNovacao ? ` para ${escapeHtml(nomeAtivoNovacao)}` : ''} resulta em ${brl2(Math.abs(ganho))} a menos, líquido de IR — vale reavaliar as taxas antes de prosseguir.`;
  }
  const bf = r.beneficioFiscal;
  const fraseFiscal = !bf.isento && bf.diferencaPP > 0.05
    ? `, incluindo uma redução na alíquota de Imposto de Renda de ${pct2(bf.aliquotaSeResgatasseNoVencimentoPct)}% para ${pct2(bf.aliquotaComNovacaoPct)}%`
    : '';
  return `Novar${nomeAtivoNovacao ? ` para ${escapeHtml(nomeAtivoNovacao)}` : ''} rende ${brl2(ganho)} a mais, líquido de IR${ganhoPct != null ? ` (${ganhoPositivo ? '+' : ''}${pct2(ganhoPct)}%)` : ''}, frente ao cenário alternativo considerado${fraseFiscal}.`;
}

// Badges curtos (não parágrafos) pra vencida/antecipação/já-novada — usados tanto na página única
// (resumo executivo) quanto na tabela de várias debêntures, onde uma frase completa por posição
// deixaria a tabela ilegível. O texto completo de cada um vai na legenda (montarLegendaNotas).
function notasCurtas({ resultado, jaFoiNovadaAntes }) {
  const badges = [];
  if (resultado.periodoVencido) badges.push('Vencida');
  if (resultado.antecipacao) badges.push('Novação antecipada');
  if (jaFoiNovadaAntes) badges.push('Já novada antes');
  return badges;
}

function montarLegendaNotas(temVencida, temAntecipacao, temJaNovada) {
  const itens = [];
  if (temVencida) itens.push('<b>Vencida</b> — a debênture já passou do vencimento contratual e rendeu 90% do CDI até a data da novação.');
  if (temAntecipacao) itens.push('<b>Novação antecipada</b> — a novação ocorreu antes do vencimento contratual da debênture atual.');
  if (temJaNovada) itens.push('<b>Já novada antes</b> — o prazo de Imposto de Renda conta desde o primeiro investimento, não desde a última novação.');
  return itens.length ? `<div class="nov-legenda">${itens.join(' ')}</div>` : '';
}

// Taxa "atual" só entra de fato no cálculo no caso raro de novação antecipada (ver
// lerEValidarNovacao em server.js) — fora desse caso, o campo fica opcional e chega aqui zerado.
// Mostrar "0,00% a.a." nesse caso pareceria um dado real e errado; "—" deixa claro que não foi
// informado, sem afetar o cálculo (que nunca dependeu dele).
function taxaLabelOuTraco(ativoTaxa) {
  const valor = ativoTaxa.taxaAA ?? ativoTaxa.taxaAM ?? ativoTaxa.percentualCDI ?? ativoTaxa.spread ?? 0;
  return valor > 0 ? taxaLabelOficial(ativoTaxa) : '—';
}

// Página 2 (Resumo Executivo) do relatório de UMA debênture — responde em uma tela só quanto o
// cliente ganha, qual produto recebe e quando vence, com uma tabela "De → Para" no lugar do
// detalhamento bruto/IR/líquido passo a passo que o relatório antigo mostrava (esse nível de detalhe
// é conferido pelo assessor na tela, antes de gerar o PDF — não precisa estar no material do cliente).
function montarResumoExecutivoUnica({
  nomeAtivoAtual, nomeAtivoReaplicacao, nomeAtivoNovacao,
  ativoTaxaAtual, vencimentoAtual, ativoTaxaReaplicacao, vencimentoReaplicacao,
  ativoTaxaNovacao, vencimentoNovacao, notaHorizonte, dataComparacaoEfetiva,
  jaFoiNovadaAntes, resultado,
}) {
  const r = resultado;
  const completo = !r.cenarioResgate.modoSimplificado;
  const { valor: ganho, pct: ganhoPct } = ganhoPrincipal(r);
  const ganhoPositivo = ganho >= 0;

  // "Valor atual" mostra exatamente o que o assessor informou (r.vfBrutoNoVencimento é o mesmo
  // valorAtualPosicao digitado no formulário, sem nenhum recálculo) — é a posição real, do extrato,
  // e deve aparecer como tal, sem o sistema "corrigi-la" projetando crescimento adicional (ex.: 90%
  // do CDI entre o vencimento contratual e a data da novação, num caso vencido). Essa projeção ainda
  // existe internamente pro cálculo do ganho (ver montarCalculoBox, ramo vencida), mas não deve
  // aparecer como se fosse o "valor atual" da posição — o valor atual É o que foi informado.
  const taxaAtualLabel = r.periodoVencido ? '90% do CDI' : taxaLabelOuTraco(ativoTaxaAtual);

  const fichaAtual = `<div class="nov-ficha">
    <div class="cabecalho">Atual${nomeAtivoAtual ? ` — ${escapeHtml(nomeAtivoAtual)}` : ''}</div>
    <div class="linha"><span class="lbl">Data 1ª aplicação</span><span class="val">${dataDDMMAAAA(r.dataIR)}</span></div>
    <div class="linha"><span class="lbl">Valor inicial</span><span class="val">${brl2(r.valorInvestido)}</span></div>
    <div class="linha"><span class="lbl">Valor atual</span><span class="val">${brl2(r.vfBrutoNoVencimento)}</span></div>
    <div class="linha"><span class="lbl">Vencimento</span><span class="val">${dataDDMMAAAA(vencimentoAtual)}</span></div>
    <div class="linha"><span class="lbl">Taxa atual</span><span class="val">${escapeHtml(taxaAtualLabel)}</span></div>
    <div class="linha"><span class="lbl">IR atual</span><span class="val">${pct2(r.beneficioFiscal.aliquotaSeResgatasseNoVencimentoPct)}%</span></div>
  </div>`;

  const fichaAlternativa = completo ? `<div class="nov-ficha">
    <div class="cabecalho">Resgate e Reaplicação${nomeAtivoReaplicacao ? ` — ${escapeHtml(nomeAtivoReaplicacao)}` : ''}</div>
    <div class="linha"><span class="lbl">Resgatado e reaplicado (líquido)</span><span class="val">${brl2(r.cenarioResgate.resgate.vfLiquido)}</span></div>
    <div class="linha"><span class="lbl">Taxa</span><span class="val">${escapeHtml(taxaLabelOficial(ativoTaxaReaplicacao))}</span></div>
    <div class="linha"><span class="lbl">Vencimento</span><span class="val">${dataDDMMAAAA(vencimentoReaplicacao)}</span></div>
    <div class="linha"><span class="lbl">Valor líquido final</span><span class="val">${brl2(r.cenarioResgate.vfLiquidoFinal)}</span></div>
  </div>` : '';

  const fichaNova = `<div class="nov-ficha destaque">
    <div class="cabecalho">Nova Debênture${nomeAtivoNovacao ? ` — ${escapeHtml(nomeAtivoNovacao)}` : ''}</div>
    <div class="linha"><span class="lbl">Taxa</span><span class="val">${escapeHtml(taxaLabelOficial(ativoTaxaNovacao))}</span></div>
    <div class="linha"><span class="lbl">Vencimento</span><span class="val">${dataDDMMAAAA(vencimentoNovacao)}</span></div>
    <div class="linha"><span class="lbl">Valor futuro previsto (bruto)</span><span class="val">${brl2(r.cenarioNovacao.vfBruto)}</span></div>
    <div class="linha"><span class="lbl">IR no vencimento</span><span class="val">${pct2(r.cenarioNovacao.aliquotaPct)}%</span></div>
  </div>`;

  const comparativo = `<div class="nov-fichas">${fichaAtual}${fichaAlternativa}${fichaNova}</div>
    ${!completo ? `<p class="nov-comparativo-nota">Comparado a manter o capital parado, rendendo 90% do CDI, entre ${dataDDMMAAAA(vencimentoAtual)} e ${dataDDMMAAAA(vencimentoNovacao)}.</p>` : ''}`;

  const calculoBox = montarCalculoBox(r, ganho, ganhoPct);

  const ganhoBox = `<div class="nov-ganho-box">
    <div>
      <div class="titulo">${ganhoPositivo ? 'Ganho Líquido com a Novação' : 'Diferença frente à Novação'}</div>
      <div class="sub">Até ${dataDDMMAAAA(completo ? dataComparacaoEfetiva : vencimentoNovacao)}</div>
    </div>
    <div class="valor">${ganhoPositivo ? '+' : ''}${brl2(ganho)}${ganhoPct != null ? ` <span style="font-size:14px;">(${ganhoPositivo ? '+' : ''}${pct2(ganhoPct)}%)</span>` : ''}</div>
  </div>`;

  const badges = notasCurtas({ resultado: r, jaFoiNovadaAntes });
  const badgesHtml = badges.length ? `<div style="margin-top:8px;">${badges.map((b) => `<span class="obs">${b}</span>`).join('')}</div>` : '';

  return `
    <h2 class="section">Situação Atual e Resumo Executivo</h2>
    ${comparativo}
    ${montarBeneficioFiscalDestaque(r)}
    ${calculoBox}
    ${ganhoBox}
    <div class="nov-vencida-box"><p>${montarFrasePorqueVale({ ganho, ganhoPct, nomeAtivoNovacao, resultado: r })}</p>${notaHorizonte ? `<p>${notaHorizonte}</p>` : ''}</div>
    ${badgesHtml}
    ${montarLegendaNotas(badges.includes('Vencida'), badges.includes('Novação antecipada'), badges.includes('Já novada antes'))}
  `;
}

// Página 3 (Premissas e Disclaimer) — comum aos dois formatos (uma ou várias debêntures).
function montarPaginaPremissasNovacao({ temIsencao, multiplas }) {
  return `<div class="metod-box">
    <h3>Premissas e Disclaimer</h3>
    <h4>Metodologia de cálculo</h4>
    <p>Os valores futuros são obtidos por capitalização composta em base 252 dias úteis — convenção padrão do mercado de renda fixa (ANBIMA/B3): VF = VI × (1 + i)<sup>du/252</sup>, em que VI é o valor investido, i a taxa efetiva contratada de cada produto e du os dias úteis do período (calendário nacional de feriados). O Imposto de Renda é calculado pela tabela regressiva vigente para renda fixa, conforme o prazo decorrido desde a aplicação original — a novação, por não ser um evento de resgate, não reinicia essa contagem.${temIsencao ? ' Produto(s) isento(s) de Imposto de Renda foram tratados como tal na simulação.' : ''}</p>
    <h4>Cenário da simulação</h4>
    <p>O cenário utilizado é de adimplência integral e nos prazos pactuados, conforme documentos da Oferta de cada produto. Trata-se de cenário único, de caráter ilustrativo, e não considera taxas, comissões ou eventos de inadimplência.${multiplas ? ' Quando mais de uma debênture sugerida foi comparada para a mesma posição, este relatório apresenta apenas a opção de melhor resultado líquido — o comparativo completo entre alternativas está disponível com o assessor responsável.' : ''}</p>
    <h4>Perfil de investidor</h4>
    <p>Investidores em geral, com perfil de risco moderado, que possuem interesse em renda fixa high yield e foco em retorno de médio e longo prazo. A distribuição é restrita a clientes cujo perfil seja compatível com as características dos ativos.</p>
    <h4>Disclaimer</h4>
    <p>Material de uso interno, não constitui oferta pública de valores mobiliários. Rentabilidade passada não é garantia de rentabilidade futura e as projeções podem diferir do realizado. Os ativos envolvidos possuem riscos de liquidez, crédito e prazo. Não invista antes de ler as informações essenciais da oferta de cada produto.</p>
  </div>`;
}

// Relatório de Novação de Debênture — capa + resumo executivo + premissas (ver montarPaginaPremissasNovacao).
// Compara "Resgate e Reaplicação" vs "Novação" na data de vencimento de uma debênture que o cliente já
// possui. Ver lib/novacao.js para o cálculo; esta função só monta o HTML/PDF a partir do resultado já
// calculado.
function montarRelatorioNovacao({
  cliente, assessor, nomeAtivoAtual, nomeAtivoReaplicacao, nomeAtivoNovacao,
  ativoTaxaAtual, vencimentoAtual,
  ativoTaxaReaplicacao, vencimentoReaplicacao, ativoTaxaNovacao, vencimentoNovacao,
  isentoAtual, isentoReaplicacao, jaFoiNovadaAntes, resultado,
}) {
  const nomeAssessor = (assessor || '').trim() || 'Vinícius Faria';
  const r = resultado;

  // Os dois cenários (modo completo) são sempre comparados até o vencimento MAIS CURTO entre o
  // produto de reaplicação e a debênture sugerida — não faz sentido comparar um produto de 1 ano com
  // um de 5. Só se aplica nesse modo (nunca no simplificado, onde só existe um horizonte).
  const dataComparacaoEfetiva = r.horizonteAjustado ? r.horizonteAjustado.dataComparacao : vencimentoNovacao;
  const notaHorizonte = r.horizonteAjustado
    ? `Os dois cenários têm vencimentos diferentes. Para uma comparação justa, ambos foram calculados até a data mais próxima entre eles: <b>${dataDDMMAAAA(dataComparacaoEfetiva)}</b>.`
    : '';

  const { valor: ganho, pct: ganhoPct } = ganhoPrincipal(r);

  const capa = gerarCapaNovacaoHtml({
    cliente, assessor: nomeAssessor, dataBase: new Date(), multiplas: false,
    nomeAtivoNovo: nomeAtivoNovacao, vencimentoNovo: vencimentoNovacao,
    ganho, ganhoPct, paginaTotal: 3,
  });

  const resumoExecutivo = montarResumoExecutivoUnica({
    nomeAtivoAtual, nomeAtivoReaplicacao, nomeAtivoNovacao,
    ativoTaxaAtual, vencimentoAtual, ativoTaxaReaplicacao, vencimentoReaplicacao,
    ativoTaxaNovacao, vencimentoNovacao, notaHorizonte, dataComparacaoEfetiva,
    jaFoiNovadaAntes, resultado: r,
  });

  const premissas = montarPaginaPremissasNovacao({ temIsencao: isentoAtual || isentoReaplicacao, multiplas: false });

  const pagina2 = montarPagina(resumoExecutivo, 2, 3, nomeAssessor, 'Novação de Debênture');
  const pagina3 = montarPagina(premissas, 3, 3, nomeAssessor, 'Novação de Debênture');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Novação de Debênture - ${escapeHtml(cliente)}</title>
<style>${CSS}</style>
</head>
<body>
${capa}
${pagina2}
${pagina3}
</body>
</html>`;

  return { html };
}

// Valor usado tanto pra escolher a melhor sugerida de cada posição quanto pra ordenar (ver
// montarRelatorioNovacaoMultipla) — o mesmo número que aparece como resultado final no resumo
// executivo (ganho a partir de agora se a debênture está vencida, ganho total se não).
function ganhoRankeavel(resultado) {
  const rs = resultado.resumoSimplificado;
  return rs.vencida ? rs.ganhoFuturo.diferencaLiquida : rs.ganhoTotal;
}

// Bloco de resumo de UMA posição dentro do relatório de várias debêntures — mesmo padrão de fichas
// (Atual / Nova Debênture) + cálculo demonstrado usado no relatório de uma debênture só (ver
// montarResumoExecutivoUnica), compacto o bastante pra empilhar várias posições numa página. Sempre
// no modo "contra 90% do CDI" — o modo completo (produto de reaplicação nomeado) só existe no fluxo
// de uma debênture por vez. `p` não carrega a taxa/indexador atual informado no formulário (o
// endpoint de várias debêntures não repassa esse campo — ver server.js), então "Taxa atual" só
// aparece quando a posição está vencida (nesse caso ela É 90% do CDI, sempre); fora isso mostra "—",
// igual ao fallback do relatório de uma debênture quando o campo de referência não foi preenchido.
function montarBlocoResumoPosicao({ p, melhor, ganho, ganhoPct }) {
  const r = melhor.resultado;
  const ganhoPositivo = ganho >= 0;
  const taxaAtualLabel = r.periodoVencido ? '90% do CDI' : '—';
  const badges = notasCurtas({ resultado: r, jaFoiNovadaAntes: p.jaFoiNovadaAntes });

  return `<div class="sim-card">
    <div class="nov-posicao-titulo">${escapeHtml(p.nomeAtivoAtual || 'Debênture atual')}</div>
    <div class="nov-fichas">
      <div class="nov-ficha">
        <div class="cabecalho">Atual</div>
        <div class="linha"><span class="lbl">Data 1ª aplicação</span><span class="val">${dataDDMMAAAA(r.dataIR)}</span></div>
        <div class="linha"><span class="lbl">Valor inicial</span><span class="val">${brl2(r.valorInvestido)}</span></div>
        <div class="linha"><span class="lbl">Valor atual</span><span class="val">${brl2(r.vfBrutoNoVencimento)}</span></div>
        <div class="linha"><span class="lbl">Vencimento</span><span class="val">${dataDDMMAAAA(p.vencimentoAtual)}</span></div>
        <div class="linha"><span class="lbl">Taxa atual</span><span class="val">${escapeHtml(taxaAtualLabel)}</span></div>
        <div class="linha"><span class="lbl">IR atual</span><span class="val">${pct2(r.beneficioFiscal.aliquotaSeResgatasseNoVencimentoPct)}%</span></div>
      </div>
      <div class="nov-ficha destaque">
        <div class="cabecalho">Nova Debênture${melhor.nomeAtivoNovacao ? ` — ${escapeHtml(melhor.nomeAtivoNovacao)}` : ''}</div>
        <div class="linha"><span class="lbl">Taxa</span><span class="val">${escapeHtml(melhor.taxaLabel)}</span></div>
        <div class="linha"><span class="lbl">Vencimento</span><span class="val">${dataDDMMAAAA(melhor.vencimentoNovacao)}</span></div>
        <div class="linha"><span class="lbl">Valor futuro previsto (bruto)</span><span class="val">${brl2(r.cenarioNovacao.vfBruto)}</span></div>
        <div class="linha"><span class="lbl">IR no vencimento</span><span class="val">${pct2(r.cenarioNovacao.aliquotaPct)}%</span></div>
      </div>
    </div>
    ${montarBeneficioFiscalDestaque(r)}
    ${montarCalculoBox(r, ganho, ganhoPct)}
    <div class="nov-ganho-box">
      <div>
        <div class="titulo">${ganhoPositivo ? 'Ganho Líquido com a Novação' : 'Diferença frente à Novação'}</div>
        <div class="sub">Até ${dataDDMMAAAA(melhor.vencimentoNovacao)}</div>
      </div>
      <div class="valor">${ganhoPositivo ? '+' : ''}${brl2(ganho)}${ganhoPct != null ? ` <span style="font-size:14px;">(${ganhoPositivo ? '+' : ''}${pct2(ganhoPct)}%)</span>` : ''}</div>
    </div>
    ${badges.length ? `<div style="margin-top:8px;">${badges.map((b) => `<span class="obs">${b}</span>`).join('')}</div>` : ''}
  </div>`;
}

// Relatório de Novação de Debêntures para VÁRIAS posições do mesmo cliente — capa + resumo executivo
// (um bloco de fichas + cálculo por debênture, mesmo padrão do relatório de uma só) + premissas.
// Quando uma posição tem mais de uma debênture sugerida comparada, o bloco mostra só a de MELHOR
// resultado líquido (ganhoRankeavel) — o resumo executivo é material pra decisão rápida do cliente,
// não pra reapresentar cada alternativa testada; o comparativo completo entre alternativas já fica
// visível na tela do simulador, antes do PDF. Paginado dinamicamente pela altura real de cada bloco
// (Chromium) — mesma técnica usada no relatório da Carteira Simulada — porque um lote pode ter mais
// debêntures do que cabem numa página só.
async function montarRelatorioNovacaoMultipla({ cliente, assessor, posicoes, medirAlturasCards }) {
  const nomeAssessor = (assessor || '').trim() || 'Vinícius Faria';

  const linhas = posicoes.map((p) => {
    const melhor = p.sugeridas.reduce(
      (atual, s) => (ganhoRankeavel(s.resultado) > ganhoRankeavel(atual.resultado) ? s : atual),
      p.sugeridas[0],
    );
    return { p, melhor, ...ganhoPrincipal(melhor.resultado) };
  });

  const ganhoTotal = linhas.reduce((s, l) => s + l.valor, 0);
  const temIsencao = linhas.some((l) => l.melhor.resultado.beneficioFiscal.isento);

  const cardsHtml = linhas.map(({ p, melhor, valor: ganho, pct: ganhoPct }) => montarBlocoResumoPosicao({ p, melhor, ganho, ganhoPct }));

  const ganhoTotalPositivo = ganhoTotal >= 0;
  const ganhoBoxTotal = `<div class="nov-ganho-box">
    <div>
      <div class="titulo">${ganhoTotalPositivo ? 'Ganho Líquido Total do Lote' : 'Diferença Total frente às Novações'}</div>
      <div class="sub">Somando a melhor opção recomendada para cada uma das ${posicoes.length} debênture${posicoes.length === 1 ? '' : 's'}</div>
    </div>
    <div class="valor">${ganhoTotalPositivo ? '+' : ''}${brl2(ganhoTotal)}</div>
  </div>`;

  const introHtml = `<h2 class="section">Situação Atual e Resumo Executivo</h2>${ganhoBoxTotal}`;

  const conteudosPaginas = [];
  let grupos;
  if (medirAlturasCards) {
    const cardsComId = cardsHtml.map((h, i) => h.replace('class="sim-card"', `class="sim-card m-card" id="m-card-${i}"`));
    const htmlMedicao = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div class="page-oficial" style="overflow:visible;">
  <div class="conteudo">
    <div class="page-header" id="m-header"><div class="titulo">Novação de Debêntures</div><div class="logo">${logoBrancoHtml()}</div></div>
    <div id="m-titulo">${introHtml}</div>
    ${cardsComId.join('\n')}
  </div>
  <div class="page-footer">
    ${montarDisclaimerFooterHtml(nomeAssessor)}
    <div class="pagenum">1/1</div>
  </div>
</div>
</body>
</html>`;
    const medidas = await medirAlturasCards(htmlMedicao, extrairMedidasCards);
    grupos = agruparCardsPorAltura(medidas.alturasCards, medidas.alturaUtilPrimeira, medidas.alturaUtilDemais);
  } else {
    // Sem medição disponível (ex.: chamada direta em testes/scripts) — cai de volta no agrupamento
    // fixo de 2 por página, comportamento equivalente ao fallback do relatório da Carteira.
    grupos = [];
    for (let i = 0; i < cardsHtml.length; i += 2) {
      grupos.push(Array.from({ length: Math.min(2, cardsHtml.length - i) }, (_, k) => i + k));
    }
  }

  grupos.forEach((indices, gi) => {
    const grupo = indices.map((idx) => cardsHtml[idx]).join('\n');
    conteudosPaginas.push(`${gi === 0 ? introHtml : ''}${grupo}`);
  });

  const premissas = montarPaginaPremissasNovacao({ temIsencao, multiplas: true });
  conteudosPaginas.push(premissas);

  // Total de páginas inclui a capa (numerada como página 1).
  const totalPaginas = conteudosPaginas.length + 1;
  const paginasHtml = conteudosPaginas.map((c, i) => montarPagina(c, i + 2, totalPaginas, nomeAssessor, 'Novação de Debêntures'));

  const capa = gerarCapaNovacaoHtml({
    cliente, assessor: nomeAssessor, dataBase: new Date(), multiplas: true, quantidade: posicoes.length,
    ganho: ganhoTotal, paginaTotal: totalPaginas,
  });

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Novação de Debêntures - ${escapeHtml(cliente)}</title>
<style>${CSS}</style>
</head>
<body>
${capa}
${paginasHtml.join('\n')}
</body>
</html>`;

  return { html };
}

module.exports = {
  montarRelatorioOficial, montarRelatorioNovacao, montarRelatorioNovacaoMultipla,
  taxaLabelOficial, categoriaLabel, agruparCardsPorAltura, ganhoRankeavel,
};
