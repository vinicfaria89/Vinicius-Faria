const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function brl(valor, casas = 0) {
  const s = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `R$ ${s}`;
}

function pct(valor, casas = 0) {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

function dataDDMMAAAA(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dataPorExtenso(d) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function mesAnoPorExtenso(d) {
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Constrói uma data à meia-noite NO HORÁRIO LOCAL a partir de 'AAAA-MM-DD' (ex.: valor de um
// <input type="date">). NUNCA usar `new Date('AAAA-MM-DD')` diretamente: essa forma é interpretada
// como UTC pelo JS e, em fusos atrás de UTC (ex.: Brasil, UTC-3), o dia exibido fica 1 dia atrasado.
function parseDataLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

module.exports = { brl, pct, dataDDMMAAAA, dataPorExtenso, mesAnoPorExtenso, parseDataLocal };
