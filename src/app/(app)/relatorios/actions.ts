"use server";

import { z } from "zod";
import { UNEXPECTED_ERROR, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/session";
import { buildReport } from "@/lib/data/reports";
import { diffDays, todayInSaoPaulo } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { MAX_REPORT_DAYS, REPORT_META, type ReportData } from "@/lib/reports";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const inputSchema = z.object({
  type: z.enum(["fluxo", "receber", "inadimplencia", "pagar", "tarefas"]),
  from: iso,
  to: iso,
});

export async function runReportAction(input: unknown): Promise<ActionResult<ReportData>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { type, from, to } = parsed.data;

  if (!REPORT_META[type].needs.every((p) => can(user.role, p))) {
    return { ok: false, error: "Seu perfil não tem permissão para este relatório." };
  }
  if (from > to) return { ok: false, error: "A data inicial não pode ser maior que a final." };
  if (diffDays(to, from) > MAX_REPORT_DAYS) {
    return { ok: false, error: "Período máximo de 2 anos. Reduza o intervalo." };
  }

  try {
    return { ok: true, data: await buildReport(type, from, to, todayInSaoPaulo()) };
  } catch (e) {
    console.error("runReportAction", type, e);
    return { ok: false, error: UNEXPECTED_ERROR };
  }
}
