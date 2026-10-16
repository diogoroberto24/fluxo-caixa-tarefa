// Restaura um backup (pasta de backup gerada por `npm run backup`) em um banco com as migrações já aplicadas.
// Uso: npm run restore -- backups/<pasta> --confirm
//
// Segurança:
//  * só restaura em banco SEM clientes (nunca sobrescreve dados existentes); para recomeçar, rode `npm run clear:demo`
//    ou use um projeto Supabase novo
//  * confere a integridade (SHA-256) de cada arquivo antes de gravar
//  * contas de login (Auth) NÃO são restauradas: perfis só são mantidos se a conta ainda existir
//  * audit_log não é regravado (os arquivos ficam no backup para consulta)
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient, fail } from "./_admin.mjs";

const dir = process.argv[2];
if (!dir || dir.startsWith("--") || !process.argv.includes("--confirm")) {
  console.error("Uso: npm run restore -- backups/<pasta> --confirm");
  process.exit(1);
}
if (!existsSync(join(dir, "manifest.json"))) {
  console.error(`Backup inválido: ${dir}/manifest.json não encontrado.`);
  process.exit(1);
}

const supabase = adminClient();
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

const load = (table) => {
  // backups antigos podem não ter tabelas criadas depois (ex.: task_types)
  if (!existsSync(join(dir, `${table}.json`)) && !manifest.tables[table]) return [];
  const raw = readFileSync(join(dir, `${table}.json`), "utf8");
  const sha = createHash("sha256").update(raw).digest("hex");
  if (manifest.tables[table]?.sha256 !== sha) {
    console.error(`Integridade falhou em ${table}.json (arquivo alterado ou corrompido). Nada foi gravado.`);
    process.exit(1);
  }
  return JSON.parse(raw);
};

// 1) valida tudo antes de tocar no banco
const data = Object.fromEntries(
  ["profiles", "financial_categories", "clients", "client_fee_history", "recurrence_rules", "receivables",
   "payables", "payments", "task_types", "task_definitions", "task_executions", "office_settings",
   "contract_templates", "contract_counters", "contracts"].map((t) => [t, load(t)]),
);

// 2) o banco precisa estar sem clientes
const existing = await supabase.from("clients").select("id", { count: "exact", head: true });
if (existing.error) fail("verificar banco", existing.error);
if (existing.count > 0) {
  console.error(`O banco já tem ${existing.count} cliente(s). Restauração recusada para não sobrescrever dados.`);
  process.exit(1);
}

// perfis existentes (referências a usuários que não existem mais viram nulas)
const prof = await supabase.from("profiles").select("id");
if (prof.error) fail("perfis", prof.error);
const known = new Set(prof.data.map((p) => p.id));
const keep = (id) => (id && known.has(id) ? id : null);

const put = async (table, rows, opts = {}) => {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const q = opts.ignoreDuplicates
      ? supabase.from(table).upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
      : supabase.from(table).insert(chunk);
    const { error } = await q;
    if (error) fail(`restaurar ${table}`, error);
  }
  console.log(`${table.padEnd(22)} ${rows.length} linhas`);
};

// categorias padrão já existem (migração): não duplica
await put("financial_categories", data.financial_categories, { ignoreDuplicates: true });
await put("clients", data.clients.map((c) => ({ ...c, created_by: keep(c.created_by) })));

// o gatilho de honorários já criou 1 linha por cliente: troca pelo histórico real do backup
{
  const ids = data.clients.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("client_fee_history").delete().in("client_id", ids.slice(i, i + 200));
    if (error) fail("limpar histórico gerado", error);
  }
  await put("client_fee_history", data.client_fee_history
    .sort((a, b) => a.id - b.id)
    // id é "generated always": o banco gera um novo, mantendo a ordem cronológica
    .map(({ id: _id, ...h }) => ({ ...h, created_by: keep(h.created_by) })));
}

await put("recurrence_rules", data.recurrence_rules.map((r) => ({ ...r, created_by: keep(r.created_by) })));
await put("receivables", data.receivables.map((r) => ({ ...r, created_by: keep(r.created_by), canceled_by: keep(r.canceled_by) })));
await put("payables", data.payables.map((p) => ({ ...p, created_by: keep(p.created_by), canceled_by: keep(p.canceled_by) })));
await put("payments", data.payments.map((p) => ({ ...p, created_by: keep(p.created_by) })));
await put("task_types", data.task_types.map((t) => ({ ...t, created_by: keep(t.created_by) })));
await put("task_definitions", data.task_definitions.map((t) => ({ ...t, created_by: keep(t.created_by), assignee_id: keep(t.assignee_id) })));
if (data.office_settings.length) await put("office_settings", data.office_settings.map((o) => ({ ...o, updated_by: keep(o.updated_by) })));
await put("contract_templates", data.contract_templates.map((t) => ({ ...t, created_by: keep(t.created_by) })));
// contract_counters usa a coluna "year" como chave (sem id)
if (data.contract_counters.length) {
  const { error } = await supabase.from("contract_counters").insert(data.contract_counters);
  if (error) fail("restaurar contract_counters", error);
  console.log(`contract_counters      ${data.contract_counters.length} linhas`);
}
await put("contracts", data.contracts.map((c) => ({ ...c, created_by: keep(c.created_by), canceled_by: keep(c.canceled_by) })));
await put("task_executions", data.task_executions.map((e) => ({ ...e, completed_by: keep(e.completed_by) })));

console.log("\nRestauração concluída. Confira os totais na tela e no manifesto do backup.");
