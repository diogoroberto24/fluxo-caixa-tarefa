-- Gestão Contábil — segurança (RLS e permissões). Execute DEPOIS da migração 0001.
--
-- Modelo:
--  * ninguém sem login (role anon) acessa nada
--  * usuário autenticado só acessa se tiver perfil ATIVO (private.app_role() não nulo)
--  * clientes: leitura para todo perfil ativo; criar/editar só ADMIN e CONTADOR; sem DELETE (inativa-se)
--  * histórico de honorários: leitura para perfil ativo; gravado apenas por trigger
--  * audit_log: leitura só ADMIN; gravado apenas por trigger
--  * profiles: leitura para perfil ativo; cada um edita o próprio nome; perfil/ativo só via service_role
--  * "Automatically expose new tables" fica desligado: todas as permissões são concedidas explicitamente aqui

revoke all on function private.app_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.app_role() to authenticated;

alter table public.profiles            enable row level security;
alter table public.clients             enable row level security;
alter table public.client_fee_history  enable row level security;
alter table public.audit_log           enable row level security;

revoke all on public.profiles, public.clients, public.client_fee_history, public.audit_log
  from public, anon, authenticated;

-- ---------------------------------------------------------------- profiles
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Todo perfil ativo vê os colegas (para exibir responsáveis); o próprio perfil sempre é visível,
-- mesmo inativo, para o app poder explicar o bloqueio.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.app_role()) is not null);

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ----------------------------------------------------------------- clients
grant select on public.clients to authenticated;
grant insert (legal_name, trade_name, document, state_registration, municipal_registration,
              zip, street, number, complement, district, city, state, phone, email,
              tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes)
  on public.clients to authenticated;
grant update (legal_name, trade_name, document, state_registration, municipal_registration,
              zip, street, number, complement, district, city, state, phone, email,
              tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes)
  on public.clients to authenticated;

create policy clients_select on public.clients for select to authenticated
  using ((select private.app_role()) is not null);

create policy clients_insert on public.clients for insert to authenticated
  with check ((select private.app_role()) in ('ADMIN', 'CONTADOR')
              and created_by = (select auth.uid()));

create policy clients_update on public.clients for update to authenticated
  using ((select private.app_role()) in ('ADMIN', 'CONTADOR'))
  with check ((select private.app_role()) in ('ADMIN', 'CONTADOR'));

-- ------------------------------------------------------ client_fee_history
grant select on public.client_fee_history to authenticated;
create policy fee_history_select on public.client_fee_history for select to authenticated
  using ((select private.app_role()) is not null);

-- --------------------------------------------------------------- audit_log
grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.app_role()) = 'ADMIN');
