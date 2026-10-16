"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { clientToFormValues } from "@/lib/data/client-mapper";
import { formatBRL, formatDate } from "@/lib/format";
import { planInstallments } from "@/lib/installments";
import { parseMoneyToCents } from "@/lib/money";
import { clientCreateSchema, clientSchema, type ClientFormValues } from "@/lib/schemas";
import { maskDocument, maskPhone, maskZip } from "@/lib/masks";
import { useCepLookup } from "@/lib/use-cep-lookup";
import { onlyDigits } from "@/lib/validators";
import { MODULE_LABEL, TAX_REGIME_LABEL } from "@/services/clients";
import type { Client, ClientKind, ServiceModule, TaxRegime } from "@/types/domain";

const KIND_OPTIONS: { value: ClientKind; title: string; text: string }[] = [
  { value: "FIXO", title: "Cliente fixo", text: "Honorários mensais recorrentes." },
  { value: "EVENTUAL", title: "Cliente eventual", text: "Serviço avulso: à vista ou parcelado em até 5 vezes." },
];

export function ClientForm({
  client,
  onDone,
}: {
  /** Quando informado, o formulário edita este cliente. */
  client?: Client;
  onDone: (client: Client) => void;
}) {
  const { saveClient, addService, clients, notify, today } = useAppStore();
  /** Cliente eventual que já existe (mesmo CPF/CNPJ): oferece lançar o serviço nele. */
  const [returning, setReturning] = useState<Client | null>(null);
  const [launching, setLaunching] = useState(false);
  const editing = !!client;
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    getValues,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(editing ? clientSchema : clientCreateSchema),
    defaultValues: client
      ? clientToFormValues(client)
      : {
          kind: "FIXO",
          taxRegime: "SIMPLES_NACIONAL",
          contractStart: today,
          modules: [],
          feeDueDay: "10",
          active: "true",
          state: "PR",
          serviceDescription: "Serviço avulso",
          installments: "1",
          firstDueDate: today,
        },
  });

  // ---- CEP: preenche rua, bairro, cidade e UF sem sobrescrever o que o usuário digitou
  const cep = useCepLookup({
    zip: watch("zip") ?? "",
    initialZip: editing && client ? client.address.zip : undefined,
    initialAuto: editing ? {} : { state: "PR" },
    getValue: (f) => getValues(f),
    setValue: (f, v) => setValue(f, v, { shouldValidate: true, shouldDirty: true }),
    focus: (f) => setFocus(f),
  });

  const kind = watch("kind");
  const eventual = kind === "EVENTUAL";
  const installments = Number(watch("installments") ?? "1");
  const preview = eventual
    ? planInstallments(parseMoneyToCents(watch("serviceTotal") ?? "") ?? 0, installments, watch("firstDueDate") ?? "")
    : [];

  async function onSubmit(v: ClientFormValues) {
    const doc = onlyDigits(v.document);
    const existing = clients.find((c) => c.document === doc && c.id !== client?.id);
    if (existing && !editing && v.kind === "EVENTUAL") {
      setReturning(existing);
      return;
    }
    if (existing) {
      setError("document", { message: "Já existe um cliente com este CNPJ/CPF." });
      notify("Cliente já cadastrado com este documento.", "error");
      return;
    }
    const result = await saveClient(client?.id ?? null, v);
    if (!result.ok) {
      if (result.field) setError(result.field, { message: result.error });
      notify(result.error, "error");
      return;
    }
    notify(
      editing
        ? `Cliente "${result.data.tradeName}" atualizado com sucesso.`
        : `Cliente "${result.data.tradeName}" cadastrado com sucesso.`,
    );
    onDone(result.data);
  }

  async function launchOnExisting() {
    if (!returning) return;
    const v = getValues();
    setLaunching(true);
    const r = await addService(returning.id, {
      description: v.serviceDescription ?? "",
      total: v.serviceTotal ?? "",
      installments: v.installments ?? "1",
      firstDueDate: v.firstDueDate ?? "",
    });
    setLaunching(false);
    if (!r.ok) {
      notify(r.error, "error");
      return;
    }
    notify(`Serviço lançado para "${returning.tradeName}". O cadastro dele não foi alterado.`);
    onDone(returning);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-6">
      <fieldset className="sm:col-span-6">
        <legend className="mb-1.5 text-xs font-medium text-slate-600">Tipo de cliente *</legend>
        {editing ? (
          <p className="flex items-center gap-2 text-sm">
            <Badge tone={eventual ? "warning" : "info"}>{eventual ? "Cliente eventual" : "Cliente fixo"}</Badge>
            <span className="text-xs text-slate-500">O tipo é definido no cadastro e não pode ser alterado.</span>
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {KIND_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50"
              >
                <input type="radio" value={o.value} className="mt-1 h-4 w-4 accent-primary" {...register("kind")} />
                <span>
                  <span className="block font-semibold text-navy">{o.title}</span>
                  <span className="text-xs text-slate-500">{o.text}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Field label="Razão social *" error={errors.legalName?.message} className="sm:col-span-4">
        <Input {...register("legalName")} />
      </Field>
      <Field label="Nome fantasia *" error={errors.tradeName?.message} className="sm:col-span-2">
        <Input {...register("tradeName")} />
      </Field>

      <Field label="CNPJ ou CPF *" error={errors.document?.message} className="sm:col-span-2">
        <Controller
          control={control}
          name="document"
          render={({ field }) => (
            <Input
              ref={field.ref}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(maskDocument(e.target.value))}
            />
          )}
        />
      </Field>
      <Field label="Inscrição estadual" className="sm:col-span-2">
        <Input {...register("stateRegistration")} />
      </Field>
      <Field label="Inscrição municipal" className="sm:col-span-2">
        <Input {...register("municipalRegistration")} />
      </Field>

      <Field label="CEP *" error={errors.zip?.message} hint={cep.hint} className="sm:col-span-2">
        <Controller
          control={control}
          name="zip"
          render={({ field }) => (
            <Input
              ref={field.ref}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(maskZip(e.target.value))}
            />
          )}
        />
      </Field>
      <Field label="Logradouro *" error={errors.street?.message} className="sm:col-span-3">
        <Input {...register("street")} />
      </Field>
      <Field label="Número *" error={errors.number?.message}>
        <Input {...register("number")} />
      </Field>
      <Field label="Complemento" className="sm:col-span-2">
        <Input {...register("complement")} />
      </Field>
      <Field label="Bairro *" error={errors.district?.message} className="sm:col-span-2">
        <Input {...register("district")} />
      </Field>
      <Field label="Cidade *" error={errors.city?.message}>
        <Input {...register("city")} />
      </Field>
      <Field label="UF *" error={errors.state?.message}>
        <Input maxLength={2} {...register("state")} />
      </Field>

      <Field label="Telefone *" error={errors.phone?.message} className="sm:col-span-2">
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <Input
              ref={field.ref}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(maskPhone(e.target.value))}
            />
          )}
        />
      </Field>
      <Field label="E-mail *" error={errors.email?.message} className="sm:col-span-4">
        <Input type="email" {...register("email")} />
      </Field>

      <Field label="Regime tributário *" className="sm:col-span-3">
        <Select {...register("taxRegime")}>
          {(Object.keys(TAX_REGIME_LABEL) as TaxRegime[]).map((k) => (
            <option key={k} value={k}>
              {TAX_REGIME_LABEL[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={eventual ? "Data do serviço *" : "Início do contrato *"}
        error={errors.contractStart?.message}
        className="sm:col-span-3"
      >
        <Input type="date" {...register("contractStart")} />
      </Field>

      <div className="flex flex-col gap-1.5 sm:col-span-6">
        <span className="text-xs font-medium text-slate-600">
          {eventual ? "Serviços prestados *" : "Módulos contratados *"}
        </span>
        <Controller
          control={control}
          name="modules"
          render={({ field }) => (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(Object.keys(MODULE_LABEL) as ServiceModule[]).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line accent-primary"
                    checked={field.value.includes(m)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked
                          ? [...field.value, m]
                          : field.value.filter((x) => x !== m),
                      )
                    }
                  />
                  {MODULE_LABEL[m]}
                </label>
              ))}
            </div>
          )}
        />
        {errors.modules && (
          <span role="alert" className="text-xs text-danger">
            {errors.modules.message}
          </span>
        )}
      </div>

      {!eventual && (
        <>
          <Field
            label="Honorários mensais (R$) *"
            error={errors.monthlyFee?.message}
            hint={editing ? "Alterar o valor não muda cobranças já emitidas." : undefined}
            className="sm:col-span-2"
          >
            <Input inputMode="decimal" placeholder="1.200,00" {...register("monthlyFee")} />
          </Field>
          <Field label="Dia do vencimento *" error={errors.feeDueDay?.message} className="sm:col-span-2">
            <Input inputMode="numeric" {...register("feeDueDay")} />
          </Field>
        </>
      )}

      <Field label="Situação *" className={eventual ? "sm:col-span-6" : "sm:col-span-2"}>
        <Select {...register("active")}>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </Field>

      {eventual && !editing && (
        <section className="grid gap-4 rounded-lg border border-line bg-surface/60 p-4 sm:col-span-6 sm:grid-cols-6">
          <h3 className="text-sm font-semibold text-navy sm:col-span-6">Pagamento do serviço avulso</h3>
          <Field label="Descrição do serviço *" error={errors.serviceDescription?.message} className="sm:col-span-6">
            <Input placeholder="Ex.: Declaração de Imposto de Renda" {...register("serviceDescription")} />
          </Field>
          <Field label="Valor total (R$) *" error={errors.serviceTotal?.message} className="sm:col-span-2">
            <Input inputMode="decimal" placeholder="600,00" {...register("serviceTotal")} />
          </Field>
          <Field label="Forma de pagamento *" error={errors.installments?.message} className="sm:col-span-2">
            <Select {...register("installments")}>
              <option value="1">À vista</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Parcelado em {n}x
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={installments > 1 ? "Vencimento da 1ª parcela *" : "Data de vencimento *"}
            error={errors.firstDueDate?.message}
            className="sm:col-span-2"
          >
            <Input type="date" {...register("firstDueDate")} />
          </Field>
          {preview.length > 0 && (
            <div className="sm:col-span-6" aria-live="polite">
              <p className="mb-1.5 text-xs text-slate-500">
                {installments > 1
                  ? "As parcelas vencem todo mês no mesmo dia da primeira e podem ser pagas antes do vencimento."
                  : "Pagamento à vista. Pode ser registrado antes do vencimento."}
              </p>
              <ul className="divide-y divide-line rounded-md border border-line bg-white text-sm">
                {preview.map((p) => (
                  <li key={p.number} className="flex items-center justify-between px-3 py-1.5">
                    <span>{installments > 1 ? `Parcela ${p.number}/${installments}` : "À vista"} · vence {formatDate(p.dueDate)}</span>
                    <span className="font-semibold">{formatBRL(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {eventual && editing && (
        <p className="rounded-md bg-surface px-3 py-2 text-xs text-slate-600 sm:col-span-6">
          O serviço avulso e as parcelas deste cliente são gerenciados em <strong>Contas a Receber</strong>.
        </p>
      )}

      <Field label="Observações internas" className="sm:col-span-6">
        <Textarea {...register("notes")} />
      </Field>

      {returning && (
        <div role="alert" className="rounded-lg border border-warning-line bg-warning-soft p-4 text-sm sm:col-span-6">
          <p className="font-semibold text-navy">Este CPF/CNPJ já está cadastrado: {returning.tradeName}</p>
          {returning.active ? (
            <>
              <p className="mt-1 text-slate-700">
                Deseja lançar este serviço para ele? O cadastro dele <strong>não será alterado</strong>; só as cobranças do
                serviço ({installments > 1 ? `${installments} parcelas` : "à vista"}) serão criadas.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={launchOnExisting} disabled={launching}>
                  {launching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Lançar serviço para {returning.tradeName}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setReturning(null)} disabled={launching}>
                  Voltar e corrigir o documento
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-slate-700">
              Este cliente está <strong>inativo</strong>. Reative-o em Clientes antes de lançar um novo serviço.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar alterações" : "Salvar cliente"}
        </Button>
      </div>
    </form>
  );
}
