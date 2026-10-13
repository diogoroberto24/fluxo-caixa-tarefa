"use client";

import { useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { ClientContext } from "./client-context";
import { ClientSearch } from "./client-search";
import { FeeHistoryDialog } from "./fee-history-dialog";
import { QuickActions } from "./quick-actions";
import { SummaryCards } from "./summary-cards";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TasksPanel } from "./tasks-panel";

export function DashboardView() {
  const { currentUser } = useAppStore();
  const [clientId, setClientId] = useState<string | null>(null);
  const [feeClientId, setFeeClientId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <div>
        <h1 className="text-[26px] font-bold leading-9 text-navy">
          Olá, {currentUser.name.split(" ")[0]}!
        </h1>
        <p className="text-sm text-slate-500">Aqui está um resumo da sua movimentação hoje.</p>
      </div>

      <SummaryCards />

      <ClientSearch selectedId={clientId} onSelect={setClientId} onOpenFees={setFeeClientId} />

      {clientId && (
        <ClientContext
          clientId={clientId}
          onClear={() => setClientId(null)}
          onOpenFees={setFeeClientId}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <TasksPanel clientId={clientId} onOpenTask={setTaskId} />
        <div className="xl:self-start">
          <QuickActions selectedClientId={clientId} onClientCreated={setClientId} />
        </div>
      </div>

      <FeeHistoryDialog clientId={feeClientId} onClose={() => setFeeClientId(null)} />
      <TaskDetailDialog taskId={taskId} onClose={() => setTaskId(null)} />
    </div>
  );
}
