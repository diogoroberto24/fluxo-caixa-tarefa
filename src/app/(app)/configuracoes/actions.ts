"use server";

import { revalidatePath } from "next/cache";
import { UNEXPECTED_ERROR, friendlyDbError, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { insertPayableCategory, payableCategoryNameTaken, updatePayableCategory, type CategoryChanges } from "@/lib/data/finance";
import { saveOffice, saveSplitPayables } from "@/lib/data/office";
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

/** Liga/desliga a separação Empresa/Pessoal nas contas a pagar (só o administrador). */
export async function setSplitPayablesAction(enabled: boolean): Promise<ActionResult<true>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };
  if (!can(user.role, "settings:manage")) return { ok: false, error: "Somente o administrador pode alterar esta configuração." };
  const { error } = await saveSplitPayables(enabled === true);
  if (error) return { ok: false, error: friendlyDbError(error) || UNEXPECTED_ERROR };
  revalidatePath("/", "layout");
  return { ok: true, data: true };
}

// ------------------------------------------------------------------ gerenciador de categorias

async function requireAdmin(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Sessão expirada. Entre novamente.";
  if (!can(user.role, "settings:manage")) return "Somente o administrador pode alterar as categorias.";
  return null;
}

const DUPLICATE_NAME = "Já existe uma categoria com esse nome.";

function categoryError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return DUPLICATE_NAME;
  return friendlyDbError(error) || UNEXPECTED_ERROR;
}

function cleanName(name: unknown): string | { error: string } {
  const n = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!n) return { error: "Informe o nome da categoria." };
  if (n.length > 60) return { error: "O nome pode ter no máximo 60 caracteres." };
  return n;
}

/** Cria uma categoria de contas a pagar (começa em Empresa). */
export async function createCategoryAction(name: string): Promise<ActionResult<string>> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const n = cleanName(name);
  if (typeof n !== "string") return { ok: false, error: n.error };
  if (await payableCategoryNameTaken(n)) return { ok: false, error: DUPLICATE_NAME };
  const { id, error } = await insertPayableCategory(n);
  if (error || !id) return { ok: false, error: error ? categoryError(error) : UNEXPECTED_ERROR };
  revalidatePath("/", "layout");
  return { ok: true, data: id };
}

/** Renomeia, ativa/desativa ou muda os tipos (Empresa/Pessoal) de uma categoria. */
export async function updateCategoryAction(id: string, changes: CategoryChanges): Promise<ActionResult<true>> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (typeof id !== "string" || !id) return { ok: false, error: "Categoria não encontrada." };
  const c: CategoryChanges = {};
  if (changes.name !== undefined) {
    const n = cleanName(changes.name);
    if (typeof n !== "string") return { ok: false, error: n.error };
    if (await payableCategoryNameTaken(n, id)) return { ok: false, error: DUPLICATE_NAME };
    c.name = n;
  }
  if (typeof changes.active === "boolean") c.active = changes.active;
  if (typeof changes.forEmpresa === "boolean") c.forEmpresa = changes.forEmpresa;
  if (typeof changes.forPessoal === "boolean") c.forPessoal = changes.forPessoal;
  if (!Object.keys(c).length) return { ok: true, data: true };
  const { error } = await updatePayableCategory(id, c);
  if (error) return { ok: false, error: categoryError(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: true };
}
