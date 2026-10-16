"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UNEXPECTED_ERROR, friendlyDbError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import {
  buildContractVariables,
  parseContractForm,
  renderTemplate,
  variableLabel,
  type ContractFormValues,
} from "@/lib/contracts";
import { getClientById } from "@/lib/data/clients";
import { getTemplate, rpc } from "@/lib/data/contracts";
import { getOffice } from "@/lib/data/office";
import { todayInSaoPaulo } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { contractTemplateSchema, type ContractTemplateFormValues } from "@/lib/schemas";

async function authorize(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Sessão expirada. Entre novamente.";
  if (!can(user.role, "contract:manage")) return "Seu perfil não tem permissão para esta operação com contratos.";
  return null;
}

const idSchema = z.string().uuid("Registro inválido.");
const refresh = () => revalidatePath("/contratos", "layout");

/** Cria (id = null) ou edita um modelo de contrato. */
export async function saveTemplateAction(
  id: string | null,
  values: ContractTemplateFormValues,
): Promise<ActionResult<{ id: string }, keyof ContractTemplateFormValues>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };
  if (id && !idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };
  const parsed = contractTemplateSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as keyof ContractTemplateFormValues };
  }
  const v = parsed.data;
  const { data, error } = await rpc<string>("save_contract_template", {
    p_id: id,
    p_name: v.name,
    p_audience: v.audience,
    p_body: v.body,
    p_active: v.active === "true",
  });
  if (error || !data) {
    const msg = error ? friendlyDbError(error) : UNEXPECTED_ERROR;
    return { ok: false, error: msg, field: /nome|modelo com/i.test(msg) ? "name" : undefined };
  }
  refresh();
  return { ok: true, data: { id: data } };
}

/**
 * Emite o contrato. O texto é montado AQUI, no servidor, a partir do modelo, dos dados do cliente e do escritório
 * lidos do banco e das condições informadas: o navegador nunca envia o texto final.
 */
export async function issueContractAction(input: {
  clientId: string;
  templateId: string;
  form: ContractFormValues;
}): Promise<ActionResult<{ id: string; number: string }>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(input.clientId).success || !idSchema.safeParse(input.templateId).success) {
    return { ok: false, error: "Registro inválido." };
  }
  const [client, template, office] = await Promise.all([getClientById(input.clientId), getTemplate(input.templateId), getOffice()]);
  if (!client) return { ok: false, error: "Cliente não encontrado." };
  if (!template || !template.active) return { ok: false, error: "Modelo não encontrado ou inativo." };
  if (template.audience !== "TODOS" && template.audience !== client.kind) {
    return { ok: false, error: "Este modelo não se aplica ao tipo deste cliente." };
  }

  const cond = parseContractForm(client.kind, input.form);
  if (!cond.ok) return { ok: false, error: cond.error };

  const today = todayInSaoPaulo();
  const vars = buildContractVariables({ office, client, cond: cond.data, issuedOn: today });
  const rendered = renderTemplate(template.body, vars);
  if (rendered.unknown.length) {
    return { ok: false, error: `O modelo usa campos que não existem: ${rendered.unknown.map((k) => `{{${k}}}`).join(", ")}. Corrija o modelo.` };
  }
  if (rendered.missing.length) {
    return {
      ok: false,
      error: `Faltam dados para o contrato: ${rendered.missing.map(variableLabel).join("; ")}. Complete o cadastro do cliente ou os dados do escritório (Configurações).`,
    };
  }

  const { data, error } = await rpc<{ id: string; number: string }>("issue_contract", {
    p_client_id: client.id,
    p_template_id: template.id,
    p_variables: vars,
    p_body: rendered.text,
    p_issued_on: today,
  });
  if (error || !data) return { ok: false, error: error ? friendlyDbError(error) : UNEXPECTED_ERROR };
  refresh();
  return { ok: true, data };
}

export async function cancelContractAction(id: string, reason: string): Promise<ActionResult<true>> {
  const denied = await authorize();
  if (denied) return { ok: false, error: denied };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Registro inválido." };
  const { error } = await rpc("cancel_contract", { p_id: id, p_reason: reason.trim().slice(0, 300) || null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  refresh();
  return { ok: true, data: true };
}
