"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { taskTypeSchema, type TaskTypeFormValues } from "@/lib/schemas";
import { TASK_CATEGORIES } from "@/services/tasks";
import type { TaskType } from "@/types/domain";

function TaskTypeForm({ type, onDone }: { type?: TaskType; onDone: () => void }) {
  const { saveTaskType, notify } = useAppStore();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskTypeFormValues>({
    resolver: zodResolver(taskTypeSchema),
    defaultValues: type
      ? { name: type.name, category: type.category, description: type.description ?? "", active: type.active ? "true" : "false" }
      : { name: "", category: TASK_CATEGORIES[0], description: "", active: "true" },
  });
  const categories = type && !TASK_CATEGORIES.includes(type.category as never) ? [type.category, ...TASK_CATEGORIES] : TASK_CATEGORIES;

  async function onSubmit(v: TaskTypeFormValues) {
    const r = await saveTaskType(type?.id ?? null, v);
    if (!r.ok) {
      if (r.field) setError(r.field, { message: r.error });
      notify(r.error, "error");
      return;
    }
    notify(type ? "Tarefa do cadastro atualizada." : "Tarefa cadastrada com sucesso.");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome da tarefa *" error={errors.name?.message} className="sm:col-span-2">
        <Input placeholder="Ex.: Fechamento de folha" autoFocus {...register("name")} />
      </Field>
      <Field label="Categoria *" error={errors.category?.message}>
        <Select {...register("category")}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field
        label="Situação"
        hint="Inativa não aparece ao lançar tarefas; as já lançadas não mudam."
      >
        <Select {...register("active")}>
          <option value="true">Ativa</option>
          <option value="false">Inativa</option>
        </Select>
      </Field>
      <Field label="Descrição (opcional)" className="sm:col-span-2">
        <Textarea placeholder="Explica o que deve ser feito. Aparece ao escolher a tarefa." {...register("description")} />
      </Field>
      {type && (
        <p className="rounded-md bg-surface px-3 py-2 text-xs text-slate-600 sm:col-span-2">
          Alterar o nome ou a descrição vale para os <strong>próximos</strong> lançamentos. Tarefas já lançadas mantêm o nome que tinham.
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Voltar</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {type ? "Salvar" : "Cadastrar tarefa"}
        </Button>
      </div>
    </form>
  );
}

/** Cadastro (catálogo) de tarefas do escritório: as tarefas dos clientes são escolhidas daqui. */
export function TaskTypesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { taskTypes } = useAppStore();
  const [form, setForm] = useState<{ type?: TaskType } | null>(null);

  function close() {
    setForm(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={form ? (form.type ? `Editar — ${form.type.name}` : "Nova tarefa do cadastro") : "Cadastro de tarefas"}
      description="Tarefas padrão do escritório. Ao lançar uma tarefa para um cliente, você escolhe uma delas."
    >
      {form ? (
        <TaskTypeForm type={form.type} onDone={() => setForm(null)} />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setForm({})}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </div>
          {taskTypes.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma tarefa cadastrada"
              description="Cadastre as tarefas que o escritório executa (ex.: Fechamento de folha). Depois é só escolher ao lançar para um cliente."
            />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {taskTypes.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-navy">{t.name}</span>
                      {!t.active && <Badge>Inativa</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.category}
                      {t.description ? ` · ${t.description}` : ""}
                    </div>
                  </div>
                  <Button size="icon" variant="outline" aria-label={`Editar ${t.name}`} title="Editar" onClick={() => setForm({ type: t })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
