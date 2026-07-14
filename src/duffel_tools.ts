import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DuffelApiClient } from "./duffel_api_client.js";

let client: DuffelApiClient | null = null;
function getClient(): DuffelApiClient {
  if (!client) {
    client = new DuffelApiClient();
  }
  return client;
}

// Helper para calcular data padrão de checkout se não fornecida
function getCheckoutDefault(checkinStr: string): string {
  const checkin = new Date(checkinStr + "T12:00:00");
  checkin.setDate(checkin.getDate() + 1);
  return checkin.toISOString().split("T")[0];
}

// Helper de limpeza de ofertas da Duffel
function cleanDuffelOffers(data: any): any {
  if (!data) return {};
  const offersList = data.offers || [];
  return {
    id: data.id,
    offers: offersList.slice(0, 5).map((o: any) => {
      const slice = o.slices?.[0] || {};
      const segments = slice.segments || [];
      const firstSeg = segments[0] || {};
      const lastSeg = segments[segments.length - 1] || {};
      return {
        id: o.id,
        price: o.total_amount || o.price?.amount || null,
        currency: o.total_currency || o.price?.currency || "BRL",
        airline: firstSeg.operating_carrier?.name || "Voo",
        flightNumber: firstSeg.marketing_carrier_flight_number || "",
        departure: firstSeg.departing_at || "",
        arrival: lastSeg.arriving_at || "",
        stops: segments.length - 1,
      };
    }),
  };
}

// --- FERRAMENTAS DE VOOS ---

export const searchAirports = tool(
  async ({ query }) => {
    if (!query || query.trim().length < 2) {
      return "Erro de validação: O termo de busca deve conter pelo menos 2 caracteres.";
    }
    try {
      const results = await getClient().searchAirports(query);
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro ao buscar aeroportos na Duffel: ${err.message}`;
    }
  },
  {
    name: "search_airports",
    description:
      "Busca aeroportos e seus códigos IATA a partir do nome de uma cidade (ex: 'São Paulo' -> GRU, CGH).",
    schema: z.object({
      query: z
        .string()
        .describe("Nome da cidade ou do aeroporto (ex: 'São Paulo', 'Rio de Janeiro')"),
    }),
  }
);

export const createOfferRequest = tool(
  async ({ origin, destination, departure_date, cabin_class, passengers }) => {
    const today = new Date().toISOString().split("T")[0];
    if (departure_date < today) {
      return `Erro de validação: A data de partida (${departure_date}) está no passado. Hoje é ${today}. Por favor, informe uma data futura.`;
    }
    if (origin.toUpperCase() === destination.toUpperCase()) {
      return `Erro de validação: O aeroporto de origem (${origin}) não pode ser idêntico ao de destino (${destination}).`;
    }

    try {
      const results = await getClient().createOfferRequest({
        origin,
        destination,
        departure_date,
        cabin_class,
        passengers,
      });
      return JSON.stringify(cleanDuffelOffers(results));
    } catch (err: any) {
      return `Erro ao criar cotação de voos na Duffel: ${err.message}`;
    }
  },
  {
    name: "create_offer_request",
    description:
      "Inicia uma busca de ofertas de voos entre dois aeroportos IATA em uma data específica.",
    schema: z.object({
      origin: z.string().length(3).describe("Código IATA de 3 letras da origem (ex: GRU)"),
      destination: z.string().length(3).describe("Código IATA de 3 letras do destino (ex: GIG)"),
      departure_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data da viagem (YYYY-MM-DD)"),
      cabin_class: z
        .enum(["economy", "premium_economy", "business", "first"])
        .optional()
        .describe("Classe da cabine"),
      passengers: z
        .array(
          z.object({
            type: z.enum(["adult", "child", "infant_without_seat"]),
            age: z.number().optional(),
          })
        )
        .optional()
        .describe("Lista de passageiros"),
    }),
  }
);

export const getOfferDetails = tool(
  async ({ offer_id }) => {
    try {
      const results = await getClient().getOfferDetails(offer_id);
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro ao buscar detalhes da oferta na Duffel: ${err.message}`;
    }
  },
  {
    name: "get_offer_details",
    description:
      "Recupera detalhes adicionais de uma cotação de voo específica da Duffel, incluindo bagagens e conexões.",
    schema: z.object({
      offer_id: z.string().describe("ID único da oferta obtido em create_offer_request"),
    }),
  }
);

// --- FERRAMENTAS DE HOTÉIS ---

export const searchHotelsByLocation = tool(
  async ({ latitude, longitude, radius, check_in_date, check_out_date, rooms }) => {
    const today = new Date().toISOString().split("T")[0];
    if (check_in_date < today) {
      return `Erro de validação: A data de check-in (${check_in_date}) está no passado. Hoje é ${today}. Por favor, informe uma data futura.`;
    }
    const finalCheckout = check_out_date || getCheckoutDefault(check_in_date);
    if (finalCheckout < check_in_date) {
      return `Erro de validação: A data de check-out (${finalCheckout}) deve ser posterior à data de check-in (${check_in_date}).`;
    }

    try {
      const results = await getClient().searchHotelsByLocation({
        latitude,
        longitude,
        radius,
        check_in_date,
        check_out_date: finalCheckout,
        rooms,
      });
      return JSON.stringify(results.slice(0, 5));
    } catch (err: any) {
      return `Erro ao buscar hotéis na Duffel: ${err.message}`;
    }
  },
  {
    name: "search_hotels_by_location",
    description:
      "Busca opções de hotéis em um raio geográfico de busca (latitude, longitude) para datas específicas.",
    schema: z.object({
      latitude: z.number().describe("Latitude geográfica (ex: -23.5505 para São Paulo)"),
      longitude: z.number().describe("Longitude geográfica (ex: -46.6333 para São Paulo)"),
      radius: z.number().optional().describe("Raio de busca em quilômetros (padrão: 10)"),
      check_in_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de check-in (YYYY-MM-DD)"),
      check_out_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Data de check-out (YYYY-MM-DD)"),
      rooms: z
        .array(
          z.object({
            adults: z.number(),
            children: z.array(z.number()).optional(),
          })
        )
        .optional()
        .describe("Quartos e quantidade de hóspedes"),
    }),
  }
);

export const getHotelDetails = tool(
  async ({ hotel_id }) => {
    try {
      const results = await getClient().getHotelDetails(hotel_id);
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro ao obter detalhes do hotel na Duffel: ${err.message}`;
    }
  },
  {
    name: "get_hotel_details",
    description:
      "Recupera informações ricas e fotos de uma propriedade específica da Duffel Stays.",
    schema: z.object({
      hotel_id: z.string().describe("ID do hotel obtido na listagem de busca"),
    }),
  }
);

export const duffelTools = [
  searchAirports,
  createOfferRequest,
  getOfferDetails,
  searchHotelsByLocation,
  getHotelDetails,
];
