import { AssistantChat } from "@/components/assistant/assistant-chat";
import { ComingSoon } from "@/components/layout/coming-soon";
import { isAiConfigured } from "@/lib/ai/model";

export const metadata = { title: "Assistente IA | Anderson Cardozo" };

/**
 * Assistente de IA (somente leitura). Qualquer perfil ativo pode usar; o que cada um consegue
 * consultar depende das permissões do perfil (aplicadas nas ferramentas do agente e na RLS).
 */
export default function AssistantPage() {
  if (!isAiConfigured()) {
    return (
      <ComingSoon
        title="Assistente IA"
        stage="configuração da IA"
        description="Defina GOOGLE_GENERATIVE_AI_API_KEY no servidor para ativar o assistente."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Assistente IA</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pergunte em linguagem natural. O assistente consulta clientes, cobranças, contas a pagar e tarefas conforme o seu perfil.
        </p>
      </div>
      <AssistantChat />
    </div>
  );
}
