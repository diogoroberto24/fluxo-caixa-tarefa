// Lista os escritórios; suspende ou reativa (base para a assinatura: escritório suspenso = ninguém dele acessa).
// Uso: npm run office:list
//      npm run office:list -- --suspend <id>      |      npm run office:list -- --activate <id>
import { adminClient, fail } from "./_admin.mjs";
import { arg } from "./_provision.mjs";

const supabase = adminClient();
for (const [flag, active] of [["suspend", false], ["activate", true]]) {
  const id = arg(flag);
  if (id) {
    const { error } = await supabase.from("offices").update({ active }).eq("id", id);
    if (error) fail(flag, error);
    console.log(`Escritório ${id}: ${active ? "ATIVADO" : "SUSPENSO"}.`);
  }
}
const { data, error } = await supabase.from("offices").select("id, name, active, created_at").order("created_at");
if (error) fail("listar escritórios", error);
const users = await supabase.from("profiles").select("office_id");
const count = (id) => (users.data ?? []).filter((u) => u.office_id === id).length;
for (const o of data) console.log(`${o.active ? "ATIVO   " : "SUSPENSO"}  ${o.id}  ${o.name}  (${count(o.id)} usuário(s))`);
