import { addMonths, dateInMonth, monthOf } from "@/lib/dates";

export interface InstallmentPreview {
  number: number;
  amountCents: number;
  dueDate: string;
}

/**
 * Prévia das parcelas (a função SQL `make_installments` é quem grava, com a mesma regra):
 *  - vencimentos mensais no dia do 1º vencimento (mês curto usa o último dia; o dia original volta depois)
 *  - centavos que não dividem igualmente ficam na 1ª parcela (a soma é sempre o total)
 */
export function planInstallments(totalCents: number, n: number, firstDue: string): InstallmentPreview[] {
  if (!Number.isInteger(n) || n < 1 || n > 5 || totalCents < n || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return [];
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  const day = Number(firstDue.slice(8));
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    amountCents: base + (i === 0 ? rest : 0),
    dueDate: dateInMonth(addMonths(monthOf(firstDue), i), day),
  }));
}
