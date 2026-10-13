-- Gestão Contábil — segurança do financeiro (RLS e permissões). Execute DEPOIS da 0004.
--
-- Quem vê o quê:
--   receivables (cobranças a receber) .... ADMIN, CONTADOR, FINANCEIRO
--   payables, recurrence_rules ........... ADMIN, FINANCEIRO
--   payments ............................. ADMIN, FINANCEIRO (todos); CONTADOR (somente recebimentos)
--   OPERADOR não acessa dados financeiros.
-- Quem grava:
--   cobranças a receber: ADMIN e FINANCEIRO (criar/editar direto; pagar/cancelar/gerar por função)
--   contas a pagar e pagamentos: SOMENTE pelas funções (create_payable, register_*, cancel_*), nunca por INSERT direto
--   categorias: ADMIN

revoke all on function private.br_today() from public;
revoke all on function private.require_finance_writer() from public;
grant execute on function private.br_today() to authenticated;
grant execute on function private.require_finance_writer() to authenticated;

alter table public.financial_categories enable row level security;
alter table public.recurrence_rules     enable row level security;
alter table public.receivables          enable row level security;
alter table public.payables             enable row level security;
alter table public.payments             enable row level security;

revoke all on public.financial_categories, public.recurrence_rules, public.receivables,
              public.payables, public.payments
  from public, anon, authenticated;

-- ---------------------------------------------------------- financial_categories
grant select on public.financial_categories to authenticated;
grant insert (name, kind, active), update (name, active) on public.financial_categories to authenticated;
create policy categories_select on public.financial_categories for select to authenticated
  using ((select private.app_role()) is not null);
create policy categories_insert on public.financial_categories for insert to authenticated
  with check ((select private.app_role()) = 'ADMIN');
create policy categories_update on public.financial_categories for update to authenticated
  using ((select private.app_role()) = 'ADMIN')
  with check ((select private.app_role()) = 'ADMIN');

-- -------------------------------------------------------------- recurrence_rules
grant select on public.recurrence_rules to authenticated;
grant update (active, end_date) on public.recurrence_rules to authenticated;
create policy rules_select on public.recurrence_rules for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'));
create policy rules_update on public.recurrence_rules for update to authenticated
  using ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'))
  with check ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'));

-- ---------------------------------------------------------------- receivables
grant select on public.receivables to authenticated;
grant insert (client_id, description, category, competence, amount, due_date, notes)
  on public.receivables to authenticated;
grant update (description, amount, due_date, notes) on public.receivables to authenticated;
create policy receivables_select on public.receivables for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'CONTADOR', 'FINANCEIRO'));
create policy receivables_insert on public.receivables for insert to authenticated
  with check ((select private.app_role()) in ('ADMIN', 'FINANCEIRO')
              and created_by = (select auth.uid()));
create policy receivables_update on public.receivables for update to authenticated
  using ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'))
  with check ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'));

-- ------------------------------------------------------------------- payables
grant select on public.payables to authenticated;
grant update (description, category_id, supplier, amount, issue_date, due_date, notes)
  on public.payables to authenticated;
create policy payables_select on public.payables for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'));
create policy payables_update on public.payables for update to authenticated
  using ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'))
  with check ((select private.app_role()) in ('ADMIN', 'FINANCEIRO'));

-- ------------------------------------------------------------------- payments
grant select on public.payments to authenticated;
create policy payments_select on public.payments for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'FINANCEIRO')
         or ((select private.app_role()) = 'CONTADOR' and receivable_id is not null));

-- ------------------------------------------------------- funções expostas (RPC)
revoke all on function public.register_receipt(uuid, date, numeric, text) from public, anon;
revoke all on function public.register_payable_payment(uuid, date, numeric, text) from public, anon;
revoke all on function public.cancel_receivable(uuid, text) from public, anon;
revoke all on function public.cancel_payable(uuid, text) from public, anon;
revoke all on function public.generate_monthly_fees(date) from public, anon;
revoke all on function public.generate_payable_occurrences(date) from public, anon;
revoke all on function public.create_payable(text, uuid, text, numeric, date, date, text, public.recurrence_frequency) from public, anon;

grant execute on function public.register_receipt(uuid, date, numeric, text) to authenticated;
grant execute on function public.register_payable_payment(uuid, date, numeric, text) to authenticated;
grant execute on function public.cancel_receivable(uuid, text) to authenticated;
grant execute on function public.cancel_payable(uuid, text) to authenticated;
grant execute on function public.generate_monthly_fees(date) to authenticated;
grant execute on function public.generate_payable_occurrences(date) to authenticated;
grant execute on function public.create_payable(text, uuid, text, numeric, date, date, text, public.recurrence_frequency) to authenticated;
