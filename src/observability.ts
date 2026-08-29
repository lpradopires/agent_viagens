import fs from "fs";
import path from "path";

/**
 * Observabilidade da aplicação — dois sinais correlacionados pelo `thread_id`:
 *
 * 1. LOG ESTRUTURADO DE EXECUÇÃO (`logNodeEvent`): um evento JSON por passagem
 *    de node no grafo (agent, tools_voos, tools_hoteis, tools_reserva, filter,
 *    formatter), com timestamp, duração e erro quando houver. Permite
 *    reconstruir o fluxo e a latência de uma execução.
 *
 * 2. REGISTRO DE AUDITORIA DE FERRAMENTAS (`recordAudit`): um registro por
 *    chamada de tool, com nome, parâmetros, status (success | error | blocked)
 *    e latência. Inclui as decisões de governança do gate de aprovação humana
 *    (status "blocked"), formando uma trilha auditável de ações.
 *
 * Ambos os sinais são mantidos em um buffer em memória (consultável via
 * `GET /api/debug/:thread_id` e nos testes) e espelhados em arquivos JSONL
 * (`logs/agent.jsonl` e `logs/audit.jsonl`) fora do ambiente de teste.
 */

export interface NodeLogEvent {
  timestamp: string;
  thread_id: string;
  node: string;
  duration_ms: number;
  tool_calls?: string[];
  detail?: string;
  error?: string;
}

export interface AuditRecord {
  timestamp: string;
  thread_id: string;
  tool: string;
  args: Record<string, any>;
  status: "success" | "error" | "blocked";
  duration_ms: number;
  detail?: string;
}

const MAX_BUFFER = 1000;
const executionLog: NodeLogEvent[] = [];
const auditTrail: AuditRecord[] = [];

const LOG_DIR = process.env.LOG_DIR || "logs";
const fileSinkEnabled = () => process.env.NODE_ENV !== "test";

function appendJsonl(fileName: string, record: unknown) {
  if (!fileSinkEnabled()) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, fileName), `${JSON.stringify(record)}\n`);
  } catch {
    // Falha de escrita de log nunca deve derrubar a aplicação
  }
}

function pushBounded<T>(buffer: T[], item: T) {
  buffer.push(item);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }
}

export function logNodeEvent(event: Omit<NodeLogEvent, "timestamp">): void {
  const record: NodeLogEvent = { timestamp: new Date().toISOString(), ...event };
  pushBounded(executionLog, record);
  appendJsonl("agent.jsonl", record);
}

export function recordAudit(record: Omit<AuditRecord, "timestamp">): void {
  const full: AuditRecord = { timestamp: new Date().toISOString(), ...record };
  pushBounded(auditTrail, full);
  appendJsonl("audit.jsonl", full);
}

export function getExecutionLog(threadId?: string): NodeLogEvent[] {
  return threadId ? executionLog.filter((e) => e.thread_id === threadId) : [...executionLog];
}

export function getAuditTrail(threadId?: string): AuditRecord[] {
  return threadId ? auditTrail.filter((a) => a.thread_id === threadId) : [...auditTrail];
}

// Limpeza dos buffers — uso exclusivo em testes
export function clearObservability(): void {
  executionLog.length = 0;
  auditTrail.length = 0;
}
