/**
 * Registro de alertas produzidos por automações externas (low-code/no-code).
 *
 * A automação no n8n orquestra: dispara no horário agendado, chama a aplicação,
 * avalia o resultado e — quando a condição de negócio é satisfeita — registra
 * aqui o alerta. A lógica de busca de viagens permanece integralmente na
 * aplicação; o n8n apenas agenda, integra e decide o roteamento da saída.
 */

export interface Alerta {
  id: string;
  timestamp: string;
  /** Origem do alerta (ex.: "n8n:monitor-precos") */
  origem: string;
  tipo: string;
  titulo: string;
  detalhe?: string;
  /** Dados livres enviados pela automação (ex.: preço observado e limite) */
  dados?: Record<string, unknown>;
}

const MAX_ALERTAS = 500;
const alertas: Alerta[] = [];

export function registrarAlerta(entrada: Omit<Alerta, "id" | "timestamp">): Alerta {
  const alerta: Alerta = {
    id: `alerta_${alertas.length + 1}_${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    ...entrada,
  };
  alertas.push(alerta);
  if (alertas.length > MAX_ALERTAS) {
    alertas.splice(0, alertas.length - MAX_ALERTAS);
  }
  return alerta;
}

export function listarAlertas(origem?: string): Alerta[] {
  const lista = origem ? alertas.filter((a) => a.origem === origem) : [...alertas];
  // Mais recentes primeiro
  return [...lista].reverse();
}

export function limparAlertas(): void {
  alertas.length = 0;
}

/**
 * Extrai preços de um texto em português (formatos "R$ 550,00", "550.00 BRL",
 * "por 620 reais"). Usado pela automação para decidir se dispara o alerta —
 * fica na aplicação, e não no nó de código do n8n, para poder ser testado.
 */
export function extrairPrecos(texto: string): number[] {
  const precos: number[] = [];
  const padroes = [
    /R\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/gi,
    /([\d.]+,\d{2}|\d+(?:\.\d{2})?)\s*(?:BRL|reais)/gi,
  ];

  for (const padrao of padroes) {
    for (const match of texto.matchAll(padrao)) {
      const bruto = match[1];
      // "1.234,56" (pt-BR) → 1234.56 ; "550.00" (en) permanece
      const normalizado = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
      const valor = Number(normalizado);
      if (Number.isFinite(valor) && valor > 0) {
        precos.push(valor);
      }
    }
  }
  return precos;
}

export interface AvaliacaoMonitor {
  precoMinimo: number | null;
  limite: number;
  deveAlertar: boolean;
  precosEncontrados: number[];
}

/** Regra de negócio do monitor de preços: alerta quando o menor preço fica abaixo do limite */
export function avaliarMonitorDePrecos(respostaAgente: string, limite: number): AvaliacaoMonitor {
  const precos = extrairPrecos(respostaAgente);
  const precoMinimo = precos.length ? Math.min(...precos) : null;
  return {
    precoMinimo,
    limite,
    deveAlertar: precoMinimo !== null && precoMinimo < limite,
    precosEncontrados: precos,
  };
}
