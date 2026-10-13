"use client";

import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, HandCoins, Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, ChargeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { addMonths, monthOf } from "@/lib/dates";
import { formatBRL, formatDate, monthLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  DUE_SOON_DAYS,
  openPayables,
  openReceivablesOfMonth,
  summarizePayables,
  summarizeReceivables,
} from "@/services/finance";

type Detail = "receivable" | "payable" | null;

export function SummaryCards() {
  const { receivables, payables, clients, today, currentUser } = useAppStore();
  const showReceivable = can(currentUser.role, "receivable:read");
  const showPayable = can(currentUser.role, "payable:read");
  const [month, setMonth] = useState(monthOf(today));
  const [detail, setDetail] = useState<Detail>(null);

  const rec = useMemo(() => summarizeReceivables(receivables, month, today), [receivables, month, today]);
  const pay = useMemo(() => summarizePayables(payables, today), [payables, today]);
  const openRec = useMemo(
    () => openReceivablesOfMonth(receivables, clients, month, today),
    [receivables, clients, month, today],
  );
  const openPay = useMemo(() => openPayables(payables, today), [payables, today]);

  const payAlert = pay.overdueCount > 0;
  if (!showReceivable && !showPayable) return null;

  return (
    <section aria-label="Resumo financeiro">
      <div className="mb-3 flex items-center justify-end gap-1 text-sm">
        <span className="mr-1 text-slate-500">Período dos recebimentos:</span>
        <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMonth(addMonths(month, -1))} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[116px] text-center font-medium text-navy">{monthLabel(month)}</span>
        <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMonth(addMonths(month, 1))} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className={cn("grid gap-5", showReceivable && showPayable && "md:grid-cols-2")}>
        {/* Contas a receber */}
        {showReceivable && (
        <div className="relative rounded-xl border border-success-line bg-success-soft p-5 shadow-card">
          <Link href="/contas-a-receber" aria-label="Abrir Contas a Receber" className="absolute inset-0 rounded-xl" />
          <div className="pointer-events-none relative flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-success/15 text-success">
              <HandCoins className="h-6 w-6" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-navy">Contas a Receber</h3>
              <p className="text-xs text-slate-600">Previsto para receber em {monthLabel(month)}</p>
              <button
                type="button"
                onClick={() => setDetail("receivable")}
                className="pointer-events-auto relative mt-1 text-[28px] font-bold leading-tight text-success hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
                aria-label="Ver clientes com cobranças em aberto"
              >
                {formatBRL(rec.expectedCents)}
              </button>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 text-slate-500" />
          </div>

          <div className="relative mt-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Recebido: <strong className="text-success">{formatBRL(rec.receivedCents)}</strong> ({rec.receivedPct}%)</span>
              <span>Pendente: <strong>{formatBRL(rec.pendingCents + rec.overdueCents)}</strong></span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-valuenow={rec.receivedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Percentual recebido">
              <div className="h-full rounded-full bg-success" style={{ width: `${rec.receivedPct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDetail("receivable")}
                className="relative rounded-full bg-white px-3 py-1 text-xs font-medium text-navy shadow-sm hover:bg-white/70"
              >
                {rec.openCount} {rec.openCount === 1 ? "cobrança pendente" : "cobranças pendentes"}
              </button>
              {rec.overdueCount > 0 && (
                <Badge tone="danger">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {rec.overdueCount} {rec.overdueCount === 1 ? "vencida" : "vencidas"} · {formatBRL(rec.overdueCents)}
                </Badge>
              )}
              {rec.expectedCents === 0 && <span className="text-xs text-slate-500">Sem cobranças neste período.</span>}
            </div>
          </div>
        </div>

        )}

        {/* Contas a pagar */}
        {showPayable && (
        <div className={cn("relative rounded-xl border p-5 shadow-card", payAlert ? "border-danger-line bg-danger-soft" : "border-warning-line bg-warning-soft")}>
          <Link href="/contas-a-pagar" aria-label="Abrir Contas a Pagar" className="absolute inset-0 rounded-xl" />
          <div className="pointer-events-none relative flex items-start gap-4">
            <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full", payAlert ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning")}>
              <Receipt className="h-6 w-6" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-navy">Contas a Pagar</h3>
              <p className="text-xs text-slate-600">Total de despesas em aberto (não pagas)</p>
              <button
                type="button"
                onClick={() => setDetail("payable")}
                className={cn("pointer-events-auto relative mt-1 text-[28px] font-bold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2", payAlert ? "text-danger focus-visible:ring-danger/40" : "text-warning focus-visible:ring-warning/40")}
                aria-label="Ver detalhamento das despesas em aberto"
              >
                {formatBRL(pay.openCents)}
              </button>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 text-slate-500" />
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDetail("payable")}
              className="relative rounded-full bg-white px-3 py-1 text-xs font-medium text-navy shadow-sm hover:bg-white/70"
            >
              {pay.openCount} {pay.openCount === 1 ? "conta pendente" : "contas pendentes"}
            </button>
            {pay.overdueCount > 0 && (
              <Badge tone="danger">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {pay.overdueCount} {pay.overdueCount === 1 ? "vencida" : "vencidas"} · {formatBRL(pay.overdueCents)}
              </Badge>
            )}
            {pay.dueSoonCount > 0 && (
              <Badge tone="warning">
                <CalendarClock className="mr-1 h-3 w-3" />
                {pay.dueSoonCount} vence{pay.dueSoonCount === 1 ? "" : "m"} em {DUE_SOON_DAYS} dias
              </Badge>
            )}
          </div>
        </div>
        )}
      </div>

      <Dialog
        open={detail === "receivable"}
        onOpenChange={(o) => !o && setDetail(null)}
        size="lg"
        title={`Cobranças em aberto — ${monthLabel(month)}`}
        description="Clientes com cobranças pendentes ou vencidas no período."
      >
        {openRec.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nenhuma cobrança em aberto" description="Todas as cobranças deste período foram recebidas ou não há lançamentos." />
        ) : (
          <ul className="divide-y divide-line">
            {openRec.map(({ receivable: r, client, status }) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-navy">{client?.tradeName ?? "Cliente removido"}</div>
                  <div className="text-xs text-slate-500">{r.description}</div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-xs text-slate-500">Venc. {formatDate(r.dueDate)}</span>
                  <span className="w-28 text-right font-semibold">{formatBRL(r.amountCents)}</span>
                  <ChargeBadge status={status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={detail === "payable"}
        onOpenChange={(o) => !o && setDetail(null)}
        size="xl"
        title="Despesas em aberto"
        description="Contas ainda não pagas, ordenadas por vencimento."
      >
        {openPay.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma conta em aberto" description="Todas as despesas lançadas já foram pagas." />
        ) : (
          <ul className="divide-y divide-line">
            {openPay.map(({ payable: p, status }) => (
              <li key={p.id} className="grid gap-x-4 gap-y-1 py-3 md:grid-cols-[1.6fr_1fr_1fr_110px_110px_90px] md:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-navy">{p.description}</div>
                  <div className="text-xs text-slate-500 md:hidden">{p.category} · {p.supplier}</div>
                </div>
                <div className="hidden text-sm md:block">{p.category}</div>
                <div className="hidden truncate text-sm md:block">{p.supplier}</div>
                <div className="text-xs text-slate-500 md:text-sm">Venc. {formatDate(p.dueDate)}</div>
                <div className="font-semibold md:text-right">{formatBRL(p.amountCents)}</div>
                <div><ChargeBadge status={status} /></div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </section>
  );
}
