# Revisão de Código com IA sobre Alteração Real

> Evidência da atividade 4.1 do [PLANO_EXECUCAO.md](../../PLANO_EXECUCAO.md).
> Requisito do PDF (item 4.7): _"Utilizar IA para analisar pelo menos uma alteração real do projeto, como um diff, trecho de código ou Pull Request real, identificando possíveis problemas ou oportunidades de melhoria."_

---

## 1. O que foi revisado

|                |                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alvo**       | Diff acumulado `main...develop` — as alterações reais das Fases 1 a 3                                                                                                                                                                                                                                                      |
| **Volume**     | 24 commits, ~2.000 linhas                                                                                                                                                                                                                                                                                                  |
| **Escopo**     | Paralelização fan-out do LangGraph (PR [#1](https://github.com/lpradopires/agent_viagens/pull/1)), gate de aprovação humana e defesas anti prompt-injection (PR [#2](https://github.com/lpradopires/agent_viagens/pull/2)), observabilidade e retry/backoff (PR [#3](https://github.com/lpradopires/agent_viagens/pull/3)) |
| **Ferramenta** | Claude (Claude Code), com o fluxo de revisão em nível de esforço `high`                                                                                                                                                                                                                                                    |
| **Data**       | 29/08/2026                                                                                                                                                                                                                                                                                                                 |

**Metodologia:** a revisão não se limitou à leitura estática. Para os achados de maior risco, a IA escreveu _probes_ descartáveis executando o grafo real e confirmando o comportamento defeituoso antes de reportá-lo — depois removeu os probes. Isso separa hipótese de fato: os achados marcados como confirmados foram **reproduzidos**, não deduzidos.

## 2. Achados

10 problemas + 2 observações. A classificação de severidade abaixo é a priorização por risco usada na correção (detalhada em [priorizacao_testes.md](priorizacao_testes.md)).

### P0 — Críticos (corrigidos nesta atividade)

| #   | Local                              | Problema                                                                                                                                                                                                                                                                                                                                                                                                                         | Como foi confirmado                                                |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `src/agent.ts` (`routeAgent`)      | Uma `tool_call` cujo nome não batesse com nenhum mapa de categoria era roteada para `formatter`, deixando a chamada **sem `ToolMessage` correspondente** no histórico persistido pelo checkpointer. Provedores rejeitam esse histórico com HTTP 400 — a sessão fica **permanentemente inutilizável**. Regressão introduzida ao substituir o `ToolNode` (que emitia erro nesses casos) pelos nodes por categoria na atividade 1.1 | Probe reproduziu o histórico órfão sendo reenviado indefinidamente |
| 2   | `src/reservation_tools.ts`         | `pendingReservations` era um `Map` global de processo **sem vínculo de sessão** — a sessão B podia confirmar a reserva pendente da sessão A. Códigos de 4 dígitos, sem expiração                                                                                                                                                                                                                                                 | Probe confirmou `userB` confirmando a reserva de `userA`           |
| 3   | `src/agent.ts` (gate de aprovação) | O gate usava `lastHumanText.includes(codigo)`. Uma mensagem de **recusa** que citasse o código — _"não quero mais, cancele, não use o código CONF-XXXX"_ — era lida como aprovação e **executava a reserva**                                                                                                                                                                                                                     | Probe confirmou a execução                                         |
| 4   | `src/agent.ts` (`formatterNode`)   | A redação de segredos só tratava `content` do tipo `string`. Uma resposta em **blocos** (`[{type:"text",…}]`, formato comum entre provedores) passava com a credencial literal — e `server.ts` a devolvia ao navegador. Exatamente o caso que a defesa da atividade 2.2 existia para impedir                                                                                                                                     | Probe confirmou o vazamento                                        |
| 5   | `src/server.ts`                    | `/api/debug/:thread_id` **sem autenticação**, com `thread_id` no formato `web_session_<aleatório 0..1e6>` — enumerável. Expunha argumentos de ferramentas de outras sessões, incluindo `codigo_confirmacao`, o que se somava ao achado #2                                                                                                                                                                                        | Análise do gerador de ids em `server.ts`                           |

### P1 — Importantes (corrigidos nesta atividade)

| #   | Local                      | Problema                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | `src/gecko_api_client.ts`  | O retry da atividade 3.3 envolveu um timeout de 35s **por tentativa**: o pior caso de um upstream travado subiu de 35s para ~106s por chamada de ferramenta                                                                                                                                                                  |
| 7   | `src/duffel_api_client.ts` | O retry era aplicado também a `POST /air/offer_requests`, **não idempotente** — até 3 cotações criadas no provedor por busca                                                                                                                                                                                                 |
| 8   | `src/retry.ts`             | `isTransientError` inspecionava só o texto do erro, mas o cliente Duffel prefere a mensagem de negócio da API ao código HTTP. Um 503/429 **real** não era reconhecido como transitório: o retry só disparava quando o corpo do erro vinha vazio — precisamente o caso coberto pelos testes existentes, que por isso passavam |

### P2 — Aceitos com registro (não corrigidos)

| #   | Local                  | Problema                                                                              | Decisão                                                                                                                |
| --- | ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 9   | `src/agent.ts`         | `tool_call_id: call.id ?? ""` gera ids vazios/duplicados quando o provedor omite o id | **Aceito.** Achado marcado como plausível, não reproduzido; provedores em uso sempre enviam id. Registrado como dívida |
| 10  | `src/observability.ts` | `mkdirSync`/`appendFileSync` síncronos no caminho da requisição; JSONL sem rotação    | **Aceito** para o escopo acadêmico (volume baixo, execução local). Em produção exigiria escrita assíncrona e rotação   |

### Observações (não-bugs)

- **`activeTools` virou código morto** após a remoção do `ToolNode` na atividade 1.1 — nada mais o referenciava. **Removido**, e o `CLAUDE.md` (que ainda o documentava) foi corrigido.
- A IA também sinalizou o bug pré-existente do `filterDataNode` — o mesmo que a investigação de observabilidade da atividade 3.2 havia detectado em execução real. **Corrigido** nesta atividade (ver §3).

## 3. Correções aplicadas

| Achado           | Correção                                                                                                                                                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1               | Novo node `tools_desconhecida`: toda `tool_call` sem correspondência recebe uma `ToolMessage` de erro listando as ferramentas válidas. `routeAgent` passou a usar `else if` + fallback, garantindo que **nenhuma chamada fique sem resposta**                                                                               |
| #2               | `PendingReservation` ganhou `thread_id` e `criadaEm`; confirmação exige a **mesma sessão**; TTL de 15 min com expurgo automático; código passou a ter 8 caracteres hex (`crypto.randomBytes`) em vez de 4 dígitos. A lógica saiu da tool para `executarReserva(params, threadId)`, chamada pelo node com o `thread_id` real |
| #3               | Gate _fail-safe_: além de exigir o código digitado, bloqueia se a mensagem contiver termos de recusa (`contemRecusa`). Na dúvida, **bloqueia**                                                                                                                                                                              |
| #4               | Nova função `redactMessageContent`: redige string **e** listas de blocos, recursivamente                                                                                                                                                                                                                                    |
| #5               | Endpoint _fail-closed_: sem `DEBUG_API_TOKEN` responde 404; com token configurado, exige header `x-debug-token`                                                                                                                                                                                                             |
| #6               | Timeout de 15s por tentativa + `totalBudgetMs` de 40s no `withRetry` — pior caso volta a ficar próximo do original                                                                                                                                                                                                          |
| #7               | `httpRequest` ganhou `retryable`; a criação de oferta passa `retryable: false`                                                                                                                                                                                                                                              |
| #8               | O erro HTTP passou a carregar `err.status`, e `isTransientError` o consulta antes do texto                                                                                                                                                                                                                                  |
| `filterDataNode` | Categorização passou a usar os mapas `voosToolsByName`/`hoteisToolsByName` em vez de checar se o nome contém `"voos"`/`"hoteis"` — agora funciona com a nomenclatura da Duffel                                                                                                                                              |

Cada correção tem teste de regressão correspondente em [`tests/regressao_code_review.test.ts`](../../tests/regressao_code_review.test.ts) (11 testes), detalhados em [priorizacao_testes.md](priorizacao_testes.md).

## 4. Análise crítica do uso de IA na revisão

**O que a IA pegou e a revisão humana provavelmente não pegaria:** os achados #1, #3 e #4 são casos em que o código _parece_ correto e a suíte de testes passava — inclusive os testes que escrevemos nas Fases 2 e 3. O achado #8 é o mais instrutivo: o teste de retry existente passava porque exercitava exatamente o único caminho em que o código funcionava (corpo de erro vazio). Um teste verde deu falsa confiança, e foi a leitura cruzada entre `retry.ts` e `duffel_api_client.ts` que revelou a lacuna.

**Padrão nos achados:** três dos cinco P0 (#2, #3, #4) são falhas em garantias de **segurança que nós mesmos havíamos construído** nas Fases 2 e 3. Ou seja: a defesa existia, mas tinha uma borda não coberta. Isso reforça o argumento central da atividade 2.2 — controles precisam ser verificados adversarialmente, não assumidos.

**Limitação observada:** a IA classificou o achado #9 como _plausível_ em vez de confirmado, e de fato ele não se manifesta com os provedores atuais. Nem todo achado merece correção — a triagem por risco continua sendo decisão de engenharia, não da ferramenta. Por isso dois achados foram conscientemente aceitos e registrados como dívida.

## 5. Como reproduzir

```bash
# Suíte de regressão dos achados
npx vitest run tests/regressao_code_review.test.ts

# Suíte completa
npm test   # 53 testes
```
