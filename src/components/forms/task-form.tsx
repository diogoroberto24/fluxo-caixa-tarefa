"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { addDays } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import type { Task } from "@/types/domain";

const RECURRENCE_LABEL = { NONE: "Não se repete", MENSAL: "Mensal", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;

export function TaskForm({
  task,
  defaultClientId,
  onDone,
}: {
  /** Quando informado, edita esta tarefa (a tarefa do catálogo e a recorrência não mudam). */
  task?: Task;
  defaultClientId?: string | null;
  onDone: () => void;
}) {
  const { clients, users, taskTypes, createTask, updateTask, notify, today, currentUser } = useAppStore();
  const editing = !!task;
  const activeTypes = taskTypes.filter((t) => t.active);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: task
      ? {
          clientId: task.clientId,
          taskTypeId: "keep",
          dueDate: task.dueDate,
          assigneeId: task.assigneeId ?? "",
          recurrence: task.recurrence,
          notes: task.notes ?? "",
        }
      : {
          clientId: defaultClientId ?? "",
          taskTypeId: "",
          dueDate: addDays(today, 7),
          recurrence: "NONE",
          assigneeId: "",
          notes: "",
        },
  });

  const selected = taskTypes.find((t) => t.id === watch("taskTypeId"));
  const noCatalog = !editing && activeTypes.length === 0;

  async function onSubmit(v: TaskFormValues) {
    const result = editing ? await updateTask(task.id, v) : await createTask(v);
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify(editing ? "Tarefa atualizada com sucesso." : "Tarefa lançada com sucesso.");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
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

      <Field label="Cliente *" error={errors.clientId?.message} className="sm:col-span-2">
        {editing ? (
          <Input readOnly value={clients.find((c) => c.id === task.clientId)?.tradeName ?? ""} />
        ) : (
          <Select {...register("clientId")}>
            <option value="">Selecione…</option>
            {clients.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.tradeName}</option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Tarefa *"
        error={errors.taskTypeId?.message}
        hint={!editing && selected?.description ? selected.description : undefined}
        className="sm:col-span-2"
      >
        {editing ? (
          <Input readOnly value={`${task.title} · ${task.category}`} />
        ) : (
          <Select {...register("taskTypeId")} disabled={noCatalog}>
            <option value="">Selecione…</option>
            {activeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.category}
              </option>
            ))}
          </Select>
        )}
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
      <Field
        label="Recorrência"
        hint={editing ? "Definida no lançamento." : "Ao concluir, a próxima ocorrência é criada automaticamente."}
        className="sm:col-span-2"
      >
        {editing ? (
          <Input readOnly value={RECURRENCE_LABEL[task.recurrence]} />
        ) : (
          <Select {...register("recurrence")}>
            {Object.entries(RECURRENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <Textarea placeholder="Ex.: cliente pediu prioridade, documentos já recebidos…" {...register("notes")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={isSubmitting || noCatalog}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar alterações" : "Lançar tarefa"}
        </Button>
      </div>
    </form>
  );
}
