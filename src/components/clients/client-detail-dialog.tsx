"use client";

import { Mail, MapPin, Pencil, Phone, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, ChargeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EditServiceDialog, NewServiceDialog } from "@/components/finance/service-dialogs";
import { can } from "@/lib/permissions";
import type { FeeHistoryEntry } from "@/lib/data/clients";
import { formatAddress, formatBRL, formatDate, formatDocument, formatPhone } from "@/lib/format";
import { MODULE_LABEL, TAX_REGIME_LABEL } from "@/services/clients";
import { chargeStatus, feeHistory } from "@/services/finance";
import type { Client } from "@/types/domain";

export function ClientDetailDialog({
  client,
  onClose,
}: {
  client: Client | null;
  onClose: () => void;
}) {
  const { loadFeeHistory, receivables, today, currentUser } = useAppStore();
  const canService = can(currentUser.role, "service:edit");
  const [newService, setNewService] = useState<string | null>(null);
  const [editService, setEditService] = useState<string | null>(null);
  const [history, setHistory] = useState<FeeHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const clientId = client?.id;

  useEffect(() => {
    if (!clientId || client?.kind === "EVENTUAL") return;
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
  }, [clientId, client?.kind, client?.monthlyFeeCents, client?.feeDueDay]);

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
            <Badge tone={client.kind === "EVENTUAL" ? "warning" : "info"}>{client.kind === "EVENTUAL" ? "Cliente eventual" : "Cliente fixo"}</Badge>
            {client.isDemo && <Badge tone="warning">Demonstração</Badge>}
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">CNPJ / CPF</dt><dd className="font-medium">{formatDocument(client.document)}</dd></div>
            <div><dt className="text-xs text-slate-500">Regime tributário</dt><dd className="font-medium">{TAX_REGIME_LABEL[client.taxRegime]}</dd></div>
            <div><dt className="text-xs text-slate-500">Inscrição estadual</dt><dd>{client.stateRegistration ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Inscrição municipal</dt><dd>{client.municipalRegistration ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">{client.kind === "EVENTUAL" ? "Data do serviço" : "Início do contrato"}</dt><dd>{formatDate(client.contractStart)}</dd></div>
            {client.kind === "FIXO" && (
              <div>
                <dt className="text-xs text-slate-500">Honorários mensais</dt>
                <dd className="font-bold text-primary">{formatBRL(client.monthlyFeeCents)} <span className="text-xs font-normal text-slate-500">· vence dia {client.feeDueDay}</span></dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Módulos contratados</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1.5">{client.modules.map((m) => <Badge key={m} tone="info">{MODULE_LABEL[m]}</Badge>)}</dd>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{addr.line1}, {addr.line2} · CEP {client.address.zip.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" />{formatPhone(client.phone)}</div>
            <div className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-slate-400" />{client.email}</div>
            {client.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Observações internas</dt><dd>{client.notes}</dd></div>}
          </dl>

          {client.kind === "EVENTUAL" ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-navy">Serviço avulso e parcelas</h3>
                {canService && client.active && (
                  <Button size="sm" variant="outline" onClick={() => setNewService(client.id)}>
                    <Plus className="h-3.5 w-3.5" /> Novo serviço
                  </Button>
                )}
              </div>
              {(() => {
                const all = feeHistory(receivables, client.id, "EVENTUAL").slice().reverse();
                const items = all.filter((r) => !r.canceled);
                const canceledCount = all.length - items.length;
                if (items.length === 0 && canceledCount === 0) return <p className="text-sm text-slate-500">Nenhuma cobrança lançada para este cliente.</p>;
                return (
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {items.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span>
                          <span className="font-medium">{r.description}</span>
                          <span className="block text-xs text-slate-500">
                            vence {formatDate(r.dueDate)}{r.paidAt ? ` · pago em ${formatDate(r.paidAt)}` : ""}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-semibold">{formatBRL(r.amountCents)}</span>
                          <ChargeBadge status={chargeStatus(r, today)} />
                          {canService && r.installmentGroupId && !r.paidAt && !r.canceled && (
                            <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Editar serviço" title="Editar serviço (reparcelar saldo)" onClick={() => setEditService(r.installmentGroupId!)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                    {canceledCount > 0 && (
                      <li className="px-3 py-2 text-xs text-slate-500">
                        {canceledCount} parcela(s) cancelada(s) (por edição do serviço ou cancelamento) — ficam no histórico em Contas a Receber.
                      </li>
                    )}
                  </ul>
                );
              })()}
              <p className="mt-2 text-xs text-slate-500">Parcelas podem ser pagas antes do vencimento em Contas a Receber.</p>
            </div>
          ) : (
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
          )}
        </div>
      )}
      <NewServiceDialog clientId={newService} onClose={() => setNewService(null)} />
      <EditServiceDialog groupId={editService} onClose={() => setEditService(null)} />
    </Dialog>
  );
}
