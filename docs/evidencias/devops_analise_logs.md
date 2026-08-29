# DevOps Inteligente — Análise de Logs, Anomalias e Risco de Falha

> Evidência da atividade 5.1 do [PLANO_EXECUCAO.md](../../PLANO_EXECUCAO.md).
> Requisitos do PDF (item 4.8): analisar com IA os logs de **pelo menos duas etapas** do pipeline; **detectar e explicar ao menos uma anomalia**; produzir **estimativa de tendência, risco ou probabilidade de falha** com dados reais e documentados; e **apresentar as evidências e justificar a conclusão**.

---

## 1. Abordagem

A análise combina duas camadas, com uma separação deliberada de responsabilidades:

| Camada                                                                  | Responsabilidade                                                                                                         | Por quê                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Determinística** ([`src/ci_analysis.ts`](../../src/ci_analysis.ts))   | Estatísticas, detecção de anomalias por limiar, correlação e regressão                                                   | Números precisam ser reproduzíveis e testáveis — não podem variar a cada execução |
| **IA** (LLM via [`scripts/analise_ci.ts`](../../scripts/analise_ci.ts)) | Ler os logs brutos das etapas, explicá-los em linguagem natural, interpretar as anomalias e avaliar criticamente o score | É onde o julgamento textual agrega, e onde variação é aceitável                   |

O LLM **não calcula** os indicadores: ele recebe os logs reais e os números já calculados, e produz interpretação. Isso evita que a evidência dependa de aritmética alucinada.

A lógica determinística tem **18 testes automatizados** em [`tests/ci_analysis.test.ts`](../../tests/ci_analysis.test.ts), incluindo casos negativos (série homogênea não gera outlier; falhas alternadas não são "recorrentes"; amostra pequena não gera tendência).

### Reprodução

```bash
npx tsx scripts/analise_ci.ts --limite 12     # coleta real via gh CLI + LLM
npx vitest run tests/ci_analysis.test.ts      # heurísticas
```

## 2. Dados analisados

**12 execuções reais** do workflow `Continuous Integration` (GitHub Actions), de 27 a 29/08/2026, cobrindo as Fases 1 a 4 do projeto. Etapas monitoradas: `Install Dependencies`, `Run Linter`, `Run Build`, `Run Tests`.

| Etapa                | Execuções | Média (s) | Desvio | Mín | Máx   | Tendência |
| -------------------- | --------- | --------- | ------ | --- | ----- | --------- |
| Run Linter           | 12        | 1,92      | 0,28   | 1   | 2     | −8,3%     |
| Run Build            | 12        | 3,00      | 0,41   | 2   | 4     | 0%        |
| **Run Tests**        | 12        | 3,25      | 0,92   | 2   | **5** | **+60%**  |
| Install Dependencies | 12        | 4,50      | 0,87   | 3   | 6     | −13,8%    |

## 3. Explicação dos logs pela IA (duas etapas) — R24

Etapas explicadas: **`Run Linter`** e **`Run Tests`**, a partir dos logs brutos do run `33275655692`. Trechos do relatório gerado:

> **a) Run Linter** — Executou `npm run lint` usando ESLint […]. A execução foi concluída com sucesso, sem mensagens de erro ou aviso nos logs fornecidos.
>
> **b) Run Tests** — Executou uma bateria de testes automatizados, incluindo testes unitários e de integração […]. **10 arquivos de teste passaram, totalizando 53 testes bem-sucedidos.** […] Tempo total de execução: aproximadamente **4.22 segundos**. Logs indicam que testes de retry foram bem-sucedidos, com tempos de resposta transitórios tratados adequadamente. Nenhuma falha ou erro foi reportado.

A IA extraiu corretamente números concretos dos logs (10 arquivos, 53 testes, 4,22 s), sem inventar dados — verificável contra o log original do run.

## 4. Anomalias detectadas — R25

### Anomalia A — Tendência crescente na duração dos testes (severidade ALTA)

```
• [ALTA] tendencia_crescente em "Run Tests"
  Duração de "Run Tests" cresceu 60% entre a primeira e a segunda metade das execuções.
  evidência: série cronológica: [2, 2, 2, 3, 3, 3, 4, 4, 3, 4, 4, 5] (min 2s, max 5s)
```

**Hipótese da IA:** _"possível aumento na complexidade dos testes, maior carga de dados, ou problemas de desempenho na infraestrutura […]. Pode também refletir mudanças recentes no código que impactaram a performance."_

A IA ofereceu três causas plausíveis mas **não distinguiu entre elas** — e a distinção importa: crescimento da suíte é saudável, degradação de infraestrutura não é. Por isso a hipótese foi testada quantitativamente (§6).

### Anomalia B — Outlier de duração no build (severidade MÉDIA)

```
• [MEDIA] outlier_duracao em "Run Build"
  Duração de 4s em "Run Build" está 2.4 desvios-padrão acima da média (3s).
  evidência: run 33274611454 (develop) — série: [3, 3, 3, 3, 3, 3, 3, 4, 2, 3, 3, 3]
```

**Interpretação da IA:** _"possível sobrecarga temporária na infraestrutura de build […]. Como é um outlier isolado, não indica problema recorrente, mas merece monitoramento."_

**Concordo com a avaliação.** A série do build é plana (desvio 0,41 s) e o pico de 4 s é isolado, sem correlação com mudança de código — a variação é compatível com ruído de infraestrutura de runner compartilhado. O caso ilustra uma limitação conhecida do z-score em séries de baixa variância: com desvio pequeno, **1 segundo de ruído** já ultrapassa 2 desvios. Registrado como falso-positivo aceitável do limiar atual.

### Anomalia C — Ponto cego histórico do pipeline (detectada fora da janela analisada)

A anomalia mais grave do projeto **não aparece** nos dados acima, e é justamente por isso que merece registro:

Até 27/08/2026, o workflow disparava apenas em `main` (`on: push/pull_request: branches: [main]`). Como todo o desenvolvimento das fases ocorre em `develop` e `feature/*`, **o pipeline não validava nada do trabalho em andamento**. A consequência foi concreta: **8 testes quebrados** por datas fixas (`"2026-08-15"`, que se tornou passado) permaneceram invisíveis até serem descobertos manualmente na atividade 1.1.

| Evidência                     |                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Correção do escopo do CI      | commit `8785ce3` — _"ci: rodar pipeline tambem em develop e PRs para develop"_ (27/08/2026)              |
| Correção dos testes quebrados | commit `a2f39f4` — _"test: corrigir datas fixas obsoletas para datas relativas ao runtime"_ (27/08/2026) |

**Lição registrada:** um pipeline 100% verde é um sinal enganoso se o gatilho não cobre onde o código realmente evolui. O histórico de sucessos anterior a 27/08 mede apenas os merges em `main`, não a saúde do desenvolvimento.

## 5. Estimativa de risco de falha — R26

```
ESTIMATIVA DE RISCO DE FALHA DO PIPELINE
score: 20/100  |  nível: BAIXO
taxa de falha histórica: 0%
  - taxa de falha histórica 0.0% (0/12 execuções) → +0.0
  - 1 etapa(s) com tendência de duração crescente → +15.0
  - 1 outlier(s) de duração → +5.0
limiares: {"zScoreOutlier":2,"tendenciaCrescentePct":30,"falhasRecorrentes":2}
```

**Modelo de score** (0–100), com cada contribuição explicitada:

| Fator                          | Peso                        | Racional                                 |
| ------------------------------ | --------------------------- | ---------------------------------------- |
| Taxa de falha histórica        | até +60                     | Sinal mais direto de instabilidade       |
| Tendência de duração crescente | +15 por etapa (teto 25)     | Não falha hoje, mas caminha para timeout |
| Outlier de duração             | +5 por ocorrência (teto 15) | Ruído pontual, sinal fraco               |
| Falhas consecutivas            | +20                         | Indica quebra sistemática, não flutuação |

Faixas: **baixo** < 30 · **moderado** 30–59 · **alto** ≥ 60.

**Avaliação da IA sobre o score:** _"O score parece adequado, pois o risco geral permanece baixo devido à ausência de falhas anteriores e ao fato de as anomalias serem pontuais e controláveis. Ainda assim, a tendência crescente nos testes deve ser monitorada."_

**Ressalva importante:** o fator de taxa de falha contribuiu 0 porque as 12 execuções foram bem-sucedidas — mas, à luz da Anomalia C, esse 0% descreve uma janela em que o CI passou boa parte do tempo sem cobrir as branches de trabalho. O score é honesto quanto aos dados que tem; a leitura crítica cabe ao engenheiro.

## 6. Validação quantitativa da causa e projeção de tendência — R27

Para decidir entre as causas que a IA levantou, cruzei a duração da etapa `Run Tests` com o **tamanho da suíte em cada run**, extraído dos próprios logs (`Tests N passed`):

| Run                                     | Fase                | Testes | Duração         |
| --------------------------------------- | ------------------- | ------ | --------------- |
| 33124119745 / 33124212426 / 33124294401 | 1 — paralelização   | 24     | 2 s · 2 s · 2 s |
| 33125814420 / 33125863668 / 33125921532 | 2 — governança      | 31     | 3 s · 3 s · 3 s |
| 33274577476 / 33274611454 / 33274662280 | 3 — observabilidade | 42     | 4 s · 4 s · 3 s |
| 33275570653 / 33275602798 / 33275655692 | 4 — QA inteligente  | 53     | 4 s · 4 s · 5 s |

**Resultados** (funções `correlacaoPearson` e `projetarPorRegressao`, ambas testadas):

- **Correlação de Pearson: r = 0,913** — correlação forte entre número de testes e duração.
- **Regressão linear: 0,0766 s por teste** (≈ 0,77 s a cada 10 testes), intercepto 0,376 s.
- **Projeções:** 100 testes → **~8 s** · 200 testes → **~15,7 s**.

### Conclusão justificada

A tendência de +60% **não é degradação**: é o efeito esperado do crescimento da suíte de 24 para 53 testes (+121%) ao longo das Fases 1–4. A correlação de 0,913 sustenta essa causa e afasta as outras duas hipóteses da IA — não há sinal de perda de performance por teste (o custo marginal permaneceu estável em ~0,077 s) nem de degradação de infraestrutura (as demais etapas ficaram planas ou caíram: Linter −8,3%, Build 0%, Install −13,8%; uma degradação de runner as afetaria também).

**Risco futuro:** desprezível no horizonte previsível. Mesmo dobrando a suíte para ~100 testes, a etapa levaria ~8 s — muito abaixo de qualquer limite operacional. O gatilho para reavaliar seria o **custo marginal por teste subir**, não a duração total crescer. Recomendação registrada: monitorar `inclinação` (s/teste), não o valor absoluto.

## 7. Mapeamento dos requisitos

| Requisito                                                | Onde está atendido                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **R24** — IA explica logs de ≥ 2 etapas                  | §3 — `Run Linter` e `Run Tests`, com números verificáveis contra o log original                                                   |
| **R25** — detectar e explicar ≥ 1 anomalia               | §4 — três anomalias: tendência (alta), outlier (média, avaliado como falso-positivo do limiar) e ponto cego histórico do pipeline |
| **R26** — estimativa de tendência/risco com dados reais  | §5 — score 20/100 com fatores explicitados; §6 — projeção por regressão sobre 12 runs reais                                       |
| **R27** — apresentar evidências e justificar a conclusão | §6 — hipótese da IA testada por correlação (r = 0,913), hipóteses alternativas descartadas com evidência das demais etapas        |
