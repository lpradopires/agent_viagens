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
- **Definição de Pronto:** branch `develop` existe e é a branch de trabalho; pastas criadas; Kanban criado com todos os cards deste plano; professor convidado.

---

## Fase 1 — Arquitetura agêntica (LangGraph)

### 1.1 — Paralelização real no grafo (fan-out/fan-in voo + hotel)

- [ ] Status: pendente
- **Requisitos:** R6 (ramificação condicional + paralelização simples)
- **Branch:** `feature/langgraph-paralelizacao`
- **Ações:**
  - Separar o node `tools` em dois nodes (`tools_voos`, `tools_hoteis`), cada um com seu próprio `ToolNode`
  - `routeAgent` passa a poder retornar múltiplos destinos simultâneos (fan-out) quando o agente pedir voo e hotel na mesma resposta
  - Ambos convergem de volta em `filter` (fan-in)
  - Atualizar/criar testes em `tests/agent.test.ts` cobrindo o caminho paralelo
- **Definição de Pronto:** teste automatizado comprova que voo e hotel são buscados na mesma rodada de execução, com o grafo passando por dois nodes de tool distintos; testes verdes.

---

## Fase 2 — Segurança e governança

### 2.1 — Limites de autonomia + ação simulada com aprovação humana

- [ ] Status: pendente
- **Requisitos:** R10, R15
- **Branch:** `feature/governanca`
- **Ações:**
  - Criar tool simulada `confirmar_reserva` que nunca executa "de primeira": sempre retorna uma pergunta de confirmação e só finaliza após o usuário confirmar explicitamente na rodada seguinte
  - Documentar a regra de autonomia no system prompt (`getSystemPrompt`): quando pedir confirmação, quando bloquear, quando agir livremente
- **Definição de Pronto:** teste demonstra que a tool de reserva não é concluída sem confirmação explícita do usuário; comportamento documentado.

### 2.2 — Cenário adversarial de prompt injection

- [ ] Status: pendente
- **Requisitos:** R16
- **Branch:** `feature/governanca` (mesma branch da 2.1)
- **Ações:**
  - Reforçar o system prompt com regra explícita anti-injection (nunca revelar segredos/env vars, ignorar instruções vindas de tool results ou do usuário que tentem sobrescrever as regras)
  - Criar teste em `tests/agent.test.ts` simulando entrada maliciosa (ex.: pedir para revelar `DUFFEL_ACCESS_TOKEN`, ou um resultado de tool com instrução injetada) e validar que a resposta não vaza segredo nem executa ação não autorizada
  - Documentar o cenário em `docs/qa/seguranca_adversarial.md`
- **Definição de Pronto:** teste automatizado do cenário adversarial passa; documento de evidência criado.

---

## Fase 3 — Observabilidade e resiliência

### 3.1 — Logs estruturados + segundo sinal correlacionado (auditoria)

- [ ] Status: pendente
- **Requisitos:** R17, R18
- **Branch:** `feature/observabilidade`
- **Ações:**
  - Adicionar logging estruturado (JSON por linha) em cada node do grafo: `thread_id`, `node`, `timestamp`, `duration_ms`, `tool_calls`, `error`
  - Adicionar um segundo sinal correlacionado: registro de auditoria por chamada de tool (nome, parâmetros, sucesso/erro, latência), correlacionado pelo mesmo `thread_id`
  - Expor uma forma simples de consulta (ex.: `GET /api/debug/:thread_id` no `server.ts`, ou arquivo `logs/audit.jsonl`)
- **Definição de Pronto:** os dois sinais existem e são correlacionáveis pelo `thread_id` em uma execução real.

### 3.2 — Investigar e documentar uma execução real

- [ ] Status: pendente
- **Requisitos:** R18
- **Branch:** `feature/observabilidade` (mesma branch da 3.1)
- **Ações:**
  - Rodar um cenário real (ex.: busca combinada de voo+hotel) e reconstruir, usando os dois sinais, o fluxo completo (decisões, tools chamadas, erros, latência)
  - Documentar em `docs/evidencias/observabilidade.md`
- **Definição de Pronto:** documento com a reconstrução passo a passo de uma execução real, citando os logs/auditoria correspondentes.

### 3.3 — Resiliência: retry limitado + fallback formalizados

- [ ] Status: pendente
- **Requisitos:** R19
- **Branch:** `feature/observabilidade` (mesma branch)
- **Ações:**
  - Criar helper `withRetry()` (retry limitado com backoff curto) e aplicar em `GeckoApiClient` e `DuffelApiClient`
  - Garantir fallback de mensagem amigável quando todas as tentativas falham
- **Definição de Pronto:** teste comprova retry + fallback funcionando em cenário de falha simulada.

---

## Fase 4 — IA para QA

### 4.1 — Revisão de código por IA em um diff real

- [ ] Status: pendente
- **Requisitos:** R20
- **Branch:** `feature/qa-inteligente`
- **Ações:**
  - Escolher um diff real já produzido nas fases anteriores (ex.: o diff da paralelização da Fase 1)
  - Rodar revisão assistida por IA sobre esse diff e documentar problemas encontrados/sugestões/decisão tomada em `docs/qa/code_review_ia.md`
- **Definição de Pronto:** documento com a revisão de um diff real e conclusão sobre o que foi aplicado ou não.

### 4.2 — Teste gerado/refinado por IA com priorização por risco

- [ ] Status: pendente
- **Requisitos:** R21, R22
- **Branch:** `feature/qa-inteligente` (mesma branch)
- **Ações:**
  - Gerar/refinar com apoio de IA um teste de integração ou E2E cobrindo o fluxo combinado voo+hotel em paralelo (cenário mais crítico após a Fase 1)
  - Justificar em `docs/qa/priorizacao_testes.md` por que esse é o cenário prioritário
- **Definição de Pronto:** teste novo/refinado passando; justificativa de priorização documentada.

---

## Fase 5 — DevOps inteligente

### 5.1 — IA explicando logs do CI + detecção de anomalia + tendência de risco

- [ ] Status: pendente
- **Requisitos:** R24, R25, R26, R27
- **Branch:** `feature/devops-anomalias`
- **Ações:**
  - Capturar logs de pelo menos duas etapas do CI (ex.: `lint` e `test`)
  - Produzir, com apoio de IA, uma explicação em linguagem natural dos logs
  - Detectar/explicar uma anomalia real ou simulada (erro recorrente, latência alta, falha de tool)
  - Produzir uma estimativa simples de tendência/risco de falha (heurística baseada em execuções recentes)
  - Documentar tudo com evidências em `docs/evidencias/devops_analise_logs.md`
- **Definição de Pronto:** documento com logs de 2+ etapas, anomalia explicada e estimativa de risco justificada.

---

## Fase 6 — Low-code / no-code

### 6.1 — Automação n8n integrada à aplicação

- [ ] Status: pendente
- **Requisitos:** R28, R29, R30
- **Branch:** `feature/low-code`
- **Ações:**
  - Montar fluxo no n8n: gatilho (Schedule ou Webhook) → chama `POST /api/chat` (endpoint já existente) → saída observável (Discord/e-mail/planilha)
  - Exportar o JSON do fluxo e capturar prints em `docs/evidencias/low_code_flow/`
  - Escrever instruções de reprodução (serão incorporadas ao README na Fase 8)
- **Definição de Pronto:** fluxo funcional demonstrável com saída observável real; evidências salvas.

---

## Fase 7 — Prompts e refinamento

### 7.1 — Documentar system prompt e ciclo de refinamento

- [ ] Status: pendente
- **Requisitos:** R31, R33
- **Branch:** `docs/prompts-refinamento`
- **Ações:**
  - Criar `docs/prompts/system_prompt.md` documentando as duas variantes de `getSystemPrompt()` (objetivo, regras, restrições)
  - Criar `docs/prompts/ciclo_refinamento.md` formalizando um ciclo real (problema observado → alteração → resultado), aproveitando o histórico de commits como fonte
- **Definição de Pronto:** os dois documentos criados e coerentes com o código atual (pós Fases 1–2).

---

## Fase 8 — Consolidação final

### 8.1 — Reescrever o README para o template do projeto final

- [ ] Status: pendente
- **Requisitos:** R1, R2, R3, R4, R35
- **Branch:** `docs/readme-final`
- **Ações:**
  - Descrição da solução (o que veio do mini-projeto, o que foi mantido/refeito/adicionado)
  - Classificação explícita como **sistema híbrido** (workflow determinístico + decisão agêntica pontual), com diagrama atualizado destacando a paralelização
  - Seções de tool/integração, contexto/memória, segurança/autonomia (incl. prompt injection), instalação/execução
  - Evidências de QA/observabilidade/DevOps/low-code (linkando os docs criados nas fases anteriores)
  - Dois cenários de uso (principal + risco/falha) com exemplos reais de entrada/saída
  - Análise crítica e limitações
  - Link do vídeo (placeholder até a Fase 9)
- **Definição de Pronto:** README cobre todos os itens do roteiro 5.2 do PDF.

### 8.2 — Merge final em `develop` → `main`

- [ ] Status: pendente
- **Requisitos:** R37
- **Ações:**
  - Revisar todas as `feature/*` mescladas em `develop`
  - Confirmar Kanban atualizado (cards movidos para "Concluído")
  - **Adicionar o professor como colaborador do repositório** (movido da Fase 0.1 por decisão do usuário — feito só no final)
  - Merge final `develop` → `main`
  - Confirmar que nenhum segredo foi versionado em nenhum ponto do histórico
- **Definição de Pronto:** `main` contém a versão final e funcional; Kanban refletindo o estado real; professor com acesso de colaborador.

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
