import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GeckoApiClient } from "./gecko_api_client.js";

// Instanciação preguiçosa para evitar acionamentos prematuros
let client: GeckoApiClient | null = null;
function getClient(): GeckoApiClient {
  if (!client) {
    client = new GeckoApiClient();
  }
  return client;
}

// Helper para calcular data padrão de checkout se não fornecida
function getCheckoutDefault(checkinStr: string): string {
  const checkin = new Date(checkinStr + "T12:00:00");
  checkin.setDate(checkin.getDate() + 1);
  return checkin.toISOString().split("T")[0];
}

// --- FUNÇÕES DE LIMPEZA E COMPACTAÇÃO DE TOKENS (PREVINE RATE LIMITS NO GROQ) ---

function cleanFlightsData(data: any): any[] {
  if (!data) return [];

  // Se já for um array simples (como mocks dos testes)
  if (Array.isArray(data)) {
    return data.slice(0, 5).map((f) => ({
      airline: f.cia || f.airline || f.airlineCode || "Voo",
      price: f.preco || f.price || f.amount || null,
      departure: f.departure || f.departureTime || f.date || "",
    }));
  }

  // Se for a estrutura padrão de resposta do GeckoAPI
  const trips = data.results?.trips || data.trips || [];
  if (Array.isArray(trips)) {
    return trips.slice(0, 5).map((t: any) => {
      const segments = t.segments || [];
      const firstSegment = segments[0] || {};
      const lastSegment = segments[segments.length - 1] || {};
      return {
        airline: firstSegment.flight?.airlineCode || "Voo",
        flightNumber: firstSegment.flight?.flightNumber || "",
        origin: firstSegment.origin || "",
        destination: lastSegment.destination || "",
        departure: firstSegment.departure || "",
        arrival: lastSegment.arrival || "",
        price: t.cheapestOffer?.total?.amount || t.cheapestOffer?.price || null,
        currency: t.cheapestOffer?.total?.currency || "BRL",
        stops: segments.length - 1,
      };
    });
  }

  return [];
}

function cleanHotelsData(data: any): any[] {
  if (!data) return [];

  // Se já for um array simples (como mocks dos testes)
  if (Array.isArray(data)) {
    return data.slice(0, 5).map((h) => ({
      name: h.name || h.title || h.nome || "Hospedagem",
      price: h.price || h.preco || null,
      rating: h.rating || h.avaliacao || h.score || null,
      address: h.address || h.location || h.endereco || "",
    }));
  }

  // Se for estrutura de objeto contendo lista de propriedades
  const properties = data.properties || data.hotels || data.results || [];
  if (Array.isArray(properties)) {
    return properties.slice(0, 5).map((p: any) => ({
      name: p.name || p.title || "",
      price: p.price?.total?.amount || p.price?.amount || p.rate?.amount || null,
      rating: p.rating?.score || p.rating || p.score || null,
      address: p.address?.streetAddress || p.address || p.location || "",
    }));
  }

  return [];
}

// --- FERRAMENTAS DE VOOS ---

export const buscarVoosLatam = tool(
  async ({ from, to, departureDate }) => {
    try {
      const results = await getClient().callTool("latamairlines_com_plp", {
        from,
        to,
        departureDate,
      });
      return JSON.stringify(cleanFlightsData(results));
    } catch (err: any) {
      return `Erro na busca de voos LATAM: ${err.message}`;
    }
  },
  {
    name: "buscar_voos_latam",
    description:
      "Busca passagens aéreas na LATAM Airlines. Requer origem (código IATA com 3 letras, ex: GRU), destino (código IATA com 3 letras, ex: SDU) e data de partida (YYYY-MM-DD).",
    schema: z.object({
      from: z
        .string()
        .length(3)
        .describe("Código IATA de 3 letras do aeroporto de origem (ex: GRU, CGH)"),
      to: z
        .string()
        .length(3)
        .describe("Código IATA de 3 letras do aeroporto de destino (ex: SDU, GIG)"),
      departureDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de partida (YYYY-MM-DD)"),
    }),
  }
);

export const buscarVoosAzul = tool(
  async ({ from, to, departureDate }) => {
    try {
      const results = await getClient().callTool("voeazul_com_br_plp", {
        from,
        to,
        departureDate,
      });
      return JSON.stringify(cleanFlightsData(results));
    } catch (err: any) {
      return `Erro na busca de voos Azul: ${err.message}`;
    }
  },
  {
    name: "buscar_voos_azul",
    description:
      "Busca passagens aéreas na Azul Linhas Aéreas. Requer origem (código IATA com 3 letras, ex: VCP), destino (código IATA com 3 letras, ex: CNF) e data de partida (YYYY-MM-DD).",
    schema: z.object({
      from: z
        .string()
        .length(3)
        .describe("Código IATA de 3 letras do aeroporto de origem (ex: VCP, GRU)"),
      to: z
        .string()
        .length(3)
        .describe("Código IATA de 3 letras do aeroporto de destino (ex: CNF, SDU)"),
      departureDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de partida (YYYY-MM-DD)"),
    }),
  }
);

export const buscarVoosGol = tool(
  async ({ from, to, departureDate }) => {
    try {
      const results = await getClient().callTool("voegol_com_br_plp", {
        from,
        to,
        departureDate,
      });
      return JSON.stringify(cleanFlightsData(results));
    } catch (err: any) {
      return `Erro na busca de voos GOL: ${err.message}`;
    }
  },
  {
    name: "buscar_voos_gol",
    description:
      "Busca passagens aéreas na GOL Linhas Aéreas. Requer origem (código IATA com 3 letras, ex: GRU), destino (código IATA com 3 letras, ex: SDU) e data de partida (YYYY-MM-DD).",
    schema: z.object({
      from: z
        .string()
        .length(3)
        .describe("Código IATA de 3 letras do aeroporto de origem (ex: GRU)"),
      to: z
        .string()
        .length(3)
        .describe("Código IATA de 3 letras do aeroporto de destino (ex: SDU)"),
      departureDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de partida (YYYY-MM-DD)"),
    }),
  }
);

// --- FERRAMENTAS DE HOTÉIS ---

export const buscarHoteisAirbnb = tool(
  async ({ address, startDate, endDate }) => {
    const finalCheckout = endDate || getCheckoutDefault(startDate);
    try {
      const results = await getClient().callTool("airbnb_com_br_plp", {
        address,
        startDate,
        endDate: finalCheckout,
      });
      return JSON.stringify(cleanHotelsData(results));
    } catch (err: any) {
      return `Erro na busca de hospedagens no Airbnb: ${err.message}`;
    }
  },
  {
    name: "buscar_hoteis_airbnb",
    description:
      "Busca casas, apartamentos e quartos de temporada no Airbnb. Requer cidade/local de destino (ex: Ubatuba), data de check-in (YYYY-MM-DD) e data de check-out (YYYY-MM-DD).",
    schema: z.object({
      address: z
        .string()
        .describe("Cidade ou local de destino para hospedagem (ex: Ubatuba, Florianopolis)"),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de check-in (YYYY-MM-DD)"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Data de check-out (YYYY-MM-DD)"),
    }),
  }
);

export const buscarHoteisHoteisCom = tool(
  async ({ location, checkinDate, checkoutDate }) => {
    const finalCheckout = checkoutDate || getCheckoutDefault(checkinDate);
    try {
      const results = await getClient().callTool("hoteis_com_plp", {
        location,
        checkinDate,
        checkoutDate: finalCheckout,
        numAdults: 2,
        numRooms: 1,
      });
      return JSON.stringify(cleanHotelsData(results));
    } catch (err: any) {
      return `Erro na busca de hotéis no Hoteis.com: ${err.message}`;
    }
  },
  {
    name: "buscar_hoteis_hoteis_com",
    description:
      "Busca opções de hotéis e hospedagens no site Hoteis.com. Requer a localização de destino (ex: Gramado), data de check-in (YYYY-MM-DD) e data de check-out (YYYY-MM-DD).",
    schema: z.object({
      location: z
        .string()
        .describe("Cidade ou local de destino para hospedagem (ex: Gramado, Rio de Janeiro)"),
      checkinDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de check-in (YYYY-MM-DD)"),
      checkoutDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Data de check-out (YYYY-MM-DD)"),
    }),
  }
);

export const buscarHoteisTrivago = tool(
  async ({ location, checkinDate, checkoutDate }) => {
    const finalCheckout = checkoutDate || getCheckoutDefault(checkinDate);
    try {
      const results = await getClient().callTool("trivago_com_br_plp", {
        location,
        checkinDate,
        checkoutDate: finalCheckout,
        numAdults: 2,
        numRooms: 1,
      });
      return JSON.stringify(cleanHotelsData(results));
    } catch (err: any) {
      return `Erro na busca de hotéis no Trivago: ${err.message}`;
    }
  },
  {
    name: "buscar_hoteis_trivago",
    description:
      "Busca e compara opções de hotéis e hospedagens no comparador Trivago. Requer a localização de destino (ex: Gramado), data de check-in (YYYY-MM-DD) e data de check-out (YYYY-MM-DD).",
    schema: z.object({
      location: z
        .string()
        .describe("Cidade ou local de destino para hospedagem (ex: Gramado, Rio de Janeiro)"),
      checkinDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de check-in (YYYY-MM-DD)"),
      checkoutDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Data de check-out (YYYY-MM-DD)"),
    }),
  }
);

// Exportação unificada para uso no LangGraph
export const travelTools = [
  buscarVoosLatam,
  buscarVoosAzul,
  buscarVoosGol,
  buscarHoteisAirbnb,
  buscarHoteisHoteisCom,
  buscarHoteisTrivago,
];
