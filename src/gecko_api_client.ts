import dotenv from "dotenv";
import { withRetry } from "./retry.js";

dotenv.config();

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
  id: number;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
    isError: boolean;
  };
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/** Timeout de cada tentativa HTTP isolada */
const ATTEMPT_TIMEOUT_MS = 15000;
/** Teto de tempo para o conjunto de tentativas de uma mesma chamada de tool */
const TOTAL_BUDGET_MS = 40000;

export class GeckoApiClient {
  private apiKey: string;
  private endpoint: string;

  constructor() {
    const key = process.env.GECKO_API_KEY;
    if (!key) {
      throw new Error(
        "A variável de ambiente GECKO_API_KEY não foi configurada. Verifique o seu arquivo .env."
      );
    }
    this.apiKey = key;
    this.endpoint = process.env.GECKO_API_ENDPOINT || "https://api.geckoapi.com.br/v1/mcp";
  }

  /**
   * Executa uma ferramenta no servidor MCP da GeckoAPI
   * @param toolName Nome da ferramenta a ser chamada
   * @param args Parâmetros específicos da ferramenta
   */
  async callTool<T = any>(toolName: string, args: Record<string, any>): Promise<T> {
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
      id: Math.floor(Math.random() * 1000000),
    };

    try {
      // Retry limitado com backoff para falhas transitórias (rede, timeout, 5xx);
      // erros de aplicação (4xx, MCP) são propagados sem nova tentativa.
      //
      // O timeout do AbortController é POR TENTATIVA; por isso ele é menor que
      // o antigo (35s) e há um teto de tempo total: um upstream travado custa
      // no máximo ~ATTEMPT_TIMEOUT_MS × tentativas, não 3×35s.
      return await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

          try {
            const response = await fetch(this.endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });

            if (!response.ok) {
              throw new Error(
                `Falha na requisição HTTP: ${response.status} ${response.statusText}`
              );
            }

            const responseBody = (await response.json()) as JsonRpcResponse;

            if (responseBody.error) {
              throw new Error(
                `Erro retornado pelo servidor MCP [Código ${responseBody.error.code}]: ${responseBody.error.message}`
              );
            }

            if (!responseBody.result) {
              throw new Error("Resposta inválida do servidor MCP: campo 'result' ausente.");
            }

            if (responseBody.result.isError) {
              const errMsg =
                responseBody.result.content?.[0]?.text ||
                "Erro desconhecido na execução da ferramenta.";
              throw new Error(`Erro na execução do raspador GeckoAPI (${toolName}): ${errMsg}`);
            }

            const contentText = responseBody.result.content?.[0]?.text;
            if (!contentText) {
              throw new Error("Nenhum dado retornado no campo de conteúdo do MCP.");
            }

            // Tenta fazer o parse do resultado como JSON se aplicável
            try {
              return JSON.parse(contentText) as T;
            } catch {
              // Se não for JSON, retorna a string bruta
              return contentText as unknown as T;
            }
          } finally {
            clearTimeout(timeoutId);
          }
        },
        { retries: 2, baseDelayMs: 300, totalBudgetMs: TOTAL_BUDGET_MS }
      );
    } catch (err: any) {
      // Mascara a chave de API nos logs de erro
      const errorMsg = err.message.replace(this.apiKey, "GECKO_API_KEY_OMITTED");
      throw new Error(`[GeckoApiClient Error] ${errorMsg}`);
    }
  }
}
