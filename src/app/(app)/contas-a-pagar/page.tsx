import { PayablesView } from "@/components/finance/payables-view";
import { AccessRestricted } from "@/components/layout/coming-soon";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Contas a Pagar | Anderson Cardozo" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "payable:read")) {
    return <AccessRestricted title="Contas a Pagar" />;
  }
  return <PayablesView />;
}
