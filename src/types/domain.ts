/**
 * Modelos de domínio. Datas são strings ISO "YYYY-MM-DD", competências "YYYY-MM"
 * e valores monetários são inteiros em centavos (no banco serão `Decimal`).
 * Estes tipos espelham as entidades que serão criadas no Prisma (Etapa 2).
 */

export type Role = "ADMIN" | "CONTADOR" | "FINANCEIRO" | "OPERADOR";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type ServiceModule = "CONTABIL" | "FISCAL" | "FOLHA" | "SOCIETARIO";

export type TaxRegime =
  | "MEI"
  | "SIMPLES_NACIONAL"
  | "LUCRO_PRESUMIDO"
  | "LUCRO_REAL";

export interface Address {
  zip: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

export interface Client {
  id: string;
  legalName: string;
  tradeName: string;
  /** Somente dígitos (CPF ou CNPJ). */
  document: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  address: Address;
  phone: string;
  email: string;
  taxRegime: TaxRegime;
  contractStart: string;
  modules: ServiceModule[];
  monthlyFeeCents: number;
  feeDueDay: number;
  active: boolean;
  notes?: string;
  isDemo: boolean;
}

export type ReceivableCategory = "HONORARIOS" | "OUTROS";
export type Recurrence = "NONE" | "MENSAL" | "SEMESTRAL" | "ANUAL";

export interface HistoryEntry {
  at: string;
  text: string;
}

export interface Receivable {
  id: string;
  clientId: string;
  description: string;
  category: ReceivableCategory;
  /** Competência "YYYY-MM". */
  competence: string;
  amountCents: number;
  dueDate: string;
  paidAt?: string;
  paidAmountCents?: number;
  notes?: string;
  canceled: boolean;
  history: HistoryEntry[];
  isDemo: boolean;
}

export interface FinancialCategory {
  id: string;
  name: string;
}

export interface Payable {
  id: string;
  description: string;
  /** Nome da categoria (categoryId aponta para financial_categories). */
  category: string;
  categoryId: string;
  supplier: string;
  amountCents: number;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  paidAmountCents?: number;
  /** Vem da regra de recorrência (NONE = avulsa). */
  recurrence: Recurrence;
  notes?: string;
  canceled: boolean;
  history: HistoryEntry[];
  isDemo: boolean;
}

export type TaskStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";

/** Uma ocorrência (execução) de uma tarefa. O histórico de um cliente/tarefa é a lista de execuções. */
export interface Task {
  id: string;
  /** Definição (o "o que fazer"); todas as execuções recorrentes compartilham o mesmo id. */
  definitionId: string;
  clientId: string;
  title: string;
  description?: string;
  category: string;
  createdAt: string;
  dueDate: string;
  status: TaskStatus;
  /** Derivada: data da última execução concluída desta tarefa (qualquer ocorrência). */
  lastDoneAt?: string;
  completedAt?: string;
  completionNotes?: string;
  notes?: string;
  assigneeId?: string;
  recurrence: Recurrence;
  isDemo: boolean;
}

/** Status exibido: derivado de datas e pagamento, nunca digitado. */
export type ChargeStatus = "PENDENTE" | "PAGO" | "VENCIDO" | "CANCELADO";
