"use client";

import {
  CalendarClock,
  Clock3,
  HandCoins,
  ListChecks,
  Receipt,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ClientForm } from "@/components/forms/client-form";
import { PayableForm } from "@/components/forms/payable-form";
import { ReceivableForm } from "@/components/forms/receivable-form";
import { TaskForm } from "@/components/forms/task-form";
import { useAppStore } from "@/components/providers/app-store";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { monthOf } from "@/lib/dates";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { isOpen, chargeStatus } from "@/services/finance";
import { isTaskOpen } from "@/services/tasks";

type Kind = "client" | "receivable" | "payable" | "task";

const ACTIONS: { kind: Kind; label: string; icon: LucideIcon; tone: string; permission: Permission }[] = [
  { kind: "receivable", label: "Novo recebimento", icon: HandCoins, tone: "bg-success-soft text-success", permission: "receivable:write" },
  { kind: "payable", label: "Nova conta a pagar", icon: Receipt, tone: "bg-danger-soft text-danger", permission: "payable:write" },
  { kind: "task", label: "Nova tarefa", icon: ListChecks, tone: "bg-primary-soft text-primary", permission: "task:write" },
  { kind: "client", label: "Novo cliente", icon: UserPlus, tone: "bg-violet-100 text-violet-700", permission: "client:write" },
];

const TITLES: Record<Kind, string> = {
  client: "Novo cliente",
  receivable: "Novo recebimento",
  payable: "Nova conta a pagar",
  task: "Nova tarefa",
};

export function QuickActions({
  selectedClientId,
  onClientCreated,
}: {
  selectedClientId: string | null;
  onClientCreated: (id: string) => void;
}) {
  const { currentUser, tasks, receivables, payables, today } = useAppStore();
  const [kind, setKind] = useState<Kind | null>(null);
  const allowed = ACTIONS.filter((a) => can(currentUser.role, a.permission));

  const day = useMemo(() => {
    const month = monthOf(today);
    return {
      tasks: tasks.filter((t) => isTaskOpen(t.status) && t.dueDate <= today).length,
      receivables: receivables.filter((r) => monthOf(r.dueDate) === month && isOpen(chargeStatus(r, today))).length,
      payables: payables.filter((p) => isOpen(chargeStatus(p, today)) && p.dueDate <= today).length,
    };
  }, [tasks, receivables, payables, today]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-primary-soft/70 px-5 py-3">
        <Zap className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-navy">Ações rápidas</h2>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {allowed.map(({ kind: k, label, icon: Icon, tone }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-3 text-left text-xs font-medium text-navy shadow-sm transition-colors hover:bg-surface"
            >
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", tone)}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {label}
            </button>
          ))}
        </div>

        <div className="mb-3 mt-5 flex items-center gap-2 text-[13px] font-semibold text-navy">
          <Clock3 className="h-4 w-4 text-slate-600" /> Resumo do Dia
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DayStat label="Tarefas até hoje" value={day.tasks} icon={ListChecks} tone="bg-success-soft text-success" />
          <DayStat label="Contas a receber" value={day.receivables} icon={HandCoins} tone="bg-success-soft text-success" />
          <DayStat label="Contas vencidas/hoje" value={day.payables} icon={CalendarClock} tone="bg-danger-soft text-danger" />
        </div>
      </div>

      <Dialog
        open={kind !== null}
        onOpenChange={(o) => !o && setKind(null)}
        size={kind === "client" ? "lg" : "md"}
        title={kind ? TITLES[kind] : ""}
        description={kind === "client" ? "Cadastre os dados do cliente e as condições do contrato." : undefined}
      >
        {kind === "client" && (
          <ClientForm
            onDone={(c) => {
              setKind(null);
              onClientCreated(c.id);
            }}
          />
        )}
        {kind === "receivable" && <ReceivableForm defaultClientId={selectedClientId} onDone={() => setKind(null)} />}
        {kind === "payable" && <PayableForm onDone={() => setKind(null)} />}
        {kind === "task" && <TaskForm defaultClientId={selectedClientId} onDone={() => setKind(null)} />}
      </Dialog>
    </Card>
  );
}

function DayStat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: string }) {
  return (
    <div className="relative rounded-lg border border-line bg-surface/60 p-3">
      <div className="text-[11px] leading-tight text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold text-navy">{value}</div>
      <span className={cn("absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-md", tone)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}
