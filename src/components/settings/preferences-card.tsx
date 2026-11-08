"use client";

import { Loader2, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { setSplitPayablesAction } from "@/app/(app)/configuracoes/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Preferências do sistema que o administrador liga e desliga. */
export function PreferencesCard() {
  const { splitPayables, notify } = useAppStore();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !splitPayables;
    const r = await setSplitPayablesAction(next);
    setSaving(false);
    if (!r.ok) return notify(r.error, "error");
    notify(next ? "Separação Empresa / Pessoal ligada." : "Separação Empresa / Pessoal desligada.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[16px]">
          <SlidersHorizontal className="h-5 w-5 text-navy" strokeWidth={1.8} /> Preferências
        </CardTitle>
      </CardHeader>
      <div className="flex items-start justify-between gap-6 px-5 pb-5">
        <div className="min-w-0">
          <p id="split-payables-label" className="text-sm font-semibold text-navy">
            Separar contas a pagar em Empresa e Pessoal
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Cada conta a pagar passa a ter o tipo Empresa ou Pessoal, com um filtro na tela de Contas a Pagar.
            As contas já lançadas começam como Empresa e podem ser alteradas na edição. Ao desligar, nada é apagado.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={splitPayables}
          aria-labelledby="split-payables-label"
          disabled={saving}
          onClick={toggle}
          className={cn(
            "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60",
            splitPayables ? "bg-primary" : "bg-slate-300",
          )}
        >
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform",
              splitPayables ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          </span>
        </button>
      </div>
    </Card>
  );
}
