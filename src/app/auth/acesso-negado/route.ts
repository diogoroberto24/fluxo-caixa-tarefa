import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Conta autenticada, mas sem perfil ativo: encerra a sessão e explica o motivo no login. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?erro=acesso", request.url));
}
