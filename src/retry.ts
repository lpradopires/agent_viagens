export interface RetryOptions {
  /** Tentativas adicionais após a primeira falha (padrão: 2 → até 3 execuções) */
  retries?: number;
  /** Base do backoff exponencial em ms: baseDelayMs * 2^(tentativa-1) (padrão: 300) */
  baseDelayMs?: number;
  /** Decide se o erro é transitório e vale nova tentativa (padrão: rede/timeout/5xx/429) */
  shouldRetry?: (err: any) => boolean;
}

// Erros transitórios típicos de integração externa: falha de rede, timeout
// (abort), HTTP 5xx e rate limit. Erros de aplicação (4xx, validação, MCP)
// NÃO são retentados — repetir não muda o resultado e só desperdiça chamadas.
export function isTransientError(err: any): boolean {
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
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
