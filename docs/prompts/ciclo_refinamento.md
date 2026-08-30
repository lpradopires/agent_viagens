# Ciclos de Refinamento do Prompt e do Comportamento do Agente

> Evidência da atividade 7.1 do [PLANO_EXECUCAO.md](../../PLANO_EXECUCAO.md).
> Requisito do PDF (item 4.10): _"Documentar pelo menos um ciclo de refinamento de prompt ou comportamento do agente, apresentando o problema observado, a alteração realizada e o resultado obtido."_

O PDF pede **um** ciclo. Documentamos **seis**, todos reais e rastreáveis por commit, porque juntos contam a evolução do entendimento do projeto: começamos ajustando texto de prompt e terminamos aprendendo que prompt sozinho não garante nada.

---

## Ciclo 1 — Agente respondia com placeholders em vez de dados reais

|                        |                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema observado** | Após as tools retornarem resultados reais, o agente às vezes respondia com moldes vazios: _"1. [Companhia] — [Horário] — [Preço]"_. A busca funcionava, mas a resposta era inútil                                                                                                               |
| **Diagnóstico**        | A instrução original pedia resposta _"visualmente estruturada […] destacando preços, companhias e nomes"_. O modelo interpretou "estruturada" como **formato**, não como **conteúdo**, e produziu o template sem preenchê-lo                                                                    |
| **Alteração**          | Regra 6 reescrita: _"apresentando os dados reais das passagens ou hotéis obtidos no histórico […]. **NUNCA** use placeholders, templates ou colchetes vazios (ex: `[Detalhes de voo]`). Se os dados das buscas anteriores já estão presentes no histórico de mensagens (ToolMessages), use-os"_ |
| **Resultado**          | Placeholders eliminados. A execução real documentada em [observabilidade.md](../evidencias/observabilidade.md) mostra a resposta com companhia, número do voo, horários e preços concretos                                                                                                      |
| **Evidência**          | commit `9ff9134` — _"feat: forbid system prompt placeholders and enforce printing real search details"_                                                                                                                                                                                         |

**Lição:** dizer o formato desejado não basta; é preciso proibir explicitamente o anti-padrão e apontar **onde** o dado está (`ToolMessages`).

---

## Ciclo 2 — Erros de validação viravam "lista vazia"

|                        |                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema observado** | Com data no passado ou origem igual ao destino, a tool devolvia `"Erro de validação: ..."`, mas o agente exibia uma lista vazia ou dizia que "não encontrou opções" — o usuário não descobria que o problema era a **entrada dele** |
| **Diagnóstico**        | O prompt não dizia como tratar a string de erro. O modelo tratava o retorno como "resultado sem opções"                                                                                                                             |
| **Alteração**          | Regra 7 adicionada: ao receber `"Erro de validação:"`, **não** simular busca vazia; explicar de forma clara e prestativa **quais dados** precisam ser corrigidos                                                                    |
| **Resultado**          | Comprovado em execução real: com `2020-01-01`, o agente respondeu _"A data de 1º de janeiro de 2020 está no passado. Por favor, informe uma data futura"_ ([observabilidade.md §3](../evidencias/observabilidade.md))               |
| **Evidência**          | commit `78af003` — _"feat: add validation error guideline to LLM system prompt"_                                                                                                                                                    |

**Lição:** o contrato de erro entre a camada de tools e o LLM precisa ser explícito no prompt. Se a aplicação inventa um formato de erro, o prompt tem que ensinar o modelo a lê-lo.

---

## Ciclo 3 — Loops de chamadas repetidas em ferramenta instável

|                        |                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema observado** | Quando uma tool falhava (instabilidade do scraper), o agente a chamava repetidamente na mesma sessão, gastando tokens e tempo até estourar o limite de recursão       |
| **Diagnóstico**        | Sem memória explícita de "isto já falhou", cada iteração do ciclo `agent → tools → filter → agent` reavaliava a mesma tarefa e chegava à mesma decisão                |
| **Alteração**          | **Dupla**, e é isso que torna o ciclo interessante: (a) regra 8 no prompt — não repetir tool que já falhou na sessão; (b) `recursionLimit: 15` no runner do LangGraph |
| **Resultado**          | Loops eliminados. Quando o limite é atingido, o erro é tratado e o usuário recebe mensagem clara em vez de a aplicação travar                                         |
| **Evidência**          | commits `4893d80` (prompt) e `953abe0` (`recursionLimit`)                                                                                                             |

**Lição — a mais importante do projeto:** o prompt reduz a _probabilidade_ do loop; o `recursionLimit` garante que ele _termina_. Foi o primeiro caso em que a dupla "instrução + garantia determinística" apareceu, e ela virou o padrão de projeto documentado em [system_prompt.md §6](system_prompt.md).

---

## Ciclo 4 — Cidades sem aeroporto comercial travavam a busca

|                        |                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema observado** | Pedidos como _"quero ir para Blumenau"_ falhavam: não existe aeroporto comercial na cidade, e o agente ou inventava um código IATA ou desistia                                                 |
| **Alteração**          | Regra 2: identificar autonomamente o aeroporto comercial ativo mais próximo (Blumenau → NVT, Gramado → POA, Ubatuba → SJK/GRU, Angra dos Reis → GIG) e **explicar a substituição** na resposta |
| **Resultado**          | Buscas passaram a funcionar para essas cidades, com a decisão visível ao usuário — sem "mágica" silenciosa                                                                                     |
| **Evidência**          | commit `acfe639`                                                                                                                                                                               |

**Lição:** ao dar autonomia ao agente, exigir transparência junto. A regra não termina em "resolva o aeroporto", mas em "e diga que resolveu".

---

## Ciclo 5 — Regra de aprovação humana não resistia a uma recusa

Este ciclo e o próximo foram descobertos pela [revisão de código com IA](../qa/code_review_ia.md) da Fase 4, e mudaram o entendimento do projeto sobre o papel do prompt.

|                        |                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema observado** | O gate de aprovação exigia que o código `CONF-XXXX` estivesse na última mensagem do usuário. Um probe demonstrou que a mensagem _"NÃO, não quero mais. Cancele, não use o código CONF-XXXX"_ **executava a reserva** — o código estava lá, tecnicamente |
| **Diagnóstico**        | A instrução do prompt (_"só chame com o código depois que o usuário digitá-lo"_) estava correta e o modelo a seguiu. **A regra é que estava mal formulada**: presença do código foi confundida com consentimento                                        |
| **Alteração**          | Fail-safe determinístico `contemRecusa()`: mesmo com o código presente, termos de recusa (não, cancele, desista, pare, aborte…) **bloqueiam** a execução. Na dúvida, bloqueia                                                                           |
| **Resultado**          | Reserva bloqueada com `"AÇÃO BLOQUEADA"` e o bloqueio registrado na trilha de auditoria. Teste de regressão em `tests/regressao_code_review.test.ts`                                                                                                    |
| **Evidência**          | achado #3 do code review; correção no commit de fix da Fase 4                                                                                                                                                                                           |

**Lição:** o modelo obedeceu — o defeito estava na regra. Refinar comportamento não é só reescrever prompt: às vezes é reconhecer que a condição de segurança foi mal especificada.

---

## Ciclo 6 — "Nunca revele segredos" não cobria resposta em blocos

|                        |                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema observado** | A regra anti-injection instruía o modelo a nunca revelar credenciais, e a redação determinística no `formatterNode` era a rede de proteção. Um probe mostrou que, quando o `content` da mensagem vem como **lista de blocos** (`[{type:"text",…}]`, formato usado por vários provedores), a redação não se aplicava — e a credencial literal chegava ao navegador |
| **Diagnóstico**        | A garantia determinística existia, mas cobria só `typeof content === "string"`. A rede tinha um buraco exatamente no formato que alguns provedores usam                                                                                                                                                                                                           |
| **Alteração**          | `redactMessageContent()`: redige string **e** listas de blocos, recursivamente                                                                                                                                                                                                                                                                                    |
| **Resultado**          | Vazamento fechado nos dois formatos, com teste de regressão cobrindo ambos                                                                                                                                                                                                                                                                                        |
| **Evidência**          | achado #4 do code review da Fase 4                                                                                                                                                                                                                                                                                                                                |

**Lição:** não basta ter a contraparte determinística — é preciso verificá-la adversarialmente. Uma defesa não testada nas bordas é uma suposição, não uma garantia.

---

## Síntese da evolução

| Fase do projeto | O que se acreditava               | O que se aprendeu                                                                                              |
| --------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Ciclos 1–2      | "Basta instruir melhor o modelo"  | Instruções precisam proibir o anti-padrão e apontar onde está o dado                                           |
| Ciclos 3–4      | "Instrução + limite técnico"      | Prompt reduz probabilidade; a aplicação garante o limite                                                       |
| Ciclos 5–6      | "Temos garantias determinísticas" | Garantias precisam ser **verificadas adversarialmente** — as duas tinham bordas descobertas, com a suíte verde |

O resultado é o padrão consolidado em [system_prompt.md §6](system_prompt.md): **o prompt orienta o comportamento desejado; a aplicação impõe o comportamento obrigatório; os testes provam que a imposição funciona.**
