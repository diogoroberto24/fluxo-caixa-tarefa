"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/fields";
import { formatBRL, formatDate } from "@/lib/format";
import { planInstallments } from "@/lib/installments";
import { centsToInput, parseMoneyToCents } from "@/lib/money";
import { serviceSchema, type ServiceFormValues } from "@/lib/schemas";
import { serviceGroup } from "@/services/finance";

const MAX = 5;

function Options({ max, edit }: { max: number; edit: boolean }) {
  return (
    <>
      {max >= 1 && <option value="1">{edit ? "1 parcela" : "À vista"}</option>}
      {[2, 3, 4, 5].filter((n) => n <= max).map((n) => (
        <option key={n} value={n}>
          {edit ? `${n} parcelas` : `Parcelado em ${n}x`}
        </option>
      ))}
    </>
  );
}

/**
 * Formulário do serviço avulso.
 *  - create: novo serviço para um cliente existente
 *  - edit: reparcela o SALDO EM ABERTO (parcelas pagas ficam como estão)
 */
function ServiceForm({
  clientId,
  groupId,
  onDone,
}: {
  clientId?: string;
  groupId?: string;
  onDone: () => void;
}) {
  const { receivables, addService, updateService, notify, today } = useAppStore();
  const editing = !!groupId;
  /** Trava de envio duplo (dois cliques no mesmo instante): editar não é idempotente. */
  const sending = useRef(false);
  const g = groupId ? serviceGroup(receivables, groupId) : null;
  const paidCount = g?.paid.length ?? 0;
  const maxInstallments = MAX - paidCount;

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: g
      ? {
          description: g.description,
          total: centsToInput(g.totalCents),
          installments: String(Math.min(Math.max(g.open.length, 1), maxInstallments)),
          firstDueDate: g.firstOpenDue ?? today,
        }
      : { description: "Serviço avulso", total: "", installments: "1", firstDueDate: today },
  });

  const n = Number(watch("installments") ?? "1");
  const totalCents = parseMoneyToCents(watch("total") ?? "") ?? 0;
  const paidCents = g?.paidCents ?? 0;
  const remaining = totalCents - paidCents;
  const preview = planInstallments(editing ? remaining : totalCents, n, watch("firstDueDate") ?? "");

  async function onSubmit(v: ServiceFormValues) {
    if (sending.current) return;
    sending.current = true;
    try {
      await submit(v);
    } finally {
      sending.current = false;
    }
  }

  async function submit(v: ServiceFormValues) {
    if (editing && parseMoneyToCents(v.total)! <= paidCents) {
      setError("total", { message: `O valor total deve ser maior que o já pago (${formatBRL(paidCents)}).` });
      return;
    }
    const r = editing ? await updateService(groupId!, v) : await addService(clientId!, v);
    if (!r.ok) {
      if (r.field) setError(r.field, { message: r.error });
      notify(r.error, "error");
      return;
    }
    notify(
      editing
        ? "Serviço atualizado. O saldo em aberto foi reparcelado."
        : Number(v.installments) > 1
          ? `Serviço parcelado em ${v.installments}x lançado com sucesso.`
          : "Serviço lançado com sucesso.",
    );
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-6">
      {editing && g && (
        <div className="rounded-md bg-surface p-3 text-sm sm:col-span-6">
          <p>
            <strong>Já pago:</strong> {formatBRL(paidCents)} em {paidCount} parcela(s) — não será alterado.
          </p>
          <p className="text-xs text-slate-500">
            Ao salvar, as parcelas em aberto ({g.open.length}) são <strong>canceladas</strong> (ficam no histórico) e o
            saldo é dividido nas novas parcelas.
          </p>
        </div>
      )}
      <Field label="Descrição do serviço *" error={errors.description?.message} className="sm:col-span-6">
        <Input {...register("description")} />
      </Field>
      <Field
        label="Valor total do serviço (R$) *"
        error={errors.total?.message}
        hint={editing ? `Saldo a parcelar: ${formatBRL(Math.max(remaining, 0))}` : undefined}
        className="sm:col-span-2"
      >
        <Input inputMode="decimal" placeholder="600,00" {...register("total")} />
      </Field>
      <Field
        label={editing ? "Parcelas restantes *" : "Forma de pagamento *"}
        error={errors.installments?.message}
        hint={editing ? `Máximo ${maxInstallments} (o serviço tem no máximo 5 parcelas no total).` : undefined}
        className="sm:col-span-2"
      >
        <Select {...register("installments")}>
          <Options max={maxInstallments} edit={editing} />
        </Select>
      </Field>
      <Field
        label={n > 1 ? "Vencimento da 1ª parcela *" : "Data de vencimento *"}
        error={errors.firstDueDate?.message}
        className="sm:col-span-2"
      >
        <Input type="date" {...register("firstDueDate")} />
      </Field>

      {(g?.paid.length ?? 0) + preview.length > 0 && (
        <ul aria-live="polite" className="divide-y divide-line rounded-md border border-line bg-white text-sm sm:col-span-6">
          {g?.paid.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-1.5 text-slate-500">
              <span>Já paga · vencia {formatDate(p.dueDate)}</span>
              <span className="font-semibold">{formatBRL(p.paidAmountCents ?? p.amountCents)}</span>
            </li>
          ))}
          {preview.map((p) => (
            <li key={p.number} className="flex items-center justify-between px-3 py-1.5">
              <span>
                {n + paidCount > 1 ? `Parcela ${paidCount + p.number}/${paidCount + n}` : "À vista"} · vence {formatDate(p.dueDate)}
              </span>
              <span className="font-semibold">{formatBRL(p.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end sm:col-span-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar serviço" : "Lançar serviço"}
        </Button>
      </div>
    </form>
  );
}

export function NewServiceDialog({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const { clients } = useAppStore();
  const client = clients.find((c) => c.id === clientId);
  return (
    <Dialog
      open={!!clientId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Novo serviço avulso${client ? ` — ${client.tradeName}` : ""}`}
      description="À vista ou parcelado em até 5 vezes. Parcelas podem ser pagas antes do vencimento."
    >
      {clientId && <ServiceForm clientId={clientId} onDone={onClose} />}
    </Dialog>
  );
}

export function EditServiceDialog({ groupId, onClose }: { groupId: string | null; onClose: () => void }) {
  const { receivables, clients } = useAppStore();
  const g = groupId ? serviceGroup(receivables, groupId) : null;
  const client = clients.find((c) => c.id === g?.clientId);
  return (
    <Dialog
      open={!!groupId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Editar serviço${client ? ` — ${client.tradeName}` : ""}`}
      description="Reparcela o saldo em aberto. O que já foi pago não muda."
    >
      {groupId && <ServiceForm groupId={groupId} onDone={onClose} />}
    </Dialog>
  );
}
