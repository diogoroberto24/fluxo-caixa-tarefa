/**
 * Núcleo do módulo de contratos (sem dependências de servidor: usado na prévia e na emissão).
 *  - catálogo de variáveis que os modelos podem usar, no formato {{grupo.campo}}
 *  - montagem dos valores a partir do escritório, do cliente e das condições informadas
 *  - renderização do modelo, valor por extenso e data por extenso
 */
import { formatBRL, formatDate, formatDocument, formatPhone, formatZip } from "@/lib/format";
import { planInstallments } from "@/lib/installments";
import { centsToInput, parseMoneyToCents } from "@/lib/money";
import { MODULE_LABEL, TAX_REGIME_LABEL } from "@/services/clients";
import type { Address, Client, ServiceModule } from "@/types/domain";

// ----------------------------------------------------------------- por extenso
const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const SCALES: [string, string][] = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];

function below1000(n: number): string {
  if (n === 100) return "cem";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 20) parts.push(UNITS[r]);
    else {
      const t = Math.floor(r / 10);
      const u = r % 10;
      parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(" e ");
}

/** Número inteiro (0 a 999 bilhões) por extenso, em português do Brasil. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) throw new Error("Número fora do intervalo suportado.");
  if (n === 0) return "zero";
  const chunks: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) chunks.push(rest % 1000);
  const parts: { text: string; chunk: number; index: number }[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (!c) continue;
    let text: string;
    if (i === 0) text = below1000(c);
    else if (i === 1) text = c === 1 ? "mil" : `${below1000(c)} mil`;
    else text = `${below1000(c)} ${c === 1 ? SCALES[i][0] : SCALES[i][1]}`;
    parts.push({ text, chunk: c, index: i });
  }
  let out = parts[0].text;
  for (let k = 1; k < parts.length; k++) {
    // "e" antes do último grupo quando ele é menor que 100 ou múltiplo de 100 (mil e duzentos; um milhão e um)
    const last = k === parts.length - 1;
    const c = parts[k].chunk;
    out += last && (c < 100 || c % 100 === 0) ? ` e ${parts[k].text}` : ` ${parts[k].text}`;
  }
  return out;
}

/** Valor em centavos por extenso: 120000 -> "mil e duzentos reais". */
export function moneyToWords(cents: number): string {
  const total = Math.round(cents);
  const reais = Math.floor(total / 100);
  const cent = total % 100;
  const parts: string[] = [];
  if (reais > 0) {
    if (reais === 1) parts.push("um real");
    else if (reais >= 1_000_000 && reais % 1_000_000 === 0) parts.push(`${numberToWords(reais)} de reais`);
    else parts.push(`${numberToWords(reais)} reais`);
  }
  if (cent > 0) parts.push(cent === 1 ? "um centavo" : `${numberToWords(cent)} centavos`);
  return parts.length ? parts.join(" e ") : "zero reais";
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10-16" -> "16 de outubro de 2026". */
export function dateInWords(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** O modelo vale para o tipo de pessoa do cliente? CPF (11 dígitos) = pessoa física; CNPJ = empresa. */
export function partyMatches(party: "QUALQUER" | "PJ" | "PF", document: string): boolean {
  if (party === "QUALQUER") return true;
  const person = document.replace(/\D/g, "").length === 11;
  return party === "PF" ? person : !person;
}

// ------------------------------------------------------------------- variáveis
export interface VariableDef {
  key: string;
  label: string;
  group: "Escritório" | "Cliente" | "Contrato" | "Condições";
  /** Opcional: se estiver vazio, sai em branco em vez de bloquear a emissão. */
  optional?: boolean;
  /** Condição de bloco ({{#se campo}}...{{/se}}): vale "sim" ou "não", nunca bloqueia a emissão. */
  flag?: boolean;
}

export const CONTRACT_VARIABLES: VariableDef[] = [
  { key: "escritorio.razao_social", label: "Razão social do escritório", group: "Escritório" },
  { key: "escritorio.nome_fantasia", label: "Nome fantasia do escritório", group: "Escritório", optional: true },
  { key: "escritorio.cnpj", label: "CNPJ/CPF do escritório", group: "Escritório" },
  { key: "escritorio.crc", label: "CRC do escritório", group: "Escritório" },
  { key: "escritorio.endereco", label: "Endereço completo do escritório", group: "Escritório" },
  { key: "escritorio.logradouro", label: "Logradouro do escritório (rua, avenida…)", group: "Escritório" },
  { key: "escritorio.numero", label: "Número do endereço do escritório", group: "Escritório" },
  { key: "escritorio.cidade", label: "Cidade do escritório", group: "Escritório" },
  { key: "escritorio.uf", label: "UF do escritório (PR)", group: "Escritório" },
  { key: "escritorio.estado_extenso", label: "Estado do escritório por extenso (Paraná)", group: "Escritório" },
  { key: "escritorio.estado_artigo", label: "Estado com preposição (do Paraná, de Santa Catarina, da Bahia)", group: "Escritório" },
  { key: "escritorio.chave_pix", label: "Chave PIX do escritório", group: "Escritório" },
  { key: "escritorio.telefone", label: "Telefone do escritório", group: "Escritório", optional: true },
  { key: "escritorio.email", label: "E-mail do escritório", group: "Escritório", optional: true },
  { key: "escritorio.responsavel_nome", label: "Responsável (nome)", group: "Escritório" },
  { key: "escritorio.responsavel_cpf", label: "Responsável (CPF)", group: "Escritório" },
  { key: "escritorio.responsavel_cargo", label: "Responsável (cargo)", group: "Escritório" },
  { key: "escritorio.responsavel_crc", label: "Responsável (número do CRC)", group: "Escritório" },
  { key: "cliente.razao_social", label: "Razão social / nome do cliente", group: "Cliente" },
  { key: "cliente.nome_fantasia", label: "Nome fantasia do cliente", group: "Cliente", optional: true },
  { key: "cliente.tipo_documento", label: "Tipo do documento (CPF ou CNPJ)", group: "Cliente" },
  { key: "cliente.documento", label: "CPF/CNPJ do cliente", group: "Cliente" },
  { key: "cliente.rg", label: "RG do cliente (pessoa física)", group: "Cliente" },
  { key: "cliente.representante_nome", label: "Representante legal (nome)", group: "Cliente" },
  { key: "cliente.representante_rg", label: "Representante legal (RG)", group: "Cliente" },
  { key: "cliente.representante_cpf", label: "Representante legal (CPF)", group: "Cliente" },
  { key: "cliente.representante_endereco", label: "Representante legal (endereço de residência)", group: "Cliente" },
  { key: "cliente.inscricao_estadual", label: "Inscrição estadual", group: "Cliente", optional: true },
  { key: "cliente.inscricao_municipal", label: "Inscrição municipal", group: "Cliente", optional: true },
  { key: "cliente.endereco", label: "Endereço completo do cliente", group: "Cliente" },
  { key: "cliente.cep", label: "CEP do cliente", group: "Cliente" },
  { key: "cliente.cidade", label: "Cidade do cliente", group: "Cliente" },
  { key: "cliente.uf", label: "UF do cliente", group: "Cliente" },
  { key: "cliente.telefone", label: "Telefone do cliente", group: "Cliente" },
  { key: "cliente.email", label: "E-mail do cliente", group: "Cliente" },
  { key: "cliente.regime_tributario", label: "Regime tributário", group: "Cliente" },
  { key: "contrato.numero", label: "Número do contrato (gerado ao emitir)", group: "Contrato" },
  { key: "contrato.data_emissao", label: "Data de emissão por extenso", group: "Contrato" },
  { key: "contrato.data_emissao_curta", label: "Data de emissão (dd/mm/aaaa)", group: "Contrato" },
  { key: "contrato.cidade_emissao", label: "Cidade de emissão", group: "Contrato" },
  { key: "contrato.data_inicio", label: "Data de início", group: "Contrato" },
  { key: "contrato.vigencia", label: "Vigência (texto)", group: "Contrato" },
  { key: "contrato.servicos", label: "Serviços contratados", group: "Contrato" },
  { key: "contrato.honorarios", label: "Honorários mensais (R$)", group: "Contrato" },
  { key: "contrato.honorarios_extenso", label: "Honorários mensais por extenso", group: "Contrato" },
  { key: "contrato.vencimento_dia", label: "Dia do vencimento mensal", group: "Contrato" },
  { key: "contrato.reajuste", label: "Cláusula de reajuste (texto livre)", group: "Contrato", optional: true },
  { key: "contrato.descricao_servico", label: "Descrição do serviço avulso", group: "Contrato" },
  { key: "contrato.valor_total", label: "Valor total do serviço avulso (R$)", group: "Contrato" },
  { key: "contrato.valor_total_extenso", label: "Valor total por extenso", group: "Contrato" },
  { key: "contrato.forma_pagamento", label: "Forma de pagamento (texto)", group: "Contrato" },
  { key: "contrato.foro", label: "Foro (comarca)", group: "Contrato" },
  { key: "contrato.observacoes", label: "Observações / cláusulas adicionais", group: "Contrato", optional: true },
  { key: "modulo.contabil", label: "Cliente contratou Contabilidade", group: "Condições", flag: true },
  { key: "modulo.fiscal", label: "Cliente contratou Obrigações Fiscais", group: "Condições", flag: true },
  { key: "modulo.folha", label: "Cliente contratou Folha de Pagamento", group: "Condições", flag: true },
  { key: "modulo.societario", label: "Cliente contratou Serviços Societários", group: "Condições", flag: true },
];

/** Estados: nome por extenso e a preposição usada em "Estado do Paraná / de Santa Catarina / da Bahia". */
const STATES: Record<string, { name: string; of: "do" | "da" | "de" }> = {
  AC: { name: "Acre", of: "do" }, AL: { name: "Alagoas", of: "de" }, AP: { name: "Amapá", of: "do" },
  AM: { name: "Amazonas", of: "do" }, BA: { name: "Bahia", of: "da" }, CE: { name: "Ceará", of: "do" },
  DF: { name: "Distrito Federal", of: "do" }, ES: { name: "Espírito Santo", of: "do" }, GO: { name: "Goiás", of: "de" },
  MA: { name: "Maranhão", of: "do" }, MT: { name: "Mato Grosso", of: "de" }, MS: { name: "Mato Grosso do Sul", of: "de" },
  MG: { name: "Minas Gerais", of: "de" }, PA: { name: "Pará", of: "do" }, PB: { name: "Paraíba", of: "da" },
  PR: { name: "Paraná", of: "do" }, PE: { name: "Pernambuco", of: "de" }, PI: { name: "Piauí", of: "do" },
  RJ: { name: "Rio de Janeiro", of: "do" }, RN: { name: "Rio Grande do Norte", of: "do" },
  RS: { name: "Rio Grande do Sul", of: "do" }, RO: { name: "Rondônia", of: "de" }, RR: { name: "Roraima", of: "de" },
  SC: { name: "Santa Catarina", of: "de" }, SP: { name: "São Paulo", of: "de" }, SE: { name: "Sergipe", of: "de" },
  TO: { name: "Tocantins", of: "do" },
};

export function stateName(uf: string): string {
  return STATES[uf.trim().toUpperCase()]?.name ?? "";
}

/** "PR" -> "do Paraná"; "SC" -> "de Santa Catarina"; "BA" -> "da Bahia". */
export function stateWithArticle(uf: string): string {
  const s = STATES[uf.trim().toUpperCase()];
  return s ? `${s.of} ${s.name}` : "";
}

export interface OfficeData {
  legalName: string;
  tradeName: string;
  document: string;
  crc: string;
  representativeName: string;
  representativeDocument: string;
  representativeRole: string;
  representativeCrc: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  defaultForum: string;
  pixKey: string;
}

export const EMPTY_OFFICE: OfficeData = {
  legalName: "", tradeName: "", document: "", crc: "", representativeName: "", representativeDocument: "",
  representativeRole: "", representativeCrc: "", zip: "", street: "", number: "", complement: "", district: "",
  city: "", state: "", phone: "", email: "", defaultForum: "", pixKey: "",
};

/** Condições informadas na emissão (cada contrato usa as do tipo do cliente). */
export interface ContractConditions {
  startDate: string;
  forum: string;
  notes: string;
  // cliente fixo
  termMonths: number; // 0 = prazo indeterminado
  services: ServiceModule[];
  monthlyFeeCents: number;
  dueDay: number;
  adjustment: string;
  // cliente eventual
  serviceDescription: string;
  totalCents: number;
  installments: number;
  firstDueDate: string;
}

function addressLine(a: { street: string; number: string; complement?: string; district: string; city: string; state: string; zip: string }) {
  if (!a.street) return "";
  const parts = [`${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""}`, a.district, `${a.city}/${a.state}`];
  return `${parts.filter(Boolean).join(", ")}${a.zip ? `, CEP ${formatZip(a.zip)}` : ""}`;
}

/** "Rua X, nº 45 - ap 2, Bairro Y, Município de Curitiba, CEP 80000-000" (vazio se faltar parte essencial). */
function residenceLine(a: Address | undefined): string {
  if (!a || !a.street || !a.number || !a.district || !a.city) return "";
  const num = `nº ${a.number}${a.complement ? ` - ${a.complement}` : ""}`;
  return [a.street, num, `Bairro ${a.district}`, `Município de ${a.city}`, a.zip ? `CEP ${formatZip(a.zip)}` : ""]
    .filter(Boolean)
    .join(", ");
}

function paymentText(cond: ContractConditions): string {
  const plan = planInstallments(cond.totalCents, cond.installments, cond.firstDueDate);
  if (plan.length === 0) return "";
  if (plan.length === 1) return `à vista, com vencimento em ${formatDate(plan[0].dueDate)}`;
  const first = plan[0].amountCents;
  const rest = plan[1].amountCents;
  const amounts =
    first === rest
      ? `de ${formatBRL(first)} (${moneyToWords(first)}) cada`
      : `sendo a primeira de ${formatBRL(first)} (${moneyToWords(first)}) e as demais de ${formatBRL(rest)} (${moneyToWords(rest)}) cada`;
  return `em ${plan.length} (${plan.length === 2 ? "duas" : numberToWords(plan.length)}) parcelas mensais e consecutivas, ${amounts}, vencendo a primeira em ${formatDate(plan[0].dueDate)} e as demais no mesmo dia dos meses seguintes`;
}

/** Valores de todas as variáveis ("" = não informado). */
export function buildContractVariables(args: {
  office: OfficeData;
  client: Client;
  cond: ContractConditions;
  issuedOn: string;
}): Record<string, string> {
  const { office: o, client: c, cond, issuedOn } = args;
  const eventual = c.kind === "EVENTUAL";
  const term = cond.termMonths;
  return {
    "escritorio.razao_social": o.legalName,
    "escritorio.nome_fantasia": o.tradeName,
    "escritorio.cnpj": o.document ? formatDocument(o.document) : "",
    "escritorio.crc": o.crc,
    "escritorio.endereco": addressLine(o),
    "escritorio.logradouro": o.street,
    "escritorio.numero": o.number,
    "escritorio.cidade": o.city,
    "escritorio.uf": o.state.toUpperCase(),
    "escritorio.estado_extenso": stateName(o.state),
    "escritorio.estado_artigo": stateWithArticle(o.state),
    "escritorio.chave_pix": o.pixKey,
    "escritorio.telefone": o.phone ? formatPhone(o.phone) : "",
    "escritorio.email": o.email,
    "escritorio.responsavel_nome": o.representativeName,
    "escritorio.responsavel_cpf": o.representativeDocument ? formatDocument(o.representativeDocument) : "",
    "escritorio.responsavel_cargo": o.representativeRole,
    "escritorio.responsavel_crc": o.representativeCrc,
    "cliente.razao_social": c.legalName,
    "cliente.nome_fantasia": c.tradeName === c.legalName ? "" : c.tradeName,
    "cliente.tipo_documento": c.document.length === 11 ? "CPF" : "CNPJ",
    "cliente.documento": formatDocument(c.document),
    "cliente.rg": c.rg ?? "",
    "cliente.representante_nome": c.representative?.name ?? "",
    "cliente.representante_rg": c.representative?.rg ?? "",
    "cliente.representante_cpf": c.representative?.document ? formatDocument(c.representative.document) : "",
    "cliente.representante_endereco": residenceLine(c.representative?.address),
    "cliente.inscricao_estadual": c.stateRegistration ?? "",
    "cliente.inscricao_municipal": c.municipalRegistration ?? "",
    "cliente.endereco": addressLine(c.address),
    "cliente.cep": formatZip(c.address.zip),
    "cliente.cidade": c.address.city,
    "cliente.uf": c.address.state,
    "cliente.telefone": formatPhone(c.phone),
    "cliente.email": c.email,
    "cliente.regime_tributario": TAX_REGIME_LABEL[c.taxRegime],
    "contrato.numero": "",
    "contrato.data_emissao": dateInWords(issuedOn),
    "contrato.data_emissao_curta": formatDate(issuedOn),
    "contrato.cidade_emissao": o.city,
    "contrato.data_inicio": formatDate(cond.startDate),
    "contrato.vigencia":
      eventual ? "até a conclusão do serviço contratado" : term > 0 ? `${term} (${numberToWords(term)}) meses` : "prazo indeterminado",
    "contrato.servicos": joinList(cond.services.map((m) => MODULE_LABEL[m])),
    "contrato.honorarios": cond.monthlyFeeCents > 0 ? formatBRL(cond.monthlyFeeCents) : "",
    "contrato.honorarios_extenso": cond.monthlyFeeCents > 0 ? moneyToWords(cond.monthlyFeeCents) : "",
    "contrato.vencimento_dia": cond.dueDay > 0 ? String(cond.dueDay) : "",
    "contrato.reajuste": cond.adjustment.trim(),
    "contrato.descricao_servico": cond.serviceDescription.trim(),
    "contrato.valor_total": cond.totalCents > 0 ? formatBRL(cond.totalCents) : "",
    "contrato.valor_total_extenso": cond.totalCents > 0 ? moneyToWords(cond.totalCents) : "",
    "contrato.forma_pagamento": eventual
      ? paymentText(cond)
      : cond.dueDay > 0
        ? `mensalmente, com vencimento todo dia ${cond.dueDay} (${numberToWords(cond.dueDay)})`
        : "",
    "contrato.foro": cond.forum.trim(),
    "contrato.observacoes": cond.notes.trim(),
    "modulo.contabil": cond.services.includes("CONTABIL") ? "1" : "",
    "modulo.fiscal": cond.services.includes("FISCAL") ? "1" : "",
    "modulo.folha": cond.services.includes("FOLHA") ? "1" : "",
    "modulo.societario": cond.services.includes("SOCIETARIO") ? "1" : "",
  };
}

// ------------------------------------------------------------------ renderização
const TOKEN = /\{\{\s*([A-Za-z_]+\.[A-Za-z_]+)\s*\}\}/g;
export const NUMBER_TOKEN = "{{contrato.numero}}";
// Blocos condicionais {{#se modulo.fiscal}} ... {{/se}} (sem aninhar); a quebra de linha após cada marcador é consumida.
const BLOCK = /\{\{\s*#se\s+([A-Za-z_]+\.[A-Za-z_]+)\s*\}\}[ \t]*\r?\n?([\s\S]*?)\{\{\s*\/se\s*\}\}[ \t]*\r?\n?/gi;
const N_TOKEN = /\{\{\s*n\s*\}\}/gi;
const STRAY_BLOCK = /\{\{\s*(?:#se[^}]*|\/se)\s*\}\}/gi;

const KNOWN = new Map(CONTRACT_VARIABLES.map((v) => [v.key, v]));

export interface RenderResult {
  text: string;
  /** Variáveis obrigatórias sem valor. */
  missing: string[];
  /** Variáveis que não existem (erro de digitação no modelo). */
  unknown: string[];
}

/**
 * Preenche o modelo. `number`: texto para {{contrato.numero}}; use NUMBER_TOKEN para manter o marcador
 * (o banco troca pelo número real ao emitir).
 */
export function renderTemplate(body: string, vars: Record<string, string>, number: string = NUMBER_TOKEN): RenderResult {
  const missing = new Set<string>();
  const unknown = new Set<string>();

  // Blocos condicionais: só entram se a condição for verdadeira; o {{n}} dentro deles é a numeração corrida
  // dos blocos que entraram (1, 2, 3…), então ausentes não deixam buracos na contagem.
  let blockNumber = 0;
  const withoutBlocks = body.replace(BLOCK, (_whole, raw: string, inner: string) => {
    const key = raw.toLowerCase();
    if (!KNOWN.get(key)?.flag) {
      unknown.add(`#se ${raw}`);
      return "";
    }
    if (!(vars[key] ?? "").trim()) return "";
    blockNumber += 1;
    return inner.replace(N_TOKEN, String(blockNumber));
  });
  for (const stray of withoutBlocks.match(STRAY_BLOCK) ?? []) unknown.add(stray.slice(2, -2).trim());
  N_TOKEN.lastIndex = 0;
  if (N_TOKEN.test(withoutBlocks)) unknown.add("n (só vale dentro de um bloco {{#se …}})");

  const text = withoutBlocks.replace(TOKEN, (whole, raw: string) => {
    const key = raw.toLowerCase();
    if (key === "contrato.numero") return number;
    const def = KNOWN.get(key);
    if (!def) {
      unknown.add(raw);
      return whole;
    }
    if (def.flag) return (vars[key] ?? "").trim() ? "sim" : "não";
    const value = (vars[key] ?? "").trim();
    if (value) return value;
    if (def.optional) return "";
    missing.add(key);
    return "[NÃO INFORMADO]";
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}

export function variableLabel(key: string): string {
  return KNOWN.get(key)?.label ?? key;
}

/** Estrutura mínima de exemplo para começar um modelo. NÃO é texto jurídico: revisar antes de usar. */
export const EXAMPLE_TEMPLATE = `[EXEMPLO DE ESTRUTURA — substitua pelo modelo do escritório e revise juridicamente]

CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS Nº {{contrato.numero}}

CONTRATADA: {{escritorio.razao_social}}, inscrita no CNPJ/CPF {{escritorio.cnpj}}, CRC {{escritorio.crc}}, com sede em {{escritorio.endereco}}, neste ato representada por {{escritorio.responsavel_nome}}.

CONTRATANTE: {{cliente.razao_social}}, inscrito(a) no {{cliente.tipo_documento}} {{cliente.documento}}, com endereço em {{cliente.endereco}}, e-mail {{cliente.email}}, telefone {{cliente.telefone}}.

CLÁUSULA 1 – DO OBJETO
Prestação dos seguintes serviços: {{contrato.servicos}}.

CLÁUSULA 2 – DOS HONORÁRIOS
Honorários mensais de {{contrato.honorarios}} ({{contrato.honorarios_extenso}}), pagos {{contrato.forma_pagamento}}. {{contrato.reajuste}}

CLÁUSULA 3 – DA VIGÊNCIA
Início em {{contrato.data_inicio}}, com vigência de {{contrato.vigencia}}.

CLÁUSULA 4 – DO FORO
Fica eleito o foro da comarca de {{contrato.foro}}.

{{contrato.observacoes}}

{{contrato.cidade_emissao}}, {{contrato.data_emissao}}.


______________________________          ______________________________
{{escritorio.razao_social}}              {{cliente.razao_social}}
`;

// ------------------------------------------------------------- formulário de emissão
/** Valores do formulário de emissão (tudo texto, como digitado). */
export interface ContractFormValues {
  startDate: string;
  termMonths: string;
  services: ServiceModule[];
  monthlyFee: string;
  dueDay: string;
  adjustment: string;
  forum: string;
  notes: string;
  serviceDescription: string;
  serviceTotal: string;
  installments: string;
  firstDueDate: string;
}

export function defaultContractForm(client: Client, office: OfficeData, today: string): ContractFormValues {
  return {
    startDate: client.kind === "EVENTUAL" ? client.contractStart : client.contractStart > today ? client.contractStart : today,
    termMonths: "12",
    services: client.modules,
    monthlyFee: client.kind === "FIXO" && client.monthlyFeeCents > 0 ? centsToInput(client.monthlyFeeCents) : "",
    dueDay: client.kind === "FIXO" ? String(client.feeDueDay) : "",
    adjustment: "",
    forum: office.defaultForum || (office.city && office.state ? `${office.city}/${office.state}` : ""),
    notes: "",
    serviceDescription: "",
    serviceTotal: "",
    installments: "1",
    firstDueDate: today,
  };
}

/** Valida as condições conforme o tipo do cliente e converte para ContractConditions. */
export function parseContractForm(
  kind: Client["kind"],
  v: ContractFormValues,
): { ok: true; data: ContractConditions } | { ok: false; error: string; field: keyof ContractFormValues } {
  const bad = (field: keyof ContractFormValues, error: string) => ({ ok: false as const, error, field });
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(v.startDate)) return bad("startDate", "Informe a data de início.");
  if (v.forum.length > 200 || v.notes.length > 5000 || v.adjustment.length > 2000 || v.serviceDescription.length > 500) {
    return bad("notes", "Algum texto está longo demais.");
  }
  const base = { startDate: v.startDate, forum: v.forum.trim(), notes: v.notes, adjustment: v.adjustment };

  if (kind === "FIXO") {
    const fee = parseMoneyToCents(v.monthlyFee);
    const day = Number(v.dueDay);
    const term = Number(v.termMonths);
    if (!fee || fee <= 0) return bad("monthlyFee", "Informe os honorários mensais.");
    if (!Number.isInteger(day) || day < 1 || day > 31) return bad("dueDay", "Dia do vencimento entre 1 e 31.");
    if (!Number.isInteger(term) || term < 0 || term > 600) return bad("termMonths", "Vigência em meses (0 = prazo indeterminado).");
    if (v.services.length === 0) return bad("services", "Selecione ao menos um serviço.");
    return {
      ok: true,
      data: {
        ...base, termMonths: term, services: v.services, monthlyFeeCents: fee, dueDay: day,
        serviceDescription: "", totalCents: 0, installments: 1, firstDueDate: "",
      },
    };
  }

  const total = parseMoneyToCents(v.serviceTotal);
  const n = Number(v.installments);
  if (!v.serviceDescription.trim()) return bad("serviceDescription", "Descreva o serviço contratado.");
  if (!total || total <= 0) return bad("serviceTotal", "Informe o valor do serviço.");
  if (!Number.isInteger(n) || n < 1 || n > 5) return bad("installments", "Escolha de 1 a 5 parcelas.");
  if (total < n) return bad("serviceTotal", "Valor muito baixo para o número de parcelas.");
  if (!iso.test(v.firstDueDate)) return bad("firstDueDate", "Informe a data de vencimento.");
  return {
    ok: true,
    data: {
      ...base, termMonths: 0, services: v.services, monthlyFeeCents: 0, dueDay: 0,
      serviceDescription: v.serviceDescription, totalCents: total, installments: n, firstDueDate: v.firstDueDate,
    },
  };
}
