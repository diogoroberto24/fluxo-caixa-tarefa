import { TasksView } from "@/components/tasks/tasks-view";

export const metadata = { title: "Tarefas | Anderson Cardozo" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  // "mes" (YYYY-MM) vem do painel de tarefas do Início
  const initialMonth = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : "";
  return <TasksView initialMonth={initialMonth} />;
}
