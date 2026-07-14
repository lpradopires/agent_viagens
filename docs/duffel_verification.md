# Verificação da Integração da API da Duffel (MCP)

Este guia orienta como testar e validar o funcionamento do Agente de Viagens operando sob o provedor **Duffel**.

---

## 1. Configurando o Ambiente (.env)

Edite o arquivo `.env` para selecionar a Duffel e informar suas credenciais:

```env
# Define o provedor ativo (GeckoAPI ou Duffel)
TRAVEL_API_PROVIDER=Duffel

# Token de Acesso da Duffel (Sandbox ou Produção)
# Se mantiver "mock" ou não configurar, o sistema usará dados simulados automaticamente
DUFFEL_ACCESS_TOKEN=mock
```

---

## 2. Exemplos de prompts em Linguagem Natural para Testar

Inicie a CLI do agente (`npm start`) e execute os seguintes cenários de teste:

### Cenário A: Consulta Completa (Voo + Hospedagem)

> **Você >** _Eu estou em São Paulo e preciso ir para o Rio de Janeiro dia 15/10/2026. Preciso de voos em cabine econômica e de hotel para ficar por 2 dias._

**O que o agente deve fazer:**

1. Chamar `search_airports` para resolver "São Paulo" (ex: GRU/CGH) e "Rio de Janeiro" (ex: GIG/SDU).
2. Chamar `create_offer_request` na Duffel Flights com as origens/destinos e a data `2026-10-15`.
3. Chamar `search_hotels_by_location` resolvendo de forma autônoma a latitude e longitude do Rio de Janeiro (`lat -22.9068`, `lng -43.1729`) com raio de 10km, check-in `2026-10-15` e check-out `2026-10-17`.
4. Apresentar os resultados organizados com preços e companhias reais/mockadas obtidas nas APIs.

---

## 3. Validação dos Testes Automatizados

Você pode rodar toda a suíte de testes locais da Duffel a qualquer momento usando o comando:

```bash
npm run test
```

Isso executará a suíte completa no arquivo `tests/duffel_api_client.test.ts` e confirmará que todos os endpoints de voos, hotéis, detalhes e aeroportos estão mapeando os JSONs de forma correta e segura.
