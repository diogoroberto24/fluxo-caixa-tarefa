-- Gestão Contábil — permissões do service_role para o financeiro. Execute DEPOIS da 0004 e da 0005.
-- Usado pelos scripts locais (npm run seed:demo / clear:demo). O papel anon continua sem acesso.

grant all on public.financial_categories, public.recurrence_rules, public.receivables,
             public.payables, public.payments
  to service_role;
