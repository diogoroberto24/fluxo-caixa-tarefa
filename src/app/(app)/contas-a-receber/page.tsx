import { ReceivablesView } from "@/components/finance/receivables-view";
import { AccessRestricted } from "@/components/layout/coming-soon";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Contas a Receber | Anderson Cardozo" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "receivable:read")) {
    return <AccessRestricted title="Contas a Receber" />;
  }
  return <ReceivablesView />;
}
