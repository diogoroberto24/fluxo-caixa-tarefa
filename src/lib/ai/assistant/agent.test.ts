import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { Role } from "@/types/domain";
import {
  buildAssistantInstructions,
  buildAssistantTools,
  classifyAiError,
  runAssistant,
  toModelMessages,
  type AssistantData,
} from "./agent";
import { clients, payables, receivables, tasks, TODAY } from "./fixtures";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function data(): AssistantData & { calls: Record<string, number> } {
  const calls: Record<string, number> = { clients: 0, receivables: 0, payables: 0, tasks: 0 };
  return {
    calls,
    clients: async () => (calls.clients++, clients),
    receivables: async () => (calls.receivables++, receivables),
    payables: async () => (calls.payables++, payables),
    tasks: async () => (calls.tasks++, tasks),
  };
}

const ctx = (role: Role) => ({ role, userName: "Diogo", today: TODAY, data: data() });

describe("buildAssistantTools: ferramentas por perfil", () => {
  it("Administrador recebe todas", () => {
    expect(Object.keys(buildAssistantTools(ctx("ADMIN"))).sort()).toEqual(
      ["buscar_clientes", "cobrancas_do_cliente", "contas_a_pagar", "inadimplencia", "resumo_do_mes", "tarefas"].sort(),
    );
  });

  it("Contador não vê contas a pagar", () => {
    const names = Object.keys(buildAssistantTools(ctx("CONTADOR")));
    expect(names).toContain("inadimplencia");
    expect(names).not.toContain("contas_a_pagar");
  });

  it("Operador não recebe nenhuma ferramenta financeira", () => {
    expect(Object.keys(buildAssistantTools(ctx("OPERADOR"))).sort()).toEqual(["buscar_clientes", "tarefas"]);
  });

  it("para o Operador, a busca de clientes nem carrega as cobranças", async () => {
    const c = ctx("OPERADOR");
    const tools = buildAssistantTools(c);
    const result = await tools.buscar_clientes.execute!({ termo: "oficina" }, { toolCallId: "1", messages: [] } as never);
    expect(c.data.calls.receivables).toBe(0);
    expect(JSON.stringify(result)).not.toContain("situacao");
  });

  it("cobranças de um id inexistente devolvem erro em vez de inventar", async () => {
    const tools = buildAssistantTools(ctx("ADMIN"));
    const result = await tools.cobrancas_do_cliente.execute!({ clienteId: "nao-existe" }, { toolCallId: "1", messages: [] } as never);
    expect(result).toEqual({ erro: expect.stringMatching(/não encontrado/) });
  });
});

describe("buildAssistantInstructions", () => {
  it("traz a data de hoje, o mês atual e o anterior e as regras de somente leitura", () => {
    const text = buildAssistantInstructions({ role: "ADMIN", userName: "Diogo", today: TODAY }, ["tarefas"]);
    expect(text).toContain("2026-10-28");
    expect(text).toContain("Mês atual: 2026-10; mês passado: 2026-09");
    expect(text).toMatch(/Você só consulta dados/);
    expect(text).toMatch(/Nunca invente/);
    expect(text).toContain("Ferramentas disponíveis para este perfil: tarefas.");
  });
});

describe("toModelMessages", () => {
  it("limita o histórico, corta mensagens longas e sempre começa por uma pergunta", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i} ${"x".repeat(2000)}`,
    }));
    const msgs = toModelMessages(history);
    expect(msgs.length).toBeLessThanOrEqual(12);
    expect(msgs[0].role).toBe("user");
    expect((msgs[0].content as string).length).toBe(1000);
  });
});

describe("runAssistant (modelo simulado)", () => {
  it("chama a ferramenta, devolve a resposta e lista o que consultou", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{ type: "tool-call", toolCallId: "1", toolName: "inadimplencia", input: "{}" }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "A Oficina do Zé deve R$ 2.400,00." }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });

    const answer = await runAssistant([{ role: "user", content: "Quem está inadimplente?" }], { ...ctx("ADMIN"), model });

    expect(answer).toEqual({ text: "A Oficina do Zé deve R$ 2.400,00.", consulted: ["Inadimplência"] });
    // o resultado da ferramenta (calculado pelo sistema) voltou ao modelo na segunda chamada
    const secondPrompt = JSON.stringify(model.doGenerateCalls[1].prompt);
    expect(secondPrompt).toContain("Oficina do Zé");
    expect(secondPrompt).toMatch(/R\$\W+2\.400,00/);
  });

  it("o modelo do Operador nem fica sabendo das ferramentas financeiras", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: "Seu perfil não tem acesso ao financeiro." }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    });
    await runAssistant([{ role: "user", content: "Quem está inadimplente?" }], { ...ctx("OPERADOR"), model });
    const offered = (model.doGenerateCalls[0].tools ?? []).map((t) => t.name).sort();
    expect(offered).toEqual(["buscar_clientes", "tarefas"]);
  });

  it("resposta vazia vira uma mensagem amigável", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: { content: [], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
    });
    const answer = await runAssistant([{ role: "user", content: "?" }], { ...ctx("ADMIN"), model });
    expect(answer.text).toMatch(/Tente reformular/);
  });
});

describe("classifyAiError", () => {
  it("reconhece limite de uso", () => {
    expect(classifyAiError({ statusCode: 429 })).toBe("quota");
    expect(classifyAiError({ lastError: { message: "RESOURCE_EXHAUSTED" } })).toBe("quota");
    expect(classifyAiError(vi.fn())).toBe("unavailable");
  });
});
