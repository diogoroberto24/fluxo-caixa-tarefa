import { formatDocument } from "@/lib/format";
import { normalize } from "@/lib/utils";
import { onlyDigits } from "@/lib/validators";
import type { Client, ServiceModule, TaxRegime } from "@/types/domain";

/**
 * Busca por razão social, nome fantasia, CNPJ/CPF e inscrição estadual.
 * Aceita documentos com ou sem pontuação.
 */
export function searchClients(clients: Client[], query: string): Client[] {
  const q = normalize(query);
  if (!q) return clients;
  const qDigits = onlyDigits(query);
  return clients.filter((c) => {
    if (normalize(c.legalName).includes(q)) return true;
    if (normalize(c.tradeName).includes(q)) return true;
    if (normalize(formatDocument(c.document)).includes(q)) return true;
    if (normalize(c.stateRegistration ?? "").includes(q)) return true;
    if (qDigits) {
      if (c.document.includes(qDigits)) return true;
      if (onlyDigits(c.stateRegistration ?? "").includes(qDigits)) return true;
    }
    return false;
  });
}

export const MODULE_LABEL: Record<ServiceModule, string> = {
  CONTABIL: "Contábil",
  FISCAL: "Fiscal",
  FOLHA: "Folha de Pagamento",
  SOCIETARIO: "Societário",
};

export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  MEI: "MEI",
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  PESSOA_FISICA: "Pessoa Física/Autônomo",
};
