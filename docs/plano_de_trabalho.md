# PLANO DE TRABALHO: DESENVOLVIMENTO DE AGENTE DE BUSCA DE VIAGENS

**Para:** Time de Desenvolvimento
**De:** Analista de Sistemas / Arquitetura
**Ref:** Mini-Projeto Avaliativo (Módulo 2) e Integração GeckoAPI

Abaixo apresento o plano de trabalho estruturado para o desenvolvimento do nosso agente de busca de viagens (passagens e hotéis), baseado em Node.js e consumindo a GeckoAPI. Este plano foi rigorosamente desenhado para atender a 100% dos critérios do mini-projeto avaliativo.

---

## 1. Mapeamento de Requisitos

**Requisitos Funcionais:**
*   **Entrada do Usuário:** O sistema deve receber do usuário a cidade de destino e a data da viagem.
*   **Processamento do Agente:** O agente autônomo deve analisar a solicitação e decidir quais ferramentas e consultas executar.
*   **Integração de Ferramentas:** O agente deve consultar a GeckoAPI para buscar passagens aéreas (ex: LATAM, GOL, Azul) e hospedagens (ex: Booking, Airbnb).
*   **Geração de Resposta:** O sistema deve consolidar os dados estruturados obtidos e retornar as melhores opções em um formato legível e útil para o usuário.

**Requisitos Não-Funcionais (Critérios de Avaliação):**
*   **Tecnologia e Framework:** A aplicação deve ser em Node.js utilizando obrigatoriamente o framework **LangGraph**.
*   **Contexto e Memória:** O estado da conversação/execução deve ser mantido utilizando a estrutura de `StateGraph`.
*   **Segurança:** Credenciais (como a API Key da GeckoAPI) **não podem** ser expostas no código ou repositório. Uso obrigatório de `.env` e `.gitignore`.
*   **Versionamento:** Uso do GitHub com branches separadas e **commits semânticos** obrigatórios.
*   **Validação:** É obrigatório aplicar validações de entrada do usuário e tratamento de erros nas chamadas das ferramentas.

---

## 2. Arquitetura Técnica

A arquitetura seguirá um fluxo orquestrado pelo LangGraph, conforme recomendado nas diretrizes do projeto: **Entrada do usuário ↓ Preparação do contexto ↓ Análise do agente ↓ Uso de ferramenta ↓ Geração da resposta final**.

*   **Componentes:**
    *   **Interface (CLI):** Camada de interação em terminal para receber destino e data.
    *   **StateGraph (LangGraph):** O motor do fluxo. Definirá o *estado compartilhado* (memória) que transita entre os nós durante a execução.
    *   **Nós (Nodes):** Funções responsáveis por: (1) analisar a entrada, (2) chamar ferramenta de voo, (3) chamar ferramenta de hotel, (4) formatar saída final.
    *   **Ferramentas (Tools):** Funções isoladas que encapsulam as chamadas HTTP para a GeckoAPI.
*   **Fluxo de Dados:** O usuário insere os dados -> O nó de análise formata os parâmetros -> O agente aciona as *tools* (GeckoAPI) -> A API retorna um JSON estruturado -> O nó final consolida a memória e exibe o resultado para o usuário.

---

## 3. Interação com a API do GeckoAPI

A integração será feita via **MCP (Model Context Protocol)** disponibilizado pela GeckoAPI.

*   **Endpoint:** POST `https://api.geckoapi.com.br/v1/mcp`
*   **Autenticação:** O cabeçalho deve utilizar `Authorization: Bearer <API_KEY>`, que será obtido exclusivamente do arquivo `.env` para garantir a segurança.
*   **Uso de Tools (Seams):** Vamos utilizar os "tools" suportados pelo MCP da GeckoAPI. Exemplos:
    *   Para voos: `latamairlines_com_plp`, `voeazul_com_br_plp`, `kayak_com_br_plp`.
    *   Para hotéis: `booking_com_br_plp`, `airbnb_com_br_plp`.
*   **Tratamento de Resposta:** O sistema deve verificar o atributo `isError: true` na resposta do servidor para lidar com falhas de comunicação e aplicar as validações necessárias.

---

## 4. Estrutura da Interface de Usuário

Para garantir a simplicidade técnica e focar na complexidade do fluxo com LangGraph (foco da avaliação), a interface será uma **CLI (Command Line Interface) interativa**.
*   O usuário inicializará a aplicação pelo terminal rodando `npm start`.
*   O sistema exibirá um prompt inicial: *"Qual o seu destino de viagem e a data desejada?"*
*   O agente processará o texto livre, extrairá as entidades (como data e local), acionará as APIs em background e devolverá no terminal um relatório consolidado e fácil de ler com as opções de hospedagem e voos.

---

## 5. Dependências e Ferramentas (Node.js)

*   `@langchain/langgraph` e `@langchain/core`: Obrigatórios para estruturar o fluxo do agente (StateGraph, nodes, edges).
*   `@langchain/openai` (ou LLM similar): Para processamento de linguagem natural e tomada de decisões.
*   `axios` ou o `fetch` nativo: Para requisições POST para o servidor MCP da GeckoAPI.
*   `dotenv`: Para carregar variáveis de ambiente (obrigatório para atender ao critério de segurança).
*   `zod` (opcional, mas recomendado): Para fazer a validação estrita das entradas de usuário e esquemas de dados.

---

## 6. Fases de Desenvolvimento e Entregas

*   **Fase 1: Setup e Padronização (Dias 1-2)**
    *   Criação do repositório no GitHub com `.gitignore` (ocultando `.env`).
    *   Configuração do padrão de commits semânticos.
    *   Esboço dos 2 slides de apresentação da ideia (Problema, Agente, Fluxo).
*   **Fase 2: Construção das Ferramentas (Dias 3-4)**
    *   Implementar funções em Node.js para bater no endpoint `/v1/mcp` da GeckoAPI.
    *   Implementar validação básica de resposta e tratamento do campo `isError`.
*   **Fase 3: Implementação do LangGraph (Dias 5-7)**
    *   Criar o `StateGraph` contendo a memória da execução.
    *   Conectar os *nodes* do fluxo e integrar as ferramentas criadas na Fase 2.
*   **Fase 4: Documentação e Prompts (Dias 8-9)**
    *   Criar e preencher a pasta e o arquivo `docs/prompts.md` detalhando como o agente foi orientado.
    *   Preencher o arquivo `README.md` com instruções de execução, exemplos de entrada e saída, e funcionamento da arquitetura.
*   **Fase 5: Revisão e Entrega (Dia 10)**
    *   Revisão final de segurança (garantir que nenhuma chave foi 'comitada').
    *   Revisão da submissão.

---

## 7. Alinhamento com Critérios Obrigatórios (Checklist)

Este plano atende os pontos críticos exigidos pelo projeto:
1.  **Versionamento e Commits (1,0 pts):** O uso de branches e commits semânticos será cobrado desde a Fase 1.
2.  **Documentação e Prompts (2,0 pts):** O plano inclui uma fase inteira (Fase 4) focada na criação estrita do `README.md` e de `docs/prompts.md`.
3.  **Apresentação (1,0 pts):** Os 2 slides explicando o problema, agente e fluxo serão elaborados logo no início.
4.  **Uso de LangGraph (1,0 pts):** A Fase 3 é dedicada integralmente ao mapeamento com `StateGraph`.
5.  **Uso de Ferramenta (1,0 pts):** Integração direta com a base de MCP da GeckoAPI (Fase 2).
6.  **Segurança (1,0 pts):** Restrição absoluta no versionamento de chaves via `.gitignore` e `dotenv`.
7.  **Memória e Validação (2,0 pts):** O StateGraph manterá a memória do usuário, e a aplicação terá validação contra erros da GeckoAPI e verificação da entrada textual do usuário via LLM.

---

## 8. Riscos e Desafios Técnicos

*   **Complexidade da Resposta (Payloads grandes):** As APIs de voos e hotéis retornam uma densidade grande de dados. O fluxo precisará tratar ou reduzir o JSON de resposta antes de injetá-lo de volta na memória do LLM para evitar o limite de tokens (*Token Limit*).
*   **Concorrência de Ferramentas:** Recomenda-se chamar primeiro a API de Voos e depois a de Hotéis de maneira sequencial (ou em nós paralelos, se viável) para não perder o rastro do estado no LangGraph.
*   **Alerta de Prazo de Entrega:** O documento lista que a entrega deve ser no dia **20/07/2026**. Contudo, existe divergência no horário exigido (o item 3 pede até as **22h**, e o item 7. Checklist aponta até as **15h**). **Mitigação Crítica:** Considerar internamente o limite das **15h** para não correr risco de invalidação.