// Regressões encontradas ao rodar a aplicação de ponta a ponta (verificação
// manual pós-Fase 8). Os três defeitos abaixo não quebravam a resposta em
// texto — o LLM lê as ToolMessages diretamente — mas corrompiam
// `flightResults`/`hotelResults`, que são a SAÍDA ESTRUTURADA exposta pela API
// REST e usada pela interface web para renderizar os cards.
process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.GROQ_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENAI_API_KEY;

import { expect, test, vi, beforeEach, afterEach, describe } from "vitest";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { travelAgentGraph, extrairListagem } from "../src/agent.js";
import { clearObservability } from "../src/observability.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { futureDate } from "./helpers/dates.js";

describe("Saída estruturada — extração da listagem", () => {
  test("aceita array direto (GeckoAPI e Duffel Stays)", () => {
    expect(extrairListagem([{ name: "Hotel A" }])).toEqual([{ name: "Hotel A" }]);
  });

  test("aceita envelope com offers (create_offer_request da Duffel)", () => {
    const envelope = { id: "off_req_1", offers: [{ id: "off_1" }, { id: "off_2" }] };
    expect(extrairListagem(envelope)).toEqual([{ id: "off_1" }, { id: "off_2" }]);
  });

  test("rejeita objeto sem listagem (ex.: detalhe de uma oferta única)", () => {
    expect(extrairListagem({ id: "off_1", total_amount: "550.00" })).toBeNull();
    expect(extrairListagem("texto de erro")).toBeNull();
    expect(extrairListagem(null)).toBeNull();
  });
});

describe("Saída estruturada — regressões do filterDataNode", () => {
  let invokeSpy: any;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test_gemini_key_123";
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    process.env.TRAVEL_API_PROVIDER = "duffel";
    process.env.DUFFEL_ACCESS_TOKEN = "mock";
    clearObservability();
    invokeSpy = vi.spyOn(ChatGoogleGenerativeAI.prototype, "invoke");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TRAVEL_API_PROVIDER;
  });

  test("voos da Duffel entram em flightResults (envelope {id, offers})", async () => {
    // Antes: cleanDuffelOffers devolve um OBJETO, e o filtro só tratava arrays —
    // os voos do provedor Duffel nunca chegavam ao estado.
    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "create_offer_request",
              args: { origin: "GRU", destination: "GIG", departure_date: futureDate(30) },
              id: "call_voo",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Encontrei 2 voos."));

    const r = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("voo GRU-GIG")] },
      { configurable: { thread_id: "reg_offers" } }
    );

    expect(r.flightResults.length).toBe(2);
    expect(r.flightResults[0].airline).toBe("LATAM Airlines");
    expect(r.flightResults[1].airline).toBe("Azul Linhas Aéreas");
  });

  test("aeroportos de search_airports NÃO entram em flightResults", async () => {
    // Antes: search_airports estava no mapa de "voos", então a UI renderizava
    // cards de aeroporto como se fossem voos.
    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "search_airports",
              args: { query: "São Paulo" },
              id: "call_apt",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Aeroportos: GRU e CGH."));

    const r = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("aeroportos de SP")] },
      { configurable: { thread_id: "reg_apt" } }
    );

    expect(r.flightResults).toHaveLength(0);
    expect(r.hotelResults).toHaveLength(0);
  });

  test("resultados não são duplicados a cada iteração do ciclo", async () => {
    // Antes: o node reprocessava TODO o histórico a cada volta e o reducer
    // concatenava, multiplicando os resultados pelo número de iterações.
    invokeSpy
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "search_airports",
              args: { query: "São Paulo" },
              id: "c1",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "create_offer_request",
              args: { origin: "GRU", destination: "GIG", departure_date: futureDate(30) },
              id: "c2",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              name: "search_hotels_by_location",
              args: {
                latitude: -22.9,
                longitude: -43.1,
                check_in_date: futureDate(30),
                check_out_date: futureDate(32),
              },
              id: "c3",
              type: "tool_call",
            },
          ],
        })
      )
      .mockResolvedValueOnce(new AIMessage("Consolidado."));

    const r = await travelAgentGraph.invoke(
      { messages: [new HumanMessage("voo e hotel")] },
      { configurable: { thread_id: "reg_dup" } }
    );

    // 3 iterações do ciclo, mas cada resultado deve aparecer UMA vez
    expect(r.flightResults).toHaveLength(2); // 2 ofertas do mock
    expect(r.hotelResults).toHaveLength(2); // 2 hotéis do mock
    const ids = r.flightResults.map((f: any) => f.id);
    expect(new Set(ids).size).toBe(ids.length); // sem repetição
  });
});
