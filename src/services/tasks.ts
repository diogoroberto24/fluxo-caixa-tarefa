import { diffDays, monthOf } from "@/lib/dates";
import type { Task, TaskPriority, TaskStatus } from "@/types/domain";

export type TaskFilter = "TODAS" | "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA";
export type Urgency = "ATRASADA" | "HOJE" | "PROXIMA" | "NORMAL";

export const NEAR_DEADLINE_DAYS = 3;

export const isTaskOpen = (status: TaskStatus) =>
  status === "PENDENTE" || status === "EM_ANDAMENTO";

export function taskUrgency(task: Task, today: string): Urgency {
  if (!isTaskOpen(task.status)) return "NORMAL";
  const d = diffDays(task.dueDate, today);
  if (d < 0) return "ATRASADA";
  if (d === 0) return "HOJE";
  if (d <= NEAR_DEADLINE_DAYS) return "PROXIMA";
  return "NORMAL";
}

export function filterTasks(
  tasks: Task[],
  opts: { filter: TaskFilter; clientId?: string | null },
): Task[] {
  return tasks.filter((t) => {
    if (opts.clientId && t.clientId !== opts.clientId) return false;
    if (opts.filter === "TODAS") return true;
    return t.status === opts.filter;
  });
}

/**
 * Atrasadas primeiro; dentro delas e nas demais em aberto, pela prioridade (1, 2, 3, sem) e depois pelo prazo.
 * Concluídas/canceladas por último.
 */
export function sortTasks(tasks: Task[], today: string): Task[] {
  const rank = (t: Task) => {
    if (!isTaskOpen(t.status)) return 2;
    return taskUrgency(t, today) === "ATRASADA" ? 0 : 1;
  };
  const prio = (t: Task) => t.priority ?? 99; // sem prioridade: depois do nível 5
  return [...tasks].sort(
    (a, b) => rank(a) - rank(b) || (rank(a) < 2 ? prio(a) - prio(b) : 0) || a.dueDate.localeCompare(b.dueDate),
  );
}

/**
 * A tarefa pertence ao mês? Em geral, pelo mês do prazo. O Alvará tem um período para ser feito (do lançamento
 * até o prazo) e aparece em todos os meses desse período, inclusive depois de concluído.
 */
export function taskInMonth(task: Task, month: string): boolean {
  const due = monthOf(task.dueDate);
  if (task.autoKind !== "ALVARA") return due === month;
  const start = monthOf(task.createdAt);
  return month >= (start < due ? start : due) && month <= due;
}

export const TASK_PRIORITIES: TaskPriority[] = [1, 2, 3, 4, 5];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  1: "1 · Muito alta",
  2: "2 · Alta",
  3: "3 · Média",
  4: "4 · Baixa",
  5: "5 · Muito baixa",
};

/** Cor do texto e da marquinha de cada nível (a cor sempre acompanha o texto). */
export const TASK_PRIORITY_TONE: Record<TaskPriority, { text: string; mark: string }> = {
  1: { text: "text-danger", mark: "bg-danger" },
  2: { text: "text-warning", mark: "bg-warning" },
  3: { text: "text-yellow-700", mark: "bg-yellow-500" },
  4: { text: "text-slate-600", mark: "bg-slate-500" },
  5: { text: "text-slate-400", mark: "bg-slate-300" },
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const TASK_CATEGORIES = [
  "Fechamento de folha",
  "Apuração de impostos",
  "Entrega de declarações",
  "Conferência de lançamentos",
  "Emissão de guias",
  "Revisão fiscal",
  "Obrigações acessórias",
  "Outras",
] as const;
