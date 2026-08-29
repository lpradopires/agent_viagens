process.env.GEMINI_API_KEY = "test_gemini_key_123";
process.env.GECKO_API_KEY = "test_gecko_key_123";
delete process.env.TRAVEL_API_PROVIDER;

import { expect, test, describe, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";
import {
  extrairPrecos,
  avaliarMonitorDePrecos,
  registrarAlerta,
  listarAlertas,
  limparAlertas,
} from "../src/alerts.js";

describe("Automação low-code — extração de preços", () => {
  test("extrai preços em formato brasileiro (R$ com vírgula decimal)", () => {
    const texto = "LATAM LA3150 por R$ 550,00 e Azul AD4200 por R$ 620,00.";
    expect(extrairPrecos(texto)).toEqual([550, 620]);
  });

  test("extrai preços com separador de milhar", () => {
    expect(extrairPrecos("Diária de R$ 1.234,56 no hotel")).toEqual([1234.56]);
  });

  test("extrai preços em formato internacional e por extenso", () => {
    expect(extrairPrecos("Total: 350.00 BRL")).toContain(350);
    expect(extrairPrecos("Sai por 480 reais")).toContain(480);
  });

  test("retorna vazio quando não há preço no texto", () => {
    expect(extrairPrecos("Não encontrei voos para essa data.")).toEqual([]);
  });
});

describe("Automação low-code — regra de negócio do monitor", () => {
  test("aciona alerta quando o menor preço fica abaixo do limite", () => {
    const avaliacao = avaliarMonitorDePrecos("Opções: R$ 550,00 e R$ 620,00", 600);
    expect(avaliacao.precoMinimo).toBe(550);
    expect(avaliacao.deveAlertar).toBe(true);
    expect(avaliacao.precosEncontrados).toEqual([550, 620]);
  });

  test("não aciona alerta quando todos os preços estão acima do limite", () => {
    const avaliacao = avaliarMonitorDePrecos("Opções: R$ 900,00 e R$ 1.100,00", 600);
    expect(avaliacao.precoMinimo).toBe(900);
    expect(avaliacao.deveAlertar).toBe(false);
  });

  test("não aciona alerta quando nenhum preço é encontrado", () => {
    const avaliacao = avaliarMonitorDePrecos("Nenhum voo disponível.", 600);
    expect(avaliacao.precoMinimo).toBeNull();
    expect(avaliacao.deveAlertar).toBe(false);
  });

  test("limite é exclusivo: preço igual ao limite não alerta", () => {
    expect(avaliarMonitorDePrecos("R$ 600,00", 600).deveAlertar).toBe(false);
  });
});

describe("Automação low-code — registro e consulta de alertas", () => {
  beforeEach(() => limparAlertas());

  test("registra alerta com id e timestamp e lista do mais recente para o mais antigo", () => {
    registrarAlerta({ origem: "n8n:monitor-precos", tipo: "t", titulo: "Primeiro" });
    const segundo = registrarAlerta({ origem: "n8n:monitor-precos", tipo: "t", titulo: "Segundo" });

    expect(segundo.id).toBeDefined();
    expect(segundo.timestamp).toBeDefined();

    const lista = listarAlertas();
    expect(lista).toHaveLength(2);
    expect(lista[0].titulo).toBe("Segundo");
  });

  test("filtra alertas por origem", () => {
    registrarAlerta({ origem: "n8n:monitor-precos", tipo: "t", titulo: "Do n8n" });
    registrarAlerta({ origem: "outra", tipo: "t", titulo: "De outra origem" });

    expect(listarAlertas("n8n:monitor-precos")).toHaveLength(1);
    expect(listarAlertas("n8n:monitor-precos")[0].titulo).toBe("Do n8n");
  });
});

describe("Automação low-code — contrato HTTP consumido pelo n8n", () => {
  beforeEach(() => limparAlertas());

  test("POST /api/monitor/avaliar retorna a decisão de alerta", async () => {
    const res = await request(app)
      .post("/api/monitor/avaliar")
      .send({ resposta: "Voo por R$ 480,00 disponível", limite: 600 });

    expect(res.status).toBe(200);
    expect(res.body.precoMinimo).toBe(480);
    expect(res.body.deveAlertar).toBe(true);
  });

  test("POST /api/monitor/avaliar valida os parâmetros de entrada", async () => {
    const semResposta = await request(app).post("/api/monitor/avaliar").send({ limite: 600 });
    expect(semResposta.status).toBe(400);

    const limiteInvalido = await request(app)
      .post("/api/monitor/avaliar")
      .send({ resposta: "R$ 100,00", limite: -5 });
    expect(limiteInvalido.status).toBe(400);
  });

  test("POST /api/alertas registra e GET /api/alertas expõe a saída observável", async () => {
    const criado = await request(app)
      .post("/api/alertas")
      .send({
        origem: "n8n:monitor-precos",
        tipo: "preco_abaixo_do_limite",
        titulo: "Passagem GRU->GIG por R$ 480",
        dados: { precoMinimo: 480, limite: 600 },
      });

    expect(criado.status).toBe(201);
    expect(criado.body.id).toBeDefined();

    const listagem = await request(app).get("/api/alertas?origem=n8n:monitor-precos");
    expect(listagem.status).toBe(200);
    expect(listagem.body.total).toBe(1);
    expect(listagem.body.alertas[0].titulo).toContain("GRU->GIG");
    expect(listagem.body.alertas[0].dados.precoMinimo).toBe(480);
  });

  test("POST /api/alertas exige título", async () => {
    const res = await request(app).post("/api/alertas").send({ origem: "n8n", tipo: "t" });
    expect(res.status).toBe(400);
  });
});
