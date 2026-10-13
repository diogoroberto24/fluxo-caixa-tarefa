/**
 * Converte texto em reais ("1.234,56", "R$ 950", "950,5") para centavos inteiros,
 * sem passar por ponto flutuante. Retorna null quando inválido.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [int, frac = ""] = cleaned.split(".");
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

export function centsToInput(cents: number): string {
  const int = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${int.toLocaleString("pt-BR")},${frac}`;
}
