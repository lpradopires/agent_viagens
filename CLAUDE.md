# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

- `npm start` — roda o agente CLI direto via `tsx` (não precisa de build)
- `npm test` — todos os testes (`vitest run`, one-shot)
- `npx vitest run tests/agent.test.ts` — um arquivo de teste; `npx vitest run -t "nome do teste"` — um teste por nome
- `npm run lint` / `npm run format` — ESLint usa `eslint-plugin-prettier`, então arquivo fora do formato Prettier é erro de lint
- CI (push/PR para `main` e `develop`): `npm run lint` → `npm run build` → `npm test` — os três precisam passar

## Fluxo de branches (projeto final M2S08)

- `develop` é a branch de trabalho; `feature/*` sai de `develop` e volta via PR; `main` só recebe o merge final
- O plano de atividades vive em `PLANO_EXECUCAO.md` (raiz) — uma atividade por vez, status atualizado ao concluir; o Kanban espelho é o GitHub Project 10 do usuário

## Setup

- `cp .env.example .env`. Pelo menos uma chave de LLM é obrigatória; a prioridade em `getModel()` é `GEMINI_API_KEY` → `OPENAI_API_KEY` → `OPENROUTER_API_KEY` → `GROQ_API_KEY`
- `TRAVEL_API_PROVIDER` escolhe o provedor: só o valor `duffel` (case-insensitive) ativa o Duffel; qualquer outro cai no GeckoAPI
- `DUFFEL_ACCESS_TOKEN=mock` roda o Duffel em modo simulado local, sem API real

## Commits

- Conventional Commits obrigatório — commitlint roda no hook `commit-msg` do husky; o pre-commit roda só o lint (testes ficam por conta da CI)

## Pegadinhas

- `getActiveTools()` resolve o provedor dinamicamente via `process.env.TRAVEL_API_PROVIDER` e é o que se usa no `bindTools` (a tool de reserva entra nos dois provedores). Essa resolução é dinâmica de propósito: `tests/agent.test.ts` manipula `process.env` antes de importar o agente — resolver o provedor no momento do import vaza estado entre testes
- Não há mais `ToolNode` genérico: as tool_calls são executadas por nodes próprios que filtram por categoria (`tools_voos`, `tools_hoteis`, `tools_reserva`, `tools_desconhecida`); `routeAgent` retorna `string[]` (fan-out — voo e hotel na mesma resposta rodam em paralelo) e todos convergem em `filter` (fan-in)
- `tools_desconhecida` existe por um motivo específico: TODA tool_call precisa de uma ToolMessage. Se o modelo alucinar um nome de ferramenta e a chamada ficar sem resposta, o histórico no checkpointer fica inválido e os provedores passam a rejeitar a sessão com HTTP 400 — permanentemente. Nunca roteie uma tool_call para `formatter`
- `tools_reserva` aplica gate determinístico de aprovação humana: o código `CONF-<hex>` precisa estar na última HumanMessage, a pendência é vinculada ao `thread_id` (uma sessão não confirma reserva de outra), expira em 15 min, e uma mensagem com termos de recusa bloqueia mesmo com o código presente
- `redactSecrets`/`redactMessageContent` no `formatterNode` são a última barreira contra vazamento de credenciais — precisam tratar `content` string E lista de blocos
- `filterDataNode` trunca resultados de tools para top-3 e remove chaves com url/image/photo/description/etc. (limites de TPM); categoriza voo/hotel pelos mapas `voosToolsByName`/`hoteisToolsByName` (não por substring do nome, que só valia para a GeckoAPI)
- `withRetry` só retenta erros transitórios e consulta `err.status` além do texto; requisições não idempotentes (criação de oferta na Duffel) passam `retryable: false`
- `agentNode` tem fallback: em erro 429/413/quota, se `OPENROUTER_API_KEY` existir, refaz a chamada via OpenRouter com `llama-3.3-70b-instruct:free`
- `recursionLimit: 15` fixado em `src/index.ts` para evitar loop infinito de tool calls
- O system prompt proíbe placeholders tipo `[Detalhes de voo]` na resposta — o LLM deve imprimir dados reais retornados pelas tools
