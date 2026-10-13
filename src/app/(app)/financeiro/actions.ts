"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UNEXPECTED_ERROR, friendlyDbError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { centsToFee } from "@/lib/data/client-mapper";
import {
  getPayable,
  getReceivable,
  insertReceivable,
  rpc,
  updatePayableById,
} from "@/lib/data/finance";
import { competenceLabel } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { can, type Permission } from "@/lib/permissions";
import {
  payableSchema,
  receivableSchema,
  type PayableFormValues,
  type ReceivableFormValues,
} from "@/lib/schemas";
import type { Payable, Receivable } from "@/types/domain";

async function authorize(permission: Permission): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Sessão expirada. Entre novamente.";
  if (!can(user.role, permission)) return "Seu perfil não tem permissão para esta operação.";
  return null;
}

const refresh = () => revalidatePath("/", "layout");

const idSchema = z.string().uuid("Registro inválido.");
const paymentOptsSchema = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pagamento inválida.").optional(),
  method: z.string().trim().max(40).optional(),
});
export type PaymentOpts = z.infer<typeof paymentOptsSchema>;

// ============================================================ contas a receber

export async function createReceivableAction(
  values: ReceivableFormValues,
): Promise<ActionResult<Receivable, keyof ReceivableFormValues>> {
  const denied = await authorize("receivable:write");
  if (denied) return { ok: false, error: denied };

  const parsed = receivableSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as keyof ReceivableFormValues };
  }
  const v = parsed.data;
  const { id, error } = await insertReceivable({
    clientId: v.clientId,
    description: v.description,
    category: v.category,
    competence: v.competence,
    amountCents: parseMoneyToCents(v.amount) ?? 0,
    dueDate: v.dueDate,
  });
  if (error || !id) {
    if (error?.code === "23505") {
      return {
        ok: false,
        field: "competence",
        error: `Já existe cobrança de honorários para ${competenceLabel(v.competence)} deste cliente.`,
      };
    }
    if (error?.code === "23503") return { ok: false, error: "Cliente não encontrado.", field: "clientId" };
    return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };
  }
  const receivable = await getReceivable(id);
  refresh();
  return receivable ? { ok: true, data: receivable } : { ok: false, error: UNEXPECTED_ERROR };
}

/** Registra o recebimento. Idempotente: se já estava pago, devolve `alreadyPaid` sem duplicar. */
export async function payReceivableAction(
  id: string,
  opts: PaymentOpts = {},
): Promise<ActionResult<{ receivable: Receivable; alreadyPaid: boolean }>> {
  const denied = await authorize("receivable:pay");
  if (denied) return { ok: false, error: denied };
  const parsedId = idSchema.safeParse(id);
  const parsedOpts = paymentOptsSchema.safeParse(opts);
  if (!parsedId.success || !parsedOpts.success) {
    return { ok: false, error: (parsedOpts.error ?? parsedId.error)!.issues[0].message };
  }

  const { data, error } = await rpc<{ status: string }>("register_receipt", {
    p_receivable_id: id,
    p_paid_on: parsedOpts.data.paidOn ?? null,
    p_method: parsedOpts.data.method || null,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };

  const receivable = await getReceivable(id);
  refresh();
  if (!receivable) return { ok: false, error: UNEXPECTED_ERROR };
  return { ok: true, data: { receivable, alreadyPaid: data.status === "already_paid" } };
}

export async function cancelReceivableAction(
  id: string,
  reason: string,
): Promise<ActionResult<Receivable>> {
  const denied = await authorize("receivable:write");
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };

  const { error } = await rpc("cancel_receivable", { p_id: id, p_reason: reason.trim().slice(0, 300) || null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const receivable = await getReceivable(id);
  refresh();
  return receivable ? { ok: true, data: receivable } : { ok: false, error: UNEXPECTED_ERROR };
}

/** Gera os honorários da competência (YYYY-MM) para os clientes ativos. Idempotente. */
export async function generateFeesAction(
  competence: string | null,
): Promise<ActionResult<{ created: number }>> {
  const denied = await authorize("receivable:write");
  if (denied) return { ok: false, error: denied };
  if (competence !== null && !/^\d{4}-\d{2}$/.test(competence)) {
    return { ok: false, error: "Competência inválida." };
  }
  const { data, error } = await rpc<number>("generate_monthly_fees", {
    p_competence: competence ? `${competence}-01` : null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  if ((data ?? 0) > 0) refresh();
  return { ok: true, data: { created: data ?? 0 } };
}

// =============================================================== contas a pagar

export async function createPayableAction(
  values: PayableFormValues,
): Promise<ActionResult<{ id: string; payable: Payable | null }, keyof PayableFormValues>> {
  const denied = await authorize("payable:write");
  if (denied) return { ok: false, error: denied };

  const parsed = payableSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as keyof PayableFormValues };
  }
  const v = parsed.data;
  const { data, error } = await rpc<string>("create_payable", {
    p_description: v.description,
    p_category_id: v.categoryId,
    p_supplier: v.supplier,
    p_amount: centsToFee(parseMoneyToCents(v.amount) ?? 0),
    p_issue_date: v.issueDate,
    p_due_date: v.dueDate,
    p_notes: v.notes || null,
    p_frequency: v.recurrence === "NONE" ? null : v.recurrence,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };
  const payable = await getPayable(data);
  refresh();
  return { ok: true, data: { id: data, payable } };
}

export async function updatePayableAction(
  id: string,
  values: PayableFormValues,
): Promise<ActionResult<Payable, keyof PayableFormValues>> {
  const denied = await authorize("payable:write");
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };

  const parsed = payableSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as keyof PayableFormValues };
  }
  const v = parsed.data;
  const { error } = await updatePayableById(id, {
    description: v.description,
    categoryId: v.categoryId,
    supplier: v.supplier,
    amountCents: parseMoneyToCents(v.amount) ?? 0,
    issueDate: v.issueDate,
    dueDate: v.dueDate,
    notes: v.notes || undefined,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const payable = await getPayable(id);
  refresh();
  return payable ? { ok: true, data: payable } : { ok: false, error: UNEXPECTED_ERROR };
}

export async function payPayableAction(
  id: string,
  opts: PaymentOpts = {},
): Promise<ActionResult<{ payable: Payable; alreadyPaid: boolean }>> {
  const denied = await authorize("payable:write");
  if (denied) return { ok: false, error: denied };
  const parsedId = idSchema.safeParse(id);
  const parsedOpts = paymentOptsSchema.safeParse(opts);
  if (!parsedId.success || !parsedOpts.success) {
    return { ok: false, error: (parsedOpts.error ?? parsedId.error)!.issues[0].message };
  }

  const { data, error } = await rpc<{ status: string }>("register_payable_payment", {
    p_payable_id: id,
    p_paid_on: parsedOpts.data.paidOn ?? null,
    p_method: parsedOpts.data.method || null,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };

  const payable = await getPayable(id);
  refresh();
  if (!payable) return { ok: false, error: UNEXPECTED_ERROR };
  return { ok: true, data: { payable, alreadyPaid: data.status === "already_paid" } };
}

export async function cancelPayableAction(
  id: string,
  reason: string,
): Promise<ActionResult<Payable>> {
  const denied = await authorize("payable:write");
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };

  const { error } = await rpc("cancel_payable", { p_id: id, p_reason: reason.trim().slice(0, 300) || null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const payable = await getPayable(id);
  refresh();
  return payable ? { ok: true, data: payable } : { ok: false, error: UNEXPECTED_ERROR };
}

/** Gera as ocorrências futuras das despesas recorrentes. Idempotente. */
export async function generateOccurrencesAction(): Promise<ActionResult<{ created: number }>> {
  const denied = await authorize("payable:write");
  if (denied) return { ok: false, error: denied };
  const { data, error } = await rpc<number>("generate_payable_occurrences", {});
  if (error) return { ok: false, error: friendlyDbError(error) };
  if ((data ?? 0) > 0) refresh();
  return { ok: true, data: { created: data ?? 0 } };
}
