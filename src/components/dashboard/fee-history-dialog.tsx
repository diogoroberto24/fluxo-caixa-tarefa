"use client";

import { Check, ChevronDown, ChevronUp, Loader2, ReceiptText } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { ChargeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { competenceLabel, formatBRL, formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { chargeStatus, feeHistory } from "@/services/finance";

export function FeeHistoryDialog({
  clientId,
  onClose,
}: {
  clientId: string | null;
  onClose: () => void;
}) {
  const { clients, receivables, today, payReceivable, notify, currentUser } = useAppStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const client = clients.find((c) => c.id === clientId);
  const history = clientId ? feeHistory(receivables, clientId).slice(0, 12) : [];
  const canPay = can(currentUser.role, "receivable:pay");

  return (
    <Dialog
      open={!!clientId}
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      title={`Histórico de honorários — ${client?.tradeName ?? ""}`}
      description="Cobranças por competência. Alterar o valor do contrato não altera cobranças anteriores."
    >
      {client && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-soft px-4 py-3">
            <span className="text-sm text-slate-600">Honorários mensais atuais (contrato)</span>
            <span className="text-lg font-bold text-primary">{formatBRL(client.monthlyFeeCents)}</span>
          </div>

          {history.length === 0 ? (
            <EmptyState icon={ReceiptText} title="Nenhuma cobrança de honorários" description="Este cliente ainda não possui cobranças geradas." />
          ) : (
            <ul className="divide-y divide-line">
              <li className="hidden grid-cols-[90px_110px_110px_110px_100px_1fr] gap-3 pb-2 text-xs font-medium text-slate-500 md:grid">
                <span>Competência</span><span>Vencimento</span><span>Pagamento</span><span className="text-right">Valor</span><span>Status</span><span className="text-right">Ações</span>
              </li>
              {history.map((r) => {
                const status = chargeStatus(r, today);
                const open = status === "PENDENTE" || status === "VENCIDO";
                const isExpanded = expanded === r.id;
                return (
                  <li key={r.id} className="py-3">
                    <div className="grid items-center gap-x-3 gap-y-2 md:grid-cols-[90px_110px_110px_110px_100px_1fr]">
                      <span className="font-medium text-navy">{competenceLabel(r.competence)}</span>
                      <span className="text-sm"><span className="text-xs text-slate-500 md:hidden">Venc. </span>{formatDate(r.dueDate)}</span>
                      <span className="text-sm"><span className="text-xs text-slate-500 md:hidden">Pago em </span>{formatDate(r.paidAt)}</span>
                      <span className="font-semibold md:text-right">{formatBRL(r.amountCents)}</span>
                      <span><ChargeBadge status={status} /></span>
                      <span className="flex flex-wrap gap-2 md:justify-end">
                        {open && canPay && (
                          <Button
                            size="sm"
                            variant="success"
                            disabled={busyId === r.id}
                            onClick={async () => {
                              if (busyId) return;
                              setBusyId(r.id);
                              const res = await payReceivable(r.id);
                              setBusyId(null);
                              if (!res.ok) return notify(res.error, "error");
                              notify(
                                res.data.alreadyPaid
                                  ? `O pagamento de ${competenceLabel(r.competence)} já estava registrado.`
                                  : `Pagamento de ${competenceLabel(r.competence)} registrado.`,
                              );
                            }}
                          >
                            {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Registrar pagamento
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setExpanded(isExpanded ? null : r.id)} aria-expanded={isExpanded}>
                          Detalhes {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 grid gap-3 rounded-lg bg-surface p-4 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-slate-500">Descrição</div>
                          <div>{r.description}</div>
                          <div className="mt-2 text-xs text-slate-500">Valor pago</div>
                          <div>{r.paidAmountCents != null ? formatBRL(r.paidAmountCents) : "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Histórico de alterações</div>
                          <ul className="mt-1 space-y-1">
                            {r.history.map((h, i) => (
                              <li key={i} className="text-xs"><span className="font-medium">{formatDate(h.at)}</span> — {h.text}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
