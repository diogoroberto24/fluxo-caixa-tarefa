// Tarefas de DEMONSTRAÇÃO (is_demo = true), com prazos relativos a hoje (fuso de Brasília).
import { randomUUID } from "node:crypto";

const brToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10); };
const at = (iso) => `${iso}T15:00:00Z`;

// [clienteKey, título, categoria, prazo(offset), status, recorrência, ultimaRealização(offset)|null]
const SPECS = [
  ["c1", "Fechamento de folha", "Fechamento de folha", -2, "PENDENTE", "MENSAL", -32],
  ["c2", "Entrega de declarações", "Entrega de declarações", 1, "PENDENTE", "MENSAL", -30],
  ["c3", "Conferir lançamentos", "Conferência de lançamentos", 0, "EM_ANDAMENTO", "MENSAL", -31],
  ["c4", "Revisão de impostos", "Revisão fiscal", 5, "PENDENTE", "MENSAL", -28],
  ["c1", "Reunião com cliente", "Outras", 4, "PENDENTE", null, null],
  ["c5", "Emissão de guias (DAS)", "Emissão de guias", 2, "PENDENTE", "MENSAL", -30],
  ["c6", "Apuração de impostos", "Apuração de impostos", 3, "EM_ANDAMENTO", "MENSAL", -29],
  ["c7", "Declaração anual (DASN-SIMEI)", "Obrigações acessórias", 20, "PENDENTE", "ANUAL", null],
  ["c6", "Fechamento de folha", "Fechamento de folha", -5, "PENDENTE", "MENSAL", -35],
  ["c2", "Fechamento de folha", "Fechamento de folha", -4, "CONCLUIDA", null, null],
  ["c3", "Emissão de guias", "Emissão de guias", -1, "CONCLUIDA", null, null],
  ["c4", "Conferir lançamentos", "Conferência de lançamentos", -3, "CONCLUIDA", null, null],
  ["c5", "Revisão fiscal", "Revisão fiscal", -10, "CANCELADA", null, null],
  ["c8", "Encerramento contábil", "Obrigações acessórias", -40, "CONCLUIDA", null, null],
];

export function buildDemoTasks({ seeds, userId }) {
  const today = brToday();
  const byKey = Object.fromEntries(seeds.map((s) => [s.key, s]));
  const rules = [], definitions = [], executions = [];
  for (const [key, title, category, dueOff, status, freq, lastOff] of SPECS) {
    const client = byKey[key];
    if (!client) continue;
    const due = addDays(today, dueOff);
    let ruleId = null;
    if (freq) {
      ruleId = randomUUID();
      rules.push({ id: ruleId, kind: "TAREFA", frequency: freq, start_date: due, day_of_month: Number(due.slice(8)), created_by: userId });
    }
    const defId = randomUUID();
    definitions.push({ id: defId, client_id: client.id, title, category, assignee_id: userId, recurrence_rule_id: ruleId, is_demo: true, created_by: userId });
    const base = { definition_id: defId, due_date: due, status };
    if (status === "EM_ANDAMENTO") base.started_at = at(addDays(today, -1));
    if (status === "CONCLUIDA") { base.completed_at = at(due); base.completed_by = userId; }
    if (status === "CANCELADA") { base.canceled_at = at(due); base.completion_notes = "Cancelada a pedido do cliente."; }
    executions.push(base);
    if (lastOff !== null) {
      const done = addDays(today, lastOff);
      executions.push({ definition_id: defId, due_date: done, status: "CONCLUIDA", completed_at: at(done), completed_by: userId });
    }
  }
  return { rules, definitions, executions };
}
