import { describe, expect, it } from "vitest";
import type { Payable, Receivable } from "@/types/domain";
import { cashFlowByMonth } from "./finance";

const rec = (r: Partial<Receivable>): Receivable => ({
  id: "r", clientId: "c", description: "", category: "HONORARIOS", competence: "2026-10", amountCents: 0,
  dueDate: "2026-10-10", canceled: false, history: [], isDemo: false, ...r,
}) as Receivable;

const pay = (p: Partial<Payable>): Payable => ({
  id: "p", description: "", category: "", categoryId: "", supplier: "", amountCents: 0, issueDate: "2026-10-01",
  dueDate: "2026-10-10", recurrence: "NONE", canceled: false, history: [], isDemo: false, ...p,
}) as Payable;

describe("cashFlowByMonth", () => {
  it("devolve os meses em ordem, inclusive os vazios", () => {
    const rows = cashFlowByMonth([], [], "2026-02", 4);
    expect(rows.map((r) => r.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(rows.every((r) => r.receivedCents === 0 && r.paidCents === 0)).toBe(true);
  });

  it("soma pelo mês do pagamento e usa o valor pago quando existe", () => {
    const rows = cashFlowByMonth(
      [
        rec({ amountCents: 10000, dueDate: "2026-09-30", paidAt: "2026-10-02" }),
        rec({ amountCents: 5000, paidAt: "2026-10-15", paidAmountCents: 5200 }),
        rec({ amountCents: 9999 }), // em aberto
        rec({ amountCents: 7000, paidAt: "2026-10-03", canceled: true }),
      ],
      [pay({ amountCents: 3000, paidAt: "2026-09-20" }), pay({ amountCents: 1500, paidAt: "2026-10-05" })],
      "2026-10",
      2,
    );
    expect(rows).toEqual([
      { month: "2026-09", receivedCents: 0, paidCents: 3000 },
      { month: "2026-10", receivedCents: 15200, paidCents: 1500 },
    ]);
  });

  it("ignora pagamentos fora da janela", () => {
    const rows = cashFlowByMonth([rec({ amountCents: 100, paidAt: "2025-01-10" })], [], "2026-10", 6);
    expect(rows.reduce((s, r) => s + r.receivedCents, 0)).toBe(0);
  });
});
