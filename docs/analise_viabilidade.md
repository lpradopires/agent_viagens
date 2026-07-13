# Análise de Viabilidade Técnica e Mapeamento de Gaps/Riscos

**Projeto:** Agente de Busca de Viagens (Passagens e Hotéis)  
**Tecnologias:** Node.js, LangGraph, Gemini (Google AI Studio) e GeckoAPI MCP  
**Autor:** Arquiteto de Sistemas Sênior  

---

## 1. Avaliação dos Requisitos em Relação à Solução Proposta

O objetivo deste documento é analisar a viabilidade da implementação do Agente de Busca de Viagens conforme o **Plano de Trabalho** e as diretrizes do **Mini-Projeto Avaliativo (Módulo 2)**. 

### Tabela de Adequação de Requisitos

| Requisito | Descrição | Status no Plano | Análise / Ajustes Necessários |
| :--- | :--- | :--- | :--- |
| **RF01 - Entrada** | Cidade de destino e data da viagem fornecidas via texto livre. | **Adequado** | Viável. A LLM fará o processamento de linguagem natural (NLP) para extrair as entidades de destino e datas. |
| **RF02 - Processamento** | Agente autônomo decide quais ferramentas e consultas executar. | **Ajustado** | **Modificado:** Substituição do fluxo sequencial rígido original por um modelo de tomada de decisão dinâmica da LLM no LangGraph (Router). |
| **RF03 - Integração** | Consultar GeckoAPI via MCP para buscar passagens e hotéis. | **Adequado** | Viável. Utilizaremos requisições HTTP envelopadas em formato JSON-RPC 2.0 compatível com o endpoint `/v1/mcp`. |
| **RF04 - Resposta** | Consolidar os dados obtidos e retornar as melhores opções formatadas. | **Adequado** | O relatório final será estruturado em Markdown e exibido de forma visualmente agradável na CLI. |
| **RNF01 - Tech Stack** | Node.js + LangGraph (`@langchain/langgraph`). | **Adequado** | Uso obrigatório da biblioteca oficial para JS/TS. |
| **RNF02 - Memória** | Estado da conversação mantido usando `StateGraph`. | **Adequado** | Uso de checkpoints (`MemorySaver`) para manter o histórico conversacional. |
| **RNF03 - Segurança** | Proibido expor credenciais. Uso de `.env` e `.gitignore`. | **Ajustado** | Adicionada a obrigatoriedade de criar `.env.example` sem valores e validação de chaves na inicialização. |
| **RNF04 - Versionamento** | Uso do GitHub com commits semânticos e branches. | **Adequado** | Definição de convenção de commits e fluxos na equipe. |
| **RNF05 - Validação** | Validação de entradas e tratamento de erros nas APIs. | **Adequado** | Integração com Zod e verificação do status `isError: true` no retorno da GeckoAPI. |

---

## 2. Lacunas de Arquitetura Identificadas (Gaps) e Soluções

Após a revisão detalhada do fluxo do projeto, foram identificados 4 gaps críticos que foram solucionados e aprovados pelo cliente/usuário:

### Gap 1: Ausência de Cidade de Origem para Busca de Voos
* **Problema:** O plano inicial indicava que o usuário digitaria apenas a cidade de destino e a data. Contudo, APIs de busca de passagens aéreas (como LATAM, Azul ou Kayak) exigem **obrigatoriamente** um aeroporto ou cidade de origem (`origin`) para calcular as rotas. Sem isso, as requisições à GeckoAPI falhariam sistematicamente.
* **Solução Implementada:** A interface CLI foi ajustada para solicitar tanto a cidade de origem quanto a de destino e a data da viagem. A LLM de processamento inicial foi instruída no seu prompt de sistema a extrair três entidades básicas: `origem`, `destino` e `data_viagem`.

### Gap 2: Rigidez de Pipeline vs. Autonomia do Agente
* **Problema:** O plano propunha um grafo rígido onde o sistema sempre executava a busca de voo e depois a de hotel de forma sequencial. Isso viola o requisito de "agente autônomo que decide quais ferramentas executar". Além de desperdiçar créditos de API e processamento quando o usuário só precisa de um dos serviços.
* **Solução Implementada:** Arquitetura alterada para **fluxo dinâmico de tomada de decisão**. A LLM do Gemini avalia o input do usuário e gera tool calls apenas para as ferramentas necessárias (podendo optar por chamar somente voo, somente hotel, ambos ou nenhum, caso a pergunta do usuário seja apenas informativa).

### Gap 3: Envelopamento do Protocolo MCP via HTTP
* **Problema:** O plano cita o endpoint `https://api.geckoapi.com.br/v1/mcp` mas não especifica o protocolo. O Model Context Protocol (MCP), quando consumido diretamente por um cliente HTTP, opera via mensagens estruturadas JSON-RPC 2.0 (`method: "tools/call"`).
* **Solução Implementada:** Implementação de uma camada de adaptador (`GeckoApiClient`) que transforma chamadas de funções normais do Node.js em payloads JSON-RPC 2.0, enviando os parâmetros para o endpoint em um envelope apropriado, facilitando a portabilidade.

### Gap 4: Esquecimento do `.env.example` no Plano de Trabalho
* **Problema:** Para atender 100% ao critério de avaliação de segurança (que vale 1,0 ponto), o repositório deve fornecer um `.env.example` contendo apenas os nomes das variáveis para instruir os avaliadores, sem vazar chaves reais.
* **Solução Implementada:** Tarefa explícita de criação e manutenção do arquivo `.env.example` contendo as variáveis `GECKO_API_KEY` e `GEMINI_API_KEY` inserida na primeira etapa do plano de desenvolvimento.

---

## 3. Análise de Riscos e Estratégias de Mitigação

Esta seção lista os principais riscos técnicos que podem comprometer a estabilidade ou a nota do projeto, com suas respectivas ações mitigadoras.

### Risco 1: Limite de Tokens (*Token Limit*) por Payloads Excessivos da GeckoAPI
* **Impacto:** Alto. As APIs de raspagem de voos e hotéis retornam listas longas com muitos detalhes. Se passadas brutas para o Gemini, o histórico conversacional crescerá rápido demais, degradando a performance e gerando custos/erros de limite de taxa.
* **Mitigação:** Criação de um nó intermediário no LangGraph chamado **`Filter Node` (Token Reducer)**. Este nó interceptará a resposta crua das ferramentas, filtrará apenas as 3 melhores ofertas de voo e hotel, e removerá campos JSON irrelevantes (como metadados de layout de página, IDs de rastreamento longos) antes de enviar os dados limpos ao contexto da LLM.

### Risco 2: Instabilidade e Tempo de Resposta Longo da GeckoAPI
* **Impacto:** Médio-Alto. Como a GeckoAPI executa scrapers em tempo real para obter os preços mais recentes das companhias aéreas e plataformas de hotéis, as requisições podem demorar de 10 a 20 segundos ou retornar erros inesperados (indicados pelo parâmetro `isError: true` no JSON).
* **Mitigação:** 
  1. Configuração de um timeout estrito de 20 segundos em requisições HTTP via Axios.
  2. Implementação de tratativas no adaptador para ler o campo `isError: true`. Se detectado, o sistema não lançará uma exceção que crashe o software; em vez disso, retornará uma string descritiva de erro para a LLM (ex: `"Erro na busca da LATAM. O serviço está temporariamente indisponível."`), permitindo que a LLM decida buscar por outra companhia ou informar o usuário de forma elegante.

### Risco 3: Parsing Incorreto de Datas por Parte do Usuário
* **Impacto:** Médio. O usuário pode escrever datas de forma informal como "amanhã", "fim de semana que vem", "12/dez". A API da GeckoAPI exige formato estrito `YYYY-MM-DD`.
* **Mitigação:** O Gemini 1.5 Flash será instruído com a data atual do sistema (obtida programaticamente em JS via `new Date()`) em seu prompt de sistema. Ele traduzirá termos informais para a data correta no formato ISO correspondente. O schema Zod nas ferramentas validará se a data resultante atende à expressão regular `^\d{4}-\d{2}-\d{2}$` e se a data não está no passado.

### Risco 4: Divergência de Horários de Entrega no Edital (Prazo Limite)
* **Impacto:** Crítico. O edital cita duas horas limite de entrega para o dia 20/07/2026: às 15h e às 22h.
* **Mitigação:** A equipe adotará internamente o prazo limite das **15:00h** do dia **20/07/2026**. Todas as pipelines de testes e documentação final serão congeladas até às 12:00h do mesmo dia para evitar problemas com instabilidades no AVA da instituição.
