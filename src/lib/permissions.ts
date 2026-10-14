import type { Role } from "@/types/domain";

export type Permission =
  | "client:write"
  | "receivable:read"
  | "receivable:write"
  | "receivable:pay"
  /** Lançar novo serviço avulso e editar (reparcelar) serviço existente. */
  | "service:edit"
  | "payable:read"
  | "payable:write"
  | "task:write"
  | "task:update"
  | "report:view"
  | "settings:manage";

/**
 * Matriz de perfis. Na Etapa 2 passa a ser aplicada também no servidor
 * (UI apenas esconde ações; a autorização real é feita nas rotas/serviços).
 */
const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "service:edit",
    "client:write",
    "receivable:read",
    "receivable:write",
    "receivable:pay",
    "payable:read",
    "payable:write",
    "task:write",
    "task:update",
    "report:view",
    "settings:manage",
  ],
  CONTADOR: ["service:edit", "client:write", "receivable:read", "task:write", "task:update", "report:view"],
  FINANCEIRO: [
    "service:edit",
    "receivable:read",
    "receivable:write",
    "receivable:pay",
    "payable:read",
    "payable:write",
    "report:view",
    "task:update",
  ],
  OPERADOR: ["task:update"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  CONTADOR: "Contador",
  FINANCEIRO: "Financeiro",
  OPERADOR: "Operador",
};
