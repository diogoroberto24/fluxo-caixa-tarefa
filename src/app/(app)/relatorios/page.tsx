import { AccessRestricted } from "@/components/layout/coming-soon";
import { ReportsView } from "@/components/reports/reports-view";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Relatórios | Anderson Cardozo" };

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "report:view")) return <AccessRestricted title="Relatórios" />;
  return <ReportsView />;
}
