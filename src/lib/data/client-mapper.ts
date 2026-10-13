import { centsToInput, parseMoneyToCents } from "@/lib/money";
import type { ClientFormValues } from "@/lib/schemas";
import { onlyDigits } from "@/lib/validators";
import type { Client, ServiceModule, TaxRegime } from "@/types/domain";

export type ClientInput = Omit<Client, "id" | "isDemo">;

/** Linha da tabela public.clients como devolvida pelo PostgREST. */
export interface ClientRow {
  id: string;
  legal_name: string;
  trade_name: string;
  document: string;
  state_registration: string | null;
  municipal_registration: string | null;
  zip: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  tax_regime: string;
  contract_start: string;
  modules: string[];
  monthly_fee: number | string;
  fee_due_day: number;
  active: boolean;
  notes: string | null;
  is_demo: boolean;
}

export const CLIENT_COLUMNS =
  "id, legal_name, trade_name, document, state_registration, municipal_registration, zip, street, number, complement, district, city, state, phone, email, tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes, is_demo";

/** numeric(12,2) -> centavos inteiros, sem acumular erro de ponto flutuante. */
export function feeToCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

export function centsToFee(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function rowToClient(r: ClientRow): Client {
  return {
    id: r.id,
    legalName: r.legal_name,
    tradeName: r.trade_name,
    document: r.document,
    stateRegistration: r.state_registration ?? undefined,
    municipalRegistration: r.municipal_registration ?? undefined,
    address: {
      zip: r.zip,
      street: r.street,
      number: r.number,
      complement: r.complement ?? undefined,
      district: r.district,
      city: r.city,
      state: r.state,
    },
    phone: r.phone,
    email: r.email,
    taxRegime: r.tax_regime as TaxRegime,
    contractStart: r.contract_start,
    modules: r.modules as ServiceModule[],
    monthlyFeeCents: feeToCents(r.monthly_fee),
    feeDueDay: r.fee_due_day,
    active: r.active,
    notes: r.notes ?? undefined,
    isDemo: r.is_demo,
  };
}

export function inputToRow(c: ClientInput) {
  return {
    legal_name: c.legalName,
    trade_name: c.tradeName,
    document: c.document,
    state_registration: c.stateRegistration ?? null,
    municipal_registration: c.municipalRegistration ?? null,
    zip: c.address.zip,
    street: c.address.street,
    number: c.address.number,
    complement: c.address.complement ?? null,
    district: c.address.district,
    city: c.address.city,
    state: c.address.state,
    phone: c.phone,
    email: c.email,
    tax_regime: c.taxRegime,
    contract_start: c.contractStart,
    modules: c.modules,
    monthly_fee: centsToFee(c.monthlyFeeCents),
    fee_due_day: c.feeDueDay,
    active: c.active,
    notes: c.notes ?? null,
  };
}

/** Valores validados do formulário -> entrada do domínio. */
export function formValuesToInput(v: ClientFormValues): ClientInput {
  return {
    legalName: v.legalName,
    tradeName: v.tradeName,
    document: onlyDigits(v.document),
    stateRegistration: v.stateRegistration || undefined,
    municipalRegistration: v.municipalRegistration || undefined,
    address: {
      zip: onlyDigits(v.zip),
      street: v.street,
      number: v.number,
      complement: v.complement || undefined,
      district: v.district,
      city: v.city,
      state: v.state,
    },
    phone: onlyDigits(v.phone),
    email: v.email,
    taxRegime: v.taxRegime,
    contractStart: v.contractStart,
    modules: v.modules,
    monthlyFeeCents: parseMoneyToCents(v.monthlyFee) ?? 0,
    feeDueDay: Number(v.feeDueDay),
    active: v.active === "true",
    notes: v.notes || undefined,
  };
}

/** Cliente existente -> valores iniciais do formulário de edição. */
export function clientToFormValues(c: Client): ClientFormValues {
  return {
    legalName: c.legalName,
    tradeName: c.tradeName,
    document: c.document,
    stateRegistration: c.stateRegistration ?? "",
    municipalRegistration: c.municipalRegistration ?? "",
    zip: c.address.zip,
    street: c.address.street,
    number: c.address.number,
    complement: c.address.complement ?? "",
    district: c.address.district,
    city: c.address.city,
    state: c.address.state,
    phone: c.phone,
    email: c.email,
    taxRegime: c.taxRegime,
    contractStart: c.contractStart,
    modules: c.modules,
    monthlyFee: centsToInput(c.monthlyFeeCents),
    feeDueDay: String(c.feeDueDay),
    active: c.active ? "true" : "false",
    notes: c.notes ?? "",
  };
}
