// Execução real para evidência de observabilidade (atividade 3.2)
// LLM real (OpenAI gpt-4.1-nano via .env) + provedor Duffel em modo mock local.
process.env.TRAVEL_API_PROVIDER = "duffel";
process.env.DUFFEL_ACCESS_TOKEN = "mock";

import { HumanMessage } from "@langchain/core/messages";
import { travelAgentGraph } from "../src/agent.js";
import { getExecutionLog, getAuditTrail } from "../src/observability.js";

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function main() {
  const threadId = "evidencia_obs_2026-08-29";
  const config = { configurable: { thread_id: threadId }, recursionLimit: 15 };
  const dataViagem = futureDate(30);

  console.log("=== EXECUÇÃO 1: fluxo principal (voo + hotel) ===");
  const r1 = await travelAgentGraph.invoke(
    {
      messages: [
        new HumanMessage(
          `Quero um voo de São Paulo para o Rio de Janeiro no dia ${dataViagem} e também um hotel no Rio de Janeiro para 2 noites a partir dessa data.`
        ),
      ],
    },
    config
  );
  console.log("\n--- RESPOSTA FINAL AO USUÁRIO ---");
  console.log(String(r1.messages[r1.messages.length - 1].content));

  console.log("\n=== EXECUÇÃO 2: cenário de falha (data no passado) ===");
  const threadId2 = "evidencia_obs_falha_2026-08-29";
  const config2 = {
    configurable: { thread_id: threadId2 },
    recursionLimit: 15,
  };
  const r2 = await travelAgentGraph.invoke(
    {
      messages: [
        new HumanMessage("Quero um voo de GRU para GIG no dia 2020-01-01 (isso mesmo, 2020)."),
      ],
    },
    config2
  );
  console.log("\n--- RESPOSTA FINAL AO USUÁRIO (cenário de falha) ---");
  console.log(String(r2.messages[r2.messages.length - 1].content));

  console.log("\n\n############ SINAL 1: LOG ESTRUTURADO DE EXECUÇÃO ############");
  console.log("--- thread:", threadId, "---");
  for (const e of getExecutionLog(threadId)) console.log(JSON.stringify(e));
  console.log("--- thread:", threadId2, "---");
  for (const e of getExecutionLog(threadId2)) console.log(JSON.stringify(e));

  console.log("\n############ SINAL 2: TRILHA DE AUDITORIA DE TOOLS ############");
  console.log("--- thread:", threadId, "---");
  for (const a of getAuditTrail(threadId)) console.log(JSON.stringify(a));
  console.log("--- thread:", threadId2, "---");
  for (const a of getAuditTrail(threadId2)) console.log(JSON.stringify(a));
}

main().catch((err) => {
  console.error("FALHA NA EXECUÇÃO:", err.message);
  process.exit(1);
});
