# Automação Low-Code/No-Code — Monitor de Preços (n8n)

> Evidência da atividade 6.1 do [PLANO_EXECUCAO.md](../../../PLANO_EXECUCAO.md).
> Requisitos do PDF (item 4.9): o fluxo deve ter **ao menos um gatilho**, **integrar-se à aplicação**, produzir uma **saída observável**, manter a **lógica principal na aplicação** (a ferramenta visual atua como apoio à orquestração) e ter **instruções de reprodução no README.md**.

---

## 1. O que a automação faz

**Monitor diário de preços de passagem.** Todo dia às 9h, a automação pergunta ao agente de viagens o preço de uma rota monitorada, compara o menor valor encontrado com um limite configurado e registra um alerta observável quando há oportunidade.

```
┌──────────────────────┐
│ Gatilho Diário 09h   │  (Schedule — cron 0 9 * * *)
│ Gatilho Manual       │  (Webhook  — POST /webhook/monitor-precos)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Parâmetros do Monitor│  consulta · limitePreco (R$ 600) · urlBase
└──────────┬───────────┘
           ▼
┌──────────────────────────────────┐
│ Consultar Agente de Viagens      │  POST /api/chat        ← APLICAÇÃO
│ (LangGraph + LLM + tools)        │
└──────────┬───────────────────────┘
           ▼
┌──────────────────────────────────┐
│ Avaliar Preços                   │  POST /api/monitor/avaliar  ← APLICAÇÃO
│ (extrai preços, compara limite)  │
└──────────┬───────────────────────┘
           ▼
     ┌─────────────┐
     │ IF: alerta? │   ← única decisão que vive no n8n (roteamento)
     └──┬───────┬──┘
   true │       │ false
        ▼       ▼
┌──────────────┐ ┌───────────────────────┐
│ Registrar    │ │ Registrar Execução    │  POST /api/alertas
│ Alerta       │ │ Sem Alerta            │  ← SAÍDA OBSERVÁVEL
└──────────────┘ └───────────────────────┘
```

## 2. Divisão de responsabilidades (requisito central do item 4.9)

| Responsabilidade                                                            | Onde vive                                                   | Por quê                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Interpretar linguagem natural, orquestrar o grafo, chamar as APIs de viagem | **Aplicação** (`travelAgentGraph`)                          | É a lógica principal do produto                                                      |
| Extrair preços do texto e decidir se está abaixo do limite                  | **Aplicação** (`avaliarMonitorDePrecos` em `src/alerts.ts`) | Regra de negócio — precisa ser testável (10 testes cobrem esta função)               |
| Registrar e expor alertas                                                   | **Aplicação** (`POST/GET /api/alertas`)                     | Persistência e contrato de saída                                                     |
| Agendar, chamar os endpoints na ordem certa, rotear pelo resultado          | **n8n**                                                     | Orquestração e integração — exatamente o papel que o PDF reserva à ferramenta visual |

A regra de negócio ficou deliberadamente **fora** de um nó _Code_ do n8n: dentro do fluxo visual ela não teria teste automatizado nem versionamento revisável.

## 3. Instalação e reprodução

### 3.1 Subir a aplicação

```bash
cp .env.example .env          # configure ao menos uma chave de LLM
npm install
TRAVEL_API_PROVIDER=duffel DUFFEL_ACCESS_TOKEN=mock npm run server
# → http://localhost:3000
```

### 3.2 Subir o n8n

**Opção A — Docker (recomendada):**

```bash
docker run -it --rm --name n8n -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
# → http://localhost:5678
```

> No macOS/Windows, dentro do fluxo troque `http://localhost:3000` por
> `http://host.docker.internal:3000` para o contêiner alcançar a aplicação no host.

**Opção B — npx:**

```bash
npx n8n
```

> ⚠️ A instalação nativa depende de compilar o pacote `isolated-vm` via `node-gyp`.
> Em ambientes com Python 3.12+ ela falha com `ModuleNotFoundError: No module named 'distutils'`
> (o `distutils` foi removido do Python 3.12). Foi exatamente o que ocorreu na máquina de
> desenvolvimento deste projeto — por isso a Opção A é a recomendada.

### 3.3 Importar e executar o fluxo

1. Na interface do n8n: **Workflows → Import from File**
2. Selecione [`automations/n8n/monitor-precos-viagem.json`](../../../automations/n8n/monitor-precos-viagem.json)
3. Para testar na hora, clique em **Execute Workflow** (usa o gatilho manual/webhook)
4. Para o agendamento diário, ative o workflow (toggle **Active**) — o gatilho `Schedule` passa a rodar às 9h

### 3.4 Conferir a saída observável

```bash
curl "http://localhost:3000/api/alertas?origem=n8n:monitor-precos" | jq
```

## 4. Evidência de execução

### 4.1 Contrato de integração validado ponta a ponta

O script [`scripts/simular_fluxo_n8n.ts`](../../../scripts/simular_fluxo_n8n.ts) dispara **exatamente a mesma sequência de chamadas HTTP** que os nós do fluxo executam, contra o servidor real:

```bash
npx tsx scripts/simular_fluxo_n8n.ts --limite 600
```

Execução real registrada em [`execucao_contrato_http.txt`](execucao_contrato_http.txt) — com LLM real (`gpt-4.1-nano`) e provedor Duffel em modo mock:

```
[nó: Consultar Agente de Viagens] POST /api/chat
  → LATAM LA3150 R$ 550,00 · Azul AD4200 R$ 620,00

[nó: Avaliar Precos] POST /api/monitor/avaliar
  → {"precoMinimo":550,"limite":600,"deveAlertar":true,"precosEncontrados":[550,620]}

[nó: Preco abaixo do limite?] → TRUE

[nó: Registrar Alerta] POST /api/alertas
  → alerta alerta_1_mtex9sm6 registrado

[saída observável] GET /api/alertas → 1 alerta(s)
  {"tipo":"preco_abaixo_do_limite","titulo":"Passagem GRU->GIG por R$ 550", ...}
```

O fluxo completo funcionou: gatilho → consulta ao agente → avaliação da regra → roteamento condicional → saída observável.

### 4.2 Testes automatizados

[`tests/alerts.test.ts`](../../../tests/alerts.test.ts) — **14 testes** cobrindo a regra de negócio e o contrato HTTP que o n8n consome:

| Grupo              | Cobre                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extração de preços | Formato brasileiro (`R$ 550,00`), separador de milhar (`R$ 1.234,56`), formato internacional (`350.00 BRL`), por extenso (`480 reais`), ausência de preço |
| Regra do monitor   | Aciona abaixo do limite, não aciona acima, não aciona sem preços, limite exclusivo (preço igual não alerta)                                               |
| Registro/consulta  | Id e timestamp, ordem do mais recente, filtro por origem                                                                                                  |
| Contrato HTTP      | `POST /api/monitor/avaliar` (sucesso + validação de entrada), `POST /api/alertas` (201 + validação), `GET /api/alertas`                                   |

### 4.3 Captura da interface visual

⚠️ **Pendente de ação do usuário.** A execução dentro da interface do n8n exige subir o serviço localmente (§3.2) e capturar as telas. Recomendado incluir nesta pasta:

- `01-fluxo-importado.png` — o canvas com os 8 nós
- `02-execucao-sucesso.png` — execução com os nós verdes e os dados de cada passo
- `03-alerta-registrado.png` — retorno de `GET /api/alertas`

O JSON do fluxo, os endpoints e o contrato já estão prontos e validados; falta apenas o registro visual.

## 5. Extensão opcional (ChatOps)

O PDF cita ChatOps como extensão opcional. Para notificar em Discord/Slack, basta adicionar um nó **HTTP Request** após _Registrar Alerta_, apontando para o webhook do canal, com corpo:

```json
{ "content": "🔔 {{ $json.titulo }} — {{ $json.detalhe }}" }
```

Não foi incluído no fluxo versionado para não exigir credenciais de terceiros na entrega.

## 6. Mapeamento dos requisitos

| Requisito (item 4.9)                             | Onde está atendido                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Ao menos um gatilho                              | Dois: `Schedule` (cron diário) e `Webhook` (execução manual) — §1                       |
| Integrar-se à aplicação ou a um de seus serviços | Três endpoints reais: `/api/chat`, `/api/monitor/avaliar`, `/api/alertas` — §4.1        |
| Produzir saída observável                        | Alerta registrado e consultável em `GET /api/alertas`, com log no servidor — §3.4, §4.1 |
| Lógica principal na aplicação                    | Busca e regra de preço na aplicação (testadas); n8n só agenda, integra e roteia — §2    |
| Instruções de reprodução no README.md            | Seção "Automação Low-Code" do [README](../../../README.md) e §3 deste documento         |
