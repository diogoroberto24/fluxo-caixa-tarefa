import { describe, expect, it } from "vitest";
import { chargesOfClient, findClients, overdueByClient, payablesOverview, receivablesOfMonth, tasksQuery } from "./queries";
import { clients, payables, receivables, tasks, TODAY } from "./fixtures";

const brl = (s: string) => s.replace(/\s/g, " ");

describe("findClients", () => {
  it("busca sem acento e sem diferenciar maiúsculas", () => {
    const r = findClients(clients, receivables, "pao", TODAY);
    expect(r.total).toBe(1);
    expect(r.clientes[0]).toMatchObject({ id: "c-padaria", nome: "Padaria Pão Quente", situacao: "Em atraso" });
  });

  it("não devolve documento, telefone, e-mail nem endereço", () => {
    const json = JSON.stringify(findClients(clients, receivables, "", TODAY));
    expect(json).not.toContain("12345678000199");
    expect(json).not.toContain("41999998888");
    expect(json).not.toContain("contato@exemplo.com");
  });

  it("sem acesso ao financeiro, não traz honorário nem situação", () => {
    const r = findClients(clients, null, "oficina", TODAY);
    expect(r.clientes[0]).not.toHaveProperty("honorarioMensal");
    expect(r.clientes[0]).not.toHaveProperty("situacao");
  });
});

describe("receivablesOfMonth", () => {
  it("usa as regras do sistema: cancelada fora, vencido separado de a vencer", () => {
    const r = receivablesOfMonth(receivables, "2026-10", TODAY);
    expect(r.mes).toBe("Outubro/2026");
    expect(brl(r.previsto)).toBe("R$ 1.600,00"); // 500 + 800 + 300 (cancelada de 999 fora)
    expect(brl(r.recebido)).toBe("R$ 500,00");
    expect(brl(r.vencido)).toBe("R$ 800,00");
    expect(brl(r.aVencer)).toBe("R$ 300,00");
    expect(r.percentualRecebido).toBe("31%");
  });
});

describe("overdueByClient", () => {
  it("agrupa vencidos por cliente, do maior valor para o menor, com dias de atraso", () => {
    const r = overdueByClient(clients, receivables, TODAY);
    expect(brl(r.totalVencido)).toBe("R$ 2.900,00");
    expect(r.clientesInadimplentes).toBe(2);
    expect(r.clientes[0]).toMatchObject({ nome: "Oficina do Zé", cobrancasVencidas: 3, vencimentoMaisAntigo: "10/08/2026", diasDeAtraso: 79 });
    expect(brl(r.clientes[0].valorVencido)).toBe("R$ 2.400,00");
    expect(r.clientes[1].nome).toBe("Padaria Pão Quente");
  });
});

describe("chargesOfClient", () => {
  it("cliente eventual mostra as parcelas", () => {
    const joao = clients.find((c) => c.id === "c-joao")!;
    const r = chargesOfClient(joao, receivables, TODAY);
    expect(r.situacao).toBe("Pendente");
    expect(r.cobrancas[0]).toMatchObject({ descricao: "Declaração IR", parcela: "1/2", status: "PENDENTE" });
  });
});

describe("payablesOverview", () => {
  it("resume as contas em aberto e lista por vencimento", () => {
    const r = payablesOverview(payables, TODAY);
    expect(brl(r.emAberto)).toBe("R$ 3.150,00");
    expect(r).toMatchObject({ contasEmAberto: 3, vencidas: 1, vencemNos7Dias: 1 });
    expect(r.proximas.map((p) => p.descricao)).toEqual(["Aluguel", "Internet", "Contador associado"]);
  });
});

describe("tasksQuery", () => {
  it("atrasadas", () => {
    const r = tasksQuery(tasks, clients, TODAY, { situacao: "atrasadas" });
    expect(r.tarefas.map((t) => t.titulo)).toEqual(["DAS do Simples"]);
    expect(r.tarefas[0].diasDeAtraso).toBe(8);
  });

  it("próximos 7 dias inclui hoje e ignora concluídas", () => {
    const r = tasksQuery(tasks, clients, TODAY, { situacao: "proximos_7_dias" });
    expect(r.tarefas.map((t) => t.titulo)).toEqual(["Folha de outubro", "DCTFWeb"]);
  });

  it("filtra por cliente", () => {
    const r = tasksQuery(tasks, clients, TODAY, { situacao: "abertas", clienteId: "c-padaria" });
    expect(r.tarefas.map((t) => t.titulo)).toEqual(["DAS do Simples", "SPED"]);
  });
});
