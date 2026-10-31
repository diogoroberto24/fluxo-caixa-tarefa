import { notFound } from "next/navigation";
import { ContractDocument } from "@/components/contracts/contract-document";
import { AccessRestricted } from "@/components/layout/coming-soon";
import { getCurrentUser } from "@/lib/auth/session";
import { getClientById } from "@/lib/data/clients";
import { getContract } from "@/lib/data/contracts";
import { getOffice } from "@/lib/data/office";
import { officeLogo } from "@/lib/office-branding";
import { can } from "@/lib/permissions";

export const metadata = { title: "Contrato | Anderson Cardozo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user.role, "contract:manage")) return <AccessRestricted title="Contratos" />;
  if (!UUID.test(id)) notFound();
  const contract = await getContract(id);
  if (!contract) notFound();
  const [client, office] = await Promise.all([getClientById(contract.clientId), getOffice()]);
  return <ContractDocument contract={contract} clientName={client?.tradeName ?? "Cliente removido"} logoSrc={officeLogo(office.document)} />;
}
