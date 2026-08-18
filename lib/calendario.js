// Calendário de dias úteis "bancário nacional" — o mesmo usado pela ANBIMA/B3 para a convenção
// 252 (feriados nacionais fixos + móveis, sem feriados estaduais/municipais como Revolução
// Constitucionalista-SP ou Aniversário de SP, que NÃO entram na convenção 252 de mercado).
//
// Antes desta versão, o app aproximava dias úteis por "dias corridos × 252/365", que ignora
// feriados e pode errar por vários dias em prazos longos (cada feriado "perdido" desloca o
// expoente da capitalização composta). Esta versão conta dias úteis reais, feriado a feriado.

// Domingo de Páscoa (algoritmo de Gauss/Meeus para o calendário gregoriano).
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function somarDias(data, dias) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

function chave(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

const cacheFeriadosPorAno = new Map();

// Feriados nacionais bancários (fixos + móveis a partir da Páscoa) para um ano específico.
// Dia da Consciência Negra (20/nov) é feriado nacional só a partir de 2024 (Lei 14.759/2023).
function feriadosNacionais(ano) {
  if (cacheFeriadosPorAno.has(ano)) return cacheFeriadosPorAno.get(ano);

  const pascoaAno = pascoa(ano);
  const datas = [
    new Date(ano, 0, 1), // Confraternização Universal
    somarDias(pascoaAno, -48), // Carnaval (segunda)
    somarDias(pascoaAno, -47), // Carnaval (terça)
    somarDias(pascoaAno, -2), // Sexta-feira Santa
    somarDias(pascoaAno, 60), // Corpus Christi
    new Date(ano, 3, 21), // Tiradentes
    new Date(ano, 4, 1), // Dia do Trabalho
    new Date(ano, 8, 7), // Independência do Brasil
    new Date(ano, 9, 12), // Nossa Senhora Aparecida
    new Date(ano, 10, 2), // Finados
    new Date(ano, 10, 15), // Proclamação da República
    new Date(ano, 11, 25), // Natal
  ];
  if (ano >= 2024) datas.push(new Date(ano, 10, 20)); // Consciência Negra (feriado nacional desde 2024)

  const set = new Set(datas.map(chave));
  cacheFeriadosPorAno.set(ano, set);
  return set;
}

function ehFimDeSemana(data) {
  const dow = data.getDay();
  return dow === 0 || dow === 6;
}

function ehFeriado(data) {
  return feriadosNacionais(data.getFullYear()).has(chave(data));
}

// Conta dias úteis estritamente entre duas datas, no sentido "convenção 252": a data-base é o
// dia 0 (não conta), e cada dia útil a partir do dia seguinte até a data final (inclusive) soma 1.
function diasUteisEntre(dataInicio, dataFim) {
  if (dataFim <= dataInicio) return 0;
  let du = 0;
  let cursor = somarDias(dataInicio, 1);
  while (cursor <= dataFim) {
    if (!ehFimDeSemana(cursor) && !ehFeriado(cursor)) du++;
    cursor = somarDias(cursor, 1);
  }
  return du;
}

module.exports = { diasUteisEntre, ehFeriado, ehFimDeSemana, feriadosNacionais, pascoa };
