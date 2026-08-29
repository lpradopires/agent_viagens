# Geração de Testes com IA e Priorização por Risco

> Evidência da atividade 4.2 do [PLANO_EXECUCAO.md](../../PLANO_EXECUCAO.md).
> Requisitos do PDF (item 4.7): _"Gerar ou refinar testes automatizados com apoio de IA, cobrindo cenários relevantes da aplicação e incluindo pelo menos um dos seguintes tipos de teste: integração, aceitação ou E2E"_ e _"Selecionar e justificar pelo menos um teste ou cenário considerado prioritário com base em risco, impacto ou criticidade."_

---

## 1. Critério de priorização

Os cenários foram ordenados por **risco = probabilidade × impacto**, com o impacto medido em quatro eixos: dano ao usuário, exposição de dados, custo financeiro e recuperabilidade.

| Nível  | Critério                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------- |
| **P0** | Falha causa dano irreversível ao usuário, expõe dados sensíveis ou inutiliza a sessão. Sem contorno |
| **P1** | Falha gera custo, duplicidade ou degradação relevante, mas é recuperável                            |
| **P2** | Falha cosmética, operacional ou dependente de condições que não ocorrem nos provedores atuais       |

Este critério foi aplicado **duas vezes**: para decidir o que corrigir dos achados do [code review com IA](code_review_ia.md), e para decidir o que merecia teste de regressão.

## 2. Cenário prioritário nº 1

> **Reserva confirmada sem aprovação humana legítima.**

Justificativa da escolha entre todos os cenários candidatos:

| Eixo                      | Avaliação                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Impacto**               | Máximo. É a única ação irreversível do domínio. Uma reserva indevida é dano direto ao usuário, e o requisito 4.3 do PDF exige explicitamente que ações irreversíveis sejam "simuladas, bloqueadas ou condicionadas à aprovação humana" |
| **Probabilidade**         | Alta na prática — o code review reproduziu **dois** caminhos distintos de burla (código de outra sessão; mensagem de recusa contendo o código)                                                                                         |
| **Recuperabilidade**      | Nenhuma. Em um sistema real, uma reserva confirmada implica cobrança                                                                                                                                                                   |
| **Criticidade sistêmica** | É a garantia central da Fase 2 do projeto; se ela falha, o critério 10 da rubrica de avaliação cai por inteiro                                                                                                                         |

**Achado agravante:** os testes originais da atividade 2.1 passavam. Eles cobriam o caminho feliz (código correto, mesma sessão) e um caminho de ataque (auto-aprovação do modelo), mas **não** os dois caminhos que a IA descobriu. É o exemplo mais claro no projeto de que cobertura verde ≠ ausência de risco.

### Testes que cobrem o cenário prioritário

| Teste                                                                        | O que trava                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `pendência é vinculada à sessão: outra thread não confirma a reserva alheia` | Isolamento entre sessões (integração no grafo + unidade) |
| `código de aprovação expira após o TTL`                                      | Janela de validade do código                             |
| `código tem entropia suficiente`                                             | Adivinhação por varredura do espaço de códigos           |
| `mensagem de recusa com o código presente NÃO executa a reserva`             | Interpretação de recusa como aprovação                   |

## 3. Cenário prioritário nº 2

> **Sessão permanentemente inutilizada por `tool_call` órfã.**

| Eixo                 | Avaliação                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Impacto**          | Alto. O usuário perde a sessão inteira, com todo o contexto conversacional — e a falha é _persistente_: o histórico corrompido fica no checkpointer e volta a estourar HTTP 400 a cada nova mensagem |
| **Probabilidade**    | Média-alta. Basta o modelo alucinar um nome de ferramenta — comportamento conhecido de LLMs, especialmente nos modelos menores/gratuitos usados neste projeto                                        |
| **Recuperabilidade** | Só descartando a sessão                                                                                                                                                                              |
| **Origem**           | **Regressão introduzida pelo próprio projeto** na atividade 1.1: o `ToolNode` removido tratava esse caso; os nodes por categoria não                                                                 |

### Testes que cobrem

| Teste                                                            | Tipo                                       | O que trava                            |
| ---------------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| `tool_call de ferramenta inexistente recebe ToolMessage de erro` | **Integração** (grafo real, ponta a ponta) | Toda `tool_call` recebe resposta       |
| `lote misto (tool válida + inexistente) responde a ambas`        | **Integração**                             | O caso parcial, mais sutil que o total |

## 4. Suíte completa gerada

[`tests/regressao_code_review.test.ts`](../../tests/regressao_code_review.test.ts) — 11 testes, organizados em blocos que declaram o risco no próprio nome:

| Bloco                                  | Testes | Risco endereçado                           |
| -------------------------------------- | ------ | ------------------------------------------ |
| `Regressão P0 — integridade da sessão` | 2      | Sessão inutilizada                         |
| `Regressão P0 — governança da reserva` | 4      | Ação irreversível indevida                 |
| `Regressão P0 — vazamento de dados`    | 2      | Exposição de segredos e de sessões alheias |
| `Regressão P1 — resiliência`           | 3      | Custo, duplicidade e latência em produção  |

**Tipos de teste presentes** (o PDF exige ao menos um entre integração/aceitação/E2E):

- **Integração** — os testes de `tool_call` órfã e lote misto executam o **grafo LangGraph completo** (`travelAgentGraph.invoke`), atravessando roteamento, nodes de tool, filtro e formatter, com o LLM mockado apenas na fronteira externa.
- **Integração de API** — o teste do `/api/debug` sobe o app Express via `supertest` e exercita o middleware de autenticação de ponta a ponta.
- **Unitários** — helpers isolados (`contemRecusa`, `redactMessageContent`, `withRetry`, TTL e entropia dos códigos).

## 5. O que foi conscientemente deixado de fora

Priorizar significa também decidir o que **não** testar agora:

| Não coberto                                      | Por quê                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `tool_call_id` vazio (achado P2 #9)              | Não reproduzido; os provedores em uso sempre enviam id. Registrado como dívida                      |
| Rotação de logs / I/O assíncrono (achado P2 #10) | Fora do escopo acadêmico; volume local baixo                                                        |
| Chamadas reais às APIs Duffel/GeckoAPI           | Exigiriam credenciais e rede na CI, tornando a suíte lenta e instável. O modo mock cobre o contrato |

Declarar essas exclusões faz parte da evidência: uma suíte que não diz o que não cobre passa uma impressão de completude que não tem.

## 6. Resultado

```bash
npx vitest run tests/regressao_code_review.test.ts   # 11 testes
npm test                                              # 53 testes no total
```

Todos verdes, com `npm run lint` e `npm run build` limpos. A suíte cresceu de 42 para 53 testes nesta atividade — **todos os 11 novos derivados de defeitos reais**, não de cobertura especulativa.
