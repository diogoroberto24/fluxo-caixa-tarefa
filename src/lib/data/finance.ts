import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FinancialCategory, Payable, PayableScope, Receivable } from "@/types/domain";
import { centsToFee } from "./client-mapper";
import {
  CATEGORY_SELECT,
  PAYABLE_SELECT,
  RECEIVABLE_SELECT,
  rowToCategory,
  rowToPayable,
  rowToReceivable,
  type CategoryRow,
  type PayableRow,
  type ReceivableRow,
} from "./finance-mapper";

export interface DbError {
  code?: string;
  message: string;
}

/** Janela carregada no app: vencimentos a partir de N meses atrás (o restante fica para os relatórios). */
export const FINANCE_WINDOW_MONTHS = 36;

function windowStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const t = y * 12 + (m - 1) - FINANCE_WINDOW_MONTHS;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

const PAGE = 1000; // limite padrão de linhas por requisição do PostgREST

export async function listReceivables(today: string): Promise<Receivable[]> {
  const supabase = await createClient();
  const rows: ReceivableRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("receivables")
      .select(RECEIVABLE_SELECT)
      .gte("due_date", windowStart(today))
      .order("due_date", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao carregar cobranças: ${error.message}`);
    rows.push(...(data as unknown as ReceivableRow[]));
    if (data.length < PAGE) break;
  }
  return rows.map(rowToReceivable);
}

export async function listPayables(today: string): Promise<Payable[]> {
  const supabase = await createClient();
  const rows: PayableRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("payables")
      .select(PAYABLE_SELECT)
      .gte("due_date", windowStart(today))
      .order("due_date", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao carregar contas a pagar: ${error.message}`);
    rows.push(...(data as unknown as PayableRow[]));
    if (data.length < PAGE) break;
  }
  return rows.map(rowToPayable);
}

/** Todas as categorias das contas a pagar, inclusive as desativadas (o formulário esconde as desativadas). */
export async function listPayableCategories(): Promise<FinancialCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_categories")
    .select(CATEGORY_SELECT)
    .eq("kind", "PAGAR")
    .order("name");
  if (error) throw new Error(`Falha ao carregar categorias: ${error.message}`);
  return (data as unknown as CategoryRow[]).map(rowToCategory);
}

export interface CategoryChanges {
  name?: string;
  active?: boolean;
  forEmpresa?: boolean;
  forPessoal?: boolean;
}

/** Já existe outra categoria com este nome (sem diferenciar maiúsculas/minúsculas)? */
export async function payableCategoryNameTaken(name: string, exceptId?: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("financial_categories").select("id, name").eq("kind", "PAGAR");
  const key = name.toLocaleLowerCase("pt-BR");
  return (data ?? []).some((c) => c.id !== exceptId && c.name.toLocaleLowerCase("pt-BR") === key);
}

export async function insertPayableCategory(name: string): Promise<{ id?: string; error: DbError | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_categories")
    .insert({ name, kind: "PAGAR" })
    .select("id")
    .single();
  return { id: data?.id, error };
}

export async function updatePayableCategory(id: string, c: CategoryChanges): Promise<{ error: DbError | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_categories")
    .update({
      ...(c.name !== undefined ? { name: c.name } : {}),
      ...(c.active !== undefined ? { active: c.active } : {}),
      ...(c.forEmpresa !== undefined ? { for_empresa: c.forEmpresa } : {}),
      ...(c.forPessoal !== undefined ? { for_pessoal: c.forPessoal } : {}),
    })
    .eq("id", id)
    .eq("kind", "PAGAR")
    .select("id");
  if (error) return { error };
  if (!data?.length) return { error: { code: "P0002", message: "Categoria não encontrada." } };
  return { error: null };
}

export async function getReceivable(id: string): Promise<Receivable | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("receivables")
    .select(RECEIVABLE_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToReceivable(data as unknown as ReceivableRow) : null;
}

/** Uma parcela de um serviço avulso (por grupo e número). */
export async function getInstallment(groupId: string, number = 1): Promise<Receivable | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("receivables")
    .select(RECEIVABLE_SELECT)
    .eq("installment_group_id", groupId)
    .eq("installment_number", number)
    .maybeSingle();
  return data ? rowToReceivable(data as unknown as ReceivableRow) : null;
}

export async function getPayable(id: string): Promise<Payable | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payables")
    .select(PAYABLE_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToPayable(data as unknown as PayableRow) : null;
}

// ------------------------------------------------------------------ escritas

export interface NewReceivable {
  clientId: string;
  description: string;
  category: "HONORARIOS" | "OUTROS";
  competence: string; // YYYY-MM
  amountCents: number;
  dueDate: string;
}

export async function insertReceivable(
  r: NewReceivable,
): Promise<{ id?: string; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivables")
    .insert({
      client_id: r.clientId,
      description: r.description,
      category: r.category,
      competence: `${r.competence}-01`,
      amount: centsToFee(r.amountCents),
      due_date: r.dueDate,
    })
    .select("id")
    .single();
  if (error) return { error };
  return { id: data.id };
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

export interface PayableChanges {
  description: string;
  categoryId: string;
  supplier: string;
  amountCents: number;
  issueDate: string;
  dueDate: string;
  notes?: string;
  /** Só é gravado quando informado (separação Empresa/Pessoal ligada). */
  scope?: PayableScope;
}

export async function updatePayableById(
  id: string,
  c: PayableChanges,
): Promise<{ ok?: true; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payables")
    .update({
      description: c.description,
      category_id: c.categoryId,
      supplier: c.supplier,
      amount: centsToFee(c.amountCents),
      issue_date: c.issueDate,
      due_date: c.dueDate,
      notes: c.notes ?? null,
      ...(c.scope ? { scope: c.scope } : {}),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { error };
  if (!data) return { error: { message: "Conta não encontrada ou sem permissão.", code: "P0002" } };
  return { ok: true };
}

/**
 * Despesa recorrente: aplica o tipo (Empresa/Pessoal) às ocorrências seguintes da mesma série,
 * para não precisar editar mês a mês. As próximas que forem geradas copiam o tipo da última.
 */
export async function applyScopeToLaterOccurrences(id: string, scope: PayableScope): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("payables").select("recurrence_rule_id, due_date").eq("id", id).maybeSingle();
  const row = data as { recurrence_rule_id: string | null; due_date: string } | null;
  if (!row?.recurrence_rule_id) return;
  await supabase
    .from("payables")
    .update({ scope })
    .eq("recurrence_rule_id", row.recurrence_rule_id)
    .gt("due_date", row.due_date)
    .is("canceled_at", null)
    .neq("scope", scope);
}
