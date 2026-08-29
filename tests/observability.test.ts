// Configuração antecipada de variáveis de ambiente para evitar erros no import do agente
process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.GROQ_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.TRAVEL_API_PROVIDER;

import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import request from "supertest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { travelAgentGraph } from "../src/agent.js";
import { app } from "../src/server.js";
import {
  getExecutionLog,
  getAuditTrail,
  clearObservability,
  logNodeEvent,
  recordAudit,
} from "../src/observability.js";
import { pendingReservations } from "../src/reservation_tools.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { futureDate } from "./helpers/dates.js";

describe("Observabilidade: sinais correlacionados por thread_id", () => {
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
  });

  test("uma execução com tool produz log estruturado dos nodes e auditoria da tool, correlacionados", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: JSON.stringify([{ name: "Hotel Log", preco: 200 }]) }],
        isError: false,
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockApiResponse });

    const checkin = futureDate(30);
    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "buscar_hoteis_hoteis_com",
              args: { location: "Rio de Janeiro", checkinDate: checkin },
              id: "call_obs_1",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Encontrei o Hotel Log por R$ 200."));

    const threadId = "obs_thread_1";
    await travelAgentGraph.invoke(
      { messages: [new HumanMessage("Hotel no Rio, por favor")] },
      { configurable: { thread_id: threadId } }
    );

    // Sinal 1 — log estruturado de execução: reconstrói o fluxo dos nodes
    const log = getExecutionLog(threadId);
    const nodesVisitados = log.map((e) => e.node);
    expect(nodesVisitados).toContain("agent");
    expect(nodesVisitados).toContain("tools_hoteis");
    expect(nodesVisitados).toContain("filter");
    expect(nodesVisitados).toContain("formatter");

    // Todos os eventos carregam thread_id, timestamp e latência
    for (const evento of log) {
      expect(evento.thread_id).toBe(threadId);
      expect(evento.timestamp).toBeDefined();
      expect(evento.duration_ms).toBeGreaterThanOrEqual(0);
    }

    // O evento do node "agent" registra as tools que o modelo decidiu chamar
    const agentEvent = log.find((e) => e.node === "agent" && e.tool_calls?.length);
    expect(agentEvent?.tool_calls).toContain("buscar_hoteis_hoteis_com");

    // Sinal 2 — trilha de auditoria: registra a chamada da tool com status e latência
    const audit = getAuditTrail(threadId);
    expect(audit.length).toBe(1);
    expect(audit[0].tool).toBe("buscar_hoteis_hoteis_com");
    expect(audit[0].status).toBe("success");
    expect(audit[0].args.location).toBe("Rio de Janeiro");
    expect(audit[0].duration_ms).toBeGreaterThanOrEqual(0);

    // Correlação: os dois sinais compartilham o mesmo thread_id
    expect(audit[0].thread_id).toBe(threadId);

    globalThis.fetch = originalFetch;
  });

  test("sinais de threads diferentes não se misturam na consulta por thread_id", () => {
    logNodeEvent({ thread_id: "thread_A", node: "agent", duration_ms: 5 });
    logNodeEvent({ thread_id: "thread_B", node: "agent", duration_ms: 7 });
    recordAudit({
      thread_id: "thread_A",
      tool: "buscar_voos_latam",
      args: { from: "GRU" },
      status: "success",
      duration_ms: 10,
    });

    expect(getExecutionLog("thread_A").length).toBe(1);
    expect(getExecutionLog("thread_B").length).toBe(1);
    expect(getAuditTrail("thread_A").length).toBe(1);
    expect(getAuditTrail("thread_B").length).toBe(0);
  });

  test("bloqueio de governança entra na trilha de auditoria com status 'blocked'", async () => {
    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "confirmar_reserva",
              args: { tipo: "voo", referencia_id: "off_x", codigo_confirmacao: "CONF-7777" },
              id: "call_audit_block",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Preciso da sua aprovação para reservar."));

    const threadId = "obs_thread_block";
    await travelAgentGraph.invoke(
      { messages: [new HumanMessage("Reserve o voo off_x agora")] },
      { configurable: { thread_id: threadId } }
    );

    const audit = getAuditTrail(threadId);
    expect(audit.length).toBe(1);
    expect(audit[0].tool).toBe("confirmar_reserva");
    expect(audit[0].status).toBe("blocked");
    expect(audit[0].detail).toContain("nao digitado pelo usuario");
  });

  test("GET /api/debug/:thread_id expõe os dois sinais correlacionados (autenticado)", async () => {
    process.env.DEBUG_API_TOKEN = "token_de_teste";
    logNodeEvent({ thread_id: "web_debug_1", node: "agent", duration_ms: 12 });
    recordAudit({
      thread_id: "web_debug_1",
      tool: "buscar_hoteis_trivago",
      args: { location: "Gramado" },
      status: "success",
      duration_ms: 30,
    });

    const res = await request(app)
      .get("/api/debug/web_debug_1")
      .set("x-debug-token", "token_de_teste");
    expect(res.status).toBe(200);
    expect(res.body.thread_id).toBe("web_debug_1");
    expect(res.body.execution_log.length).toBe(1);
    expect(res.body.execution_log[0].node).toBe("agent");
    expect(res.body.audit_trail.length).toBe(1);
    expect(res.body.audit_trail[0].tool).toBe("buscar_hoteis_trivago");
    delete process.env.DEBUG_API_TOKEN;
  });
});
