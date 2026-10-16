"use client";

import { FileSignature, FilePlus2, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import type { OfficeData } from "@/lib/contracts";
import { formatDate } from "@/lib/format";
import { normalize } from "@/lib/utils";
import type { Contract, ContractTemplate } from "@/types/domain";
import { EmitContractDialog } from "./emit-dialog";
import { TemplatesDialog } from "./templates-dialog";

export function ContractsView({
  contracts,
  templates,
  office,
}: {
  contracts: Contract[];
  templates: ContractTemplate[];
  office: OfficeData;
}) {
  const { clients } = useAppStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [emitOpen, setEmitOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.tradeName])), [clients]);
  const rows = useMemo(() => {
    const q = normalize(query);
    return contracts.filter((c) => {
      if (status && c.status !== status) return false;
      if (q && !normalize(`${c.number} ${clientName.get(c.clientId) ?? ""} ${c.templateName}`).includes(q)) return false;
      return true;
    });
  }, [contracts, query, status, clientName]);

  const hasTemplates = templates.some((t) => t.active);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Contratos</h1>
          <p className="text-sm text-slate-500">Emissão de contratos de prestação de serviços para os clientes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTplOpen(true)}>
            <FileText className="h-4 w-4" /> Modelos de contrato
          </Button>
          <Button onClick={() => setEmitOpen(true)} disabled={!hasTemplates} title={hasTemplates ? undefined : "Cadastre um modelo de contrato primeiro"}>
            <FilePlus2 className="h-4 w-4" /> Emitir contrato
          </Button>
        </div>
      </div>

      {!hasTemplates && (
        <p role="status" className="rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          Nenhum modelo de contrato ativo. Cadastre o modelo do escritório em <strong>Modelos de contrato</strong> para poder emitir contratos.
        </p>
      )}
      {!office.legalName && (
        <p role="status" className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-slate-600">
          Os dados do escritório ainda não foram preenchidos. O administrador pode completá-los em{" "}
          <Link href="/configuracoes" className="font-semibold text-primary underline">Configurações</Link>.
        </p>
      )}

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[1fr_200px]">
          <Field label="Pesquisar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Número, cliente ou modelo" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="EMITIDO">Emitidos</option>
              <option value="CANCELADO">Cancelados</option>
            </Select>
          </Field>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={contracts.length === 0 ? "Nenhum contrato emitido" : "Nenhum contrato encontrado"}
            description={contracts.length === 0 ? "Escolha o cliente e o modelo em “Emitir contrato”." : "Ajuste a busca ou o filtro."}
          />
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className="hidden grid-cols-[110px_1.4fr_1.4fr_110px_110px_90px] gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid">
              <span>Número</span><span>Cliente</span><span>Modelo</span><span>Emissão</span><span>Situação</span><span />
            </div>
            <ul>
              {rows.map((c) => (
                <li key={c.id} className="grid gap-x-3 gap-y-1 border-b border-line px-3 py-3 text-[13px] last:border-0 md:grid-cols-[110px_1.4fr_1.4fr_110px_110px_90px] md:items-center">
                  <span className="font-semibold text-navy">{c.number}</span>
                  <span className="truncate font-medium">{clientName.get(c.clientId) ?? "Cliente removido"}</span>
                  <span className="truncate text-slate-600">{c.templateName}</span>
                  <span>{formatDate(c.issuedOn)}</span>
                  <span><Badge tone={c.status === "EMITIDO" ? "success" : "neutral"}>{c.status === "EMITIDO" ? "Emitido" : "Cancelado"}</Badge></span>
                  <span className="md:text-right">
                    <Link href={`/contratos/${c.id}`} className="font-semibold text-primary hover:underline" aria-label={`Abrir contrato ${c.number}`}>
                      Abrir
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
            <p className="pt-3 text-xs text-slate-500">{rows.length} contrato(s)</p>
          </div>
        )}
      </Card>

      <EmitContractDialog open={emitOpen} onClose={() => setEmitOpen(false)} templates={templates} office={office} />
      <TemplatesDialog open={tplOpen} onClose={() => setTplOpen(false)} templates={templates} />
    </div>
  );
}
