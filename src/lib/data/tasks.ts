import "server-only";
import { toBrDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Recurrence, Task, TaskStatus, TaskType } from "@/types/domain";

export interface DbError {
  code?: string;
  message: string;
}

type Embedded<T> = T | T[] | null;
const first = <T,>(v: Embedded<T> | undefined): T | undefined =>
  !v ? undefined : Array.isArray(v) ? v[0] : v;

interface ExecutionRow {
  id: string;
  definition_id: string;
  due_date: string;
  status: string;
  completed_at: string | null;
  completion_notes: string | null;
  created_at: string;
  task_definitions: Embedded<{
    client_id: string;
    title: string;
    description: string | null;
    category: string;
    assignee_id: string | null;
    notes: string | null;
    is_demo: boolean;
    recurrence_rules: Embedded<{ frequency: string }>;
  }>;
}

const SELECT =
  "id, definition_id, due_date, status, completed_at, completion_notes, created_at, task_definitions(client_id, title, description, category, assignee_id, notes, is_demo, recurrence_rules(frequency))";

/** Execuções concluídas/canceladas mais antigas que isto ficam fora da carga inicial. */
export const TASK_HISTORY_MONTHS = 18;

function historyStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const t = y * 12 + (m - 1) - TASK_HISTORY_MONTHS;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

function toTask(r: ExecutionRow, lastDone: Map<string, string>): Task | null {
  const d = first(r.task_definitions);
  if (!d) return null;
  return {
    id: r.id,
    definitionId: r.definition_id,
    clientId: d.client_id,
    title: d.title,
    description: d.description ?? undefined,
    category: d.category,
    createdAt: toBrDate(r.created_at),
    dueDate: r.due_date,
    status: r.status as TaskStatus,
    lastDoneAt: lastDone.get(r.definition_id),
    completedAt: r.completed_at ? toBrDate(r.completed_at) : undefined,
    completionNotes: r.completion_notes ?? undefined,
    notes: d.notes ?? undefined,
    assigneeId: d.assignee_id ?? undefined,
    recurrence: (first(d.recurrence_rules)?.frequency ?? "NONE") as Recurrence,
    isDemo: d.is_demo,
  };
}

async function lastDoneMap(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_last_done").select("definition_id, last_done_at");
  if (error) throw new Error(`Falha ao carregar última realização: ${error.message}`);
  return new Map(
    (data ?? [])
      .filter((r) => r.last_done_at)
      .map((r) => [r.definition_id as string, toBrDate(r.last_done_at as string)]),
  );
}

const PAGE = 1000;

/** Todas as execuções em aberto + as finalizadas dentro da janela de histórico. */
export async function listTasks(today: string): Promise<Task[]> {
  const supabase = await createClient();
  const lastDone = await lastDoneMap();
  const rows: ExecutionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("task_executions")
      .select(SELECT)
      .or(`status.in.(PENDENTE,EM_ANDAMENTO),due_date.gte.${historyStart(today)}`)
      .order("due_date", { ascending: true })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao carregar tarefas: ${error.message}`);
    rows.push(...(data as unknown as ExecutionRow[]));
    if (data.length < PAGE) break;
  }
  return rows.map((r) => toTask(r, lastDone)).filter((t): t is Task => t !== null);
}

interface TaskTypeRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  active: boolean;
}

const toTaskType = (r: TaskTypeRow): TaskType => ({
  id: r.id,
  name: r.name,
  category: r.category,
  description: r.description ?? undefined,
  active: r.active,
});

/** Catálogo completo (ativos e inativos); a tela de lançamento mostra só os ativos. */
export async function listTaskTypes(): Promise<TaskType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_types")
    .select("id, name, category, description, active")
    .order("name");
  if (error) throw new Error(`Falha ao carregar o cadastro de tarefas: ${error.message}`);
  return (data as TaskTypeRow[]).map(toTaskType);
}

export async function getTaskType(id: string): Promise<TaskType | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_types")
    .select("id, name, category, description, active")
    .eq("id", id)
    .maybeSingle();
  return data ? toTaskType(data as TaskTypeRow) : null;
}

export async function getTask(id: string): Promise<Task | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("task_executions").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  return toTask(data as unknown as ExecutionRow, await lastDoneMap());
}

export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data?: T; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error };
  return { data: data as T };
}

/** Execuções com prazo no intervalo (para relatórios). Devolve também se o limite de linhas foi atingido. */
export async function listTasksBetween(
  from: string,
  to: string,
  maxRows = 20000,
): Promise<{ tasks: Task[]; truncated: boolean }> {
  const supabase = await createClient();
  const lastDone = await lastDoneMap();
  const rows: ExecutionRow[] = [];
  let truncated = false;
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("task_executions")
      .select(SELECT)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date", { ascending: true })
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`Falha ao carregar tarefas: ${error.message}`);
    rows.push(...(data as unknown as ExecutionRow[]));
    if (data.length < PAGE) break;
    if (rows.length >= maxRows) { truncated = true; break; }
  }
  return {
    tasks: rows.map((r) => toTask(r, lastDone)).filter((t): t is Task => t !== null),
    truncated,
  };
}
