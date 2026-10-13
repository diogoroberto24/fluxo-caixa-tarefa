"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { monthOf } from "@/lib/dates";
import { competenceLabel } from "@/lib/format";
import { receivableSchema, type ReceivableFormValues } from "@/lib/schemas";

export function ReceivableForm({
  defaultClientId,
  onDone,
}: {
  defaultClientId?: string | null;
  onDone: () => void;
}) {
  const { clients, receivables, createReceivable, notify, today } = useAppStore();
  const activeClients = clients.filter((c) => c.active);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReceivableFormValues>({
    resolver: zodResolver(receivableSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      category: "OUTROS",
      competence: monthOf(today),
      dueDate: today,
    },
  });

  async function onSubmit(v: ReceivableFormValues) {
    // Verificação rápida no navegador; o banco garante a regra (índice único) mesmo assim.
    if (
      v.category === "HONORARIOS" &&
      receivables.some(
        (r) =>
          r.clientId === v.clientId &&
          r.category === "HONORARIOS" &&
          r.competence === v.competence &&
          !r.canceled,
      )
    ) {
      setError("competence", {
        message: `Já existe cobrança de honorários para ${competenceLabel(v.competence)}.`,
      });
      notify("Cobrança duplicada para a competência informada.", "error");
      return;
    }
    const result = await createReceivable(v);
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify("Cobrança lançada com sucesso.");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Cliente *" error={errors.clientId?.message} className="sm:col-span-2">
        <Select {...register("clientId")}>
          <option value="">Selecione…</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.tradeName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Descrição *" error={errors.description?.message} className="sm:col-span-2">
        <Input {...register("description")} />
      </Field>
      <Field label="Categoria *">
        <Select {...register("category")}>
          <option value="HONORARIOS">Honorários</option>
          <option value="OUTROS">Outros recebimentos</option>
        </Select>
      </Field>
      <Field label="Competência *" error={errors.competence?.message}>
        <Input type="month" {...register("competence")} />
      </Field>
      <Field label="Valor (R$) *" error={errors.amount?.message}>
        <Input inputMode="decimal" placeholder="0,00" {...register("amount")} />
      </Field>
      <Field label="Vencimento *" error={errors.dueDate?.message}>
        <Input type="date" {...register("dueDate")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Lançar cobrança
        </Button>
      </div>
    </form>
  );
}
