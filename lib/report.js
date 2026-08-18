// Monta o HTML de 4 páginas da "Carteira Simulada" GCB (Renda Mensal ou Crescimento de Patrimônio),
// já com o padrão visual v3 (comparativo CDI no card de retorno, donut 6+ cores, tabela maior/centralizada,
// gráfico de barras ampliado/centralizado) — replica fielmente Template_Carteira_Renda_Mensal.md e
// Template_Carteira_Crescimento_Patrimonio.md.

const { calcularCarteira } = require('./calculo');
const { gerarDonutSVG, gerarBarChartSVG, formatK, escapeHtml } = require('./svgCharts');
const { brl, pct, dataDDMMAAAA, dataPorExtenso, mesAnoPorExtenso } = require('./format');
const { CAPA_CSS, gerarCapaHtml } = require('./capa');

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:'Segoe UI', Arial, sans-serif; color:#1f1f14; }
  .page { width:210mm; height:297mm; position:relative; page-break-after:always; overflow:hidden; background:#fff; }
  .page:last-child { page-break-after:auto; }

  ${CAPA_CSS}

  .inner { background:#fff; padding: 0 0 8mm 0; }
  .inner .topbar { height:6px; background:#a3c96b; }
  .inner .head { background:#2c2c1a; color:#fff; padding:16px 28px; display:flex; justify-content:space-between; align-items:center; }
  .inner .head .logo { font-size:20px; font-weight:800; }
  .inner .head .crumb { font-size:10.5px; color:#a3c96b; }
  .inner .body { padding: 20px 28px 0 28px; }
  .section-title { font-size:17px; font-weight:800; margin: 6px 0 14px 0; color:#1f1f14; }

  .alloc-wrap { display:flex; align-items:center; gap:22px; margin-bottom:20px; }
  .donut-center-t { font-size:9px; fill:#5a5847; font-weight:700; }
  .donut-center-v { font-size:12px; fill:#1f1f14; font-weight:800; }
  .legend { display:flex; flex-direction:column; gap:6px; font-size:9.5px; }
  .legend .row { display:flex; align-items:center; gap:7px; }
  .legend .sq { width:9px; height:9px; border-radius:2px; display:inline-block; }

  table.assets { width:100%; border-collapse:collapse; font-size:10.2px; }
  table.assets thead th { background:#2c2c1a; color:#fff; padding:8px 6px; text-align:center; font-weight:700; }
  table.assets thead th:first-child { text-align:left; }
  table.assets tbody td { padding:8px 6px; border-bottom:1px solid #eae7db; text-align:center; }
  table.assets tbody td:first-child { text-align:left; }
  table.assets tbody tr:nth-child(even) { background:#f6f4ea; }
  table.assets .tipo { font-style:italic; color:#5a5847; }
  table.assets .cupom-tag { display:block; font-size:8px; color:#8a886f; margin-top:2px; }
  table.assets .isento-tag { display:block; font-size:8px; color:#3d6b2a; font-weight:700; margin-top:2px; }
  table.assets .tributavel-tag { display:block; font-size:8px; color:#8a4a4a; font-weight:700; margin-top:2px; }
  table.assets td.jm-liq { background:#eef3e2; font-weight:800; color:#28451a; }
  table.assets tfoot td { background:#2c2c1a; color:#fff; font-weight:800; padding:9px 6px; text-align:center; }
  table.assets tfoot td:first-child { text-align:left; }
  table.assets tfoot td.jm-liq { background:#4a6b2f; }

  .renda-highlight { background:#a3c96b; color:#20300f; border-radius:8px; padding:9px 14px; margin-top:14px; font-size:11px; font-weight:700; display:inline-block; }

  .barchart-card { display:block; margin:10px auto 0 auto; }
  .bar-legend { display:flex; gap:20px; font-size:9.5px; margin-top:8px; color:#3a3a28; }
  .bar-legend .row { display:flex; align-items:center; gap:6px; }
  .bar-legend .sq { width:10px; height:10px; border-radius:2px; display:inline-block; }

  .resumo-box { background:#efece2; border-radius:10px; padding:12px 18px; font-size:11px; margin-top:16px; color:#2a2a1e; }
  .resumo-box b { color:#1f1f14; }
  .cdi-box { background:#eef3e2; border-radius:10px; padding:12px 18px; font-size:10.5px; margin-top:10px; color:#28451a; line-height:1.55; }
  .cdi-box b { color:#1f1f14; }

  .metod-box { background:#fff; border:1px solid #d8d4c4; border-radius:10px; padding:14px 18px; margin-top:14px; font-size:8.6px; line-height:1.5; color:#3a3a28; }
  .metod-box h4 { font-size:10px; margin:10px 0 4px 0; color:#1f1f14; }
  .metod-box h4:first-child { margin-top:0; }

  .disclaimer-box { background:#fff; border:1px solid #d8d4c4; border-radius:10px; padding:16px 20px; margin-top:16px; font-size:8.2px; line-height:1.55; color:#3a3a28; }
  .disclaimer-box h4 { font-size:11px; margin:0 0 10px 0; color:#1f1f14; }
  .disclaimer-box p { margin:0 0 9px 0; }

  .footer { position:absolute; bottom:0; left:0; right:0; text-align:center; padding:10px 0 6px 0; font-size:7.6px; color:#8a886f; background:#fff; }
  .footer .author { margin-top:2px; }
  .footer .repeat-disc { margin-top:2px; font-weight:600; color:#6b6b55; }
`;

function taxaLabel(ativo) {
  if (ativo.tipo === 'fixo') return `${pct(ativo.taxaAM * 100, 2)} a.m.`;
  if (ativo.tipo === 'fixoAA') return `${pct(ativo.taxaAA * 100, 2)} a.a.`;
  if (ativo.tipo === 'pctcdi') return `${pct(ativo.percentualCDI * 100, 2)} do CDI`;
  const prefixo = ativo.tipo === 'cdi' ? 'CDI' : 'IPCA';
  return `${prefixo} + ${pct(ativo.spread * 100, 2)} a.a.`;
}

function footer(pagina) {
  return `<div class="footer">
    GCB Investimentos · Material de uso interno · Não constitui oferta pública de valores mobiliários · ${pagina} / 4<br>
    <span class="author">Elaborado por Vinícius Faria</span>
    <div class="repeat-disc">Rentabilidade passada não é garantia de rentabilidade futura</div>
  </div>`;
}

function montarRelatorio({ cliente, dataBase, ativosInput, templateType, curvas, docTitleSuffix }) {
  const ativosCalc = ativosInput.map((a) => ({ ...a, dataBase }));
  const carteira = calcularCarteira(ativosCalc, curvas);
  const viTotal = carteira.viTotal;
  const subtitulo = templateType === 'renda' ? 'Carteira de juros mensais' : 'Carteira de crescimento de patrimônio';
  const tituloProjecao = templateType === 'renda' ? 'Projeção de Valor Futuro Líquido por Produto' : 'Projeção de Valor Futuro por Produto';
  const legendaRendimento = templateType === 'renda' ? 'Rendimento estimado / cupons' : 'Rendimento estimado';

  // ----- Página 1: capa -----
  const temCupomDistribuido = carteira.resultados.some((r) => r.ativo.pagaCupomMensal && !r.ativo.reinvestir);
  const temReinvestimento = carteira.resultados.some((r) => r.ativo.pagaCupomMensal && r.ativo.reinvestir);

  const pagina1 = gerarCapaHtml({ cliente, dataBase, subtitulo, ativosInput, carteira, templateType, paginaTotal: 4 });

  // ----- Página 2: alocação -----
  const donutData = ativosInput.map((a) => ({ nome: a.nome, pct: (a.vi / viTotal) * 100 }));
  const donut = gerarDonutSVG(donutData, Math.round(viTotal / 1000).toLocaleString('pt-BR'));

  const linhasTabela = carteira.resultados.map((r) => {
    const a = r.ativo;
    const c = r.calc;
    const cupomTag = a.pagaCupomMensal && !a.reinvestir ? 'cupom mensal' : (a.pagaCupomMensal && a.reinvestir ? 'juros reinvestidos' : 'bullet · sem cupom');
    const tribTag = a.isento ? '<span class="isento-tag">isento de IR</span>' : '<span class="tributavel-tag">tributável (regressiva)</span>';
    const jurosLiqCell = a.pagaCupomMensal && !a.reinvestir ? `<td class="num jm-liq">${brl(c.cupomLiq, 2)}</td>` : '<td class="num">—</td>';
    return `<tr><td>${escapeHtml(a.nome)}</td><td class="tipo">${escapeHtml(a.tipoProdutoLabel)}</td><td class="num">${pct((a.vi / viTotal) * 100, (a.vi / viTotal) * 100 % 1 === 0 ? 0 : 1)}</td><td class="num">${brl(a.vi)}</td><td>${taxaLabel(a)}<span class="cupom-tag">${cupomTag}</span>${tribTag}</td>${jurosLiqCell}<td>${dataDDMMAAAA(a.vencimento)}</td><td class="num">${brl(c.vfLiquido)}</td></tr>`;
  }).join('\n        ');

  const jurosLiqTotalCell = temCupomDistribuido ? `<td class="num jm-liq">${brl(carteira.jurosLiquidosTotal, 2)}</td>` : '<td class="num">—</td>';

  const notaTabelaPartes = [];
  const todosIsentos = ativosInput.every((a) => a.isento);
  if (todosIsentos) {
    notaTabelaPartes.push('Todos os ativos desta carteira são isentos de Imposto de Renda para pessoa física — não há incidência de IR sobre os rendimentos desta simulação.');
  } else {
    notaTabelaPartes.push('IR calculado conforme tabela regressiva sobre os ativos tributáveis (alíquota de 22,5% no 1º pagamento mensal e alíquota do prazo total no Valor Futuro). CRI e CRA são sempre isentos de IR para pessoa física.');
  }
  if (temReinvestimento) {
    notaTabelaPartes.push('Os ativos com juros reinvestidos não distribuem valor periódico ao investidor — por isso não há valor na coluna "Juros Líquidos" para eles, e o rendimento total é recebido de uma vez no vencimento, junto ao principal.');
  }

  const pagina2 = `<div class="page inner">
  <div class="topbar"></div>
  <div class="head"><div class="logo">GCB</div><div class="crumb">GCB Investimentos · Carteira Simulada · ${mesAnoPorExtenso(dataBase).replace(/^(\\w)/, (c) => c.toUpperCase())}</div></div>
  <div class="body">
    <div class="section-title">Alocação da Carteira</div>
    <div class="alloc-wrap">
      ${donut.svg}
      <div class="legend">
        ${donut.legendaHtml}
      </div>
    </div>
    <div class="section-title" style="font-size:13px;">Detalhamento por Produto</div>
    <table class="assets">
      <thead><tr><th>Produto</th><th>Tipo de Produto</th><th class="num">Alocação</th><th class="num">Valor Investido</th><th>Remuneração</th><th class="num">Juros Líquidos</th><th>Vencimento</th><th class="num">Valor Futuro</th></tr></thead>
      <tbody>
        ${linhasTabela}
      </tbody>
      <tfoot><tr><td>TOTAL</td><td></td><td class="num">100%</td><td class="num">${brl(viTotal)}</td><td>—</td>${jurosLiqTotalCell}<td>—</td><td class="num">${brl(carteira.vfLiquidoTotal)}</td></tr></tfoot>
    </table>
    <div style="font-size:8px; color:#5a5847; margin-top:8px;">${notaTabelaPartes.join(' ')}</div>
  </div>
  ${footer(2)}
</div>`;

  // ----- Página 3: projeção + metodologia -----
  const chartBars = carteira.resultados.map((r) => ({ nomeCurto: nomeCurto(r.ativo.nome), vi: r.ativo.vi, vf: r.calc.vfLiquido }));
  const barChart = gerarBarChartSVG(chartBars, legendaRendimento);

  const cdiBox = `<div class="cdi-box"><b>COMPARATIVO COM O CDI PROJETADO</b> — Prazo médio ponderado da carteira: ~${carteira.prazoMedioAnos.toFixed(2).replace('.', ',')} anos · CDI projetado (curva PRE / DI Futuro, B3) no prazo médio: ~${pct(carteira.cdiRefMedio, 2)} a.a., acumulando ~${pct(carteira.cdiAcumuladoPct, 1)} no período · Retorno estimado da carteira no mesmo horizonte: ~${pct(carteira.retornoLiquidoPct, 1)} · <b>A carteira projeta um retorno equivalente a aproximadamente ${Math.round(carteira.pctDoCdi)}% do CDI projetado acumulado</b> no prazo médio ponderado dos ativos.</div>`;

  const temCdi = ativosInput.some((a) => a.tipo === 'cdi');
  const temIpca = ativosInput.some((a) => a.tipo === 'ipca');
  const temPctCdi = ativosInput.some((a) => a.tipo === 'pctcdi');
  const partesIndexados = [];
  if (temCdi) partesIndexados.push('nos ativos CDI+, a taxa de referência (DI Futuro) é obtida por interpolação da curva PRE publicada diariamente pela B3');
  if (temIpca) partesIndexados.push('nos ativos IPCA+, a taxa de referência (inflação projetada) é obtida por interpolação da curva de Inflação Implícita (ETTJ) publicada diariamente pela ANBIMA');
  if (temPctCdi) partesIndexados.push('nos ativos % CDI, a taxa de referência (DI Futuro, curva PRE da B3) é multiplicada diretamente pelo percentual contratado (ex.: 110% CDI), sem soma de spread');
  const fraseIndexados = partesIndexados.length
    ? ` Para os ativos indexados: ${partesIndexados.join('; ')}. Para os ativos CDI+/IPCA+, a taxa efetiva é a combinação multiplicativa entre a taxa de referência e o spread contratado: i = (1 + taxa_referência) × (1 + spread) − 1.`
    : '';
  const fraseCupom = temCupomDistribuido
    ? ' Para os produtos com pagamento de cupom mensal, os cupons são pagos mensalmente e não reinvestidos — o valor futuro corresponde ao principal acrescido dos cupons do período (sem capitalização dos cupons).'
    : '';
  const fraseReinvest = temReinvestimento
    ? ' Esta simulação assume que os juros mensais dos ativos que pagam cupom são integralmente reinvestidos pelo investidor até o vencimento de cada ativo — por isso o Valor Futuro é calculado por capitalização composta sobre o prazo total, mesmo para os ativos que, contratualmente, pagam cupom mensal.'
    : '';
  const fraseIR = todosIsentos
    ? ' Os valores desta simulação são apresentados líquidos de Imposto de Renda: todos os ativos desta carteira são isentos de IR para pessoa física, não havendo incidência de Imposto de Renda sobre os rendimentos.'
    : ' Os valores desta simulação são apresentados líquidos de Imposto de Renda: CRI e CRA são isentos de IR para pessoa física; os demais ativos são tributados pela tabela regressiva do IR sobre renda fixa (22,5% até 180 dias; 20,0% até 360 dias; 17,5% até 720 dias; 15,0% acima de 720 dias).';

  const pagina3 = `<div class="page inner">
  <div class="topbar"></div>
  <div class="head"><div class="logo">GCB</div><div class="crumb">GCB Investimentos · Carteira Simulada · ${mesAnoPorExtenso(dataBase)}</div></div>
  <div class="body">
    <div class="section-title">${tituloProjecao}</div>
    ${barChart}
    <div class="resumo-box"><b>RESUMO CONSOLIDADO</b> — Investimento total: ${brl(viTotal, 2)} · Valor futuro ${todosIsentos ? '' : 'líquido '}estimado: ${brl(carteira.vfLiquidoTotal, 2)} · Retorno sobre capital: ~${pct(carteira.retornoLiquidoPct, 1)} · IR total: ${brl(carteira.irTotal, 2)}${todosIsentos ? ' (carteira 100% isenta de Imposto de Renda)' : ''}</div>
    ${cdiBox}
    <div class="metod-box">
      <h4>Premissas e Metodologia</h4>
      <p><b>Perfil e tipo de investidor</b><br>Investidores em geral, com perfil de risco moderado, que possuem interesse em renda fixa high yield e foco em retorno de médio e longo prazo. A distribuição é restrita a clientes cujo perfil seja compatível com as características dos ativos.</p>
      <p><b>Cenário da simulação</b><br>O cenário utilizado na simulação é de adimplência integral e nos prazos pactuados, conforme documentos da Oferta. Trata-se de cenário único, de caráter ilustrativo.${fraseReinvest}</p>
      <p><b>Metodologia de cálculo (Arts. 12 e 18, III da RCVM 19)</b><br>Os valores futuros foram obtidos a partir do valor investido em cada ativo, pela respectiva taxa de remuneração contratada, ao longo do prazo entre a data-base (${dataDDMMAAAA(dataBase)}) e o vencimento.${fraseIndexados} Para os ativos simulados com pagamento único no vencimento (bullet ou juros reinvestidos), o Valor Futuro é obtido por capitalização composta em base 252 dias úteis — convenção padrão do mercado de renda fixa (ANBIMA/B3): VF = VI × (1 + i)^(dias úteis/252), em que VI é o valor investido e i a taxa efetiva anual. Não foram consideradas taxas, comissões ou eventos de inadimplência.${fraseCupom}${fraseIR}</p>
      <p><b>Demais premissas</b><br>Os cálculos de valor futuro são estimativas baseadas nas taxas contratuais de cada produto e nos prazos até o vencimento. <b>Rentabilidade passada não é garantia de rentabilidade futura</b> e as projeções podem diferir do realizado. Os ativos que compõem esta carteira envolvem riscos de liquidez, crédito e prazo. O comparativo com o CDI é meramente ilustrativo e utiliza a projeção de mercado vigente na data-base; a rentabilidade efetiva do CDI pode divergir significativamente da projeção ao longo do prazo.</p>
    </div>
  </div>
  ${footer(3)}
</div>`;

  // ----- Página 4: disclaimer -----
  const pagina4 = `<div class="page inner">
  <div class="topbar"></div>
  <div class="head"><div class="logo">GCB</div><div class="crumb">GCB Investimentos · Carteira Simulada · ${mesAnoPorExtenso(dataBase)}</div></div>
  <div class="body">
    <div class="section-title">Informações Regulatórias e Disclaimer</div>
    <div class="disclaimer-box">
      <h4>AVISO LEGAL E INFORMAÇÕES REGULATÓRIAS</h4>
      <p>Este material foi elaborado por <b>GRCB CAPITAL ASSESSORIA E CONSULTORIA LTDA.</b>, instituição autorizada a realizar consultoria de investimentos pela Comissão de Valores Mobiliários (CVM), inscrita no CNPJ sob o nº <b>19.559.660/0001-35</b>, nos termos da Resolução CVM nº 19/2021.</p>
      <p>As informações, projeções e alocações apresentadas neste documento constituem uma <b>simulação hipotética</b> elaborada com base em condições de mercado vigentes em ${mesAnoPorExtenso(dataBase)} (curva PRE / DI Futuro da B3, Inflação Implícita da ANBIMA e projeções do BACEN/Boletim Focus, obtidas de forma automática na data de geração) e têm caráter meramente ilustrativo.${temReinvestimento ? ' Esta simulação assume que os juros mensais de determinados ativos são integralmente reinvestidos até o vencimento — trata-se de uma premissa de cálculo, e não de uma característica automática do produto.' : ''} Os valores desta simulação são apresentados líquidos de Imposto de Renda, conforme a legislação vigente na data-base — a alíquota efetiva pode variar caso a legislação tributária se altere. O comparativo com o CDI projetado é meramente ilustrativo. Os cenários apresentados refletem premissas específicas descritas neste material e não representam compromisso, promessa ou garantia de rentabilidade. <b>Rentabilidade passada não é garantia de rentabilidade futura.</b> Nenhuma das projeções, estimativas ou valores futuros indicados neste material constitui garantia de resultado. Os ativos recomendados estão sujeitos a riscos de mercado, crédito, liquidez e prazo. Não há garantia de que os pagamentos ocorrerão no horizonte indicado.</p>
      <p>Este material foi preparado considerando o público de investidor em geral com perfil de risco moderado. Sua distribuição está restrita a clientes cujo perfil seja compatível com as características dos ativos recomendados. As Ofertas foram realizadas à luz do marco legal da securitização (Lei nº 14.430/2022), com a devida constituição de regime fiduciário e patrimônio separado, com a devida segregação patrimonial, sem que os ativos e passivos da Oferta se comuniquem entre si ou com os da Securitizadora responsável pela emissão.</p>
      <p><b>Conflito de interesses:</b> a GRCB Capital integra o mesmo grupo econômico da Securitizadora responsável pela emissão das Ofertas, o que configura potencial conflito de interesses nos termos do Art. 18, § 2º, da RCVM 19. No entanto, a consultora declara que adota procedimentos de segregação de atividades nos termos do Art. 21 da RCVM 19 para preservar a independência das recomendações.</p>
      <p>O investidor deve ler as informações essenciais da Oferta, nos termos da RCVM 88, que dispõe sobre a obrigatoriedade de que o investidor <b>"Não Invista Antes de Ler as Informações Essenciais da Oferta"</b>. As informações econômicas e de mercado utilizadas como premissas foram extraídas de fontes públicas oficiais (BACEN, ANBIMA, B3) consideradas confiáveis na data de elaboração deste material. A consultora não se responsabiliza por eventuais imprecisões ou desatualizações dessas fontes. As condições de mercado podem se alterar de forma significativa após a data de emissão deste documento.</p>
      <p>Este material não constitui oferta pública de valores mobiliários nos termos da Resolução CVM nº 160/2022 e não deve ser interpretado como prospecto ou material publicitário de qualquer oferta. Esta comunicação integra os registros da consultora nos termos dos Arts. 22 e 23 da RCVM 19 e pode ser solicitada pelo cliente a qualquer momento, juntamente com os estudos e análises que fundamentaram as recomendações.</p>
      <p><b>Data de referência:</b> ${dataPorExtenso(dataBase)}. Este material está sujeito a revisão em caso de alteração relevante nas condições de mercado.</p>
    </div>
  </div>
  ${footer(4)}
</div>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Carteira Simulada - ${escapeHtml(cliente)}${docTitleSuffix ? ' ' + escapeHtml(docTitleSuffix) : ''}</title>
<style>${CSS}</style>
</head>
<body>
${pagina1}
${pagina2}
${pagina3}
${pagina4}
</body>
</html>`;

  return { html, carteira };
}

function nomeCurto(nome) {
  const abreviado = nome
    .replace(/^Debênture\s+/i, 'Deb. ')
    .replace(/^Operação\s+/i, 'Op. ')
    .replace(/^Recebível\s+/i, 'Receb. ');
  if (abreviado.length <= 16) return abreviado;
  const corte = abreviado.slice(0, 16);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return (ultimoEspaco > 6 ? corte.slice(0, ultimoEspaco) : corte) + '…';
}

module.exports = { montarRelatorio };
