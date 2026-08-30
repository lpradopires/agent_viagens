# Plano de Execução — Projeto Avaliativo Final (M2S08)

> Baseado em [docs/analise_requisitos_projeto_final.md](docs/analise_requisitos_projeto_final.md).
> Regra de trabalho: **uma atividade por vez**, na ordem abaixo. Cada atividade só começa depois que a anterior for concluída, testada e commitada. Status é atualizado ao final de cada atividade.
> Convenção: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.

---

## Como usar este plano

- Cada atividade tem: objetivo, requisito(s) do PDF que resolve, branch sugerida, arquivos/entregáveis esperados e critério de pronto ("Definição de Pronto").
- Ao terminar uma atividade: rodar `npm run lint && npm run build && npm test`, commitar com Conventional Commits, abrir/atualizar o card correspondente no Kanban, marcar `[x]` aqui.
- A ordem respeita dependências reais (ex.: não dá pra documentar observabilidade antes de implementá-la; não dá pra escrever o README final antes das features existirem).

---

## Histórico retroativo no Kanban

Além dos 16 cards das atividades futuras (Fases 0–9 abaixo), o Kanban recebeu **10 cards `HIST.*`** representando o que já foi implementado no mini-projeto antes deste plano existir — todos na coluna **Concluído**, cada um com descrição, objetivo, resultado obtido e commits/arquivos como evidência:

| Card    | Tema (referência do PDF)                        | Commits principais                                       |
| ------- | ----------------------------------------------- | -------------------------------------------------------- |
| HIST.1  | Definição do problema, escopo e arquitetura     | `4c51185`, `c673e6c`, `3fab469`/`0c5c5ff`/`2332d96`      |
| HIST.2  | Implementação do fluxo com LangGraph            | `490f1f2`, `953abe0`, `4893d80`, `c1e8766`               |
| HIST.3  | Memória, contexto ou RAG (checkpointer)         | `490f1f2`                                                |
| HIST.4  | Desenvolvimento da tool e integração (GeckoAPI) | `7dbf95f`, `9b16724`, `d0cde92`, `9e5d796`, `250d494`    |
| HIST.5  | Desenvolvimento da tool e integração (Duffel)   | `53f3f65`, `5649123`                                     |
| HIST.6  | Segurança e tratamento de entradas (parcial)    | `9e5d796`, `78af003`                                     |
| HIST.7  | Análise de código e testes (Vitest)             | `91fcaef`, `00cf6ac`, `737e43d`                          |
| HIST.8  | Configuração do pipeline (CI)                   | `91fcaef`                                                |
| HIST.9  | Formato do sistema (interface web + API REST)   | `60832db`                                                |
| HIST.10 | Documentação (README, prompts, walkthrough)     | `6bd2b23`, `1eecc36`, `5649123`, `9acf0b8`, entre outros |

Cada card `HIST.*` também registra explicitamente **o que ainda falta** naquele tema (ex.: HIST.6 aponta que governança/prompt injection continuam pendentes nas atividades 2.1/2.2), garantindo coerência entre o histórico e o plano futuro.

Board: https://github.com/users/lpradopires/projects/10/views/1

---

## Fase 0 — Fundação de repositório e organização

### 0.1 — Criar estrutura de branches e pastas de documentação

- [x] Status: concluído
- **Requisitos:** R36, R37 (branches `main`/`develop`/`feature/*`, `/docs/qa`, `/docs/evidencias`)
- **Branch:** trabalhar direto, cria a própria estrutura
- **Kanban:** https://github.com/users/lpradopires/projects/10/views/1 — "Projeto Avaliativo M2S08"
- **Ações:**
  - [x] Criar branch `develop` a partir de `main` e publicar em `origin/develop`
  - [x] Criar pastas `docs/qa/.gitkeep` e `docs/evidencias/.gitkeep`
  - [x] Commitar (`docs: adicionar analise de requisitos e plano de execucao do projeto final`)
  - [x] Criar `GitHub Project` (Kanban) com colunas Backlog / A Fazer / Em Andamento / Bloqueado / Em Revisão / Concluído
  - [x] Criar um card por atividade deste plano (16 cards, `0.1` em Em Andamento, `1.1` em A Fazer, demais em Backlog)
  - **Nota:** por decisão do usuário, a adição do professor como colaborador foi movida para a **Fase 8.2** (última etapa antes do merge final / submissão), em vez de agora.
- **Definição de Pronto:** branch `develop` existe; pastas criadas; Kanban criado e populado com os cards deste plano. ✅ (Colaborador tratado na Fase 8.2.)

---

## Fase 1 — Arquitetura agêntica (LangGraph)

### 1.1 — Paralelização real no grafo (fan-out/fan-in voo + hotel)

- [x] Status: concluído
- **Requisitos:** R6 (ramificação condicional + paralelização simples) ✅
- **Branch:** `feature/langgraph-paralelizacao` (mesclada em `develop` via PR [#1](https://github.com/lpradopires/agent_viagens/pull/1))
- **Ações:**
  - [x] Separar o node `tools` em dois nodes (`tools_voos`, `tools_hoteis`) — implementados como funções próprias (não `ToolNode` genérico), pois o `ToolNode` embutido processa **todas** as tool_calls da última mensagem sem filtrar por categoria, o que geraria respostas duplicadas/erros ao rodar dois `ToolNode` em paralelo sobre a mesma mensagem
  - [x] `routeAgent` retorna `string[]` (fan-out nativo do LangGraph.js) — quando o modelo pede voo e hotel na mesma resposta, ambos os nodes disparam simultaneamente
  - [x] Ambos convergem de volta em `filter` (fan-in)
  - [x] Novo teste em `tests/agent.test.ts` comprovando 2 `ToolMessage`s distintos (voo + hotel) na mesma rodada
  - [x] Efeito colateral descoberto e corrigido: CI só rodava em `main`, não validava PRs para `develop` — corrigido em `.github/workflows/ci.yml`
  - [x] Efeito colateral descoberto e corrigido: datas fixas nos testes (`"2026-08-15"`) haviam virado passado com o avanço do tempo, quebrando 8 testes pré-existentes (não regressão desta atividade, confirmado via `git stash`) — corrigido com `tests/helpers/dates.ts`
- **Definição de Pronto:** ✅ teste automatizado comprova que voo e hotel são buscados na mesma rodada de execução, passando por dois nodes de tool distintos; `npm run lint && npm run build && npm test` verdes (24/24); PR mesclado em `develop`; branch remota deletada.
- **Nota para a Atividade 4.1 (revisão de diff por IA):** este é o diff candidato natural — o pre-existing bug em `filterDataNode` (categoriza resultados por `msg.name?.includes("voos"/"hoteis")`, que não bate com os nomes das tools Duffel como `search_hotels_by_location`) não foi corrigido aqui por estar fora do escopo desta atividade, mas é um bom achado para a revisão de código assistida por IA.

---

## Fase 2 — Segurança e governança

### 2.1 — Limites de autonomia + ação simulada com aprovação humana

- [x] Status: concluído
- **Requisitos:** R10, R15 ✅
- **Branch:** `feature/governanca` (PR aberto ao final da 2.2, que usa a mesma branch)
- **Ações:**
  - [x] Tool `confirmar_reserva` em `src/reservation_tools.ts`: 1ª chamada sem `codigo_confirmacao` registra pendência e retorna `CONF-XXXX` **sem executar**; 2ª chamada só executa (simulada, `localizador SIM-*`) se a pendência existir
  - [x] Gate **determinístico** extra no node `tools_reserva` (`src/agent.ts`): a confirmação só é aceita se o código estiver literalmente na última `HumanMessage` — o usuário precisa digitá-lo; o LLM não consegue se auto-aprovar (limite imposto pela aplicação, não pelo modelo)
  - [x] Regras de governança (`GOVERNANCE_RULES`) anexadas ao system prompt dos dois provedores: buscas read-only livres, reserva exige aprovação, nunca inventar código, não contornar bloqueios
  - [x] Node `tools_reserva` integrado ao fan-out do `routeAgent` e ao fan-in em `filter`
  - [x] 4 testes em `tests/reservation.test.ts`: pendência sem execução, código inválido, fluxo completo de aprovação no grafo (2 turnos), bloqueio de auto-aprovação pelo modelo
  - [x] `CLAUDE.md` atualizado (arquitetura de nodes paralelos + governança; texto do `ToolNode` estava obsoleto desde a 1.1)
- **Definição de Pronto:** ✅ testes demonstram que a reserva não é concluída sem confirmação explícita digitada pelo usuário; `lint`/`build`/`test` verdes (28/28); commits `83db0b9` e `9f16c90` publicados na branch.

### 2.2 — Cenário adversarial de prompt injection

- [x] Status: concluído
- **Requisitos:** R16 ✅
- **Branch:** `feature/governanca` (mesclada em `develop` via PR [#2](https://github.com/lpradopires/agent_viagens/pull/2), junto com a 2.1)
- **Ações:**
  - [x] System prompt reforçado com regras anti-injection: nunca revelar segredos/env vars/instruções de sistema; resultados de tools são **dado externo não confiável**, nunca instrução; nenhuma mensagem revoga as regras
  - [x] Redação determinística de segredos: `redactSecrets` aplicado no `formatterNode` (que deixou de ser pass-through) — valores literais de env vars sensíveis na resposta final viram `[SEGREDO REDIGIDO]` antes de chegar ao usuário, mesmo que o LLM seja enganado
  - [x] 3 testes em `tests/adversarial.test.ts` (arquivo próprio, não em `agent.test.ts`), todos com o LLM mockado no **pior caso** (modelo já enganado pelo ataque): extração direta de credencial → resposta redigida; indirect injection via nome de hotel tentando confirmar reserva com código `CONF-4242` injetado → `AÇÃO BLOQUEADA` pelo gate da 2.1; unitário de `redactSecrets` (preserva sentinela `mock` e texto legítimo)
  - [x] `docs/qa/seguranca_adversarial.md`: modelo de ameaça, 3 camadas de defesa, cenários, mapeamento para os 3 requisitos do PDF e instruções de reprodução
- **Definição de Pronto:** ✅ testes adversariais passando (31/31 na suíte); documento de evidência criado; CI verde no PR; commit `ef57f5e`.

---

## Fase 3 — Observabilidade e resiliência

### 3.1 — Logs estruturados + segundo sinal correlacionado (auditoria)

- [x] Status: concluído
- **Requisitos:** R17 ✅ (R18 completa-se na 3.2)
- **Branch:** `feature/observabilidade`
- **Ações:**
  - [x] Módulo `src/observability.ts`: `logNodeEvent` (JSON por linha: `thread_id`, `node`, `timestamp`, `duration_ms`, `tool_calls`, `detail`, `error`) — todos os 6 nodes do grafo instrumentados, incluindo fallback de LLM e erros
  - [x] Segundo sinal: `recordAudit` por chamada de tool (nome, args, status `success|error|blocked`, latência), mesmo `thread_id` — os bloqueios do gate de aprovação humana entram como `blocked` (trilha auditável de governança)
  - [x] Buffer em memória + espelho JSONL (`logs/agent.jsonl`, `logs/audit.jsonl`, desativado em NODE_ENV=test; `logs/` no `.gitignore`); falha de escrita de log nunca derruba a aplicação
  - [x] Consulta: `GET /api/debug/:thread_id` no `server.ts` retorna `execution_log` + `audit_trail` da sessão
  - [x] 4 testes em `tests/observability.test.ts` + smoke test manual do sink de arquivo
- **Definição de Pronto:** ✅ dois sinais correlacionáveis pelo `thread_id` em execução real; 35/35 testes verdes; commit `bdd78bd`.

### 3.2 — Investigar e documentar uma execução real

- [x] Status: concluído
- **Requisitos:** R18 ✅
- **Branch:** `feature/observabilidade` (mesclada via PR [#3](https://github.com/lpradopires/agent_viagens/pull/3))
- **Ações:**
  - [x] Execução **real** (LLM OpenAI `gpt-4.1-nano` do `.env` + Duffel em modo mock local): fluxo principal voo+hotel SP→Rio e cenário de falha (data no passado) — script reproduzível em `scripts/evidencia_observabilidade.ts`
  - [x] `docs/evidencias/observabilidade.md`: fluxo de 4 iterações reconstruído node a node (Sinal 1), decisões do modelo auditadas — escolha GRU/GIG, coordenadas autônomas, check-out calculado (Sinal 2), correlação por thread_id/timestamps, perfil de latência (LLM ≈7,5s vs tools <10ms), erro de validação barrado localmente (`duration_ms: 0`)
  - [x] **Achado real da investigação:** contradição entre os sinais (auditoria `success` × filter `voos=0 hoteis=0`) confirmou em execução real o bug do `filterDataNode` com nomes Duffel — insumo registrado para as atividades 4.1 e 5.1
- **Definição de Pronto:** ✅ documento com reconstrução passo a passo citando os JSONs reais dos dois sinais; commit `21f9e75`.

### 3.3 — Resiliência: retry limitado + fallback formalizados

- [x] Status: concluído
- **Requisitos:** R19 ✅
- **Branch:** `feature/observabilidade` (mesclada via PR [#3](https://github.com/lpradopires/agent_viagens/pull/3))
- **Ações:**
  - [x] `src/retry.ts`: `withRetry` (2 tentativas extras, backoff exponencial) + `isTransientError` — retry só para falhas transitórias (rede, timeout/abort, 5xx, 429); 4xx/validação/MCP propagam imediatamente
  - [x] `GeckoApiClient`: miolo HTTP em `withRetry`, timeout de 35s recriado por tentativa
  - [x] `DuffelApiClient`: padrão fetch/ok/json dos 5 métodos unificado no helper `httpRequest` com retry
  - [x] Fallback amigável preservado na camada de tools (mensagem legível após esgotar tentativas)
  - [x] 7 testes em `tests/retry.test.ts` (unitários do helper + recuperação real nos dois clients + fallback na tool)
- **Definição de Pronto:** ✅ testes comprovam retry + fallback em falha simulada; 42/42 verdes; commit `784be21`; CI verde no PR.

---

## Fase 4 — IA para QA

### 4.1 — Revisão de código por IA em um diff real

- [x] Status: concluído
- **Requisitos:** R20 ✅
- **Branch:** `feature/qa-inteligente` (mesclada via PR [#4](https://github.com/lpradopires/agent_viagens/pull/4))
- **Ações:**
  - [x] Alvo escolhido: o diff acumulado `main...develop` (24 commits, ~2000 linhas das Fases 1–3) — mais rico que o diff isolado da 1.1, pois cobre também governança e observabilidade
  - [x] Revisão assistida por IA em esforço `high`, com **probes executando o grafo real** para confirmar os achados antes de reportá-los
  - [x] **10 problemas encontrados** — 8 corrigidos (5 P0 + 3 P1), 2 aceitos como dívida registrada
  - [x] Correções aplicadas com testes de regressão (ver 4.2), incluindo o bug do `filterDataNode` que a observabilidade da 3.2 já havia detectado, e remoção do `activeTools` (código morto)
  - [x] `docs/qa/code_review_ia.md`: achados por severidade, correções, decisões e análise crítica do uso de IA
- **Achado mais relevante:** 3 dos 5 P0 furavam garantias que o **próprio projeto** havia construído nas Fases 2 e 3 (isolamento de sessão na reserva, gate de aprovação vs. mensagem de recusa, redação de segredos em conteúdo em blocos) — com a suíte de testes verde o tempo todo.
- **Definição de Pronto:** ✅ documento com a revisão de um diff real e o que foi aplicado ou não; 53/53 testes; CI verde.

### 4.2 — Teste gerado/refinado por IA com priorização por risco

- [x] Status: concluído
- **Requisitos:** R21, R22 ✅
- **Branch:** `feature/qa-inteligente` (mesma branch da 4.1)
- **Ações:**
  - [x] 11 testes em `tests/regressao_code_review.test.ts`, organizados em blocos que declaram o risco no nome (P0 integridade de sessão / P0 governança / P0 vazamento / P1 resiliência) — **todos derivados de defeitos reais**, não de cobertura especulativa
  - [x] **Cenário prioritário nº 1:** reserva confirmada sem aprovação humana legítima — única ação irreversível do domínio, impacto máximo, sem recuperabilidade, com **dois caminhos de burla reproduzidos**
  - [x] **Cenário prioritário nº 2:** sessão permanentemente inutilizada por `tool_call` órfã — falha persistente no checkpointer, probabilidade média-alta
  - [x] Tipos exigidos pelo PDF cobertos: **integração** no grafo LangGraph completo (`travelAgentGraph.invoke`) e **integração de API** (Express via supertest), além de unitários
  - [x] `docs/qa/priorizacao_testes.md`: critério risco = probabilidade × impacto, justificativa dos cenários, mapa dos testes e o que ficou conscientemente de fora
- **Nota:** o cenário paralelo voo+hotel previsto originalmente já estava coberto desde a atividade 1.1; a priorização por risco redirecionou o esforço para os defeitos que a revisão expôs, que eram mais críticos.
- **Definição de Pronto:** ✅ testes passando (suíte 42 → **53**); justificativa de priorização documentada.

---

## Fase 5 — DevOps inteligente

### 5.1 — IA explicando logs do CI + detecção de anomalia + tendência de risco

- [x] Status: concluído
- **Requisitos:** R24, R25, R26, R27 ✅
- **Branch:** `feature/devops-anomalias` (mesclada via PR [#5](https://github.com/lpradopires/agent_viagens/pull/5))
- **Arquitetura da solução:** duas camadas com separação deliberada — `src/ci_analysis.ts` (**determinística**: estatísticas, anomalias por limiar, correlação de Pearson, regressão; 18 testes) e `scripts/analise_ci.ts` (**IA**: lê os logs brutos, explica em linguagem natural, interpreta anomalias). O LLM não calcula os indicadores, apenas os interpreta — a evidência não depende de aritmética alucinada.
- **Ações:**
  - [x] Coleta real de 12 execuções do CI (Fases 1–4) via `gh` CLI, com duração por etapa
  - [x] **R24** — IA explicou os logs de duas etapas (`Run Linter` e `Run Tests`), extraindo números verificáveis contra o log original (10 arquivos, 53 testes, 4,22 s)
  - [x] **R25** — três anomalias detectadas e explicadas: tendência de +60% em `Run Tests` (ALTA); outlier de 2,4 desvios no `Run Build` (MÉDIA, avaliado criticamente como **falso-positivo** do z-score em série de baixa variância); e o **ponto cego histórico do pipeline** — o CI só disparava em `main` até 27/08, e foi por isso que 8 testes quebrados por datas fixas passaram despercebidos até a atividade 1.1 (commits `8785ce3` e `a2f39f4`)
  - [x] **R26** — score de risco 20/100 (BAIXO) com cada fator e limiar explicitados
  - [x] **R27** — a IA levantou três hipóteses para a tendência sem distinguir entre elas; a causa foi **validada quantitativamente** cruzando a duração com o tamanho da suíte extraído dos próprios logs (24→31→42→53 testes): **Pearson r = 0,913**, custo marginal estável em 0,0766 s/teste e demais etapas planas ou em queda — confirma crescimento da suíte, não degradação. Projeção: 100 testes → ~8 s
  - [x] `docs/evidencias/devops_analise_logs.md` + saída bruta da execução real
- **Definição de Pronto:** ✅ logs de 2 etapas explicados pela IA, anomalias explicadas, estimativa de risco justificada com evidência quantitativa; suíte 53 → **71** testes; CI verde.

---

## Fase 6 — Low-code / no-code

### 6.1 — Automação n8n integrada à aplicação

- [x] Status: concluído (resta apenas a captura de tela da UI — ver nota)
- **Requisitos:** R28, R29, R30 ✅
- **Branch:** `feature/low-code` (mesclada via PR [#6](https://github.com/lpradopires/agent_viagens/pull/6))
- **Ações:**
  - [x] Fluxo `automations/n8n/monitor-precos-viagem.json` (8 nós): **dois gatilhos** (Schedule cron 9h + Webhook manual) → `POST /api/chat` → `POST /api/monitor/avaliar` → `IF` → `POST /api/alertas`
  - [x] Novos endpoints como contrato do n8n: `/api/monitor/avaliar` (regra de preço) e `/api/alertas` (POST registra, GET expõe a saída observável)
  - [x] **Divisão de responsabilidades**: busca, extração de preços e regra de limite ficam na **aplicação** (testadas); o n8n só agenda, integra e roteia. A regra de negócio ficou deliberadamente fora de um nó _Code_ do n8n — lá dentro não teria teste nem versionamento revisável
  - [x] `scripts/simular_fluxo_n8n.ts`: dispara a **mesma sequência HTTP dos nós** contra o servidor real, validando o contrato sem depender da UI. Execução real com LLM real registrada (LATAM R$ 550 / Azul R$ 620 → mínimo 550 < limite 600 → alerta registrado e visível)
  - [x] 14 testes em `tests/alerts.test.ts` (extração em 4 formatos de preço, regra com borda de igualdade, registro/filtro, contrato HTTP)
  - [x] Instruções de reprodução no **README.md** (exigência explícita do item 4.9) + `docs/evidencias/low_code_flow/`
- **⚠️ Nota — pendência de ambiente:** a captura de tela da interface do n8n exige subir o serviço localmente. `npx n8n` falhou nesta máquina (`isolated-vm` não compila com Python 3.12+, que removeu o `distutils`) e o daemon do Docker está parado. Caminho recomendado documentado no README (Docker). O JSON, os endpoints e o contrato já estão prontos e validados — falta só o registro visual.
- **Definição de Pronto:** ✅ fluxo funcional com saída observável real comprovada por execução ponta a ponta; evidências salvas; suíte 71 → **85** testes.

---

## Fase 7 — Prompts e refinamento

### 7.1 — Documentar system prompt e ciclo de refinamento

- [x] Status: concluído
- **Requisitos:** R31, R33 ✅
- **Branch:** `docs/prompts-refinamento` (mesclada via PR [#7](https://github.com/lpradopires/agent_viagens/pull/7))
- **Ações:**
  - [x] `docs/prompts/system_prompt.md`: estrutura do prompt (identidade + data injetada dinamicamente, diretrizes por provedor, `GOVERNANCE_RULES` compartilhadas), objetivo, as 8 regras da variante GeckoAPI e 6 da Duffel, limites de autonomia, regras anti prompt-injection, padrões de resposta e configuração do modelo por variável de ambiente
  - [x] **Seção central** — "o que o prompt não garante sozinho": cada regra crítica mapeada para a contraparte determinística que a sustenta (`redactSecrets`, gate de aprovação, `recursionLimit`, schemas Zod, node `tools_desconhecida`). Padrão consolidado: _o prompt orienta o desejado; a aplicação impõe o obrigatório; os testes provam que a imposição funciona_
  - [x] `docs/prompts/ciclo_refinamento.md`: o PDF pede **um** ciclo — documentados **seis**, todos reais e rastreáveis por commit (placeholders `9ff9134`; erro de validação `78af003`; loops `4893d80`+`953abe0`; aeroporto comercial `acfe639`; gate aceitando recusa e redação sem cobrir blocos, ambos vindos do code review da Fase 4)
  - [x] Síntese da evolução: de "instruir melhor o modelo" (ciclos 1–2) → "instrução + limite técnico" (3–4) → "verificar as garantias adversarialmente" (5–6). No ciclo 5 o modelo **obedeceu corretamente** — a regra é que estava mal especificada
  - [x] README de `docs/prompts/` reescrito separando prompts de **produção** (do agente) de prompts de **desenvolvimento** (histórico), com links relativos corrigidos (os antigos `file:///` não funcionavam no GitHub)
- **Definição de Pronto:** ✅ os dois documentos criados e coerentes com o código atual (pós Fases 1–6); links internos validados; 85/85 testes; CI verde.

---

## Fase 8 — Consolidação final

### 8.1 — Reescrever o README para o template do projeto final

- [x] Status: concluído
- **Requisitos:** R1, R2, R3, R4, R35 ✅
- **Branch:** `docs/readme-final` (mesclada via PR [#8](https://github.com/lpradopires/agent_viagens/pull/8))
- **Ações:**
  - [x] README reescrito do zero com as **10 seções** do roteiro 5.2 e índice navegável (o anterior ainda documentava o mini-projeto, com a numeração "Requisito 5/6/7/8")
  - [x] Descrição: problema, público, entradas/saídas/**limites**, valor entregue e tabela **mantido / refatorado / adicionado** em relação ao mini-projeto
  - [x] Classificação explícita como **sistema híbrido**, justificada componente a componente — _o modelo decide o que fazer; a aplicação decide o que é permitido_ — com diagrama Mermaid mostrando fan-out paralelo, os 4 nodes de tool e os sinais de observabilidade
  - [x] Tools/integrações, contexto/memória (**incluindo por que NÃO se usou RAG** neste domínio), segurança/autonomia (4 garantias determinísticas + 3 camadas anti-injection), instalação/execução com tabela completa de env vars
  - [x] QA/observabilidade/DevOps/low-code, linkando as evidências das fases anteriores
  - [x] Dois cenários de uso: **principal** (saída real do agente) e **risco** (injection indireta bloqueada pelo gate, com a auditoria correspondente)
  - [x] Análise crítica: o refinamento do gate que aceitava recusa como consentimento, **7 limitações** e **6 evoluções** possíveis
  - [x] Links internos e âncoras validados; nenhuma credencial exposta
- **Definição de Pronto:** ✅ README cobre todos os itens do roteiro 5.2. Placeholder do link do vídeo a ser preenchido na atividade 9.1.

### 8.2 — Merge final em `develop` → `main`

- [~] Status: quase concluído — **falta apenas adicionar o professor** (aguardando o username)
- **Requisitos:** R37
- **Ações:**
  - [x] Revisadas todas as branches mescladas em `develop` — **8 PRs**, todos com CI verde: #1 paralelização · #2 governança · #3 observabilidade · #4 QA inteligente · #5 DevOps · #6 low-code · #7 prompts · #8 README
  - [x] Kanban atualizado (26 cards: 10 históricos + 16 de atividade, refletindo o desenvolvimento real)
  - [x] **Merge final `develop` → `main`** via PR [#9](https://github.com/lpradopires/agent_viagens/pull/9) — commit `57de59e`; branches `main` e `develop` sincronizadas
  - [x] Verificação de segredos: varredura por padrão de token em **todo o histórico** (`git log --all -p`) → **0 ocorrências**; apenas `.env.example` versionado
  - [x] Suíte verificada na própria `main`: **85/85 testes**, lint e build limpos
  - [ ] **Adicionar o professor como colaborador** — pendente do username do GitHub. Comando pronto: `gh repo add-collaborator lpradopires/agent_viagens <username>`
- **Definição de Pronto:** `main` contém a versão final e funcional ✅; Kanban refletindo o estado real ✅; professor com acesso de colaborador ⏳.

---

## Fase 9 — Vídeo e submissão

### 9.1 — Gravar e publicar o vídeo de demonstração

- [ ] Status: pendente
- **Requisitos:** R38
- **Ações:**
  - Seguir o roteiro sugerido na seção 5.5 do PDF (problema/classificação → arquitetura → 2 cenários → segurança/aprovação → QA → pipeline/anomalia/tendência → low-code → limitações), até 10 min (máx. 12 min)
  - Publicar no YouTube como não listado
  - Adicionar o link no README (fechando o placeholder da 8.1)
- **Definição de Pronto:** vídeo publicado, link funcional no README.

### 9.2 — Submissão final no AVA

- [ ] Status: pendente
- **Ações:**
  - Confirmar links do repositório, quadro Kanban e vídeo
  - Submeter na atividade "Projeto Avaliativo – M2.2" antes de 31/08/26 às 15h
  - Não alterar o repositório após o prazo
- **Definição de Pronto:** submissão feita no AVA com os três links corretos.

---

## Próximo passo

Começar pela **Atividade 0.1** (fundação de repositório e organização), pois todas as demais dependem da branch `develop` existir e da estrutura de pastas estar pronta para receber as evidências.
