"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { issueContractAction } from "@/app/(app)/contratos/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import {
  buildContractVariables,
  defaultContractForm,
  parseContractForm,
  renderTemplate,
  variableLabel,
  type ContractFormValues,
  type OfficeData,
} from "@/lib/contracts";
import { MODULE_LABEL } from "@/services/clients";
import type { ContractTemplate, ServiceModule } from "@/types/domain";

/** Emitir contrato: escolhe cliente e modelo, ajusta as condições, confere a prévia e emite. */
export function EmitContractDialog({
  open,
  onClose,
  templates,
  office,
}: {
  open: boolean;
  onClose: () => void;
  templates: ContractTemplate[];
  office: OfficeData;
}) {
  const router = useRouter();
  const { clients, today, notify } = useAppStore();
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [form, setForm] = useState<ContractFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);

  const client = clients.find((c) => c.id === clientId);
  const eligible = useMemo(
    () => templates.filter((t) => t.active && client && (t.audience === "TODOS" || t.audience === client.kind)),
    [templates, client],
  );
  const template = eligible.find((t) => t.id === templateId);

  function pickClient(id: string) {
    setClientId(id);
    setTemplateId("");
    setError("");
    const c = clients.find((x) => x.id === id);
    setForm(c ? defaultContractForm(c, office, today) : null);
  }

  const set = <K extends keyof ContractFormValues>(k: K, v: ContractFormValues[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const parsed = client && form ? parseContractForm(client.kind, form) : null;
  const preview = useMemo(() => {
    if (!client || !template || !parsed || !parsed.ok) return null;
    const vars = buildContractVariables({ office, client, cond: parsed.data, issuedOn: today });
    return renderTemplate(template.body, vars, "(gerado ao emitir)");
  }, [client, template, parsed, office, today]);

  const blocked = !template || !parsed || !parsed.ok || !preview || preview.unknown.length > 0 || preview.missing.length > 0;

  async function emit() {
    if (!client || !template || !form || blocked || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const r = await issueContractAction({ clientId: client.id, templateId: template.id, form });
    setBusy(false);
    sending.current = false;
    if (!r.ok) {
      setError(r.error);
      return notify(r.error, "error");
    }
    notify(`Contrato ${r.data.number} emitido.`);
    onClose();
    router.push(`/contratos/${r.data.id}`);
  }

  const eventual = client?.kind === "EVENTUAL";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      size="xl"
      title="Emitir contrato"
      description="Escolha o cliente e o modelo. O texto é montado com os dados do cadastro e as condições abaixo."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="grid content-start gap-4">
          <Field label="Cliente *">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">Selecione…</option>
              {clients.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName} {c.kind === "EVENTUAL" ? "(eventual)" : ""}
                </option>
              ))}
            </Select>
          </Field>

          {client && (
            <Field
              label="Modelo *"
              hint={eligible.length === 0 ? "Nenhum modelo ativo se aplica a este tipo de cliente. Cadastre em “Modelos de contrato”." : undefined}
            >
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Selecione…</option>
                {eligible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          )}

          {client && form && template && (
            <>
              <Field label={eventual ? "Data do serviço *" : "Início do contrato *"}>
                <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>

              {!eventual && (
                <>
                  <fieldset>
                    <legend className="mb-1.5 text-xs font-medium text-slate-600">Serviços contratados *</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {(Object.keys(MODULE_LABEL) as ServiceModule[]).map((m) => (
                        <label key={m} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={form.services.includes(m)}
                            onChange={(e) => set("services", e.target.checked ? [...form.services, m] : form.services.filter((x) => x !== m))}
                          />
                          {MODULE_LABEL[m]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Honorários mensais (R$) *">
                      <Input inputMode="decimal" value={form.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} />
                    </Field>
                    <Field label="Dia do vencimento *">
                      <Input inputMode="numeric" value={form.dueDay} onChange={(e) => set("dueDay", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Vigência (meses)" hint="0 = prazo indeterminado.">
                    <Input inputMode="numeric" value={form.termMonths} onChange={(e) => set("termMonths", e.target.value)} />
                  </Field>
                  <Field label="Reajuste (texto da cláusula)" hint="Opcional. Sai onde o modelo usar {{contrato.reajuste}}.">
                    <Textarea rows={2} value={form.adjustment} onChange={(e) => set("adjustment", e.target.value)} />
                  </Field>
                </>
              )}

              {eventual && (
                <>
                  <Field label="Descrição do serviço *">
                    <Input value={form.serviceDescription} onChange={(e) => set("serviceDescription", e.target.value)} placeholder="Ex.: Declaração de Imposto de Renda 2026" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor total (R$) *">
                      <Input inputMode="decimal" value={form.serviceTotal} onChange={(e) => set("serviceTotal", e.target.value)} />
                    </Field>
                    <Field label="Pagamento *">
                      <Select value={form.installments} onChange={(e) => set("installments", e.target.value)}>
                        <option value="1">À vista</option>
                        {[2, 3, 4, 5].map((n) => <option key={n} value={n}>Parcelado em {n}x</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label={Number(form.installments) > 1 ? "Vencimento da 1ª parcela *" : "Data de vencimento *"}>
                    <Input type="date" value={form.firstDueDate} onChange={(e) => set("firstDueDate", e.target.value)} />
                  </Field>
                </>
              )}

              <Field label="Foro (comarca)">
                <Input value={form.forum} onChange={(e) => set("forum", e.target.value)} placeholder="Ex.: Curitiba/PR" />
              </Field>
              <Field label="Observações / cláusulas adicionais" hint="Opcional. Sai onde o modelo usar {{contrato.observacoes}}.">
                <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-navy">Prévia</h3>
          {!template ? (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-slate-500">
              Escolha o cliente e o modelo para ver o contrato.
            </p>
          ) : (
            <>
              {parsed && !parsed.ok && (
                <p role="alert" className="mb-2 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {parsed.error}
                </p>
              )}
              {preview && preview.unknown.length > 0 && (
                <p role="alert" className="mb-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                  O modelo usa campos que não existem: {preview.unknown.map((k) => `{{${k}}}`).join(", ")}. Corrija em “Modelos de contrato”.
                </p>
              )}
              {preview && preview.missing.length > 0 && (
                <div role="alert" className="mb-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                  <p className="font-semibold">Faltam dados para emitir:</p>
                  <ul className="ml-4 list-disc">
                    {preview.missing.map((k) => <li key={k}>{variableLabel(k)}</li>)}
                  </ul>
                  <p className="mt-1">
                    Complete o cadastro do cliente ou os <Link href="/configuracoes" className="font-semibold underline">dados do escritório</Link>.
                  </p>
                </div>
              )}
              <div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-4 font-[Georgia,'Times_New_Roman',serif] text-[13.5px] leading-6 text-ink">
                {preview ? preview.text : "Preencha as condições ao lado para ver a prévia."}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button onClick={emit} disabled={blocked || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Emitir contrato
        </Button>
      </div>
    </Dialog>
  );
}
