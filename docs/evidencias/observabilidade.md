# Investigação de Execução Real via Sinais de Observabilidade

> Evidência da atividade 3.2 do [PLANO_EXECUCAO.md](../../PLANO_EXECUCAO.md).
> Requisito do PDF (item 4.6): _"Utilizar esses sinais para investigar pelo menos uma execução da aplicação, permitindo identificar seu fluxo, decisões relevantes, erros e latência, quando disponível."_

---

## 1. Metodologia

Execução **real** em 29/08/2026, com **LLM real** (OpenAI `gpt-4.1-nano`, via `OPENAI_API_KEY` do `.env`) e provedor **Duffel em modo mock local** (`DUFFEL_ACCESS_TOKEN=mock` — as tools executam sem rede, mas o grafo, o modelo e toda a orquestração são reais).

Script reproduzível: [scripts/evidencia_observabilidade.ts](../../scripts/evidencia_observabilidade.ts)

```bash
npx tsx scripts/evidencia_observabilidade.ts
```

Foram investigadas duas execuções (dois `thread_id` distintos), usando os **dois sinais correlacionados** implementados na atividade 3.1:

- **Sinal 1** — log estruturado de execução (`logs/agent.jsonl`): um evento JSON por node do grafo
- **Sinal 2** — trilha de auditoria de tools (`logs/audit.jsonl`): um registro JSON por chamada de ferramenta

## 2. Execução 1 — fluxo principal (`thread_id: evidencia_obs_2026-08-29`)

**Entrada do usuário:** _"Quero um voo de São Paulo para o Rio de Janeiro no dia 2026-09-28 e também um hotel no Rio de Janeiro para 2 noites a partir dessa data."_

### 2.1 Fluxo reconstruído pelo Sinal 1

```json
{"timestamp":"2026-08-29T20:46:45.701Z","thread_id":"evidencia_obs_2026-08-29","node":"agent","duration_ms":2873,"tool_calls":["search_airports","search_airports"]}
{"timestamp":"2026-08-29T20:46:45.711Z","thread_id":"evidencia_obs_2026-08-29","node":"tools_voos","duration_ms":3,"tool_calls":["search_airports","search_airports"]}
{"timestamp":"2026-08-29T20:46:45.714Z","thread_id":"evidencia_obs_2026-08-29","node":"filter","duration_ms":0,"detail":"voos=0 hoteis=0"}
{"timestamp":"2026-08-29T20:46:46.804Z","thread_id":"evidencia_obs_2026-08-29","node":"agent","duration_ms":1087,"tool_calls":["create_offer_request"]}
{"timestamp":"2026-08-29T20:46:46.810Z","thread_id":"evidencia_obs_2026-08-29","node":"tools_voos","duration_ms":2,"tool_calls":["create_offer_request"]}
{"timestamp":"2026-08-29T20:46:46.813Z","thread_id":"evidencia_obs_2026-08-29","node":"filter","duration_ms":0,"detail":"voos=0 hoteis=0"}
{"timestamp":"2026-08-29T20:46:48.370Z","thread_id":"evidencia_obs_2026-08-29","node":"agent","duration_ms":1554,"tool_calls":["search_hotels_by_location"]}
{"timestamp":"2026-08-29T20:46:48.378Z","thread_id":"evidencia_obs_2026-08-29","node":"tools_hoteis","duration_ms":4,"tool_calls":["search_hotels_by_location"]}
{"timestamp":"2026-08-29T20:46:48.381Z","thread_id":"evidencia_obs_2026-08-29","node":"filter","duration_ms":0,"detail":"voos=0 hoteis=0"}
{"timestamp":"2026-08-29T20:46:50.380Z","thread_id":"evidencia_obs_2026-08-29","node":"agent","duration_ms":1996,"tool_calls":[]}
{"timestamp":"2026-08-29T20:46:50.383Z","thread_id":"evidencia_obs_2026-08-29","node":"formatter","duration_ms":0}
```

Leitura do fluxo (4 iterações do ciclo `agent → tools → filter → agent`):

| #   | Decisão do modelo (evento `agent`)                                        | Node executor  | O que aconteceu                                    |
| --- | ------------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| 1   | Resolver cidades → IATA: 2× `search_airports`                             | `tools_voos`   | GRU/CGH e GIG/SDU resolvidos                       |
| 2   | Cotar o voo: `create_offer_request` (GRU→GIG, 2026-09-28)                 | `tools_voos`   | 2 ofertas retornadas                               |
| 3   | Buscar hospedagem: `search_hotels_by_location` (lat/lng do Rio, autônomo) | `tools_hoteis` | 2 hotéis retornados                                |
| 4   | `tool_calls: []` → decisão de responder                                   | `formatter`    | Resposta final consolidada, sem redação necessária |

### 2.2 Decisões e ações auditadas pelo Sinal 2

```json
{"timestamp":"2026-08-29T20:46:45.710Z","thread_id":"evidencia_obs_2026-08-29","tool":"search_airports","args":{"query":"São Paulo"},"status":"success","duration_ms":2}
{"timestamp":"2026-08-29T20:46:45.710Z","thread_id":"evidencia_obs_2026-08-29","tool":"search_airports","args":{"query":"Rio de Janeiro"},"status":"success","duration_ms":1}
{"timestamp":"2026-08-29T20:46:46.810Z","thread_id":"evidencia_obs_2026-08-29","tool":"create_offer_request","args":{"origin":"GRU","destination":"GIG","departure_date":"2026-09-28","passengers":[{"type":"adult"}]},"status":"success","duration_ms":2}
{"timestamp":"2026-08-29T20:46:48.377Z","thread_id":"evidencia_obs_2026-08-29","tool":"search_hotels_by_location","args":{"latitude":-22.9068,"longitude":-43.1729,"check_in_date":"2026-09-28","check_out_date":"2026-09-30"},"status":"success","duration_ms":3}
```

A auditoria mostra decisões relevantes que o log de nodes sozinho não mostraria:

- O modelo escolheu **GRU** entre os 2 aeroportos de origem retornados e **GIG** entre os 2 de destino;
- Resolveu **autonomamente** as coordenadas do Rio (`-22.9068, -43.1729`), conforme diretriz do system prompt;
- Calculou o check-out (`2026-09-30`) a partir de "2 noites", sem o usuário informar a data.

### 2.3 Correlação e latência

Os dois sinais se cruzam pelo mesmo `thread_id` e pelos timestamps — ex.: o evento `agent` de `20:46:46.804` decide `create_offer_request`, e a auditoria registra a execução dessa tool em `20:46:46.810` (6ms depois).

**Latência:** as 4 chamadas do LLM dominam o tempo total (**2873 + 1087 + 1554 + 1996 ≈ 7,5s**), enquanto as tools mock somam **< 10ms**. Em produção (API Duffel real), o perfil se inverteria — e é exatamente esta instrumentação que permitiria provar isso.

### 2.4 Saída final ao usuário

> Voos GRU→GIG em 28/09/2026: LATAM LA3150 08:30→09:45 R$ 550,00; Azul AD4200 14:15→15:30 R$ 620,00. Hotéis no Rio 28–30/09: Meliá Paulista Stays R$ 650,00 (4.5★); Hotel Ibis Consolação R$ 320,00 (4.0★).

Dados reais das tools, sem placeholders — conforme regra do system prompt.

## 3. Execução 2 — cenário de falha (`thread_id: evidencia_obs_falha_2026-08-29`)

**Entrada do usuário:** _"Quero um voo de GRU para GIG no dia 2020-01-01 (isso mesmo, 2020)."_

A auditoria captura o erro de validação **barrado localmente, antes de qualquer chamada externa** (`duration_ms: 0`):

```json
{
  "timestamp": "2026-08-29T20:46:53.125Z",
  "thread_id": "evidencia_obs_falha_2026-08-29",
  "tool": "create_offer_request",
  "args": {
    "origin": "GRU",
    "destination": "GIG",
    "departure_date": "2020-01-01",
    "passengers": [{ "type": "adult" }]
  },
  "status": "error",
  "duration_ms": 0
}
```

E o log de nodes mostra o agente encerrando com resposta explicativa (sem loop de retentativas):

> "A data de 1º de janeiro de 2020 está no passado. Por favor, informe uma data futura para que eu possa buscar as opções de voo."

## 4. Achado da investigação: anomalia real detectada 🔍

O Sinal 1 revelou uma anomalia: **`filter` reporta `voos=0 hoteis=0` em todas as iterações**, mesmo com buscas bem-sucedidas na auditoria. Investigando o código: `filterDataNode` categoriza resultados pelo nome da tool conter `"voos"`/`"hoteis"` — nomenclatura da GeckoAPI. Os nomes das tools Duffel (`create_offer_request`, `search_hotels_by_location`) não casam com esses padrões, então `flightResults`/`hotelResults` do estado nunca são populados com o provedor Duffel (a resposta ao usuário não é afetada, pois o LLM lê as ToolMessages diretamente; o impacto é no estado estruturado exposto pela API REST).

Este é um exemplo concreto do valor dos sinais: **a anomalia foi identificada pela contradição entre os dois sinais** (auditoria com `success` × filter com contagem zero). O achado está registrado para a revisão de código com IA (atividade 4.1) e para a análise de anomalias (atividade 5.1).

## 5. Observação sobre a paralelização

Nesta execução, o LLM decidiu sequenciar as buscas (voo → hotel) em vez de solicitá-las na mesma resposta, então o fan-out paralelo (`tools_voos` + `tools_hoteis` no mesmo passo) não aparece no log acima. O caminho paralelo é comprovado deterministicamente pelo teste `deve buscar voo e hotel em paralelo...` em [tests/agent.test.ts](../../tests/agent.test.ts) (atividade 1.1).

## 6. Requisito atendido

| Exigência do item 4.6 | Evidência                                                                 |
| --------------------- | ------------------------------------------------------------------------- |
| Identificar o fluxo   | §2.1 — 4 iterações reconstruídas node a node                              |
| Decisões relevantes   | §2.2 — escolha de aeroportos, coordenadas autônomas, cálculo de check-out |
| Erros                 | §3 — erro de validação auditado com `status: "error"`                     |
| Latência              | §2.3 — LLM ≈ 7,5s vs tools < 10ms, medido por evento                      |
