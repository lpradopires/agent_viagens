import dotenv from "dotenv";

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

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
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Falha na requisição HTTP: ${response.status} ${response.statusText}`);
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
          responseBody.result.content?.[0]?.text || "Erro desconhecido na execução da ferramenta.";
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
    } catch (err: any) {
      // Mascara a chave de API nos logs de erro
      const errorMsg = err.message.replace(this.apiKey, "GECKO_API_KEY_OMITTED");
      throw new Error(`[GeckoApiClient Error] ${errorMsg}`);
    }
  }
}
