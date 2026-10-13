"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UNEXPECTED_ERROR, friendlyDbError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { getTask, rpc } from "@/lib/data/tasks";
import { can, type Permission } from "@/lib/permissions";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import type { Task } from "@/types/domain";

async function authorize(permission: Permission): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Sessão expirada. Entre novamente.";
  if (!can(user.role, permission)) return "Seu perfil não tem permissão para esta operação.";
  return null;
}

const refresh = () => revalidatePath("/", "layout");
const idSchema = z.string().uuid("Registro inválido.");
type Field = keyof TaskFormValues;

export async function createTaskAction(values: TaskFormValues): Promise<ActionResult<Task, Field>> {
  const denied = await authorize("task:write");
  if (denied) return { ok: false, error: denied };
  const parsed = taskSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as Field };
  }
  const v = parsed.data;
  const { data, error } = await rpc<string>("create_task", {
    p_client_id: v.clientId,
    p_title: v.title,
    p_category: v.category,
    p_description: v.description || null,
    p_due_date: v.dueDate,
    p_assignee_id: v.assigneeId || null,
    p_frequency: v.recurrence === "NONE" ? null : v.recurrence,
    p_notes: v.notes || null,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };
  const task = await getTask(data);
  refresh();
  return task ? { ok: true, data: task } : { ok: false, error: UNEXPECTED_ERROR };
}

export async function updateTaskAction(
  id: string,
  values: TaskFormValues,
): Promise<ActionResult<Task, Field>> {
  const denied = await authorize("task:write");
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };
  const parsed = taskSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as Field };
  }
  const v = parsed.data;
  const { error } = await rpc("update_task", {
    p_execution_id: id,
    p_title: v.title,
    p_category: v.category,
    p_description: v.description || null,
    p_due_date: v.dueDate,
    p_assignee_id: v.assigneeId || null,
    p_notes: v.notes || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const task = await getTask(id);
  refresh();
  return task ? { ok: true, data: task } : { ok: false, error: UNEXPECTED_ERROR };
}

const statusSchema = z.enum(["EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]);

/** Inicia, conclui ou cancela. Idempotente; concluir/cancelar tarefa recorrente gera a próxima ocorrência. */
export async function setTaskStatusAction(
  id: string,
  status: "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA",
  opts: { notes?: string; stopSeries?: boolean } = {},
): Promise<ActionResult<{ task: Task; unchanged: boolean; nextCreated: boolean }>> {
  const denied = await authorize("task:update");
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(id).success || !statusSchema.safeParse(status).success) {
    return { ok: false, error: "Registro inválido." };
  }
  const { data, error } = await rpc<{ status: string; next_id?: string | null }>("set_task_status", {
    p_execution_id: id,
    p_status: status,
    p_notes: opts.notes?.trim().slice(0, 500) || null,
    p_stop_series: !!opts.stopSeries,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };
  const task = await getTask(id);
  refresh();
  if (!task) return { ok: false, error: UNEXPECTED_ERROR };
  return { ok: true, data: { task, unchanged: data.status === "unchanged", nextCreated: !!data.next_id } };
}
