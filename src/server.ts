import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { HumanMessage } from "@langchain/core/messages";
import { travelAgentGraph } from "./agent.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos da pasta public
const publicPath = path.join(__dirname, "../public");
app.use(express.static(publicPath));

// Healthcheck
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Configurações do agente
app.get("/api/config", (_req, res) => {
  const provider = process.env.TRAVEL_API_PROVIDER?.toLowerCase() === "duffel" ? "duffel" : "gecko";
  const today = new Date().toISOString().split("T")[0];
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY
  );

  res.json({
    provider,
    today,
    hasKey,
    activeModel: process.env.GEMINI_API_KEY
      ? "Gemini 2.5 Flash"
      : process.env.OPENAI_API_KEY
        ? "GPT-4.1 Nano"
        : process.env.OPENROUTER_API_KEY
          ? "OpenRouter (Meta Llama 3.3)"
          : process.env.GROQ_API_KEY
            ? "Groq Llama 3.1"
            : "Nenhum",
  });
});

// Endpoint principal de chat com o agente
app.post("/api/chat", async (req, res) => {
  try {
    const { message, thread_id: inputThreadId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "A mensagem é obrigatória e deve ser um texto válido." });
      return;
    }

    const thread_id = inputThreadId || `web_session_${Math.floor(Math.random() * 1000000)}`;

    const config = {
      configurable: { thread_id },
      recursionLimit: 15,
    };

    const result = await travelAgentGraph.invoke(
      {
        messages: [new HumanMessage(message.trim())],
      },
      config
    );

    const messages = result.messages || [];
    const lastMessage = messages[messages.length - 1];

    res.json({
      reply: lastMessage ? lastMessage.content : "Sem resposta do agente.",
      thread_id,
      flightResults: result.flightResults || [],
      hotelResults: result.hotelResults || [],
    });
  } catch (error: any) {
    console.error("[Erro API Express /api/chat]:", error);
    const isRecursionError =
      error.name === "GraphRecursionError" || error.message?.toLowerCase().includes("recursion");

    const errorMessage = isRecursionError
      ? "Limite de passos/recursão do agente atingido para proteção contra loops."
      : error.message || "Erro interno no processamento do agente.";

    res.status(500).json({
      error: errorMessage,
      thread_id: req.body.thread_id,
    });
  }
});

// Fallback para SPA (serve index.html para qualquer rota não mapeada)
app.use((_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor do Agente de Viagens rodando na porta ${PORT}`);
    console.log(`🌐 Acesse a interface web em: http://localhost:${PORT}\n`);
  });
}
