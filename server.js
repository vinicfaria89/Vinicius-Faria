const express = require('express');
const path = require('path');
const fs = require('fs');

const anbima = require('./lib/anbima');
const b3 = require('./lib/b3');
const bacen = require('./lib/bacen');
const { montarRelatorioOficial, montarRelatorioNovacao, montarRelatorioNovacaoMultipla, taxaLabelOficial, categoriaLabel } = require('./lib/reportOficial');
const { gerarPdfDeHtml, medirAlturasCards, encerrarBrowser } = require('./lib/pdf');
const { parseDataLocal, dataDDMMAAAA } = require('./lib/format');
const historico = require('./lib/historico');
const produtosCatalogo = require('./lib/produtos');
const calculadora = require('./lib/calculadoraFinanceira');
const { calcularNovacao } = require('./lib/novacao');
const novacaoAplicacoes = require('./lib/novacaoAplicacoes');

const app = express();
const PORT = process.env.PORT || 4321;
const OUTPUT_DIR = path.join(__dirname, 'output');
// CRI e CRA são sempre isentos de IR para pessoa física (Lei 11.033/2004, art. 3º, XVII e XVIII) —
// reforçado aqui (não só no formulário) porque este endpoint é a fonte de verdade da simulação.
const CATEGORIAS_SEMPRE_ISENTAS = ['CRI', 'CRA'];

// Cópia local opcional (fluxo de uso individual, na própria máquina, dentro da pasta "Simulação" do
// OneDrive) — só roda se a pasta existir; num servidor compartilhado ela simplesmente não existe e
// esse passo é pulado, sem erro.
const SIMULACAO_DIR = path.join(__dirname, '..');

// Autenticação HTTP Basic — só é ativada se BASIC_AUTH_USER e BASIC_AUTH_PASS estiverem definidos
// (variáveis de ambiente), pensada para uso em servidor compartilhado. Em uso local, sem essas
// variáveis, o app continua acessível sem login, como sempre foi.
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;
if (BASIC_AUTH_USER && BASIC_AUTH_PASS) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, credenciais] = header.split(' ');
    if (scheme === 'Basic' && credenciais) {
      const [user, pass] = Buffer.from(credenciais, 'base64').toString('utf8').split(':');
      if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="GCB Simulador"');
    res.status(401).send('Autenticação necessária.');
  });
  console.log('Autenticação HTTP Basic ativada (BASIC_AUTH_USER/BASIC_AUTH_PASS definidos).');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Traduz erros técnicos das fontes externas (ANBIMA/B3/BACEN — todas prefixam a mensagem com o
// próprio nome, ver lib/anbima.js, lib/b3.js, lib/bacen.js) numa mensagem clara pro usuário final,
// sem stack trace nem detalhe de URL/status HTTP cru. O erro completo sempre vai pro log do
// servidor (console.error), só a mensagem exibida na tela é que fica mais simples.
const FONTES_EXTERNAS = [
  { prefixo: 'ANBIMA', label: 'ANBIMA (curva de juros / inflação implícita)' },
  { prefixo: 'B3', label: 'B3 (curva DI Futuro)' },
  { prefixo: 'BACEN', label: 'BACEN (Selic, IPCA, projeções Focus)' },
];
function mensagemAmigavel(err) {
  const fonte = FONTES_EXTERNAS.find((f) => err.message.startsWith(f.prefixo));
  if (fonte) {
    return `Não foi possível obter dados atualizados da ${fonte.label} agora — a fonte pode estar temporariamente instável. Tente novamente em alguns minutos.`;
  }
  return 'Ocorreu um erro inesperado ao gerar a simulação. Tente novamente; se persistir, avise o suporte.';
}

// Log de erros 500 em arquivo — a janela do servidor roda oculta (VBS), então o console não é
// visível; sem isso, não há como diagnosticar uma falha relatada pelo usuário depois do fato.
const LOG_ERROS_PATH = path.join(__dirname, 'logs', 'erros.log');
function logarErro(contexto, err, dadosRelevantes) {
  try {
    fs.mkdirSync(path.dirname(LOG_ERROS_PATH), { recursive: true });
    const linha = `[${new Date().toISOString()}] ${contexto}\n${err.stack || err.message}\nDados: ${JSON.stringify(dadosRelevantes)}\n\n`;
    fs.appendFileSync(LOG_ERROS_PATH, linha);
  } catch (_e) {
    // Se nem o log der certo, não deixa isso derrubar a resposta de erro original.
  }
}

// Premissas de mercado (BACEN) — usadas só para exibir no formulário, não entram no cálculo da curva.
app.get('/api/premissas', async (req, res) => {
  try {
    const premissas = await bacen.getPremissasMercado();
    res.json(premissas);
  } catch (err) {
    console.error('[premissas] falha ao consultar BACEN:', err);
    res.status(502).json({ erro: mensagemAmigavel(err) });
  }
});

app.post('/api/gerar', async (req, res) => {
  try {
    const { cliente, dataBase, templateType, ativos } = req.body;
    const assessor = (req.body.assessor || '').trim() || 'Vinícius Faria';

    if (!cliente || !dataBase || !templateType || !Array.isArray(ativos) || ativos.length === 0) {
      return res.status(400).json({ erro: 'Campos obrigatórios: cliente, dataBase, templateType, ativos[]' });
    }

    const dataBaseObj = parseDataLocal(dataBase);

    const ativosInput = ativos.map((a) => {
      const base = {
        nome: a.nome,
        tipoProdutoLabel: a.tipoProdutoLabel,
        tipo: a.tipo, // 'fixo' | 'fixoAA' | 'cdi' | 'ipca' | 'pctcdi'
        vi: Number(a.vi),
        vencimento: parseDataLocal(a.vencimento),
        isento: CATEGORIAS_SEMPRE_ISENTAS.includes(a.tipoProdutoLabel) || !!a.isento,
        pagaCupomMensal: !!a.pagaCupomMensal,
        reinvestir: !!a.reinvestir,
        cashSweep: !!a.cashSweep,
        periodicidadeCupom: a.periodicidadeCupom === 'semestral' ? 'semestral' : 'mensal',
        periodicidadeJurosCashSweep: a.periodicidadeJurosCashSweep === 'semestral' ? 'semestral' : 'mensal',
        periodicidadeAmortizacaoCashSweep: a.periodicidadeAmortizacaoCashSweep === 'semestral' ? 'semestral' : 'mensal',
      };
      if (a.tipo === 'fixo') base.taxaAM = Number(a.taxaAM) / 100;
      else if (a.tipo === 'fixoAA') base.taxaAA = Number(a.taxaAA) / 100;
      else if (a.tipo === 'pctcdi') base.percentualCDI = Number(a.percentualCDI) / 100;
      else base.spread = Number(a.spread) / 100; // cdi / ipca
      return base;
    });

    // Valor investido e taxa não podem ser negativos (nem zero) — reforçado aqui porque o
    // formulário já bloqueia isso na UI, mas esse endpoint pode ser chamado diretamente.
    for (let i = 0; i < ativosInput.length; i += 1) {
      const a = ativosInput[i];
      const n = i + 1;
      if (!(a.vi > 0)) {
        return res.status(400).json({ erro: `Ativo ${n}: valor investido deve ser maior que 0.` });
      }
      const taxa = a.taxaAM ?? a.taxaAA ?? a.percentualCDI ?? a.spread;
      if (!(taxa > 0)) {
        return res.status(400).json({ erro: `Ativo ${n}: taxa deve ser maior que 0.` });
      }
    }

    const somaVi = ativosInput.reduce((s, a) => s + a.vi, 0);
    const somaEsperada = Number(req.body.valorTotal || somaVi);
    if (Math.abs(somaVi - somaEsperada) > 1) {
      return res.status(400).json({ erro: `A soma do Valor Investido dos ativos (${somaVi}) não bate com o Valor Total informado (${somaEsperada}).` });
    }

    const [curvaAnbima, curvaB3Pre] = await Promise.all([anbima.getCurvaANBIMA(), b3.getCurvaPRE()]);
    const curvas = { anbima: curvaAnbima, b3Pre: curvaB3Pre };
    const { html, carteira } = await montarRelatorioOficial({
      cliente,
      dataBase: dataBaseObj,
      ativosInput,
      templateType,
      curvas,
      assessor,
      medirAlturasCards,
    });

    const nomeArquivo = `${cliente.replace(/[^\p{L}\p{N}]+/gu, '_')}_${templateType === 'renda' ? 'Renda_Mensal' : 'Crescimento_Patrimonio'}_${Date.now()}.pdf`;
    const pdfPath = await gerarPdfDeHtml(html, nomeArquivo, OUTPUT_DIR);

    // Em uso local (fora de produção), também salva uma cópia na pasta "Simulação" (OneDrive) — esse
    // passo é puramente uma conveniência do fluxo de uso individual na própria máquina; em produção
    // (servidor compartilhado, ver NODE_ENV=production no deploy) ele é desativado, porque a pasta-pai
    // do app no servidor não tem nenhuma relação com a pasta pessoal do usuário.
    if (process.env.NODE_ENV !== 'production') {
      try {
        fs.copyFileSync(pdfPath, path.join(SIMULACAO_DIR, nomeArquivo));
      } catch (copyErr) {
        console.warn(`Aviso: não foi possível copiar para a pasta Simulação: ${copyErr.message}`);
      }
    }

    // Registra no histórico — inclui os produtos simulados (nome, categoria, taxa, valor, vencimento),
    // não só o resumo agregado, pra dar pra ver depois "quem simulou o quê" sem reabrir o PDF.
    historico.registrarSimulacao({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      geradoEm: new Date().toISOString(),
      cliente,
      assessor,
      templateType,
      dataBase,
      arquivo: nomeArquivo,
      downloadUrl: `/api/download/${encodeURIComponent(nomeArquivo)}`,
      produtos: ativosInput.map((a) => ({
        nome: a.nome,
        categoria: categoriaLabel(a.tipoProdutoLabel),
        taxa: taxaLabelOficial(a),
        vi: a.vi,
        vencimento: dataDDMMAAAA(a.vencimento),
        isento: a.isento,
        cashSweep: a.cashSweep,
        fluxo: a.cashSweep ? 'Cash Sweep' : a.reinvestir ? 'Reinvestido' : a.pagaCupomMensal ? 'Distribuído' : 'Bullet',
      })),
      resumo: {
        viTotal: carteira.viTotal,
        vfLiquidoTotal: carteira.vfLiquidoTotal,
        retornoLiquidoPct: carteira.retornoLiquidoPct,
        pctDoCdi: carteira.pctDoCdi,
      },
    });

    res.json({
      ok: true,
      arquivo: nomeArquivo,
      downloadUrl: `/api/download/${encodeURIComponent(nomeArquivo)}`,
      resumo: {
        viTotal: carteira.viTotal,
        vfLiquidoTotal: carteira.vfLiquidoTotal,
        retornoLiquidoPct: carteira.retornoLiquidoPct,
        pctDoCdi: carteira.pctDoCdi,
      },
    });
  } catch (err) {
    console.error('[gerar] falha ao gerar simulação:', err);
    res.status(500).json({ erro: mensagemAmigavel(err) });
  }
});

app.get('/api/historico', (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca : '';
  const assessor = typeof req.query.assessor === 'string' ? req.query.assessor : '';
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  res.json({ entradas: historico.listarHistorico({ limit, busca, assessor }), assessores: historico.listarAssessores() });
});

app.delete('/api/historico/:id', (req, res) => {
  try {
    historico.removerSimulacao(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ erro: err.message });
  }
});

app.get('/api/produtos', (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca : '';
  res.json({ produtos: produtosCatalogo.listarProdutos({ busca }) });
});

app.post('/api/produtos', (req, res) => {
  try {
    const produto = produtosCatalogo.salvarProduto(req.body || {});
    res.json({ produto });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

app.post('/api/produtos/lote', (req, res) => {
  const lista = Array.isArray(req.body.produtos) ? req.body.produtos : [];
  if (!lista.length) return res.status(400).json({ erro: 'Nenhum produto para importar.' });
  const resultado = produtosCatalogo.importarProdutos(lista);
  res.json(resultado);
});

app.delete('/api/produtos/:id', (req, res) => {
  try {
    produtosCatalogo.removerProduto(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ erro: err.message });
  }
});

// Monta o objeto de taxa/indexador no formato que lib/calculo.js espera, a partir dos campos crus
// enviados pelo formulário da Calculadora Financeira (mesma convenção de conversão já usada em
// /api/gerar: o número digitado é uma porcentagem "crua", convertida para fração aqui).
function montarAtivoTaxa(tipo, taxa) {
  const ativoTaxa = { tipo };
  const valor = Number(taxa) / 100;
  if (tipo === 'fixo') ativoTaxa.taxaAM = valor;
  else if (tipo === 'fixoAA') ativoTaxa.taxaAA = valor;
  else if (tipo === 'pctcdi') ativoTaxa.percentualCDI = valor;
  else ativoTaxa.spread = valor; // cdi / ipca
  return ativoTaxa;
}

app.post('/api/calculadora', async (req, res) => {
  try {
    const { modo } = req.body;
    const [curvaAnbima, curvaB3Pre] = await Promise.all([anbima.getCurvaANBIMA(), b3.getCurvaPRE()]);
    const curvas = { anbima: curvaAnbima, b3Pre: curvaB3Pre };

    if (modo === 'vf') {
      const {
        tipo, taxa, dataBase, vencimento, isento, valorInvestido,
        cashSweep, periodicidadeJurosCashSweep, periodicidadeAmortizacaoCashSweep,
      } = req.body;
      if (!tipo || !dataBase || !vencimento || !(Number(valorInvestido) > 0) || !(Number(taxa) > 0)) {
        return res.status(400).json({ erro: 'Preencha indexador, taxa (maior que 0), data-base, vencimento e valor investido (maior que 0).' });
      }
      const resultado = calculadora.calcularValorFuturo({
        ativoTaxa: montarAtivoTaxa(tipo, taxa),
        dataBase: parseDataLocal(dataBase),
        vencimento: parseDataLocal(vencimento),
        isento: !!isento,
        valorInvestido: Number(valorInvestido),
        cashSweep: !!cashSweep,
        periodicidadeJurosCashSweep: periodicidadeJurosCashSweep === 'semestral' ? 'semestral' : 'mensal',
        periodicidadeAmortizacaoCashSweep: periodicidadeAmortizacaoCashSweep === 'semestral' ? 'semestral' : 'mensal',
      }, curvas);
      return res.json({ resultado });
    }

    if (modo === 'vp') {
      const { tipo, taxa, dataBase, vencimento, isento, valorFuturoDesejado } = req.body;
      if (!tipo || !dataBase || !vencimento || !(Number(valorFuturoDesejado) > 0) || !(Number(taxa) > 0)) {
        return res.status(400).json({ erro: 'Preencha indexador, taxa (maior que 0), data-base, vencimento e valor futuro desejado (maior que 0).' });
      }
      const resultado = calculadora.calcularValorPresente({
        ativoTaxa: montarAtivoTaxa(tipo, taxa),
        dataBase: parseDataLocal(dataBase),
        vencimento: parseDataLocal(vencimento),
        isento: !!isento,
        valorFuturoDesejado: Number(valorFuturoDesejado),
      }, curvas);
      return res.json({ resultado });
    }

    if (modo === 'rentabilidade') {
      const { dataBase, vencimento, valorInvestido, valorFuturo } = req.body;
      if (!dataBase || !vencimento || !(Number(valorInvestido) > 0) || !(Number(valorFuturo) > 0)) {
        return res.status(400).json({ erro: 'Preencha data-base, data final, valor investido e valor futuro.' });
      }
      const resultado = calculadora.calcularRentabilidade({
        dataBase: parseDataLocal(dataBase),
        dataFinal: parseDataLocal(vencimento),
        valorInvestido: Number(valorInvestido),
        valorFuturo: Number(valorFuturo),
      }, curvas);
      return res.json({ resultado });
    }

    if (modo === 'taxaEquivalente') {
      const { tipo, taxa, dataBase, vencimento } = req.body;
      if (!tipo || !dataBase || !vencimento || !(Number(taxa) > 0)) {
        return res.status(400).json({ erro: 'Preencha indexador, taxa (maior que 0), data-base e vencimento.' });
      }
      const resultado = calculadora.calcularTaxaEquivalente({
        ativoTaxa: montarAtivoTaxa(tipo, taxa),
        dataBase: parseDataLocal(dataBase),
        vencimento: parseDataLocal(vencimento),
      }, curvas);
      return res.json({ resultado });
    }

    res.status(400).json({ erro: `Modo de cálculo desconhecido: ${modo}` });
  } catch (err) {
    console.error('[calculadora] falha ao calcular:', err);
    res.status(500).json({ erro: mensagemAmigavel(err) });
  }
});

// Lê e valida os campos comuns aos dois endpoints de Novação de Debênture (cálculo e PDF) — evita
// duplicar a mesma validação nos dois handlers.
//   - modoNovacao: como a "data da novação" (o dia em que a decisão efetivamente vale) é determinada:
//     'vencimento' -> igual ao vencimento contratual da debênture atual (sem período vencido);
//     'assinatura' -> dia seguinte à assinatura do termo de novação (`dataAssinatura`) — se essa
//     assinatura ocorrer depois do vencimento contratual, o intervalo entre os dois passa a render
//     90% do CDI automaticamente (ver lib/novacao.js) — a debênture vencida não some, só muda de taxa.
//   - Cenário 1 (resgate) reaplica em `tipoReaplicacao`/`taxaReaplicacao`/`vencimentoReaplicacao`, com
//     sua própria isenção e fluxo de pagamento (bullet, distribuído, reinvestido ou Cash Sweep) — um
//     produto totalmente independente, dentro ou fora da GCB, não precisa ser outra debênture.
//   - Cenário 2 (novação) continua em `tipoNovacao`/`taxaNovacao`/`vencimentoNovacao`, herdando a
//     isenção da debênture atual (é o mesmo título renovado, não um produto novo).
//   - modoSimplificado: quando true, dispensa o produto de reaplicação inteiramente — o Cenário 1
//     vira "sem novação, parado a 90% do CDI" (capital nunca resgatado, rendendo a taxa de mercado
//     parada do vencimento contratual até a MESMA data final da novação) — ver lib/novacao.js.
function lerEValidarNovacao(body) {
  const {
    valorInvestido, dataAplicacao, valorAtualPosicao,
    tipoAtual, taxaAtual, vencimentoAtual, isentoAtual, jaFoiNovadaAntes, dataAplicacaoOriginal,
    modoNovacao, dataAssinatura,
    modoSimplificado,
    tipoReaplicacao, taxaReaplicacao, vencimentoReaplicacao, isentoReaplicacao,
    fluxoReaplicacao, periodicidadeReaplicacao,
    cashSweepReaplicacao, periodicidadeJurosCSReaplicacao, periodicidadeAmortCSReaplicacao,
    tipoNovacao, taxaNovacao, vencimentoNovacao,
  } = body;
  const simplificado = !!modoSimplificado;

  if (!dataAplicacao || !vencimentoAtual || !vencimentoNovacao || (!simplificado && !vencimentoReaplicacao)) {
    throw Object.assign(new Error('Preencha a data de aplicação, o vencimento atual, e o(s) novo(s) vencimento(s).'), { status: 400 });
  }
  if (!simplificado && (!tipoReaplicacao || !(Number(taxaReaplicacao) > 0))) {
    throw Object.assign(new Error('Preencha o indexador e a taxa (maior que 0) do produto de reaplicação (Cenário 1).'), { status: 400 });
  }
  if (!tipoNovacao || !(Number(taxaNovacao) > 0)) {
    throw Object.assign(new Error('Preencha o indexador e a taxa (maior que 0) da debênture sugerida para novação (Cenário 2).'), { status: 400 });
  }
  if (!(Number(valorInvestido) > 0)) {
    throw Object.assign(new Error('Valor investido deve ser maior que 0.'), { status: 400 });
  }
  if (!(Number(valorAtualPosicao) > 0)) {
    throw Object.assign(new Error('Preencha o valor atual da posição (no vencimento contratual).'), { status: 400 });
  }

  const dataAplicacaoObj = parseDataLocal(dataAplicacao);
  const vencimentoAtualObj = parseDataLocal(vencimentoAtual);
  const vencimentoReaplicacaoObj = simplificado ? null : parseDataLocal(vencimentoReaplicacao);
  const vencimentoNovacaoObj = parseDataLocal(vencimentoNovacao);

  if (!(vencimentoAtualObj > dataAplicacaoObj)) {
    throw Object.assign(new Error('O vencimento atual deve ser posterior à data de aplicação.'), { status: 400 });
  }

  // Se a debênture já foi novada antes, a "Data de Aplicação" acima é a data/valor/taxa da posição
  // ATUAL (desde a última novação) — o IR, porém, conta desde o primeiro investimento, que a
  // novação (não sendo evento tributável) nunca reseta. Ver lib/novacao.js.
  let dataAplicacaoOriginalObj = null;
  if (jaFoiNovadaAntes && dataAplicacaoOriginal) {
    dataAplicacaoOriginalObj = parseDataLocal(dataAplicacaoOriginal);
    if (!(dataAplicacaoOriginalObj <= dataAplicacaoObj)) {
      throw Object.assign(new Error('A data do primeiro investimento deve ser igual ou anterior à data de aplicação atual.'), { status: 400 });
    }
  }

  let dataNovacaoObj;
  if (modoNovacao === 'assinatura') {
    if (!dataAssinatura) {
      throw Object.assign(new Error('Preencha a data da assinatura do termo de novação.'), { status: 400 });
    }
    const dataAssinaturaObj = parseDataLocal(dataAssinatura);
    dataNovacaoObj = new Date(dataAssinaturaObj.getFullYear(), dataAssinaturaObj.getMonth(), dataAssinaturaObj.getDate() + 1);
  } else {
    dataNovacaoObj = vencimentoAtualObj;
  }

  // A data da novação pode ser ANTES do vencimento atual (novação antecipada de uma debênture com
  // vencimento futuro), EXATAMENTE nele, ou DEPOIS (novação tardia, debênture já vencida) — só
  // precisa ser posterior à aplicação original. O resgate (Cenário 1) sempre usa o vencimento
  // contratual, não a data da novação — ver lib/novacao.js.
  if (!(dataNovacaoObj > dataAplicacaoObj)) {
    throw Object.assign(new Error('A data da novação deve ser posterior à data de aplicação.'), { status: 400 });
  }

  // Indexador/taxa "de referência" só entram de fato no cálculo no caso raro de novação ANTECIPADA
  // (dataNovacao < vencimentoAtual) — ver lib/novacao.js. Só exige preenchimento nesse caso; fora
  // dele, ficam opcionais (viram 0%/fixoAA, sem efeito no resultado) pra não travar a maioria das
  // operações do dia a dia com um campo que não muda nada.
  const antecipada = dataNovacaoObj.getTime() < vencimentoAtualObj.getTime();
  if (antecipada && (!tipoAtual || !(Number(taxaAtual) > 0))) {
    throw Object.assign(new Error('Como esta é uma novação antecipada (antes do vencimento contratual), preencha o indexador e a taxa (maior que 0) da debênture atual — abaixo, em "Detalhes" — pra calcular corretamente o período entre a aplicação e a novação.'), { status: 400 });
  }
  const tipoAtualEfetivo = tipoAtual || 'fixoAA';
  const taxaAtualEfetiva = Number(taxaAtual) > 0 ? taxaAtual : 0;
  if (!simplificado && !(vencimentoReaplicacaoObj > vencimentoAtualObj)) {
    throw Object.assign(new Error('O vencimento do produto de reaplicação deve ser posterior ao vencimento atual.'), { status: 400 });
  }
  if (!(vencimentoNovacaoObj > dataNovacaoObj)) {
    throw Object.assign(new Error('O novo vencimento (novação) deve ser posterior à data da novação.'), { status: 400 });
  }

  return {
    valorInvestido: Number(valorInvestido),
    dataAplicacao: dataAplicacaoObj,
    valorAtualPosicao: Number(valorAtualPosicao),
    ativoTaxaAtual: montarAtivoTaxa(tipoAtualEfetivo, taxaAtualEfetiva),
    vencimentoAtual: vencimentoAtualObj,
    isentoAtual: !!isentoAtual,
    jaFoiNovadaAntes: !!jaFoiNovadaAntes,
    dataAplicacaoOriginal: dataAplicacaoOriginalObj,
    dataNovacao: dataNovacaoObj,
    modoSimplificado: simplificado,
    ativoTaxaReaplicacao: simplificado ? null : montarAtivoTaxa(tipoReaplicacao, taxaReaplicacao),
    vencimentoReaplicacao: vencimentoReaplicacaoObj,
    isentoReaplicacao: !!isentoReaplicacao,
    pagaCupomMensalReaplicacao: fluxoReaplicacao === 'distribuido' || fluxoReaplicacao === 'reinvestido',
    reinvestirReaplicacao: fluxoReaplicacao === 'reinvestido',
    periodicidadeCupomReaplicacao: periodicidadeReaplicacao === 'semestral' ? 'semestral' : 'mensal',
    cashSweepReaplicacao: !!cashSweepReaplicacao,
    periodicidadeJurosCashSweepReaplicacao: periodicidadeJurosCSReaplicacao === 'semestral' ? 'semestral' : 'mensal',
    periodicidadeAmortizacaoCashSweepReaplicacao: periodicidadeAmortCSReaplicacao === 'semestral' ? 'semestral' : 'mensal',
    ativoTaxaNovacao: montarAtivoTaxa(tipoNovacao, taxaNovacao),
    vencimentoNovacao: vencimentoNovacaoObj,
  };
}

app.post('/api/novacao', async (req, res) => {
  try {
    const dados = lerEValidarNovacao(req.body);
    const [curvaAnbima, curvaB3Pre] = await Promise.all([anbima.getCurvaANBIMA(), b3.getCurvaPRE()]);
    const curvas = { anbima: curvaAnbima, b3Pre: curvaB3Pre };
    const resultado = calcularNovacao(dados, curvas);
    res.json({ resultado });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ erro: err.message });
    console.error('[novacao] falha ao calcular:', err);
    logarErro('novacao', err, req.body);
    res.status(500).json({ erro: mensagemAmigavel(err) });
  }
});

app.post('/api/novacao/gerar', async (req, res) => {
  try {
    const dados = lerEValidarNovacao(req.body);
    const cliente = (req.body.cliente || '').trim();
    if (!cliente) return res.status(400).json({ erro: 'Cliente é obrigatório.' });
    const assessor = (req.body.assessor || '').trim() || 'Vinícius Faria';
    const nomeAtivoAtual = (req.body.nomeAtivoAtual || '').trim();
    const nomeAtivoReaplicacao = (req.body.nomeAtivoReaplicacao || '').trim();
    const nomeAtivoNovacao = (req.body.nomeAtivoNovacao || '').trim();

    const [curvaAnbima, curvaB3Pre] = await Promise.all([anbima.getCurvaANBIMA(), b3.getCurvaPRE()]);
    const curvas = { anbima: curvaAnbima, b3Pre: curvaB3Pre };
    const resultado = calcularNovacao(dados, curvas);

    const { html } = montarRelatorioNovacao({
      cliente, assessor, nomeAtivoAtual, nomeAtivoReaplicacao, nomeAtivoNovacao, resultado, ...dados,
    });

    const nomeArquivo = `Novacao_${cliente.replace(/[^\p{L}\p{N}]+/gu, '_')}_${Date.now()}.pdf`;
    await gerarPdfDeHtml(html, nomeArquivo, OUTPUT_DIR);

    res.json({ ok: true, arquivo: nomeArquivo, downloadUrl: `/api/download/${encodeURIComponent(nomeArquivo)}`, resultado });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ erro: err.message });
    console.error('[novacao/gerar] falha ao gerar PDF:', err);
    logarErro('novacao/gerar', err, req.body);
    res.status(500).json({ erro: mensagemAmigavel(err) });
  }
});

// Histórico de "Aplicação Atual" da Novação de Debênture — evita recadastrar os dados da debênture
// que o cliente já possui toda vez que for comparar novação vs. resgate.
app.get('/api/novacao/aplicacoes', (req, res) => {
  res.json({ aplicacoes: novacaoAplicacoes.listarAplicacoes() });
});

app.post('/api/novacao/aplicacoes', (req, res) => {
  try {
    const { nome, valorAtualPosicao, valorInvestido, dataAplicacao, dataAplicacaoOriginal, tipo, taxa, vencimentoAtual, isentoAtual } = req.body;
    if (!(Number(valorAtualPosicao) > 0) || !(Number(valorInvestido) > 0) || !(Number(taxa) > 0) || !tipo || !dataAplicacao || !vencimentoAtual) {
      return res.status(400).json({ erro: 'Preencha nome, valor atual da posição, valor investido, data de aplicação, indexador, taxa e vencimento antes de salvar.' });
    }
    const aplicacao = novacaoAplicacoes.salvarAplicacao({
      nome: (nome || '').trim(),
      valorAtualPosicao: Number(valorAtualPosicao),
      valorInvestido: Number(valorInvestido),
      dataAplicacao,
      dataAplicacaoOriginal: dataAplicacaoOriginal || null,
      tipo,
      taxa: Number(taxa),
      vencimentoAtual,
      isentoAtual: !!isentoAtual,
    });
    res.json({ aplicacao });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

app.delete('/api/novacao/aplicacoes/:id', (req, res) => {
  try {
    novacaoAplicacoes.removerAplicacao(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ erro: err.message });
  }
});

// Catálogo de "Debêntures Sugeridas para Novação" — reaproveita o MESMO catálogo geral de produtos
// (lib/produtos.js), filtrado por categoria "Debênture", em vez de manter uma lista paralela: o
// assessor já cadastra debêntures no catálogo geral (pra usar em qualquer simulação), e a novação
// deve enxergar essas mesmas debêntures sem exigir recadastro.
app.get('/api/novacao/sugeridas', (req, res) => {
  const sugeridas = produtosCatalogo.listarProdutos().filter((p) => p.categoria === 'Debênture');
  res.json({ sugeridas });
});

app.post('/api/novacao/sugeridas', (req, res) => {
  try {
    const { nome, tipo, taxa, vencimento } = req.body;
    if (!(Number(taxa) > 0) || !tipo || !nome || !(nome || '').trim()) {
      return res.status(400).json({ erro: 'Preencha nome, indexador e taxa (maior que 0) antes de salvar.' });
    }
    const sugerida = produtosCatalogo.salvarProduto({
      nome: nome.trim(),
      categoria: 'Debênture',
      tipo,
      taxa: Number(taxa),
      vencimento: vencimento || null,
      isento: false,
      fluxoPagamento: 'bullet',
      cashSweep: false,
    });
    res.json({ sugerida });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

app.delete('/api/novacao/sugeridas/:id', (req, res) => {
  try {
    produtosCatalogo.removerProduto(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ erro: err.message });
  }
});


// Novação de MÚLTIPLAS debêntures do mesmo cliente (vencidas ou a vencer) num único relatório — cada
// posição usa o modo simplificado (comparação contra deixar o capital parado a 90% do CDI; ver
// lib/novacao.js). Cada posição pode ter VÁRIAS debêntures sugeridas (`p.sugeridas`), pra comparar
// qual delas é a melhor opção de novação pra aquela posição — reaproveita lerEValidarNovacao pra
// validar cada combinação posição×sugerida individualmente (mesma posição, taxa/vencimento da
// sugerida trocando). O modo completo (produto de reaplicação próprio) fica restrito ao fluxo de uma
// única debênture por vez — combinar N debêntures ATUAIS com produtos de reaplicação distintos
// multiplicaria demais os campos do formulário pra pouco ganho prático.
function lerEValidarPosicoes(posicoesRaw) {
  if (!posicoesRaw.length) {
    throw Object.assign(new Error('Adicione ao menos uma debênture para novar.'), { status: 400 });
  }
  return posicoesRaw.map((p, i) => {
    const rotuloPosicao = `Debênture ${i + 1}${p.nomeAtivoAtual ? ` (${p.nomeAtivoAtual})` : ''}`;
    const sugeridasRaw = Array.isArray(p.sugeridas) ? p.sugeridas : [];
    if (!sugeridasRaw.length) {
      throw Object.assign(new Error(`${rotuloPosicao}: adicione ao menos uma debênture sugerida para novação.`), { status: 400 });
    }
    const sugeridas = sugeridasRaw.map((s, j) => {
      try {
        const dados = lerEValidarNovacao({
          ...p,
          modoSimplificado: true,
          nomeAtivoNovacao: s.nomeAtivoNovacao,
          tipoNovacao: s.tipoNovacao,
          taxaNovacao: s.taxaNovacao,
          vencimentoNovacao: s.vencimentoNovacao,
        });
        return { dados, nomeAtivoNovacao: (s.nomeAtivoNovacao || '').trim() };
      } catch (err) {
        throw Object.assign(new Error(`${rotuloPosicao}, sugerida ${j + 1}: ${err.message}`), { status: 400 });
      }
    });
    return { nomeAtivoAtual: (p.nomeAtivoAtual || '').trim(), sugeridas };
  });
}

function lerEValidarPosicoesMultiplas(body) {
  const cliente = (body.cliente || '').trim();
  if (!cliente) throw Object.assign(new Error('Cliente é obrigatório.'), { status: 400 });
  const posicoes = lerEValidarPosicoes(Array.isArray(body.posicoes) ? body.posicoes : []);
  return { cliente, posicoes };
}

app.post('/api/novacao/multiplas', async (req, res) => {
  try {
    // Cálculo/preview — não precisa de cliente (só o relatório em PDF precisa, pro nome do arquivo).
    const posicoes = lerEValidarPosicoes(Array.isArray(req.body.posicoes) ? req.body.posicoes : []);
    const [curvaAnbima, curvaB3Pre] = await Promise.all([anbima.getCurvaANBIMA(), b3.getCurvaPRE()]);
    const curvas = { anbima: curvaAnbima, b3Pre: curvaB3Pre };
    const resultados = posicoes.map((p) => ({
      nomeAtivoAtual: p.nomeAtivoAtual,
      sugeridas: p.sugeridas.map((s) => ({
        nomeAtivoNovacao: s.nomeAtivoNovacao,
        vencimentoNovacao: s.dados.vencimentoNovacao,
        taxaLabel: taxaLabelOficial(s.dados.ativoTaxaNovacao),
        resultado: calcularNovacao(s.dados, curvas),
      })),
    }));
    res.json({ resultados });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ erro: err.message });
    console.error('[novacao/multiplas] falha ao calcular:', err);
    logarErro('novacao/multiplas', err, req.body);
    res.status(500).json({ erro: mensagemAmigavel(err) });
  }
});

app.post('/api/novacao/multiplas/gerar', async (req, res) => {
  try {
    const { cliente, posicoes } = lerEValidarPosicoesMultiplas(req.body);
    const assessor = (req.body.assessor || '').trim() || 'Vinícius Faria';

    const [curvaAnbima, curvaB3Pre] = await Promise.all([anbima.getCurvaANBIMA(), b3.getCurvaPRE()]);
    const curvas = { anbima: curvaAnbima, b3Pre: curvaB3Pre };
    const posicoesCalculadas = posicoes.map((p) => {
      // vencimentoAtual/dataNovacao/valorAtualPosicao/jaFoiNovadaAntes são os mesmos em todas as
      // sugeridas dessa posição (só a debênture sugerida muda entre elas) — pega da primeira.
      const primeiraDados = p.sugeridas[0].dados;
      return {
        nomeAtivoAtual: p.nomeAtivoAtual,
        vencimentoAtual: primeiraDados.vencimentoAtual,
        dataNovacao: primeiraDados.dataNovacao,
        valorAtualPosicao: primeiraDados.valorAtualPosicao,
        jaFoiNovadaAntes: primeiraDados.jaFoiNovadaAntes,
        sugeridas: p.sugeridas.map((s) => ({
          nomeAtivoNovacao: s.nomeAtivoNovacao,
          vencimentoNovacao: s.dados.vencimentoNovacao,
          taxaLabel: taxaLabelOficial(s.dados.ativoTaxaNovacao),
          resultado: calcularNovacao(s.dados, curvas),
        })),
      };
    });

    const { html } = await montarRelatorioNovacaoMultipla({
      cliente, assessor, posicoes: posicoesCalculadas, medirAlturasCards,
    });

    const nomeArquivo = `Novacao_Multipla_${cliente.replace(/[^\p{L}\p{N}]+/gu, '_')}_${Date.now()}.pdf`;
    await gerarPdfDeHtml(html, nomeArquivo, OUTPUT_DIR);

    res.json({
      ok: true,
      arquivo: nomeArquivo,
      downloadUrl: `/api/download/${encodeURIComponent(nomeArquivo)}`,
      resultados: posicoesCalculadas.map((p) => ({
        nomeAtivoAtual: p.nomeAtivoAtual,
        sugeridas: p.sugeridas.map((s) => ({ nomeAtivoNovacao: s.nomeAtivoNovacao, resultado: s.resultado })),
      })),
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ erro: err.message });
    console.error('[novacao/multiplas/gerar] falha ao gerar PDF:', err);
    logarErro('novacao/multiplas/gerar', err, req.body);
    res.status(500).json({ erro: mensagemAmigavel(err) });
  }
});

app.get('/api/download/:arquivo', (req, res) => {
  const arquivo = req.params.arquivo;
  const filePath = path.join(OUTPUT_DIR, arquivo);
  if (!filePath.startsWith(OUTPUT_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado.');
  }
  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`GCB Simulador rodando em http://localhost:${PORT}`);
});

// Encerra o Chromium compartilhado num shutdown gracioso (ex.: container sendo reiniciado/desligado).
process.on('SIGTERM', async () => { await encerrarBrowser(); process.exit(0); });
process.on('SIGINT', async () => { await encerrarBrowser(); process.exit(0); });

// Rede de segurança: registra QUALQUER erro não tratado (promise rejeitada sem .catch, exceção
// síncrona fora de um try/catch) em vez de deixar o processo Node cair em silêncio. Sem isso, uma
// falha inesperada (ex.: Puppeteer travando ao abrir o Chromium) derruba o servidor sem deixar
// nenhuma pista no log — do lado do navegador isso aparece só como "Failed to fetch", sem
// explicação nenhuma de causa.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection] erro não tratado — o servidor continua rodando:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] erro não tratado — o servidor continua rodando:', err);
});
