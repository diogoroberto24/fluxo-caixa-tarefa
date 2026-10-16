import { maskDocument, maskPhone, maskZip } from "@/lib/masks";
import { centsToInput, parseMoneyToCents } from "@/lib/money";
import type { ClientFormValues } from "@/lib/schemas";
import { onlyDigits } from "@/lib/validators";
import type { Client, ClientKind, Representative, ServiceModule, TaxRegime } from "@/types/domain";

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
  kind: string;
  rg: string | null;
  representative_name: string | null;
  representative_rg: string | null;
  representative_document: string | null;
  representative_zip: string | null;
  representative_street: string | null;
  representative_number: string | null;
  representative_complement: string | null;
  representative_district: string | null;
  representative_city: string | null;
  representative_state: string | null;
}

export const CLIENT_COLUMNS =
  "id, legal_name, trade_name, document, state_registration, municipal_registration, zip, street, number, complement, district, city, state, phone, email, tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes, is_demo, kind, rg, representative_name, representative_rg, representative_document, representative_zip, representative_street, representative_number, representative_complement, representative_district, representative_city, representative_state";

/** numeric(12,2) -> centavos inteiros, sem acumular erro de ponto flutuante. */
export function feeToCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

export function centsToFee(cents: number): string {
  return (cents / 100).toFixed(2);
}

function rowToRepresentative(r: ClientRow): Representative | undefined {
  const any = [r.representative_name, r.representative_rg, r.representative_document, r.representative_street, r.representative_city];
  if (!any.some(Boolean)) return undefined;
  return {
    name: r.representative_name ?? "",
    rg: r.representative_rg ?? "",
    document: r.representative_document ?? "",
    address: {
      zip: r.representative_zip ?? "",
      street: r.representative_street ?? "",
      number: r.representative_number ?? "",
      complement: r.representative_complement ?? undefined,
      district: r.representative_district ?? "",
      city: r.representative_city ?? "",
      state: r.representative_state ?? "",
    },
  };
}

export function rowToClient(r: ClientRow): Client {
  return {
    id: r.id,
    legalName: r.legal_name,
    tradeName: r.trade_name,
    document: r.document,
    rg: r.rg ?? undefined,
    representative: rowToRepresentative(r),
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
    kind: r.kind as ClientKind,
    monthlyFeeCents: feeToCents(r.monthly_fee),
    feeDueDay: r.fee_due_day,
    active: r.active,
    notes: r.notes ?? undefined,
    isDemo: r.is_demo,
  };
}

/** Nunca inclui `kind`: o tipo é definido na criação e não muda depois. */
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
    rg: c.rg ?? null,
    representative_name: c.representative?.name || null,
    representative_rg: c.representative?.rg || null,
    representative_document: c.representative?.document || null,
    representative_zip: c.representative?.address.zip || null,
    representative_street: c.representative?.address.street || null,
    representative_number: c.representative?.address.number || null,
    representative_complement: c.representative?.address.complement || null,
    representative_district: c.representative?.address.district || null,
    representative_city: c.representative?.address.city || null,
    representative_state: c.representative?.address.state || null,
  };
}

/** Serviço avulso do cliente EVENTUAL (1 parcela = à vista). */
export interface ServicePlan {
  description: string;
  totalCents: number;
  installments: number;
  firstDueDate: string;
}

export function formValuesToPlan(v: ClientFormValues): ServicePlan {
  return {
    description: (v.serviceDescription ?? "").trim(),
    totalCents: parseMoneyToCents(v.serviceTotal ?? "") ?? 0,
    installments: Number(v.installments ?? "1"),
    firstDueDate: v.firstDueDate ?? "",
  };
}

/** Valores validados do formulário -> entrada do domínio. */
function formToRepresentative(v: ClientFormValues): Representative | undefined {
  const rep: Representative = {
    name: (v.repName ?? "").trim(),
    rg: (v.repRg ?? "").trim(),
    document: onlyDigits(v.repDocument ?? ""),
    address: {
      zip: onlyDigits(v.repZip ?? ""),
      street: (v.repStreet ?? "").trim(),
      number: (v.repNumber ?? "").trim(),
      complement: (v.repComplement ?? "").trim() || undefined,
      district: (v.repDistrict ?? "").trim(),
      city: (v.repCity ?? "").trim(),
      state: (v.repState ?? "").trim().toUpperCase(),
    },
  };
  const filled = [rep.name, rep.rg, rep.document, rep.address.street, rep.address.city, rep.address.zip].some(Boolean);
  return filled ? rep : undefined;
}

export function formValuesToInput(v: ClientFormValues): ClientInput {
  const eventual = v.kind === "EVENTUAL";
  return {
    kind: v.kind,
    legalName: v.legalName,
    tradeName: v.tradeName,
    document: onlyDigits(v.document),
    rg: (v.rg ?? "").trim() || undefined,
    representative: formToRepresentative(v),
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
    // EVENTUAL não tem mensalidade: guarda 0 e dia 1 (ignorados em todo o sistema)
    monthlyFeeCents: eventual ? 0 : (parseMoneyToCents(v.monthlyFee ?? "") ?? 0),
    feeDueDay: eventual ? 1 : Number(v.feeDueDay),
    active: v.active === "true",
    notes: v.notes || undefined,
  };
}

/** Cliente existente -> valores iniciais do formulário de edição. */
export function clientToFormValues(c: Client): ClientFormValues {
  return {
    kind: c.kind,
    legalName: c.legalName,
    tradeName: c.tradeName,
    document: maskDocument(c.document),
    rg: c.rg ?? "",
    repName: c.representative?.name ?? "",
    repRg: c.representative?.rg ?? "",
    repDocument: c.representative?.document ? maskDocument(c.representative.document) : "",
    repZip: c.representative?.address.zip ? maskZip(c.representative.address.zip) : "",
    repStreet: c.representative?.address.street ?? "",
    repNumber: c.representative?.address.number ?? "",
    repComplement: c.representative?.address.complement ?? "",
    repDistrict: c.representative?.address.district ?? "",
    repCity: c.representative?.address.city ?? "",
    repState: c.representative?.address.state ?? "",
    stateRegistration: c.stateRegistration ?? "",
    municipalRegistration: c.municipalRegistration ?? "",
    zip: maskZip(c.address.zip),
    street: c.address.street,
    number: c.address.number,
    complement: c.address.complement ?? "",
    district: c.address.district,
    city: c.address.city,
    state: c.address.state,
    phone: maskPhone(c.phone),
    email: c.email,
    taxRegime: c.taxRegime,
    contractStart: c.contractStart,
    modules: c.modules,
    monthlyFee: c.kind === "EVENTUAL" ? "" : centsToInput(c.monthlyFeeCents),
    feeDueDay: String(c.feeDueDay),
    active: c.active ? "true" : "false",
    notes: c.notes ?? "",
  };
}
