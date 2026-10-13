"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { formValuesToInput } from "@/lib/data/client-mapper";
import {
  insertClient,
  listFeeHistory,
  setClientActiveById,
  updateClientById,
  type FeeHistoryEntry,
} from "@/lib/data/clients";
import { can } from "@/lib/permissions";
import { clientSchema, type ClientFormValues } from "@/lib/schemas";
import type { Client } from "@/types/domain";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: keyof ClientFormValues };

const UNEXPECTED = "Não foi possível concluir a operação. Tente novamente.";

async function authorize(): Promise<{ error: string } | null> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };
  if (!can(user.role, "client:write")) {
    return { error: "Seu perfil não tem permissão para alterar clientes." };
  }
  return null;
}

/** Cria (id = null) ou atualiza um cliente. Valida tudo de novo no servidor. */
export async function saveClientAction(
  id: string | null,
  values: ClientFormValues,
): Promise<ActionResult<Client>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied.error };

  const parsed = clientSchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue.message,
      field: issue.path[0] as keyof ClientFormValues,
    };
  }

  const input = formValuesToInput(parsed.data);
  const { data, error } = id
    ? await updateClientById(id, input)
    : await insertClient(input);

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "Já existe um cliente com este CNPJ/CPF.", field: "document" };
    }
    if (error?.code === "42501") {
      return { ok: false, error: "Seu perfil não tem permissão para esta operação." };
    }
    console.error("saveClientAction", error?.code, error?.message);
    return { ok: false, error: error?.message.includes("não encontrado") ? error.message : UNEXPECTED };
  }

  revalidatePath("/", "layout");
  return { ok: true, data };
}

/** Inativa ou reativa. Nunca exclui: financeiro e tarefas permanecem. */
export async function setClientActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<Client>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied.error };

  const { data, error } = await setClientActiveById(id, active);
  if (error || !data) {
    console.error("setClientActiveAction", error?.code, error?.message);
    return { ok: false, error: UNEXPECTED };
  }
  revalidatePath("/", "layout");
  return { ok: true, data };
}

export async function getFeeHistoryAction(
  clientId: string,
): Promise<ActionResult<FeeHistoryEntry[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };
  try {
    return { ok: true, data: await listFeeHistory(clientId) };
  } catch (e) {
    console.error("getFeeHistoryAction", e);
    return { ok: false, error: UNEXPECTED };
  }
}
