"use client";

import { ChevronRight, SearchX, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge, ChargeBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAddress, formatBRL, formatDate, formatDocument } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchClients } from "@/services/clients";
import { clientFinancial, type ClientStanding } from "@/services/finance";

const STANDING: Record<ClientStanding, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  EM_DIA: { label: "Em dia", tone: "success" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  EM_ATRASO: { label: "Em atraso", tone: "danger" },
  INATIVO: { label: "Inativo", tone: "neutral" },
};

const PAGE = 6;
const COLS = "md:grid-cols-[1.5fr_1.05fr_1fr_1.55fr_1.2fr_0.9fr_0.8fr_24px]";

export function ClientSearch({
  selectedId,
  onSelect,
  onOpenFees,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenFees: (clientId: string) => void;
}) {
  const { clients, receivables, today } = useAppStore();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const results = useMemo(() => searchClients(clients, query), [clients, query]);
  const visible = showAll ? results : results.slice(0, PAGE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Users className="h-5 w-5 text-slate-600" strokeWidth={1.7} /> Clientes
        </CardTitle>
        <Link href="/clientes" className="text-xs font-semibold text-primary hover:underline">
          Ver todos os clientes →
        </Link>
      </CardHeader>

      <div className="px-5 pt-3">
        <label className="flex h-10 items-center gap-3 rounded-md border border-line px-3 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowAll(false);
            }}
            placeholder="Buscar por nome, CNPJ, IE, etc..."
            aria-label="Buscar clientes"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="px-5 pb-4 pt-3">
        {results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nenhum cliente encontrado"
            description="Verifique o nome, CNPJ/CPF ou inscrição estadual digitados."
          />
        ) : (
          <>
            <div
              className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}
              role="row"
            >
              <span>Cliente</span><span>CNPJ / CPF</span><span>Inscrição Estadual</span><span>Endereço</span><span>Honorários</span><span>Vencimento</span><span>Status</span><span />
            </div>
            <ul role="list">
              {visible.map((c) => {
                const fin = clientFinancial(c, receivables, today);
                const st = STANDING[fin.standing];
                const addr = formatAddress(c.address);
                const selected = selectedId === c.id;
                return (
                  <li key={c.id} className="border-b border-line last:border-0">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => onSelect(selected ? null : c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(selected ? null : c.id);
                        }
                      }}
                      className={cn(
                        "grid cursor-pointer gap-x-3 gap-y-1 px-3 py-3 text-[13px] outline-none transition-colors hover:bg-primary-soft/50 focus-visible:bg-primary-soft/60 md:items-center",
                        COLS,
                        selected && "bg-primary-soft",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-navy">{c.tradeName}</span>
                          {!c.active && <Badge>Inativo</Badge>}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{c.legalName}</div>
                      </div>
                      <div className="text-xs md:text-[13px]"><span className="text-slate-500 md:hidden">CNPJ/CPF: </span>{formatDocument(c.document)}</div>
                      <div className="text-xs md:text-[13px]"><span className="text-slate-500 md:hidden">IE: </span>{c.stateRegistration ?? "—"}</div>
                      <div className="text-xs leading-snug text-slate-600">{addr.line1}<br />{addr.line2}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFees(c.id);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          title="Ver histórico de honorários"
                          className="font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {formatBRL(c.monthlyFeeCents)}
                        </button>
                        {fin.currentStatus && <ChargeBadge status={fin.currentStatus} />}
                      </div>
                      <div className="text-xs md:text-[13px]"><span className="text-slate-500 md:hidden">Venc.: </span>{formatDate(fin.currentCharge?.dueDate)}</div>
                      <div><Badge tone={st.tone}>{st.label}</Badge></div>
                      <ChevronRight className="hidden h-4 w-4 text-slate-400 md:block" />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
              <span>{results.length} {results.length === 1 ? "cliente" : "clientes"}{query ? " encontrados" : ""}</span>
              {results.length > PAGE && (
                <button type="button" onClick={() => setShowAll((s) => !s)} className="font-semibold text-primary hover:underline">
                  {showAll ? "Mostrar menos" : `Mostrar todos (${results.length})`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
