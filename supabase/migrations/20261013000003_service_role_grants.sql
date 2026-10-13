-- Gestão Contábil — permissões do papel de administração (service_role). Execute DEPOIS das migrações 0001 e 0002.
--
-- Com "Automatically expose new tables" desligado, o Supabase não concede privilégios automáticos
-- às tabelas novas, nem para o service_role (chave secreta). Os scripts `npm run seed` e
-- `npm run clear:demo` usam esse papel (que ignora o RLS), então ele precisa de permissão explícita.
-- O papel anon continua sem nenhum acesso.

grant usage on schema public to service_role;

grant all on public.profiles, public.clients, public.client_fee_history, public.audit_log
  to service_role;

grant usage, select on all sequences in schema public to service_role;
