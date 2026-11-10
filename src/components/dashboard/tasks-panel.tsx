"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ListChecks } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, TaskBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { addMonths, monthOf } from "@/lib/dates";
import { formatDate, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  filterTasks,
  isTaskOpen,
  NEAR_DEADLINE_DAYS,
  sortTasks,
  taskInMonth,
  taskUrgency,
  type TaskFilter,
} from "@/services/tasks";
import type { Task } from "@/types/domain";
import { ClientFilter } from "./client-filter";

const TABS: { value: TaskFilter; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "PENDENTE", label: "Pendentes" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "CONCLUIDA", label: "Concluídas" },
];

const COLS = "md:grid-cols-[1.4fr_1.5fr_0.9fr_1.4fr_1fr_24px]";

/**
 * Tarefas do mês selecionado (padrão: mês atual). Tarefas em aberto de meses anteriores
 * (atrasadas) aparecem numa seção destacada para não ficarem escondidas. Outros meses: Gerenciador de Tarefas.
 */
export function TasksPanel({
  clientId,
  onSelectClient,
  onOpenTask,
}: {
  clientId: string | null;
  onSelectClient: (id: string | null) => void;
  onOpenTask: (id: string) => void;
}) {
  const { tasks, clients, today } = useAppStore();
  const currentMonth = monthOf(today);
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<TaskFilter>("TODAS");
  const [showRest, setShowRest] = useState(false);
  const client = clients.find((c) => c.id === clientId);

  const { rows, hiddenCount, overdue } = useMemo(() => {
    const inMonth = tasks.filter((t) => taskInMonth(t, month));
    const filtered = sortTasks(filterTasks(inMonth, { filter, clientId }), today);
    // Visão padrão: o que está em aberto no mês (atrasadas, do dia e demais pendências).
    let list = filtered;
    let hidden = 0;
    if (filter === "TODAS" && !showRest) {
      list = filtered.filter((t) => isTaskOpen(t.status));
      hidden = filtered.length - list.length;
    }
    // Abertas de meses anteriores: só ao ver o mês atual (e quando a aba não é "Concluídas").
    const late =
      month === currentMonth && filter !== "CONCLUIDA"
        ? sortTasks(
            filterTasks(
              tasks.filter((t) => isTaskOpen(t.status) && t.dueDate < `${month}-01`),
              { filter, clientId },
            ),
            today,
          )
        : [];
    return { rows: list, hiddenCount: hidden, overdue: late };
  }, [tasks, month, currentMonth, filter, clientId, today, showRest]);

  // Contadores do topo: atrasadas/hoje/próximas consideram todas as tarefas em aberto; concluídas, o mês exibido.
  const stats = useMemo(() => {
    const mine = clientId ? tasks.filter((t) => t.clientId === clientId) : tasks;
    const count = (u: ReturnType<typeof taskUrgency>) => mine.filter((t) => taskUrgency(t, today) === u).length;
    return {
      late: count("ATRASADA"),
      today: count("HOJE"),
      soon: count("PROXIMA"),
      done: mine.filter((t) => t.status === "CONCLUIDA" && taskInMonth(t, month)).length,
    };
  }, [tasks, clientId, today, month]);

  const showClientCol = !clientId;

  function row(t: Task) {
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
  }

  const header = (
    <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}>
      <span>{showClientCol ? "Cliente / Empresa" : "Categoria"}</span><span>Tarefa</span><span>Prazo</span><span>Status</span><span>Última realização</span><span />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[17px]">
          <ClipboardCheck className="h-5 w-5 text-navy" strokeWidth={1.8} />
          {client ? `Tarefas — ${client.tradeName}` : "Tarefas"}
        </CardTitle>
        <div className="flex items-center gap-1" role="group" aria-label="Mês das tarefas">
          <Button variant="outline" size="icon" aria-label="Mês anterior" className="h-8 w-8" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[116px] text-center text-sm font-medium text-navy">{monthLabel(month)}</span>
          <Button variant="outline" size="icon" aria-label="Próximo mês" className="h-8 w-8" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {month !== currentMonth && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth)}>
              Mês atual
            </Button>
          )}
        </div>
      </CardHeader>

      <div className="grid grid-cols-2 gap-3 px-5 pt-4 md:grid-cols-4">
        <Stat label="Atrasadas" value={stats.late} tone="danger" />
        <Stat label="Vencem hoje" value={stats.today} tone="warning" />
        <Stat label={`Próximos ${NEAR_DEADLINE_DAYS} dias`} value={stats.soon} tone="primary" />
        <Stat label={`Concluídas em ${monthLabel(month).split(" ")[0]}`} value={stats.done} tone="success" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtro de tarefas">
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
        <ClientFilter selectedId={clientId} onSelect={onSelectClient} />
      </div>

      <div className="px-5 pb-4 pt-3">
        {overdue.length > 0 && (
          <section aria-label="Atrasadas de meses anteriores" className="mb-4 overflow-hidden rounded-lg border border-danger-line bg-danger-soft/40">
            <h3 className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
              Atrasadas de meses anteriores ({overdue.length})
            </h3>
            <ul className="bg-white px-1">{overdue.map(row)}</ul>
          </section>
        )}

        {rows.length === 0 ? (
          overdue.length === 0 && (
            <EmptyState
              icon={filter === "CONCLUIDA" ? ListChecks : CheckCircle2}
              title={filter === "CONCLUIDA" ? `Nenhuma tarefa concluída em ${monthLabel(month)}` : `Nenhuma tarefa pendente em ${monthLabel(month)}`}
              description={client ? "Este cliente não possui tarefas neste mês e filtro." : "Para ver outros prazos, use o Gerenciador de Tarefas."}
            />
          )
        ) : (
          <>
            {overdue.length > 0 && (
              <h3 className="mb-1 text-xs font-semibold text-navy">Do mês de {monthLabel(month)}</h3>
            )}
            {header}
            <ul>{rows.map(row)}</ul>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          {filter === "TODAS" && (hiddenCount > 0 || showRest) ? (
            <button type="button" onClick={() => setShowRest((s) => !s)} className="font-semibold text-primary hover:underline">
              {showRest ? "Ocultar concluídas e canceladas" : `Ver as ${hiddenCount} concluídas/canceladas`}
            </button>
          ) : (
            <span />
          )}
          <Link href={`/tarefas?mes=${month}`} className="font-semibold text-primary hover:underline">
            Ver no Gerenciador de Tarefas →
          </Link>
        </div>
      </div>
    </Card>
  );
}

const STAT_TONE = {
  danger: { box: "border-danger-line bg-danger-soft", value: "text-danger", dot: "bg-danger" },
  warning: { box: "border-warning-line bg-warning-soft", value: "text-warning", dot: "bg-warning" },
  primary: { box: "border-line bg-white", value: "text-navy", dot: "bg-primary" },
  success: { box: "border-line bg-white", value: "text-navy", dot: "bg-success" },
};

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONE }) {
  // Atrasadas/hoje só ganham cor de alerta quando há algo a fazer.
  const t = (tone === "danger" || tone === "warning") && value === 0 ? STAT_TONE.primary : STAT_TONE[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", t.box)}>
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className={cn("h-2 w-2 rounded-full", STAT_TONE[tone].dot)} aria-hidden />
        {label}
      </div>
      <div className={cn("mt-0.5 text-[22px] font-bold leading-tight tabular-nums", t.value)}>{value}</div>
    </div>
  );
}
