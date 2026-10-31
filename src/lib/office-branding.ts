/** Logo impressa no topo dos contratos, por CNPJ do escritório (arquivos em public/logos). Sem entrada, o contrato sai sem logo. */
const LOGOS: Record<string, string> = {
  "47308673000177": "/logos/anderson-cardozo.png", // Anderson Cardozo Assessoria Contábil
};

export function officeLogo(document: string): string | null {
  return LOGOS[document.replace(/\D/g, "")] ?? null;
}
