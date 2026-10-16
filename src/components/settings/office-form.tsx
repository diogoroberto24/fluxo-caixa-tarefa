"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { saveOfficeAction } from "@/app/(app)/configuracoes/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/fields";
import type { OfficeData } from "@/lib/contracts";
import { maskDocument, maskPhone, maskZip } from "@/lib/masks";
import { officeSchema, type OfficeFormValues } from "@/lib/schemas";
import { useCepLookup } from "@/lib/use-cep-lookup";

function toForm(o: OfficeData): OfficeFormValues {
  return {
    legalName: o.legalName, tradeName: o.tradeName, document: maskDocument(o.document), crc: o.crc,
    representativeName: o.representativeName, representativeDocument: maskDocument(o.representativeDocument),
    representativeRole: o.representativeRole, representativeCrc: o.representativeCrc, zip: maskZip(o.zip),
    street: o.street, number: o.number, complement: o.complement, district: o.district, city: o.city,
    state: o.state, phone: maskPhone(o.phone), email: o.email, defaultForum: o.defaultForum, pixKey: o.pixKey,
  };
}

/** Dados do escritório (aparecem nos contratos). Somente o administrador altera. */
export function OfficeForm({ initial }: { initial: OfficeData }) {
  const { notify } = useAppStore();
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    getValues,
    setValue,
    setFocus,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OfficeFormValues>({ resolver: zodResolver(officeSchema), defaultValues: toForm(initial) });

  const cep = useCepLookup({
    zip: watch("zip") ?? "",
    initialZip: initial.zip,
    getValue: (f) => getValues(f),
    setValue: (f, v) => setValue(f, v, { shouldValidate: true, shouldDirty: true }),
    focus: (f) => setFocus(f),
  });

  async function onSubmit(v: OfficeFormValues) {
    const r = await saveOfficeAction(v);
    if (!r.ok) {
      if (r.field) setError(r.field, { message: r.error });
      notify(r.error, "error");
      return;
    }
    notify("Dados do escritório salvos.");
    reset(v);
  }

  const masked = (name: "document" | "representativeDocument" | "phone" | "zip", mask: (v: string) => string, props: Record<string, string>) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input
          ref={field.ref}
          value={field.value ?? ""}
          onBlur={field.onBlur}
          onChange={(e) => field.onChange(mask(e.target.value))}
          {...props}
        />
      )}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Building2 className="h-5 w-5 text-navy" strokeWidth={1.8} /> Dados do escritório
        </CardTitle>
      </CardHeader>
      <p className="px-5 pt-1 text-sm text-slate-500">
        Estes dados são usados nos contratos (identificação da contratada, endereço, assinatura e foro). O contrato só pode
        ser emitido quando os dados que o modelo usa estiverem preenchidos.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 p-5 sm:grid-cols-6">
        <h3 className="text-sm font-semibold text-navy sm:col-span-6">Identificação</h3>
        <Field label="Razão social" hint="Sai assim na assinatura do contrato." error={errors.legalName?.message} className="sm:col-span-4">
          <Input {...register("legalName")} />
        </Field>
        <Field label="Nome fantasia" error={errors.tradeName?.message} className="sm:col-span-2">
          <Input {...register("tradeName")} />
        </Field>
        <Field label="CNPJ ou CPF" error={errors.document?.message} className="sm:col-span-3">
          {masked("document", maskDocument, { inputMode: "numeric", placeholder: "00.000.000/0000-00" })}
        </Field>
        <Field label="CRC do escritório" error={errors.crc?.message} className="sm:col-span-3">
          <Input placeholder="Ex.: 000000/O-0" {...register("crc")} />
        </Field>

        <h3 className="mt-2 text-sm font-semibold text-navy sm:col-span-6">Responsável pela assinatura</h3>
        <Field label="Nome" error={errors.representativeName?.message} className="sm:col-span-3">
          <Input {...register("representativeName")} />
        </Field>
        <Field label="CPF" error={errors.representativeDocument?.message} className="sm:col-span-3">
          {masked("representativeDocument", maskDocument, { inputMode: "numeric", placeholder: "000.000.000-00" })}
        </Field>
        <Field label="Categoria profissional" hint="Como sai no contrato (ex.: CONTADOR)." error={errors.representativeRole?.message} className="sm:col-span-3">
          <Input placeholder="Ex.: CONTADOR" {...register("representativeRole")} />
        </Field>
        <Field
          label="Número do CRC do responsável"
          hint="Só o número, sem “CRC/UF” (o contrato escreve CRC/UF antes). Ex.: 079908/O-0"
          error={errors.representativeCrc?.message}
          className="sm:col-span-3"
        >
          <Input placeholder="079908/O-0" {...register("representativeCrc")} />
        </Field>

        <h3 className="mt-2 text-sm font-semibold text-navy sm:col-span-6">Endereço e contato</h3>
        <Field label="CEP" error={errors.zip?.message} hint={cep.hint} className="sm:col-span-2">
          {masked("zip", maskZip, { inputMode: "numeric", placeholder: "00000-000", autoComplete: "postal-code" })}
        </Field>
        <Field label="Logradouro" error={errors.street?.message} className="sm:col-span-3">
          <Input {...register("street")} />
        </Field>
        <Field label="Número" error={errors.number?.message}>
          <Input {...register("number")} />
        </Field>
        <Field label="Complemento" className="sm:col-span-2">
          <Input {...register("complement")} />
        </Field>
        <Field label="Bairro" error={errors.district?.message} className="sm:col-span-2">
          <Input {...register("district")} />
        </Field>
        <Field label="Cidade" error={errors.city?.message}>
          <Input {...register("city")} />
        </Field>
        <Field label="UF" error={errors.state?.message}>
          <Input maxLength={2} {...register("state")} />
        </Field>
        <Field label="Telefone" error={errors.phone?.message} className="sm:col-span-2">
          {masked("phone", maskPhone, { inputMode: "tel", placeholder: "(00) 00000-0000" })}
        </Field>
        <Field label="E-mail" error={errors.email?.message} className="sm:col-span-4">
          <Input type="email" {...register("email")} />
        </Field>

        <h3 className="mt-2 text-sm font-semibold text-navy sm:col-span-6">Contratos</h3>
        <Field label="Chave PIX para recebimento" hint="Sai no contrato, na cláusula dos honorários (CNPJ, CPF, e-mail, telefone ou chave aleatória)." error={errors.pixKey?.message} className="sm:col-span-6">
          <Input autoComplete="off" placeholder="Ex.: 00.000.000/0001-00" {...register("pixKey")} />
        </Field>
        <Field label="Foro padrão (comarca)" hint="Sugerido ao emitir cada contrato; dá para alterar em cada um." error={errors.defaultForum?.message} className="sm:col-span-6">
          <Input placeholder="Ex.: Curitiba/PR" {...register("defaultForum")} />
        </Field>

        <div className="flex justify-end sm:col-span-6">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar dados do escritório
          </Button>
        </div>
      </form>
    </Card>
  );
}
