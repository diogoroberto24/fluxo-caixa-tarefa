"use client";

import { Eye, Pencil, Plus, Power, Search, SearchX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { ClientForm } from "@/components/forms/client-form";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBRL, formatDocument } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { MODULE_LABEL, searchClients, TAX_REGIME_LABEL } from "@/services/clients";
import type { Client } from "@/types/domain";
import { ClientDetailDialog } from "./client-detail-dialog";

type StatusFilter = "TODOS" | "ATIVOS" | "INATIVOS";
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "ATIVOS", label: "Ativos" },
  { value: "INATIVOS", label: "Inativos" },
];

const COLS = "md:grid-cols-[1.6fr_1.1fr_1fr_1.4fr_1fr_0.7fr_150px]";

export function ClientsView() {
  const { clients, currentUser, setClientActive, notify } = useAppStore();
  const canWrite = can(currentUser.role, "client:write");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ATIVOS");
  const [form, setForm] = useState<{ client?: Client } | null>(null);
  const [detail, setDetail] = useState<Client | null>(null);
  const [confirm, setConfirm] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const found = searchClients(clients, query);
    return found.filter((c) =>
      status === "TODOS" ? true : status === "ATIVOS" ? c.active : !c.active,
    );
  }, [clients, query, status]);

  // Mantém o detalhe aberto sincronizado com o estado (após editar/inativar).
  const detailLive = detail ? (clients.find((c) => c.id === detail.id) ?? detail) : null;

  async function toggleActive(c: Client) {
    setBusy(true);
    const result = await setClientActive(c.id, !c.active);
    setBusy(false);
    if (result.ok) {
      notify(
        c.active
          ? `Cliente "${c.tradeName}" inativado. O histórico financeiro e as tarefas foram mantidos.`
          : `Cliente "${c.tradeName}" reativado.`,
      );
      setConfirm(null);
    } else {
      notify(result.error, "error");
    }
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Clientes</h1>
          <p className="text-sm text-slate-500">Cadastro, consulta e situação dos clientes do escritório.</p>
        </div>
        {canWrite && (
          <Button onClick={() => setForm({})}>
            <Plus className="h-4 w-4" /> Novo cliente
          </Button>
        )}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <label className="flex h-10 min-w-[240px] flex-1 items-center gap-3 rounded-md border border-line px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por razão social, fantasia, CNPJ/CPF ou IE"
              aria-label="Buscar clientes"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="flex gap-2" role="tablist" aria-label="Situação">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={status === f.value}
                onClick={() => setStatus(f.value)}
                className={cn(
                  "h-8 rounded-full px-4 text-xs transition-colors",
                  status === f.value ? "bg-navy font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={clients.length === 0 ? Users : SearchX}
            title={clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
            description={
              clients.length === 0
                ? "Cadastre o primeiro cliente para começar."
                : "Ajuste a busca ou o filtro de situação."
            }
            action={
              clients.length === 0 && canWrite ? (
                <Button size="sm" onClick={() => setForm({})}>
                  <Plus className="h-4 w-4" /> Novo cliente
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", COLS)}>
              <span>Cliente</span><span>CNPJ / CPF</span><span>Regime</span><span>Módulos</span><span>Honorários</span><span>Situação</span><span className="text-right">Ações</span>
            </div>
            <ul>
              {rows.map((c) => (
                <li key={c.id} className={cn("grid gap-x-3 gap-y-2 border-b border-line px-3 py-3 text-[13px] last:border-0 md:items-center", COLS, !c.active && "bg-slate-50/60")}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setDetail(c)} className="truncate font-semibold text-navy hover:underline">
                        {c.tradeName}
                      </button>
                      {c.isDemo && <Badge tone="warning">Demo</Badge>}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">{c.legalName}</div>
                  </div>
                  <div className="text-xs md:text-[13px]">{formatDocument(c.document)}</div>
                  <div className="text-xs md:text-[13px]">{TAX_REGIME_LABEL[c.taxRegime]}</div>
                  <div className="flex flex-wrap gap-1">
                    {c.modules.map((m) => (
                      <Badge key={m} tone="info">{MODULE_LABEL[m].split(" ")[0]}</Badge>
                    ))}
                  </div>
                  <div className="font-semibold">
                    {formatBRL(c.monthlyFeeCents)}
                    <span className="block text-[11px] font-normal text-slate-500">vence dia {c.feeDueDay}</span>
                  </div>
                  <div><Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Ativo" : "Inativo"}</Badge></div>
                  <div className="flex gap-1.5 md:justify-end">
                    <Button size="icon" variant="outline" aria-label={`Ver detalhes de ${c.tradeName}`} title="Ver detalhes" onClick={() => setDetail(c)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button size="icon" variant="outline" aria-label={`Editar ${c.tradeName}`} title="Editar" onClick={() => setForm({ client: c })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={c.active ? `Inativar ${c.tradeName}` : `Reativar ${c.tradeName}`}
                          title={c.active ? "Inativar" : "Reativar"}
                          onClick={() => setConfirm(c)}
                        >
                          <Power className={cn("h-4 w-4", c.active ? "text-danger" : "text-success")} />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="pt-3 text-xs text-slate-500">
              {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
            </p>
          </div>
        )}
      </Card>

      <Dialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        size="lg"
        title={form?.client ? `Editar — ${form.client.tradeName}` : "Novo cliente"}
        description="Campos marcados com * são obrigatórios."
      >
        {form && <ClientForm client={form.client} onDone={() => setForm(null)} />}
      </Dialog>

      <ClientDetailDialog client={detailLive} onClose={() => setDetail(null)} />

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.active ? "Inativar cliente?" : "Reativar cliente?"}
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {confirm.active
                ? `"${confirm.tradeName}" deixará de aparecer nas listas de ativos. O histórico financeiro e as tarefas serão mantidos, e você pode reativá-lo quando quiser.`
                : `"${confirm.tradeName}" voltará a aparecer como cliente ativo.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Cancelar</Button>
              <Button variant={confirm.active ? "danger" : "success"} onClick={() => toggleActive(confirm)} disabled={busy}>
                {confirm.active ? "Inativar" : "Reativar"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
