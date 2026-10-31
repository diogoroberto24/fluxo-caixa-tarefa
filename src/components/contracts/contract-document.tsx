"use client";

import { ArrowLeft, Ban, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cancelContractAction } from "@/app/(app)/contratos/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/fields";
import { layoutContract } from "@/lib/contract-layout";
import { formatDate } from "@/lib/format";
import type { Contract } from "@/types/domain";

/** Contrato emitido: texto pronto para imprimir ou salvar em PDF (Imprimir → Salvar como PDF). */
export function ContractDocument({ contract, clientName, logoSrc }: { contract: Contract; clientName: string; logoSrc?: string | null }) {
  const router = useRouter();
  const { notify } = useAppStore();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canceled = contract.status === "CANCELADO";
  const layout = useMemo(() => layoutContract(contract.body ?? ""), [contract.body]);

  async function cancel() {
    if (busy) return;
    setBusy(true);
    const r = await cancelContractAction(contract.id, reason);
    setBusy(false);
    if (!r.ok) return notify(r.error, "error");
    notify("Contrato cancelado.");
    setCancelOpen(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href="/contratos" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos contratos
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-navy">
            Contrato {contract.number}
            <Badge tone={canceled ? "neutral" : "success"}>{canceled ? "Cancelado" : "Emitido"}</Badge>
          </h1>
          <p className="text-sm text-slate-500">
            {clientName} · {contract.templateName} · emitido em {formatDate(contract.issuedOn)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
          {!canceled && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4 text-danger" /> Cancelar contrato
            </Button>
          )}
        </div>
      </div>

      {canceled && (
        <p role="status" className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>CONTRATO CANCELADO</strong>
          {contract.cancelReason ? ` — ${contract.cancelReason}` : ""}. O texto abaixo é o que foi emitido.
        </p>
      )}

      <article className={`contract-sheet${logoSrc ? " contract-has-logo" : ""} rounded-xl border border-line bg-white shadow-card print:rounded-none print:border-0 print:shadow-none`}>
        {/* O cabeçalho da tabela se repete no topo de cada página impressa: é assim que a logo sai em todas. */}
        <table className="contract-frame">
          {logoSrc && (
            <thead>
              <tr>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoSrc} alt="" className="contract-letterhead" />
                </td>
              </tr>
            </thead>
          )}
          <tbody>
            <tr>
              <td>
        <h1 className="contract-title">{layout.title}</h1>
        {layout.blocks.map((b, i) =>
          b.kind === "item" ? (
            <p key={i} className="contract-item">
              <span className="contract-item-n">{b.number}</span>
              {b.text}
            </p>
          ) : b.kind === "clausula" ? (
            <h2 key={i} className="contract-clausula">{b.text}</h2>
          ) : b.kind === "area" ? (
            <h3 key={i} className="contract-area">{b.text}</h3>
          ) : b.kind === "paragrafo" ? (
            <h3 key={i} className="contract-paragrafo">{b.text}</h3>
          ) : (
            <p key={i} className={b.kind === "data" ? "contract-data" : "contract-text"}>{b.text}</p>
          ),
        )}
        {layout.signatures.length > 0 && (
          <div className="contract-signatures">
            {layout.signatures.map((s, i) => (
              <div key={i}>
                <div className="contract-sign-line" />
                <div className="contract-sign-role">{s.role}</div>
                {s.lines.map((l, j) => (
                  <div key={j} className="contract-sign-info">{l}</div>
                ))}
              </div>
            ))}
          </div>
        )}
              </td>
            </tr>
          </tbody>
        </table>
      </article>

      <Dialog open={cancelOpen} onOpenChange={(o) => !o && !busy && setCancelOpen(false)} title="Cancelar contrato?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            O contrato <strong>{contract.number}</strong> será marcado como cancelado. O texto e o número são mantidos
            no histórico e não podem ser reutilizados.
          </p>
          <Field label="Motivo (opcional)">
            <Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>Voltar</Button>
            <Button variant="danger" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar cancelamento
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
