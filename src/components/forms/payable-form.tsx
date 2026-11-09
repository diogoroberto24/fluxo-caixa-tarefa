"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
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
  const { categories, createPayable, updatePayable, notify, today, splitPayables } = useAppStore();
  const editing = !!payable;
  const {
    register,
    handleSubmit,
    setError,
    watch,
    getValues,
    setValue,
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
          scope: splitPayables ? payable.scope : "",
          notes: payable.notes ?? "",
        }
      : {
          // com a separação ligada a categoria depende do tipo, então começa vazia
          categoryId: splitPayables ? "" : (categories.find((c) => c.active && c.name === "Outras")?.id ?? ""),
          issueDate: today,
          dueDate: today,
          recurrence: "NONE",
          // conta nova: o tipo começa vazio e precisa ser escolhido
          scope: "",
        },
  });

  const scope = watch("scope");
  /** Categorias que podem ser escolhidas: ativas e, com a separação ligada, do tipo escolhido.
   *  A categoria atual de uma conta em edição sempre aparece, mesmo desativada ou de outro tipo. */
  const options = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.id === payable?.categoryId ||
          (c.active &&
            (!splitPayables ||
              (scope === "EMPRESA" && c.forEmpresa) ||
              (scope === "PESSOAL" && c.forPessoal))),
      ),
    [categories, payable?.categoryId, splitPayables, scope],
  );
  const categoryLocked = splitPayables && !scope;

  // trocou o tipo e a categoria escolhida não pertence a ele: limpa
  useEffect(() => {
    const current = getValues("categoryId");
    if (current && !options.some((c) => c.id === current)) setValue("categoryId", "");
  }, [options, getValues, setValue]);

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
      {splitPayables && (
        <Field
          label="Tipo da conta *"
          error={errors.scope?.message}
          hint={editing && payable.recurrence !== "NONE" ? "Vale também para as próximas ocorrências desta despesa." : undefined}
          className="sm:col-span-2"
        >
          <Select {...register("scope")}>
            <option value="">Selecione…</option>
            <option value="EMPRESA">Empresa</option>
            <option value="PESSOAL">Pessoal</option>
          </Select>
        </Field>
      )}
      <Field
        label="Categoria *"
        error={errors.categoryId?.message}
        hint={
          !categoryLocked && splitPayables && options.length === 0
            ? "Nenhuma categoria para este tipo. Ajuste em Configurações > Gerenciador de categorias."
            : undefined
        }
      >
        <Select {...register("categoryId")} aria-disabled={categoryLocked} className={categoryLocked ? "bg-surface text-slate-400" : undefined}>
          <option value="">{categoryLocked ? "Escolha o tipo da conta primeiro" : "Selecione…"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (desativada)"}
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
