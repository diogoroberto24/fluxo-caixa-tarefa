import "server-only";
import { createGoogle } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Ponto único de escolha do modelo de IA. O resto do app recebe um `LanguageModel` e não sabe qual
 * provedor está por trás: para trocar de provedor (Anthropic, OpenAI, Groq...), basta instalar o pacote
 * `@ai-sdk/<provedor>` e mudar só este arquivo.
 *
 * Padrão: Google Gemini (camada gratuita do Google AI Studio). A chave fica em
 * GOOGLE_GENERATIVE_AI_API_KEY (só no servidor; nunca com prefixo NEXT_PUBLIC_).
 */
export const DEFAULT_AI_MODEL = "gemini-3.5-flash";

/** true quando há chave configurada; sem chave, o assistente fica escondido. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
}

/** Modelo configurado, ou null se a IA não estiver configurada. */
export function getLanguageModel(): LanguageModel | null {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) return null;
  const google = createGoogle({ apiKey });
  return google(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL);
}
