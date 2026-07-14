import { expect, test, describe, beforeEach } from "vitest";
import { DuffelApiClient } from "../src/duffel_api_client.js";
import {
  searchAirports,
  createOfferRequest,
  getOfferDetails,
  searchHotelsByLocation,
  getHotelDetails,
} from "../src/duffel_tools.js";

describe("Duffel API Client & Tools Integration", () => {
  beforeEach(() => {
    // Garante que o ambiente esteja configurado para mock
    process.env.DUFFEL_ACCESS_TOKEN = "mock";
    process.env.TRAVEL_API_PROVIDER = "duffel";
  });

  test("DuffelApiClient deve retornar dados mockados na falta de credenciais reais", async () => {
    const client = new DuffelApiClient();
    const airports = await client.searchAirports("São Paulo");
    expect(airports.length).toBeGreaterThan(0);
    expect(airports[0].iata_code).toBe("GRU");

    const hotels = await client.searchHotelsByLocation({
      latitude: -23.5505,
      longitude: -46.6333,
      check_in_date: "2026-08-15",
      check_out_date: "2026-08-17",
    });
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels[0].name).toBe("Meliá Paulista Stays");
  });

  test("search_airports deve buscar e retornar sugestões em string JSON", async () => {
    const resp = await searchAirports.invoke({ query: "Blumenau" });
    const parsed = JSON.parse(resp);
    expect(parsed.length).toBe(1);
    expect(parsed[0].iata_code).toBe("NVT");
  });

  test("create_offer_request deve retornar ofertas formatadas e validadas", async () => {
    // 1. Data no passado deve falhar na validação local
    const respFail = await createOfferRequest.invoke({
      origin: "GRU",
      destination: "GIG",
      departure_date: "2020-01-01",
    });
    expect(respFail).toContain("Erro de validação");

    // 2. Data futura deve passar
    const respOk = await createOfferRequest.invoke({
      origin: "GRU",
      destination: "GIG",
      departure_date: "2026-08-15",
    });
    const parsed = JSON.parse(respOk);
    expect(parsed.id).toBe("off_req_mock_123");
    expect(parsed.offers.length).toBe(2);
    expect(parsed.offers[0].airline).toBe("LATAM Airlines");
    expect(parsed.offers[0].price).toBe("550.00");
  });

  test("search_hotels_by_location deve pesquisar hotéis e validar check-in/check-out", async () => {
    // 1. Check-in no passado deve falhar
    const respFail = await searchHotelsByLocation.invoke({
      latitude: -23.5505,
      longitude: -46.6333,
      check_in_date: "2020-01-01",
      check_out_date: "2020-01-03",
    });
    expect(respFail).toContain("Erro de validação");

    // 2. Check-in futuro com checkout menor que check-in deve falhar
    const respFailCheckout = await searchHotelsByLocation.invoke({
      latitude: -23.5505,
      longitude: -46.6333,
      check_in_date: "2026-08-15",
      check_out_date: "2026-08-10",
    });
    expect(respFailCheckout).toContain("Erro de validação");

    // 3. Sucesso em caso de parâmetros válidos
    const respOk = await searchHotelsByLocation.invoke({
      latitude: -23.5505,
      longitude: -46.6333,
      check_in_date: "2026-08-15",
      check_out_date: "2026-08-17",
    });
    const parsed = JSON.parse(respOk);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe("Meliá Paulista Stays");
  });

  test("get_offer_details e get_hotel_details devem retornar os detalhes corretos", async () => {
    const respOffer = await getOfferDetails.invoke({ offer_id: "off_mock_1" });
    const parsedOffer = JSON.parse(respOffer);
    expect(parsedOffer.id).toBe("off_mock_1");
    expect(parsedOffer.total_amount).toBe("550.00");

    const respHotel = await getHotelDetails.invoke({ hotel_id: "hotel_mock_1" });
    const parsedHotel = JSON.parse(respHotel);
    expect(parsedHotel.id).toBe("hotel_mock_1");
    expect(parsedHotel.amenities).toContain("Academia");
  });
});
