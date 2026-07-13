// Configuração antecipada de variáveis de ambiente para evitar erros no import do agente
process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.GROQ_API_KEY;

import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { travelAgentGraph } from "../src/agent.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

describe("LangGraph Agent Engine", () => {
  let invokeSpy: any;

  beforeEach(() => {
    // Restaura variáveis de ambiente
    process.env.GEMINI_API_KEY = "test_gemini_key_123";
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    delete process.env.GROQ_API_KEY;

    // Espiona o método invoke do protótipo da classe
    invokeSpy = vi.spyOn(ChatGoogleGenerativeAI.prototype, "invoke");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("deve responder diretamente se o modelo não solicitar ferramentas", async () => {
    // Configura o mock da LLM para responder com texto comum
    invokeSpy.mockResolvedValue(
      new AIMessage("Olá! Como posso ajudar você a planejar sua viagem hoje?")
    );

    const config = { configurable: { thread_id: "test_thread_1" } };
    const result = await travelAgentGraph.invoke(
      {
        messages: [new HumanMessage("Olá")],
      },
      config
    );

    expect(result.messages.length).toBe(2);
    expect(result.messages[1].content).toBe(
      "Olá! Como posso ajudar você a planejar sua viagem hoje?"
    );
  });

  test("deve invocar ferramentas quando solicitado pelo modelo", async () => {
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify([{ id: "hotel_1", name: "Copacabana Palace", preco: 1200 }]),
          },
        ],
        isError: false,
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    // Configura a LLM para retornar chamada de ferramenta no primeiro turno
    const toolCallResponse = new AIMessage({
      content: "",
      tool_calls: [
        {
          name: "buscar_hoteis_booking",
          args: { destination: "Rio de Janeiro", checkin: "2026-08-15" },
          id: "call_1",
          type: "tool_call",
        },
      ],
    });

    // Configura a LLM para retornar a consolidação final no segundo turno
    const finalResponse = new AIMessage("Encontrei o Copacabana Palace por R$ 1200.");

    invokeSpy
      .mockResolvedValueOnce(toolCallResponse) // 1º turno
      .mockResolvedValueOnce(finalResponse); // 2º turno

    const config = { configurable: { thread_id: "test_thread_2" } };
    const result = await travelAgentGraph.invoke(
      {
        messages: [new HumanMessage("Buscar hotel no Rio para dia 15/08/2026")],
      },
      config
    );

    // O histórico de mensagens deve conter 4 mensagens:
    // 1. HumanMessage ("Buscar hotel...")
    // 2. AIMessage (com tool_calls)
    // 3. ToolMessage (retorno da GeckoAPI)
    // 4. AIMessage (resposta final consolidada)
    expect(result.messages.length).toBe(4);
    expect(result.messages[2].getType()).toBe("tool");
    expect(result.messages[3].content).toBe("Encontrei o Copacabana Palace por R$ 1200.");

    // Verifica se os dados foram filtrados e populados nas variáveis do Estado
    expect(result.hotelResults.length).toBe(1);
    expect(result.hotelResults[0].name).toBe("Copacabana Palace");

    globalThis.fetch = originalFetch;
  });
});
