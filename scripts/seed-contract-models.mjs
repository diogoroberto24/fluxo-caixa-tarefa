// Cadastra os modelos de contrato (docs/modelos/*.modelo.txt) e as categorias padrão que ainda faltarem.
//   npm run seed:contratos                       -> em TODOS os escritórios; só o que ainda não existe (não mexe no que foi editado)
//   npm run seed:contratos -- --office <id>      -> só em um escritório
//   npm run seed:contratos -- --update           -> também SUBSTITUI o texto dos modelos que já existem (perde edições feitas na tela)
import { adminClient, fail } from "./_admin.mjs";
import { arg, provisionOffice } from "./_provision.mjs";

const supabase = adminClient();
const only = arg("office");
const offices = await supabase.from("offices").select("id, name").order("created_at");
if (offices.error) fail("listar escritórios", offices.error);
const targets = offices.data.filter((o) => !only || o.id === only);
if (!targets.length) {
  console.error("Nenhum escritório encontrado.");
  process.exit(1);
}
for (const o of targets) {
  console.log(`\n== ${o.name} (${o.id})`);
  for (const line of await provisionOffice(supabase, o.id, { update: process.argv.includes("--update") })) console.log(line);
}
