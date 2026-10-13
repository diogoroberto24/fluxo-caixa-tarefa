import { diffDays } from "@/lib/dates";
import type { Task, TaskStatus } from "@/types/domain";

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

/** Atrasadas primeiro, depois por prazo; concluídas/canceladas por último. */
export function sortTasks(tasks: Task[], today: string): Task[] {
  const rank = (t: Task) => {
    if (!isTaskOpen(t.status)) return 3;
    const u = taskUrgency(t, today);
    return u === "ATRASADA" ? 0 : u === "HOJE" ? 1 : 2;
  };
  return [...tasks].sort(
    (a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate),
  );
}

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
