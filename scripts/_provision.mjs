// Preparação de um escritório novo e criação de usuários (rodam na sua máquina, com a chave secreta; nunca no navegador).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fail } from "./_admin.mjs";

const dir = new URL("../docs/modelos/", import.meta.url);

/** Modelos de contrato que todo escritório novo recebe (editáveis depois, na tela Contratos). */
export const CONTRACT_MODELS = [
  { file: "contrato-servicos-contabeis.modelo.txt", name: "Prestação de serviços contábeis — empresa (cliente fixo)", audience: "FIXO", party: "PJ" },
  { file: "contrato-servicos-contabeis-pessoa-fisica.modelo.txt", name: "Prestação de serviços contábeis — pessoa física (cliente fixo)", audience: "FIXO", party: "PF" },
  { file: "contrato-servico-avulso.modelo.txt", name: "Prestação de serviço avulso — cliente eventual", audience: "EVENTUAL", party: "QUALQUER" },
];

/** Categorias financeiras padrão (contas a pagar). */
export const DEFAULT_CATEGORIES = ["Aluguel", "Utilidades", "Salários", "Impostos", "Software", "Material", "Taxas", "Outras"];

/** Cadastra categorias e modelos que ainda não existem no escritório. Com update, substitui o texto dos modelos. */
export async function provisionOffice(supabase, officeId, { update = false } = {}) {
  const log = [];
  const cats = await supabase.from("financial_categories").select("name, kind").eq("office_id", officeId);
  if (cats.error) fail("consultar categorias", cats.error);
  const haveCat = new Set(cats.data.map((c) => `${c.kind}:${c.name}`));
  const newCats = DEFAULT_CATEGORIES.filter((n) => !haveCat.has(`PAGAR:${n}`)).map((name) => ({ office_id: officeId, name, kind: "PAGAR" }));
  if (newCats.length) {
    const { error } = await supabase.from("financial_categories").insert(newCats);
    if (error) fail("cadastrar categorias", error);
  }
  log.push(`categorias: ${newCats.length} cadastrada(s)`);

  for (const m of CONTRACT_MODELS) {
    const body = readFileSync(new URL(m.file, dir), "utf8");
    const found = await supabase.from("contract_templates").select("id").eq("office_id", officeId).eq("name", m.name).maybeSingle();
    if (found.error) fail(`consultar modelo "${m.name}"`, found.error);
    if (found.data && !update) {
      log.push(`modelo mantido: ${m.name}`);
      continue;
    }
    const row = { office_id: officeId, name: m.name, audience: m.audience, party: m.party, body, active: true };
    const r = found.data
      ? await supabase.from("contract_templates").update(row).eq("id", found.data.id)
      : await supabase.from("contract_templates").insert(row);
    if (r.error) fail(`gravar modelo "${m.name}"`, r.error);
    log.push(`modelo ${found.data ? "atualizado" : "cadastrado"}: ${m.name}`);
  }
  return log;
}

export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

export function tempPassword() {
  return randomBytes(9).toString("base64url");
}

/**
 * Cria o usuário no Auth (e-mail já confirmado) e o liga ao escritório com o perfil informado.
 * Falha se o e-mail já existir. Devolve a senha provisória.
 */
export async function createOfficeUser(supabase, { officeId, email, name, role, password }) {
  const pass = password || tempPassword();
  const created = await supabase.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (created.error) fail(`criar usuário ${email}`, created.error);
  const id = created.data.user.id;
  // o gatilho já criou o perfil (inativo e sem escritório); aqui ele é vinculado ao escritório
  const { error } = await supabase.from("profiles").update({ full_name: name, role, active: true, office_id: officeId }).eq("id", id);
  if (error) fail(`vincular ${email} ao escritório`, error);
  return { id, password: pass };
}
