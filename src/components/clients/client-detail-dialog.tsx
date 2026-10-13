"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { FeeHistoryEntry } from "@/lib/data/clients";
import { formatAddress, formatBRL, formatDate, formatDocument, formatPhone } from "@/lib/format";
import { MODULE_LABEL, TAX_REGIME_LABEL } from "@/services/clients";
import type { Client } from "@/types/domain";

export function ClientDetailDialog({
  client,
  onClose,
}: {
  client: Client | null;
  onClose: () => void;
}) {
  const { loadFeeHistory } = useAppStore();
  const [history, setHistory] = useState<FeeHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const clientId = client?.id;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setHistory(null);
    setHistoryError(false);
    loadFeeHistory(clientId).then((r) => {
      if (cancelled) return;
      if (r.ok) setHistory(r.data);
      else setHistoryError(true);
    });
    return () => {
      cancelled = true;
    };
    // loadFeeHistory é estável o suficiente: depende só do servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, client?.monthlyFeeCents, client?.feeDueDay]);

  const addr = client ? formatAddress(client.address) : null;

  return (
    <Dialog
      open={!!client}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={client?.tradeName ?? "Cliente"}
      description={client?.legalName}
    >
      {client && addr && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={client.active ? "success" : "neutral"}>{client.active ? "Ativo" : "Inativo"}</Badge>
            {client.isDemo && <Badge tone="warning">Demonstração</Badge>}
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">CNPJ / CPF</dt><dd className="font-medium">{formatDocument(client.document)}</dd></div>
            <div><dt className="text-xs text-slate-500">Regime tributário</dt><dd className="font-medium">{TAX_REGIME_LABEL[client.taxRegime]}</dd></div>
            <div><dt className="text-xs text-slate-500">Inscrição estadual</dt><dd>{client.stateRegistration ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Inscrição municipal</dt><dd>{client.municipalRegistration ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Início do contrato</dt><dd>{formatDate(client.contractStart)}</dd></div>
            <div>
              <dt className="text-xs text-slate-500">Honorários mensais</dt>
              <dd className="font-bold text-primary">{formatBRL(client.monthlyFeeCents)} <span className="text-xs font-normal text-slate-500">· vence dia {client.feeDueDay}</span></dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Módulos contratados</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1.5">{client.modules.map((m) => <Badge key={m} tone="info">{MODULE_LABEL[m]}</Badge>)}</dd>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{addr.line1}, {addr.line2} · CEP {client.address.zip.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{formatPhone(client.phone)}</div>
            <div className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-slate-400" />{client.email}</div>
            {client.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Observações internas</dt><dd>{client.notes}</dd></div>}
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">Histórico do valor contratado</h3>
            {historyError ? (
              <p className="text-sm text-danger">Não foi possível carregar o histórico.</p>
            ) : history === null ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">Sem registros.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2">
                    <span>
                      <span className="font-medium">{formatBRL(h.monthlyFeeCents)}</span>
                      <span className="text-xs text-slate-500"> · vence dia {h.dueDay}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      a partir de {formatDate(h.validFrom)}
                      {i === 0 && <Badge tone="success" className="ml-2">Vigente</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
