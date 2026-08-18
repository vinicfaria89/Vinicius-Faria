// Fetch com timeout e novas tentativas — usado por anbima.js, b3.js e bacen.js pra não deixar uma
// falha passageira de rede (timeout, instabilidade momentânea, erro 5xx) virar um erro cru pro
// usuário final. Só tenta de novo o que faz sentido tentar de novo: timeout, erro de rede, ou
// resposta 5xx do servidor (erro do lado deles). Erros 4xx (ex.: 404) não são retentados — indicam
// um problema real de contrato com a API, não uma instabilidade passageira.

const TENTATIVAS_PADRAO = 3;
const TIMEOUT_MS_PADRAO = 10000;
const ESPERAS_MS = [500, 1500]; // backoff entre tentativas (tentativa 1 -> 2 -> 3)

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ehRetentavel(err, res) {
  if (res) return res.status >= 500;
  // Erros de rede/timeout do fetch nativo não têm `status` — sempre vale tentar de novo.
  return true;
}

async function fetchComRetentativa(url, options = {}, { tentativas = TENTATIVAS_PADRAO, timeoutMs = TIMEOUT_MS_PADRAO } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && ehRetentavel(null, res) && i < tentativas - 1) {
        ultimoErro = new Error(`HTTP ${res.status}`);
        await esperar(ESPERAS_MS[i] || ESPERAS_MS[ESPERAS_MS.length - 1]);
        continue;
      }
      return res; // devolve a resposta (ok ou não) — quem chamou decide o que fazer com status de erro definitivo
    } catch (err) {
      clearTimeout(timer);
      ultimoErro = err.name === 'AbortError' ? new Error(`tempo limite de ${timeoutMs}ms excedido`) : err;
      if (i < tentativas - 1 && ehRetentavel(ultimoErro, null)) {
        await esperar(ESPERAS_MS[i] || ESPERAS_MS[ESPERAS_MS.length - 1]);
        continue;
      }
      throw ultimoErro;
    }
  }
  throw ultimoErro;
}

module.exports = { fetchComRetentativa };
