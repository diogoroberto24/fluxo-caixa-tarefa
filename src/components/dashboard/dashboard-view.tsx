"use client";

import { useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { CashFlowChart } from "./cash-flow-chart";
import { ClientContext } from "./client-context";
import { FeeHistoryDialog } from "./fee-history-dialog";
import { QuickActions } from "./quick-actions";
import { SummaryCards } from "./summary-cards";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TasksPanel } from "./tasks-panel";

/** Tela de início: tarefas primeiro (o que fazer hoje); embaixo, contas a receber/pagar e o fluxo de caixa. */
export function DashboardView() {
  const { currentUser } = useAppStore();
  const [clientId, setClientId] = useState<string | null>(null);
  const [feeClientId, setFeeClientId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[26px] font-bold leading-9 text-navy">
            Olá, {currentUser.name.split(" ")[0]}!
          </h1>
          <p className="text-sm text-slate-500">Estas são as suas tarefas e a sua movimentação de hoje.</p>
        </div>
        <QuickActions selectedClientId={clientId} onClientCreated={setClientId} />
      </div>

      {clientId && (
        <ClientContext
          clientId={clientId}
          onClear={() => setClientId(null)}
          onOpenFees={setFeeClientId}
        />
      )}

      <TasksPanel clientId={clientId} onSelectClient={setClientId} onOpenTask={setTaskId} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
        <SummaryCards stacked />
        <CashFlowChart />
      </div>

      <FeeHistoryDialog clientId={feeClientId} onClose={() => setFeeClientId(null)} />
      <TaskDetailDialog taskId={taskId} onClose={() => setTaskId(null)} />
    </div>
  );
}
