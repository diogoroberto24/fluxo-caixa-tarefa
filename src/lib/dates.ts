/** Utilitários de data trabalhando com strings ISO para evitar problemas de fuso. */

export const TIMEZONE = "America/Sao_Paulo";

export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(
    new Date(),
  );
}

function toUtc(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Diferença em dias: a - b. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Data do dia `day` em `ym`, limitada ao último dia do mês. */
export function dateInMonth(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Instante ISO (UTC) -> data de calendário no fuso de Brasília ("YYYY-MM-DD"). */
export function toBrDate(instant: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(new Date(instant));
}
