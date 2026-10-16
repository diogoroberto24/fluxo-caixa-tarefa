import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Contract, ContractAudience, ContractParty, ContractStatus, ContractTemplate } from "@/types/domain";

export interface DbError {
  code?: string;
  message: string;
}

interface TemplateRow {
  id: string;
  name: string;
  audience: string;
  party: string;
  body: string;
  active: boolean;
}

interface ContractRow {
  id: string;
  number: string;
  client_id: string;
  template_name: string;
  issued_on: string;
  status: string;
  cancel_reason: string | null;
  body?: string;
}

const toTemplate = (r: TemplateRow): ContractTemplate => ({
  id: r.id,
  name: r.name,
  audience: r.audience as ContractAudience,
  party: r.party as ContractParty,
  body: r.body,
  active: r.active,
});

const toContract = (r: ContractRow): Contract => ({
  id: r.id,
  number: r.number,
  clientId: r.client_id,
  templateName: r.template_name,
  issuedOn: r.issued_on,
  status: r.status as ContractStatus,
  cancelReason: r.cancel_reason ?? undefined,
  body: r.body,
});

const LIST_COLS = "id, number, client_id, template_name, issued_on, status, cancel_reason";

export async function listTemplates(): Promise<ContractTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contract_templates").select("id, name, audience, party, body, active").order("name");
  if (error) throw new Error(`Falha ao carregar os modelos: ${error.message}`);
  return (data as TemplateRow[]).map(toTemplate);
}

export async function getTemplate(id: string): Promise<ContractTemplate | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("contract_templates").select("id, name, audience, party, body, active").eq("id", id).maybeSingle();
  return data ? toTemplate(data as TemplateRow) : null;
}

export async function listContracts(): Promise<Contract[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(LIST_COLS)
    .order("issued_on", { ascending: false })
    .order("number", { ascending: false });
  if (error) throw new Error(`Falha ao carregar os contratos: ${error.message}`);
  return (data as ContractRow[]).map(toContract);
}

export async function getContract(id: string): Promise<Contract | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select(`${LIST_COLS}, body`).eq("id", id).maybeSingle();
  return data ? toContract(data as ContractRow) : null;
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<{ data?: T; error?: DbError }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error };
  return { data: data as T };
}
