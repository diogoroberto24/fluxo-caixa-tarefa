/** Resultado padrão das Server Actions: nunca lança erro para a interface. */
export type ActionResult<T, F extends string = string> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: F };

export const UNEXPECTED_ERROR = "Não foi possível concluir a operação. Tente novamente.";

interface DbErrorLike {
  code?: string;
  message: string;
}

/**
 * Converte erro do banco em mensagem para o usuário. As mensagens das funções SQL
 * (códigos 42501, 23514, P0002) já estão em português; erros técnicos viram mensagem genérica.
 */
export function friendlyDbError(error: DbErrorLike): string {
  if (error.code === "42501") return "Seu perfil não tem permissão para esta operação.";
  if (error.code === "23505") return "Registro duplicado.";
  if (error.code === "P0002") return error.message;
  if (error.code === "23514" && !/violates|constraint/i.test(error.message)) return error.message;
  console.error("db error", error.code, error.message);
  return UNEXPECTED_ERROR;
}
