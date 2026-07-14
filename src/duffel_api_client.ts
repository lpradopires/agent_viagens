import dotenv from "dotenv";

dotenv.config();

export class DuffelApiClient {
  private apiToken: string;
  private baseUrl: string;

  constructor() {
    this.apiToken = process.env.DUFFEL_ACCESS_TOKEN || "";
    this.baseUrl = "https://api.duffel.com";
  }

  private isMock(): boolean {
    return !this.apiToken || this.apiToken === "mock" || this.apiToken.startsWith("sua_chave");
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Duffel-Version": "v1",
      "Content-Type": "application/json",
    };
  }

  // --- VOOS (Duffel Flights) ---

  async searchAirports(query: string): Promise<any[]> {
    if (this.isMock()) {
      console.log(`[Duffel Mock] Buscando aeroportos para: "${query}"`);
      const normalized = query.toLowerCase();
      if (normalized.includes("sao paulo") || normalized.includes("são paulo")) {
        return [
          { iata_code: "GRU", name: "Aeroporto Internacional de Guarulhos", city: "São Paulo" },
          { iata_code: "CGH", name: "Aeroporto de Congonhas", city: "São Paulo" },
        ];
      }
      if (
        normalized.includes("rio") ||
        normalized.includes("galeao") ||
        normalized.includes("santos dumont")
      ) {
        return [
          { iata_code: "GIG", name: "Aeroporto Internacional do Galeão", city: "Rio de Janeiro" },
          { iata_code: "SDU", name: "Aeroporto Santos Dumont", city: "Rio de Janeiro" },
        ];
      }
      if (normalized.includes("navegantes") || normalized.includes("blumenau")) {
        return [{ iata_code: "NVT", name: "Aeroporto de Navegantes", city: "Navegantes" }];
      }
      return [
        { iata_code: "GRU", name: "Aeroporto Internacional de Guarulhos", city: "São Paulo" },
      ];
    }

    try {
      const url = `${this.baseUrl}/places/suggestions?query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.errors?.[0]?.message || `Erro HTTP: ${response.status}`);
      }

      const resJson = await response.json();
      const suggestions = resJson.data || [];
      // Filtra apenas aeroportos
      return suggestions
        .filter((s: any) => s.type === "airport" || s.iata_code)
        .map((s: any) => ({
          iata_code: s.iata_code,
          name: s.name,
          city: s.city?.name || "",
        }));
    } catch (err: any) {
      throw new Error(`Erro na busca de aeroportos na Duffel: ${err.message}`);
    }
  }

  async createOfferRequest(params: {
    origin: string;
    destination: string;
    departure_date: string;
    cabin_class?: string;
    passengers?: Array<{ type: string; age?: number }>;
  }): Promise<any> {
    const cabin = params.cabin_class || "economy";
    const passengersList = params.passengers || [{ type: "adult" }];

    if (this.isMock()) {
      console.log(
        `[Duffel Mock] Criando oferta de voo de ${params.origin} para ${params.destination} em ${params.departure_date}`
      );
      return {
        id: "off_req_mock_123",
        offers: [
          {
            id: "off_mock_1",
            total_amount: "550.00",
            total_currency: "BRL",
            slices: [
              {
                origin: params.origin,
                destination: params.destination,
                departure_date: params.departure_date,
                segments: [
                  {
                    operating_carrier: { name: "LATAM Airlines" },
                    marketing_carrier_flight_number: "LA3150",
                    departing_at: `${params.departure_date}T08:30:00`,
                    arriving_at: `${params.departure_date}T09:45:00`,
                  },
                ],
              },
            ],
          },
          {
            id: "off_mock_2",
            total_amount: "620.00",
            total_currency: "BRL",
            slices: [
              {
                origin: params.origin,
                destination: params.destination,
                departure_date: params.departure_date,
                segments: [
                  {
                    operating_carrier: { name: "Azul Linhas Aéreas" },
                    marketing_carrier_flight_number: "AD4200",
                    departing_at: `${params.departure_date}T14:15:00`,
                    arriving_at: `${params.departure_date}T15:30:00`,
                  },
                ],
              },
            ],
          },
        ],
      };
    }

    try {
      const url = `${this.baseUrl}/air/offer_requests`;
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            slices: [
              {
                origin: params.origin,
                destination: params.destination,
                departure_date: params.departure_date,
              },
            ],
            passengers: passengersList,
            cabin_class: cabin,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.errors?.[0]?.message || `Erro HTTP: ${response.status}`);
      }

      const resJson = await response.json();
      return resJson.data;
    } catch (err: any) {
      throw new Error(`Erro ao criar requisição de voo na Duffel: ${err.message}`);
    }
  }

  async getOfferDetails(offerId: string): Promise<any> {
    if (this.isMock()) {
      console.log(`[Duffel Mock] Obtendo detalhes da oferta: ${offerId}`);
      return {
        id: offerId,
        total_amount: "550.00",
        total_currency: "BRL",
        slices: [
          {
            origin: "GRU",
            destination: "GIG",
            segments: [
              {
                operating_carrier: { name: "LATAM Airlines" },
                marketing_carrier_flight_number: "LA3150",
                departing_at: "2026-07-15T08:30:00",
                arriving_at: "2026-07-15T09:45:00",
                stops: 0,
                baggage: "1 mala de mão de 10kg inclusa",
              },
            ],
          },
        ],
      };
    }

    try {
      const url = `${this.baseUrl}/air/offers/${offerId}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.errors?.[0]?.message || `Erro HTTP: ${response.status}`);
      }

      const resJson = await response.json();
      return resJson.data;
    } catch (err: any) {
      throw new Error(`Erro ao obter detalhes do voo na Duffel: ${err.message}`);
    }
  }

  // --- HOTÉIS (Duffel Stays) ---

  async searchHotelsByLocation(params: {
    latitude: number;
    longitude: number;
    radius?: number;
    check_in_date: string;
    check_out_date: string;
    rooms?: Array<{ adults: number; children?: number[] }>;
  }): Promise<any[]> {
    const rad = params.radius || 10;
    const roomsList = params.rooms || [{ adults: 2, children: [] }];

    if (this.isMock()) {
      console.log(
        `[Duffel Mock] Buscando hotéis lat=${params.latitude} lng=${params.longitude} checkin=${params.check_in_date}`
      );
      return [
        {
          id: "hotel_mock_1",
          name: "Meliá Paulista Stays",
          location: "São Paulo, SP",
          price: { amount: "650.00", currency: "BRL" },
          rating: 4.5,
        },
        {
          id: "hotel_mock_2",
          name: "Hotel Ibis Consolação",
          location: "São Paulo, SP",
          price: { amount: "320.00", currency: "BRL" },
          rating: 4.0,
        },
      ];
    }

    try {
      const url = `${this.baseUrl}/stays/search`;
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            location: {
              latitude: params.latitude,
              longitude: params.longitude,
            },
            radius: rad,
            check_in_date: params.check_in_date,
            check_out_date: params.check_out_date,
            rooms: roomsList,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.errors?.[0]?.message || `Erro HTTP: ${response.status}`);
      }

      const resJson = await response.json();
      const properties = resJson.data?.results || resJson.data || [];
      return properties.map((p: any) => ({
        id: p.id,
        name: p.name,
        location: p.address?.city || "",
        price: p.cheapest_rate || p.price || null,
        rating: p.rating || null,
      }));
    } catch (err: any) {
      throw new Error(`Erro na busca de hotéis na Duffel: ${err.message}`);
    }
  }

  async getHotelDetails(hotelId: string): Promise<any> {
    if (this.isMock()) {
      console.log(`[Duffel Mock] Obtendo detalhes do hotel: ${hotelId}`);
      return {
        id: hotelId,
        name: "Meliá Paulista Stays",
        photos: [
          "https://images.unsplash.com/photo-1566073771259-6a8506099945",
          "https://images.unsplash.com/photo-1582719478250-c89cae4db85b",
        ],
        amenities: ["Wi-Fi gratuito", "Academia", "Piscina", "Ar condicionado"],
        cancellation_policy: "Cancelamento gratuito em até 48h antes da data de check-in.",
      };
    }

    try {
      const url = `${this.baseUrl}/stays/hotels/${hotelId}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.errors?.[0]?.message || `Erro HTTP: ${response.status}`);
      }

      const resJson = await response.json();
      return resJson.data;
    } catch (err: any) {
      throw new Error(`Erro ao obter detalhes do hotel na Duffel: ${err.message}`);
    }
  }
}
