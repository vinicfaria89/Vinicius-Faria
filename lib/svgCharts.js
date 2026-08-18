// Geração dinâmica dos gráficos SVG (donut de alocação + barras de projeção) seguindo o
// padrão visual v3 fixado nos templates GCB (Materiais Produtos/Template_Carteira_*.md).

const PALETA_BASE = ['#a3c96b', '#5b7d3a', '#9c5b5b', '#4a7a96', '#c9a227', '#7a5a96'];

// Gera cores extras (nunca repetidas) se houver mais ativos do que a paleta base, variando o matiz.
function paletaCores(n) {
  const cores = [...PALETA_BASE];
  let hue = 20;
  while (cores.length < n) {
    cores.push(`hsl(${hue}, 45%, 45%)`);
    hue = (hue + 47) % 360;
  }
  return cores.slice(0, n);
}

// donutData: [{ nome, pct }] (pct em 0-100, soma 100)
function gerarDonutSVG(donutData, valorTotalAbrevido) {
  const cores = paletaCores(donutData.length);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offsetAcumulado = 0;
  const circles = donutData.map((d, i) => {
    const comprimento = (d.pct / 100) * C;
    const dasharray = `${comprimento.toFixed(2)} ${(C - comprimento).toFixed(2)}`;
    const offset = -offsetAcumulado.toFixed ? -offsetAcumulado : -offsetAcumulado;
    const svg = `<circle r="${R}" fill="none" stroke="${cores[i]}" stroke-width="26" stroke-dasharray="${dasharray}" stroke-dashoffset="${(-offsetAcumulado).toFixed(2)}"/>`;
    offsetAcumulado += comprimento;
    return svg;
  }).join('\n          ');

  const legenda = donutData.map((d, i) => (
    `<div class="row"><span class="sq" style="background:${cores[i]}"></span>${escapeHtml(d.nome)} (${formatPct(d.pct)})</div>`
  )).join('\n        ');

  return {
    svg: `<svg width="170" height="170" viewBox="0 0 190 190">
        <g transform="translate(95,95) rotate(-90)">
          <circle r="${R}" fill="none" stroke="#eee9d8" stroke-width="26"/>
          ${circles}
        </g>
        <text x="95" y="90" text-anchor="middle" class="donut-center-t">R$ ${valorTotalAbrevido}K</text>
        <text x="95" y="107" text-anchor="middle" class="donut-center-v">investido</text>
      </svg>`,
    legendaHtml: legenda,
    cores,
  };
}

// Escolhe um teto de eixo "arredondado" mas próximo do maior valor (pouca folga sobrando no topo).
function niceAxisMax(maxVal) {
  const alvo = maxVal * 1.08; // ~8% de folga acima da maior barra
  const magnitude = Math.pow(10, Math.floor(Math.log10(alvo)));
  const residual = alvo / magnitude;
  const degraus = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const fator = degraus.find((d) => residual <= d) || 10;
  const axisMax = fator * magnitude;
  return { axisMax, step: axisMax / 4 };
}

// barsData: [{ nomeCurto, vi, vf }]
function gerarBarChartSVG(barsData, legendaRendimento) {
  const maxVf = Math.max(...barsData.map((b) => b.vf));
  const { axisMax, step } = niceAxisMax(maxVf);
  const baseline = 200;
  const top = 20;
  const pxPerReal = (baseline - top) / axisMax;

  const gridlines = [];
  const gridlabels = [];
  for (let v = step; v <= axisMax; v += step) {
    const y = baseline - v * pxPerReal;
    gridlines.push(`<line x1="55" y1="${y.toFixed(1)}" x2="530" y2="${y.toFixed(1)}"/>`);
    gridlabels.push(`<text x="51" y="${(y + 3).toFixed(1)}" text-anchor="end">R$${formatK(v)}k</text>`);
  }
  gridlabels.push(`<text x="51" y="${baseline + 3}" text-anchor="end">R$0</text>`);

  const n = barsData.length;
  const slot = 475 / n;
  const barWidth = Math.min(46, slot * 0.6);

  const bars = barsData.map((b, i) => {
    const x = 55 + slot * i + (slot - barWidth) / 2;
    const yVi = baseline - b.vi * pxPerReal;
    const hVi = b.vi * pxPerReal;
    const yVf = baseline - b.vf * pxPerReal;
    const hRend = (b.vf - b.vi) * pxPerReal;
    const cx = x + barWidth / 2;
    return `<rect x="${x.toFixed(1)}" y="${yVi.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${hVi.toFixed(1)}" fill="#2c2c1a"/>
      <rect x="${x.toFixed(1)}" y="${yVf.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${hRend.toFixed(1)}" fill="#a3c96b"/>
      <text x="${cx.toFixed(1)}" y="${(yVf - 6).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#1f1f14">${formatK(b.vf)}k</text>
      <text x="${cx.toFixed(1)}" y="212" text-anchor="middle" font-size="6.5" fill="#5a5847">${escapeHtml(b.nomeCurto)}</text>`;
  }).join('\n      ');

  return `<svg width="700" height="311" viewBox="0 0 540 240" class="barchart-card">
      <g stroke="#eee9d8" stroke-width="1">
        ${gridlines.join('\n        ')}
      </g>
      <g font-size="7.5" fill="#8a886f">
        ${gridlabels.join('\n        ')}
      </g>
      <line x1="55" y1="${baseline}" x2="530" y2="${baseline}" stroke="#8a886f" stroke-width="1.2"/>
      ${bars}
    </svg>
    <div class="bar-legend">
      <div class="row"><span class="sq" style="background:#2c2c1a"></span>Capital investido</div>
      <div class="row"><span class="sq" style="background:#a3c96b"></span>${escapeHtml(legendaRendimento)}</div>
    </div>`;
}

// Calcula a posição vertical de dois rótulos finais (ex.: valor do ativo x valor do CDI) de forma
// que nunca fiquem em cima de suas próprias linhas nem se sobreponham um ao outro, mesmo quando as
// duas linhas terminam muito próximas. Usado tanto pelo gráfico de linha quanto pelo de fluxo de cupom.
function labelsFinaisSemColisao(yA, yB) {
  const yAlto = Math.min(yA, yB);
  const yBaixo = Math.max(yA, yB);
  const yLabelAlto = yAlto - 11;
  const yLabelBaixo = Math.max(yBaixo + 17, yLabelAlto + 19);
  return {
    yLabelA: yA <= yB ? yLabelAlto : yLabelBaixo,
    yLabelB: yA <= yB ? yLabelBaixo : yLabelAlto,
  };
}

// Gráfico de linha "Hoje -> Vencimento": rendimento do ativo (verde, sólido) vs. 100% CDI (cinza,
// tracejado) — replica o estilo das simulações individuais do site oficial da GCB. Usado para ativos
// bullet ou com juros reinvestidos (capitalização composta contínua).
function gerarLinhaComparativaSVG({ vi, vf, vfCdi, dataVencFmt }) {
  const top = 26;
  const bottom = 108;
  const xIni = 42;
  const xFim = 418;
  const maxVal = Math.max(vf, vfCdi) * 1.06;
  const minVal = vi * 0.94;
  const escala = (v) => bottom - ((v - minVal) / (maxVal - minVal)) * (bottom - top);

  const yIniAtivo = escala(vi);
  const yFimAtivo = escala(vf);
  const yIniCdi = escala(vi);
  const yFimCdi = escala(vfCdi);

  const gridlines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = top + (bottom - top) * f;
    return `<line x1="${xIni}" y1="${y.toFixed(1)}" x2="${xFim}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  // Rótulos do valor final: sempre posicionados acima/abaixo das duas linhas, nunca sobre elas.
  const { yLabelA: yLabelAtivo, yLabelB: yLabelCdi } = labelsFinaisSemColisao(yFimAtivo, yFimCdi);

  // O valor investido fica sempre no ponto de partida das duas linhas — qualquer rótulo colado ali,
  // acima ou abaixo, acaba sendo cruzado pela subida das linhas logo nos primeiros pixels do gráfico.
  // Por isso ele é exibido junto ao eixo "Hoje", abaixo da área do gráfico, longe de qualquer linha.
  return `<svg width="100%" viewBox="0 0 460 148" class="linha-comparativa">
    <g stroke="#e6e2d6" stroke-width="1">${gridlines}</g>
    <line x1="${xIni}" y1="${yIniCdi.toFixed(1)}" x2="${xFim}" y2="${yFimCdi.toFixed(1)}" stroke="#9a9a8c" stroke-width="1.6" stroke-dasharray="4 3"/>
    <line x1="${xIni}" y1="${yIniAtivo.toFixed(1)}" x2="${xFim}" y2="${yFimAtivo.toFixed(1)}" stroke="#8fbf5a" stroke-width="2.2"/>
    <circle cx="${xIni}" cy="${yIniAtivo.toFixed(1)}" r="3" fill="#8fbf5a"/>
    <circle cx="${xFim}" cy="${yFimAtivo.toFixed(1)}" r="3" fill="#8fbf5a"/>
    <circle cx="${xFim}" cy="${yFimCdi.toFixed(1)}" r="3" fill="#9a9a8c"/>
    <text x="${xFim}" y="${yLabelAtivo.toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="#1f1f14">${brlLocal(vf)}</text>
    <text x="${xFim}" y="${yLabelCdi.toFixed(1)}" text-anchor="end" font-size="10" fill="#6c6c5f">${brlLocal(vfCdi)}</text>
    <text x="${xIni}" y="${bottom + 16}" font-size="9.5" fill="#6c6c5f">Hoje</text>
    <text x="${xIni}" y="${bottom + 29}" font-size="10" font-weight="700" fill="#4f4f38">${brlLocal(vi)}</text>
    <text x="${xFim}" y="${bottom + 16}" text-anchor="end" font-size="9.5" fill="#6c6c5f">${escapeHtml(dataVencFmt)}</text>
  </svg>`;
}

// Gráfico de fluxo de caixa para ativos com juros DISTRIBUÍDOS periodicamente (não reinvestidos):
// diferencia visualmente o principal (linha plana tracejada — o capital não cresce, pois os juros são
// pagos "para fora") da renda distribuída acumulada (linha em degraus, um degrau por pagamento — mensal
// ou semestral, conforme o ativo — com área preenchida) — em vez da linha diagonal única usada nos
// ativos bullet, que sugeriria (incorretamente) capitalização composta contínua do capital.
function gerarFluxoCupomSVG({ vi, cupomLiquidos, vfCdi, dataVencFmt }) {
  const top = 26;
  const bottom = 108;
  const xIni = 42;
  const xFim = 418;
  const n = Math.max(1, cupomLiquidos.length);
  // A alíquota regressiva cai ao longo do tempo, então cada pagamento pode ter um valor líquido
  // diferente do anterior — a escada soma o valor real de cada um, em vez de multiplicar um único
  // valor fixo pelo número de pagamentos.
  const valorFinalRenda = vi + cupomLiquidos.reduce((s, v) => s + v, 0);
  const maxVal = Math.max(valorFinalRenda, vfCdi) * 1.06;
  const minVal = 0;
  const escala = (v) => bottom - ((v - minVal) / (maxVal - minVal)) * (bottom - top);

  const yPrincipal = escala(vi);
  const yFimCdi = escala(vfCdi);
  const yFimRenda = escala(valorFinalRenda);

  const gridlines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = top + (bottom - top) * f;
    return `<line x1="${xIni}" y1="${y.toFixed(1)}" x2="${xFim}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  // Escada da renda acumulada: um degrau por pagamento, do principal (período 0) até principal + todos
  // os juros líquidos recebidos (período n) — representa o dinheiro efetivamente recebido, não reinvestido.
  const pontos = [[xIni, yPrincipal]];
  let yAnterior = yPrincipal;
  let acumulado = vi;
  for (let m = 1; m <= n; m++) {
    const x = xIni + ((xFim - xIni) * m) / n;
    acumulado += cupomLiquidos[m - 1];
    const y = escala(acumulado);
    pontos.push([x, yAnterior]);
    pontos.push([x, y]);
    yAnterior = y;
  }
  const pontosStr = pontos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPontos = `${xIni.toFixed(1)},${yPrincipal.toFixed(1)} ${pontosStr} ${xFim.toFixed(1)},${yPrincipal.toFixed(1)}`;

  const { yLabelA: yLabelRenda, yLabelB: yLabelCdi } = labelsFinaisSemColisao(yFimRenda, yFimCdi);

  return `<svg width="100%" viewBox="0 0 460 148" class="linha-comparativa">
    <g stroke="#e6e2d6" stroke-width="1">${gridlines}</g>
    <line x1="${xIni}" y1="${yPrincipal.toFixed(1)}" x2="${xFim}" y2="${yFimCdi.toFixed(1)}" stroke="#9a9a8c" stroke-width="1.6" stroke-dasharray="4 3"/>
    <polygon points="${areaPontos}" fill="#8fbf5a" fill-opacity="0.16" stroke="none"/>
    <line x1="${xIni}" y1="${yPrincipal.toFixed(1)}" x2="${xFim}" y2="${yPrincipal.toFixed(1)}" stroke="#b0ac92" stroke-width="1.6" stroke-dasharray="2 3"/>
    <polyline points="${pontosStr}" fill="none" stroke="#5b7d3a" stroke-width="2.2"/>
    <circle cx="${xIni}" cy="${yPrincipal.toFixed(1)}" r="3" fill="#5b7d3a"/>
    <circle cx="${xFim}" cy="${yFimRenda.toFixed(1)}" r="3" fill="#5b7d3a"/>
    <circle cx="${xFim}" cy="${yFimCdi.toFixed(1)}" r="3" fill="#9a9a8c"/>
    <text x="${xFim}" y="${yLabelRenda.toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="#1f1f14">${brlLocal(valorFinalRenda)}</text>
    <text x="${xFim}" y="${yLabelCdi.toFixed(1)}" text-anchor="end" font-size="10" fill="#6c6c5f">${brlLocal(vfCdi)}</text>
    <text x="${xIni}" y="${bottom + 16}" font-size="9.5" fill="#6c6c5f">Hoje</text>
    <text x="${xIni}" y="${bottom + 29}" font-size="10" font-weight="700" fill="#4f4f38">Principal: ${brlLocal(vi)}</text>
    <text x="${xFim}" y="${bottom + 16}" text-anchor="end" font-size="9.5" fill="#6c6c5f">${escapeHtml(dataVencFmt)}</text>
  </svg>`;
}

// Gráfico para ativos Cash Sweep: mostra o SALDO DEVEDOR caindo (amortização programada, degraus para
// baixo) ao lado dos JUROS RECEBIDOS acumulados (degraus para cima) — diferente do gráfico de cupom
// comum, aqui o principal não fica constante até o vencimento, ele é devolvido aos poucos.
function gerarFluxoCashSweepSVG({ vi, saldoHistorico, jurosHistorico, mesesTotais, vfCdi, dataVencFmt }) {
  const top = 26;
  const bottom = 108;
  const xIni = 42;
  const xFim = 418;
  const somaJuros = jurosHistorico.reduce((s, j) => s + j.valor, 0);
  const maxVal = Math.max(vi, vfCdi, somaJuros) * 1.06;
  const minVal = 0;
  const escala = (v) => bottom - ((v - minVal) / (maxVal - minVal)) * (bottom - top);
  const x = (mes) => xIni + ((xFim - xIni) * mes) / mesesTotais;

  const gridlines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = top + (bottom - top) * f;
    return `<line x1="${xIni}" y1="${y.toFixed(1)}" x2="${xFim}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  // Escada do saldo devedor: cai a cada amortização, conforme saldoHistorico (já vem com os pontos
  // certos calculados em calculo.js — inclui o ponto inicial [mes 0, vi]).
  const pontosSaldo = [[x(saldoHistorico[0].mes), escala(saldoHistorico[0].saldo)]];
  let yAnteriorSaldo = pontosSaldo[0][1];
  for (let i = 1; i < saldoHistorico.length; i++) {
    const px = x(saldoHistorico[i].mes);
    const py = escala(saldoHistorico[i].saldo);
    pontosSaldo.push([px, yAnteriorSaldo]);
    pontosSaldo.push([px, py]);
    yAnteriorSaldo = py;
  }
  const pontosSaldoStr = pontosSaldo.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');

  // Escada dos juros recebidos, acumulados a cada pagamento.
  const pontosJuros = [[xIni, escala(0)]];
  let acumuladoJuros = 0;
  let yAnteriorJuros = pontosJuros[0][1];
  for (const j of jurosHistorico) {
    const px = x(j.mes);
    acumuladoJuros += j.valor;
    const py = escala(acumuladoJuros);
    pontosJuros.push([px, yAnteriorJuros]);
    pontosJuros.push([px, py]);
    yAnteriorJuros = py;
  }
  const pontosJurosStr = pontosJuros.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const areaJurosPontos = `${xIni.toFixed(1)},${escala(0).toFixed(1)} ${pontosJurosStr} ${xFim.toFixed(1)},${escala(0).toFixed(1)}`;

  const yFimCdi = escala(vfCdi);
  const yFimJuros = escala(somaJuros);
  const { yLabelA: yLabelJuros, yLabelB: yLabelCdi } = labelsFinaisSemColisao(yFimJuros, yFimCdi);

  return `<svg width="100%" viewBox="0 0 460 148" class="linha-comparativa">
    <g stroke="#e6e2d6" stroke-width="1">${gridlines}</g>
    <line x1="${xIni}" y1="${escala(vi).toFixed(1)}" x2="${xFim}" y2="${yFimCdi.toFixed(1)}" stroke="#9a9a8c" stroke-width="1.6" stroke-dasharray="4 3"/>
    <polygon points="${areaJurosPontos}" fill="#8fbf5a" fill-opacity="0.16" stroke="none"/>
    <polyline points="${pontosSaldoStr}" fill="none" stroke="#b0ac92" stroke-width="2.2"/>
    <polyline points="${pontosJurosStr}" fill="none" stroke="#5b7d3a" stroke-width="2.2"/>
    <circle cx="${xIni}" cy="${escala(vi).toFixed(1)}" r="3" fill="#b0ac92"/>
    <circle cx="${xFim}" cy="${escala(0).toFixed(1)}" r="3" fill="#b0ac92"/>
    <circle cx="${xFim}" cy="${yFimJuros.toFixed(1)}" r="3" fill="#5b7d3a"/>
    <circle cx="${xFim}" cy="${yFimCdi.toFixed(1)}" r="3" fill="#9a9a8c"/>
    <text x="${xFim}" y="${yLabelJuros.toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="#1f1f14">${brlLocal(somaJuros)}</text>
    <text x="${xFim}" y="${yLabelCdi.toFixed(1)}" text-anchor="end" font-size="10" fill="#6c6c5f">${brlLocal(vfCdi)}</text>
    <text x="${xIni}" y="${bottom + 16}" font-size="9.5" fill="#6c6c5f">Hoje</text>
    <text x="${xIni}" y="${bottom + 29}" font-size="10" font-weight="700" fill="#4f4f38">Saldo inicial: ${brlLocal(vi)}</text>
    <text x="${xFim}" y="${bottom + 16}" text-anchor="end" font-size="9.5" fill="#6c6c5f">${escapeHtml(dataVencFmt)}</text>
  </svg>`;
}

// Gráfico de evolução do comparativo de Novação de Debênture: duas linhas contínuas (a "outra linha"
// — resgate/reaplicação ou parado a 90% CDI — em cinza, e a Novação em verde), partindo do MESMO
// ponto no vencimento contratual (onde nenhuma decisão ainda as diferenciou), com um marcador
// tracejado na data efetivamente avaliada no comparativo acima e, se existir, um marcador de "ponto
// de virada" — a partir de quando a Novação passa a valer mais.
function gerarCurvaGanhoSVG({ pontos, pontoVirada, labelOutraLinha, labelNovacao }) {
  const top = 12;
  const bottom = 99;
  const xIni = 54;
  const xFim = 500;

  const dataIni = pontos[0].data;
  const dataFim = pontos[pontos.length - 1].data;
  const totalMs = Math.max(1, dataFim.getTime() - dataIni.getTime());
  const x = (data) => xIni + ((xFim - xIni) * (data.getTime() - dataIni.getTime())) / totalMs;

  const valores = pontos.flatMap((p) => [p.outraLinha, p.novacao]);
  const maxVal = Math.max(...valores) * 1.06;
  const minVal = Math.min(0, Math.min(...valores) * 0.97);
  const escala = (v) => bottom - ((v - minVal) / (maxVal - minVal)) * (bottom - top);

  const gridlines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = top + (bottom - top) * f;
    return `<line x1="${xIni}" y1="${y.toFixed(1)}" x2="${xFim}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  const linhaOutra = pontos.map((p) => `${x(p.data).toFixed(1)},${escala(p.outraLinha).toFixed(1)}`).join(' ');
  const linhaNovacao = pontos.map((p) => `${x(p.data).toFixed(1)},${escala(p.novacao).toFixed(1)}`).join(' ');

  let marcadorVirada = '';
  if (pontoVirada) {
    const xV = x(pontoVirada.data);
    const yV = escala(pontoVirada.valor);
    marcadorVirada = `<line x1="${xV.toFixed(1)}" y1="${top}" x2="${xV.toFixed(1)}" y2="${bottom}" stroke="#5b7d3a" stroke-width="1.4" stroke-dasharray="2 2"/>
    <circle cx="${xV.toFixed(1)}" cy="${yV.toFixed(1)}" r="4.5" fill="#fff" stroke="#5b7d3a" stroke-width="2.2"/>`;
  }

  const ultimoOutra = pontos[pontos.length - 1].outraLinha;
  const ultimoNovacao = pontos[pontos.length - 1].novacao;
  const { yLabelA: yLabelOutra, yLabelB: yLabelNovacao } = labelsFinaisSemColisao(escala(ultimoOutra), escala(ultimoNovacao));

  return `<svg width="100%" viewBox="0 0 540 118" class="curva-ganho">
    <g stroke="#e6e2d6" stroke-width="1">${gridlines}</g>
    <polyline points="${linhaOutra}" fill="none" stroke="#9a9a8c" stroke-width="2"/>
    <polyline points="${linhaNovacao}" fill="none" stroke="#5b7d3a" stroke-width="2.4"/>
    ${marcadorVirada}
    <text x="${xFim}" y="${yLabelOutra.toFixed(1)}" text-anchor="end" font-size="9" fill="#6c6c5f">${escapeHtml(labelOutraLinha)}</text>
    <text x="${xFim}" y="${yLabelNovacao.toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="700" fill="#28451a">${escapeHtml(labelNovacao)}</text>
    <text x="${xIni}" y="${bottom + 16}" font-size="8.5" fill="#6c6c5f">${dataCurtaLocal(dataIni)}</text>
    <text x="${xFim}" y="${bottom + 16}" text-anchor="end" font-size="8.5" fill="#6c6c5f">${dataCurtaLocal(dataFim)}</text>
  </svg>`;
}

function dataCurtaLocal(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function brlLocal(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatK(v) {
  return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace('.', ',');
}

function formatPct(pct) {
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1).replace('.', ',')}%`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { gerarDonutSVG, gerarBarChartSVG, gerarLinhaComparativaSVG, gerarFluxoCupomSVG, gerarFluxoCashSweepSVG, gerarCurvaGanhoSVG, paletaCores, formatK, formatPct, escapeHtml };
