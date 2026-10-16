import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/types/domain";
import {
  CLIENT_COLUMNS,
  centsToFee,
  feeToCents,
  inputToRow,
  rowToClient,
  type ClientInput,
  type ClientRow,
  type ServicePlan,
} from "./client-mapper";

export interface DbError {
  code?: string;
  message: string;
}

export async function listClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .order("trade_name");
  if (error) throw new Error(`Falha ao carregar clientes: ${error.message}`);
  return (data as ClientRow[]).map(rowToClient);
}

export async function insertClient(
  input: ClientInput,
): Promise<{ data?: Client; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert(inputToRow(input))
    .select(CLIENT_COLUMNS)
    .single();
  if (error) return { error };
  return { data: rowToClient(data as ClientRow) };
}

/** Cliente EVENTUAL + cobranças do serviço (à vista ou parcelado) em uma única transação. */
export async function insertOccasionalClient(
  input: ClientInput,
  plan: ServicePlan,
): Promise<{ data?: Client; error?: DbError }> {
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_occasional_client", {
    p_client: inputToRow(input),
    p_description: plan.description,
    p_total: centsToFee(plan.totalCents),
    p_installments: plan.installments,
    p_first_due: plan.firstDueDate,
  });
  if (error) return { error };
  const { data, error: e2 } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("id", id as string)
    .single();
  if (e2) return { error: e2 };
  return { data: rowToClient(data as ClientRow) };
}

export async function getClientById(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select(CLIENT_COLUMNS).eq("id", id).maybeSingle();
  return data ? rowToClient(data as ClientRow) : null;
}

/** Tipo gravado no banco (a fonte da verdade; o formulário nunca decide). */
export async function getClientKind(id: string): Promise<"FIXO" | "EVENTUAL" | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("kind").eq("id", id).maybeSingle();
  return (data?.kind as "FIXO" | "EVENTUAL" | undefined) ?? null;
}

export async function updateClientById(
  id: string,
  input: ClientInput,
): Promise<{ data?: Client; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(inputToRow(input))
    .eq("id", id)
    .select(CLIENT_COLUMNS)
    .maybeSingle();
  if (error) return { error };
  if (!data) return { error: { message: "Cliente não encontrado ou sem permissão." } };
  return { data: rowToClient(data as ClientRow) };
}

export async function setClientActiveById(
  id: string,
  active: boolean,
): Promise<{ data?: Client; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ active })
    .eq("id", id)
    .select(CLIENT_COLUMNS)
    .maybeSingle();
  if (error) return { error };
  if (!data) return { error: { message: "Cliente não encontrado ou sem permissão." } };
  return { data: rowToClient(data as ClientRow) };
}

export interface FeeHistoryEntry {
  monthlyFeeCents: number;
  dueDay: number;
  validFrom: string;
}

export async function listFeeHistory(clientId: string): Promise<FeeHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_fee_history")
    .select("monthly_fee, due_day, valid_from, id")
    .eq("client_id", clientId)
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    monthlyFeeCents: feeToCents(r.monthly_fee),
    dueDay: r.due_day,
    validFrom: r.valid_from,
  }));
}
