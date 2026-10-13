import type { CellValue, ReportData } from "@/lib/reports";

/**
 * Neutraliza "injeção de fórmula" em planilhas: texto iniciado por = + - @ (ou tab/CR) vira texto literal.
 * Números reais não passam por aqui.
 */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function formatCell(kind: string, v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (kind === "money" && typeof v === "number") return (v / 100).toFixed(2).replace(".", ",");
  if (kind === "int" && typeof v === "number") return String(v);
  if (kind === "date" && typeof v === "string") return v.split("-").reverse().join("/");
  return safeText(String(v));
}

function escape(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** CSV no padrão brasileiro para Excel: separador ";", decimal ",", BOM UTF-8, quebras CRLF. */
export function reportToCsv(report: ReportData): string {
  const head = report.columns.map((c) => escape(safeText(c.label))).join(";");
  const lines = report.rows.map((row) =>
    report.columns.map((c) => escape(formatCell(c.kind, row[c.key] ?? null))).join(";"),
  );
  return "﻿" + [head, ...lines].join("\r\n") + "\r\n";
}

export function reportFileName(report: ReportData): string {
  return `relatorio-${report.type}-${report.from}_a_${report.to}.csv`;
}
