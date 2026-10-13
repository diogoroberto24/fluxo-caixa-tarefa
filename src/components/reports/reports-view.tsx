"use client";

import { AlertTriangle, Download, FileBarChart, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { runReportAction } from "@/app/(app)/relatorios/actions";
import { StatCard } from "@/components/finance/shared";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/fields";
import { reportFileName, reportToCsv } from "@/lib/csv";
import { addDays, addMonths, dateInMonth, monthOf } from "@/lib/dates";
import { formatBRL, formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { REPORT_META, type CellValue, type ReportColumn, type ReportData, type ReportType } from "@/lib/reports";
import { cn } from "@/lib/utils";

function defaultRange(type: ReportType, today: string): [string, string] {
  const m = monthOf(today);
  if (type === "fluxo") return [`${addMonths(m, -5)}-01`, dateInMonth(m, 31)];
  if (type === "inadimplencia") return [addDays(today, -365), today];
  return [`${m}-01`, dateInMonth(m, 31)];
}

function cell(col: ReportColumn, v: CellValue) {
  if (v === null || v === undefined || v === "") return "—";
  if (col.kind === "money" && typeof v === "number") return formatBRL(v);
  if (col.kind === "date" && typeof v === "string") return formatDate(v);
  return String(v);
}

const TONE = { success: "success", danger: "danger", warning: "warning" } as const;

export function ReportsView() {
  const { currentUser, today, notify } = useAppStore();
  const available = (Object.keys(REPORT_META) as ReportType[]).filter((t) =>
    REPORT_META[t].needs.every((p) => can(currentUser.role, p)),
  );
  const [type, setType] = useState<ReportType>(available[0] ?? "tarefas");
  const [[from, to], setRange] = useState<[string, string]>(() => defaultRange(available[0] ?? "tarefas", today));
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeType(t: ReportType) {
    setType(t);
    setRange(defaultRange(t, today));
    setReport(null);
    setError("");
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await runReportAction({ type, from, to });
    setBusy(false);
    if (r.ok) setReport(r.data);
    else { setReport(null); setError(r.error); }
  }

  function exportCsv() {
    if (!report) return;
    const blob = new Blob([reportToCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFileName(report);
    a.click();
    URL.revokeObjectURL(url);
    notify("Arquivo CSV gerado.");
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-navy">Relatórios</h1>
        <p className="text-sm text-slate-500">Consolidados por período, com exportação em CSV e PDF.</p>
      </div>

      <Card className="print:hidden">
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
          <Field label="Relatório" hint={REPORT_META[type].description}>
            <Select value={type} onChange={(e) => changeType(e.target.value as ReportType)}>
              {available.map((t) => <option key={t} value={t}>{REPORT_META[t].label}</option>)}
            </Select>
          </Field>
          <Field label="De"><Input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} /></Field>
          <Field label="Até"><Input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} /></Field>
          <Button onClick={generate} disabled={busy || !from || !to}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />} Gerar relatório
          </Button>
        </div>
        {error && <p role="alert" className="px-5 pb-4 text-sm text-danger">{error}</p>}
      </Card>

      {!report && !error && (
        <Card className="print:hidden">
          <EmptyState icon={FileBarChart} title="Escolha o relatório e o período" description="Clique em “Gerar relatório” para ver os resultados." />
        </Card>
      )}

      {report && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-navy">{report.title}</h2>
              <p className="text-sm text-slate-500">
                Período: {formatDate(report.from)} a {formatDate(report.to)} · gerado em {formatDate(report.generatedAt)} · {report.rows.length} linha(s)
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" onClick={exportCsv} disabled={report.rows.length === 0}>
                <Download className="h-4 w-4" /> Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </Button>
            </div>
          </div>

          {report.truncated && (
            <p role="alert" className="flex items-center gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" /> O limite de linhas foi atingido: o resultado está incompleto. Reduza o período.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {report.summary.map((s) => (
              <StatCard
                key={s.label}
                label={s.label}
                tone={s.tone}
                value={s.kind === "money" ? formatBRL(Number(s.value)) : String(s.value)}
              />
            ))}
          </div>

          <Card className="overflow-hidden">
            {report.rows.length === 0 ? (
              <EmptyState icon={FileBarChart} title="Nenhum registro no período" description="Ajuste as datas e gere novamente." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-surface text-left text-xs font-medium text-slate-600">
                      {report.columns.map((c) => (
                        <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2", (c.kind === "money" || c.kind === "int") && "text-right")}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i} className="border-t border-line">
                        {report.columns.map((c) => (
                          <td key={c.key} className={cn("px-3 py-2", (c.kind === "money" || c.kind === "int") && "whitespace-nowrap text-right tabular-nums")}>{cell(c, row[c.key] ?? null)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
