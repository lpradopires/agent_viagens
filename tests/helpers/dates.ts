/**
 * Gera uma data futura (YYYY-MM-DD) relativa ao momento em que o teste roda,
 * evitando que datas fixas "no futuro" (ex: "2026-08-15") se tornem datas
 * passadas com o avanço do tempo e quebrem as validações das tools.
 */
export function futureDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
}
