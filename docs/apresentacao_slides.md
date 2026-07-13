# Apresentação do Projeto: Agente de Busca de Viagens

_Mini-Projeto Avaliativo (Módulo 2)_

---

## 🛝 SLIDE 1: Problema, Agente e Proposta de Valor

### 🔴 O Problema

Planejar viagens exige buscas manuais exaustivas por passagens aéreas e hotéis em múltiplos sites (como LATAM, Azul, Booking, Airbnb). Esse processo descentralizado é demorado, confuso e gera fricção na tomada de decisão.

### 🤖 Proposta do Agente Conversacional

Um assistente de IA conversacional autônomo baseado em **LangGraph** e **Gemini (Google AI Studio)**.

- **Objetivo:** Consolidar buscas em tempo real em um único ponto de contato.
- **Entrada Esperada:** Solicitação em linguagem natural informal (ex: _"Quero viajar de SP para o Rio na próxima sexta"_).
- **Saída Produzida:** Relatório Markdown consolidado e colorido de opções de voos e hotéis.

### 💡 Por que é considerado um Agente?

Diferente de um script de automação linear, a solução possui **autonomia cognitiva**:

1.  **NLP:** Traduz linguagem natural e datas relativas para parâmetros estruturados de API.
2.  **Validação conversacional:** Detecta dados ausentes (ex: cidade de origem) e pergunta ao usuário antes de prosseguir.
3.  **Roteamento Dinâmico:** Decide dinamicamente se deve acionar ferramentas de hotéis, voos, ambas ou nenhuma.

---

## 🛝 SLIDE 2: Fluxo de Execução e Integrações

### ⚙️ Arquitetura do Fluxo (LangGraph StateGraph)

```text
Entrada Conversacional
          ↓
  Nó Agente (Gemini 1.5)  ←─────────── (loop)
          ↓ (Router Edge)
  Nó Call Tools (GeckoAPI)
          ↓
  Nó Filter (Token Reducer)
          ↓
  Nó Formatter (Relatório CLI)
```

### 🔌 Integrações e Ferramentas Reais

- **GeckoAPI MCP:** Integração real via protocolo JSON-RPC 2.0 direcionada ao endpoint de scraping `/v1/mcp` buscando voos (LATAM, Azul, Kayak) e hotéis (Booking, Airbnb).
- **Memória em Sessão (`MemorySaver`):** Permite reter o histórico e aceitar comandos de refinamento na conversa.
- **Segurança e Resiliência:** Credenciais protegidas via `dotenv` (`.env.example` versionado) e tratamento de erros do scraping (`isError: true` / timeouts).

### 📈 Exemplo Prático de Execução (Console)

- **Você >** _"Quero apenas hotel no Rio dia 15/10/2026"_
- **Agente >** [Aciona apenas booking e airbnb; filtra dados no filter node]
  - _Resultados exibidos:_ Copacabana Palace (R$ 1.200/noite) e Apto Copacabana Airbnb (R$ 350/noite).
