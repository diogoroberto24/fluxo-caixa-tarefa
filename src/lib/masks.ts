/**
 * Máscaras de digitação (aplicadas enquanto o usuário digita) e de exibição.
 * No banco os valores ficam só com dígitos; a máscara é apenas visual.
 */

const digits = (v: string) => v.replace(/\D/g, "");

/** CPF (até 11 dígitos) ou CNPJ (12 a 14), conforme a quantidade digitada. */
export function maskDocument(value: string): string {
  const d = digits(value).slice(0, 14);
  if (d.length <= 11) {
    let out = d.slice(0, 3);
    if (d.length > 3) out += "." + d.slice(3, 6);
    if (d.length > 6) out += "." + d.slice(6, 9);
    if (d.length > 9) out += "-" + d.slice(9, 11);
    return out;
  }
  let out = d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12);
  if (d.length > 12) out += "-" + d.slice(12, 14);
  return out;
}

/** Telefone fixo `(41) 3333-4444` ou celular `(41) 99999-4444`. */
export function maskPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const area = d.slice(0, 2);
  const rest = d.slice(2);
  const cut = d.length === 11 ? 5 : 4;
  return `(${area}) ${rest.length > cut ? `${rest.slice(0, cut)}-${rest.slice(cut)}` : rest}`;
}

/** CEP `00000-000`. */
export function maskZip(value: string): string {
  const d = digits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
