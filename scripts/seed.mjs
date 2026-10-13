// Cria (ou atualiza) o administrador e, com --demo, os clientes de demonstração.
//   npm run seed         -> só o administrador
//   npm run seed:demo    -> administrador + clientes de demonstração (is_demo = true)
// É seguro rodar de novo: não duplica nada.
import { readFileSync } from "node:fs";
import { adminClient, clearDemoFinance, clearDemoTasks, fail } from "./_admin.mjs";
import { buildDemoFinance } from "./demo-finance.mjs";
import { buildDemoTasks } from "./demo-tasks.mjs";

const withDemo = process.argv.includes("--demo");
const supabase = adminClient();

const email = process.env.SEED_ADMIN_EMAIL?.trim();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";

if (!email || !password) {
  console.error("Preencha SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mín. 8 caracteres) no .env.local.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("SEED_ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}

// 1) usuário no Supabase Auth (e-mail já confirmado: não depende do envio de e-mails)
let userId;
{
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) fail("criar usuário", error);
    // já existe: localiza pelo e-mail
    let page = 1;
    while (!userId) {
      const list = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (list.error) fail("listar usuários", list.error);
      const found = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) userId = found.id;
      else if (list.data.users.length < 200) fail("localizar usuário", "usuário existente não encontrado");
      else page++;
    }
    console.log(`Usuário já existia: ${email} (a senha NÃO foi alterada).`);
  } else {
    userId = data.user.id;
    console.log(`Usuário criado: ${email}`);
  }
}

// 2) perfil ADMIN ativo (o trigger já criou o perfil inativo)
{
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: name, role: "ADMIN", active: true }, { onConflict: "id" });
  if (error) fail("perfil do administrador", error);
  console.log("OK: perfil ADMIN ativo.");
}

// 3) clientes de demonstração
if (withDemo) {
  const seeds = JSON.parse(readFileSync(new URL("../src/data/demo-clients.json", import.meta.url), "utf8"));
  const rows = seeds.map((c) => ({
    id: c.id,
    legal_name: c.legalName,
    trade_name: c.tradeName,
    document: c.document,
    state_registration: c.stateRegistration ?? null,
    municipal_registration: c.municipalRegistration ?? null,
    zip: c.address.zip,
    street: c.address.street,
    number: c.address.number,
    complement: c.address.complement ?? null,
    district: c.address.district,
    city: c.address.city,
    state: c.address.state,
    phone: c.phone,
    email: c.email,
    tax_regime: c.taxRegime,
    contract_start: c.contractStart,
    modules: c.modules,
    monthly_fee: (c.monthlyFeeCents / 100).toFixed(2),
    fee_due_day: c.feeDueDay,
    active: c.active,
    notes: c.notes ?? null,
    is_demo: true,
    created_by: userId,
  }));
  const { error } = await supabase.from("clients").upsert(rows, { onConflict: "id" });
  if (error) fail("clientes de demonstração", error);
  console.log(`OK: ${rows.length} clientes de demonstração (is_demo = true).`);

  // financeiro de demonstração (recriado a cada execução, com datas relativas a hoje)
  await clearDemoFinance(supabase);
  const cats = await supabase.from("financial_categories").select("id, name").eq("kind", "PAGAR");
  if (cats.error) fail("categorias", cats.error);
  const fin = buildDemoFinance({
    seeds,
    categoryIdByName: Object.fromEntries(cats.data.map((c) => [c.name, c.id])),
    userId,
  });
  const ins = async (label, table, rows) => {
    if (!rows.length) return;
    const { error } = await supabase.from(table).insert(rows);
    if (error) fail(label, error);
  };
  await ins("regras", "recurrence_rules", fin.rules);
  await ins("cobranças", "receivables", fin.receivables);
  await ins("contas a pagar", "payables", fin.payables);
  await ins("pagamentos", "payments", fin.payments);
  console.log(`OK: financeiro demo: ${fin.receivables.length} cobranças, ${fin.payables.length} contas, ${fin.payments.length} pagamentos.`);

  // tarefas de demonstração (recriadas a cada execução)
  await clearDemoTasks(supabase);
  const tk = buildDemoTasks({ seeds, userId });
  await ins("regras de tarefas", "recurrence_rules", tk.rules);
  await ins("tarefas", "task_definitions", tk.definitions);
  await ins("execuções", "task_executions", tk.executions);
  console.log(`OK: tarefas demo: ${tk.definitions.length} tarefas, ${tk.executions.length} execuções.`);
}

console.log("Seed concluído.");
