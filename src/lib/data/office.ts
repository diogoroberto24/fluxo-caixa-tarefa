import "server-only";
import { EMPTY_OFFICE, type OfficeData } from "@/lib/contracts";
import { createClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validators";
import type { OfficeFormValues } from "@/lib/schemas";

interface Row {
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;
  crc: string | null;
  representative_name: string | null;
  representative_document: string | null;
  representative_role: string | null;
  representative_crc: string | null;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  default_forum: string | null;
}

const s = (v: string | null) => v ?? "";

/** Dados do escritório (vazios se ainda não foram cadastrados). Só ADMIN e CONTADOR leem (RLS). */
export async function getOffice(): Promise<OfficeData> {
  const supabase = await createClient();
  const { data } = await supabase.from("office_settings").select("*").maybeSingle();
  if (!data) return EMPTY_OFFICE;
  const r = data as Row;
  return {
    legalName: s(r.legal_name), tradeName: s(r.trade_name), document: s(r.document), crc: s(r.crc),
    representativeName: s(r.representative_name), representativeDocument: s(r.representative_document),
    representativeRole: s(r.representative_role), representativeCrc: s(r.representative_crc),
    zip: s(r.zip), street: s(r.street), number: s(r.number), complement: s(r.complement), district: s(r.district),
    city: s(r.city), state: s(r.state), phone: s(r.phone), email: s(r.email), defaultForum: s(r.default_forum),
  };
}

export async function saveOffice(v: OfficeFormValues): Promise<{ error?: { code?: string; message: string } }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_office_settings", {
    p: {
      legal_name: v.legalName, trade_name: v.tradeName, document: onlyDigits(v.document), crc: v.crc,
      representative_name: v.representativeName, representative_document: onlyDigits(v.representativeDocument),
      representative_role: v.representativeRole, representative_crc: v.representativeCrc,
      zip: onlyDigits(v.zip), street: v.street, number: v.number, complement: v.complement, district: v.district,
      city: v.city, state: v.state.toUpperCase(), phone: onlyDigits(v.phone), email: v.email, default_forum: v.defaultForum,
    },
  });
  return error ? { error } : {};
}
