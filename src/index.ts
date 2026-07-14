import readline from "readline";
import { HumanMessage } from "@langchain/core/messages";
import { travelAgentGraph } from "./agent.js";
import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Identificador exclusivo de sessão conversacional para a memória de curto prazo (checkpointer)
const threadId = `cli_session_${Math.floor(Math.random() * 1000000)}`;
const config = {
  configurable: { thread_id: threadId },
  recursionLimit: 15, // Limite máximo de passos/nós por requisição para proteção contra loops
};

console.log(chalk.bold.cyan("\n======================================================="));
console.log(chalk.bold.cyan("       AGENTE DE BUSCA DE VIAGENS AUTÔNOMO             "));
console.log(chalk.bold.cyan("=======================================================\n"));
console.log(
  chalk.gray(
    "Digite sua solicitação de viagem (ex: 'Quero ir para o Rio de Janeiro dia 15/10/2026')"
  )
);
console.log(
  chalk.gray("Dica: Se precisar de passagens aéreas, informe também sua cidade de origem.")
);
console.log(chalk.gray("Digite 'sair' ou 'exit' para encerrar a sessão.\n"));

async function promptUser() {
  rl.question(chalk.bold.green("Você > "), async (input) => {
    const trimmedInput = input.trim();
    if (trimmedInput.toLowerCase() === "sair" || trimmedInput.toLowerCase() === "exit") {
      console.log(
        chalk.cyan("\nObrigado por usar o Agente de Busca de Viagens. Boa viagem! ✈️🏨\n")
      );
      rl.close();
      return;
    }

    if (!trimmedInput) {
      promptUser();
      return;
    }

    console.log(chalk.gray("\n[Agente está processando e consultando APIs...]"));

    try {
      const result = await travelAgentGraph.invoke(
        {
          messages: [new HumanMessage(trimmedInput)],
        },
        config
      );

      const lastMessage = result.messages[result.messages.length - 1];
      console.log(chalk.bold.blue("\nAgente >"));
      console.log(lastMessage.content);
      console.log(chalk.gray("\n-------------------------------------------------------"));
    } catch (error: any) {
      if (
        error.name === "GraphRecursionError" ||
        error.message?.toLowerCase().includes("recursion")
      ) {
        console.log(
          chalk.bold.red(
            "\n[Erro no Processamento]: Limite de passos/recursão do agente atingido para segurança contra loops de execução."
          )
        );
      } else {
        console.log(chalk.bold.red(`\n[Erro no Processamento]: ${error.message}`));
      }
      console.log(chalk.gray("\n-------------------------------------------------------"));
    }

    promptUser();
  });
}

promptUser();
