"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { monthOf } from "@/lib/dates";
import { competenceLabel, formatBRL, formatDate } from "@/lib/format";
import { planInstallments } from "@/lib/installments";
import { parseMoneyToCents } from "@/lib/money";
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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReceivableFormValues>({
    resolver: zodResolver(receivableSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      category: "OUTROS",
      competence: monthOf(today),
      dueDate: today,
      installments: "1",
    },
  });
  const parcelavel = watch("category") === "OUTROS";
  const n = parcelavel ? Number(watch("installments") ?? "1") : 1;
  const preview = n > 1 ? planInstallments(parseMoneyToCents(watch("amount") ?? "") ?? 0, n, watch("dueDate") ?? "") : [];

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
    const result = await createReceivable({ ...v, installments: v.category === "OUTROS" ? v.installments : "1" });
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify(n > 1 ? `Serviço parcelado em ${n}x lançado com sucesso.` : "Cobrança lançada com sucesso.");
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
      <Field label={n > 1 ? "Valor total do serviço (R$) *" : "Valor (R$) *"} error={errors.amount?.message}>
        <Input inputMode="decimal" placeholder="0,00" {...register("amount")} />
      </Field>
      <Field label={n > 1 ? "Vencimento da 1ª parcela *" : "Vencimento *"} error={errors.dueDate?.message}>
        <Input type="date" {...register("dueDate")} />
      </Field>
      {parcelavel && (
        <Field label="Forma de pagamento" error={errors.installments?.message} hint="Serviço avulso: à vista ou em até 5 parcelas mensais.">
          <Select {...register("installments")}>
            <option value="1">À vista</option>
            {[2, 3, 4, 5].map((k) => (
              <option key={k} value={k}>Parcelado em {k}x</option>
            ))}
          </Select>
        </Field>
      )}
      {preview.length > 0 && (
        <ul aria-live="polite" className="divide-y divide-line rounded-md border border-line bg-white text-sm sm:col-span-2">
          {preview.map((p) => (
            <li key={p.number} className="flex items-center justify-between px-3 py-1.5">
              <span>Parcela {p.number}/{n} · vence {formatDate(p.dueDate)}</span>
              <span className="font-semibold">{formatBRL(p.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Lançar cobrança
        </Button>
      </div>
    </form>
  );
}
