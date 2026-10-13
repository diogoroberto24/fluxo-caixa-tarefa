"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  getFeeHistoryAction,
  saveClientAction,
  setClientActiveAction,
} from "@/app/(app)/clientes/actions";
import {
  cancelPayableAction,
  cancelReceivableAction,
  createPayableAction,
  createReceivableAction,
  generateFeesAction,
  generateOccurrencesAction,
  payPayableAction,
  payReceivableAction,
  updatePayableAction,
  type PaymentOpts,
} from "@/app/(app)/financeiro/actions";
import {
  createTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from "@/app/(app)/tarefas/actions";
import type { ActionResult } from "@/lib/action-result";
import type { FeeHistoryEntry } from "@/lib/data/clients";
import type {
  ClientFormValues,
  PayableFormValues,
  ReceivableFormValues,
  TaskFormValues,
} from "@/lib/schemas";
import type {
  Client,
  FinancialCategory,
  Payable,
  Receivable,
  Task,
  User,
} from "@/types/domain";

/**
 * Estado do app.
 *  - Clientes, financeiro e tarefas: vêm do banco (props do layout, recarregadas após cada
 *    Server Action) e são alterados por Server Actions.
 *  - Tarefas: execuções do banco; a recorrência é gerada no banco ao concluir/cancelar.
 */

interface State {
  clients: Client[];
  receivables: Receivable[];
  payables: Payable[];
  tasks: Task[];
}

type Action =
  | { type: "setClients"; clients: Client[] }
  | { type: "setReceivables"; receivables: Receivable[] }
  | { type: "setPayables"; payables: Payable[] }
  | { type: "upsertClient"; client: Client }
  | { type: "upsertReceivable"; receivable: Receivable }
  | { type: "upsertPayable"; payable: Payable }
  | { type: "setTasks"; tasks: Task[] }
  | { type: "upsertTask"; task: Task };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [item, ...list];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setClients":
      return { ...state, clients: action.clients };
    case "setReceivables":
      return { ...state, receivables: action.receivables };
    case "setPayables":
      return { ...state, payables: action.payables };
    case "upsertClient":
      return { ...state, clients: upsert(state.clients, action.client) };
    case "upsertReceivable":
      return { ...state, receivables: upsert(state.receivables, action.receivable) };
    case "upsertPayable":
      return { ...state, payables: upsert(state.payables, action.payable) };
    case "setTasks":
      return { ...state, tasks: action.tasks };
    case "upsertTask":
      return { ...state, tasks: upsert(state.tasks, action.task) };
  }
}

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

type Result<T, F extends string = string> = Promise<ActionResult<T, F>>;

interface AppStore extends State {
  users: User[];
  categories: FinancialCategory[];
  today: string;
  currentUser: User;
  toasts: Toast[];
  notify: (message: string, tone?: Toast["tone"]) => void;
  // clientes
  saveClient: (id: string | null, values: ClientFormValues) => Result<Client, keyof ClientFormValues>;
  setClientActive: (id: string, active: boolean) => Result<Client>;
  loadFeeHistory: (clientId: string) => Result<FeeHistoryEntry[]>;
  // contas a receber
  createReceivable: (values: ReceivableFormValues) => Result<Receivable, keyof ReceivableFormValues>;
  payReceivable: (id: string, opts?: PaymentOpts) => Result<{ receivable: Receivable; alreadyPaid: boolean }>;
  cancelReceivable: (id: string, reason: string) => Result<Receivable>;
  generateFees: (competence: string | null) => Result<{ created: number }>;
  // contas a pagar
  createPayable: (values: PayableFormValues) => Result<{ id: string; payable: Payable | null }, keyof PayableFormValues>;
  updatePayable: (id: string, values: PayableFormValues) => Result<Payable, keyof PayableFormValues>;
  payPayable: (id: string, opts?: PaymentOpts) => Result<{ payable: Payable; alreadyPaid: boolean }>;
  cancelPayable: (id: string, reason: string) => Result<Payable>;
  generateOccurrences: () => Result<{ created: number }>;
  // tarefas
  createTask: (values: TaskFormValues) => Result<Task, keyof TaskFormValues>;
  updateTask: (id: string, values: TaskFormValues) => Result<Task, keyof TaskFormValues>;
  setTaskStatus: (
    id: string,
    status: "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA",
    opts?: { notes?: string; stopSeries?: boolean },
  ) => Result<{ task: Task; unchanged: boolean; nextCreated: boolean }>;
}

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({
  today,
  currentUser,
  users,
  categories,
  initialClients,
  initialReceivables,
  initialPayables,
  initialTasks,
  children,
}: {
  today: string;
  currentUser: User;
  users: User[];
  categories: FinancialCategory[];
  initialClients: Client[];
  initialReceivables: Receivable[];
  initialPayables: Payable[];
  initialTasks: Task[];
  children: ReactNode;
}) {
  const [data, dispatch] = useReducer(
    reducer,
    undefined,
    (): State => ({
      clients: initialClients,
      receivables: initialReceivables,
      payables: initialPayables,
      tasks: initialTasks,
    }),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Após cada Server Action o layout é revalidado: mantém o estado igual ao banco.
  useEffect(() => dispatch({ type: "setClients", clients: initialClients }), [initialClients]);
  useEffect(() => dispatch({ type: "setReceivables", receivables: initialReceivables }), [initialReceivables]);
  useEffect(() => dispatch({ type: "setPayables", payables: initialPayables }), [initialPayables]);
  useEffect(() => dispatch({ type: "setTasks", tasks: initialTasks }), [initialTasks]);

  const notify = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const value = useMemo<AppStore>(() => {
    return {
      ...data,
      users,
      categories,
      today,
      currentUser,
      toasts,
      notify,
      saveClient: async (id, values) => {
        const r = await saveClientAction(id, values);
        if (r.ok) dispatch({ type: "upsertClient", client: r.data });
        return r;
      },
      setClientActive: async (id, active) => {
        const r = await setClientActiveAction(id, active);
        if (r.ok) dispatch({ type: "upsertClient", client: r.data });
        return r;
      },
      loadFeeHistory: (clientId) => getFeeHistoryAction(clientId),

      createReceivable: async (values) => {
        const r = await createReceivableAction(values);
        if (r.ok) dispatch({ type: "upsertReceivable", receivable: r.data });
        return r;
      },
      payReceivable: async (id, opts) => {
        const r = await payReceivableAction(id, opts);
        if (r.ok) dispatch({ type: "upsertReceivable", receivable: r.data.receivable });
        return r;
      },
      cancelReceivable: async (id, reason) => {
        const r = await cancelReceivableAction(id, reason);
        if (r.ok) dispatch({ type: "upsertReceivable", receivable: r.data });
        return r;
      },
      generateFees: (competence) => generateFeesAction(competence),

      createPayable: async (values) => {
        const r = await createPayableAction(values);
        if (r.ok && r.data.payable) dispatch({ type: "upsertPayable", payable: r.data.payable });
        return r;
      },
      updatePayable: async (id, values) => {
        const r = await updatePayableAction(id, values);
        if (r.ok) dispatch({ type: "upsertPayable", payable: r.data });
        return r;
      },
      payPayable: async (id, opts) => {
        const r = await payPayableAction(id, opts);
        if (r.ok) dispatch({ type: "upsertPayable", payable: r.data.payable });
        return r;
      },
      cancelPayable: async (id, reason) => {
        const r = await cancelPayableAction(id, reason);
        if (r.ok) dispatch({ type: "upsertPayable", payable: r.data });
        return r;
      },
      generateOccurrences: () => generateOccurrencesAction(),

      createTask: async (values) => {
        const r = await createTaskAction(values);
        if (r.ok) dispatch({ type: "upsertTask", task: r.data });
        return r;
      },
      updateTask: async (id, values) => {
        const r = await updateTaskAction(id, values);
        if (r.ok) dispatch({ type: "upsertTask", task: r.data });
        return r;
      },
      setTaskStatus: async (id, status, opts) => {
        const r = await setTaskStatusAction(id, status, opts);
        if (r.ok) dispatch({ type: "upsertTask", task: r.data.task });
        return r;
      },
    };
  }, [data, users, categories, today, currentUser, toasts, notify]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore deve ser usado dentro de AppStoreProvider");
  return ctx;
}
