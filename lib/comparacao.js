// Resumo comparável de uma carteira calculada (calcularCarteira) — usado na tela "Comparar simulações".
// Todos os cenários são recalculados com a mesma data-base e as mesmas curvas de mercado, então a
// comparação é justa mesmo entre simulações feitas em dias diferentes.

const { mediaPagamentosLiquidos } = require('./calculo');

const distribuiCupom = (r) => !!(r.ativo.cashSweep || (r.ativo.pagaCupomMensal && !r.ativo.reinvestir));

function resumirCarteira(carteira, rotulo) {
  const { resultados, viTotal } = carteira;
  const mensais = resultados.filter((r) => distribuiCupom(r) && r.calc.periodicidadeCupom !== 'semestral' && r.calc.periodicidadeCupom !== 'anual');
  const semestrais = resultados.filter((r) => distribuiCupom(r) && r.calc.periodicidadeCupom === 'semestral');
  const cagrPct = (Math.pow(1 + carteira.retornoLiquidoPct / 100, 365 / carteira.diasDuracaoMedia) - 1) * 100;
  const venc = resultados.map((r) => r.ativo.vencimento).sort((a, b) => b - a)[0];
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    rotulo,
    nAtivos: resultados.length,
    viTotal,
    vfLiquidoTotal: carteira.vfLiquidoTotal,
    ganhoLiquido: carteira.vfLiquidoTotal - viTotal,
    retornoLiquidoPct: carteira.retornoLiquidoPct,
    cagrPct,
    pctDoCdi: carteira.pctDoCdi,
    irTotal: carteira.irTotal,
    prazoMedioAnos: carteira.prazoMedioAnos,
    durationAnos: carteira.durationAnos,
    rendaMensalMedia: mensais.reduce((s, r) => s + mediaPagamentosLiquidos(r.calc), 0),
    rendaSemestralMedia: semestrais.reduce((s, r) => s + mediaPagamentosLiquidos(r.calc), 0),
    vencimentoMaisLongo: venc ? isoLocal(venc) : null,
    produtos: resultados.map((r) => ({
      nome: r.ativo.nome,
      categoria: r.ativo.tipoProdutoLabel,
      vi: r.ativo.vi,
      pctCarteira: viTotal > 0 ? (r.ativo.vi / viTotal) * 100 : 0,
      vfLiquido: r.calc.vfLiquido,
    })),
  };
}

// Índices vencedores de uma linha de números (`melhor`: 'maior' | 'menor'). Sem vencedor quando todos
// empatam ou quando "o maior" é zero (ninguém ganhou nada).
function vencedores(valores, melhor) {
  if (!melhor || valores.length < 2) return [];
  const nums = valores.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  const validos = nums.filter((v) => v !== null);
  if (validos.length < 2) return [];
  const alvo = melhor === 'maior' ? Math.max(...validos) : Math.min(...validos);
  if (validos.every((v) => Math.abs(v - alvo) < 1e-9)) return [];
  if (alvo === 0 && melhor === 'maior') return [];
  return nums.map((v, i) => (v !== null && Math.abs(v - alvo) < 1e-9 ? i : -1)).filter((i) => i >= 0);
}

// Quais métricas têm "melhor" e em que direção (as demais são só informativas, sem destaque).
const MELHOR = {
  vfLiquidoTotal: 'maior', ganhoLiquido: 'maior', retornoLiquidoPct: 'maior', cagrPct: 'maior', pctDoCdi: 'maior',
  irTotal: 'menor', rendaMensalMedia: 'maior', rendaSemestralMedia: 'maior', durationAnos: 'menor',
};

// { chave: [índices dos cenários vencedores] } só para as métricas com vencedor claro.
function destaques(cenarios) {
  const out = {};
  Object.entries(MELHOR).forEach(([chave, melhor]) => {
    const v = vencedores(cenarios.map((c) => c[chave]), melhor);
    if (v.length) out[chave] = v;
  });
  return out;
}

module.exports = { resumirCarteira, vencedores, destaques };
