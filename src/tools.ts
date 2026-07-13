import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GeckoApiClient } from "./gecko_api_client.js";

let client: GeckoApiClient | null = null;
function getClient(): GeckoApiClient {
  if (!client) {
    client = new GeckoApiClient();
  }
  return client;
}

/**
 * Utilitário para formatar a data de check-out caso não seja enviada.
 * Adiciona 1 dia por padrão à data de check-in.
 */
function getCheckoutDefault(checkin: string): string {
  try {
    const date = new Date(checkin + "T12:00:00");
    date.setDate(date.getDate() + 1);
    return date.toISOString().split("T")[0];
  } catch {
    return checkin;
  }
}

// --- FERRAMENTAS DE VOOS ---

export const buscarVoosLatam = tool(
  async ({ origin, destination, date }) => {
    try {
      const results = await getClient().callTool("latamairlines_com_plp", {
        keyword: `voos de ${origin} para ${destination} em ${date}`,
        origin,
        destination,
        date,
      });
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro na busca de voos LATAM: ${err.message}`;
    }
  },
  {
    name: "buscar_voos_latam",
    description:
      "Busca passagens aéreas na LATAM Airlines. Requer origem (ex: GRU, Sao Paulo), destino (ex: SDU, Rio de Janeiro) e data de partida (YYYY-MM-DD).",
    schema: z.object({
      origin: z.string().describe("Cidade ou aeroporto de origem (ex: GRU, SAO, Sao Paulo)"),
      destination: z
        .string()
        .describe("Cidade ou aeroporto de destino (ex: SDU, RIO, Rio de Janeiro)"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data da viagem de partida (YYYY-MM-DD)"),
    }),
  }
);

export const buscarVoosAzul = tool(
  async ({ origin, destination, date }) => {
    try {
      const results = await getClient().callTool("voeazul_com_br_plp", {
        keyword: `voos de ${origin} para ${destination} em ${date}`,
        origin,
        destination,
        date,
      });
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro na busca de voos Azul: ${err.message}`;
    }
  },
  {
    name: "buscar_voos_azul",
    description:
      "Busca passagens aéreas na Azul Linhas Aéreas. Requer origem (ex: VCP, Campinas), destino (ex: CNF, Belo Horizonte) e data de partida (YYYY-MM-DD).",
    schema: z.object({
      origin: z.string().describe("Cidade ou aeroporto de origem (ex: VCP, Sao Paulo)"),
      destination: z.string().describe("Cidade ou aeroporto de destino (ex: CNF, Rio de Janeiro)"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data da viagem de partida (YYYY-MM-DD)"),
    }),
  }
);

export const buscarVoosKayak = tool(
  async ({ origin, destination, date }) => {
    try {
      const results = await getClient().callTool("kayak_com_br_plp", {
        keyword: `voos de ${origin} para ${destination} em ${date}`,
        origin,
        destination,
        date,
      });
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro na busca de voos Kayak: ${err.message}`;
    }
  },
  {
    name: "buscar_voos_kayak",
    description:
      "Busca passagens aéreas e ofertas no portal Kayak. Requer origem, destino e data de partida (YYYY-MM-DD). Use como ferramenta ampla de busca de voos.",
    schema: z.object({
      origin: z.string().describe("Cidade ou aeroporto de origem (ex: SAO, GRU)"),
      destination: z.string().describe("Cidade ou aeroporto de destino (ex: RIO, SDU)"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data da viagem de partida (YYYY-MM-DD)"),
    }),
  }
);

// --- FERRAMENTAS DE HOTÉIS ---

export const buscarHoteisBooking = tool(
  async ({ destination, checkin, checkout }) => {
    const finalCheckout = checkout || getCheckoutDefault(checkin);
    try {
      const results = await getClient().callTool("booking_com_br_plp", {
        keyword: destination,
        checkin,
        checkout: finalCheckout,
      });
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro na busca de hotéis no Booking: ${err.message}`;
    }
  },
  {
    name: "buscar_hoteis_booking",
    description:
      "Busca opções de hotéis e hospedagens na Booking.com. Requer a cidade de destino (ex: Gramado), data de check-in (YYYY-MM-DD) e data opcional de check-out (YYYY-MM-DD).",
    schema: z.object({
      destination: z
        .string()
        .describe("Cidade ou local de destino para hospedagem (ex: Gramado, Rio de Janeiro)"),
      checkin: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de entrada / check-in (YYYY-MM-DD)"),
      checkout: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Data de saída / check-out (YYYY-MM-DD)"),
    }),
  }
);

export const buscarHoteisAirbnb = tool(
  async ({ destination, checkin, checkout }) => {
    const finalCheckout = checkout || getCheckoutDefault(checkin);
    try {
      const results = await getClient().callTool("airbnb_com_br_plp", {
        keyword: destination,
        checkin,
        checkout: finalCheckout,
      });
      return JSON.stringify(results);
    } catch (err: any) {
      return `Erro na busca de hospedagens no Airbnb: ${err.message}`;
    }
  },
  {
    name: "buscar_hoteis_airbnb",
    description:
      "Busca casas, apartamentos e quartos de temporada no Airbnb. Requer cidade de destino (ex: Ubatuba), data de check-in (YYYY-MM-DD) e data opcional de check-out (YYYY-MM-DD).",
    schema: z.object({
      destination: z
        .string()
        .describe("Cidade ou local de destino para hospedagem (ex: Florianopolis)"),
      checkin: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Data de entrada / check-in (YYYY-MM-DD)"),
      checkout: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Data de saída / check-out (YYYY-MM-DD)"),
    }),
  }
);

// Exportação unificada para uso no LangGraph
export const travelTools = [
  buscarVoosLatam,
  buscarVoosAzul,
  buscarVoosKayak,
  buscarHoteisBooking,
  buscarHoteisAirbnb,
];
