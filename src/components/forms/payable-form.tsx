"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { centsToInput } from "@/lib/money";
import { payableSchema, type PayableFormValues } from "@/lib/schemas";
import type { Payable } from "@/types/domain";

const RECURRENCE_LABEL = { NONE: "Avulsa", MENSAL: "Mensal", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;

export function PayableForm({
  payable,
  onDone,
}: {
  /** Quando informado, edita esta conta (a recorrência não pode ser alterada aqui). */
  payable?: Payable;
  onDone: () => void;
}) {
  const { categories, createPayable, updatePayable, notify, today } = useAppStore();
  const editing = !!payable;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PayableFormValues>({
    resolver: zodResolver(payableSchema),
    defaultValues: payable
      ? {
          description: payable.description,
          categoryId: payable.categoryId,
          supplier: payable.supplier,
          amount: centsToInput(payable.amountCents),
          issueDate: payable.issueDate,
          dueDate: payable.dueDate,
          recurrence: payable.recurrence,
          notes: payable.notes ?? "",
        }
      : {
          categoryId: categories.find((c) => c.name === "Outras")?.id ?? "",
          issueDate: today,
          dueDate: today,
          recurrence: "NONE",
        },
  });

  async function onSubmit(v: PayableFormValues) {
    const result = editing ? await updatePayable(payable.id, v) : await createPayable(v);
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify(
      editing
        ? "Conta atualizada com sucesso."
        : v.recurrence === "NONE"
          ? "Conta a pagar lançada com sucesso."
          : "Conta recorrente criada. As próximas ocorrências foram geradas.",
    );
    onDone();
  }

  const paid = !!payable?.paidAt;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      {paid && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning sm:col-span-2">
          Conta já paga: valor e vencimento não podem mais ser alterados.
        </p>
      )}
      <Field label="Descrição *" error={errors.description?.message} className="sm:col-span-2">
        <Input {...register("description")} />
      </Field>
      <Field label="Categoria *" error={errors.categoryId?.message}>
        <Select {...register("categoryId")}>
          <option value="">Selecione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fornecedor / beneficiário *" error={errors.supplier?.message}>
        <Input {...register("supplier")} />
      </Field>
      <Field label="Valor (R$) *" error={errors.amount?.message}>
        <Input inputMode="decimal" placeholder="0,00" readOnly={paid} {...register("amount")} />
      </Field>
      <Field
        label="Recorrência"
        hint={editing ? "Definida na criação." : "Mensal, semestral ou anual gera as próximas ocorrências automaticamente."}
      >
        {editing ? (
          <Input readOnly value={RECURRENCE_LABEL[payable.recurrence]} />
        ) : (
          <Select {...register("recurrence")}>
            <option value="NONE">Avulsa</option>
            <option value="MENSAL">Mensal</option>
            <option value="SEMESTRAL">Semestral</option>
            <option value="ANUAL">Anual</option>
          </Select>
        )}
      </Field>
      <Field label="Data de lançamento *" error={errors.issueDate?.message}>
        <Input type="date" {...register("issueDate")} />
      </Field>
      <Field label="Vencimento *" error={errors.dueDate?.message}>
        <Input type="date" readOnly={paid} {...register("dueDate")} />
      </Field>
      <Field label="Observações" className="sm:col-span-2">
        <Textarea {...register("notes")} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar alterações" : "Lançar conta"}
        </Button>
      </div>
    </form>
  );
}
