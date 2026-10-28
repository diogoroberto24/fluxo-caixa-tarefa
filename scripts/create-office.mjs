// Cria um escritório novo, o administrador dele, as categorias padrão e os modelos de contrato (editáveis).
// Uso:
//   npm run office:create -- --name "Escritório Exemplo" --admin-email adm@exemplo.com --admin-name "Fulano" [--document 00000000000100] [--password SENHA]
// Sem --password, gera uma senha provisória e mostra UMA vez no terminal (peça para a pessoa trocar no primeiro acesso).
import { adminClient, fail } from "./_admin.mjs";
import { arg, createOfficeUser, provisionOffice } from "./_provision.mjs";

const name = arg("name")?.trim();
const email = arg("admin-email")?.trim().toLowerCase();
const adminName = arg("admin-name")?.trim() || name;
const document = arg("document")?.replace(/\D/g, "") || null;
if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Uso: npm run office:create -- --name "Escritório" --admin-email adm@exemplo.com --admin-name "Nome" [--document CNPJ] [--password SENHA]');
  process.exit(1);
}
if (document && !/^(\d{11}|\d{14})$/.test(document)) {
  console.error("--document precisa ter 11 (CPF) ou 14 (CNPJ) dígitos.");
  process.exit(1);
}

const supabase = adminClient();
const office = await supabase.from("offices").insert({ name, document }).select("id").single();
if (office.error) fail("criar escritório", office.error);
const officeId = office.data.id;

const user = await createOfficeUser(supabase, { officeId, email, name: adminName, role: "ADMIN", password: arg("password") });
for (const line of await provisionOffice(supabase, officeId)) console.log(line);

console.log(`\nEscritório criado: ${name} (${officeId})`);
console.log(`Administrador: ${email}`);
if (!arg("password")) console.log(`Senha provisória: ${user.password}   (mostrada só agora; peça para trocar no primeiro acesso)`);
