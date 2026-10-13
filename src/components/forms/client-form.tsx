"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { clientToFormValues } from "@/lib/data/client-mapper";
import { clientSchema, type ClientFormValues } from "@/lib/schemas";
import { onlyDigits } from "@/lib/validators";
import { MODULE_LABEL, TAX_REGIME_LABEL } from "@/services/clients";
import type { Client, ServiceModule, TaxRegime } from "@/types/domain";

export function ClientForm({
  client,
  onDone,
}: {
  /** Quando informado, o formulário edita este cliente. */
  client?: Client;
  onDone: (client: Client) => void;
}) {
  const { saveClient, clients, notify, today } = useAppStore();
  const editing = !!client;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: client
      ? clientToFormValues(client)
      : {
          taxRegime: "SIMPLES_NACIONAL",
          contractStart: today,
          modules: [],
          feeDueDay: "10",
          active: "true",
          state: "PR",
        },
  });

  async function onSubmit(v: ClientFormValues) {
    const doc = onlyDigits(v.document);
    if (clients.some((c) => c.document === doc && c.id !== client?.id)) {
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-6">
      <Field label="Razão social *" error={errors.legalName?.message} className="sm:col-span-4">
        <Input {...register("legalName")} />
      </Field>
      <Field label="Nome fantasia *" error={errors.tradeName?.message} className="sm:col-span-2">
        <Input {...register("tradeName")} />
      </Field>

      <Field label="CNPJ ou CPF *" error={errors.document?.message} className="sm:col-span-2">
        <Input inputMode="numeric" placeholder="Somente números ou formatado" {...register("document")} />
      </Field>
      <Field label="Inscrição estadual" className="sm:col-span-2">
        <Input {...register("stateRegistration")} />
      </Field>
      <Field label="Inscrição municipal" className="sm:col-span-2">
        <Input {...register("municipalRegistration")} />
      </Field>

      <Field label="CEP *" error={errors.zip?.message} className="sm:col-span-2">
        <Input inputMode="numeric" {...register("zip")} />
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
        <Input inputMode="tel" {...register("phone")} />
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
      <Field label="Início do contrato *" error={errors.contractStart?.message} className="sm:col-span-3">
        <Input type="date" {...register("contractStart")} />
      </Field>

      <div className="flex flex-col gap-1.5 sm:col-span-6">
        <span className="text-xs font-medium text-slate-600">Módulos contratados *</span>
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
      <Field label="Situação *" className="sm:col-span-2">
        <Select {...register("active")}>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </Field>

      <Field label="Observações internas" className="sm:col-span-6">
        <Textarea {...register("notes")} />
      </Field>

      <div className="flex justify-end gap-2 sm:col-span-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Salvar alterações" : "Salvar cliente"}
        </Button>
      </div>
    </form>
  );
}
