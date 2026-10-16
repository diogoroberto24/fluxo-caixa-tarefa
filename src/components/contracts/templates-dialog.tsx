"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, FileText, Loader2, Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { saveTemplateAction } from "@/app/(app)/contratos/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import { CONTRACT_VARIABLES, EXAMPLE_TEMPLATE, renderTemplate } from "@/lib/contracts";
import { contractTemplateSchema, type ContractTemplateFormValues } from "@/lib/schemas";
import type { ContractAudience, ContractTemplate } from "@/types/domain";

export const AUDIENCE_LABEL: Record<ContractAudience, string> = {
  TODOS: "Todos os clientes",
  FIXO: "Clientes fixos",
  EVENTUAL: "Clientes eventuais",
};

function TemplateForm({ template, onDone }: { template?: ContractTemplate; onDone: () => void }) {
  const { notify } = useAppStore();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContractTemplateFormValues>({
    resolver: zodResolver(contractTemplateSchema),
    defaultValues: template
      ? { name: template.name, audience: template.audience, body: template.body, active: template.active ? "true" : "false" }
      : { name: "", audience: "TODOS", body: "", active: "true" },
  });
  const bodyReg = register("body");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const body = watch("body") ?? "";
  // campos digitados errado no modelo (não existem no catálogo de variáveis)
  const unknown = renderTemplate(body, {}).unknown;

  function insert(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    const current = getValues("body") ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    setValue("body", current.slice(0, start) + token + current.slice(end), { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function onSubmit(v: ContractTemplateFormValues) {
    const r = await saveTemplateAction(template?.id ?? null, v);
    if (!r.ok) {
      if (r.field) setError(r.field, { message: r.error });
      notify(r.error, "error");
      return;
    }
    notify(template ? "Modelo atualizado." : "Modelo cadastrado.");
    onDone();
  }

  const groups = ["Escritório", "Cliente", "Contrato"] as const;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do modelo *" error={errors.name?.message} className="sm:col-span-2">
          <Input placeholder="Ex.: Prestação de serviços contábeis — cliente fixo" autoFocus {...register("name")} />
        </Field>
        <Field label="Aplica-se a *">
          <Select {...register("audience")}>
            {(Object.keys(AUDIENCE_LABEL) as ContractAudience[]).map((k) => <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Situação">
          <Select {...register("active")}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </Field>
        <Field label="Texto do contrato *" error={errors.body?.message} className="sm:col-span-2">
          <textarea
            rows={16}
            spellCheck
            className="w-full rounded-md border border-line bg-white p-3 font-mono text-[13px] leading-6 text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            placeholder="Cole aqui o modelo e use os campos ao lado, ex.: {{cliente.razao_social}}"
            {...bodyReg}
            ref={(el) => {
              bodyReg.ref(el);
              bodyRef.current = el;
            }}
          />
        </Field>
        {!body.trim() && (
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setValue("body", EXAMPLE_TEMPLATE, { shouldDirty: true, shouldValidate: true })}>
              <FileText className="h-3.5 w-3.5" /> Inserir estrutura de exemplo
            </Button>
          </div>
        )}
        {unknown.length > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning sm:col-span-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Campos que não existem: {unknown.map((k) => `{{${k}}}`).join(", ")}. Use a lista ao lado.
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Voltar</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {template ? "Salvar modelo" : "Cadastrar modelo"}
          </Button>
        </div>
      </div>

      <aside aria-label="Campos disponíveis" className="max-h-[560px] overflow-y-auto rounded-lg border border-line bg-surface/60 p-3 text-xs">
        <p className="mb-2 font-semibold text-navy">Campos automáticos</p>
        <p className="mb-3 text-slate-500">Clique para inserir no texto, na posição do cursor.</p>
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <p className="mb-1 font-semibold text-slate-600">{g}</p>
            <ul className="space-y-1">
              {CONTRACT_VARIABLES.filter((v) => v.group === g).map((v) => (
                <li key={v.key}>
                  <button type="button" onClick={() => insert(v.key)} title={v.label} className="w-full rounded px-1.5 py-1 text-left hover:bg-white">
                    <code className="text-[11px] text-primary">{`{{${v.key}}}`}</code>
                    <span className="block text-slate-500">{v.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </form>
  );
}

/** Modelos de contrato (texto com campos automáticos). */
export function TemplatesDialog({
  open,
  onClose,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  templates: ContractTemplate[];
}) {
  const [form, setForm] = useState<{ template?: ContractTemplate } | null>(null);

  function close() {
    setForm(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      size="xl"
      title={form ? (form.template ? `Editar — ${form.template.name}` : "Novo modelo de contrato") : "Modelos de contrato"}
      description="O contrato emitido guarda uma cópia do texto: alterar o modelo depois não muda contratos já emitidos."
    >
      {form ? (
        <TemplateForm template={form.template} onDone={() => setForm(null)} />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setForm({})}>
              <Plus className="h-4 w-4" /> Novo modelo
            </Button>
          </div>
          {templates.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhum modelo cadastrado" description="Cadastre o modelo de contrato do escritório. Use os campos automáticos para preencher os dados do cliente." />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {templates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-navy">{t.name}</span>
                      {!t.active && <Badge>Inativo</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">{AUDIENCE_LABEL[t.audience]}</div>
                  </div>
                  <Button size="icon" variant="outline" aria-label={`Editar ${t.name}`} title="Editar" onClick={() => setForm({ template: t })}>
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
