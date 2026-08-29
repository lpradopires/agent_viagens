import { expect, test, describe } from "vitest";
import {
  RunRecord,
  estatisticasPorEtapa,
  detectarAnomalias,
  estimarRisco,
  extrairLogDaEtapa,
  seriePorEtapa,
  correlacaoPearson,
  projetarPorRegressao,
} from "../src/ci_analysis.js";

/** Gera execuções sintéticas com durações controladas para a etapa informada */
function runsComDuracoes(etapa: string, duracoes: number[], conclusoes?: string[]): RunRecord[] {
  return duracoes.map((d, i) => ({
    id: `run_${i}`,
    branch: "develop",
    createdAt: `2026-08-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
    conclusion: conclusoes?.[i] ?? "success",
    steps: [{ name: etapa, durationSec: d }],
  }));
}

describe("Análise de CI — estatísticas", () => {
  test("calcula média, desvio, min/max e tendência por etapa", () => {
    const runs = runsComDuracoes("Run Tests", [2, 2, 4, 4]);
    const [stats] = estatisticasPorEtapa(runs, ["Run Tests"]);

    expect(stats.execucoes).toBe(4);
    expect(stats.media).toBe(3);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(4);
    // 1ª metade [2,2] = 2 ; 2ª metade [4,4] = 4 → +100%
    expect(stats.tendenciaPct).toBe(100);
  });

  test("série é ordenada cronologicamente, não pela ordem de entrada", () => {
    const runs: RunRecord[] = [
      {
        id: "b",
        branch: "develop",
        createdAt: "2026-08-20T10:00:00Z",
        conclusion: "success",
        steps: [{ name: "Run Tests", durationSec: 9 }],
      },
      {
        id: "a",
        branch: "develop",
        createdAt: "2026-08-10T10:00:00Z",
        conclusion: "success",
        steps: [{ name: "Run Tests", durationSec: 1 }],
      },
    ];
    expect(seriePorEtapa(runs, "Run Tests")).toEqual([1, 9]);
  });
});

describe("Análise de CI — detecção de anomalias", () => {
  test("detecta outlier de duração acima de 2 desvios-padrão", () => {
    // Série estável com um pico isolado
    const runs = runsComDuracoes("Setup Node.js", [5, 5, 5, 5, 5, 5, 5, 20]);
    const anomalias = detectarAnomalias(runs, ["Setup Node.js"]);

    const outliers = anomalias.filter((a) => a.tipo === "outlier_duracao");
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    expect(outliers[0].etapa).toBe("Setup Node.js");
    expect(outliers[0].descricao).toContain("20s");
  });

  test("não acusa outlier em série homogênea", () => {
    const runs = runsComDuracoes("Run Build", [3, 3, 3, 3, 3, 3]);
    const anomalias = detectarAnomalias(runs, ["Run Build"]);
    expect(anomalias.filter((a) => a.tipo === "outlier_duracao")).toHaveLength(0);
  });

  test("detecta tendência de crescimento sustentado", () => {
    // Crescimento progressivo: 1ª metade média 2, 2ª metade média 4,67 (+133%)
    const runs = runsComDuracoes("Run Tests", [2, 2, 2, 4, 5, 5]);
    const anomalias = detectarAnomalias(runs, ["Run Tests"]);

    const tendencia = anomalias.find((a) => a.tipo === "tendencia_crescente");
    expect(tendencia).toBeDefined();
    expect(tendencia!.severidade).toBe("alta"); // >= 60%
    expect(tendencia!.evidencia).toContain("2, 2, 2, 4, 5, 5");
  });

  test("não acusa tendência com poucas execuções (amostra insuficiente)", () => {
    const runs = runsComDuracoes("Run Tests", [1, 5]);
    const anomalias = detectarAnomalias(runs, ["Run Tests"]);
    expect(anomalias.filter((a) => a.tipo === "tendencia_crescente")).toHaveLength(0);
  });

  test("detecta falhas consecutivas do pipeline", () => {
    const runs = runsComDuracoes(
      "Run Tests",
      [3, 3, 3, 3],
      ["success", "failure", "failure", "failure"]
    );
    const anomalias = detectarAnomalias(runs, ["Run Tests"]);
    const recorrentes = anomalias.filter((a) => a.tipo === "falha_recorrente");
    expect(recorrentes.length).toBeGreaterThanOrEqual(1);
    expect(recorrentes[0].severidade).toBe("alta");
  });

  test("falhas alternadas não caracterizam falha recorrente", () => {
    const runs = runsComDuracoes(
      "Run Tests",
      [3, 3, 3, 3],
      ["failure", "success", "failure", "success"]
    );
    const anomalias = detectarAnomalias(runs, ["Run Tests"]);
    expect(anomalias.filter((a) => a.tipo === "falha_recorrente")).toHaveLength(0);
  });
});

describe("Análise de CI — estimativa de risco", () => {
  test("pipeline 100% verde e estável resulta em risco baixo", () => {
    const runs = runsComDuracoes("Run Tests", [3, 3, 3, 3, 3, 3]);
    const risco = estimarRisco(runs, []);

    expect(risco.taxaFalhaHistorica).toBe(0);
    expect(risco.scoreRisco).toBe(0);
    expect(risco.nivel).toBe("baixo");
  });

  test("taxa de falha alta eleva o risco proporcionalmente", () => {
    const runs = runsComDuracoes(
      "Run Tests",
      [3, 3, 3, 3],
      ["failure", "failure", "success", "success"]
    );
    const risco = estimarRisco(runs, []);

    expect(risco.taxaFalhaHistorica).toBe(50);
    expect(risco.scoreRisco).toBe(30); // 0.5 * 60
    expect(risco.nivel).toBe("moderado");
  });

  test("anomalias somam ao score e cada fator é justificado", () => {
    const runs = runsComDuracoes("Run Tests", [2, 2, 2, 4, 5, 5]);
    const anomalias = detectarAnomalias(runs, ["Run Tests"]);
    const risco = estimarRisco(runs, anomalias);

    expect(risco.scoreRisco).toBeGreaterThan(0);
    // Toda contribuição ao score precisa estar explicada em `fatores`
    expect(risco.fatores.length).toBeGreaterThanOrEqual(2);
    expect(risco.fatores.some((f) => f.includes("tendência"))).toBe(true);
  });

  test("score é limitado a 100", () => {
    const runs = runsComDuracoes(
      "Run Tests",
      [1, 2, 3, 4],
      ["failure", "failure", "failure", "failure"]
    );
    const anomalias = detectarAnomalias(runs, ["Run Tests"]);
    const risco = estimarRisco(runs, anomalias);

    expect(risco.scoreRisco).toBeLessThanOrEqual(100);
    expect(risco.nivel).toBe("alto");
  });
});

describe("Análise de CI — validação quantitativa da causa", () => {
  // Dados REAIS coletados dos 12 runs do pipeline (ordem cronológica):
  // nº de testes da suíte × duração da etapa "Run Tests"
  const testesPorRun = [24, 24, 24, 31, 31, 31, 42, 42, 42, 53, 53, 53];
  const duracaoPorRun = [2, 2, 2, 3, 3, 3, 4, 4, 3, 4, 4, 5];

  test("correlação confirma que o crescimento da suíte explica a tendência de duração", () => {
    const r = correlacaoPearson(testesPorRun, duracaoPorRun);
    // Correlação forte (> 0.9) sustenta a hipótese de causa
    expect(r).toBeGreaterThan(0.9);
  });

  test("séries sem relação produzem correlação fraca", () => {
    const ruido = [5, 1, 4, 2, 5, 1, 3, 2, 4, 1, 5, 2];
    const r = correlacaoPearson(testesPorRun, ruido);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  test("série constante não gera correlação espúria (divisão por zero protegida)", () => {
    expect(correlacaoPearson([1, 2, 3], [4, 4, 4])).toBe(0);
  });

  test("regressão projeta a duração para um tamanho futuro de suíte", () => {
    const { inclinacao, projecao } = projetarPorRegressao(testesPorRun, duracaoPorRun, 100);
    expect(inclinacao).toBeGreaterThan(0); // cresce com o nº de testes
    // Com ~0,09 s/teste, 100 testes ficam bem abaixo de qualquer timeout de CI
    expect(projecao).toBeGreaterThan(5);
    expect(projecao).toBeLessThan(15);
  });
});

describe("Análise de CI — extração de logs", () => {
  test("extrai apenas as linhas da etapa pedida, sem prefixos nem cores", () => {
    const log = [
      "Build, Lint & Test\tRun Linter\t2026-08-29T21:15:03.5743245Z > eslint .",
      "Build, Lint & Test\tRun Tests\t2026-08-29T21:15:08.4712242Z > vitest run",
      "Build, Lint & Test\tRun Tests\t2026-08-29T21:15:09.0715388Z Tests  53 passed (53)",
    ].join("\n");

    const linter = extrairLogDaEtapa(log, "Run Linter");
    expect(linter).toBe("> eslint .");

    const tests = extrairLogDaEtapa(log, "Run Tests");
    expect(tests).toContain("> vitest run");
    expect(tests).toContain("Tests  53 passed (53)");
    expect(tests).not.toContain("eslint");
    expect(tests).not.toContain("2026-08-29T"); // timestamp removido
  });

  test("respeita o limite de linhas, mantendo as mais recentes", () => {
    const linhas = Array.from(
      { length: 10 },
      (_, i) => `Job\tRun Tests\t2026-08-29T21:15:0${i}Z linha ${i}`
    ).join("\n");

    const extraido = extrairLogDaEtapa(linhas, "Run Tests", 3);
    expect(extraido.split("\n")).toHaveLength(3);
    expect(extraido).toContain("linha 9");
    expect(extraido).not.toContain("linha 0");
  });
});
