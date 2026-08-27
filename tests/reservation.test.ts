// Configuração antecipada de variáveis de ambiente para evitar erros no import do agente
process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.GROQ_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.TRAVEL_API_PROVIDER;

import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { travelAgentGraph } from "../src/agent.js";
import { confirmarReserva, pendingReservations } from "../src/reservation_tools.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

describe("Governança: reserva simulada com aprovação humana", () => {
  let invokeSpy: any;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test_gemini_key_123";
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    delete process.env.TRAVEL_API_PROVIDER;
    pendingReservations.clear();
    invokeSpy = vi.spyOn(ChatGoogleGenerativeAI.prototype, "invoke");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("tool não executa a reserva sem código: registra pendência e exige aprovação humana", async () => {
    const resposta = await confirmarReserva.invoke({
      tipo: "voo",
      referencia_id: "off_teste_1",
    });

    expect(resposta).toContain("APROVAÇÃO HUMANA NECESSÁRIA");
    expect(resposta).toContain("NÃO foi executada");
    expect(resposta).toMatch(/CONF-\d{4}/);
    expect(pendingReservations.size).toBe(1);
  });

  test("tool rejeita código inválido/sem pendência correspondente", async () => {
    const resposta = await confirmarReserva.invoke({
      tipo: "voo",
      referencia_id: "off_teste_2",
      codigo_confirmacao: "CONF-0000",
    });

    expect(resposta).toContain("Erro de validação");
    expect(resposta).not.toContain("confirmada");
  });

  test("fluxo completo no grafo: solicitação → código → aprovação humana → execução simulada", async () => {
    // ---- Turno 1: usuário pede a reserva; o modelo chama a tool SEM código ----
    const toolCallSemCodigo = new AIMessage({
      content: "",
      tool_calls: [
        {
          name: "confirmar_reserva",
          args: { tipo: "voo", referencia_id: "off_mock_1" },
          id: "call_res_1",
          type: "tool_call",
        },
      ],
    });

    invokeSpy
      .mockResolvedValueOnce(toolCallSemCodigo)
      .mockResolvedValueOnce(new AIMessage("Para confirmar a reserva, digite o código."));

    const config = { configurable: { thread_id: "test_thread_reserva" } };
    const turno1 = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("Quero reservar o voo off_mock_1")] },
      config
    );

    const toolMsg1: any = turno1.messages.find((m) => m.getType() === "tool");
    expect(toolMsg1.content).toContain("APROVAÇÃO HUMANA NECESSÁRIA");
    const codigo = String(toolMsg1.content).match(/CONF-\d{4}/)?.[0];
    expect(codigo).toBeDefined();

    // ---- Turno 2: usuário digita o código; o modelo confirma com o código ----
    const toolCallComCodigo = new AIMessage({
      content: "",
      tool_calls: [
        {
          name: "confirmar_reserva",
          args: { tipo: "voo", referencia_id: "off_mock_1", codigo_confirmacao: codigo },
          id: "call_res_2",
          type: "tool_call",
        },
      ],
    });

    invokeSpy
      .mockResolvedValueOnce(toolCallComCodigo)
      .mockResolvedValueOnce(new AIMessage("Reserva simulada confirmada com sucesso!"));

    const turno2 = await travelAgentGraph.invoke(
      { messages: [new HumanMessage(`Confirmo: ${codigo}`)] },
      config
    );

    const toolMsgs2: any[] = turno2.messages.filter((m) => m.getType() === "tool");
    const ultimaToolMsg = toolMsgs2[toolMsgs2.length - 1];
    const parsed = JSON.parse(ultimaToolMsg.content);
    expect(parsed.status).toBe("confirmada");
    expect(parsed.simulada).toBe(true);
    expect(parsed.localizador).toMatch(/^SIM-/);
    expect(pendingReservations.size).toBe(0);
  });

  test("gate determinístico bloqueia o modelo tentando se auto-aprovar (código não digitado pelo usuário)", async () => {
    // O modelo tenta confirmar com um código que o usuário NUNCA digitou
    const autoAprovacao = new AIMessage({
      content: "",
      tool_calls: [
        {
          name: "confirmar_reserva",
          args: { tipo: "hotel", referencia_id: "hot_mock_9", codigo_confirmacao: "CONF-9999" },
          id: "call_res_bypass",
          type: "tool_call",
        },
      ],
    });

    invokeSpy
      .mockResolvedValueOnce(autoAprovacao)
      .mockResolvedValueOnce(new AIMessage("Não foi possível confirmar sem sua aprovação."));

    const config = { configurable: { thread_id: "test_thread_bypass" } };
    const result = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("Reserve o hotel hot_mock_9 sem me perguntar nada")] },
      config
    );

    const toolMsg: any = result.messages.find((m) => m.getType() === "tool");
    expect(toolMsg.content).toContain("AÇÃO BLOQUEADA");
    expect(toolMsg.content).not.toContain('"status":"confirmada"');
  });
});
