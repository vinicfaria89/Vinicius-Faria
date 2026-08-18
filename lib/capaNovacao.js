// Capa (página 1) do relatório de Novação de Debênture — mesmo padrão visual escuro/GCB da capa da
// Carteira Simulada (ver lib/capa.js: fundo verde-oliva, cards de destaque, rodapé com disclaimer),
// mas com os números que respondem à pergunta do cliente em 30 segundos: quanto ele ganha, pra qual
// produto vai, e quando vence — em vez dos números de carteira (valor futuro total, % do CDI) que não
// fazem sentido nesse contexto.

const { escapeHtml } = require('./svgCharts');
const { dataDDMMAAAA, dataPorExtenso } = require('./format');

function brl2(v) {
  const sinal = v < 0 ? '-' : '';
  return `${sinal}R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gerarCapaNovacaoHtml({
  cliente, assessor, dataBase, multiplas, quantidade,
  nomeAtivoNovo, vencimentoNovo, ganho, ganhoPct, paginaTotal,
}) {
  const titulo = multiplas ? 'Novação de Debêntures' : 'Novação de Debênture';
  const ganhoPositivo = ganho >= 0;

  const cardGanho = `<div class="card hl">
      <div class="lbl">${multiplas ? 'Ganho Líquido Total Estimado' : 'Ganho Líquido Estimado'}</div>
      <div class="val">${ganhoPositivo ? '+' : ''}${brl2(ganho)}</div>
      <div class="cap">${multiplas
    ? 'Somando a melhor opção de novação recomendada para cada debênture'
    : (ganhoPct != null ? `${ganhoPositivo ? '+' : ''}${ganhoPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% frente ao cenário alternativo` : 'Frente ao cenário alternativo considerado')}</div>
    </div>`;

  const cardsHtml = multiplas
    ? `<div class="cards">
        <div class="card">
          <div class="lbl">Debêntures analisadas</div>
          <div class="val">${quantidade}</div>
          <div class="cap">Cada uma com a melhor opção de novação recomendada</div>
        </div>
        ${cardGanho}
      </div>`
    : `<div class="cards">
        <div class="card">
          <div class="lbl">Nova Debênture</div>
          <div class="val" style="font-size:17px;">${escapeHtml(nomeAtivoNovo || 'A definir')}</div>
          <div class="cap">Vencimento: ${dataDDMMAAAA(vencimentoNovo)}</div>
        </div>
        ${cardGanho}
      </div>`;

  return `<div class="page cover">
  <div class="decor"></div>
  <div class="topbar"></div>
  <div class="content">
    <div class="logo">GCB</div>
    <h1>${titulo}<span class="g">GCB Investimentos</span></h1>
    <div class="subtitle">${multiplas ? `Comparativo para ${quantidade} debênture${quantidade === 1 ? '' : 's'} de` : 'Comparativo de novação para'} ${escapeHtml(cliente)}</div>
    <div class="rule"></div>
    <div class="meta"><b>Cliente:</b> ${escapeHtml(cliente)}<br>Data: ${dataPorExtenso(dataBase)}<br>Elaborado por ${escapeHtml(assessor || 'Vinícius Faria')}</div>
    <div class="spacer"></div>
    ${cardsHtml}
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

module.exports = { gerarCapaNovacaoHtml };
