// Leitura de lâmina / material de distribuição em PDF para pré-preencher o cadastro de produto.
//
// Extrai o texto do PDF (pdfjs-dist) e procura os campos que o catálogo usa: categoria, indexador e
// taxa, investimento mínimo, vencimento, periodicidade, Cash Sweep e — quando a lâmina traz a tabela
// "Fluxo de Pagamentos" no formato  "<parcela> <dd/mm/aaaa> <Sim|Não> <% do saldo a amortizar>" — o
// cronograma personalizado. É uma LEITURA ASSISTIDA: devolve os campos e uma lista de avisos, e a tela
// mostra tudo pra o assessor conferir antes de salvar. Nada vai pro catálogo sem revisão.

const MESES = { janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

// Devolve o texto agrupado em linhas (bom pra procurar campos como "Investimento mínimo ... R$ 1.000")
// e também os trechos na ORDEM DO PDF (bom pra tabelas, onde o agrupamento por linha às vezes separa
// um número do resto da sua linha quando há texto sobreposto).
async function extrairPdf(buffer) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  const paginas = [];
  const tokens = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    conteudo.items.forEach((it) => { (it.str || '').split(/\s+/).filter(Boolean).forEach((t) => tokens.push(t)); });
    // Agrupa os trechos por linha (mesma coordenada Y, com tolerância) e ordena por X.
    const linhas = [];
    conteudo.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5]; const x = it.transform[4];
      let linha = linhas.find((l) => Math.abs(l.y - y) < 2.5);
      if (!linha) { linha = { y, itens: [] }; linhas.push(linha); }
      linha.itens.push({ x, w: it.width || 0, str: it.str });
    });
    linhas.sort((a, b) => b.y - a.y);
    // Alguns PDFs quebram uma palavra/número em vários trechos ("5,", "50", "%"): só põe espaço entre
    // trechos quando há um vão real entre eles — senão "5,50%" viraria "5,  50  %" e não casaria.
    const juntar = (itens) => {
      itens.sort((a, b) => a.x - b.x);
      let out = '';
      itens.forEach((i, k) => {
        if (k > 0) {
          const ant = itens[k - 1];
          out += (i.x - (ant.x + ant.w)) > 1.5 ? '  ' : '';
        }
        out += i.str;
      });
      return out.trim();
    };
    paginas.push(linhas.map((l) => juntar(l.itens)).join('\n'));
  }
  return { texto: paginas.join('\n'), tokens };
}
async function extrairTextoPdf(buffer) { return (await extrairPdf(buffer)).texto; }

const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const iso = (d, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function detectarCategoria(texto, arquivo) {
  const t = `${texto.slice(0, 1500)} ${arquivo || ''}`.toUpperCase();
  if (/\bCRA\b/.test(t)) return 'CRA';
  if (/\bCRI\b/.test(t)) return 'CRI';
  if (/DEB[ÊE]NTURE/.test(t)) return 'Debênture';
  // Recebíveis judiciais antes de "precatório" genérico (a lâmina de INSS/Pré-RPV cita precatórios no texto).
  if (/RECEB[ÍI]VEIS?\s+JUDICI|PR[ÉE]-?RPV|INSS|CR[ÉE]DITOS\s+TRABALHISTAS|SIMETRIO|METRUS|ALO[ÉE]S/.test(t)) return 'Recebível Judicial';
  if (/PRECAT[ÓO]RIO\s+FEDERAL|PREC\.?\s+FEDERAL/.test(t)) return 'Precatório Federal';
  if (/PRECAT[ÓO]RIO/.test(t)) return 'Precatório Estadual';
  if (/OPERA[ÇC][ÃA]O\s+ESTRUTURADA|CESS[ÃA]O|EASY\s?TECH|ECOFORT|GRID|\bRCS\b/.test(t)) return 'Operações Estruturadas';
  return null;
}

function detectarTaxa(texto) {
  // Procura primeiro nos 1500 primeiros caracteres (capa: "Rentabilidade prevista ..."), depois no resto.
  for (const trecho of [texto.slice(0, 1500), texto]) {
    let m;
    if ((m = trecho.match(/CDI\s*\+\s*([\d]+(?:[.,]\d+)?)\s*%/i))) return { tipo: 'cdi', taxa: num(m[1]) };
    if ((m = trecho.match(/IPCA\s*\+\s*([\d]+(?:[.,]\d+)?)\s*%/i))) return { tipo: 'ipca', taxa: num(m[1]) };
    if ((m = trecho.match(/([\d]+(?:[.,]\d+)?)\s*%\s*do\s*CDI/i))) return { tipo: 'pctcdi', taxa: num(m[1]) };
    if ((m = trecho.match(/([\d]+(?:[.,]\d+)?)\s*%\s*(?:a\.?\s?m\.?\b|ao\s+m[êe]s)/i))) return { tipo: 'fixo', taxa: num(m[1]) };
    if ((m = trecho.match(/([\d]+(?:[.,]\d+)?)\s*%\s*(?:a\.?\s?a\.?\b|ao\s+ano)/i))) return { tipo: 'fixoAA', taxa: num(m[1]) };
  }
  return null;
}

function detectarMinimo(texto) {
  // "Investimento mínimo ... R$ 1.000,00" — ignora menções como "fluxo mínimo mensal de R$ 30 milhões".
  const re = /m[ií]nimo[\s\S]{0,120}?R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)(?!\s*(?:milh|mi\b|bilh|mil\b))/gi;
  const m = re.exec(texto.slice(0, 3000));
  return m ? num(m[1]) : null;
}

function detectarVencimento(texto) {
  let m = texto.match(/Vencimento(?:\s+previsto)?\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (m) return iso(m[1], m[2], m[3]);
  m = texto.match(/Vencimento(?:\s+previsto)?\s*:?\s*(\d{1,2})\s+de\s+([A-Za-zçÇãÃ]+)\s+de\s+(\d{4})/i);
  if (m && MESES[m[2].toLowerCase()]) return iso(m[1], MESES[m[2].toLowerCase()], m[3]);
  return null;
}

// Tabela "Fluxo de Pagamentos": linhas "<n> <dd/mm/aaaa> <Sim|Não> <pct>%". Aceita a data/pct em colunas
// diferentes (a ordem dos trechos de uma linha de tabela varia conforme o PDF).
function detectarCronogramaPorTokens(tokens) {
  // Para cada data dd/mm/aaaa, o % de amortização é o primeiro "<n>%" logo depois (pulando "Sim/Não" e
  // o nº da parcela). Se aparecer outra data antes de um %, a linha ficou sem valor e é descartada.
  const porData = new Map();
  let semPercentual = 0; // linhas de tabela (data seguida de Sim/Não) cujo % não foi legível no PDF
  for (let i = 0; i < tokens.length; i++) {
    const d = tokens[i].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!d) continue;
    let achou = false; let ehLinhaDeTabela = false;
    for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(tokens[j])) break;
      if (/^(Sim|Não|Nao)$/i.test(tokens[j])) ehLinhaDeTabela = true;
      const p = tokens[j].match(/^(\d+(?:,\d+)?)%$/);
      if (p) { porData.set(iso(d[1], d[2], d[3]), num(p[1])); achou = true; break; }
    }
    if (!achou && ehLinhaDeTabela) semPercentual++;
  }
  // Conferência cruzada: os percentuais da tabela têm muitas casas decimais (ex.: 0,23442276%). Se há
  // mais desses números no PDF do que datas casadas, alguma data caiu fora do lugar (linha sem data) —
  // a tabela está incompleta. (Tabelas com poucos % "redondos", como 31,57%, só têm a checagem acima.)
  const pares = tokens.filter((tk) => /^\d+,\d{5,}%$/.test(tk)).length;
  const entradas = [...porData.entries()].map(([data, pctAmortizar]) => ({ data, pctAmortizar })).sort((a, b) => a.data.localeCompare(b.data));
  const valido = entradas.length >= 2 && Math.abs(entradas[entradas.length - 1].pctAmortizar - 100) < 0.01;
  return { entradas: valido ? entradas : null, semPercentual: Math.max(semPercentual, pares - porData.size) };
}

// Devolve { entradas, aviso }. `entradas` só vem preenchido quando a tabela foi lida INTEIRA: como cada
// % incide sobre o saldo remanescente, perder uma linha muda todo o fluxo — melhor não cadastrar nada
// do que cadastrar um cronograma incompleto sem ninguém perceber.
function detectarCronograma(texto, tokens, tabelaConfiavel = true) {
  if (!tabelaConfiavel) {
    // Leitura só com pdfjs: em PDFs com fontes sem mapeamento, linhas inteiras da tabela somem sem
    // deixar rastro (visto em lâminas reais: 6 de 8 parcelas). Não arriscamos um cronograma parcial.
    const linhasDeTabela = tokens ? tokens.filter((tk, i) => /^\d{2}\/\d{2}\/\d{4}$/.test(tk) && /^(Sim|Não|Nao)$/i.test(tokens[i + 1] || '')).length : 0;
    if (linhasDeTabela >= 2 || /Saldo a amortizar|Fluxo de Pagamentos/i.test(texto)) {
      return { entradas: null, aviso: 'Este PDF tem tabela de fluxo de pagamentos, mas a leitura simplificada não garante todas as linhas. Instale o poppler (pdftotext) para ler o cronograma com segurança, ou copie-o do material manualmente.' };
    }
    return { entradas: null, aviso: null };
  }
  const t = tokens ? detectarCronogramaPorTokens(tokens) : { entradas: null, semPercentual: 0 };
  const porLinhas = detectarCronogramaPorLinhas(texto);
  if (t.semPercentual > 0) {
    return { entradas: null, aviso: `A tabela de fluxo tem ${t.semPercentual} linha(s) cujo percentual não ficou legível neste PDF (fonte sem mapeamento de texto). Não cadastrei o cronograma pra não ficar incompleto — copie-o do material manualmente.` };
  }
  // Usa a leitura que achou MAIS parcelas (a outra pode ter perdido linhas por texto sobreposto).
  const escolhida = t.entradas && (!porLinhas || t.entradas.length >= porLinhas.length) ? t.entradas : porLinhas;
  return { entradas: escolhida, aviso: null };
}

function detectarCronogramaPorLinhas(texto) {
  // Cada linha pode ter 1 ou mais parcelas lado a lado (tabelas em 2 colunas) e, às vezes, a coluna
  // "Sim/Não" some no PDF — por isso casamos "<parcela> [<parcela>] <data> [Sim|Não] <pct>%" por padrão.
  // (O nº da parcela às vezes sai duplicado no PDF — "11", "22" — por isso não é usado pra validar.)
  const re = /(?:^|\s)(\d{1,4})\s+(?:\d{1,4}\s+)?(\d{2})\/(\d{2})\/(\d{4})\s+(?:(?:Sim|Não|Nao)\s+)?(\d+(?:,\d+)?)\s*%/gi;
  const porData = new Map();
  texto.split('\n').forEach((linha) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(linha))) {
      const data = iso(m[2], m[3], m[4]); // dd, mm, aaaa
      porData.set(data, { data, pctAmortizar: num(m[5]), parcela: Number(m[1]) });
    }
  });
  const entradas = [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
  // Uma tabela de fluxo válida tem ao menos 2 parcelas e termina em 100% do saldo remanescente.
  if (entradas.length >= 2 && Math.abs(entradas[entradas.length - 1].pctAmortizar - 100) < 0.01) {
    return entradas.map(({ data, pctAmortizar }) => ({ data, pctAmortizar }));
  }
  return null;
}

function interpretarLamina(texto, arquivo = '', tokens = null, tabelaConfiavel = true) {
  const avisos = [];
  const campos = {};
  campos.categoria = detectarCategoria(texto, arquivo);
  if (!campos.categoria) avisos.push('Categoria não identificada — escolha manualmente.');

  const taxa = detectarTaxa(texto);
  if (taxa) { campos.tipo = taxa.tipo; campos.taxa = taxa.taxa; } else avisos.push('Taxa/indexador não identificados — preencha manualmente.');

  const minimo = detectarMinimo(texto);
  if (minimo != null) campos.valorMinimo = minimo; else avisos.push('Investimento mínimo não identificado.');

  const venc = detectarVencimento(texto);
  const lido = detectarCronograma(texto, tokens, tabelaConfiavel);
  const cronograma = lido.entradas;
  if (lido.aviso) avisos.push(lido.aviso);
  if (cronograma) {
    campos.cronogramaPersonalizado = true;
    campos.cronograma = cronograma;
    campos.fluxoPagamento = 'distribuido';
    campos.cashSweep = false;
    campos.vencimento = cronograma[cronograma.length - 1].data; // o motor liquida na última data do cronograma
    if (venc && venc !== campos.vencimento) avisos.push(`Vencimento do texto (${venc.split('-').reverse().join('/')}) difere da última parcela do fluxo (${campos.vencimento.split('-').reverse().join('/')}); usei a da tabela.`);
  } else {
    if (venc) campos.vencimento = venc; else avisos.push('Vencimento não identificado (a lâmina pode trazer só o prazo em meses).');
    campos.cashSweep = /cash\s*sweep/i.test(texto);
    campos.fluxoPagamento = campos.cashSweep ? 'bullet' : (/juros\s+(mensais|semestrais)|pagamento\s+(mensal|de juros)|remunera[cç][aã]o[^\n]{0,30}(mensal|semestral)/i.test(texto) ? 'distribuido' : 'bullet');
    if (!lido.aviso) {
      if (!/Parcela/i.test(texto) || !/Sim|Não/.test(texto)) avisos.push('Tabela de fluxo de pagamentos não encontrada: cadastrei como produto comum (sem cronograma fixo).');
      else avisos.push('Havia uma tabela de fluxo, mas num formato que não consegui ler — confira o fluxo no material.');
    }
  }
  campos.periodicidadeCupom = /semestral/i.test(texto.slice(0, 2500)) ? 'semestral' : 'mensal';
  campos.isento = campos.categoria === 'CRA' || campos.categoria === 'CRI';
  return { campos, avisos };
}

// Alguns PDFs de lâmina têm fontes sem mapeamento de texto: o pdfjs devolve células vazias (percentuais
// "sumidos" nas tabelas), enquanto o `pdftotext` (poppler) lê tudo. Se o executável estiver disponível
// no PATH, ele é usado primeiro; senão cai no pdfjs (e os avisos acima protegem de leitura incompleta).
function extrairComPdftotext(buffer) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = require('child_process').spawn('pdftotext', ['-layout', '-', '-'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    } catch (_) { return resolve(null); }
    const partes = [];
    const timer = setTimeout(() => { try { proc.kill(); } catch (_) { /* já encerrou */ } resolve(null); }, 20000);
    proc.stdout.on('data', (d) => partes.push(d));
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
    proc.on('close', (codigo) => {
      clearTimeout(timer);
      const texto = Buffer.concat(partes).toString('utf8');
      resolve(codigo === 0 && texto.trim().length > 50 ? { texto, tokens: texto.split(/\s+/).filter(Boolean) } : null);
    });
    proc.stdin.on('error', () => { /* pdftotext encerrou antes de ler tudo */ });
    proc.stdin.end(buffer);
  });
}

// Alguns arquivos de lâmina chegam "embrulhados" (cabeçalho multipart/WebKitForm antes do %PDF- e
// rodapé depois do %%EOF, ao baixar de certos fluxos). Recorta só o PDF; devolve null se não houver.
function recortarPdf(buffer) {
  const ini = buffer.indexOf('%PDF-');
  if (ini < 0 || ini > 4096) return null;
  const fim = buffer.lastIndexOf('%%EOF');
  return buffer.subarray(ini, fim > ini ? fim + 5 : buffer.length);
}

async function lerLaminaPdf(bufferBruto, arquivo) {
  const buffer = recortarPdf(bufferBruto);
  if (!buffer) throw new Error('o arquivo não parece ser um PDF');
  const viaPoppler = await extrairComPdftotext(buffer);
  const { texto, tokens } = viaPoppler || (await extrairPdf(buffer));
  if (!texto.trim()) throw new Error('Não encontrei texto no PDF (pode ser um PDF escaneado/imagem).');
  const nomeSugerido = String(arquivo || '').replace(/\.pdf$/i, '').replace(/^(l[aâ]mina|material de distribui[cç][aã]o)\s*[-–]?\s*/i, '').replace(/\s+att.*$/i, '').trim();
  return { ...interpretarLamina(texto, arquivo, tokens, !!viaPoppler), viaPoppler: !!viaPoppler, nomeSugerido, textoAmostra: texto.slice(0, 600) };
}

module.exports = { recortarPdf, lerLaminaPdf, interpretarLamina, extrairTextoPdf, detectarCronograma, detectarTaxa };
