"use client";

import { CheckCircle2, ChevronRight, ClipboardCheck, ListChecks } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, TaskBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  filterTasks,
  isTaskOpen,
  sortTasks,
  taskUrgency,
  type TaskFilter,
} from "@/services/tasks";

const TABS: { value: TaskFilter; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "PENDENTE", label: "Pendentes" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "CONCLUIDA", label: "Concluídas" },
];

const COLS = "md:grid-cols-[1.4fr_1.5fr_0.9fr_1.4fr_1fr_24px]";

export function TasksPanel({
  clientId,
  onOpenTask,
}: {
  clientId: string | null;
  onOpenTask: (id: string) => void;
}) {
  const { tasks, clients, today } = useAppStore();
  const [filter, setFilter] = useState<TaskFilter>("TODAS");
  const [showRest, setShowRest] = useState(false);
  const client = clients.find((c) => c.id === clientId);

  const { rows, hiddenCount } = useMemo(() => {
    const filtered = sortTasks(filterTasks(tasks, { filter, clientId }), today);
    // Visão padrão: o que está em aberto (atrasadas, do dia e demais pendências).
    if (filter === "TODAS" && !showRest) {
      const open = filtered.filter((t) => isTaskOpen(t.status));
      return { rows: open, hiddenCount: filtered.length - open.length };
    }
    return { rows: filtered, hiddenCount: 0 };
  }, [tasks, filter, clientId, today, showRest]);

  const showClientCol = !clientId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[17px]">
          <ClipboardCheck className="h-5 w-5 text-navy" strokeWidth={1.8} />
          {client ? `Tarefas — ${client.tradeName}` : "Tarefas"}
        </CardTitle>
        <Link href="/tarefas" className="text-xs font-medium text-primary hover:underline">
          Ver todas as tarefas →
        </Link>
      </CardHeader>

      <div className="flex flex-wrap gap-2 px-5 pt-3" role="tablist" aria-label="Filtro de tarefas">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={filter === t.value}
            onClick={() => setFilter(t.value)}
            className={cn(
              "h-8 rounded-full px-4 text-xs transition-colors",
              filter === t.value ? "bg-navy font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 pb-4 pt-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={filter === "CONCLUIDA" ? ListChecks : CheckCircle2}
            title={filter === "CONCLUIDA" ? "Nenhuma tarefa concluída" : "Nenhuma tarefa pendente"}
            description={client ? "Este cliente não possui tarefas neste filtro." : "Tudo em dia por aqui."}
          />
        ) : (
          <>
            <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}>
              <span>{showClientCol ? "Cliente / Empresa" : "Categoria"}</span><span>Tarefa</span><span>Prazo</span><span>Status</span><span>Última realização</span><span />
            </div>
            <ul>
              {rows.map((t) => {
                const urgency = taskUrgency(t, today);
                const c = clients.find((x) => x.id === t.clientId);
                return (
                  <li key={t.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => onOpenTask(t.id)}
                      className={cn(
                        "relative grid w-full gap-x-3 gap-y-1 py-3 pl-4 pr-3 text-left text-[13px] transition-colors hover:bg-surface md:items-center",
                        COLS,
                      )}
                      aria-label={`Abrir tarefa ${t.title}`}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-2.5 left-0 w-[3px] rounded",
                          urgency === "ATRASADA" ? "bg-danger" : urgency === "HOJE" || urgency === "PROXIMA" ? "bg-warning" : t.status === "CONCLUIDA" ? "bg-success" : "bg-slate-300",
                        )}
                      />
                      <span className="font-medium text-navy">{showClientCol ? (c?.tradeName ?? "—") : t.category}</span>
                      <span className="text-slate-700">{t.title}</span>
                      <span className={cn("text-xs md:text-[13px]", urgency === "ATRASADA" && "font-semibold text-danger")}>
                        {formatDate(t.dueDate)}
                        {urgency === "ATRASADA" && <span className="ml-1 text-[11px]">(atrasada)</span>}
                        {urgency === "HOJE" && <span className="ml-1 text-[11px] font-semibold text-warning">(hoje)</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <TaskBadge status={t.status} />
                        {urgency === "ATRASADA" && <Badge tone="danger">Atrasada</Badge>}
                        {urgency === "PROXIMA" && <Badge tone="warning">Prazo próximo</Badge>}
                      </span>
                      <span className="text-xs text-slate-600 md:text-[13px]">
                        <span className="text-slate-400 md:hidden">Última realização: </span>
                        {formatDate(t.lastDoneAt)}
                      </span>
                      <ChevronRight className="hidden h-4 w-4 text-slate-400 md:block" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {filter === "TODAS" && (hiddenCount > 0 || showRest) && (
          <button
            type="button"
            onClick={() => setShowRest((s) => !s)}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            {showRest ? "Ocultar concluídas e canceladas" : `Ver as ${hiddenCount} concluídas/canceladas`}
          </button>
        )}
      </div>
    </Card>
  );
}
