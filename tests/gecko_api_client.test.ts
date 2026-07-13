import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import { GeckoApiClient } from "../src/gecko_api_client.js";
import {
  buscarVoosLatam,
  buscarVoosAzul,
  buscarVoosGol,
  buscarHoteisAirbnb,
  buscarHoteisHoteisCom,
  buscarHoteisTrivago,
} from "../src/tools.js";

const originalFetch = globalThis.fetch;

describe("GeckoApiClient", () => {
  beforeEach(() => {
    process.env.GECKO_API_KEY = "test_api_key_123";
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("deve inicializar com sucesso se a API key estiver configurada", () => {
    expect(() => new GeckoApiClient()).not.toThrow();
  });

  test("deve falhar se a API key não estiver configurada", () => {
    delete process.env.GECKO_API_KEY;
    expect(() => new GeckoApiClient()).toThrow(/GECKO_API_KEY não foi configurada/);
  });

  test("deve efetuar a chamada da ferramenta com sucesso e retornar os dados em JSON", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify([{ id: "flight_1", price: 500 }]),
          },
        ],
        isError: false,
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const client = new GeckoApiClient();
    const result = await client.callTool("latamairlines_com_plp", { keyword: "teste" });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: "flight_1", price: 500 }]);
  });

  test("deve lançar erro se a requisição HTTP falhar (ex: 500 Internal Error)", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const client = new GeckoApiClient();
    await expect(client.callTool("latamairlines_com_plp", { keyword: "teste" })).rejects.toThrow(
      /Falha na requisição HTTP: 500/
    );
  });

  test("deve lançar erro se o JSON-RPC contiver o campo 'error'", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32601,
        message: "Method not found",
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const client = new GeckoApiClient();
    await expect(client.callTool("latamairlines_com_plp", { keyword: "teste" })).rejects.toThrow(
      /Erro retornado pelo servidor MCP/
    );
  });

  test("deve tratar o parâmetro isError: true e lançar erro explicativo", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: "O raspador falhou em carregar a página da Azul.",
          },
        ],
        isError: true,
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const client = new GeckoApiClient();
    await expect(client.callTool("voeazul_com_br_plp", { keyword: "teste" })).rejects.toThrow(
      /Erro na execução do raspador GeckoAPI/
    );
  });
});

describe("LangChain Integration Tools", () => {
  beforeEach(() => {
    process.env.GECKO_API_KEY = "test_api_key_123";
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("buscarVoosLatam deve retornar dados serializados em string", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify([{ cia: "LATAM", preco: 700 }]),
          },
        ],
        isError: false,
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const response = await buscarVoosLatam.invoke({
      from: "GRU",
      to: "SDU",
      departureDate: "2026-08-15",
    });

    expect(response).toBe(JSON.stringify([{ airline: "LATAM", price: 700, departure: "" }]));
  });

  test("buscarHoteisHoteisCom deve lidar com erro de rede graciosamente", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const response = await buscarHoteisHoteisCom.invoke({
      location: "Gramado",
      checkinDate: "2026-08-15",
    });

    expect(response).toContain("Erro na busca de hotéis no Hoteis.com");
  });

  test("buscarVoosAzul e buscarVoosGol devem retornar dados de voo com sucesso", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: JSON.stringify([{ cia: "Azul/GOL", preco: 800 }]) }],
        isError: false,
      },
    };
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const respAzul = await buscarVoosAzul.invoke({
      from: "VCP",
      to: "CNF",
      departureDate: "2026-08-15",
    });
    expect(respAzul).toContain("Azul/GOL");

    const respGol = await buscarVoosGol.invoke({
      from: "SAO",
      to: "RIO",
      departureDate: "2026-08-15",
    });
    expect(respGol).toContain("Azul/GOL");
  });

  test("buscarHoteisAirbnb e buscarHoteisTrivago devem retornar dados com sucesso", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: JSON.stringify([{ name: "Hotel Teste", preco: 300 }]) }],
        isError: false,
      },
    };
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const respAirbnb = await buscarHoteisAirbnb.invoke({
      address: "Ubatuba",
      startDate: "2026-08-15",
    });
    expect(respAirbnb).toBe(
      JSON.stringify([{ name: "Hotel Teste", price: 300, rating: null, address: "" }])
    );

    const respTrivago = await buscarHoteisTrivago.invoke({
      location: "Ubatuba",
      checkinDate: "2026-08-15",
    });
    expect(respTrivago).toContain("Hotel Teste");
  });
});
