export interface RetryOptions {
  /** Tentativas adicionais após a primeira falha (padrão: 2 → até 3 execuções) */
  retries?: number;
  /** Base do backoff exponencial em ms: baseDelayMs * 2^(tentativa-1) (padrão: 300) */
  baseDelayMs?: number;
  /** Decide se o erro é transitório e vale nova tentativa (padrão: rede/timeout/5xx/429) */
  shouldRetry?: (err: any) => boolean;
  /**
   * Teto de tempo (ms) para o conjunto de tentativas. Sem ele, N tentativas
   * com timeout individual multiplicam o pior caso percebido pelo usuário.
   */
  totalBudgetMs?: number;
}

// Erros transitórios típicos de integração externa: falha de rede, timeout
// (abort), HTTP 5xx e rate limit. Erros de aplicação (4xx, validação, MCP)
// NÃO são retentados — repetir não muda o resultado e só desperdiça chamadas.
//
// Além do texto do erro, aceita `err.status` — as APIs costumam devolver a
// própria mensagem de negócio no corpo, sem o código HTTP no texto, e sem isso
// um 503 real passaria despercebido pelo regex.
export function isTransientError(err: any): boolean {
  const status = Number(err?.status);
  if (Number.isFinite(status) && (status === 429 || status >= 500)) {
    return true;
  }
  const msg = String(err?.message ?? err ?? "");
  return /(fetch failed|network|econnreset|econnrefused|etimedout|socket hang up|abort|HTTP:?\s*5\d\d|\b429\b|rate limit)/i.test(
    msg
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executa `fn` com retry limitado e backoff exponencial para falhas
 * transitórias de integrações externas (requisito de resiliência do projeto).
 *
 * - Erros não-transitórios são propagados imediatamente (sem retry).
 * - Esgotadas as tentativas, o último erro é propagado — a camada de tools
 *   captura e converte em mensagem amigável ao usuário (fallback).
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const shouldRetry = options.shouldRetry ?? isTransientError;
  const totalBudgetMs = options.totalBudgetMs;
  const startedAt = Date.now();

  let lastError: any;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isLastAttempt = attempt > retries;
      if (isLastAttempt || !shouldRetry(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      // Só tenta de novo se ainda houver orçamento para a espera + a tentativa
      if (totalBudgetMs !== undefined && Date.now() - startedAt + delay >= totalBudgetMs) {
        throw err;
      }
      await sleep(delay);
    }
  }
  throw lastError;
}
