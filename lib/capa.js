// Capa padrão GCB (fundo verde-oliva escuro, cards Investimento/Valor Futuro/Retorno) — compartilhada
// pelos dois modelos de relatório (Renda Mensal e Crescimento de Patrimônio), conforme padrão visual
// v3 já validado.

const { brl, dataPorExtenso, mesAnoPorExtenso } = require('./format');
const { escapeHtml } = require('./svgCharts');

const CAPA_CSS = `
  .page.cover { width:210mm; height:297mm; position:relative; overflow:hidden; page-break-after:always; background:#2c2c1a; color:#fff; font-family:'Segoe UI', Arial, sans-serif; }
  .cover .decor { position:absolute; top:-120px; right:-160px; width:520px; height:520px; border-radius:50%; background:#242416; }
  .cover .topbar { height:8px; background:#a3c96b; }
  .cover .content { position:relative; padding:26px 34px 0 34px; height:calc(297mm - 70px); box-sizing:border-box; display:flex; flex-direction:column; }
  .cover .logo { font-size:26px; font-weight:800; letter-spacing:1px; }
  .cover h1 { font-size:34px; font-weight:800; margin:56px 0 0 0; line-height:1.15; }
  .cover h1 .g { color:#a3c96b; display:block; }
  .cover .subtitle { font-size:15px; color:#e7e4d5; margin-top:10px; }
  .cover .rule { width:110px; height:2px; background:#a3c96b; margin:16px 0; }
  .cover .meta { font-size:14px; color:#e0ddce; line-height:1.9; }
  .cover .meta b { color:#fff; }
  .cover .spacer { flex:1 1 auto; }
  .cover .cards { display:flex; gap:14px; }
  .cover .card { background:#3a3a24; border-radius:10px; padding:16px 18px; flex:1; }
  .cover .card.hl { background:#a3c96b; color:#20300f; }
  .cover .card .lbl { font-size:9.5px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; opacity:0.85; }
  .cover .card .val { font-size:26px; font-weight:800; margin-top:6px; }
  .cover .card .cap { font-size:9.5px; margin-top:4px; opacity:0.8; }
  .cover .summary { margin-top:14px; font-size:10.5px; color:#c9c6b6; }
  .cover .obs-note { margin-top:14px; font-size:9.5px; color:#d8d4c4; font-style:italic; border-left:2px solid #a3c96b; padding-left:10px; max-width:520px; line-height:1.5; }
  .cover .renda-highlight { background:#a3c96b; color:#20300f; border-radius:8px; padding:9px 14px; margin-top:14px; font-size:11px; font-weight:700; display:inline-block; }
  .cover .footer { position:absolute; bottom:0; left:0; right:0; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
  .cover .footer .disclaimer { font-size:7px; line-height:1.5; color:#a9a98f; }
  .cover .footer .disclaimer .autor { font-weight:700; color:#fff; }
  .cover .footer .pagenum { font-size:12px; font-weight:800; color:#fff; white-space:nowrap; }
`;

function gerarCapaHtml({ cliente, dataBase, subtitulo, ativosInput, carteira, templateType, paginaTotal, assessor }) {
  const viTotal = carteira.viTotal;
  const vencimentoMaisLongo = ativosInput.reduce((max, a) => (a.vencimento > max ? a.vencimento : max), ativosInput[0].vencimento);
  const classesAtivo = new Set(ativosInput.map((a) => a.tipoProdutoLabel)).size;

  const rendaMensalTotal = carteira.resultados.reduce((s, r) => ((r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom !== 'semestral' ? s + r.calc.cupomLiq : s), 0);
  const rendaSemestralTotal = carteira.resultados.reduce((s, r) => ((r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom === 'semestral' ? s + r.calc.cupomLiq : s), 0);
  const temCupomMensalDistribuido = carteira.resultados.some((r) => (r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom !== 'semestral');
  const temCupomSemestralDistribuido = carteira.resultados.some((r) => (r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir)) && r.calc.periodicidadeCupom === 'semestral');
  const temReinvestimento = carteira.resultados.some((r) => !r.ativo.cashSweep && r.ativo.pagaCupomMensal && r.ativo.reinvestir);

  const destaqueRendaMensal = templateType === 'renda' && temCupomMensalDistribuido
    ? `<div class="renda-highlight">Renda mensal líquida estimada (1º pagamento): ${brl(rendaMensalTotal, 2)} / mês</div>`
    : '';
  const destaqueRendaSemestral = templateType === 'renda' && temCupomSemestralDistribuido
    ? `<div class="renda-highlight" style="margin-top:8px;">Renda semestral líquida estimada (1º pagamento): ${brl(rendaSemestralTotal, 2)} / semestre</div>`
    : '';

  const observacaoReinvestimento = temReinvestimento
    ? `<div class="obs-note">Observação: esta simulação considera que os juros dos ativos com opção de reinvestimento (${escapeHtml(
        carteira.resultados.filter((r) => r.ativo.reinvestir).map((r) => r.ativo.nome).join(', ')
      )}) são <b>reinvestidos a cada pagamento</b>, já líquidos de Imposto de Renda quando aplicável, em vez de distribuídos ao investidor.</div>`
    : '';

  return `<div class="page cover">
  <div class="decor"></div>
  <div class="topbar"></div>
  <div class="content">
    <div class="logo">GCB</div>
    <h1>Carteira Simulada<span class="g">GCB Investimentos</span></h1>
    <div class="subtitle">${escapeHtml(subtitulo)}</div>
    <div class="rule"></div>
    <div class="meta"><b>Cliente:</b> ${escapeHtml(cliente)}<br>Data base: ${dataPorExtenso(dataBase)}<br>Horizonte: até ${mesAnoPorExtenso(vencimentoMaisLongo)}<br>Elaborado por ${escapeHtml(assessor || 'Vinícius Faria')}</div>
    <div class="spacer"></div>
    <div class="cards">
      <div class="card">
        <div class="lbl">Investimento</div>
        <div class="val">${brl(viTotal)}</div>
        <div class="cap">Capital alocado</div>
      </div>
      <div class="card">
        <div class="lbl">Valor Futuro Líquido Estimado</div>
        <div class="val">${brl(carteira.vfLiquidoTotal)}</div>
        <div class="cap">Estimado no vencimento, líquido de IR</div>
      </div>
      <div class="card hl">
        <div class="lbl">Retorno vs. CDI Projetado</div>
        <div class="val" style="font-size:23px;">≈${Math.round(carteira.pctDoCdi)}% do CDI</div>
        <div class="cap">Retorno líquido estimado: ~${Math.round(carteira.retornoLiquidoPct)}% sobre o capital investido</div>
      </div>
    </div>
    <div class="summary">${ativosInput.length} produtos selecionados · ${classesAtivo} classes de ativo</div>
    ${destaqueRendaMensal}
    ${destaqueRendaSemestral}
    ${observacaoReinvestimento}
    <div class="spacer"></div>
  </div>
  <div class="footer">
    <div class="disclaimer">
      <div class="autor">Elaborado por ${escapeHtml(assessor || 'Vinícius Faria')} · GCB Investimentos</div>
      <div>Material de uso interno · Não constitui oferta pública de valores mobiliários</div>
      <div>Rentabilidade passada não é garantia de rentabilidade futura. Não Invista Antes de Ler as Informações Essenciais da Oferta.</div>
    </div>
    ${paginaTotal ? `<div class="pagenum">1 / ${paginaTotal}</div>` : ''}
  </div>
</div>`;
}

module.exports = { CAPA_CSS, gerarCapaHtml };
