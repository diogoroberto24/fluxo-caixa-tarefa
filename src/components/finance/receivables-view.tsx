"use client";

import {
  Ban,
  CheckCircle2,
  Eye,
  FileX2,
  HandCoins,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ReceivableForm } from "@/components/forms/receivable-form";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, ChargeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import { monthOf } from "@/lib/dates";
import { competenceLabel, formatBRL, formatDate, formatDocument, monthLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn, normalize } from "@/lib/utils";
import { chargeStatus, isOpen } from "@/services/finance";
import type { ChargeStatus, Receivable } from "@/types/domain";
import { CancelDialog, HistoryList, PayDialog, StatCard } from "./shared";

const COLS = "md:grid-cols-[1.4fr_1.5fr_0.8fr_0.8fr_0.9fr_0.9fr_0.9fr_0.8fr_120px]";
const CATEGORY_LABEL = { HONORARIOS: "Honorários", OUTROS: "Outros" } as const;

export function ReceivablesView() {
  const {
    receivables, clients, today, currentUser, notify,
    payReceivable, cancelReceivable, generateFees,
  } = useAppStore();
  const canWrite = can(currentUser.role, "receivable:write");
  const canPay = can(currentUser.role, "receivable:pay");

  const [competence, setCompetence] = useState(monthOf(today));
  const [clientId, setClientId] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [status, setStatus] = useState<"" | ChargeStatus>("");
  const [query, setQuery] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickId, setPickId] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const rows = useMemo(() => {
    const q = normalize(query);
    return receivables
      .map((r) => ({ r, client: clientById.get(r.clientId), st: chargeStatus(r, today) }))
      .filter(({ r, client, st }) => {
        if (competence && r.competence !== competence) return false;
        if (clientId && r.clientId !== clientId) return false;
        if (dueFrom && r.dueDate < dueFrom) return false;
        if (dueTo && r.dueDate > dueTo) return false;
        if (status && st !== status) return false;
        if (q) {
          const hay = normalize(`${client?.tradeName ?? ""} ${client?.legalName ?? ""} ${client?.document ?? ""} ${formatDocument(client?.document ?? "")} ${r.description}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.r.dueDate.localeCompare(b.r.dueDate));
  }, [receivables, clientById, competence, clientId, dueFrom, dueTo, status, query, today]);

  const kpi = useMemo(() => {
    const k = { total: 0, received: 0, pending: 0, overdue: 0, overdueCount: 0 };
    for (const { r, st } of rows) {
      if (st === "CANCELADO") continue;
      k.total += r.amountCents;
      if (st === "PAGO") k.received += r.paidAmountCents ?? r.amountCents;
      else if (st === "VENCIDO") { k.overdue += r.amountCents; k.overdueCount++; }
      else k.pending += r.amountCents;
    }
    return k;
  }, [rows]);

  const openCharges = useMemo(
    () => receivables.filter((r) => isOpen(chargeStatus(r, today))).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [receivables, today],
  );
  const payTarget = receivables.find((r) => r.id === payId) ?? null;
  const cancelTarget = receivables.find((r) => r.id === cancelId) ?? null;
  const detail = receivables.find((r) => r.id === detailId) ?? null;
  const paidHistory = useMemo(
    () => receivables.filter((r) => r.paidAt).sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "")),
    [receivables],
  );
  const nameOf = (id: string) => clientById.get(id)?.tradeName ?? "Cliente removido";

  async function onGenerate() {
    setGenerating(true);
    const comp = competence || monthOf(today);
    const r = await generateFees(comp);
    setGenerating(false);
    if (!r.ok) return notify(r.error, "error");
    notify(
      r.data.created > 0
        ? `${r.data.created} cobrança(s) de honorários geradas para ${monthLabel(comp)}.`
        : `Nenhuma cobrança nova: os honorários de ${monthLabel(comp)} já foram gerados para todos os clientes ativos.`,
    );
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Contas a Receber</h1>
          <p className="text-sm text-slate-500">Cobranças de honorários e outros recebimentos, por competência.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" /> Histórico de recebimentos
          </Button>
          {canWrite && (
            <Button variant="outline" onClick={onGenerate} disabled={generating} title="Cria as cobranças de honorários da competência filtrada para os clientes ativos (sem duplicar)">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Gerar honorários
            </Button>
          )}
          {canPay && (
            <Button variant="success" onClick={() => { setPickId(""); setPickOpen(true); }}>
              <CheckCircle2 className="h-4 w-4" /> Registrar pagamento
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Nova cobrança
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total das cobranças" value={formatBRL(kpi.total)} hint={competence ? monthLabel(competence) : "Todas as competências"} />
        <StatCard label="Recebido" tone="success" value={formatBRL(kpi.received)} hint={kpi.total ? `${Math.round((kpi.received / kpi.total) * 100)}% do total` : undefined} />
        <StatCard label="Pendente (a vencer)" tone="warning" value={formatBRL(kpi.pending)} />
        <StatCard label="Vencido" tone="danger" value={formatBRL(kpi.overdue)} hint={kpi.overdueCount ? `${kpi.overdueCount} cobrança(s)` : undefined} />
      </div>

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Competência" className="lg:col-span-1">
            <div className="flex gap-1">
              <Input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} />
              {competence && (
                <Button variant="outline" size="icon" aria-label="Todas as competências" title="Todas as competências" onClick={() => setCompetence("")}>
                  ×
                </Button>
              )}
            </div>
          </Field>
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.tradeName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vencimento de">
            <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
          </Field>
          <Field label="Vencimento até">
            <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
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
          <Field label="Pesquisar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Cliente, CNPJ, descrição" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Nenhuma cobrança encontrada para este período"
            description={receivables.length === 0 ? "Gere os honorários da competência ou lance uma nova cobrança." : "Ajuste os filtros para ver outras cobranças."}
            action={canWrite && receivables.length === 0 ? <Button size="sm" onClick={onGenerate} disabled={generating}>Gerar honorários</Button> : undefined}
          />
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}>
              <span>Cliente</span><span>Descrição</span><span>Categoria</span><span>Competência</span><span className="text-right">Valor</span><span>Vencimento</span><span>Pagamento</span><span>Status</span><span className="text-right">Ações</span>
            </div>
            <ul>
              {rows.map(({ r, client, st }) => (
                <li key={r.id} className={cn("grid gap-x-3 gap-y-1 border-b border-line px-3 py-3 text-[13px] last:border-0 md:items-center", COLS, st === "VENCIDO" && "bg-danger-soft/40")}>
                  <div className="min-w-0 font-semibold text-navy">
                    <span className="block truncate">{client?.tradeName ?? "Cliente removido"}</span>
                    {client && !client.active && <Badge className="mt-0.5">Inativo</Badge>}
                  </div>
                  <div className="truncate text-slate-700">{r.description}</div>
                  <div><Badge tone={r.category === "HONORARIOS" ? "info" : "neutral"}>{CATEGORY_LABEL[r.category]}</Badge></div>
                  <div>{competenceLabel(r.competence)}</div>
                  <div className="font-semibold md:text-right">{formatBRL(r.amountCents)}</div>
                  <div><span className="text-xs text-slate-500 md:hidden">Venc. </span>{formatDate(r.dueDate)}</div>
                  <div><span className="text-xs text-slate-500 md:hidden">Pago em </span>{formatDate(r.paidAt)}</div>
                  <div><ChargeBadge status={st} /></div>
                  <div className="flex gap-1.5 md:justify-end">
                    {isOpen(st) && canPay && (
                      <Button size="icon" variant="outline" aria-label={`Registrar pagamento de ${client?.tradeName ?? ""} ${competenceLabel(r.competence)}`} title="Registrar pagamento" onClick={() => setPayId(r.id)}>
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </Button>
                    )}
                    <Button size="icon" variant="outline" aria-label="Ver detalhes" title="Detalhes" onClick={() => setDetailId(r.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {st !== "PAGO" && st !== "CANCELADO" && canWrite && (
                      <Button size="icon" variant="outline" aria-label="Cancelar cobrança" title="Cancelar cobrança" onClick={() => setCancelId(r.id)}>
                        <Ban className="h-4 w-4 text-danger" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="pt-3 text-xs text-slate-500">{rows.length} cobrança(s)</p>
          </div>
        )}
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="Nova cobrança" description="Honorários (uma por cliente e competência) ou outros recebimentos.">
        {newOpen && <ReceivableForm defaultClientId={clientId || null} onDone={() => setNewOpen(false)} />}
      </Dialog>

      <Dialog open={pickOpen} onOpenChange={setPickOpen} title="Registrar pagamento" description="Escolha a cobrança em aberto que foi paga.">
        <div className="space-y-4">
          {openCharges.length === 0 ? (
            <EmptyState icon={FileX2} title="Nenhuma cobrança em aberto" />
          ) : (
            <Field label="Cobrança">
              <Select value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">Selecione…</option>
                {openCharges.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nameOf(r.clientId)} · {competenceLabel(r.competence)} · venc. {formatDate(r.dueDate)} · {formatBRL(r.amountCents)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex justify-end">
            <Button disabled={!pickId} onClick={() => { setPayId(pickId); setPickOpen(false); }}>Continuar</Button>
          </div>
        </div>
      </Dialog>

      {payTarget && (
        <PayDialog
          open
          onClose={() => setPayId(null)}
          title="Registrar pagamento"
          amountCents={payTarget.amountCents}
          today={today}
          confirmLabel="Confirmar recebimento"
          lines={
            <>
              <div className="font-semibold text-navy">{nameOf(payTarget.clientId)}</div>
              <div className="text-xs text-slate-500">{payTarget.description} · venc. {formatDate(payTarget.dueDate)}</div>
            </>
          }
          onConfirm={async (opts) => {
            const res = await payReceivable(payTarget.id, opts);
            if (!res.ok) { notify(res.error, "error"); return false; }
            notify(res.data.alreadyPaid ? "Este recebimento já estava registrado. Nada foi duplicado." : "Recebimento registrado com sucesso.");
            return true;
          }}
        />
      )}

      {cancelTarget && (
        <CancelDialog
          open
          onClose={() => setCancelId(null)}
          title="Cancelar cobrança?"
          description={`A cobrança "${cancelTarget.description}" de ${nameOf(cancelTarget.clientId)} será cancelada e deixará de contar nos totais. O registro é mantido no histórico.`}
          onConfirm={async (reason) => {
            const res = await cancelReceivable(cancelTarget.id, reason);
            if (!res.ok) { notify(res.error, "error"); return false; }
            notify("Cobrança cancelada.");
            return true;
          }}
        />
      )}

      <DetailDialog receivable={detail} client={detail ? nameOf(detail.clientId) : ""} today={today} onClose={() => setDetailId(null)} />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen} size="lg" title="Histórico de recebimentos" description="Recebimentos efetivamente registrados, do mais recente ao mais antigo.">
        {paidHistory.length === 0 ? (
          <EmptyState icon={History} title="Nenhum recebimento registrado" />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {paidHistory.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-navy">{nameOf(r.clientId)}</div>
                  <div className="text-xs text-slate-500">{r.description} · competência {competenceLabel(r.competence)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-success">{formatBRL(r.paidAmountCents ?? r.amountCents)}</div>
                  <div className="text-xs text-slate-500">{formatDate(r.paidAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

function DetailDialog({
  receivable: r,
  client,
  today,
  onClose,
}: {
  receivable: Receivable | null;
  client: string;
  today: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()} title={r ? `Cobrança — ${client}` : "Cobrança"} description={r?.description}>
      {r && (
        <div className="space-y-4">
          <ChargeBadge status={chargeStatus(r, today)} />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Categoria</dt><dd>{CATEGORY_LABEL[r.category]}</dd></div>
            <div><dt className="text-xs text-slate-500">Competência</dt><dd>{competenceLabel(r.competence)}</dd></div>
            <div><dt className="text-xs text-slate-500">Valor cobrado</dt><dd className="font-semibold">{formatBRL(r.amountCents)}</dd></div>
            <div><dt className="text-xs text-slate-500">Vencimento</dt><dd>{formatDate(r.dueDate)}</dd></div>
            <div><dt className="text-xs text-slate-500">Data do pagamento</dt><dd>{formatDate(r.paidAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Valor recebido</dt><dd>{r.paidAmountCents != null ? formatBRL(r.paidAmountCents) : "—"}</dd></div>
            {r.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Observações</dt><dd>{r.notes}</dd></div>}
          </dl>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-navy">Histórico de alterações</h3>
            <HistoryList items={r.history} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
