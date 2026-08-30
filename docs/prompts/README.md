# Prompts do Projeto

Esta pasta reúne dois tipos distintos de prompt, que não devem ser confundidos:

- **Instruções de sistema do agente** — o prompt que roda em produção, dentro da aplicação, orientando o comportamento do Agente de Busca de Viagens.
- **Prompts de desenvolvimento** — as instruções enviadas ao assistente de IA durante a construção do projeto (histórico de como o software foi feito).

---

## 🤖 Instruções de sistema do agente (produção)

| Documento                                        | Conteúdo                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[system_prompt.md](system_prompt.md)**         | Estrutura do prompt, objetivo da tarefa, diretrizes por provedor (GeckoAPI e Duffel), regras de governança e anti prompt-injection, padrões de resposta esperados, e o que o prompt **não** garante sozinho. Inclui a configuração do modelo por variável de ambiente |
| **[ciclo_refinamento.md](ciclo_refinamento.md)** | Seis ciclos reais de refinamento (problema observado → alteração → resultado), rastreáveis por commit, mostrando a evolução de "instruir melhor o modelo" até "verificar as garantias adversarialmente"                                                               |

> Código-fonte correspondente: `getSystemPrompt()` e `GOVERNANCE_RULES` em [`src/agent.ts`](../../src/agent.ts).

## 🛠️ Prompts de desenvolvimento (histórico)

Registro das instruções enviadas ao assistente de IA durante a análise, arquitetura e construção da interface web conversacional:

1. **[01. Análise de Sistemas e Desenvolvimento Web](01_analise_e_desenvolvimento_web.md)** — análise do projeto existente (`travelAgentGraph`), requisitos funcionais, design system e entrega da aplicação web.
2. **[02. Refinamento de UX](02_refinamentos_ux.md)** — ajuste para limpar a caixa de entrada após o envio da primeira mensagem.
3. **[03. Operação e Controle de Versão](03_gerenciamento_servidor_e_git.md)** — comandos de gerenciamento de processos e de `git commit` / `git push`.

## 📎 Documentos relacionados

- [docs/qa/code_review_ia.md](../qa/code_review_ia.md) — revisão de código com IA que originou os ciclos de refinamento #5 e #6
- [docs/evidencias/observabilidade.md](../evidencias/observabilidade.md) — execução real que comprova os resultados dos ciclos #1 e #2
