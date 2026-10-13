"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { addDays } from "@/lib/dates";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import { TASK_CATEGORIES } from "@/services/tasks";
import type { Task } from "@/types/domain";

const RECURRENCE_LABEL = { NONE: "Não se repete", MENSAL: "Mensal", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;

export function TaskForm({
  task,
  defaultClientId,
  onDone,
}: {
  /** Quando informado, edita esta tarefa (a recorrência é definida na criação). */
  task?: Task;
  defaultClientId?: string | null;
  onDone: () => void;
}) {
  const { clients, users, createTask, updateTask, notify, today } = useAppStore();
  const editing = !!task;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: task
      ? {
          clientId: task.clientId,
          title: task.title,
          category: task.category,
          description: task.description ?? "",
          dueDate: task.dueDate,
          assigneeId: task.assigneeId ?? "",
          recurrence: task.recurrence,
          notes: task.notes ?? "",
        }
      : {
          clientId: defaultClientId ?? "",
          category: TASK_CATEGORIES[0],
          dueDate: addDays(today, 7),
          recurrence: "NONE",
          assigneeId: "",
        },
  });

  async function onSubmit(v: TaskFormValues) {
    const result = editing ? await updateTask(task.id, v) : await createTask(v);
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify(editing ? "Tarefa atualizada com sucesso." : "Tarefa criada com sucesso.");
    onDone();
  }

  const categories = task && !TASK_CATEGORIES.includes(task.category as never)
    ? [task.category, ...TASK_CATEGORIES]
    : TASK_CATEGORIES;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
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
      <Field label="Nome da tarefa *" error={errors.title?.message} className="sm:col-span-2">
        <Input {...register("title")} />
      </Field>
      <Field label="Categoria *" error={errors.category?.message}>
        <Select {...register("category")}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
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
        hint={editing ? "Definida na criação." : "Ao concluir, a próxima ocorrência é criada automaticamente."}
      >
        {editing ? (
          <Input readOnly value={RECURRENCE_LABEL[task.recurrence]} />
        ) : (
          <Select {...register("recurrence")}>
            {Object.entries(RECURRENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <Textarea {...register("description")} />
      </Field>
      <Field label="Observações" className="sm:col-span-2">
        <Textarea {...register("notes")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar alterações" : "Criar tarefa"}
        </Button>
      </div>
    </form>
  );
}
