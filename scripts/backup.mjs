// Backup lógico: exporta todas as tabelas de negócio para JSON em backups/<data-hora>/.
// Uso: npm run backup            (roda na sua máquina, com a chave secreta; nunca na Vercel)
// O backup contém dados dos clientes: guarde fora do repositório (a pasta backups/ já é ignorada pelo git),
// de preferência em local criptografado. NÃO inclui contas de login (Auth): essas ficam no Supabase.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient, fail } from "./_admin.mjs";

/** Ordem respeita as chaves estrangeiras (pais antes dos filhos). */
export const TABLES = [
  "profiles",
  "financial_categories",
  "offices",
  "clients",
  "client_fee_history",
  "recurrence_rules",
  "receivables",
  "payables",
  "payments",
  "task_types",
  "task_definitions",
  "task_executions",
  "office_settings",
  "contract_templates",
  "contract_counters",
  "contracts",
  "audit_log",
];

const PAGE = 1000;
const supabase = adminClient();

const stamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
}).format(new Date()).replace(" ", "_").replace(/:/g, "-");
const dir = join("backups", stamp);
mkdirSync(dir, { recursive: true });

const manifest = { createdAt: new Date().toISOString(), tables: {} };
for (const table of TABLES) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").order(table === "contract_counters" ? "year" : "id").range(from, from + PAGE - 1);
    if (error) fail(`exportar ${table}`, error);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const json = JSON.stringify(rows);
  writeFileSync(join(dir, `${table}.json`), json);
  manifest.tables[table] = { rows: rows.length, sha256: createHash("sha256").update(json).digest("hex") };
  console.log(`${table.padEnd(22)} ${rows.length} linhas`);
}
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nBackup concluído em ${dir}`);
