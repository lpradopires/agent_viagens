# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

- `npm start` — roda o agente CLI direto via `tsx` (não precisa de build)
- `npm test` — todos os testes (`vitest run`, one-shot)
- `npx vitest run tests/agent.test.ts` — um arquivo de teste; `npx vitest run -t "nome do teste"` — um teste por nome
- `npm run lint` / `npm run format` — ESLint usa `eslint-plugin-prettier`, então arquivo fora do formato Prettier é erro de lint
- CI (push/PR para `main`): `npm run lint` → `npm run build` → `npm test` — os três precisam passar

## Setup

- `cp .env.example .env`. Pelo menos uma chave de LLM é obrigatória; a prioridade em `getModel()` é `GEMINI_API_KEY` → `OPENAI_API_KEY` → `OPENROUTER_API_KEY` → `GROQ_API_KEY`
- `TRAVEL_API_PROVIDER` escolhe o provedor: só o valor `duffel` (case-insensitive) ativa o Duffel; qualquer outro cai no GeckoAPI
- `DUFFEL_ACCESS_TOKEN=mock` roda o Duffel em modo simulado local, sem API real

## Commits

- Conventional Commits obrigatório — commitlint roda no hook `commit-msg` do husky; o pre-commit roda só o lint (testes ficam por conta da CI)

## Pegadinhas

- Em `src/agent.ts`, `activeTools` (export) é a lista COMBINADA dos dois provedores, usada pelo `ToolNode`; só `getActiveTools()` resolve o provedor dinamicamente via `process.env.TRAVEL_API_PROVIDER` e é o que se usa no `bindTools`. Não assuma que `activeTools` respeita a env var
- Essa resolução é dinâmica de propósito: `tests/agent.test.ts` manipula `process.env` antes de importar o agente — resolver o provedor no momento do import vaza estado entre testes
- `filterDataNode` trunca resultados de tools para top-3 e remove chaves com url/image/photo/description/etc. (limites de TPM); ele separa voo/hotel pelo nome da tool conter `"voos"`/`"hoteis"` — nomenclatura do GeckoAPI apenas
- `agentNode` tem fallback: em erro 429/413/quota, se `OPENROUTER_API_KEY` existir, refaz a chamada via OpenRouter com `llama-3.3-70b-instruct:free`
- `recursionLimit: 15` fixado em `src/index.ts` para evitar loop infinito de tool calls
- O system prompt proíbe placeholders tipo `[Detalhes de voo]` na resposta — o LLM deve imprimir dados reais retornados pelas tools
