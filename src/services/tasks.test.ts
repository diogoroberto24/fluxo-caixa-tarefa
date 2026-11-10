import { describe, expect, it } from "vitest";
import type { Task, TaskPriority, TaskStatus } from "@/types/domain";
import { sortTasks, taskInMonth } from "./tasks";

const TODAY = "2026-11-10";

function task(id: string, dueDate: string, priority?: TaskPriority, status: TaskStatus = "PENDENTE"): Task {
  return {
    id,
    definitionId: id,
    clientId: "c",
    title: id,
    category: "Outras",
    createdAt: "2026-11-01",
    dueDate,
    status,
    recurrence: "NONE",
    priority,
    isDemo: false,
  };
}

describe("sortTasks", () => {
  it("atrasadas primeiro (por prioridade), depois as demais por prioridade, concluídas por último", () => {
    const list = [
      task("futura-sem", "2026-11-12"),
      task("concluida", "2026-11-01", 1, "CONCLUIDA"),
      task("atrasada-sem", "2026-11-01"),
      task("futura-p1", "2026-12-20", 1),
      task("atrasada-p2", "2026-11-05", 2),
      task("atrasada-p1", "2026-11-08", 1),
      task("hoje-p3", TODAY, 3),
      task("futura-p1-antes", "2026-12-01", 1),
      task("futura-p5", "2026-11-11", 5),
    ];
    expect(sortTasks(list, TODAY).map((t) => t.id)).toEqual([
      "atrasada-p1",
      "atrasada-p2",
      "atrasada-sem",
      "futura-p1-antes",
      "futura-p1",
      "hoje-p3",
      "futura-p5",
      "futura-sem",
      "concluida",
    ]);
  });
});

describe("taskInMonth", () => {
  const base = task("x", "2026-12-10");
  it("tarefa comum: só no mês do prazo", () => {
    expect(taskInMonth(base, "2026-11")).toBe(false);
    expect(taskInMonth(base, "2026-12")).toBe(true);
  });
  it("Alvará: em todos os meses do lançamento até o prazo", () => {
    const alvara: Task = { ...base, autoKind: "ALVARA", createdAt: "2026-11-10" };
    expect(taskInMonth(alvara, "2026-10")).toBe(false);
    expect(taskInMonth(alvara, "2026-11")).toBe(true);
    expect(taskInMonth(alvara, "2026-12")).toBe(true);
    expect(taskInMonth(alvara, "2027-01")).toBe(false);
    const anual: Task = { ...base, autoKind: "ALVARA", createdAt: "2027-01-01", dueDate: "2027-05-31" };
    expect(["2027-01", "2027-03", "2027-05"].every((m) => taskInMonth(anual, m))).toBe(true);
    expect(taskInMonth(anual, "2027-06")).toBe(false);
  });
});
