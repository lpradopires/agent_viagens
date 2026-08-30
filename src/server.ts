import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { HumanMessage } from "@langchain/core/messages";
import { travelAgentGraph } from "./agent.js";
import { getExecutionLog, getAuditTrail } from "./observability.js";
import { registrarAlerta, listarAlertas, avaliarMonitorDePrecos } from "./alerts.js";

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

// Observabilidade: consulta dos dois sinais correlacionados de uma sessão
// (log estruturado de execução por node + trilha de auditoria de tools).
//
// Os sinais expõem parâmetros de ferramentas (incl. códigos de confirmação),
// e thread_ids são previsíveis o bastante para enumeração — o endpoint é
// fail-closed: sem DEBUG_API_TOKEN configurado ele não existe, e com token
// configurado exige o header x-debug-token.
app.get("/api/debug/:thread_id", (req, res) => {
  const expectedToken = process.env.DEBUG_API_TOKEN;
  if (!expectedToken) {
    res.status(404).json({ error: "Endpoint de depuração desabilitado." });
    return;
  }
  if (req.get("x-debug-token") !== expectedToken) {
    res.status(401).json({ error: "Token de depuração inválido ou ausente." });
    return;
  }

  const { thread_id } = req.params;
  res.json({
    thread_id,
    execution_log: getExecutionLog(thread_id),
    audit_trail: getAuditTrail(thread_id),
  });
});

// --- Integração com automação low-code/no-code (n8n) ---
//
// A automação orquestra (agenda, chama, roteia); a lógica de negócio fica
// aqui. Estes três endpoints são o contrato entre os dois lados.

// Avalia a resposta do agente contra um limite de preço. A regra de negócio
// vive na aplicação (e é testada), não em um nó de código dentro do n8n.
app.post("/api/monitor/avaliar", (req, res) => {
  const { resposta, limite } = req.body ?? {};

  if (typeof resposta !== "string" || !resposta.trim()) {
    res.status(400).json({ error: "O campo 'resposta' é obrigatório e deve ser um texto." });
    return;
  }
  const limiteNum = Number(limite);
  if (!Number.isFinite(limiteNum) || limiteNum <= 0) {
    res.status(400).json({ error: "O campo 'limite' deve ser um número positivo." });
    return;
  }

  res.json(avaliarMonitorDePrecos(resposta, limiteNum));
});

// Registra um alerta produzido pela automação (saída observável)
app.post("/api/alertas", (req, res) => {
  const { origem, tipo, titulo, detalhe, dados } = req.body ?? {};

  if (typeof titulo !== "string" || !titulo.trim()) {
    res.status(400).json({ error: "O campo 'titulo' é obrigatório." });
    return;
  }

  const alerta = registrarAlerta({
    origem: typeof origem === "string" && origem.trim() ? origem : "desconhecida",
    tipo: typeof tipo === "string" && tipo.trim() ? tipo : "generico",
    titulo,
    detalhe: typeof detalhe === "string" ? detalhe : undefined,
    dados: dados && typeof dados === "object" ? dados : undefined,
  });

  console.log(`[Alerta] ${alerta.origem} | ${alerta.tipo} | ${alerta.titulo}`);
  res.status(201).json(alerta);
});

// Consulta dos alertas registrados — a saída observável da automação
app.get("/api/alertas", (req, res) => {
  const origem = typeof req.query.origem === "string" ? req.query.origem : undefined;
  const alertas = listarAlertas(origem);
  res.json({ total: alertas.length, alertas });
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
