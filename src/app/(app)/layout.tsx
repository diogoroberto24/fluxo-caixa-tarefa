import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AppStoreProvider } from "@/components/providers/app-store";
import { getCurrentUser, listActiveUsers } from "@/lib/auth/session";
import { listClients } from "@/lib/data/clients";
import { listPayableCategories, listPayables, listReceivables } from "@/lib/data/finance";
import { listTasks, listTaskTypes } from "@/lib/data/tasks";
import { todayInSaoPaulo } from "@/lib/dates";
import { can } from "@/lib/permissions";

// Dados do usuário e do banco: sempre renderizado por requisição.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Sessão inválida ou conta sem perfil ativo: encerra a sessão e volta ao login.
  if (!user) redirect("/auth/acesso-negado");

  const today = todayInSaoPaulo();
  // O RLS já esconde o que o perfil não pode ver; evitamos até a consulta.
  const [clients, users, receivables, payables, categories, tasks, taskTypes] = await Promise.all([
    listClients(),
    listActiveUsers(),
    can(user.role, "receivable:read") ? listReceivables(today) : Promise.resolve([]),
    can(user.role, "payable:read") ? listPayables(today) : Promise.resolve([]),
    can(user.role, "payable:read") ? listPayableCategories() : Promise.resolve([]),
    listTasks(today),
    listTaskTypes(),
  ]);

  return (
    <AppStoreProvider
      today={today}
      currentUser={user}
      users={users}
      categories={categories}
      initialClients={clients}
      initialReceivables={receivables}
      initialPayables={payables}
      initialTasks={tasks}
      initialTaskTypes={taskTypes}
    >
      <AppShell>{children}</AppShell>
    </AppStoreProvider>
  );
}
