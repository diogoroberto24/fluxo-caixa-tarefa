import type { Client, Payable, Receivable, Task } from "@/types/domain";

/** Dados de exemplo para os testes do assistente. Hoje = 2026-10-28. */
export const TODAY = "2026-10-28";

const address = { zip: "", street: "", number: "", district: "", city: "", state: "" };

function client(id: string, tradeName: string, extra: Partial<Client> = {}): Client {
  return {
    id,
    legalName: `${tradeName} LTDA`,
    tradeName,
    document: "12345678000199",
    address,
    phone: "41999998888",
    email: "contato@exemplo.com",
    taxRegime: "SIMPLES_NACIONAL",
    contractStart: "2025-01-01",
    modules: ["CONTABIL"],
    kind: "FIXO",
    monthlyFeeCents: 50000,
    feeDueDay: 10,
    active: true,
    isDemo: true,
    ...extra,
  };
}

export const clients: Client[] = [
  client("c-padaria", "Padaria Pão Quente"),
  client("c-oficina", "Oficina do Zé", { monthlyFeeCents: 80000 }),
  client("c-joao", "João Silva", { kind: "EVENTUAL", taxRegime: "PESSOA_FISICA", monthlyFeeCents: 0 }),
  client("c-antiga", "Loja Antiga", { active: false }),
];

function receivable(id: string, clientId: string, dueDate: string, amountCents: number, extra: Partial<Receivable> = {}): Receivable {
  return {
    id,
    clientId,
    description: "Honorários",
    category: "HONORARIOS",
    competence: dueDate.slice(0, 7),
    amountCents,
    dueDate,
    canceled: false,
    history: [],
    isDemo: true,
    ...extra,
  };
}

export const receivables: Receivable[] = [
  // padaria: setembro vencido, outubro pago
  receivable("r1", "c-padaria", "2026-09-10", 50000),
  receivable("r2", "c-padaria", "2026-10-10", 50000, { paidAt: "2026-10-09", paidAmountCents: 50000 }),
  // oficina: agosto e setembro vencidos, outubro vencido também
  receivable("r3", "c-oficina", "2026-08-10", 80000),
  receivable("r4", "c-oficina", "2026-09-10", 80000),
  receivable("r5", "c-oficina", "2026-10-10", 80000),
  // joão: parcela a vencer em outubro
  receivable("r6", "c-joao", "2026-10-30", 30000, { category: "OUTROS", description: "Declaração IR", installmentNumber: 1, installmentTotal: 2 }),
  // cancelada não conta
  receivable("r7", "c-padaria", "2026-10-15", 99900, { canceled: true }),
];

function payable(id: string, description: string, dueDate: string, amountCents: number, extra: Partial<Payable> = {}): Payable {
  return {
    id,
    description,
    category: "Despesas fixas",
    categoryId: "cat-1",
    supplier: "",
    amountCents,
    issueDate: "2026-10-01",
    dueDate,
    recurrence: "MENSAL",
    canceled: false,
    history: [],
    isDemo: true,
    ...extra,
  };
}

export const payables: Payable[] = [
  payable("p1", "Aluguel", "2026-10-25", 200000),
  payable("p2", "Internet", "2026-11-02", 15000, { supplier: "Provedor X" }),
  payable("p3", "Contador associado", "2026-11-20", 100000),
  payable("p4", "Energia", "2026-10-05", 30000, { paidAt: "2026-10-04" }),
];

function task(id: string, clientId: string, title: string, dueDate: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    definitionId: id,
    clientId,
    title,
    category: "Apuração de impostos",
    createdAt: "2026-10-01",
    dueDate,
    status: "PENDENTE",
    recurrence: "MENSAL",
    isDemo: true,
    ...extra,
  };
}

export const tasks: Task[] = [
  task("t1", "c-padaria", "DAS do Simples", "2026-10-20"),
  task("t2", "c-oficina", "Folha de outubro", "2026-10-28", { category: "Fechamento de folha" }),
  task("t3", "c-oficina", "DCTFWeb", "2026-11-03", { status: "EM_ANDAMENTO" }),
  task("t4", "c-padaria", "SPED", "2026-12-15"),
  task("t5", "c-padaria", "Guia antiga", "2026-09-01", { status: "CONCLUIDA", completedAt: "2026-09-01" }),
];
