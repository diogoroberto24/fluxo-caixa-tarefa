"use server";

import { revalidatePath } from "next/cache";
import { UNEXPECTED_ERROR, friendlyDbError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { saveOffice } from "@/lib/data/office";
import { can } from "@/lib/permissions";
import { officeSchema, type OfficeFormValues } from "@/lib/schemas";

/** Salva os dados do escritório (só o administrador). */
export async function saveOfficeAction(values: OfficeFormValues): Promise<ActionResult<true, keyof OfficeFormValues>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };
  if (!can(user.role, "settings:manage")) return { ok: false, error: "Somente o administrador pode alterar os dados do escritório." };
  const parsed = officeSchema.safeParse(values);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: i.path[0] as keyof OfficeFormValues };
  }
  const { error } = await saveOffice(parsed.data);
  if (error) return { ok: false, error: friendlyDbError(error) || UNEXPECTED_ERROR };
  revalidatePath("/", "layout");
  return { ok: true, data: true };
}
