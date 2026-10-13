// Gera o financeiro de DEMONSTRAÇÃO (is_demo = true), com datas relativas ao dia atual (fuso de Brasília),
// para que vencido/pendente/pago apareçam de forma coerente. Usado por `npm run seed:demo`.
import { randomUUID } from "node:crypto";

const brToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (iso, n) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const dateInMonth = (ym, day) => { const [y, m] = ym.split("-").map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`; };
const money = (cents) => (cents / 100).toFixed(2);

/** Parâmetros da simulação de cada cliente de demonstração (chave de demo-clients.json). */
const PARAMS = {
  c1: { currentPaid: true, previousFeeCents: 110000 },
  c2: { currentPaid: false },
  c3: { currentPaid: true },
  c4: { currentPaid: false, overdueLastMonth: true },
  c5: { currentPaid: true },
  c6: { currentPaid: false },
  c7: { currentPaid: false },
  c8: { currentPaid: true },
};

/** Despesas: [descrição, categoria, fornecedor, centavos, vencimento(offset|mês-dia), paga?, recorrência] */
function payableSpecs(today) {
  const month = today.slice(0, 7);
  return [
    ["Aluguel do escritório", "Aluguel", "Imobiliária Central", 420000, dateInMonth(month, 5), true, "MENSAL"],
    ["Energia elétrica", "Utilidades", "Copel", 48035, addDays(today, -2), false, "MENSAL"],
    ["Internet e telefonia", "Utilidades", "Vivo Empresas", 38990, addDays(today, 3), false, "MENSAL"],
    ["Imposto do escritório (DAS)", "Impostos", "Receita Federal", 102075, addDays(today, 2), false, "MENSAL"],
    ["Licença do sistema contábil", "Software", "Domínio Sistemas", 125000, addDays(today, 6), false, "MENSAL"],
    ["Folha de pagamento da equipe", "Salários", "Equipe interna", 550000, addDays(today, 10), false, "MENSAL"],
    ["Certificado digital A1", "Software", "Serasa Experian", 35000, addDays(today, 25), false, "ANUAL"],
    ["Anuidade do conselho profissional", "Taxas", "CRC-PR", 105000, addDays(today, 40), false, "ANUAL"],
    ["Material de escritório", "Material", "Papelaria Moderna", 21540, addDays(today, -6), true, "NONE"],
  ];
}

/**
 * @param seeds     conteúdo de demo-clients.json
 * @param categoryIdByName  { "Aluguel": uuid, ... } (categorias de contas a pagar)
 * @param userId    usuário que "criou" os registros
 */
export function buildDemoFinance({ seeds, categoryIdByName, userId }) {
  const today = brToday();
  const month = today.slice(0, 7);
  const receivables = [];
  const payments = [];
  const rules = [];
  const payables = [];

  for (const seed of seeds) {
    const params = PARAMS[seed.key] ?? { currentPaid: false };
    const lastOffset = seed.active ? 0 : -3;
    for (let offset = -3; offset <= lastOffset; offset++) {
      const comp = addMonths(month, offset);
      const dueDate = dateInMonth(comp, seed.feeDueDay);
      // alterações de honorários não reescrevem competências antigas
      const amount = params.previousFeeCents && offset <= -2 ? params.previousFeeCents : seed.monthlyFeeCents;
      const id = randomUUID();
      receivables.push({
        id, client_id: seed.id, description: `Honorários ${comp.slice(5)}/${comp.slice(0, 4)}`,
        category: "HONORARIOS", competence: `${comp}-01`, amount: money(amount), due_date: dueDate,
        is_demo: true, created_by: userId,
      });
      let paidOn = null;
      if (offset < 0) {
        if (!(params.overdueLastMonth && offset === -1)) paidOn = addDays(dueDate, offset === -2 ? 3 : 0);
      } else if (params.currentPaid) {
        paidOn = dueDate < today ? dueDate : today;
      }
      if (paidOn) payments.push({ receivable_id: id, amount: money(amount), paid_on: paidOn, method: "PIX", created_by: userId });
    }
  }

  const byKey = Object.fromEntries(seeds.map((s) => [s.key, s]));
  const extra = (key, description, cents, dueDate) => {
    if (!byKey[key]) return;
    receivables.push({
      id: randomUUID(), client_id: byKey[key].id, description, category: "OUTROS", competence: `${month}-01`,
      amount: money(cents), due_date: dueDate, is_demo: true, created_by: userId,
    });
  };
  extra("c2", "Alteração contratual", 60000, addDays(today, 5));
  extra("c5", "Abertura de filial", 90000, addDays(today, -3));

  // Despesas só existem se houver clientes demo (mantém o "demo" coerente e removível).
  if (seeds.length) {
    for (const [description, category, supplier, cents, dueDate, paid, recurrence] of payableSpecs(today)) {
      let ruleId = null;
      if (recurrence !== "NONE") {
        ruleId = randomUUID();
        rules.push({
          id: ruleId, kind: "PAGAR", frequency: recurrence, start_date: dueDate,
          day_of_month: Number(dueDate.slice(8)), created_by: userId,
        });
      }
      const id = randomUUID();
      payables.push({
        id, description, category_id: categoryIdByName[category], supplier, amount: money(cents),
        issue_date: addDays(dueDate, -20), due_date: dueDate, recurrence_rule_id: ruleId,
        is_demo: true, created_by: userId,
      });
      if (paid) {
        payments.push({
          payable_id: id, amount: money(cents), paid_on: dueDate < today ? dueDate : today,
          method: "Transferência", created_by: userId,
        });
      }
    }
  }
  return { receivables, payments, rules, payables };
}
