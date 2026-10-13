"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const colors = {
    neutral: "text-navy",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  } as const;
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", colors[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const METHODS = ["PIX", "Transferência", "Boleto", "Cartão", "Dinheiro", "Outro"];

/** Confirmação de pagamento/recebimento com data e forma. O botão fica bloqueado durante o envio. */
export function PayDialog({
  open,
  onClose,
  title,
  lines,
  amountCents,
  today,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lines: ReactNode;
  amountCents: number;
  today: string;
  confirmLabel: string;
  onConfirm: (opts: { paidOn: string; method: string }) => Promise<boolean>;
}) {
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("PIX");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const done = await onConfirm({ paidOn, method });
    setBusy(false);
    if (done) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()} title={title}>
      <div className="space-y-4">
        <div className="rounded-lg bg-surface p-3 text-sm">
          {lines}
          <div className="mt-2 text-lg font-bold text-navy">{formatBRL(amountCents)}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data do pagamento *">
            <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Forma de pagamento">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="success" onClick={submit} disabled={busy || !paidOn}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Confirmação de cancelamento (ação destrutiva) com motivo opcional. */
export function CancelDialog({
  open,
  onClose,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const done = await onConfirm(reason);
    setBusy(false);
    if (done) {
      setReason("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{description}</p>
        <Field label="Motivo (opcional)">
          <Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar cancelamento
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Lista do histórico de alterações de uma cobrança ou conta. */
export function HistoryList({ items }: { items: { at: string; text: string }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((h, i) => (
        <li key={i} className="text-xs">
          <span className="font-medium">{h.at.split("-").reverse().join("/")}</span> — {h.text}
        </li>
      ))}
    </ul>
  );
}
