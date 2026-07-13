# Registro e Engenharia de Prompts do Agente de Viagens

Este documento registra a engenharia de prompts, as diretrizes de instrução e a evolução das definições enviadas ao modelo **Gemini 1.5 Flash** para o correto processamento do Agente de Viagens no LangGraph.

---

## 📝 Prompt do Sistema Principal (System Prompt)

O prompt de sistema é a "personalidade" e o conjunto de regras do agente. Ele é injetado no início do histórico de mensagens antes de cada chamada cognitiva ao Gemini.

### Prompt Atualizado:

```text
Você é o Agente de Busca de Viagens, um assistente inteligente e prestativo especializado em encontrar passagens aéreas e hotéis.
Hoje é dia ${today} (use este dia como referência para converter datas relativas como "amanhã", "fim de semana", "próxima segunda" no formato AAAA-MM-DD).

Suas diretrizes de processamento:
1. Para buscar voos, você PRECISA de três dados obrigatórios: origem, destino e data da viagem. Se o usuário não fornecer a origem, você não deve chutar. Pergunte graciosamente: "De qual cidade ou aeroporto você vai partir?".
2. Resolução de Aeroportos Comerciais: Se a cidade de origem ou destino informada pelo usuário não possuir um aeroporto comercial com voos regulares de passageiros (ex: Blumenau, Gramado, Ubatuba, Angra dos Reis, etc.), identifique de forma autônoma o aeroporto comercial ativo mais próximo com voos regulares (ex: Blumenau -> Navegantes (NVT), Gramado -> Porto Alegre (POA), Ubatuba -> São José dos Campos (SJK) ou São Paulo (GRU), Angra dos Reis -> Rio de Janeiro (GIG)). Explique essa substituição de forma clara na sua resposta final ao usuário (ex: "Como Blumenau não possui aeroporto comercial ativo, busquei voos partindo de Navegantes (NVT)"). Execute as ferramentas de busca de voo utilizando o código IATA de 3 letras do aeroporto sugerido.
3. Se o usuário fornecer todas as informações de voo (origem, destino e data), chame as ferramentas de voo disponíveis (buscar_voos_latam, buscar_voos_azul ou buscar_voos_kayak).
4. Para buscar hotéis, você precisa do destino e da data de check-in (checkin). Se a data de check-out (checkout) não for informada, assuma uma diária (1 dia após o check-in). Chame as ferramentas de hotéis (buscar_hoteis_booking, buscar_hoteis_airbnb).
5. RESPEITE ESTRITAMENTE a intenção do usuário:
   - Se ele pedir apenas passagens/voos, NÃO chame ferramentas de hotéis.
   - Se ele pedir apenas hospedagens/hotéis, NÃO chame ferramentas de voos.
6. Quando as ferramentas retornarem os dados, consolide as opções de forma clara e visualmente estruturada no terminal, destacando preços, companhias e nomes dos hotéis. Indique que os dados foram obtidos em tempo real.
```

---

## 🛠️ Engenharia e Justificativas de Design do Prompt

### 1. Injeção de Data Dinâmica (`Today`)

- **Problema:** Modelos de linguagem sofrem de desorientação temporal, desconhecendo o dia atual do sistema. Se o usuário diz _"quero viajar amanhã"_, o modelo gerará uma data inconsistente ou falhará.
- **Solução:** Injetamos a variável programática `${today}` obtida via `new Date().toISOString().split("T")[0]` no prompt do sistema antes da chamada. Isso permite que o Gemini realize a computação temporal relativa (ex: se hoje é `2026-07-13`, "amanhã" será `2026-07-14`) e monte os parâmetros da ferramenta em `YYYY-MM-DD` com precisão de 100%.

### 2. Validação Conversacional de Origem (Cidade de Partida)

- **Problema:** Usuários costumam informar apenas o destino ("quero ir pro Rio"). APIs de passagens aéreas exigem obrigatoriamente a origem para cotar preços.
- **Solução:** O prompt força a LLM a identificar a falta do parâmetro `origin` e, ao invés de acionar ferramentas cegamente ou chutar uma origem padrão, responder ao usuário solicitando o dado ausente. Isso garante validação conversacional limpa no terminal.

### 3. Resolução de Aeroportos Mais Próximos (IATA Codes)

- **Problema:** Se o usuário informa uma origem/destino que não possui um aeroporto comercial (ex: "Blumenau" ou "Gramado"), os buscadores de voos falharão ou rejeitarão a busca porque não há rotas comerciais regulares neles.
- **Solução:** O prompt delega à LLM a capacidade cognitiva de mapear de forma autônoma a cidade informada para o aeroporto comercial mais próximo dotado de rotas (ex: Blumenau mapeia para Navegantes - NVT). O agente informa essa substituição de maneira amigável e aciona as ferramentas utilizando o código IATA correspondente, garantindo a execução robusta da busca.

### 4. Restrição de Escopo (Foco em Intenção)

- **Problema:** Modelos generativos tendem a ser "proativos" demais, buscando hotéis mesmo quando o usuário só pediu passagens, gerando latência e gastos de API indesejados.
- **Solução:** A instrução de respeito estrito à intenção (`Diretriz 4`) define que o modelo só chame a categoria de ferramenta correspondente ao pedido explícito do usuário. Se ele pedir apenas voos, as ferramentas de hotéis são bloqueadas na tomada de decisão.

### 4. Formatação de Relatório Final

- **Problema:** Respostas em formato Markdown cru nem sempre ficam organizadas no terminal.
- **Solução:** Instruímos o Gemini a consolidar as respostas destacando preços, companhias, nomes de hotéis e notas estruturadas. Isso auxilia o renderizador CLI (Chalk) a exibir relatórios limpos e legíveis.

---

## 🔄 Evolução e Melhorias nos Prompts (Refinamentos)

### Iteração 1 (Prompt Inicial Simples):

> _"Busque voos e hotéis baseando-se no que o usuário digitar e dê as opções mais baratas."_

- **Falha:** O modelo chamava as ferramentas de hotéis com parâmetros vazios de data, gerando erros HTTP 400. Ele também assumia a origem dos voos como "São Paulo" por padrão, gerando consultas incorretas caso o usuário estivesse em outra localidade.

### Iteração 2 (Com Validação de Dados):

> _"Verifique se você tem a origem, destino e data antes de buscar. Caso contrário, peça os dados."_

- **Falha:** O modelo ainda tentava inferir datas textuais (ex: passando `"no próximo feriado"` diretamente para o Zod das ferramentas), gerando erros de validação de expressão regular no Zod (`regex /^\d{4}-\d{2}-\d{2}$/`).

### Iteração 3 (Instrução de Conversão e Data de Hoje - Atual):

> _Adicionada a injeção dinâmica da data atual no cabeçalho e instrução estrita para que a LLM fizesse a conversão para `YYYY-MM-DD` antes de preencher os argumentos da ferramenta._

- **Resultado:** O Gemini assumiu o papel de parser de datas de forma robusta, convertendo linguagem natural informal (ex: "sábado que vem") para strings ISO corretas exigidas pelas APIs externas.
