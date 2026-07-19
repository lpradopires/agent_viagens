// Configuração de env vars para testes
process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.GROQ_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.TRAVEL_API_PROVIDER;

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage } from "@langchain/core/messages";

describe("Express Server & REST API Endpoints", () => {
  let invokeSpy: any;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test_gemini_key_123";
    process.env.GECKO_API_KEY = "test_gecko_key_123";
    invokeSpy = vi.spyOn(ChatGoogleGenerativeAI.prototype, "invoke");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GET /api/health deve retornar status ok e timestamp", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  test("GET /api/config deve retornar o provedor padrao e status do modelo", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("gecko");
    expect(res.body.hasKey).toBe(true);
    expect(res.body.activeModel).toBe("Gemini 2.5 Flash");
  });

  test("POST /api/chat deve rejeitar mensagem vazia com status 400", async () => {
    const res = await request(app).post("/api/chat").send({ message: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("obrigatória");
  });

  test("POST /api/chat deve invocar o agente e retornar a resposta formatada", async () => {
    invokeSpy.mockResolvedValue(new AIMessage("Encontrei voos para o Rio de Janeiro por R$ 350."));

    const res = await request(app).post("/api/chat").send({
      message: "Quero pesquisar voos para o Rio de Janeiro em 15/10/2026",
      thread_id: "test_web_session_1",
    });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Encontrei voos para o Rio de Janeiro por R$ 350.");
    expect(res.body.thread_id).toBe("test_web_session_1");
  });
});
