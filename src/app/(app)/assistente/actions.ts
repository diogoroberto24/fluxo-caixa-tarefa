"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getLanguageModel } from "@/lib/ai/model";
import { classifyAiError, MAX_MESSAGE_CHARS, runAssistant, type AssistantAnswer, type ChatMessage } from "@/lib/ai/assistant/agent";
import { listClients } from "@/lib/data/clients";
import { listPayables, listReceivables } from "@/lib/data/finance";
import { listTasks } from "@/lib/data/tasks";
import { todayInSaoPaulo } from "@/lib/dates";

export type AskResult = { ok: true; answer: AssistantAnswer } | { ok: false; error: string };

const ERRORS = {
  session: "Sua sessão expirou. Entre novamente.",
  disabled: "O assistente de IA não está configurado neste ambiente.",
  empty: "Escreva uma pergunta.",
  long: `Use até ${MAX_MESSAGE_CHARS} caracteres por pergunta.`,
  quota: "O limite de uso da IA foi atingido. Tente de novo em alguns minutos.",
  unavailable: "Não consegui responder agora. Tente de novo em instantes.",
} as const;

/** Carrega um conjunto de dados só na primeira vez que uma ferramenta pedir. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load());
}

/**
 * Pergunta ao assistente. Somente leitura: as ferramentas consultam os dados com o cliente Supabase
 * da pessoa logada (a RLS vale também para a IA) e o agente só recebe as ferramentas que o perfil permite.
 */
export async function askAssistantAction(history: ChatMessage[]): Promise<AskResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: ERRORS.session };

  const model = getLanguageModel();
  if (!model) return { ok: false, error: ERRORS.disabled };

  const messages = (Array.isArray(history) ? history : []).filter(
    (m): m is ChatMessage => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  const last = messages.at(-1);
  if (!last || last.role !== "user" || !last.content.trim()) return { ok: false, error: ERRORS.empty };
  if (last.content.length > MAX_MESSAGE_CHARS) return { ok: false, error: ERRORS.long };

  const today = todayInSaoPaulo();
  try {
    const answer = await runAssistant(messages, {
      model,
      role: user.role,
      userName: user.name,
      today,
      data: {
        clients: once(listClients),
        receivables: once(() => listReceivables(today)),
        payables: once(() => listPayables(today)),
        tasks: once(() => listTasks(today)),
      },
    });
    return { ok: true, answer };
  } catch (error) {
    console.error("[ia] assistente falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: ERRORS[classifyAiError(error)] };
  }
}
