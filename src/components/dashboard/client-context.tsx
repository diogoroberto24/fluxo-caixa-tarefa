"use client";

import { Mail, MapPin, Phone, X } from "lucide-react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatAddress, formatBRL, formatDate, formatDocument, formatPhone } from "@/lib/format";
import { MODULE_LABEL, TAX_REGIME_LABEL } from "@/services/clients";

/** Resumo do cliente selecionado, com filtro ativo e opção de limpar. */
export function ClientContext({
  clientId,
  onClear,
  onOpenFees,
}: {
  clientId: string;
  onClear: () => void;
  onOpenFees: (clientId: string) => void;
}) {
  const { clients } = useAppStore();
  const c = clients.find((x) => x.id === clientId);
  if (!c) return null;
  const addr = formatAddress(c.address);

  return (
    <Card className="border-primary/40 bg-primary-soft/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">Filtro de cliente ativo</Badge>
          <h3 className="text-base font-semibold text-navy">{c.tradeName}</h3>
          {!c.active && <Badge>Inativo</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={onClear}>
          <X className="h-3.5 w-3.5" /> Limpar seleção
        </Button>
      </div>

      <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Razão social</dt>
          <dd className="font-medium">{c.legalName}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">CNPJ / CPF</dt>
          <dd className="font-medium">{formatDocument(c.document)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Inscrição estadual / municipal</dt>
          <dd className="font-medium">{c.stateRegistration ?? "—"} / {c.municipalRegistration ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Regime tributário</dt>
          <dd className="font-medium">{TAX_REGIME_LABEL[c.taxRegime]}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{c.kind === "EVENTUAL" ? "Cliente eventual" : "Honorários mensais"}</dt>
          <dd>
            <button
              type="button"
              onClick={() => onOpenFees(c.id)}
              className="font-bold text-primary underline-offset-2 hover:underline"
              title="Ver histórico de cobranças"
            >
              {c.kind === "EVENTUAL" ? "Ver parcelas do serviço" : formatBRL(c.monthlyFeeCents)}
            </button>
            {c.kind === "FIXO" && <span className="ml-1 text-xs text-slate-500">· vence dia {c.feeDueDay}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{c.kind === "EVENTUAL" ? "Data do serviço" : "Contrato desde"}</dt>
          <dd className="font-medium">{formatDate(c.contractStart)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-slate-500">Módulos contratados</dt>
          <dd className="mt-0.5 flex flex-wrap gap-1.5">
            {c.modules.map((m) => (
              <Badge key={m} tone="info">{MODULE_LABEL[m]}</Badge>
            ))}
          </dd>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>{addr.line1}, {addr.line2}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-slate-400" /> {formatPhone(c.phone)}
        </div>
        <div className="flex items-center gap-2 break-all">
          <Mail className="h-4 w-4 shrink-0 text-slate-400" /> {c.email}
        </div>
        {c.notes && (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs text-slate-500">Observações internas</dt>
            <dd>{c.notes}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
