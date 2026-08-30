// Suíte de regressão dos achados do code review com IA (atividades 4.1 / 4.2).
// Cada teste corresponde a um achado real, e a ordem segue a priorização por
// risco documentada em docs/qa/priorizacao_testes.md.
process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.GROQ_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.TRAVEL_API_PROVIDER;

import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import request from "supertest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { travelAgentGraph, redactMessageContent, contemRecusa } from "../src/agent.js";
import { app } from "../src/server.js";
import { executarReserva, pendingReservations, PENDING_TTL_MS } from "../src/reservation_tools.js";
import { clearObservability } from "../src/observability.js";
import { DuffelApiClient } from "../src/duffel_api_client.js";
import { withRetry } from "../src/retry.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { futureDate } from "./helpers/dates.js";

const originalFetch = globalThis.fetch;

describe("Regressão P0 — integridade da sessão (risco: sessão inutilizada)", () => {
  let invokeSpy: any;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test_gemini_key_123";
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    delete process.env.TRAVEL_API_PROVIDER;
    clearObservability();
    pendingReservations.clear();
    invokeSpy = vi.spyOn(ChatGoogleGenerativeAI.prototype, "invoke");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("tool_call de ferramenta inexistente recebe ToolMessage de erro (não fica órfã)", async () => {
    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "ferramenta_que_nao_existe",
              args: { foo: "bar" },
              id: "call_orfa",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Desculpe, não consigo fazer isso."));

    const result = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("Faça algo impossível")] },
      { configurable: { thread_id: "regr_orfa" } }
    );

    // Toda tool_call precisa de uma ToolMessage correspondente, senão o
    // histórico persistido fica inválido e a sessão quebra para sempre.
    const toolMsgs: any[] = result.messages.filter((m) => m.getType() === "tool");
    expect(toolMsgs.length).toBe(1);
    expect(toolMsgs[0].tool_call_id).toBe("call_orfa");
    expect(toolMsgs[0].content).toContain("não existe");
  });

  test("lote misto (tool válida + inexistente) responde a ambas as tool_calls", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: JSON.stringify([{ cia: "LATAM", preco: 700 }]) }],
        isError: false,
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockApiResponse });

    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "buscar_voos_latam",
              args: { from: "GRU", to: "SDU", departureDate: futureDate(30) },
              id: "call_valida",
              type: "tool_call",
            },
            {
              name: "buscar_trem_bala",
              args: {},
              id: "call_invalida",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Encontrei voos; trem não está disponível."));

    const result = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("Quero voo e trem")] },
      { configurable: { thread_id: "regr_lote_misto" } }
    );

    const ids = result.messages
      .filter((m) => m.getType() === "tool")
      .map((m: any) => m.tool_call_id)
      .sort();
    expect(ids).toEqual(["call_invalida", "call_valida"]);
  });
});

describe("Regressão P0 — governança da reserva (risco: ação irreversível indevida)", () => {
  beforeEach(() => {
    pendingReservations.clear();
  });

  test("pendência é vinculada à sessão: outra thread não confirma a reserva alheia", async () => {
    const solicitacao = await executarReserva(
      { tipo: "voo", referencia_id: "off_user_a" },
      "thread_usuario_A"
    );
    const codigo = solicitacao.match(/CONF-[0-9A-F]+/)?.[0];
    expect(codigo).toBeDefined();

    // Sessão B tenta usar o código da sessão A
    const tentativaB = await executarReserva(
      { tipo: "voo", referencia_id: "off_user_a", codigo_confirmacao: codigo },
      "thread_usuario_B"
    );
    expect(tentativaB).toContain("AÇÃO BLOQUEADA");
    expect(tentativaB).not.toContain("confirmada");

    // A pendência continua válida para o dono legítimo
    const tentativaA = await executarReserva(
      { tipo: "voo", referencia_id: "off_user_a", codigo_confirmacao: codigo },
      "thread_usuario_A"
    );
    expect(JSON.parse(tentativaA).status).toBe("confirmada");
  });

  test("código de aprovação expira após o TTL", async () => {
    const solicitacao = await executarReserva(
      { tipo: "hotel", referencia_id: "hot_ttl" },
      "thread_ttl"
    );
    const codigo = solicitacao.match(/CONF-[0-9A-F]+/)?.[0] as string;

    // Simula a passagem do tempo além do TTL
    const pendente = pendingReservations.get(codigo)!;
    pendente.criadaEm = Date.now() - (PENDING_TTL_MS + 1000);

    const resposta = await executarReserva(
      { tipo: "hotel", referencia_id: "hot_ttl", codigo_confirmacao: codigo },
      "thread_ttl"
    );
    expect(resposta).toContain("expirou");
  });

  test("código tem entropia suficiente (não é adivinhável por varredura)", async () => {
    const codigos = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = await executarReserva(
        { tipo: "voo", referencia_id: `off_${i}` },
        "thread_entropia"
      );
      codigos.add(r.match(/CONF-[0-9A-F]+/)?.[0] as string);
    }
    expect(codigos.size).toBe(20); // sem colisões
    const exemplo = [...codigos][0];
    expect(exemplo.replace("CONF-", "").length).toBeGreaterThanOrEqual(8);
  });

  test("mensagem de recusa com o código presente NÃO executa a reserva", async () => {
    // O gate original usava includes(codigo): uma recusa que citasse o código
    // era lida como aprovação.
    expect(contemRecusa("NAO, NAO QUERO MAIS. CANCELE, NAO USE O CODIGO CONF-ABC12345")).toBe(true);
    expect(contemRecusa("SIM, CONFIRMO O CODIGO CONF-ABC12345")).toBe(false);
  });
});

describe("Regressão P0 — vazamento de dados (risco: exposição de segredos/sessões)", () => {
  test("redação de segredos cobre conteúdo em blocos, não só string", () => {
    const emBlocos = [
      { type: "text", text: "A chave é test_gecko_key_123" },
      { type: "text", text: "Sem segredo aqui." },
    ];
    const resultado = redactMessageContent(emBlocos);
    expect(resultado.redigido).toBe(true);
    expect(JSON.stringify(resultado.content)).not.toContain("test_gecko_key_123");
    expect(JSON.stringify(resultado.content)).toContain("[SEGREDO REDIGIDO]");

    // String continua funcionando
    const emString = redactMessageContent("chave: test_gecko_key_123");
    expect(emString.redigido).toBe(true);
    expect(emString.content).not.toContain("test_gecko_key_123");
  });

  test("/api/debug é fail-closed: 404 sem token configurado, 401 com token errado", async () => {
    delete process.env.DEBUG_API_TOKEN;
    const semConfig = await request(app).get("/api/debug/qualquer_thread");
    expect(semConfig.status).toBe(404);

    process.env.DEBUG_API_TOKEN = "segredo_debug";
    const semHeader = await request(app).get("/api/debug/qualquer_thread");
    expect(semHeader.status).toBe(401);

    const tokenErrado = await request(app)
      .get("/api/debug/qualquer_thread")
      .set("x-debug-token", "chute");
    expect(tokenErrado.status).toBe(401);

    delete process.env.DEBUG_API_TOKEN;
  });
});

describe("Regressão P1 — resiliência (risco: custo e duplicidade em produção)", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.DUFFEL_ACCESS_TOKEN = "mock";
  });

  test("criação de oferta (POST não idempotente) não é retentada", async () => {
    process.env.DUFFEL_ACCESS_TOKEN = "token_real_simulado_12345";
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const client = new DuffelApiClient();
    await expect(
      client.createOfferRequest({
        origin: "GRU",
        destination: "GIG",
        departure_date: futureDate(30),
      })
    ).rejects.toThrow();

    // Uma única chamada: retentar criaria cotações duplicadas no provedor
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("erro com status HTTP no objeto é reconhecido como transitório", async () => {
    process.env.DUFFEL_ACCESS_TOKEN = "token_real_simulado_12345";
    // A Duffel devolve a mensagem de negócio no corpo, sem o código no texto
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ errors: [{ message: "Service temporarily unavailable" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ type: "airport", iata_code: "GRU", name: "GRU" }] }),
      });

    const client = new DuffelApiClient();
    const aeroportos = await client.searchAirports("São Paulo");
    expect(aeroportos[0].iata_code).toBe("GRU");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test("orçamento total de tempo interrompe as retentativas", async () => {
    let chamadas = 0;
    const fn = async () => {
      chamadas++;
      throw new Error("fetch failed");
    };

    await expect(
      withRetry(fn, { retries: 5, baseDelayMs: 100, totalBudgetMs: 150 })
    ).rejects.toThrow("fetch failed");

    // Sem o orçamento seriam 6 tentativas; o teto corta antes
    expect(chamadas).toBeLessThan(4);
  });
});
