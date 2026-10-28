import { addDays, diffDays, monthOf } from "@/lib/dates";
import { competenceLabel, formatBRL, formatDate, monthLabel } from "@/lib/format";
import { TAX_REGIME_LABEL } from "@/services/clients";
import {
  chargeStatus,
  clientFinancial,
  feeHistory,
  isOpen,
  summarizePayables,
  summarizeReceivables,
  type ClientStanding,
} from "@/services/finance";
import { isTaskOpen, sortTasks, taskUrgency, TASK_STATUS_LABEL } from "@/services/tasks";
import { normalize } from "@/lib/utils";
import type { Client, Payable, Receivable, Task } from "@/types/domain";

/**
 * Consultas que o assistente de IA pode fazer. Todas são funções puras sobre os dados já carregados e
 * reaproveitam as MESMAS regras do sistema (status derivado, resumo do mês, situação do cliente,
 * urgência das tarefas). O modelo não faz contas: recebe os números prontos, já formatados em R$.
 *
 * Privacidade: nenhuma consulta devolve CPF/CNPJ, telefone, e-mail ou endereço.
 */

/** Teto de itens por resposta, para não mandar listas enormes ao modelo. */
export const MAX_ITEMS = 20;

const STANDING_LABEL: Record<ClientStanding, string> = {
  EM_DIA: "Em dia",
  PENDENTE: "Pendente",
  EM_ATRASO: "Em atraso",
  INATIVO: "Inativo",
};

const name = (c: Client | undefined) => (c ? c.tradeName || c.legalName : "Cliente não encontrado");

export function findClients(
  clients: Client[],
  receivables: Receivable[] | null,
  termo: string,
  today: string,
) {
  const q = normalize(termo);
  const found = clients.filter(
    (c) => !q || normalize(c.tradeName).includes(q) || normalize(c.legalName).includes(q),
  );
  return {
    total: found.length,
    clientes: found.slice(0, MAX_ITEMS).map((c) => ({
      id: c.id,
      nome: name(c),
      razaoSocial: c.legalName,
      tipo: c.kind === "FIXO" ? "Mensalista (honorário fixo)" : "Eventual (serviço avulso)",
      regime: TAX_REGIME_LABEL[c.taxRegime],
      ativo: c.active,
      // financeiro só para quem pode ver cobranças
      ...(receivables
        ? {
            honorarioMensal: c.kind === "FIXO" ? formatBRL(c.monthlyFeeCents) : null,
            situacao: STANDING_LABEL[clientFinancial(c, receivables, today).standing],
          }
        : {}),
    })),
  };
}

export function receivablesOfMonth(receivables: Receivable[], month: string, today: string) {
  const s = summarizeReceivables(receivables, month, today);
  return {
    mes: monthLabel(month),
    previsto: formatBRL(s.expectedCents),
    recebido: formatBRL(s.receivedCents),
    percentualRecebido: `${s.receivedPct}%`,
    aVencer: formatBRL(s.pendingCents),
    vencido: formatBRL(s.overdueCents),
    cobrancasEmAberto: s.openCount,
    cobrancasVencidas: s.overdueCount,
  };
}

export function overdueByClient(clients: Client[], receivables: Receivable[], today: string) {
  const byClient = new Map<string, { cents: number; count: number; oldest: string }>();
  for (const r of receivables) {
    if (chargeStatus(r, today) !== "VENCIDO") continue;
    const cur = byClient.get(r.clientId) ?? { cents: 0, count: 0, oldest: r.dueDate };
    cur.cents += r.amountCents;
    cur.count++;
    if (r.dueDate < cur.oldest) cur.oldest = r.dueDate;
    byClient.set(r.clientId, cur);
  }
  const rows = [...byClient.entries()]
    .map(([clientId, v]) => ({ clientId, ...v }))
    .sort((a, b) => b.cents - a.cents);
  const totalCents = rows.reduce((sum, r) => sum + r.cents, 0);
  return {
    totalVencido: formatBRL(totalCents),
    clientesInadimplentes: rows.length,
    clientes: rows.slice(0, MAX_ITEMS).map((r) => ({
      clienteId: r.clientId,
      nome: name(clients.find((c) => c.id === r.clientId)),
      valorVencido: formatBRL(r.cents),
      cobrancasVencidas: r.count,
      vencimentoMaisAntigo: formatDate(r.oldest),
      diasDeAtraso: diffDays(today, r.oldest),
    })),
  };
}

export function chargesOfClient(client: Client, receivables: Receivable[], today: string) {
  const history = feeHistory(receivables, client.id, client.kind);
  return {
    cliente: name(client),
    situacao: STANDING_LABEL[clientFinancial(client, receivables, today).standing],
    cobrancas: history.slice(0, 12).map((r) => {
      const status = chargeStatus(r, today);
      return {
        descricao: r.description,
        competencia: competenceLabel(r.competence),
        valor: formatBRL(r.amountCents),
        vencimento: formatDate(r.dueDate),
        status,
        pagoEm: r.paidAt ? formatDate(r.paidAt.slice(0, 10)) : null,
        parcela: r.installmentNumber ? `${r.installmentNumber}/${r.installmentTotal}` : null,
      };
    }),
  };
}

export function payablesOverview(payables: Payable[], today: string) {
  const s = summarizePayables(payables, today);
  const open = payables
    .map((p) => ({ p, status: chargeStatus(p, today) }))
    .filter((row) => isOpen(row.status))
    .sort((a, b) => a.p.dueDate.localeCompare(b.p.dueDate));
  return {
    emAberto: formatBRL(s.openCents),
    contasEmAberto: s.openCount,
    vencidas: s.overdueCount,
    valorVencido: formatBRL(s.overdueCents),
    vencemNos7Dias: s.dueSoonCount,
    proximas: open.slice(0, MAX_ITEMS).map(({ p, status }) => ({
      descricao: p.description,
      fornecedor: p.supplier || null,
      categoria: p.category,
      valor: formatBRL(p.amountCents),
      vencimento: formatDate(p.dueDate),
      status,
    })),
  };
}

export type TaskSituation = "atrasadas" | "hoje" | "proximos_7_dias" | "abertas";

export function tasksQuery(
  tasks: Task[],
  clients: Client[],
  today: string,
  opts: { situacao: TaskSituation; clienteId?: string | null },
) {
  const limit = addDays(today, 7);
  const filtered = sortTasks(tasks, today).filter((t) => {
    if (!isTaskOpen(t.status)) return false;
    if (opts.clienteId && t.clientId !== opts.clienteId) return false;
    if (opts.situacao === "atrasadas") return taskUrgency(t, today) === "ATRASADA";
    if (opts.situacao === "hoje") return t.dueDate === today;
    if (opts.situacao === "proximos_7_dias") return t.dueDate >= today && t.dueDate <= limit;
    return true;
  });
  return {
    total: filtered.length,
    tarefas: filtered.slice(0, MAX_ITEMS).map((t) => ({
      titulo: t.title,
      cliente: name(clients.find((c) => c.id === t.clientId)),
      categoria: t.category,
      prazo: formatDate(t.dueDate),
      status: TASK_STATUS_LABEL[t.status],
      diasDeAtraso: t.dueDate < today ? diffDays(today, t.dueDate) : 0,
    })),
  };
}

/** Mês padrão das perguntas sem mês: o atual. */
export const currentMonth = (today: string) => monthOf(today);
