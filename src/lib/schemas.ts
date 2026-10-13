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

export const clientSchema = z.object({
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
  taxRegime: z.enum(["MEI", "SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]),
  contractStart: isoDate("Informe a data de início do contrato."),
  modules: z
    .array(z.enum(["CONTABIL", "FISCAL", "FOLHA", "SOCIETARIO"]))
    .min(1, "Selecione ao menos um módulo."),
  monthlyFee: money,
  feeDueDay: z
    .string()
    .refine((v) => /^\d+$/.test(v) && +v >= 1 && +v <= 31, "Dia entre 1 e 31."),
  active: z.enum(["true", "false"]),
  notes: optional,
});
export type ClientFormValues = z.infer<typeof clientSchema>;

export const receivableSchema = z.object({
  clientId: required("Selecione o cliente."),
  description: required("Informe a descrição."),
  category: z.enum(["HONORARIOS", "OUTROS"]),
  competence: z.string().regex(/^\d{4}-\d{2}$/, "Informe a competência."),
  amount: money,
  dueDate: isoDate("Informe o vencimento."),
});
export type ReceivableFormValues = z.infer<typeof receivableSchema>;

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
