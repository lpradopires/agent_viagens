/**
 * Análise de sinais de DevOps: estatística de execuções do pipeline,
 * detecção de anomalias e estimativa de risco de falha.
 *
 * As heurísticas aqui são deliberadamente simples e determinísticas — o LLM é
 * usado para *explicar* os logs e os achados em linguagem natural, não para
 * calcular os números. Assim os resultados são reproduzíveis e testáveis.
 */

export interface StepExecution {
  name: string;
  durationSec: number;
}

export interface RunRecord {
  id: string;
  branch: string;
  createdAt: string;
  conclusion: string;
  /** Título do commit — usado para correlacionar picos com o que mudou */
  title?: string;
  steps: StepExecution[];
}

export interface StepStats {
  name: string;
  execucoes: number;
  media: number;
  desvioPadrao: number;
  min: number;
  max: number;
  /** Variação percentual entre a média da 1ª e da 2ª metade da série */
  tendenciaPct: number;
}

export interface Anomalia {
  tipo: "outlier_duracao" | "tendencia_crescente" | "falha_recorrente";
  etapa: string;
  severidade: "alta" | "media" | "baixa";
  descricao: string;
  evidencia: string;
}

export interface EstimativaRisco {
  scoreRisco: number; // 0..100
  nivel: "baixo" | "moderado" | "alto";
  taxaFalhaHistorica: number;
  fatores: string[];
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const desvioPadrao = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)));
};

/** Duração por etapa, em ordem cronológica (mais antigo primeiro) */
export function seriePorEtapa(runs: RunRecord[], etapa: string): number[] {
  return [...runs]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((r) => r.steps.filter((s) => s.name === etapa).map((s) => s.durationSec));
}

export function estatisticasPorEtapa(runs: RunRecord[], etapas: string[]): StepStats[] {
  return etapas.map((etapa) => {
    const serie = seriePorEtapa(runs, etapa);
    const metade = Math.floor(serie.length / 2);
    const primeira = media(serie.slice(0, metade));
    const segunda = media(serie.slice(metade));
    const tendenciaPct = primeira > 0 ? ((segunda - primeira) / primeira) * 100 : 0;

    return {
      name: etapa,
      execucoes: serie.length,
      media: Number(media(serie).toFixed(2)),
      desvioPadrao: Number(desvioPadrao(serie).toFixed(2)),
      min: serie.length ? Math.min(...serie) : 0,
      max: serie.length ? Math.max(...serie) : 0,
      tendenciaPct: Number(tendenciaPct.toFixed(1)),
    };
  });
}

/** Limiares das heurísticas — explicitados para poderem ser discutidos e testados */
export const LIMIARES = {
  /** Desvios-padrão acima da média para considerar a duração um outlier */
  zScoreOutlier: 2,
  /** Crescimento percentual (2ª metade vs 1ª) que caracteriza tendência de alta */
  tendenciaCrescentePct: 30,
  /** Falhas consecutivas na mesma etapa que caracterizam falha recorrente */
  falhasRecorrentes: 2,
};

export function detectarAnomalias(runs: RunRecord[], etapas: string[]): Anomalia[] {
  const anomalias: Anomalia[] = [];
  const ordenados = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const stats of estatisticasPorEtapa(runs, etapas)) {
    const serie = seriePorEtapa(runs, stats.name);

    // 1. Outlier de duração (latência anômala em uma execução isolada)
    if (stats.desvioPadrao > 0) {
      serie.forEach((valor, i) => {
        const z = (valor - stats.media) / stats.desvioPadrao;
        if (z >= LIMIARES.zScoreOutlier) {
          const run = ordenados[i];
          anomalias.push({
            tipo: "outlier_duracao",
            etapa: stats.name,
            severidade: z >= 3 ? "alta" : "media",
            descricao: `Duração de ${valor}s em "${stats.name}" está ${z.toFixed(1)} desvios-padrão acima da média (${stats.media}s).`,
            evidencia: `run ${run?.id ?? "?"} (${run?.branch ?? "?"}) — série: [${serie.join(", ")}]`,
          });
        }
      });
    }

    // 2. Tendência de crescimento sustentado (degradação progressiva)
    if (stats.execucoes >= 4 && stats.tendenciaPct >= LIMIARES.tendenciaCrescentePct) {
      anomalias.push({
        tipo: "tendencia_crescente",
        etapa: stats.name,
        severidade: stats.tendenciaPct >= 60 ? "alta" : "media",
        descricao: `Duração de "${stats.name}" cresceu ${stats.tendenciaPct}% entre a primeira e a segunda metade das execuções.`,
        evidencia: `série cronológica: [${serie.join(", ")}] (min ${stats.min}s, max ${stats.max}s)`,
      });
    }
  }

  // 3. Falhas recorrentes (mesma conclusão de falha em execuções seguidas)
  let consecutivas = 0;
  for (const run of ordenados) {
    consecutivas = run.conclusion === "failure" ? consecutivas + 1 : 0;
    if (consecutivas >= LIMIARES.falhasRecorrentes) {
      anomalias.push({
        tipo: "falha_recorrente",
        etapa: "pipeline",
        severidade: "alta",
        descricao: `${consecutivas} execuções consecutivas do pipeline falharam.`,
        evidencia: `última: run ${run.id} (${run.branch})`,
      });
    }
  }

  return anomalias;
}

/**
 * Estimativa simples de risco de falha do pipeline (0..100).
 *
 * Combina taxa de falha histórica (peso maior, é o sinal mais direto) com a
 * presença de anomalias de duração — que não causam falha por si, mas indicam
 * degradação e aumentam a chance de timeout futuro.
 */
export function estimarRisco(runs: RunRecord[], anomalias: Anomalia[]): EstimativaRisco {
  const total = runs.length || 1;
  const falhas = runs.filter((r) => r.conclusion === "failure").length;
  const taxaFalha = falhas / total;

  const fatores: string[] = [];
  let score = 0;

  const contribFalha = taxaFalha * 60;
  score += contribFalha;
  fatores.push(
    `taxa de falha histórica ${(taxaFalha * 100).toFixed(1)}% (${falhas}/${total} execuções) → +${contribFalha.toFixed(1)}`
  );

  const tendencias = anomalias.filter((a) => a.tipo === "tendencia_crescente");
  if (tendencias.length) {
    const contrib = Math.min(25, tendencias.length * 15);
    score += contrib;
    fatores.push(
      `${tendencias.length} etapa(s) com tendência de duração crescente → +${contrib.toFixed(1)}`
    );
  }

  const outliers = anomalias.filter((a) => a.tipo === "outlier_duracao");
  if (outliers.length) {
    const contrib = Math.min(15, outliers.length * 5);
    score += contrib;
    fatores.push(`${outliers.length} outlier(s) de duração → +${contrib.toFixed(1)}`);
  }

  const recorrentes = anomalias.filter((a) => a.tipo === "falha_recorrente");
  if (recorrentes.length) {
    score += 20;
    fatores.push(`falhas consecutivas detectadas → +20.0`);
  }

  score = Math.min(100, Math.round(score));
  const nivel = score >= 60 ? "alto" : score >= 30 ? "moderado" : "baixo";

  return {
    scoreRisco: score,
    nivel,
    taxaFalhaHistorica: Number((taxaFalha * 100).toFixed(1)),
    fatores,
  };
}

/**
 * Coeficiente de correlação de Pearson entre duas séries.
 *
 * Usado para *validar* (ou refutar) a causa hipotetizada de uma anomalia: uma
 * tendência de duração crescente só é explicada pelo crescimento da suíte se
 * as duas séries de fato andarem juntas.
 */
export function correlacaoPearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = media(xs);
  const my = media(ys);
  const cov = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
  const varX = Math.sqrt(xs.reduce((acc, x) => acc + (x - mx) ** 2, 0));
  const varY = Math.sqrt(ys.reduce((acc, y) => acc + (y - my) ** 2, 0));
  if (varX === 0 || varY === 0) return 0;
  return Number((cov / (varX * varY)).toFixed(3));
}

/**
 * Regressão linear simples (mínimos quadrados) para projetar a duração futura
 * de uma etapa em função de uma variável explicativa — por exemplo, projetar
 * quanto os testes levarão quando a suíte tiver N casos.
 */
export function projetarPorRegressao(
  xs: number[],
  ys: number[],
  xFuturo: number
): { inclinacao: number; intercepto: number; projecao: number } {
  const mx = media(xs);
  const my = media(ys);
  const denom = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  const inclinacao =
    denom === 0 ? 0 : xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0) / denom;
  const intercepto = my - inclinacao * mx;
  return {
    inclinacao: Number(inclinacao.toFixed(4)),
    intercepto: Number(intercepto.toFixed(3)),
    projecao: Number((inclinacao * xFuturo + intercepto).toFixed(1)),
  };
}

/** Extrai as linhas de log de uma etapa específica do log completo do run */
export function extrairLogDaEtapa(logCompleto: string, etapa: string, maxLinhas = 60): string {
  const linhas = logCompleto
    .split("\n")
    .filter((l) => l.includes(`\t${etapa}\t`))
    // Remove prefixo de job/etapa e timestamp ISO do runner
    .map((l) => l.replace(/^.*?\t.*?\t/, "").replace(/^﻿?\S+Z /, ""))
    // Remove códigos de cor ANSI para não poluir o prompt do LLM
    .map((l) => l.replace(/\[[0-9;]*m/g, ""))
    .filter((l) => l.trim().length > 0);

  return linhas.slice(-maxLinhas).join("\n");
}
