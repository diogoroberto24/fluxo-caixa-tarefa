const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Centavos -> "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** "2025-04-28" -> "28/04/2025". */
export function formatDate(iso?: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10" -> "Outubro/2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]}/${y}`;
}

/** "2026-10" -> "10/2026". */
export function competenceLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
}

/** "2026-10-12" -> "Seg, 12 de Outubro de 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}

export function formatDocument(digits: string): string {
  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return digits;
}

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return digits;
}

export function formatAddress(a: {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}) {
  return {
    line1: `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""} - ${a.district}`,
    line2: `${a.city}/${a.state}`,
  };
}
