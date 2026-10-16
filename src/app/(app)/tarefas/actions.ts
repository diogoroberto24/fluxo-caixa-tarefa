"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UNEXPECTED_ERROR, friendlyDbError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { getTask, getTaskType, rpc } from "@/lib/data/tasks";
import { can, type Permission } from "@/lib/permissions";
import {
  taskSchema,
  tasksBatchSchema,
  taskTypeSchema,
  type TaskFormValues,
  type TasksBatchValues,
  type TaskTypeFormValues,
} from "@/lib/schemas";
import type { Task, TaskType } from "@/types/domain";

async function authorize(permission: Permission): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Sessão expirada. Entre novamente.";
  if (!can(user.role, permission)) return "Seu perfil não tem permissão para esta operação.";
  return null;
}

const refresh = () => revalidatePath("/", "layout");
const idSchema = z.string().uuid("Registro inválido.");
type Field = keyof TaskFormValues;

/** Lança uma ou várias tarefas do catálogo para o cliente, tudo ou nada (uma transação no banco). */
export async function createTasksAction(
  values: TasksBatchValues,
): Promise<ActionResult<Task[], "clientId" | "items" | "assigneeId" | "notes">> {
  const denied = await authorize("task:write");
  if (denied) return { ok: false, error: denied };
  const parsed = tasksBatchSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as "clientId" | "items" | "assigneeId" | "notes" };
  }
  const v = parsed.data;
  if (new Set(v.items.map((i) => i.taskTypeId)).size !== v.items.length) {
    return { ok: false, error: "A mesma tarefa foi selecionada mais de uma vez.", field: "items" };
  }
  const { data, error } = await rpc<string[]>("create_tasks", {
    p_client_id: v.clientId,
    p_items: v.items.map((i) => ({
      task_type_id: i.taskTypeId,
      due_date: i.dueDate,
      frequency: i.recurrence === "NONE" ? null : i.recurrence,
    })),
    p_assignee_id: v.assigneeId || null,
    p_notes: v.notes || null,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };
  const created = (await Promise.all(data.map((id) => getTask(id)))).filter((t): t is Task => t !== null);
  refresh();
  return { ok: true, data: created };
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
    p_due_date: v.dueDate,
    p_assignee_id: v.assigneeId || null,
    p_notes: v.notes || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const task = await getTask(id);
  refresh();
  return task ? { ok: true, data: task } : { ok: false, error: UNEXPECTED_ERROR };
}

/** Cria (id = null) ou edita um item do cadastro de tarefas. */
export async function saveTaskTypeAction(
  id: string | null,
  values: TaskTypeFormValues,
): Promise<ActionResult<TaskType, keyof TaskTypeFormValues>> {
  const denied = await authorize("task:write");
  if (denied) return { ok: false, error: denied };
  if (id && !idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };
  const parsed = taskTypeSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as keyof TaskTypeFormValues };
  }
  const v = parsed.data;
  const { data, error } = await rpc<string>("save_task_type", {
    p_id: id,
    p_name: v.name,
    p_category: v.category,
    p_description: v.description || null,
    p_active: v.active === "true",
  });
  if (error || !data) {
    const msg = error ? friendlyDbError(error) : UNEXPECTED_ERROR;
    return { ok: false, error: msg, field: /nome/i.test(msg) ? "name" : undefined };
  }
  const type = await getTaskType(data);
  refresh();
  return type ? { ok: true, data: type } : { ok: false, error: UNEXPECTED_ERROR };
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
