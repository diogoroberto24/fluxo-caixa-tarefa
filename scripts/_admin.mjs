// Utilitário dos scripts administrativos (rodam na sua máquina, nunca no navegador/Vercel).
// Usa a chave SECRETA (service_role), que ignora o RLS. Carregue com: node --env-file=.env.local ...
import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY no .env.local.");
    process.exit(1);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function fail(context, error) {
  console.error(`ERRO (${context}):`, error?.message ?? error);
  if (/permission denied|does not exist|schema cache/i.test(error?.message ?? "")) {
    console.error("Dica: as migrações SQL já foram executadas, na ordem 0001, 0002 e 0003? (ver docs/SUPABASE.md)");
  }
  process.exit(1);
}

/** Remove o financeiro de demonstração (pagamentos, contas, cobranças e regras). Clientes ficam para quem chamou. */
export async function clearDemoFinance(supabase) {
  const step = async (label, q) => { const { error } = await q; if (error) fail(label, error); };

  // cobranças demo OU de clientes demo (geradas depois pelo app), para não bloquear a exclusão dos clientes
  const demoClients = await supabase.from("clients").select("id").eq("is_demo", true);
  if (demoClients.error) fail("listar clientes demo", demoClients.error);
  const clientIds = demoClients.data.map((c) => c.id);
  const rec = await supabase
    .from("receivables")
    .select("id")
    .or(clientIds.length ? `is_demo.eq.true,client_id.in.(${clientIds.join(",")})` : "is_demo.eq.true");
  if (rec.error) fail("listar cobranças demo", rec.error);
  const pay = await supabase.from("payables").select("id, recurrence_rule_id").eq("is_demo", true);
  if (pay.error) fail("listar contas demo", pay.error);
  const recIds = rec.data.map((r) => r.id);
  const payIds = pay.data.map((p) => p.id);
  const ruleIds = [...new Set(pay.data.map((p) => p.recurrence_rule_id).filter(Boolean))];

  if (recIds.length) await step("pagamentos (cobranças)", supabase.from("payments").delete().in("receivable_id", recIds));
  if (payIds.length) await step("pagamentos (contas)", supabase.from("payments").delete().in("payable_id", payIds));
  if (payIds.length) await step("contas a pagar", supabase.from("payables").delete().in("id", payIds));
  if (ruleIds.length) await step("regras de recorrência", supabase.from("recurrence_rules").delete().in("id", ruleIds));
  if (recIds.length) await step("cobranças", supabase.from("receivables").delete().in("id", recIds));
  return { receivables: recIds.length, payables: payIds.length };
}

/** Remove tarefas de demonstração (execuções, definições e regras), inclusive as de clientes demo. */
export async function clearDemoTasks(supabase) {
  const step = async (label, q) => { const { error } = await q; if (error) fail(label, error); };
  const demoClients = await supabase.from("clients").select("id").eq("is_demo", true);
  if (demoClients.error) fail("listar clientes demo", demoClients.error);
  const clientIds = demoClients.data.map((c) => c.id);
  const defs = await supabase
    .from("task_definitions")
    .select("id, recurrence_rule_id")
    .or(clientIds.length ? `is_demo.eq.true,client_id.in.(${clientIds.join(",")})` : "is_demo.eq.true");
  if (defs.error) fail("listar tarefas demo", defs.error);
  const defIds = defs.data.map((d) => d.id);
  const ruleIds = [...new Set(defs.data.map((d) => d.recurrence_rule_id).filter(Boolean))];
  if (defIds.length) await step("execuções", supabase.from("task_executions").delete().in("definition_id", defIds));
  if (defIds.length) await step("tarefas", supabase.from("task_definitions").delete().in("id", defIds));
  if (ruleIds.length) await step("regras de tarefas", supabase.from("recurrence_rules").delete().in("id", ruleIds));
  return { tasks: defIds.length };
}
