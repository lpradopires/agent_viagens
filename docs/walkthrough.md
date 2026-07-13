# Walkthrough: Progresso do Desenvolvimento

Este documento acompanha o progresso de desenvolvimento do **Agente de Busca de Viagens**.

---

## 🛠️ Tarefa 1 Concluída: Setup do Ambiente e Padrões

*   **npm & Git:** Inicializado o projeto com `"type": "module"` e configurada a branch padrão como `main`.
*   **Linters & Formatação:** ESLint 10 (Flat Config) e Prettier instalados e integrados para TypeScript.
*   **TypeScript:** Configurado `tsconfig.json` compilando para `/dist` usando `NodeNext` para suporte a ESM.
*   **Git Hooks:** Husky configurado com hooks de `pre-commit` (para rodar `npm run lint`) e `commit-msg` (para validação de mensagens convencionais via `commitlint`).
*   **Primeiro Commit:** Feito o commit semântico `"chore: setup project environment, standards, and git hooks"`.

---

## 🚀 Tarefa 2 Concluída: Infraestrutura de CI/CD e Testes

*   **Ambiente de Testes:** Instalado o framework **Vitest** e configurado o script `"test": "vitest run"` no `package.json`.
*   **Placeholder Test:** Criado o arquivo [tests/index.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/index.test.ts).
*   **GitHub Actions Workflow:** Criado o workflow [.github/workflows/ci.yml](file:///Users/leandropradopires/Projetos/mini_projeto/.github/workflows/ci.yml) para rodar automaticamente lint, build (TypeScript compilation) e testes unitários em pushes e pull requests na branch `main`.

---

## 🔌 Tarefa 3 Concluída: Adaptadores da GeckoAPI (Tools)

*   **Cliente MCP da GeckoAPI:** Criada a classe `GeckoApiClient` em [src/gecko_api_client.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/gecko_api_client.ts) envelopando chamadas no padrão JSON-RPC 2.0 (`method: "tools/call"`).
*   **Ferramentas LangChain:** Criadas 5 ferramentas em [src/tools.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/tools.ts) com validação de entrada estrita via **Zod**: `buscar_voos_latam`, `buscar_voos_azul`, `buscar_voos_kayak`, `buscar_hoteis_booking` e `buscar_hoteis_airbnb`.
*   **Testes Unitários:** Criada a suíte de testes [tests/gecko_api_client.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/gecko_api_client.test.ts) validando cenários de sucesso, erro de rede, erro RPC e `isError: true` (9 testes passando).

---

## 🧠 Tarefa 4 Concluída: Engine LangGraph e Integração Multi-Provedor (Gemini & Groq)

*   **Estado do Agente (`AgentState`):** Estrutura definida usando `Annotation.Root` em [src/agent.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/agent.ts).
*   **Token Reducer (`filter` Node):** Varre mensagens das ferramentas, filtra top 3 resultados e otimiza o conteúdo por referência (in-place) prevenindo estouro de tokens.
*   **Integração Multi-Provedor (Gemini & Groq):** 
    *   Para mitigar erros de limites e cotas da API do Gemini (`429 Quota Exceeded`), adicionamos suporte nativo à API do **Groq** usando o modelo de última geração **`llama-3.3-70b-versatile`** via pacote `@langchain/groq`.
    *   Se a variável `GROQ_API_KEY` for definida no arquivo `.env`, o agente utilizará o Groq. Caso contrário, ele fará o fallback automático para a API do Gemini.
*   **Isolamento de Testes:** A suíte de testes em [tests/agent.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/agent.test.ts) foi configurada para limpar a variável `GROQ_API_KEY` em tempo de execução, garantindo que os testes unitários rodem isolados via mocks do Gemini e passem 100% no CI (13 testes no total, todos passando).

---

## 💻 Tarefa 5 Concluída: Interface CLI Interativa

*   **Loop Conversacional da CLI:** Implementado o console interativo com o módulo nativo `readline` em [src/index.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/index.ts) com suporte a `thread_id` para persistência do histórico e memória conversacional de curto prazo.
*   **Cores e Estilo:** chalk integrado para diferenciar o usuário do agente e exibir avisos de sistema em cinza e erros em vermelho.
*   **Execução Direta:** Script `"start": "tsx src/index.ts"` adicionado ao `package.json` para inicialização via `npm start`.

---

## 📊 Tarefa 6 Concluída: Testes, Cobertura e Validação Geral

*   **Configuração de Cobertura:** Instalada a ferramenta `@vitest/coverage-v8` e adicionado o script `"coverage": "vitest run --coverage"`.
*   **Ignorar Diretório:** Ajustado `eslint.config.js` para ignorar a pasta `/coverage`.
*   **Relatório de Métricas:** Atingida a marca de **90.16% de cobertura de declarações**, **90.08% de cobertura de linhas** e **92% de cobertura de funções** (superando a meta de 80%).

---

## 📝 Tarefa 7 Concluída: Documentação e Preparação para Entrega

*   **README:** Criado o arquivo [README.md](file:///Users/leandropradopires/Projetos/mini_projeto/README.md) contendo toda a explicação do projeto, comandos de execução, arquitetura e limitações.
*   **Prompts:** Criado o arquivo [docs/prompts.md](file:///Users/leandropradopires/Projetos/mini_projeto/docs/prompts.md) detalhando as diretrizes e injeções dinâmicas de data.
*   **Slides:** Criado o arquivo [docs/apresentacao_slides.md](file:///Users/leandropradopires/Projetos/mini_projeto/docs/apresentacao_slides.md) contendo os 2 slides exigidos.
*   **Segurança:** Arquivo [.env.example](file:///Users/leandropradopires/Projetos/mini_projeto/.env.example) atualizado para incluir `GROQ_API_KEY`.
