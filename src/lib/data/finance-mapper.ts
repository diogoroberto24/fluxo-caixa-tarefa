import { toBrDate } from "@/lib/dates";
import { feeToCents } from "@/lib/data/client-mapper";
import type {
  FinancialCategory,
  HistoryEntry,
  Payable,
  Receivable,
  ReceivableCategory,
  Recurrence,
} from "@/types/domain";

/** O PostgREST devolve 1:1 como objeto e 1:N como lista; aceitamos os dois. */
type Embedded<T> = T | T[] | null;
type PaymentEmbed = { paid_on: string; amount: number | string };

function firstOf<T>(v: Embedded<T> | undefined): T | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export const RECEIVABLE_SELECT =
  "id, client_id, description, category, competence, amount, due_date, notes, installment_number, installment_total, canceled_at, cancel_reason, is_demo, created_at, payments(paid_on, amount)";

export const PAYABLE_SELECT =
  "id, description, category_id, supplier, amount, issue_date, due_date, notes, canceled_at, cancel_reason, is_demo, created_at, financial_categories(name), recurrence_rules(frequency), payments(paid_on, amount)";

export interface ReceivableRow {
  id: string;
  client_id: string;
  description: string;
  category: string;
  competence: string;
  amount: number | string;
  due_date: string;
  notes: string | null;
  installment_number: number | null;
  installment_total: number | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  is_demo: boolean;
  created_at: string;
  payments: Embedded<PaymentEmbed>;
}

export interface PayableRow {
  id: string;
  description: string;
  category_id: string;
  supplier: string;
  amount: number | string;
  issue_date: string;
  due_date: string;
  notes: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  is_demo: boolean;
  created_at: string;
  financial_categories: Embedded<{ name: string }>;
  recurrence_rules: Embedded<{ frequency: string }>;
  payments: Embedded<PaymentEmbed>;
}

/** Histórico de alterações montado a partir de criação, pagamento e cancelamento. */
function buildHistory(
  row: { created_at: string; canceled_at: string | null; cancel_reason: string | null },
  payment: PaymentEmbed | undefined,
  labels: { created: string; paid: string; canceled: string },
): HistoryEntry[] {
  const h: HistoryEntry[] = [{ at: toBrDate(row.created_at), text: labels.created }];
  if (payment) h.push({ at: payment.paid_on, text: labels.paid });
  if (row.canceled_at) {
    h.push({
      at: toBrDate(row.canceled_at),
      text: row.cancel_reason ? `${labels.canceled}: ${row.cancel_reason}` : labels.canceled,
    });
  }
  return h;
}

export function rowToReceivable(r: ReceivableRow): Receivable {
  const payment = firstOf(r.payments);
  return {
    id: r.id,
    clientId: r.client_id,
    description: r.description,
    category: r.category as ReceivableCategory,
    competence: r.competence.slice(0, 7),
    amountCents: feeToCents(r.amount),
    dueDate: r.due_date,
    paidAt: payment?.paid_on,
    paidAmountCents: payment ? feeToCents(payment.amount) : undefined,
    installmentNumber: r.installment_number ?? undefined,
    installmentTotal: r.installment_total ?? undefined,
    notes: r.notes ?? undefined,
    canceled: r.canceled_at !== null,
    history: buildHistory(r, payment, {
      created: "Cobrança gerada",
      paid: "Recebimento registrado",
      canceled: "Cobrança cancelada",
    }),
    isDemo: r.is_demo,
  };
}

export function rowToPayable(r: PayableRow): Payable {
  const payment = firstOf(r.payments);
  return {
    id: r.id,
    description: r.description,
    category: firstOf(r.financial_categories)?.name ?? "—",
    categoryId: r.category_id,
    supplier: r.supplier,
    amountCents: feeToCents(r.amount),
    issueDate: r.issue_date,
    dueDate: r.due_date,
    paidAt: payment?.paid_on,
    paidAmountCents: payment ? feeToCents(payment.amount) : undefined,
    recurrence: (firstOf(r.recurrence_rules)?.frequency ?? "NONE") as Recurrence,
    notes: r.notes ?? undefined,
    canceled: r.canceled_at !== null,
    history: buildHistory(r, payment, {
      created: "Conta lançada",
      paid: "Pagamento registrado",
      canceled: "Conta cancelada",
    }),
    isDemo: r.is_demo,
  };
}

export function rowToCategory(r: { id: string; name: string }): FinancialCategory {
  return { id: r.id, name: r.name };
}
