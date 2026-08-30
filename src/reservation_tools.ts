import { tool } from "@langchain/core/tools";
import { z } from "zod";
import crypto from "crypto";

export interface PendingReservation {
  tipo: "voo" | "hotel";
  referencia_id: string;
  /** Sessão que solicitou a reserva — só ela pode confirmá-la */
  thread_id: string;
  criadaEm: number;
}

// Registro em memória das solicitações de reserva pendentes de aprovação humana.
// Cada pendência é vinculada ao thread_id da sessão que a criou e expira após
// PENDING_TTL_MS, evitando que uma sessão confirme a reserva de outra e que
// códigos não utilizados fiquem válidos indefinidamente.
export const pendingReservations = new Map<string, PendingReservation>();

export const PENDING_TTL_MS = 15 * 60 * 1000; // 15 minutos

function purgeExpired(now: number): void {
  for (const [codigo, pendente] of pendingReservations) {
    if (now - pendente.criadaEm > PENDING_TTL_MS) {
      pendingReservations.delete(codigo);
    }
  }
}

// Código de aprovação com entropia suficiente para não ser adivinhável
// (4 dígitos permitiriam varredura trivial do espaço de códigos ativos).
function gerarCodigoConfirmacao(): string {
  return `CONF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export interface ExecutarReservaParams {
  tipo: "voo" | "hotel";
  referencia_id: string;
  codigo_confirmacao?: string;
}

/**
 * Núcleo da ação IRREVERSÍVEL SIMULADA, com aprovação humana em duas etapas:
 *
 * 1. Sem `codigo_confirmacao`: registra a solicitação como pendente (vinculada
 *    ao `threadId` da sessão) e retorna um código — a reserva NÃO é executada.
 * 2. Com `codigo_confirmacao`: só executa se o código existir, não estiver
 *    expirado, pertencer à MESMA sessão e à mesma referência. O node
 *    `tools_reserva` do grafo aplica ainda um gate determinístico extra,
 *    exigindo que o código tenha sido digitado pelo usuário.
 */
export async function executarReserva(
  { tipo, referencia_id, codigo_confirmacao }: ExecutarReservaParams,
  threadId: string
): Promise<string> {
  const agora = Date.now();
  purgeExpired(agora);

  // Etapa 2: execução mediante código de aprovação humana
  if (codigo_confirmacao) {
    const codigo = codigo_confirmacao.toUpperCase();
    const pendente = pendingReservations.get(codigo);
    if (!pendente) {
      return `Erro de validação: o código de confirmação (${codigo_confirmacao}) é inválido, já foi utilizado ou expirou. Solicite a reserva novamente para gerar um novo código.`;
    }
    if (pendente.thread_id !== threadId) {
      return `AÇÃO BLOQUEADA: o código ${codigo} pertence a outra sessão de conversa e não pode ser usado aqui.`;
    }
    if (pendente.referencia_id !== referencia_id) {
      return `Erro de validação: o código ${codigo} pertence a outra solicitação de reserva.`;
    }
    pendingReservations.delete(codigo);
    const localizador = `SIM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    return JSON.stringify({
      status: "confirmada",
      simulada: true,
      tipo: pendente.tipo,
      referencia_id: pendente.referencia_id,
      localizador,
      mensagem:
        "Reserva SIMULADA confirmada com aprovação humana. Nenhuma cobrança ou reserva real foi efetuada.",
    });
  }

  // Etapa 1: registrar a solicitação e exigir aprovação humana explícita
  const codigo = gerarCodigoConfirmacao();
  pendingReservations.set(codigo, {
    tipo,
    referencia_id,
    thread_id: threadId,
    criadaEm: agora,
  });
  return `APROVAÇÃO HUMANA NECESSÁRIA: a reserva (${tipo}: ${referencia_id}) é uma ação irreversível e NÃO foi executada. Peça ao usuário que digite o código ${codigo} para aprovar. Só chame esta ferramenta novamente com codigo_confirmacao depois que o usuário digitar o código.`;
}

/**
 * Wrapper exposto ao LLM. Dentro do grafo, o node `tools_reserva` chama
 * `executarReserva` diretamente com o `thread_id` da sessão; esta invocação
 * direta (fora do grafo) fica sem vínculo de sessão.
 */
export const confirmarReserva = tool(async (params) => executarReserva(params, "sem_thread"), {
  name: "confirmar_reserva",
  description:
    "Inicia ou conclui (em modo SIMULADO) a reserva de um voo ou hotel. FLUXO OBRIGATÓRIO EM DOIS PASSOS: " +
    "(1) Assim que o usuário pedir para reservar, chame esta ferramenta IMEDIATAMENTE, SEM o parâmetro codigo_confirmacao. " +
    "Ela devolverá um código no formato CONF-XXXXXXXX que você DEVE exibir na sua resposta ao usuário. " +
    "(2) Somente depois que o usuário digitar esse código na mensagem dele, chame esta ferramenta de novo COM codigo_confirmacao. " +
    "NUNCA peça o código ao usuário antes do passo 1 — quem gera o código é a ferramenta, não o usuário.",
  schema: z.object({
    tipo: z.enum(["voo", "hotel"]).describe("Tipo de reserva a confirmar"),
    referencia_id: z.string().describe("ID da oferta de voo ou do hotel escolhido pelo usuário"),
    codigo_confirmacao: z
      .string()
      .optional()
      .describe("Código de aprovação digitado pelo usuário (ex: CONF-1A2B3C4D)"),
  }),
});

export const reservationTools = [confirmarReserva];
