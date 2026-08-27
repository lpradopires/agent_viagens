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
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { futureDate } from "./helpers/dates.js";

describe("LangGraph Agent Engine", () => {
  let invokeSpy: any;

  beforeEach(() => {
    // Restaura variáveis de ambiente
    process.env.GEMINI_API_KEY = "test_gemini_key_123";
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.TRAVEL_API_PROVIDER;

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

    // Configura a LLM para retornar as chamadas de ferramenta no primeiro turno
    const toolCallResponse = new AIMessage({
      content: "",
      tool_calls: [
        {
          name: "buscar_hoteis_hoteis_com",
          args: { location: "Rio de Janeiro", checkinDate: futureDate(30) },
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

  test("deve buscar voo e hotel em paralelo quando o modelo solicita os dois na mesma resposta", async () => {
    // A GeckoApiClient sempre bate no mesmo endpoint mockado; devolvemos um item
    // com campos reconhecidos tanto pelo cleaner de voos quanto pelo de hotéis.
    const mockApiResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify([{ cia: "LATAM", preco: 700, name: "Hotel Central" }]),
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

    // A LLM solicita voo E hotel na MESMA mensagem (tool_calls com 2 itens)
    const toolCallResponse = new AIMessage({
      content: "",
      tool_calls: [
        {
          name: "buscar_voos_latam",
          args: { from: "GRU", to: "SDU", departureDate: futureDate(30) },
          id: "call_voo",
          type: "tool_call",
        },
        {
          name: "buscar_hoteis_hoteis_com",
          args: { location: "Rio de Janeiro", checkinDate: futureDate(30) },
          id: "call_hotel",
          type: "tool_call",
        },
      ],
    });

    const finalResponse = new AIMessage("Encontrei voos da LATAM e hospedagem no Hotel Central.");

    invokeSpy.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(finalResponse);

    const config = { configurable: { thread_id: "test_thread_parallel" } };
    const result = await travelAgentGraph.invoke(
      {
        messages: [new HumanMessage("Quero voo de GRU para SDU e hotel no Rio, ambos amanhã")],
      },
      config
    );

    // As duas tool_calls devem ter sido respondidas (fan-out para os dois nodes
    // paralelos + fan-in de volta em "filter"), independente da ordem de conclusão.
    const toolMessages = result.messages.filter((m) => m.getType() === "tool");
    expect(toolMessages.length).toBe(2);
    const toolCallIds = toolMessages.map((m: any) => m.tool_call_id).sort();
    expect(toolCallIds).toEqual(["call_hotel", "call_voo"]);

    // Ambas as categorias de resultado devem ter sido populadas pelo filterDataNode
    expect(result.flightResults.length).toBe(1);
    expect(result.flightResults[0].airline).toBe("LATAM");
    expect(result.hotelResults.length).toBe(1);
    expect(result.hotelResults[0].name).toBe("Hotel Central");

    expect(result.messages[result.messages.length - 1].content).toBe(
      "Encontrei voos da LATAM e hospedagem no Hotel Central."
    );

    globalThis.fetch = originalFetch;
  });
});
