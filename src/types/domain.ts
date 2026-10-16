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

/** FIXO: honorários mensais recorrentes. EVENTUAL: serviço avulso (à vista ou parcelado), sem mensalidade. */
export type ClientKind = "FIXO" | "EVENTUAL";

export type ServiceModule = "CONTABIL" | "FISCAL" | "FOLHA" | "SOCIETARIO";

export type TaxRegime =
  | "MEI"
  | "SIMPLES_NACIONAL"
  | "LUCRO_PRESUMIDO"
  | "LUCRO_REAL"
  | "PESSOA_FISICA";

export interface Address {
  zip: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

/** Representante legal da empresa (assina o contrato). Tudo opcional no cadastro; o contrato exige o que usar. */
export interface Representative {
  name: string;
  rg: string;
  /** Somente dígitos (CPF). */
  document: string;
  address: Address;
}

export interface Client {
  id: string;
  legalName: string;
  tradeName: string;
  /** Somente dígitos (CPF ou CNPJ). */
  document: string;
  /** RG (cliente pessoa física). */
  rg?: string;
  representative?: Representative;
  stateRegistration?: string;
  municipalRegistration?: string;
  address: Address;
  phone: string;
  email: string;
  taxRegime: TaxRegime;
  contractStart: string;
  modules: ServiceModule[];
  kind: ClientKind;
  /** Só para cliente FIXO (EVENTUAL guarda 0 / dia 1 e é ignorado). */
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
  /** Parcela i de N de um serviço avulso (ausente em cobranças comuns). */
  /** Identifica o serviço avulso (todas as parcelas do mesmo serviço compartilham o grupo). */
  installmentGroupId?: string;
  installmentNumber?: number;
  installmentTotal?: number;
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

/** Item do cadastro (catálogo) de tarefas do escritório. */
export interface TaskType {
  id: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
}

export type ContractAudience = "FIXO" | "EVENTUAL" | "TODOS";
export type ContractStatus = "EMITIDO" | "CANCELADO";
/** Tipo de pessoa a que o modelo se aplica: empresa (CNPJ), pessoa física (CPF) ou qualquer. */
export type ContractParty = "QUALQUER" | "PJ" | "PF";

/** Modelo de contrato com campos {{grupo.campo}}. */
export interface ContractTemplate {
  id: string;
  name: string;
  audience: ContractAudience;
  party: ContractParty;
  body: string;
  active: boolean;
}

/** Contrato emitido (o texto é uma cópia do momento da emissão). */
export interface Contract {
  id: string;
  number: string;
  clientId: string;
  templateName: string;
  issuedOn: string;
  status: ContractStatus;
  cancelReason?: string;
  /** Só no detalhe. */
  body?: string;
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
