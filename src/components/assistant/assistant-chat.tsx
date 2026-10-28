"use client";

import { Bot, Loader2, RotateCcw, SendHorizontal, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askAssistantAction, type AskResult } from "@/app/(app)/assistente/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/fields";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string; consulted?: string[]; error?: boolean };

const MAX_CHARS = 1000;

/** Sugestões de perguntas; só aparecem as que o perfil consegue responder. */
const SUGGESTIONS: { text: string; needs?: Permission }[] = [
  { text: "Quem está inadimplente e quanto deve?", needs: "receivable:read" },
  { text: "Quanto já recebemos este mês?", needs: "receivable:read" },
  { text: "Quais tarefas estão atrasadas?" },
  { text: "Quais contas vencem nos próximos 7 dias?", needs: "payable:read" },
  { text: "Quantos clientes mensalistas ativos temos?" },
];

type AssistantChatProps = {
  /** permite injetar a ação nos testes */
  ask?: (history: { role: "user" | "assistant"; content: string }[]) => Promise<AskResult>;
};

/**
 * Chat do assistente de IA. A conversa vive só nesta tela (não é salva); a cada pergunta, o histórico
 * recente vai para a Server Action, que roda o agente com as ferramentas permitidas ao perfil.
 */
export function AssistantChat({ ask = askAssistantAction }: AssistantChatProps) {
  const { currentUser } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const suggestions = SUGGESTIONS.filter((s) => !s.needs || can(currentUser.role, s.needs));

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    // respostas com erro não voltam para o modelo
    const history = next.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    const result = await ask(history);
    setBusy(false);
    setMessages((cur) => [
      ...cur,
      result.ok
        ? { role: "assistant", content: result.answer.text, consulted: result.answer.consulted }
        : { role: "assistant", content: result.error, error: true },
    ]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <Card className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-4 py-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-primary" aria-hidden />
            <div>
              <p className="font-medium text-ink">Pergunte sobre clientes, cobranças, contas e tarefas.</p>
              <p className="mt-1 text-sm text-ink-muted">O assistente consulta os dados do sistema. Ele não altera nada.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => void send(s.text)}
                  className="rounded-full border border-line bg-white px-3.5 py-2 text-sm text-ink hover:bg-surface"
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-navy text-white" : "bg-primary/10 text-primary",
              )}
              aria-hidden
            >
              {m.role === "user" ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </span>
            <div className={cn("max-w-[85%] space-y-1.5", m.role === "user" && "text-right")}>
              <div
                className={cn(
                  "inline-block rounded-xl px-4 py-2.5 text-left text-sm leading-relaxed",
                  m.role === "user" && "bg-navy text-white",
                  m.role === "assistant" && !m.error && "border border-line bg-surface text-ink",
                  m.error && "border border-danger-line bg-danger-soft text-danger",
                )}
              >
                <span className="sr-only">{m.role === "user" ? "Você: " : "Assistente: "}</span>
                {m.role === "assistant" && !m.error ? <RichText text={m.content} /> : m.content}
              </div>
              {m.consulted && m.consulted.length > 0 && (
                <p className="text-xs text-ink-muted">Consultou: {m.consulted.join(", ")}</p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Consultando os dados...
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="space-y-2 border-t border-line p-4">
        <label htmlFor="pergunta" className="sr-only">
          Sua pergunta
        </label>
        <Textarea
          id="pergunta"
          rows={2}
          maxLength={MAX_CHARS}
          placeholder="Ex.: Quais clientes estão com honorários em atraso?"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">Respostas geradas por IA a partir dos dados do sistema. Confira antes de decidir.</p>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMessages([])}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Nova conversa
              </Button>
            )}
            <Button type="submit" disabled={busy || !input.trim()}>
              <SendHorizontal className="h-4 w-4" aria-hidden />
              Perguntar
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

/** Formatação mínima da resposta (parágrafos, listas com "-" ou "*", **negrito**), sem HTML vindo do modelo. */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list.map((item, i) => (
            <li key={i}>{bold(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1">{bold(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

function bold(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}
