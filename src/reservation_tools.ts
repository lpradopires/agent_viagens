import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface PendingReservation {
  tipo: "voo" | "hotel";
  referencia_id: string;
  criadaEm: string;
}

// Registro em memória das solicitações de reserva pendentes de aprovação humana.
// Segue o mesmo ciclo de vida do MemorySaver (memória do processo) — coerente com
// o modo simulado da aplicação: nenhuma reserva real é efetuada.
export const pendingReservations = new Map<string, PendingReservation>();

function gerarCodigoConfirmacao(): string {
  const numero = Math.floor(1000 + Math.random() * 9000);
  return `CONF-${numero}`;
}

/**
 * Ação IRREVERSÍVEL SIMULADA com gate de aprovação humana em duas etapas:
 *
 * 1. Chamada SEM codigo_confirmacao: registra a solicitação como pendente e
 *    retorna um código de aprovação — a reserva NÃO é executada.
 * 2. Chamada COM codigo_confirmacao: só executa (em modo simulado) se o código
 *    corresponder a uma pendência registrada. Além desta validação, o node
 *    `tools_reserva` do grafo aplica um gate determinístico extra: o código
 *    precisa ter sido digitado pelo usuário na última mensagem humana,
 *    impedindo que o próprio modelo "se auto-aprove".
 */
export const confirmarReserva = tool(
  async ({ tipo, referencia_id, codigo_confirmacao }) => {
    // Etapa 2: execução mediante código de aprovação humana
    if (codigo_confirmacao) {
      const codigo = codigo_confirmacao.toUpperCase();
      const pendente = pendingReservations.get(codigo);
      if (!pendente) {
        return `Erro de validação: o código de confirmação (${codigo_confirmacao}) é inválido ou não corresponde a nenhuma solicitação pendente. Solicite a reserva novamente para gerar um novo código.`;
      }
      if (pendente.referencia_id !== referencia_id) {
        return `Erro de validação: o código ${codigo} pertence a outra solicitação de reserva.`;
      }
      pendingReservations.delete(codigo);
      const localizador = `SIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
      criadaEm: new Date().toISOString(),
    });
    return `APROVAÇÃO HUMANA NECESSÁRIA: a reserva (${tipo}: ${referencia_id}) é uma ação irreversível e NÃO foi executada. Peça ao usuário que digite o código ${codigo} para aprovar. Só chame esta ferramenta novamente com codigo_confirmacao depois que o usuário digitar o código.`;
  },
  {
    name: "confirmar_reserva",
    description:
      "Confirma (em modo SIMULADO) a reserva de um voo ou hotel previamente pesquisado. Ação irreversível: requer aprovação humana explícita via código de confirmação. Na primeira chamada, omita codigo_confirmacao para registrar a solicitação e gerar o código; chame novamente com o código somente depois que o usuário o digitar na mensagem dele.",
    schema: z.object({
      tipo: z.enum(["voo", "hotel"]).describe("Tipo de reserva a confirmar"),
      referencia_id: z.string().describe("ID da oferta de voo ou do hotel escolhido pelo usuário"),
      codigo_confirmacao: z
        .string()
        .optional()
        .describe("Código de aprovação digitado pelo usuário (ex: CONF-1234)"),
    }),
  }
);

export const reservationTools = [confirmarReserva];
