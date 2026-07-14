import { Annotation, StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { travelTools } from "./tools.js";
import { duffelTools } from "./duffel_tools.js";
import dotenv from "dotenv";

dotenv.config();

export const activeTools =
  process.env.TRAVEL_API_PROVIDER?.toLowerCase() === "duffel" ? duffelTools : travelTools;

// 1. Definição do Estado Compartilhado (AgentState)
export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left: BaseMessage[], right: BaseMessage | BaseMessage[]) => {
      return Array.isArray(right) ? left.concat(right) : left.concat([right]);
    },
    default: () => [],
  }),
  parameters: Annotation<{
    origin?: string;
    destination?: string;
    date?: string;
  }>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  flightResults: Annotation<any[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  hotelResults: Annotation<any[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  errors: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

// Inicialização preguiçosa (Lazy Loading) do Modelo com prioridade para o Gemini 2.5 (que tem cota ativa)
let model: any = null;
function getModel(): any {
  if (!model) {
    if (process.env.GEMINI_API_KEY) {
      model = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.2,
      });
    } else if (process.env.OPENAI_API_KEY) {
      model = new ChatOpenAI({
        model: "gpt-4.1-nano",
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0.2,
      });
    } else if (process.env.OPENROUTER_API_KEY) {
      model = new ChatOpenAI({
        model: "openai/gpt-4.1-nano",
        apiKey: process.env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": "https://github.com/lpradopires/agent_viagens",
            "X-Title": "Agente de Busca de Viagens",
          },
        },
        temperature: 0.2,
      });
    } else if (process.env.GROQ_API_KEY) {
      model = new ChatGroq({
        model: "llama-3.1-8b-instant",
        apiKey: process.env.GROQ_API_KEY,
        temperature: 0.2,
      });
    } else {
      throw new Error(
        "Nenhuma chave de API configurada. Configure GEMINI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY ou GROQ_API_KEY no arquivo .env."
      );
    }
  }
  return model;
}

// Prompt do Sistema detalhado
const getSystemPrompt = () => {
  const today = new Date().toISOString().split("T")[0];
  const isDuffel = process.env.TRAVEL_API_PROVIDER?.toLowerCase() === "duffel";

  if (isDuffel) {
    return `Você é o Agente de Busca de Viagens, integrado com a API da Duffel.
Hoje é dia ${today} (use este dia como referência para converter datas relativas como "amanhã", "fim de semana", "próxima segunda" no formato AAAA-MM-DD).

Suas diretrizes de processamento na Duffel:
1. Para buscar voos na Duffel, você precisa obrigatoriamente do código IATA dos aeroportos (ex: GRU, GIG). 
   - Se o usuário fornecer apenas nomes de cidades (ex: "São Paulo"), use a ferramenta 'search_airports' primeiro para resolver o nome da cidade para códigos IATA de aeroportos.
   - Depois de obter os códigos IATA de origem e destino, chame 'create_offer_request' informando a origem, destino, data de partida e passageiros para buscar ofertas de voos.
   - Você pode chamar 'get_offer_details' informando o ID da oferta obtida para detalhar regras de bagagem, conexões e políticas de viagem.
2. Para buscar hotéis na Duffel Stays, use 'search_hotels_by_location'. Esta ferramenta exige latitude e longitude geográficas.
   - Você tem a capacidade de resolver nomes de cidades brasileiras para suas respectivas coordenadas geográficas. Use as seguintes coordenadas padrão de forma autônoma:
     * São Paulo: latitude -23.5505, longitude -46.6333
     * Rio de Janeiro: latitude -22.9068, longitude -43.1729
     * Blumenau / Navegantes: latitude -26.8927, longitude -48.6492
     * Florianópolis: latitude -27.5954, longitude -48.5480
     * Gramado / Porto Alegre: latitude -30.0346, longitude -51.2177
     * Se outra cidade for informada, use coordenadas geográficas aproximadas conhecidas para a localidade.
   - Chame 'search_hotels_by_location' passando a latitude, longitude, check_in_date, check_out_date (se não informada, assuma uma diária: 1 dia após o check-in) e o raio de busca em km (padrão: 10).
   - Você pode chamar 'get_hotel_details' com o ID do hotel para obter fotos, comodidades completas e políticas de cancelamento.
3. RESPEITE ESTRITAMENTE a intenção do usuário:
   - Se ele pedir apenas passagens/voos, NÃO chame ferramentas de hotéis.
   - Se ele pedir apenas hospedagens/hotéis, NÃO chame ferramentas de voos.
4. Quando as ferramentas retornarem os dados, consolide as opções de forma clara e estruturada no terminal, apresentando os dados reais obtidos no histórico (companhias, horários, preços, comodidades, etc.). NUNCA use placeholders (ex: "[Detalhes de voo]").
5. Tratamento de Erros de Validação: Se alguma das ferramentas retornar "Erro de validação:", explique imediatamente ao usuário de forma clara e prestativa quais dados específicos (ex: data no passado) precisam ser corrigidos.
6. Evite Loops de Chamadas Repetidas: Se uma ferramenta de busca já tiver sido executada no histórico da conversa e retornado erro ou nenhuma opção viável, NÃO a chame de novo na mesma sessão. Apresente os resultados das ferramentas que funcionaram ou informe que o serviço está temporariamente indisponível.
`;
  }

  return `Você é o Agente de Busca de Viagens, integrado com a GeckoAPI.
Hoje é dia ${today} (use este dia como referência para converter datas relativas como "amanhã", "fim de semana", "próxima segunda" no formato AAAA-MM-DD).

Suas diretrizes de processamento na GeckoAPI:
1. Para buscar voos, você PRECISA de três dados obrigatórios: origem, destino e data da viagem. Se o usuário não fornecer a origem, você não deve chutar. Pergunte graciosamente: "De qual cidade ou aeroporto você vai partir?".
2. Resolução de Aeroportos Comerciais: Se a cidade de origem ou destino informada pelo usuário não possuir um aeroporto comercial com voos regulares de passageiros (ex: Blumenau, Gramado, Ubatuba, Angra dos Reis, etc.), identifique de forma autônoma o aeroporto comercial ativo mais próximo com voos regulares (ex: Blumenau -> Navegantes (NVT), Gramado -> Porto Alegre (POA), Ubatuba -> São José dos Campos (SJK) ou São Paulo (GRU), Angra dos Reis -> Rio de Janeiro (GIG)). Explique essa substituição de forma clara na sua resposta final ao usuário (ex: "Como Blumenau não possui aeroporto comercial ativo, busquei voos partindo de Navegantes (NVT)"). Execute as ferramentas de busca de voo utilizando o código IATA de 3 letras do aeroporto sugerido.
3. Se o usuário fornecer todas as informações de voo (origem, destino e data), chame as ferramentas de voo disponíveis (buscar_voos_latam, buscar_voos_azul ou buscar_voos_gol).
4. Para buscar hotéis, você precisa do destino (location / address) e da data de check-in (checkinDate / startDate). Se a data de check-out (checkoutDate / endDate) no for informada, assuma uma diária (1 dia após o check-in). Chame as ferramentas de hotéis (buscar_hoteis_airbnb, buscar_hoteis_hoteis_com, buscar_hoteis_trivago).
5. RESPEITE ESTRITAMENTE a intenção do usuário:
   - Se ele pedir apenas passagens/voos, NÃO chame ferramentas de hotéis.
   - Se ele pedir apenas hospedagens/hotéis, NÃO chame ferramentas de voos.
6. Quando as ferramentas retornarem os dados, consolide as opções de forma clara e estruturada no terminal, apresentando os dados reais das passagens ou hotéis obtidos no histórico (companhia, voos, horários, preços, notas, etc.). NUNCA use placeholders, templates ou colchetes vazios (ex: "[Detalhes de voo]"). Se os dados das buscas anteriores já estão presentes no histórico de mensagens (ToolMessages), use-os para detalhar as opções para o usuário.
7. Tratamento de Erros de Validação: Se alguma das ferramentas retornar uma resposta contendo "Erro de validação:" (como datas no passado, aeroporto de origem igual ao de destino, ou local não preenchido), você NÃO deve exibir uma lista vazia ou simular que a busca foi feita. Em vez disso, explique imediatamente ao usuário de forma clara e prestativa que a busca não pôde ser completada porque os dados XXX estão incorretos, listando quais dados específicos precisam ser corrigidos (ex: a data de partida ou a cidade de destino) para que o agente possa pesquisar com sucesso.
8. Evite Loops de Chamadas Repetidas: Se uma ferramenta de busca (ex: Trivago, Airbnb, GOL, etc.) já tiver sido executada no histórico da conversa e retornado um erro de instabilidade, erro de validação ou nenhuma opção viável, NÃO tente chamá-la de novo nas próximas rodadas conversacionais da mesma sessão. Apresente ao usuário os resultados das ferramentas que funcionaram ou informe de forma direta que aquele serviço está temporariamente indisponível, em vez de insistir em novas chamadas redundantes que causarão loops de erro.
`;
};

// 3. Implementação dos Nós (Nodes)

// Nó do Agente (LLM)
const agentNode = async (state: typeof StateAnnotation.State) => {
  const systemPrompt = getSystemPrompt();
  const messagesWithSystem = [new SystemMessage(systemPrompt), ...state.messages];

  let response;
  try {
    const modelWithTools = getModel().bindTools(activeTools);
    response = await modelWithTools.invoke(messagesWithSystem);
  } catch (err: any) {
    const errMsg = err.message || "";
    if (
      process.env.OPENROUTER_API_KEY &&
      (errMsg.includes("429") ||
        errMsg.includes("413") ||
        errMsg.includes("rate_limit") ||
        errMsg.includes("limit") ||
        errMsg.includes("too large") ||
        errMsg.includes("quota"))
    ) {
      console.warn(
        "\n[Sistema]: Limite de requisições atingido na LLM primária. Acionando fallback automático via OpenRouter..."
      );
      try {
        const fallbackModel = new ChatOpenAI({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          apiKey: process.env.OPENROUTER_API_KEY,
          configuration: {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": "https://github.com/lpradopires/agent_viagens",
              "X-Title": "Agente de Busca de Viagens",
            },
          },
          temperature: 0.2,
        }).bindTools(activeTools);
        response = await fallbackModel.invoke(messagesWithSystem);
      } catch (fallbackErr: any) {
        throw new Error(
          `Falha na LLM primária (${err.message}) e também no Fallback OpenRouter (${fallbackErr.message})`
        );
      }
    } else {
      throw err;
    }
  }

  return {
    messages: [response],
  };
};

// Função recursiva para limpar objetos e economizar consumo de tokens nas mensagens de ferramentas
function cleanObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanObject);
  }
  if (obj !== null && typeof obj === "object") {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      // Ignora chaves com conteúdo longo ou irrelevante
      if (
        lowerKey.includes("url") ||
        lowerKey.includes("image") ||
        lowerKey.includes("photo") ||
        lowerKey.includes("description") ||
        lowerKey.includes("descri") ||
        lowerKey.includes("detail") ||
        lowerKey.includes("detalhe") ||
        lowerKey.includes("html") ||
        lowerKey.includes("logo") ||
        lowerKey.includes("svg") ||
        lowerKey.includes("link")
      ) {
        continue;
      }
      cleaned[key] = cleanObject(obj[key]);
    }
    return cleaned;
  }
  return obj;
}

// Nó de Filtragem de Dados (Token Reducer)
const filterDataNode = (state: typeof StateAnnotation.State) => {
  const flightResults: any[] = [];
  const hotelResults: any[] = [];

  // Percorre as mensagens recentes para reduzir o volume de dados das ferramentas
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg.getType() === "tool" && typeof msg.content === "string") {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          // Filtra apenas os top 3 melhores resultados
          const topResults = parsed.slice(0, 3);

          // Limpa recursivamente chaves longas e inúteis (URLs, imagens, descrições)
          const cleaned = cleanObject(topResults);

          if (msg.name?.includes("voos")) {
            flightResults.push(...cleaned);
          } else if (msg.name?.includes("hoteis")) {
            hotelResults.push(...cleaned);
          }

          // Atualiza o conteúdo da mensagem por referência (in-place)
          msg.content = JSON.stringify(cleaned, null, 2);
        }
      } catch {
        // Ignora caso o conteúdo não seja um JSON válido (ex: texto de erro)
      }
    }
  }

  // Retorna apenas as atualizações para as listas específicas do estado
  return {
    flightResults,
    hotelResults,
  };
};

// Nó do Formatter (Pass-through estruturado)
const formatterNode = (_state: typeof StateAnnotation.State) => {
  return {};
};

// 4. Lógica de Roteamento Dinâmico (Router Edge)
const routeAgent = (state: typeof StateAnnotation.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && (lastMessage as any).tool_calls?.length > 0) {
    return "tools";
  }
  return "formatter";
};

// 5. Construção e Conexão do Grafo
const workflow = new StateGraph(StateAnnotation)
  .addNode("agent", agentNode)
  .addNode("tools", new ToolNode(activeTools))
  .addNode("filter", filterDataNode)
  .addNode("formatter", formatterNode);

// Define as transições do fluxo
workflow.addEdge(START, "agent");

// Roteamento condicional pós-agente
workflow.addConditionalEdges("agent", routeAgent, {
  tools: "tools",
  formatter: "formatter",
});

// Loops de execução de ferramenta e limpeza
workflow.addEdge("tools", "filter");
workflow.addEdge("filter", "agent");

// Finalização
workflow.addEdge("formatter", END);

// Compilação do Grafo com suporte à memória de sessão (MemorySaver)
export const travelAgentGraph = workflow.compile({
  checkpointer: new MemorySaver(),
});
