import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role, User } from "@/types/domain";

/**
 * Usuário logado com perfil ATIVO, ou null se não houver sessão válida OU se a conta
 * existir mas não tiver perfil ativo (conta recém-criada sem liberação).
 *
 * É a verificação de autorização real (o middleware faz só uma checagem otimista).
 * Use em toda página, Server Action e rota que leia ou grave dados.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.active) return null;

  const email = data?.claims?.email;
  return {
    id: profile.id,
    name: profile.full_name || (typeof email === "string" ? email : "Usuário"),
    email: typeof email === "string" ? email : "",
    role: profile.role as Role,
  };
});

/** Equipe ativa (para exibir responsáveis). O RLS já restringe a perfis ativos. */
export async function listActiveUsers(): Promise<User[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("active", true)
    .order("full_name");
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    email: "",
    role: p.role as Role,
  }));
}
