import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { isValidDocument, onlyDigits } from "@/lib/validators";

const required = (msg: string) => z.string().trim().min(1, msg);
const optional = z.string().trim().optional();
const isoDate = (msg: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const money = z
  .string()
  .trim()
  .min(1, "Informe o valor.")
  .refine((v) => {
    const c = parseMoneyToCents(v);
    return c !== null && c > 0;
  }, "Informe um valor válido maior que zero (ex.: 1.234,56).");

export const recurrenceValues = ["NONE", "MENSAL", "SEMESTRAL", "ANUAL"] as const;

const clientBase = z.object({
  kind: z.enum(["FIXO", "EVENTUAL"]),
  legalName: required("Informe a razão social."),
  tradeName: required("Informe o nome fantasia."),
  document: z
    .string()
    .trim()
    .refine((v) => isValidDocument(v), "CPF ou CNPJ inválido."),
  stateRegistration: optional,
  municipalRegistration: optional,
  zip: z
    .string()
    .trim()
    .refine((v) => onlyDigits(v).length === 8, "CEP deve ter 8 dígitos."),
  street: required("Informe o logradouro."),
  number: required("Informe o número."),
  complement: optional,
  district: required("Informe o bairro."),
  city: required("Informe a cidade."),
  state: z
    .string()
    .trim()
    .length(2, "Use a sigla da UF (ex.: PR).")
    .transform((v) => v.toUpperCase()),
  phone: z
    .string()
    .trim()
    .refine((v) => [10, 11].includes(onlyDigits(v).length), "Telefone inválido."),
  email: z.string().trim().email("E-mail inválido."),
  taxRegime: z.enum(["MEI", "SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "PESSOA_FISICA"]),
  contractStart: isoDate("Informe a data de início do contrato."),
  modules: z
    .array(z.enum(["CONTABIL", "FISCAL", "FOLHA", "SOCIETARIO"]))
    .min(1, "Selecione ao menos um módulo."),
  // Cliente FIXO: honorários mensais (obrigatórios só para FIXO; validados abaixo)
  monthlyFee: z.string().trim().optional(),
  feeDueDay: z.string().optional(),
  // Cliente EVENTUAL: serviço avulso (obrigatório só ao cadastrar; validado abaixo)
  serviceDescription: z.string().trim().optional(),
  serviceTotal: z.string().trim().optional(),
  installments: z.string().optional(),
  firstDueDate: z.string().optional(),
  active: z.enum(["true", "false"]),
  notes: optional,
});
export type ClientFormValues = z.infer<typeof clientBase>;

/** Número máximo de parcelas do serviço avulso (1 = à vista). */
export const MAX_INSTALLMENTS = 5;

const fail = (ctx: z.RefinementCtx, path: string, message: string) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

/** Cliente FIXO: mesmas regras de sempre para honorários e vencimento. */
function checkFixed(v: ClientFormValues, ctx: z.RefinementCtx) {
  if (v.kind !== "FIXO") return;
  const fee = (v.monthlyFee ?? "").trim();
  if (!fee) fail(ctx, "monthlyFee", "Informe o valor.");
  else {
    const c = parseMoneyToCents(fee);
    if (c === null || c <= 0) fail(ctx, "monthlyFee", "Informe um valor válido maior que zero (ex.: 1.234,56).");
  }
  const day = v.feeDueDay ?? "";
  if (!(/^\d+$/.test(day) && +day >= 1 && +day <= 31)) fail(ctx, "feeDueDay", "Dia entre 1 e 31.");
}

/** Cliente EVENTUAL novo: serviço, valor, parcelas e primeiro vencimento. */
function checkPlan(v: ClientFormValues, ctx: z.RefinementCtx) {
  if (v.kind !== "EVENTUAL") return;
  if (!(v.serviceDescription ?? "").trim()) fail(ctx, "serviceDescription", "Informe a descrição do serviço.");
  const totalText = (v.serviceTotal ?? "").trim();
  const total = parseMoneyToCents(totalText);
  const n = Number(v.installments);
  if (!totalText) fail(ctx, "serviceTotal", "Informe o valor do serviço.");
  else if (total === null || total <= 0) fail(ctx, "serviceTotal", "Informe um valor válido maior que zero (ex.: 1.234,56).");
  if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) fail(ctx, "installments", "Escolha de 1 a 5 parcelas.");
  else if (total !== null && total > 0 && total < n) fail(ctx, "serviceTotal", "Valor muito baixo para o número de parcelas.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.firstDueDate ?? "")) fail(ctx, "firstDueDate", "Informe a data de vencimento.");
}

/** Edição de cliente (o serviço avulso é gerenciado em Contas a Receber). */
export const clientSchema = clientBase.superRefine(checkFixed);
/** Cadastro de cliente. */
export const clientCreateSchema = clientBase.superRefine((v, ctx) => {
  checkFixed(v, ctx);
  checkPlan(v, ctx);
});

export const receivableSchema = z.object({
  clientId: required("Selecione o cliente."),
  description: required("Informe a descrição."),
  category: z.enum(["HONORARIOS", "OUTROS"]),
  competence: z.string().regex(/^\d{4}-\d{2}$/, "Informe a competência."),
  amount: money,
  dueDate: isoDate("Informe o vencimento."),
  /** Parcelas do serviço avulso: "1" = à vista. Honorários nunca são parcelados. */
  installments: z.string().optional(),
}).superRefine((v, ctx) => {
  const n = Number(v.installments ?? "1");
  if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) fail(ctx, "installments", "Escolha de 1 a 5 parcelas.");
  else if (n > 1 && v.category === "HONORARIOS") fail(ctx, "installments", "Honorários mensais não são parcelados.");
});
export type ReceivableFormValues = z.infer<typeof receivableSchema>;

/** Serviço avulso (novo ou editado): descrição, valor total, parcelas (1 = à vista) e 1º vencimento. */
export const serviceSchema = z
  .object({
    description: required("Informe a descrição do serviço."),
    total: z.string().trim().min(1, "Informe o valor do serviço."),
    installments: z.string(),
    firstDueDate: isoDate("Informe a data de vencimento."),
  })
  .superRefine((v, ctx) => {
    const cents = parseMoneyToCents(v.total);
    const n = Number(v.installments);
    if (v.total && (cents === null || cents <= 0)) fail(ctx, "total", "Informe um valor válido maior que zero (ex.: 1.234,56).");
    if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) fail(ctx, "installments", "Escolha de 1 a 5 parcelas.");
    else if (cents !== null && cents > 0 && cents < n) fail(ctx, "total", "Valor muito baixo para o número de parcelas.");
  });
export type ServiceFormValues = z.infer<typeof serviceSchema>;

export const payableSchema = z.object({
  description: required("Informe a descrição."),
  categoryId: required("Selecione a categoria."),
  supplier: required("Informe o fornecedor ou beneficiário."),
  amount: money,
  issueDate: isoDate("Informe a data de lançamento."),
  dueDate: isoDate("Informe o vencimento."),
  recurrence: z.enum(recurrenceValues),
  notes: optional,
});
export type PayableFormValues = z.infer<typeof payableSchema>;

export const taskSchema = z.object({
  clientId: required("Selecione o cliente."),
  title: required("Informe o nome da tarefa."),
  category: required("Selecione a categoria."),
  description: optional,
  dueDate: isoDate("Informe o prazo."),
  assigneeId: optional,
  recurrence: z.enum(recurrenceValues),
  notes: optional,
});
export type TaskFormValues = z.infer<typeof taskSchema>;
