/**
 * Executa, via HTTP, exatamente a mesma sequência de chamadas que o fluxo do
 * n8n (`automations/n8n/monitor-precos-viagem.json`) dispara contra a
 * aplicação. Serve para validar o contrato de integração ponta a ponta sem
 * depender da interface visual — útil em CI e para depurar o fluxo.
 *
 * Uso: com o servidor rodando (`npm run server`), execute
 *      npx tsx scripts/simular_fluxo_n8n.ts [--limite 600]
 */
const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

const argLimite = process.argv.indexOf("--limite");
const LIMITE = argLimite > -1 ? Number(process.argv[argLimite + 1]) : 600;

const CONSULTA =
  "Quero um voo de Sao Paulo (GRU) para o Rio de Janeiro (GIG) daqui a 30 dias. Liste as opcoes com os precos.";

async function post(caminho: string, corpo: unknown) {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    throw new Error(`${caminho} respondeu ${resposta.status}: ${await resposta.text()}`);
  }
  return resposta.json();
}

async function main() {
  console.log(`Simulando o fluxo n8n contra ${BASE_URL} (limite: R$ ${LIMITE})\n`);

  // Nó 1-2: gatilho + parâmetros (resolvidos aqui como constantes)
  console.log("[nó: Consultar Agente de Viagens] POST /api/chat");
  const chat: any = await post("/api/chat", {
    message: CONSULTA,
    thread_id: `n8n_sim_${Date.now()}`,
  });
  console.log(`  resposta do agente (${String(chat.reply).length} chars):`);
  console.log(
    String(chat.reply)
      .split("\n")
      .map((l: string) => `    ${l}`)
      .join("\n")
  );

  // Nó 3: avaliação da regra de negócio (lógica na aplicação)
  console.log("\n[nó: Avaliar Precos] POST /api/monitor/avaliar");
  const avaliacao: any = await post("/api/monitor/avaliar", {
    resposta: chat.reply,
    limite: LIMITE,
  });
  console.log(`  ${JSON.stringify(avaliacao)}`);

  // Nó 4: roteamento condicional (IF no n8n)
  console.log(`\n[nó: Preco abaixo do limite?] → ${avaliacao.deveAlertar ? "TRUE" : "FALSE"}`);

  // Nó 5: saída observável
  const alerta = avaliacao.deveAlertar
    ? {
        origem: "n8n:monitor-precos",
        tipo: "preco_abaixo_do_limite",
        titulo: `Passagem GRU->GIG por R$ ${avaliacao.precoMinimo}`,
        detalhe: `O menor preco encontrado (R$ ${avaliacao.precoMinimo}) ficou abaixo do limite de R$ ${avaliacao.limite}.`,
        dados: avaliacao,
      }
    : {
        origem: "n8n:monitor-precos",
        tipo: "sem_oportunidade",
        titulo: "Nenhuma passagem abaixo do limite",
        detalhe: `Menor preco encontrado: R$ ${avaliacao.precoMinimo ?? "n/d"} (limite R$ ${avaliacao.limite}).`,
        dados: avaliacao,
      };

  console.log(
    `[nó: ${avaliacao.deveAlertar ? "Registrar Alerta" : "Registrar Execucao Sem Alerta"}] POST /api/alertas`
  );
  const registrado: any = await post("/api/alertas", alerta);
  console.log(`  alerta ${registrado.id} registrado`);

  // Verificação da saída observável
  const listagem = await (await fetch(`${BASE_URL}/api/alertas?origem=n8n:monitor-precos`)).json();
  console.log(`\n[saída observável] GET /api/alertas → ${listagem.total} alerta(s)`);
  console.log(JSON.stringify(listagem.alertas[0], null, 2));
}

main().catch((err) => {
  console.error("FALHA NA SIMULAÇÃO:", err.message);
  process.exit(1);
});
