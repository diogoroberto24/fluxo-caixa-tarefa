import { ContractsView } from "@/components/contracts/contracts-view";
import { AccessRestricted } from "@/components/layout/coming-soon";
import { getCurrentUser } from "@/lib/auth/session";
import { listContracts, listTemplates } from "@/lib/data/contracts";
import { getOffice } from "@/lib/data/office";
import { can } from "@/lib/permissions";

export const metadata = { title: "Contratos | Anderson Cardozo" };

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "contract:manage")) return <AccessRestricted title="Contratos" />;
  const [contracts, templates, office] = await Promise.all([listContracts(), listTemplates(), getOffice()]);
  return <ContractsView contracts={contracts} templates={templates} office={office} />;
}
