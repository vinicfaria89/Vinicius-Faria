// Importa a base de contatos do Pipedrive para data/clientes.json.
//
// Uso: node scripts/importar-clientes.js <pasta-com-paginas-json>
//
// A pasta contém as respostas paginadas do getPersons do Pipedrive (um .json por página, no formato
// { data: [...], additional_data: { next_cursor } }) — baixadas pelo Claude via conector do Pipedrive,
// pois o app não tem token de API. A cada importação gera também data/clientes-mudancas.json com o
// que mudou em relação à lista anterior (novos, removidos, mudança de status), exibido no app.
//
// Só entram os campos úteis pra simulação. Documento (CPF) e data de nascimento ficam de fora de
// propósito: não são necessários e são dados sensíveis.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARQ_CLIENTES = path.join(DATA_DIR, 'clientes.json');
const ARQ_MUDANCAS = path.join(DATA_DIR, 'clientes-mudancas.json');

// Chaves dos campos personalizados de Pessoa no Pipedrive (prefixo de 6 caracteres basta e evita
// depender da chave completa de 40).
const CAMPOS = {
  e4c5c0: 'status',
  '1d241b': 'custodia',
  fa1121: 'saldo',
  '42f3b0': 'totalComprado',
  '6c305d': 'renda',
  '2ffeb1': 'sowValor',
  '2032fe': 'sowPct',
  '16f9fa': 'ultimoInvestimento',
  '597462': 'ultimoContato',
  bffe6f: 'bu',
  a6bc40: 'subSegmento',
};

function rotulo(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(rotulo).filter(Boolean).join(', ') || null;
  if (typeof v === 'object') return v.label != null ? String(v.label) : null;
  return String(v);
}

function dinheiro(v) {
  if (v == null) return null;
  const n = typeof v === 'object' ? Number(v.value) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function primeiroValor(lista) {
  if (!Array.isArray(lista)) return null;
  const principal = lista.find((x) => x && x.primary && x.value) || lista.find((x) => x && x.value);
  return principal ? String(principal.value).trim() : null;
}

function converterPessoa(p) {
  const out = {
    id: p.id,
    nome: String(p.name || '').trim(),
    email: primeiroValor(p.emails),
    telefone: primeiroValor(p.phones),
    atualizadoPipedrive: p.update_time || null,
  };
  Object.entries(p.custom_fields || {}).forEach(([chave, valor]) => {
    const campo = CAMPOS[chave.slice(0, 6)];
    if (!campo) return;
    if (['custodia', 'saldo', 'totalComprado', 'renda', 'sowValor'].includes(campo)) out[campo] = dinheiro(valor);
    else if (campo === 'sowPct') out[campo] = valor == null ? null : Number(valor);
    else out[campo] = rotulo(valor);
  });
  return out;
}

function lerPaginas(pasta) {
  const arquivos = fs.readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.json')).sort();
  if (!arquivos.length) throw new Error(`Nenhum .json encontrado em ${pasta}`);
  const porId = new Map();
  arquivos.forEach((f) => {
    const pagina = JSON.parse(fs.readFileSync(path.join(pasta, f), 'utf8'));
    if (!pagina || pagina.success === false || !Array.isArray(pagina.data)) throw new Error(`Página inválida: ${f}`);
    pagina.data.forEach((p) => { if (!p.is_deleted && p.name) porId.set(p.id, converterPessoa(p)); });
  });
  return [...porId.values()];
}

function compararListas(antiga, nova) {
  const velhosPorId = new Map(antiga.map((c) => [c.id, c]));
  const novosPorId = new Map(nova.map((c) => [c.id, c]));
  const adicionados = nova.filter((c) => !velhosPorId.has(c.id));
  const removidos = antiga.filter((c) => !novosPorId.has(c.id));
  const statusAlterado = [];
  nova.forEach((c) => {
    const v = velhosPorId.get(c.id);
    if (v && (v.status || null) !== (c.status || null)) statusAlterado.push({ id: c.id, nome: c.nome, de: v.status || null, para: c.status || null });
  });
  return { adicionados, removidos, statusAlterado };
}

function importar(pasta) {
  const clientes = lerPaginas(pasta).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  let antiga = [];
  try { antiga = JSON.parse(fs.readFileSync(ARQ_CLIENTES, 'utf8')).clientes || []; } catch (_) { /* primeira carga */ }
  const dif = compararListas(antiga, clientes);

  // Segurança: se a nova lista encolher drasticamente (ex.: coleta incompleta), não sobrescreve.
  if (antiga.length && clientes.length < antiga.length * 0.8) {
    throw new Error(`Lista nova (${clientes.length}) é muito menor que a atual (${antiga.length}) — coleta incompleta? Nada foi alterado.`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const agora = new Date().toISOString();
  fs.writeFileSync(ARQ_CLIENTES, JSON.stringify({ atualizadoEm: agora, total: clientes.length, clientes }), 'utf8');
  const resumo = {
    atualizadoEm: agora,
    totalAntes: antiga.length,
    totalDepois: clientes.length,
    adicionados: dif.adicionados.length,
    removidos: dif.removidos.length,
    statusAlterado: dif.statusAlterado.length,
    amostraAdicionados: dif.adicionados.slice(0, 20).map((c) => c.nome),
    amostraRemovidos: dif.removidos.slice(0, 20).map((c) => c.nome),
    amostraStatus: dif.statusAlterado.slice(0, 20),
  };
  fs.writeFileSync(ARQ_MUDANCAS, JSON.stringify(resumo, null, 2), 'utf8');
  return resumo;
}

module.exports = { importar, converterPessoa, compararListas };

if (require.main === module) {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error('Uso: node scripts/importar-clientes.js <pasta-com-paginas-json>');
    process.exit(1);
  }
  try {
    const r = importar(path.resolve(pasta));
    console.log(`Clientes: ${r.totalAntes} -> ${r.totalDepois} | novos ${r.adicionados} | removidos ${r.removidos} | status alterado ${r.statusAlterado}`);
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(1);
  }
}
