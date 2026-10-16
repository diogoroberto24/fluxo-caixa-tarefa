"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ClipboardList, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { taskSchema, tasksBatchSchema, type TaskFormValues } from "@/lib/schemas";
import { cn, normalize } from "@/lib/utils";
import { isTaskOpen } from "@/services/tasks";
import type { Recurrence, Task } from "@/types/domain";

const RECURRENCE_LABEL = { NONE: "Não se repete", MENSAL: "Mensal", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;

/** Edição de uma tarefa já lançada (prazo, responsável e observação) ou lançamento de uma ou várias tarefas. */
export function TaskForm({
  task,
  defaultClientId,
  onDone,
}: {
  task?: Task;
  defaultClientId?: string | null;
  onDone: () => void;
}) {
  return task ? <EditTaskForm task={task} onDone={onDone} /> : <BatchTaskForm defaultClientId={defaultClientId} onDone={onDone} />;
}

// ----------------------------------------------------------------- lançamento
type Pick = { due?: string; rec?: Recurrence };

function BatchTaskForm({ defaultClientId, onDone }: { defaultClientId?: string | null; onDone: () => void }) {
  const { clients, users, tasks, taskTypes, createTasks, notify, today, currentUser } = useAppStore();
  const activeTypes = useMemo(() => taskTypes.filter((t) => t.active), [taskTypes]);

  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [notes, setNotes] = useState("");
  const [defaultDue, setDefaultDue] = useState(addDays(today, 7));
  const [defaultRec, setDefaultRec] = useState<Recurrence>("NONE");
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = activeTypes.filter((t) => !search || normalize(`${t.name} ${t.category}`).includes(normalize(search)));
  const selectedIds = Object.keys(picked);
  const noCatalog = activeTypes.length === 0;

  function toggle(id: string) {
    setPicked((p) => {
      const next = { ...p };
      if (id in next) delete next[id];
      else next[id] = {};
      return next;
    });
  }

  const openFor = (name: string) =>
    clientId ? tasks.find((t) => t.clientId === clientId && isTaskOpen(t.status) && t.title === name) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = tasksBatchSchema.safeParse({
      clientId,
      assigneeId,
      notes,
      items: selectedIds.map((id) => ({
        taskTypeId: id,
        dueDate: picked[id].due ?? defaultDue,
        recurrence: picked[id].rec ?? defaultRec,
      })),
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError("");
    setBusy(true);
    const r = await createTasks(parsed.data);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return notify(r.error, "error");
    }
    notify(r.data.length > 1 ? `${r.data.length} tarefas lançadas com sucesso.` : "Tarefa lançada com sucesso.");
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {noCatalog && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-soft p-4 text-sm sm:col-span-2">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-navy">Nenhuma tarefa cadastrada ainda.</p>
            <p className="mt-0.5 text-slate-700">
              As tarefas são escolhidas do cadastro do escritório.{" "}
              {can(currentUser.role, "task:write") ? (
                <>
                  Cadastre em <Link href="/tarefas" className="font-semibold text-primary underline">Tarefas → Cadastro de tarefas</Link>.
                </>
              ) : (
                "Peça a um administrador ou contador para cadastrá-las."
              )}
            </p>
          </div>
        </div>
      )}

      <Field label="Cliente *" className="sm:col-span-2">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Selecione…</option>
          {clients.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>{c.tradeName}</option>
          ))}
        </Select>
      </Field>

      <Field label="Prazo padrão *" hint="Vale para as tarefas marcadas; dá para ajustar o prazo de cada uma.">
        <Input type="date" value={defaultDue} onChange={(e) => setDefaultDue(e.target.value)} />
      </Field>
      <Field label="Recorrência padrão" hint="Ao concluir, a próxima ocorrência é criada automaticamente.">
        <Select value={defaultRec} onChange={(e) => setDefaultRec(e.target.value as Recurrence)}>
          {Object.entries(RECURRENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>

      <fieldset className="sm:col-span-2" disabled={noCatalog}>
        <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-slate-600">
          <span>Tarefas * <span className="font-normal text-slate-500">({selectedIds.length} selecionada{selectedIds.length === 1 ? "" : "s"})</span></span>
          {selectedIds.length > 0 && (
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPicked({})}>
              Limpar seleção
            </button>
          )}
        </legend>
        {activeTypes.length > 6 && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Buscar tarefa" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar tarefa" />
          </div>
        )}
        <ul className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-md border border-line">
          {visible.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nenhuma tarefa encontrada.</li>}
          {visible.map((t) => {
            const on = t.id in picked;
            const dup = on ? openFor(t.name) : undefined;
            return (
              <li key={t.id} className={cn("px-3 py-2", on && "bg-primary-soft/40")}>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={on} onChange={() => toggle(t.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-navy">{t.name}</span>
                    <span className="block text-xs text-slate-500">{t.category}{t.description ? ` · ${t.description}` : ""}</span>
                  </span>
                </label>
                {on && (
                  <div className="ml-7 mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-slate-600">
                      Prazo
                      <Input
                        type="date"
                        className="mt-1 h-9"
                        value={picked[t.id].due ?? defaultDue}
                        onChange={(e) => setPicked((p) => ({ ...p, [t.id]: { ...p[t.id], due: e.target.value } }))}
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      Recorrência
                      <Select
                        className="mt-1 h-9"
                        value={picked[t.id].rec ?? defaultRec}
                        onChange={(e) => setPicked((p) => ({ ...p, [t.id]: { ...p[t.id], rec: e.target.value as Recurrence } }))}
                      >
                        {Object.entries(RECURRENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </Select>
                    </label>
                    {dup && (
                      <p className="flex items-start gap-1.5 text-xs text-warning sm:col-span-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Este cliente já tem esta tarefa em aberto (prazo {formatDate(dup.dueDate)}). Confirme se quer lançar de novo.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <Field label="Responsável (todas as tarefas)">
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Sem responsável</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Observação (opcional, todas as tarefas)" className="sm:col-span-2">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: cliente pediu prioridade, documentos já recebidos…" />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={busy || noCatalog}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {selectedIds.length > 1 ? `Lançar ${selectedIds.length} tarefas` : "Lançar tarefa"}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- edição
function EditTaskForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { clients, users, updateTask, notify } = useAppStore();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      clientId: task.clientId,
      taskTypeId: "keep", // a tarefa do catálogo não muda na edição
      dueDate: task.dueDate,
      assigneeId: task.assigneeId ?? "",
      recurrence: task.recurrence,
      notes: task.notes ?? "",
    },
  });

  async function onSubmit(v: TaskFormValues) {
    const result = await updateTask(task.id, v);
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify("Tarefa atualizada com sucesso.");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Cliente" className="sm:col-span-2">
        <Input readOnly value={clients.find((c) => c.id === task.clientId)?.tradeName ?? ""} />
      </Field>
      <Field label="Tarefa" className="sm:col-span-2">
        <Input readOnly value={`${task.title} · ${task.category}`} />
      </Field>
      <Field label="Prazo *" error={errors.dueDate?.message}>
        <Input type="date" {...register("dueDate")} />
      </Field>
      <Field label="Responsável">
        <Select {...register("assigneeId")}>
          <option value="">Sem responsável</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Recorrência" hint="Definida no lançamento." className="sm:col-span-2">
        <Input readOnly value={RECURRENCE_LABEL[task.recurrence]} />
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <Textarea {...register("notes")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
