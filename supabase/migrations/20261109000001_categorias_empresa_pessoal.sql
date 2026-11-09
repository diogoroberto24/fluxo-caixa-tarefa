-- Gestão Contábil — gerenciador de categorias das contas a pagar (Empresa / Pessoal).
-- Execute no SQL Editor DEPOIS da 20261108000001 e ANTES de publicar o código novo. FAÇA UM BACKUP ANTES (npm run backup).
--
-- Regras:
--  * cada categoria marca em quais tipos de conta aparece: for_empresa e/ou for_pessoal
--  * as categorias que já existem (e as novas, por padrão) ficam só em Empresa
--  * só o ADMIN cria e altera categorias (as políticas de RLS existentes continuam valendo)
--  * nenhuma conta é alterada

alter table public.financial_categories
  add column for_empresa boolean not null default true,
  add column for_pessoal boolean not null default false;

grant insert (for_empresa, for_pessoal), update (for_empresa, for_pessoal)
  on public.financial_categories to authenticated;
