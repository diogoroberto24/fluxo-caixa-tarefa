import { addDays, diffDays, monthOf } from "@/lib/dates";
import type {
  ChargeStatus,
  Client,
  Payable,
  Receivable,
} from "@/types/domain";

/**
 * Status derivado: uma cobrança não paga com vencimento no passado é VENCIDO,
 * nunca "pendente".
 */
export function chargeStatus(
  item: { canceled: boolean; paidAt?: string; dueDate: string },
  today: string,
): ChargeStatus {
  if (item.canceled) return "CANCELADO";
  if (item.paidAt) return "PAGO";
  return item.dueDate < today ? "VENCIDO" : "PENDENTE";
}

export const isOpen = (s: ChargeStatus) => s === "PENDENTE" || s === "VENCIDO";

export interface ReceivableSummary {
  /** Previsto: cobranças não canceladas com vencimento no mês. */
  expectedCents: number;
  /** Recebido: das previstas, as já pagas. */
  receivedCents: number;
  /** Pendente: não pagas com vencimento a partir de hoje. */
  pendingCents: number;
  /** Vencido: não pagas com vencimento anterior a hoje. */
  overdueCents: number;
  openCount: number;
  overdueCount: number;
  receivedPct: number;
}

export function summarizeReceivables(
  receivables: Receivable[],
  month: string,
  today: string,
): ReceivableSummary {
  const s: ReceivableSummary = {
    expectedCents: 0,
    receivedCents: 0,
    pendingCents: 0,
    overdueCents: 0,
    openCount: 0,
    overdueCount: 0,
    receivedPct: 0,
  };
  for (const r of receivables) {
    if (monthOf(r.dueDate) !== month) continue;
    const st = chargeStatus(r, today);
    if (st === "CANCELADO") continue;
    s.expectedCents += r.amountCents;
    if (st === "PAGO") s.receivedCents += r.paidAmountCents ?? r.amountCents;
    else if (st === "VENCIDO") {
      s.overdueCents += r.amountCents;
      s.openCount++;
      s.overdueCount++;
    } else {
      s.pendingCents += r.amountCents;
      s.openCount++;
    }
  }
  s.receivedPct = s.expectedCents
    ? Math.round((s.receivedCents / s.expectedCents) * 100)
    : 0;
  return s;
}

export interface OpenReceivableRow {
  receivable: Receivable;
  client?: Client;
  status: ChargeStatus;
}

/** Cobranças em aberto (pendentes + vencidas) do mês, ordenadas por vencimento. */
export function openReceivablesOfMonth(
  receivables: Receivable[],
  clients: Client[],
  month: string,
  today: string,
): OpenReceivableRow[] {
  return receivables
    .filter((r) => monthOf(r.dueDate) === month)
    .map((r) => ({
      receivable: r,
      client: clients.find((c) => c.id === r.clientId),
      status: chargeStatus(r, today),
    }))
    .filter((row) => isOpen(row.status))
    .sort((a, b) => a.receivable.dueDate.localeCompare(b.receivable.dueDate));
}

export interface PayableSummary {
  /** Em aberto: todas as não pagas e não canceladas (qualquer mês). */
  openCents: number;
  openCount: number;
  overdueCount: number;
  overdueCents: number;
  dueSoonCount: number;
}

export const DUE_SOON_DAYS = 7;

export function summarizePayables(
  payables: Payable[],
  today: string,
): PayableSummary {
  const s: PayableSummary = {
    openCents: 0,
    openCount: 0,
    overdueCount: 0,
    overdueCents: 0,
    dueSoonCount: 0,
  };
  for (const p of payables) {
    const st = chargeStatus(p, today);
    if (!isOpen(st)) continue;
    s.openCents += p.amountCents;
    s.openCount++;
    if (st === "VENCIDO") {
      s.overdueCount++;
      s.overdueCents += p.amountCents;
    } else if (p.dueDate <= addDays(today, DUE_SOON_DAYS)) {
      s.dueSoonCount++;
    }
  }
  return s;
}

export function openPayables(payables: Payable[], today: string) {
  return payables
    .map((p) => ({ payable: p, status: chargeStatus(p, today) }))
    .filter((row) => isOpen(row.status))
    .sort((a, b) => a.payable.dueDate.localeCompare(b.payable.dueDate));
}

/** Histórico de honorários (competência mais recente primeiro). */
export function feeHistory(receivables: Receivable[], clientId: string) {
  return receivables
    .filter((r) => r.clientId === clientId && r.category === "HONORARIOS")
    .sort((a, b) => b.competence.localeCompare(a.competence));
}

export type ClientStanding = "EM_DIA" | "PENDENTE" | "EM_ATRASO" | "INATIVO";

export interface ClientFinancial {
  standing: ClientStanding;
  /** Cobrança de honorários da competência atual, se existir. */
  currentCharge?: Receivable;
  currentStatus?: ChargeStatus;
}

export function clientFinancial(
  client: Client,
  receivables: Receivable[],
  today: string,
): ClientFinancial {
  const fees = feeHistory(receivables, client.id);
  const currentCharge = fees.find((f) => f.competence === monthOf(today));
  const currentStatus = currentCharge
    ? chargeStatus(currentCharge, today)
    : undefined;
  const hasOverdue = fees.some((f) => chargeStatus(f, today) === "VENCIDO");
  let standing: ClientStanding = "EM_DIA";
  if (!client.active) standing = "INATIVO";
  else if (hasOverdue) standing = "EM_ATRASO";
  else if (currentStatus === "PENDENTE") standing = "PENDENTE";
  return { standing, currentCharge, currentStatus };
}

export function daysUntil(dueDate: string, today: string) {
  return diffDays(dueDate, today);
}
