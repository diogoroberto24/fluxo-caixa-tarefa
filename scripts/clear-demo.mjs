// Remove TODOS os dados de demonstração (clientes com is_demo = true e o que depende deles).
// Clientes reais NÃO são tocados. Uso: npm run clear:demo
import { adminClient, clearDemoFinance, clearDemoTasks, fail } from "./_admin.mjs";

const supabase = adminClient();

const { data: demo, error: e1 } = await supabase.from("clients").select("id, trade_name").eq("is_demo", true);
if (e1) fail("listar demo", e1);
if (!demo.length) {
  console.log("Nenhum dado de demonstração encontrado.");
  process.exit(0);
}
const ids = demo.map((c) => c.id);

const tk = await clearDemoTasks(supabase);
console.log(`Tarefas demo removidas: ${tk.tasks}.`);
const fin = await clearDemoFinance(supabase);
console.log(`Financeiro demo removido: ${fin.receivables} cobranças, ${fin.payables} contas.`);

// dependências primeiro (as chaves estrangeiras não têm exclusão em cascata)
const { error: e2 } = await supabase.from("client_fee_history").delete().in("client_id", ids);
if (e2) fail("histórico de honorários", e2);
const { error: e3 } = await supabase.from("clients").delete().in("id", ids);
if (e3) fail("clientes", e3);

console.log(`Removidos ${ids.length} clientes de demonstração: ${demo.map((c) => c.trade_name).join(", ")}.`);
