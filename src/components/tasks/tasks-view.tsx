"use client";

import { ClipboardList, ListPlus, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskForm } from "@/components/forms/task-form";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, TaskBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import { monthOf } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn, normalize } from "@/lib/utils";
import { isTaskOpen, sortTasks, TASK_CATEGORIES, taskUrgency } from "@/services/tasks";
import type { TaskStatus } from "@/types/domain";
import { StatCard } from "@/components/finance/shared";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskTypesDialog } from "./task-types-dialog";

const COLS = "md:grid-cols-[1.2fr_1.5fr_1fr_0.8fr_1.2fr_0.9fr_0.9fr]";

export function TasksView({ initialMonth = "" }: { initialMonth?: string }) {
  const { tasks, clients, users, today, currentUser } = useAppStore();
  const canWrite = can(currentUser.role, "task:write");

  const [status, setStatus] = useState<"" | "ABERTAS" | TaskStatus>("ABERTAS");
  const [clientId, setClientId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [category, setCategory] = useState("");
  const [month, setMonth] = useState(initialMonth);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.tradeName])), [clients]);
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const rows = useMemo(() => {
    const q = normalize(query);
    const list = tasks.filter((t) => {
      if (status === "ABERTAS" ? !isTaskOpen(t.status) : status && t.status !== status) return false;
      if (clientId && t.clientId !== clientId) return false;
      if (assigneeId && (assigneeId === "NONE" ? t.assigneeId : t.assigneeId !== assigneeId)) return false;
      if (category && t.category !== category) return false;
      if (month && monthOf(t.dueDate) !== month) return false;
      if (dueFrom && t.dueDate < dueFrom) return false;
      if (dueTo && t.dueDate > dueTo) return false;
      if (q && !normalize(`${t.title} ${t.description ?? ""} ${clientName.get(t.clientId) ?? ""}`).includes(q)) return false;
      return true;
    });
    return sortTasks(list, today);
  }, [tasks, status, clientId, assigneeId, category, month, dueFrom, dueTo, query, today, clientName]);

  const kpi = useMemo(() => {
    let overdue = 0, todayN = 0, open = 0, done = 0;
    for (const t of tasks) {
      if (isTaskOpen(t.status)) {
        open++;
        const u = taskUrgency(t, today);
        if (u === "ATRASADA") overdue++;
        if (u === "HOJE") todayN++;
      } else if (t.status === "CONCLUIDA" && t.completedAt?.slice(0, 7) === today.slice(0, 7)) done++;
    }
    return { overdue, todayN, open, done };
  }, [tasks, today]);

  const categories = useMemo(
    () => [...new Set([...TASK_CATEGORIES, ...tasks.map((t) => t.category)])],
    [tasks],
  );

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Tarefas</h1>
          <p className="text-sm text-slate-500">Obrigações e rotinas por cliente, com histórico de execuções.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCatalogOpen(true)}>
              <ListPlus className="h-4 w-4" /> Cadastro de tarefas
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Em aberto" value={String(kpi.open)} />
        <StatCard label="Atrasadas" tone="danger" value={String(kpi.overdue)} />
        <StatCard label="Vencem hoje" tone="warning" value={String(kpi.todayN)} />
        <StatCard label="Concluídas no mês" tone="success" value={String(kpi.done)} />
      </div>

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Situação">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="ABERTAS">Em aberto</option>
              <option value="">Todas</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="CONCLUIDA">Concluídas</option>
              <option value="CANCELADA">Canceladas</option>
            </Select>
          </Field>
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Todos</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Todos</option>
              <option value="NONE">Sem responsável</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Mês do prazo">
            <div className="flex gap-1">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              {month && (
                <Button variant="outline" size="icon" aria-label="Todos os meses" title="Todos os meses" onClick={() => setMonth("")}>
                  ×
                </Button>
              )}
            </div>
          </Field>
          <Field label="Prazo de"><Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></Field>
          <Field label="Prazo até"><Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></Field>
          <Field label="Pesquisar" className="sm:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Tarefa, descrição ou cliente" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma tarefa encontrada"
            description={tasks.length === 0 ? "Crie a primeira tarefa para um cliente." : "Ajuste os filtros para ver outras tarefas."}
            action={canWrite && tasks.length === 0 ? <Button size="sm" onClick={() => setNewOpen(true)}>Nova tarefa</Button> : undefined}
          />
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}>
              <span>Cliente</span><span>Tarefa</span><span>Responsável</span><span>Prazo</span><span>Status</span><span>Última realização</span><span>Conclusão</span>
            </div>
            <ul>
              {rows.map((t) => {
                const u = taskUrgency(t, today);
                return (
                  <li key={t.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      aria-label={`Abrir tarefa ${t.title}`}
                      className={cn("relative grid w-full gap-x-3 gap-y-1 py-3 pl-4 pr-3 text-left text-[13px] hover:bg-surface md:items-center", COLS)}
                    >
                      <span aria-hidden className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded", u === "ATRASADA" ? "bg-danger" : u === "HOJE" || u === "PROXIMA" ? "bg-warning" : t.status === "CONCLUIDA" ? "bg-success" : "bg-slate-300")} />
                      <span className="font-medium text-navy">{clientName.get(t.clientId) ?? "—"}</span>
                      <span className="text-slate-700">{t.title}<span className="block text-[11px] text-slate-500">{t.category}</span></span>
                      <span className="text-xs text-slate-600">{t.assigneeId ? userName.get(t.assigneeId) ?? "—" : "Sem responsável"}</span>
                      <span className={cn(u === "ATRASADA" && "font-semibold text-danger")}>{formatDate(t.dueDate)}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <TaskBadge status={t.status} />
                        {u === "ATRASADA" && <Badge tone="danger">Atrasada</Badge>}
                        {u === "PROXIMA" && <Badge tone="warning">Prazo próximo</Badge>}
                      </span>
                      <span className="text-xs text-slate-600">{formatDate(t.lastDoneAt)}</span>
                      <span className="text-xs text-slate-600">{formatDate(t.completedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="pt-3 text-xs text-slate-500">{rows.length} tarefa(s)</p>
          </div>
        )}
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="Nova tarefa" description="Marque uma ou mais tarefas do cadastro. Tarefas recorrentes criam a próxima ocorrência ao serem concluídas.">
        {newOpen && <TaskForm defaultClientId={clientId || null} onDone={() => setNewOpen(false)} />}
      </Dialog>
      <TaskDetailDialog taskId={openId} onClose={() => setOpenId(null)} />
      <TaskTypesDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </div>
  );
}
