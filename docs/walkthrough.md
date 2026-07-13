# Walkthrough: Progresso do Desenvolvimento

Este documento acompanha o progresso de desenvolvimento do **Agente de Busca de Viagens**.

---

## 🛠️ Tarefa 1 Concluída: Setup do Ambiente e Padrões

- **npm & Git:** Inicializado o projeto com `"type": "module"` e configurada a branch padrão como `main`.
- **Linters & Formatação:** ESLint 10 (Flat Config) e Prettier instalados e integrados para TypeScript.
- **TypeScript:** Configurado `tsconfig.json` compilando para `/dist` usando `NodeNext` para suporte a ESM.
- **Git Hooks:** Husky configurado com hooks de `pre-commit` (para rodar `npm run lint`) e `commit-msg` (para validação de mensagens convencionais via `commitlint`).
- **Primeiro Commit:** Feito o commit semântico `"chore: setup project environment, standards, and git hooks"`.

---

## 🚀 Tarefa 2 Concluída: Infraestrutura de CI/CD e Testes

- **Ambiente de Testes:** Instalado o framework **Vitest** e configurado o script `"test": "vitest run"` no `package.json`.
- **Placeholder Test:** Criado o arquivo [tests/index.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/index.test.ts).
- **GitHub Actions Workflow:** Criado o workflow [.github/workflows/ci.yml](file:///Users/leandropradopires/Projetos/mini_projeto/.github/workflows/ci.yml) para rodar automaticamente lint, build (TypeScript compilation) e testes unitários em pushes e pull requests na branch `main`.

---

## 🔌 Tarefa 3 Concluída: Adaptadores da GeckoAPI (Tools)

- **Cliente MCP da GeckoAPI:** Criada a classe `GeckoApiClient` em [src/gecko_api_client.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/gecko_api_client.ts) envelopando chamadas no padrão JSON-RPC 2.0 (`method: "tools/call"`).
- **Ferramentas LangChain:** Criadas 5 ferramentas em [src/tools.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/tools.ts) com validação de entrada estrita via **Zod**: `buscar_voos_latam`, `buscar_voos_azul`, `buscar_voos_kayak`, `buscar_hoteis_booking` e `buscar_hoteis_airbnb`.
- **Testes Unitários:** Criada a suíte de testes [tests/gecko_api_client.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/gecko_api_client.test.ts) validando cenários de sucesso, erro de rede, erro RPC e `isError: true` (9 testes passando).

---

## 🧠 Tarefa 4 Concluída: Engine LangGraph e Integração Multi-Provedor (OpenRouter, Groq & Gemini)

- **Estado do Agente (`AgentState`):** Estrutura definida usando `Annotation.Root` em [src/agent.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/agent.ts).
- **Token Reducer (`filter` Node):** Varre mensagens das ferramentas, filtra top 3 resultados e otimiza o conteúdo por referência (in-place) prevenindo estouro de tokens.
- **Integração Multi-Provedor:**
  - **OpenRouter (Prioridade):** Adicionado suporte para chamadas via OpenRouter usando o modelo 100% gratuito e estável **`meta-llama/llama-3-8b-instruct:free`** via pacote `@langchain/openai` (basta configurar a chave `OPENROUTER_API_KEY`).
  - **Groq (Secundário):** Se a chave do Groq estiver ativa, utiliza o modelo `llama-3.1-8b-instant`.
  - **Gemini (Fallback):** Se nenhuma das alternativas gratuitas estiver definida, faz fallback para o modelo `gemini-2.0-flash`.
- **Isolamento de Testes:** A suíte de testes em [tests/agent.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/agent.test.ts) foi configurada para limpar as variáveis `GROQ_API_KEY` e `OPENROUTER_API_KEY` em tempo de execução, garantindo que os testes unitários rodem isolados via mocks do Gemini e passem 100% no CI (13 testes no total, todos passando).

---

## 💻 Tarefa 5 Concluída: Interface CLI Interativa

- **Loop Conversacional da CLI:** Implementado o console interativo com o módulo nativo `readline` em [src/index.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/index.ts) com suporte a `thread_id` para persistência do histórico e memória conversacional de curto prazo.
- **Cores e Estilo:** chalk integrado para diferenciar o usuário do agente e exibir avisos de sistema em cinza e erros em vermelho.
- **Execução Direta:** Script `"start": "tsx src/index.ts"` adicionado ao `package.json` para inicialização via `npm start`.

---

## 📊 Tarefa 6 Concluída: Testes, Cobertura e Validação Geral

- **Configuração de Cobertura:** Instalada a ferramenta `@vitest/coverage-v8` e adicionado o script `"coverage": "vitest run --coverage"`.
- **Ignorar Diretório:** Ajustado `eslint.config.js` para ignorar a pasta `/coverage`.
- **Relatório de Métricas:** Atingida a marca de **90.16% de cobertura de declarações**, **90.08% de cobertura de linhas** e **92% de cobertura de funções** (superando a meta de 80%).

---

## 📝 Tarefa 7 Concluída: Documentação e Preparação para Entrega

- **README:** Criado o arquivo [README.md](file:///Users/leandropradopires/Projetos/mini_projeto/README.md) contendo toda a explicação do projeto, comandos de execução, arquitetura e limitações.
- **Prompts:** Criado o arquivo [docs/prompts.md](file:///Users/leandropradopires/Projetos/mini_projeto/docs/prompts.md) detalhando as diretrizes e injeções dinâmicas de data.
- **Slides:** Criado o arquivo [docs/apresentacao_slides.md](file:///Users/leandropradopires/Projetos/mini_projeto/docs/apresentacao_slides.md) contendo os 2 slides exigidos.
- **Segurança:** Arquivo [.env.example](file:///Users/leandropradopires/Projetos/mini_projeto/.env.example) atualizado para incluir `OPENROUTER_API_KEY` e `GROQ_API_KEY`.

---

## 🛠️ Tarefa 8 Concluída: Correção de Parâmetros, Resolução de Aeroportos, Limitação de Provedores e Timeout de Segurança

- **Ajuste de Parâmetros (GeckoAPI):** Corrigidos os schemas do Zod em [src/tools.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/tools.ts) e seus mapeamentos correspondentes de modo a enviar as chaves exigidas pela API da Gecko (como `from`/`to`/`departureDate` para voos; `location` para Trivago e Hoteis.com; e `address`/`startDate`/`endDate` para o Airbnb), eliminando os erros RPC (`Tool not found` e Zod validation mismatches).
- **Mapeamento de Provedores Específicos:** Reestruturamos as 6 ferramentas de busca disponíveis:
  - **Voos:** Limitado às companhias GOL (`voegol_com_br_plp`), LATAM (`latamairlines_com_plp`) e Azul (`voeazul_com_br_plp`).
  - **Hotéis:** Limitado aos portais Airbnb (`airbnb_com_br_plp`), Hoteis.com (`hoteis_com_plp`) e Trivago (`trivago_com_br_plp`).
- **Resolução Automática de Aeroportos Comerciais (Pre-condição):** Inserida instrução cognitiva no prompt do sistema em [src/agent.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/agent.ts) para que a LLM identifique cidades de origem/destino sem aeroporto comercial comercial ativo (ex: Blumenau, Gramado, Ubatuba) e faça a resolução autônoma para o aeroporto comercial mais próximo (ex: Blumenau -> Navegantes (NVT)), avisando o usuário na resposta e prevenindo falhas de busca.
- **Timeout de Rede:** Adicionado um `AbortController` com timeout de 35 segundos para as chamadas de rede no [src/gecko_api_client.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/gecko_api_client.ts) para evitar travamento da CLI caso algum portal de terceiros demore a responder.
- **Validação de Precondições Locais:** Adicionadas verificações de validade diretamente na camada de ferramentas em [src/tools.ts](file:///Users/leandropradopires/Projetos/mini_projeto/src/tools.ts). Se a data da viagem estiver no passado ou se os aeroportos de origem e destino forem idênticos, a ferramenta retorna um erro descritivo imediatamente, sem fazer a requisição de rede para a GeckoAPI e poupando tempo e tokens.
- **Manutenção de Testes:** Atualizadas as suítes de testes unitários e de integração nos arquivos [tests/gecko_api_client.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/gecko_api_client.test.ts) e [tests/agent.test.ts](file:///Users/leandropradopires/Projetos/mini_projeto/tests/agent.test.ts) para alinhar com os novos provedores e schemas, mantendo a cobertura acima de 90% e todos os 14 testes passando.
