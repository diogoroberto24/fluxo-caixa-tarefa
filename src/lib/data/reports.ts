import "server-only";
import { listActiveUsers } from "@/lib/auth/session";
import { diffDays, monthOf } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { competenceLabel, formatDocument } from "@/lib/format";
import type { CellValue, ReportData, ReportType } from "@/lib/reports";
import { chargeStatus } from "@/services/finance";
import { TASK_STATUS_LABEL, taskUrgency } from "@/services/tasks";
import type { Client, Payable, Receivable } from "@/types/domain";
import { feeToCents } from "./client-mapper";
import { listClients } from "./clients";
import {
  PAYABLE_SELECT,
  RECEIVABLE_SELECT,
  rowToPayable,
  rowToReceivable,
  type PayableRow,
  type ReceivableRow,
} from "./finance-mapper";
import { listTasksBetween } from "./tasks";

const PAGE = 1000;
const MAX_ROWS = 20000;

const STATUS_LABEL = { PAGO: "Pago", PENDENTE: "Pendente", VENCIDO: "Vencido", CANCELADO: "Cancelado" } as const;

/** Lê todas as páginas de uma consulta, até o limite de linhas. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return { rows, truncated: false };
    if (rows.length >= MAX_ROWS) return { rows, truncated: true };
  }
}

async function receivablesDue(from: string, to: string) {
  const supabase = await createClient();
  const { rows, truncated } = await fetchAll<ReceivableRow>((a, b) =>
    supabase
      .from("receivables")
      .select(RECEIVABLE_SELECT)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date")
      .order("id")
      .range(a, b),
  );
  return { items: rows.map(rowToReceivable), truncated };
}

async function payablesDue(from: string, to: string) {
  const supabase = await createClient();
  const { rows, truncated } = await fetchAll<PayableRow>((a, b) =>
    supabase
      .from("payables")
      .select(PAYABLE_SELECT)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date")
      .order("id")
      .range(a, b),
  );
  return { items: rows.map(rowToPayable), truncated };
}

const clientMap = (clients: Client[]) => new Map(clients.map((c) => [c.id, c]));

function months(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const base = (type: ReportType, title: string, from: string, to: string, today: string) => ({
  type,
  title,
  from,
  to,
  generatedAt: today,
});

export async function buildReport(type: ReportType, from: string, to: string, today: string): Promise<ReportData> {
  switch (type) {
    case "receber":
    case "inadimplencia":
      return receivablesReport(type, from, to, today);
    case "pagar":
      return payablesReport(from, to, today);
    case "fluxo":
      return cashflowReport(from, to, today);
    case "tarefas":
      return tasksReport(from, to, today);
  }
}

async function receivablesReport(type: "receber" | "inadimplencia", from: string, to: string, today: string): Promise<ReportData> {
  const [{ items, truncated }, clients] = await Promise.all([receivablesDue(from, to), listClients()]);
  const byId = clientMap(clients);
  const withStatus = items.map((r: Receivable) => ({ r, st: chargeStatus(r, today), c: byId.get(r.clientId) }));

  if (type === "inadimplencia") {
    const overdue = withStatus
      .filter((x) => x.st === "VENCIDO")
      .sort((a, b) => a.r.dueDate.localeCompare(b.r.dueDate));
    const total = overdue.reduce((s, x) => s + x.r.amountCents, 0);
    return {
      ...base(type, "Inadimplência", from, to, today),
      columns: [
        { key: "cliente", label: "Cliente", kind: "text" },
        { key: "documento", label: "CNPJ / CPF", kind: "text" },
        { key: "descricao", label: "Descrição", kind: "text" },
        { key: "competencia", label: "Competência", kind: "text" },
        { key: "vencimento", label: "Vencimento", kind: "date" },
        { key: "atraso", label: "Dias de atraso", kind: "int" },
        { key: "valor", label: "Valor", kind: "money" },
      ],
      rows: overdue.map(({ r, c }) => ({
        cliente: c?.tradeName ?? "Cliente removido",
        documento: c ? formatDocument(c.document) : null,
        descricao: r.description,
        competencia: competenceLabel(r.competence),
        vencimento: r.dueDate,
        atraso: diffDays(today, r.dueDate),
        valor: r.amountCents,
      })),
      summary: [
        { label: "Total vencido", value: total, kind: "money", tone: "danger" },
        { label: "Cobranças vencidas", value: overdue.length, kind: "int" },
        { label: "Clientes inadimplentes", value: new Set(overdue.map((x) => x.r.clientId)).size, kind: "int" },
      ],
      truncated,
    };
  }

  let total = 0, received = 0, pending = 0, overdueSum = 0;
  for (const { r, st } of withStatus) {
    if (st === "CANCELADO") continue;
    total += r.amountCents;
    if (st === "PAGO") received += r.paidAmountCents ?? r.amountCents;
    else if (st === "VENCIDO") overdueSum += r.amountCents;
    else pending += r.amountCents;
  }
  return {
    ...base(type, "Contas a receber", from, to, today),
    columns: [
      { key: "cliente", label: "Cliente", kind: "text" },
      { key: "documento", label: "CNPJ / CPF", kind: "text" },
      { key: "descricao", label: "Descrição", kind: "text" },
      { key: "competencia", label: "Competência", kind: "text" },
      { key: "vencimento", label: "Vencimento", kind: "date" },
      { key: "pagamento", label: "Pagamento", kind: "date" },
      { key: "valor", label: "Valor", kind: "money" },
      { key: "status", label: "Status", kind: "text" },
    ],
    rows: withStatus.map(({ r, st, c }) => ({
      cliente: c?.tradeName ?? "Cliente removido",
      documento: c ? formatDocument(c.document) : null,
      descricao: r.description,
      competencia: competenceLabel(r.competence),
      vencimento: r.dueDate,
      pagamento: r.paidAt ?? null,
      valor: r.amountCents,
      status: STATUS_LABEL[st],
    })),
    summary: [
      { label: "Total das cobranças", value: total, kind: "money" },
      { label: "Recebido", value: received, kind: "money", tone: "success" },
      { label: "Pendente", value: pending, kind: "money", tone: "warning" },
      { label: "Vencido", value: overdueSum, kind: "money", tone: "danger" },
    ],
    truncated,
  };
}

async function payablesReport(from: string, to: string, today: string): Promise<ReportData> {
  const { items, truncated } = await payablesDue(from, to);
  const rows = items.map((p: Payable) => ({ p, st: chargeStatus(p, today) }));
  let total = 0, paid = 0, open = 0, overdue = 0;
  for (const { p, st } of rows) {
    if (st === "CANCELADO") continue;
    total += p.amountCents;
    if (st === "PAGO") paid += p.paidAmountCents ?? p.amountCents;
    else if (st === "VENCIDO") { overdue += p.amountCents; open += p.amountCents; }
    else open += p.amountCents;
  }
  return {
    ...base("pagar", "Contas a pagar", from, to, today),
    columns: [
      { key: "descricao", label: "Descrição", kind: "text" },
      { key: "categoria", label: "Categoria", kind: "text" },
      { key: "fornecedor", label: "Fornecedor", kind: "text" },
      { key: "vencimento", label: "Vencimento", kind: "date" },
      { key: "pagamento", label: "Pagamento", kind: "date" },
      { key: "valor", label: "Valor", kind: "money" },
      { key: "status", label: "Status", kind: "text" },
    ],
    rows: rows.map(({ p, st }) => ({
      descricao: p.description,
      categoria: p.category,
      fornecedor: p.supplier,
      vencimento: p.dueDate,
      pagamento: p.paidAt ?? null,
      valor: p.amountCents,
      status: STATUS_LABEL[st],
    })),
    summary: [
      { label: "Total das contas", value: total, kind: "money" },
      { label: "Pago", value: paid, kind: "money", tone: "success" },
      { label: "Em aberto", value: open, kind: "money", tone: "warning" },
      { label: "Vencido", value: overdue, kind: "money", tone: "danger" },
    ],
    truncated,
  };
}

async function cashflowReport(from: string, to: string, today: string): Promise<ReportData> {
  const supabase = await createClient();
  const [rec, pay, payments] = await Promise.all([
    receivablesDue(from, to),
    payablesDue(from, to),
    fetchAll<{ amount: number | string; paid_on: string; receivable_id: string | null; payable_id: string | null }>((a, b) =>
      supabase
        .from("payments")
        .select("amount, paid_on, receivable_id, payable_id")
        .gte("paid_on", from)
        .lte("paid_on", to)
        .order("paid_on")
        .order("id")
        .range(a, b),
    ),
  ]);

  const list = months(from, to);
  const acc = new Map(list.map((m) => [m, { prevR: 0, rec: 0, prevP: 0, paid: 0 }]));
  for (const r of rec.items) if (!r.canceled) acc.get(monthOf(r.dueDate))!.prevR += r.amountCents;
  for (const p of pay.items) if (!p.canceled) acc.get(monthOf(p.dueDate))!.prevP += p.amountCents;
  for (const x of payments.rows) {
    const slot = acc.get(monthOf(x.paid_on));
    if (!slot) continue;
    if (x.receivable_id) slot.rec += feeToCents(x.amount);
    else slot.paid += feeToCents(x.amount);
  }

  const totals = { prevR: 0, rec: 0, prevP: 0, paid: 0 };
  const rows: Record<string, CellValue>[] = list.map((m) => {
    const a = acc.get(m)!;
    totals.prevR += a.prevR; totals.rec += a.rec; totals.prevP += a.prevP; totals.paid += a.paid;
    return {
      mes: competenceLabel(m),
      previstoReceber: a.prevR,
      recebido: a.rec,
      previstoPagar: a.prevP,
      pago: a.paid,
      saldo: a.rec - a.paid,
    };
  });
  return {
    ...base("fluxo", "Fluxo de caixa mensal", from, to, today),
    columns: [
      { key: "mes", label: "Mês", kind: "text" },
      { key: "previstoReceber", label: "Previsto a receber", kind: "money" },
      { key: "recebido", label: "Recebido", kind: "money" },
      { key: "previstoPagar", label: "Previsto a pagar", kind: "money" },
      { key: "pago", label: "Pago", kind: "money" },
      { key: "saldo", label: "Saldo realizado", kind: "money" },
    ],
    rows,
    summary: [
      { label: "Recebido no período", value: totals.rec, kind: "money", tone: "success" },
      { label: "Pago no período", value: totals.paid, kind: "money", tone: "danger" },
      { label: "Saldo realizado", value: totals.rec - totals.paid, kind: "money", tone: totals.rec - totals.paid >= 0 ? "success" : "danger" },
      { label: "Previsto a receber", value: totals.prevR, kind: "money" },
    ],
    truncated: rec.truncated || pay.truncated || payments.truncated,
  };
}

async function tasksReport(from: string, to: string, today: string): Promise<ReportData> {
  const [{ tasks, truncated }, clients, users] = await Promise.all([
    listTasksBetween(from, to, MAX_ROWS),
    listClients(),
    listActiveUsers(),
  ]);
  const byId = clientMap(clients);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const sorted = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const count = (s: string) => sorted.filter((t) => t.status === s).length;
  const late = sorted.filter((t) => taskUrgency(t, today) === "ATRASADA").length;
  return {
    ...base("tarefas", "Tarefas", from, to, today),
    columns: [
      { key: "cliente", label: "Cliente", kind: "text" },
      { key: "tarefa", label: "Tarefa", kind: "text" },
      { key: "categoria", label: "Categoria", kind: "text" },
      { key: "responsavel", label: "Responsável", kind: "text" },
      { key: "prazo", label: "Prazo", kind: "date" },
      { key: "status", label: "Status", kind: "text" },
      { key: "concluida", label: "Concluída em", kind: "date" },
    ],
    rows: sorted.map((t) => ({
      cliente: byId.get(t.clientId)?.tradeName ?? "Cliente removido",
      tarefa: t.title,
      categoria: t.category,
      responsavel: t.assigneeId ? userName.get(t.assigneeId) ?? "—" : "Sem responsável",
      prazo: t.dueDate,
      status: TASK_STATUS_LABEL[t.status],
      concluida: t.completedAt ?? null,
    })),
    summary: [
      { label: "Tarefas no período", value: sorted.length, kind: "int" },
      { label: "Concluídas", value: count("CONCLUIDA"), kind: "int", tone: "success" },
      { label: "Em aberto", value: count("PENDENTE") + count("EM_ANDAMENTO"), kind: "int", tone: "warning" },
      { label: "Atrasadas", value: late, kind: "int", tone: "danger" },
    ],
    truncated,
  };
}
