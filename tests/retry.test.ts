process.env.GECKO_API_KEY = "test_gecko_key_123";

import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import { withRetry, isTransientError } from "../src/retry.js";
import { GeckoApiClient } from "../src/gecko_api_client.js";
import { DuffelApiClient } from "../src/duffel_api_client.js";
import { buscarVoosLatam } from "../src/tools.js";
import { futureDate } from "./helpers/dates.js";

const originalFetch = globalThis.fetch;

describe("Resiliência: withRetry (retry limitado + backoff)", () => {
  test("recupera após falhas transitórias e retorna o resultado", async () => {
    let chamadas = 0;
    const fn = vi.fn(async () => {
      chamadas++;
      if (chamadas < 3) throw new Error("fetch failed");
      return "sucesso";
    });

    const resultado = await withRetry(fn, { retries: 2, baseDelayMs: 1 });
    expect(resultado).toBe("sucesso");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("erro não-transitório é propagado imediatamente, sem retry", async () => {
    const fn = vi.fn(async () => {
      throw new Error("Erro HTTP: 400");
    });

    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow("Erro HTTP: 400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("esgotadas as tentativas, o último erro transitório é propagado", async () => {
    const fn = vi.fn(async () => {
      throw new Error("Erro HTTP: 503");
    });

    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow("Erro HTTP: 503");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("isTransientError classifica corretamente os erros", () => {
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("Falha na requisição HTTP: 500 Internal Server Error"))).toBe(
      true
    );
    expect(isTransientError(new Error("Erro HTTP: 429"))).toBe(true);
    expect(isTransientError(new Error("This operation was aborted"))).toBe(true);
    expect(isTransientError(new Error("Erro HTTP: 403"))).toBe(false);
    expect(isTransientError(new Error("Erro de validação: data no passado"))).toBe(false);
  });
});

describe("Resiliência: integração nos clients de API", () => {
  beforeEach(() => {
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("GeckoApiClient recupera de uma falha de rede transitória via retry", async () => {
    const mockOk = {
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: JSON.stringify([{ cia: "LATAM", preco: 700 }]) }],
          isError: false,
        },
      }),
    };

    (globalThis.fetch as any)
      .mockRejectedValueOnce(new Error("fetch failed")) // 1ª tentativa: rede cai
      .mockResolvedValueOnce(mockOk); // 2ª tentativa: sucesso

    const client = new GeckoApiClient();
    const resultado = await client.callTool("latamairlines_com_plp", { from: "GRU" });
    expect(resultado[0].cia).toBe("LATAM");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test("DuffelApiClient (modo real) recupera de HTTP 500 transitório via retry", async () => {
    process.env.DUFFEL_ACCESS_TOKEN = "token_real_simulado_12345";

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }) // 1ª: 5xx
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ type: "airport", iata_code: "GRU", name: "Guarulhos", city: { name: "SP" } }],
        }),
      }); // 2ª: sucesso

    const client = new DuffelApiClient();
    const aeroportos = await client.searchAirports("São Paulo");
    expect(aeroportos[0].iata_code).toBe("GRU");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    process.env.DUFFEL_ACCESS_TOKEN = "mock";
  });

  test("fallback amigável: esgotado o retry, a tool devolve mensagem de erro legível (não exceção)", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("fetch failed"));

    const resposta = await buscarVoosLatam.invoke({
      from: "GRU",
      to: "SDU",
      departureDate: futureDate(30),
    });

    // A camada de tool captura o erro final e converte em texto amigável para o LLM/usuário
    expect(typeof resposta).toBe("string");
    expect(resposta).toContain("Erro na busca de voos LATAM");
    // 1 tentativa original + 2 retries
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
