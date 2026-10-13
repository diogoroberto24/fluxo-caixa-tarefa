"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { TaskForm } from "@/components/forms/task-form";
import { useAppStore } from "@/components/providers/app-store";
import { TaskBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/fields";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { isTaskOpen } from "@/services/tasks";

const RECURRENCE: Record<string, string> = {
  NONE: "Não se repete",
  MENSAL: "Mensal",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

export function TaskDetailDialog({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const { tasks, clients, users, setTaskStatus, notify, currentUser } = useAppStore();
  const [mode, setMode] = useState<"view" | "edit" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [stopSeries, setStopSeries] = useState(false);

  const task = tasks.find((t) => t.id === taskId);
  const client = clients.find((c) => c.id === task?.clientId);
  const assignee = users.find((u) => u.id === task?.assigneeId);
  const history = task
    ? tasks.filter((t) => t.definitionId === task.definitionId).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    : [];

  const isOperator = currentUser.role === "OPERADOR";
  const canUpdate =
    can(currentUser.role, "task:update") && (!isOperator || task?.assigneeId === currentUser.id);
  const canEdit = can(currentUser.role, "task:write");
  const canCancel = canEdit;

  function close() {
    setMode("view");
    setReason("");
    setStopSeries(false);
    onClose();
  }

  async function change(status: "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA", success: (next: boolean) => string) {
    if (!task || busy) return;
    setBusy(true);
    const r = await setTaskStatus(task.id, status, { notes: reason, stopSeries });
    setBusy(false);
    if (!r.ok) return notify(r.error, "error");
    notify(r.data.unchanged ? "Esta tarefa já estava nesse status. Nada foi alterado." : success(r.data.nextCreated));
    if (status === "CANCELADA") close();
    else setMode("view");
  }

  return (
    <Dialog
      open={!!task}
      onOpenChange={(o) => !o && !busy && close()}
      size="lg"
      title={task ? (mode === "edit" ? `Editar — ${task.title}` : task.title) : "Tarefa"}
      description={client?.tradeName}
    >
      {task && mode === "edit" && <TaskForm task={task} onDone={() => setMode("view")} />}
      {task && mode !== "edit" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <TaskBadge status={task.status} />
            <span className="text-xs text-slate-500">{task.category}</span>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Cliente</dt><dd className="font-medium">{client?.tradeName ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Responsável</dt><dd className="font-medium">{assignee?.name ?? "Sem responsável"}</dd></div>
            <div><dt className="text-xs text-slate-500">Criada em</dt><dd>{formatDate(task.createdAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Prazo</dt><dd className="font-medium">{formatDate(task.dueDate)}</dd></div>
            <div><dt className="text-xs text-slate-500">Última realização</dt><dd>{formatDate(task.lastDoneAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Conclusão desta execução</dt><dd>{formatDate(task.completedAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Recorrência</dt><dd>{RECURRENCE[task.recurrence]}</dd></div>
            {task.description && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Descrição</dt><dd>{task.description}</dd></div>}
            {task.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Observações</dt><dd>{task.notes}</dd></div>}
            {task.completionNotes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Observação da execução</dt><dd>{task.completionNotes}</dd></div>}
          </dl>

          {isTaskOpen(task.status) && (canUpdate || canEdit) && mode === "view" && (
            <div className="space-y-3 border-t border-line pt-4">
              {canUpdate && (
                <Field label="Observação da execução (opcional)">
                  <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                </Field>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canEdit && (
                  <Button variant="outline" size="sm" className="mr-auto" onClick={() => setMode("edit")} disabled={busy}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                )}
                {canCancel && (
                  <Button variant="ghost" size="sm" onClick={() => setMode("cancel")} disabled={busy}>Cancelar tarefa</Button>
                )}
                {canUpdate && task.status === "PENDENTE" && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => change("EM_ANDAMENTO", () => "Tarefa iniciada.")}>
                    Iniciar
                  </Button>
                )}
                {canUpdate && (
                  <Button
                    variant="success"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      change("CONCLUIDA", (next) =>
                        next ? "Tarefa concluída. A próxima ocorrência foi criada." : "Tarefa concluída. A última realização foi atualizada.",
                      )
                    }
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Concluir
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === "cancel" && (
            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-sm text-danger">Cancelar esta tarefa? O registro é mantido no histórico.</p>
              <Field label="Motivo (opcional)">
                <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {task.recurrence !== "NONE" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={stopSeries} onChange={(e) => setStopSeries(e.target.checked)} />
                  Encerrar a recorrência (não criar a próxima ocorrência)
                </label>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setMode("view")} disabled={busy}>Voltar</Button>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => change("CANCELADA", () => "Tarefa cancelada.")}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar cancelamento
                </Button>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">Histórico de execuções</h3>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {history.map((h) => (
                <li key={h.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2", h.id === task.id && "bg-primary-soft/50")}>
                  <span>
                    Prazo <strong>{formatDate(h.dueDate)}</strong>
                    {h.completedAt && <span className="text-xs text-slate-500"> · concluída em {formatDate(h.completedAt)}</span>}
                  </span>
                  <TaskBadge status={h.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}
