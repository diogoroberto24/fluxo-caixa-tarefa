// Adiciona um usuário a um escritório existente (convite feito por você, com a chave secreta).
// Uso: npm run office:user -- --office <id-do-escritorio> --email pessoa@exemplo.com --name "Nome" --role ADMIN|CONTADOR|FINANCEIRO|OPERADOR [--password SENHA]
import { adminClient, fail } from "./_admin.mjs";
import { arg, createOfficeUser } from "./_provision.mjs";

const officeId = arg("office");
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const role = arg("role")?.toUpperCase();
if (!officeId || !email || !name || !["ADMIN", "CONTADOR", "FINANCEIRO", "OPERADOR"].includes(role ?? "")) {
  console.error("Uso: npm run office:user -- --office <id> --email <e-mail> --name <nome> --role ADMIN|CONTADOR|FINANCEIRO|OPERADOR [--password SENHA]");
  process.exit(1);
}
const supabase = adminClient();
const office = await supabase.from("offices").select("id, name").eq("id", officeId).maybeSingle();
if (office.error) fail("consultar escritório", office.error);
if (!office.data) {
  console.error("Escritório não encontrado. Veja os ids com: npm run office:list");
  process.exit(1);
}

const user = await createOfficeUser(supabase, { officeId, email, name, role, password: arg("password") });
console.log(`Usuário ${email} (${role}) criado no escritório "${office.data.name}".`);
if (!arg("password")) console.log(`Senha provisória: ${user.password}   (mostrada só agora; peça para trocar no primeiro acesso)`);
