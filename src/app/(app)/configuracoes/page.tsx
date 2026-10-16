import { AccessRestricted } from "@/components/layout/coming-soon";
import { OfficeForm } from "@/components/settings/office-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getOffice } from "@/lib/data/office";
import { can } from "@/lib/permissions";

export const metadata = { title: "Configurações | Anderson Cardozo" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "settings:manage")) return <AccessRestricted title="Configurações" />;
  const office = await getOffice();
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Configurações</h1>
        <p className="text-sm text-slate-500">Dados do escritório e preferências do sistema.</p>
      </div>
      <OfficeForm initial={office} />
    </div>
  );
}
