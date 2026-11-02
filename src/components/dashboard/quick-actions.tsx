"use client";

import { HandCoins, ListChecks, Receipt, UserPlus, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ClientForm } from "@/components/forms/client-form";
import { PayableForm } from "@/components/forms/payable-form";
import { ReceivableForm } from "@/components/forms/receivable-form";
import { TaskForm } from "@/components/forms/task-form";
import { useAppStore } from "@/components/providers/app-store";
import { Dialog } from "@/components/ui/dialog";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Kind = "client" | "receivable" | "payable" | "task";

const ACTIONS: { kind: Kind; label: string; icon: LucideIcon; tone: string; permission: Permission }[] = [
  { kind: "task", label: "Nova tarefa", icon: ListChecks, tone: "bg-primary-soft text-primary", permission: "task:write" },
  { kind: "receivable", label: "Novo recebimento", icon: HandCoins, tone: "bg-success-soft text-success", permission: "receivable:write" },
  { kind: "payable", label: "Nova conta a pagar", icon: Receipt, tone: "bg-danger-soft text-danger", permission: "payable:write" },
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
  const { currentUser } = useAppStore();
  const [kind, setKind] = useState<Kind | null>(null);
  const allowed = ACTIONS.filter((a) => can(currentUser.role, a.permission));
  if (allowed.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Ações rápidas">
      {allowed.map(({ kind: k, label, icon: Icon, tone }) => (
        <button
          key={k}
          type="button"
          onClick={() => setKind(k)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white pl-1.5 pr-3 text-[13px] font-medium text-navy shadow-sm transition-colors hover:bg-surface"
        >
          <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", tone)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          {label}
        </button>
      ))}

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
    </div>
  );
}
