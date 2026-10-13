"use client";

import { Ban, CheckCircle2, Eye, Pencil, Plus, Receipt, RefreshCw, Repeat, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PayableForm } from "@/components/forms/payable-form";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, ChargeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import { addDays } from "@/lib/dates";
import { formatBRL, formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn, normalize } from "@/lib/utils";
import { chargeStatus, DUE_SOON_DAYS, isOpen } from "@/services/finance";
import type { ChargeStatus, Payable } from "@/types/domain";
import { CancelDialog, HistoryList, PayDialog, StatCard } from "./shared";

const COLS = "md:grid-cols-[1.6fr_0.9fr_1.2fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_120px]";
const RECURRENCE_LABEL = { NONE: "Avulsa", MENSAL: "Mensal", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;

export function PayablesView() {
  const {
    payables, categories, today, currentUser, notify,
    payPayable, cancelPayable, generateOccurrences,
  } = useAppStore();
  const canWrite = can(currentUser.role, "payable:write");

  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState<"" | ChargeStatus>("");

  const [form, setForm] = useState<{ payable?: Payable } | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Gera as próximas ocorrências das despesas recorrentes (idempotente) ao abrir a página.
  const generated = useRef(false);
  useEffect(() => {
    if (generated.current || !canWrite) return;
    generated.current = true;
    generateOccurrences().then((r) => {
      if (r.ok && r.data.created > 0) notify(`${r.data.created} ocorrência(s) de despesas recorrentes geradas.`);
    });
  }, [canWrite, generateOccurrences, notify]);

  const rows = useMemo(() => {
    const s = normalize(supplier);
    return payables
      .map((p) => ({ p, st: chargeStatus(p, today) }))
      .filter(({ p, st }) => {
        if (dueFrom && p.dueDate < dueFrom) return false;
        if (dueTo && p.dueDate > dueTo) return false;
        if (categoryId && p.categoryId !== categoryId) return false;
        if (status && st !== status) return false;
        if (s && !normalize(`${p.supplier} ${p.description}`).includes(s)) return false;
        return true;
      })
      .sort((a, b) => {
        const ao = isOpen(a.st) ? 0 : 1;
        const bo = isOpen(b.st) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return ao === 0 ? a.p.dueDate.localeCompare(b.p.dueDate) : b.p.dueDate.localeCompare(a.p.dueDate);
      });
  }, [payables, today, dueFrom, dueTo, categoryId, status, supplier]);

  const kpi = useMemo(() => {
    const k = { open: 0, openCount: 0, overdue: 0, overdueCount: 0, soon: 0, soonCount: 0, paid: 0 };
    const limit = addDays(today, DUE_SOON_DAYS);
    for (const { p, st } of rows) {
      if (st === "PAGO") k.paid += p.paidAmountCents ?? p.amountCents;
      else if (isOpen(st)) {
        k.open += p.amountCents; k.openCount++;
        if (st === "VENCIDO") { k.overdue += p.amountCents; k.overdueCount++; }
        else if (p.dueDate <= limit) { k.soon += p.amountCents; k.soonCount++; }
      }
    }
    return k;
  }, [rows, today]);

  const payTarget = payables.find((p) => p.id === payId) ?? null;
  const cancelTarget = payables.find((p) => p.id === cancelId) ?? null;
  const detail = payables.find((p) => p.id === detailId) ?? null;

  async function onGenerate() {
    const r = await generateOccurrences();
    if (!r.ok) return notify(r.error, "error");
    notify(r.data.created > 0 ? `${r.data.created} ocorrência(s) geradas.` : "Nenhuma ocorrência nova: as despesas recorrentes já estão em dia.");
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Contas a Pagar</h1>
          <p className="text-sm text-slate-500">Despesas do escritório, avulsas e recorrentes.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onGenerate} title="Gera as próximas ocorrências das despesas recorrentes (sem duplicar)">
              <RefreshCw className="h-4 w-4" /> Gerar recorrências
            </Button>
            <Button onClick={() => setForm({})}>
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Em aberto" value={formatBRL(kpi.open)} hint={`${kpi.openCount} conta(s) não paga(s)`} />
        <StatCard label="Vencido" tone="danger" value={formatBRL(kpi.overdue)} hint={kpi.overdueCount ? `${kpi.overdueCount} conta(s)` : undefined} />
        <StatCard label={`Vence em ${DUE_SOON_DAYS} dias`} tone="warning" value={formatBRL(kpi.soon)} hint={kpi.soonCount ? `${kpi.soonCount} conta(s)` : undefined} />
        <StatCard label="Pago (no filtro)" tone="success" value={formatBRL(kpi.paid)} />
      </div>

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Vencimento de"><Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></Field>
          <Field label="Vencimento até"><Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "" | ChargeStatus)}>
              <option value="">Todos</option>
              <option value="PENDENTE">Pendente</option>
              <option value="VENCIDO">Vencido</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
            </Select>
          </Field>
          <Field label="Fornecedor / descrição">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Pesquisar" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
          </Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma conta encontrada para este período"
            description={payables.length === 0 ? "Lance a primeira despesa do escritório." : "Ajuste os filtros para ver outras contas."}
            action={canWrite && payables.length === 0 ? <Button size="sm" onClick={() => setForm({})}>Nova conta</Button> : undefined}
          />
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}>
              <span>Descrição</span><span>Categoria</span><span>Fornecedor</span><span className="text-right">Valor</span><span>Vencimento</span><span>Pagamento</span><span>Recorrência</span><span>Status</span><span className="text-right">Ações</span>
            </div>
            <ul>
              {rows.map(({ p, st }) => (
                <li key={p.id} className={cn("grid gap-x-3 gap-y-1 border-b border-line px-3 py-3 text-[13px] last:border-0 md:items-center", COLS, st === "VENCIDO" && "bg-danger-soft/40")}>
                  <div className="min-w-0 truncate font-semibold text-navy">{p.description}</div>
                  <div><Badge tone="neutral">{p.category}</Badge></div>
                  <div className="truncate text-slate-700">{p.supplier}</div>
                  <div className="font-semibold md:text-right">{formatBRL(p.amountCents)}</div>
                  <div><span className="text-xs text-slate-500 md:hidden">Venc. </span>{formatDate(p.dueDate)}</div>
                  <div><span className="text-xs text-slate-500 md:hidden">Pago em </span>{formatDate(p.paidAt)}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-600">
                    {p.recurrence !== "NONE" && <Repeat className="h-3 w-3" />}
                    {RECURRENCE_LABEL[p.recurrence]}
                  </div>
                  <div><ChargeBadge status={st} /></div>
                  <div className="flex gap-1.5 md:justify-end">
                    {isOpen(st) && canWrite && (
                      <Button size="icon" variant="outline" aria-label={`Registrar pagamento de ${p.description}`} title="Registrar pagamento" onClick={() => setPayId(p.id)}>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </Button>
                    )}
                    <Button size="icon" variant="outline" aria-label={`Ver detalhes de ${p.description}`} title="Detalhes e histórico" onClick={() => setDetailId(p.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {st !== "CANCELADO" && canWrite && (
                      <Button size="icon" variant="outline" aria-label={`Editar ${p.description}`} title="Editar" onClick={() => setForm({ payable: p })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isOpen(st) && canWrite && (
                      <Button size="icon" variant="outline" aria-label={`Cancelar ${p.description}`} title="Cancelar conta" onClick={() => setCancelId(p.id)}>
                        <Ban className="h-4 w-4 text-danger" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="pt-3 text-xs text-slate-500">{rows.length} conta(s)</p>
          </div>
        )}
      </Card>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)} title={form?.payable ? "Editar conta" : "Nova conta a pagar"} description="Despesas recorrentes geram as próximas ocorrências automaticamente.">
        {form && <PayableForm payable={form.payable} onDone={() => setForm(null)} />}
      </Dialog>

      {payTarget && (
        <PayDialog
          open
          onClose={() => setPayId(null)}
          title="Registrar pagamento"
          amountCents={payTarget.amountCents}
          today={today}
          confirmLabel="Confirmar pagamento"
          lines={
            <>
              <div className="font-semibold text-navy">{payTarget.description}</div>
              <div className="text-xs text-slate-500">{payTarget.supplier} · venc. {formatDate(payTarget.dueDate)}</div>
            </>
          }
          onConfirm={async (opts) => {
            const res = await payPayable(payTarget.id, opts);
            if (!res.ok) { notify(res.error, "error"); return false; }
            notify(res.data.alreadyPaid ? "Esta conta já estava paga. Nada foi duplicado." : "Pagamento registrado com sucesso.");
            return true;
          }}
        />
      )}

      {cancelTarget && (
        <CancelDialog
          open
          onClose={() => setCancelId(null)}
          title="Cancelar conta?"
          description={`"${cancelTarget.description}" será cancelada e deixará de contar nos totais em aberto. O registro é mantido no histórico.`}
          onConfirm={async (reason) => {
            const res = await cancelPayable(cancelTarget.id, reason);
            if (!res.ok) { notify(res.error, "error"); return false; }
            notify("Conta cancelada.");
            return true;
          }}
        />
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailId(null)} title={detail?.description ?? "Conta"} description={detail?.supplier}>
        {detail && (
          <div className="space-y-4">
            <ChargeBadge status={chargeStatus(detail, today)} />
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">Categoria</dt><dd>{detail.category}</dd></div>
              <div><dt className="text-xs text-slate-500">Recorrência</dt><dd>{RECURRENCE_LABEL[detail.recurrence]}</dd></div>
              <div><dt className="text-xs text-slate-500">Valor</dt><dd className="font-semibold">{formatBRL(detail.amountCents)}</dd></div>
              <div><dt className="text-xs text-slate-500">Lançamento</dt><dd>{formatDate(detail.issueDate)}</dd></div>
              <div><dt className="text-xs text-slate-500">Vencimento</dt><dd>{formatDate(detail.dueDate)}</dd></div>
              <div><dt className="text-xs text-slate-500">Data do pagamento</dt><dd>{formatDate(detail.paidAt)}</dd></div>
              {detail.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Observações</dt><dd>{detail.notes}</dd></div>}
            </dl>
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-navy">Histórico</h3>
              <HistoryList items={detail.history} />
            </div>
          </div>
        )}
      </Dialog>
      
    </div>
  );
}
