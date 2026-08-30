/**
 * DevOps inteligente: coleta execuções reais do pipeline (GitHub Actions),
 * calcula estatísticas, detecta anomalias, estima risco de falha e usa o LLM
 * para explicar os logs de duas etapas em linguagem natural.
 *
 * Uso:  npx tsx scripts/analise_ci.ts [--limite N]
 * Requer: gh CLI autenticado e uma chave de LLM no .env
 */
import { execSync } from "child_process";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import dotenv from "dotenv";
import {
  RunRecord,
  estatisticasPorEtapa,
  detectarAnomalias,
  estimarRisco,
  extrairLogDaEtapa,
  LIMIARES,
} from "../src/ci_analysis.js";

dotenv.config();

const REPO = "lpradopires/agent_viagens";
const ETAPAS_ANALISADAS = ["Run Linter", "Run Build", "Run Tests", "Install Dependencies"];
const ETAPAS_EXPLICADAS_PELO_LLM = ["Run Linter", "Run Tests"];

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
}

function coletarRuns(limite: number): RunRecord[] {
  console.log(`[1/4] Coletando as ${limite} execuções mais recentes do pipeline...`);
  const lista = JSON.parse(
    sh(
      `gh run list --repo ${REPO} --limit ${limite} --json databaseId,headBranch,createdAt,conclusion,displayTitle`
    )
  );

  const runs: RunRecord[] = [];
  for (const item of lista) {
    const jobs = JSON.parse(sh(`gh api repos/${REPO}/actions/runs/${item.databaseId}/jobs`));
    const steps = (jobs.jobs?.[0]?.steps ?? [])
      .filter((s: any) => s.started_at && s.completed_at)
      .map((s: any) => ({
        name: s.name,
        durationSec: Math.round(
          (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000
        ),
      }));

    runs.push({
      id: String(item.databaseId),
      branch: item.headBranch,
      createdAt: item.createdAt,
      conclusion: item.conclusion ?? "unknown",
      title: item.displayTitle,
      steps,
    });
  }
  return runs;
}

function getModel(): any {
  if (process.env.GEMINI_API_KEY) {
    return new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.2,
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      model: "gpt-4.1-nano",
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.2,
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    return new ChatOpenAI({
      model: "openai/gpt-4.1-nano",
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      temperature: 0.2,
    });
  }
  throw new Error("Nenhuma chave de LLM configurada no .env.");
}

async function main() {
  const argLimite = process.argv.indexOf("--limite");
  const limite = argLimite > -1 ? Number(process.argv[argLimite + 1]) : 12;

  const runs = coletarRuns(limite);
  console.log(`      ${runs.length} execuções coletadas.\n`);

  // --- Estatísticas determinísticas ---
  console.log("[2/4] Estatísticas por etapa (duração em segundos):\n");
  const stats = estatisticasPorEtapa(runs, ETAPAS_ANALISADAS);
  console.table(
    stats.map((s) => ({
      etapa: s.name,
      execucoes: s.execucoes,
      media: s.media,
      desvio: s.desvioPadrao,
      min: s.min,
      max: s.max,
      "tendencia %": s.tendenciaPct,
    }))
  );

  // --- Anomalias ---
  console.log("\n[3/4] Anomalias detectadas (heurísticas determinísticas):\n");
  const anomalias = detectarAnomalias(runs, ETAPAS_ANALISADAS);
  if (anomalias.length === 0) {
    console.log("      Nenhuma anomalia acima dos limiares configurados.");
  }
  for (const a of anomalias) {
    console.log(`  • [${a.severidade.toUpperCase()}] ${a.tipo} em "${a.etapa}"`);
    console.log(`    ${a.descricao}`);
    console.log(`    evidência: ${a.evidencia}\n`);
  }

  const risco = estimarRisco(runs, anomalias);
  console.log("  ESTIMATIVA DE RISCO DE FALHA DO PIPELINE");
  console.log(`  score: ${risco.scoreRisco}/100  |  nível: ${risco.nivel.toUpperCase()}`);
  console.log(`  taxa de falha histórica: ${risco.taxaFalhaHistorica}%`);
  risco.fatores.forEach((f) => console.log(`    - ${f}`));
  console.log(`  limiares: ${JSON.stringify(LIMIARES)}`);

  // --- Explicação dos logs pelo LLM ---
  console.log("\n[4/4] Explicação dos logs pela IA...\n");
  const runMaisRecente = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const logCompleto = sh(`gh run view ${runMaisRecente.id} --repo ${REPO} --log`);

  const trechos = ETAPAS_EXPLICADAS_PELO_LLM.map(
    (etapa) => `### Etapa: ${etapa}\n${extrairLogDaEtapa(logCompleto, etapa, 40)}`
  ).join("\n\n");

  const prompt = `Você é um engenheiro de DevOps analisando o pipeline de CI de uma aplicação Node.js/TypeScript.

Analise os logs reais de duas etapas do pipeline e os sinais estatísticos abaixo, e produza um relatório em português com:
1. O que cada etapa fez e qual foi o resultado (seja concreto: cite números que aparecem nos logs).
2. Sua interpretação das anomalias detectadas — explique a causa mais provável de cada uma.
3. Sua avaliação do risco de falha do pipeline, dizendo se concorda com o score calculado e por quê.
Seja objetivo e técnico. Não invente dados que não estejam nos logs.

## LOGS REAIS (run ${runMaisRecente.id}, branch ${runMaisRecente.branch})
${trechos}

## ESTATÍSTICAS (${runs.length} execuções)
${JSON.stringify(stats, null, 2)}

## ANOMALIAS DETECTADAS
${JSON.stringify(anomalias, null, 2)}

## ESTIMATIVA DE RISCO CALCULADA
${JSON.stringify(risco, null, 2)}`;

  const resposta = await getModel().invoke(prompt);
  console.log(String(resposta.content));
}

main().catch((err) => {
  console.error("FALHA NA ANÁLISE:", err.message);
  process.exit(1);
});
