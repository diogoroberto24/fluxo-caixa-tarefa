/** Tipos compartilhados dos relatórios (servidor gera, cliente exibe e exporta). */
import type { Permission } from "@/lib/permissions";

export type ReportType = "fluxo" | "receber" | "inadimplencia" | "pagar" | "tarefas";
export type CellValue = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  /** money = centavos inteiros. */
  kind: "text" | "date" | "money" | "int";
}

export interface ReportSummaryItem {
  label: string;
  value: number | string;
  kind: "money" | "int" | "text";
  tone?: "success" | "danger" | "warning";
}

export interface ReportData {
  type: ReportType;
  title: string;
  from: string;
  to: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, CellValue>[];
  summary: ReportSummaryItem[];
  /** Verdadeiro se o limite de linhas foi atingido (o período deve ser reduzido). */
  truncated: boolean;
}

export const REPORT_META: Record<ReportType, { label: string; description: string; needs: Permission[] }> = {
  fluxo: {
    label: "Fluxo de caixa mensal",
    description: "Previsto x realizado de recebimentos e pagamentos, mês a mês.",
    needs: ["report:view", "receivable:read", "payable:read"],
  },
  receber: {
    label: "Contas a receber",
    description: "Cobranças com vencimento no período, com situação de pagamento.",
    needs: ["report:view", "receivable:read"],
  },
  inadimplencia: {
    label: "Inadimplência",
    description: "Cobranças vencidas e não pagas, com dias de atraso.",
    needs: ["report:view", "receivable:read"],
  },
  pagar: {
    label: "Contas a pagar",
    description: "Despesas com vencimento no período, por categoria e fornecedor.",
    needs: ["report:view", "payable:read"],
  },
  tarefas: {
    label: "Tarefas",
    description: "Execuções com prazo no período, por cliente e responsável.",
    needs: ["report:view"],
  },
};

/** Intervalo máximo de um relatório (protege o servidor e o navegador). */
export const MAX_REPORT_DAYS = 731;
