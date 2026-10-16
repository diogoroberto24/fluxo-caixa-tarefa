// Cadastra no sistema os modelos de contrato do escritório (arquivos em docs/modelos/*.modelo.txt).
//   npm run seed:contratos            -> cadastra só os que ainda não existem (não mexe nos que você já editou)
//   npm run seed:contratos -- --update -> também SUBSTITUI o texto dos que já existem (perde edições feitas na tela)
// Precisa da migração 0022 já executada.
import { readFileSync } from "node:fs";
import { adminClient, fail } from "./_admin.mjs";

const update = process.argv.includes("--update");
const dir = new URL("../docs/modelos/", import.meta.url);

const MODELS = [
  { file: "contrato-servicos-contabeis.modelo.txt", name: "Prestação de serviços contábeis — empresa (cliente fixo)", audience: "FIXO", party: "PJ" },
  { file: "contrato-servicos-contabeis-pessoa-fisica.modelo.txt", name: "Prestação de serviços contábeis — pessoa física (cliente fixo)", audience: "FIXO", party: "PF" },
  { file: "contrato-servico-avulso.modelo.txt", name: "Prestação de serviço avulso — cliente eventual", audience: "EVENTUAL", party: "QUALQUER" },
];

const supabase = adminClient();
for (const m of MODELS) {
  const body = readFileSync(new URL(m.file, dir), "utf8");
  const found = await supabase.from("contract_templates").select("id").eq("name", m.name).maybeSingle();
  if (found.error) fail(`consultar modelo "${m.name}"`, found.error);
  if (found.data && !update) {
    console.log(`já existe, mantido: ${m.name}`);
    continue;
  }
  const row = { name: m.name, audience: m.audience, party: m.party, body, active: true };
  const r = found.data
    ? await supabase.from("contract_templates").update(row).eq("id", found.data.id)
    : await supabase.from("contract_templates").insert(row);
  if (r.error) fail(`gravar modelo "${m.name}"`, r.error);
  console.log(`${found.data ? "atualizado" : "cadastrado"}: ${m.name}`);
}
