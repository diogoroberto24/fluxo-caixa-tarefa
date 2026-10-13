import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { ChargeStatus, TaskStatus } from "@/types/domain";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        info: "bg-primary-soft text-primary",
        neutral: "bg-slate-100 text-slate-600",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const CHARGE: Record<ChargeStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  PAGO: { label: "Pago", tone: "success" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  VENCIDO: { label: "Vencido", tone: "danger" },
  CANCELADO: { label: "Cancelado", tone: "neutral" },
};

export function ChargeBadge({ status }: { status: ChargeStatus }) {
  const c = CHARGE[status];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

const TASK: Record<TaskStatus, { label: string; tone: "success" | "warning" | "info" | "neutral" }> = {
  PENDENTE: { label: "Pendente", tone: "warning" },
  EM_ANDAMENTO: { label: "Em andamento", tone: "info" },
  CONCLUIDA: { label: "Concluída", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
};

export function TaskBadge({ status }: { status: TaskStatus }) {
  const c = TASK[status];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}
