-- Gestão Contábil — vários escritórios na mesma base, cada um enxergando SOMENTE os próprios dados.
-- Execute no SQL Editor DEPOIS da 0022. FAÇA UM BACKUP ANTES (npm run backup).
--
-- Regras:
--  * offices: um registro por escritório. offices.active = false suspende o escritório inteiro (base para a assinatura):
--    ninguém dele acessa nada enquanto estiver suspenso
--  * profiles.office_id: o escritório do usuário. Usuário sem escritório (ou de escritório suspenso) não acessa nada
--  * TODA tabela de dados tem office_id (obrigatório). O valor vem do usuário logado (private.my_office()) e NUNCA do
--    navegador: o app não tem permissão para informar nem alterar a coluna
--  * RLS: todas as políticas exigem office_id = private.my_office()
--  * chaves estrangeiras COMPOSTAS (id, office_id): uma linha nunca aponta para dados de outro escritório
--  * todas as funções (RPC) filtram pelo escritório do chamador; ids de outro escritório respondem "não encontrado"
--  * unicidades passam a valer por escritório (CNPJ/CPF do cliente, nomes de modelo/tarefa/categoria, número do contrato)
--  * todos os dados e usuários existentes passam para o escritório "principal" (o seu, criado aqui)

-- ------------------------------------------------------------------ escritórios
create table public.offices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  document    text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger offices_updated_at before update on public.offices
  for each row execute function private.set_updated_at();

alter table public.profiles add column office_id uuid references public.offices (id);
create index profiles_office_idx on public.profiles (office_id);

-- Escritório do usuário logado; NULL se o perfil estiver inativo, sem escritório ou o escritório suspenso.
create or replace function private.my_office()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.office_id
    from public.profiles p
    join public.offices o on o.id = p.office_id
   where p.id = (select auth.uid()) and p.active and o.active
$$;
revoke all on function private.my_office() from public;
grant execute on function private.my_office() to authenticated, service_role;

-- O perfil só vale se o escritório estiver ativo (suspender o escritório bloqueia todos os usuários dele).
create or replace function private.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
    join public.offices o on o.id = p.office_id
   where p.id = (select auth.uid()) and p.active and o.active
$$;

-- ------------------------------------------------ office_id em todas as tabelas (+ dados atuais)
do $$
declare
  v_office uuid;
  v_name text;
  v_doc text;
  t text;
begin
  select legal_name, document into v_name, v_doc from public.office_settings limit 1;
  insert into public.offices (name, document)
  values (coalesce(nullif(btrim(v_name), ''), 'Escritório principal'), v_doc)
  returning id into v_office;

  update public.profiles set office_id = v_office;

  foreach t in array array[
    'clients', 'client_fee_history', 'audit_log', 'financial_categories', 'recurrence_rules', 'receivables',
    'payables', 'payments', 'task_definitions', 'task_executions', 'task_types', 'office_settings',
    'contract_templates', 'contract_counters', 'contracts'
  ] loop
    execute format('alter table public.%I add column office_id uuid references public.offices (id)', t);
    -- o preenchimento inicial não deve disparar auditoria, "updated_at" nem as travas de imutabilidade
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set office_id = %L', t, v_office);
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column office_id set not null', t);
    execute format('alter table public.%I alter column office_id set default private.my_office()', t);
    execute format('create index %I on public.%I (office_id)', t || '_office_idx', t);
  end loop;
end;
$$;

-- office_id nunca muda depois de definido (defesa extra; o app nem tem permissão para a coluna).
-- (profiles fica de fora: o app só pode alterar o próprio nome; o vínculo com o escritório é feito pelos scripts
-- de administração, com a chave secreta)
create or replace function private.lock_office_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.office_id is not null and new.office_id is distinct from old.office_id then
    raise exception 'O escritório de um registro não pode ser alterado.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'client_fee_history', 'financial_categories', 'recurrence_rules', 'receivables', 'payables',
    'payments', 'task_definitions', 'task_executions', 'task_types', 'office_settings', 'contract_templates',
    'contract_counters', 'contracts'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.lock_office_id()',
                   t || '_lock_office', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ unicidade por escritório
drop index public.clients_document_key;
create unique index clients_document_key on public.clients (office_id, document);

alter table public.financial_categories drop constraint financial_categories_kind_name_key;
alter table public.financial_categories add constraint financial_categories_office_kind_name_key unique (office_id, kind, name);

drop index public.task_types_name_key;
create unique index task_types_name_key on public.task_types (office_id, lower(btrim(name)));

drop index public.contract_templates_name_key;
create unique index contract_templates_name_key on public.contract_templates (office_id, lower(btrim(name)));

-- dados do escritório: uma linha por escritório (antes: linha única global)
alter table public.office_settings drop column singleton;
alter table public.office_settings add constraint office_settings_office_key unique (office_id);

-- contador de contratos: por escritório e ano
alter table public.contract_counters drop constraint contract_counters_pkey;
alter table public.contract_counters add primary key (office_id, year);

alter table public.contracts drop constraint contracts_number_key;
alter table public.contracts add constraint contracts_office_number_key unique (office_id, number);

-- ------------------------------------------ chaves estrangeiras compostas (mesmo escritório)
alter table public.profiles             add constraint profiles_id_office_key unique (id, office_id);
alter table public.clients              add constraint clients_id_office_key unique (id, office_id);
alter table public.financial_categories add constraint financial_categories_id_office_key unique (id, office_id);
alter table public.recurrence_rules     add constraint recurrence_rules_id_office_key unique (id, office_id);
alter table public.receivables          add constraint receivables_id_office_key unique (id, office_id);
alter table public.payables             add constraint payables_id_office_key unique (id, office_id);
alter table public.task_types           add constraint task_types_id_office_key unique (id, office_id);
alter table public.task_definitions     add constraint task_definitions_id_office_key unique (id, office_id);
alter table public.contract_templates   add constraint contract_templates_id_office_key unique (id, office_id);

alter table public.client_fee_history add constraint fee_history_client_office_fk
  foreign key (client_id, office_id) references public.clients (id, office_id);
alter table public.receivables add constraint receivables_client_office_fk
  foreign key (client_id, office_id) references public.clients (id, office_id);
alter table public.payables add constraint payables_category_office_fk
  foreign key (category_id, office_id) references public.financial_categories (id, office_id);
alter table public.payables add constraint payables_rule_office_fk
  foreign key (recurrence_rule_id, office_id) references public.recurrence_rules (id, office_id);
alter table public.payments add constraint payments_receivable_office_fk
  foreign key (receivable_id, office_id) references public.receivables (id, office_id);
alter table public.payments add constraint payments_payable_office_fk
  foreign key (payable_id, office_id) references public.payables (id, office_id);
alter table public.task_definitions add constraint task_definitions_client_office_fk
  foreign key (client_id, office_id) references public.clients (id, office_id);
alter table public.task_definitions add constraint task_definitions_assignee_office_fk
  foreign key (assignee_id, office_id) references public.profiles (id, office_id);
alter table public.task_definitions add constraint task_definitions_rule_office_fk
  foreign key (recurrence_rule_id, office_id) references public.recurrence_rules (id, office_id);
alter table public.task_definitions add constraint task_definitions_type_office_fk
  foreign key (task_type_id, office_id) references public.task_types (id, office_id);
alter table public.task_executions add constraint task_executions_definition_office_fk
  foreign key (definition_id, office_id) references public.task_definitions (id, office_id);
alter table public.contracts add constraint contracts_client_office_fk
  foreign key (client_id, office_id) references public.clients (id, office_id);
alter table public.contracts add constraint contracts_template_office_fk
  foreign key (template_id, office_id) references public.contract_templates (id, office_id);

-- --------------------------------------------------------------------- auditoria
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_office uuid := (to_jsonb(coalesce(new, old)) ->> 'office_id')::uuid;
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (office_id, user_id, table_name, record_id, action, old_data)
    values (v_office, (select auth.uid()), tg_table_name, (to_jsonb(old) ->> 'id')::uuid, tg_op, to_jsonb(old));
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (office_id, user_id, table_name, record_id, action, new_data)
    values (v_office, (select auth.uid()), tg_table_name, (to_jsonb(new) ->> 'id')::uuid, tg_op, to_jsonb(new));
  else
    insert into public.audit_log (office_id, user_id, table_name, record_id, action, old_data, new_data)
    values (v_office, (select auth.uid()), tg_table_name, (to_jsonb(new) ->> 'id')::uuid, tg_op, to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end;
$$;

create or replace function private.track_client_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'FIXO'
     and (tg_op = 'INSERT'
          or new.monthly_fee is distinct from old.monthly_fee
          or new.fee_due_day is distinct from old.fee_due_day) then
    insert into public.client_fee_history (office_id, client_id, monthly_fee, due_day)
    values (new.office_id, new.id, new.monthly_fee, new.fee_due_day);
  end if;
  return null;
end;
$$;

-- ----------------------------------------------------------- RLS: tudo filtrado por escritório
alter table public.offices enable row level security;
revoke all on public.offices from public, anon, authenticated;
grant select on public.offices to authenticated;
grant all on public.offices to service_role;
create policy offices_select on public.offices for select to authenticated
  using (id = (select private.my_office()));

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or office_id = (select private.my_office()));

drop policy clients_select on public.clients;
drop policy clients_insert on public.clients;
drop policy clients_update on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) is not null);
create policy clients_insert on public.clients for insert to authenticated
  with check (office_id = (select private.my_office())
              and (select private.app_role()) in ('ADMIN', 'CONTADOR')
              and created_by = (select auth.uid()));
create policy clients_update on public.clients for update to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'CONTADOR'))
  with check (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'CONTADOR'));

drop policy fee_history_select on public.client_fee_history;
create policy fee_history_select on public.client_fee_history for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) is not null);

drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) = 'ADMIN');

drop policy categories_select on public.financial_categories;
drop policy categories_insert on public.financial_categories;
drop policy categories_update on public.financial_categories;
create policy categories_select on public.financial_categories for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) is not null);
create policy categories_insert on public.financial_categories for insert to authenticated
  with check (office_id = (select private.my_office()) and (select private.app_role()) = 'ADMIN');
create policy categories_update on public.financial_categories for update to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) = 'ADMIN')
  with check (office_id = (select private.my_office()) and (select private.app_role()) = 'ADMIN');

drop policy rules_select on public.recurrence_rules;
drop policy rules_update on public.recurrence_rules;
drop policy rules_select_tasks on public.recurrence_rules;
create policy rules_select on public.recurrence_rules for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'));
create policy rules_update on public.recurrence_rules for update to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'))
  with check (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'));
create policy rules_select_tasks on public.recurrence_rules for select to authenticated
  using (office_id = (select private.my_office()) and kind = 'TAREFA' and (select private.app_role()) is not null);

drop policy receivables_select on public.receivables;
drop policy receivables_insert on public.receivables;
drop policy receivables_update on public.receivables;
create policy receivables_select on public.receivables for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'CONTADOR', 'FINANCEIRO'));
create policy receivables_insert on public.receivables for insert to authenticated
  with check (office_id = (select private.my_office())
              and (select private.app_role()) in ('ADMIN', 'FINANCEIRO')
              and created_by = (select auth.uid()));
create policy receivables_update on public.receivables for update to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'))
  with check (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'));

drop policy payables_select on public.payables;
drop policy payables_update on public.payables;
create policy payables_select on public.payables for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'));
create policy payables_update on public.payables for update to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'))
  with check (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'FINANCEIRO'));

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (office_id = (select private.my_office())
         and ((select private.app_role()) in ('ADMIN', 'FINANCEIRO')
              or ((select private.app_role()) = 'CONTADOR' and receivable_id is not null)));

drop policy task_definitions_select on public.task_definitions;
drop policy task_executions_select on public.task_executions;
create policy task_definitions_select on public.task_definitions for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) is not null);
create policy task_executions_select on public.task_executions for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) is not null);

drop policy task_types_select on public.task_types;
create policy task_types_select on public.task_types for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) is not null);

drop policy office_settings_select on public.office_settings;
drop policy contract_templates_select on public.contract_templates;
drop policy contracts_select on public.contracts;
create policy office_settings_select on public.office_settings for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'CONTADOR'));
create policy contract_templates_select on public.contract_templates for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'CONTADOR'));
create policy contracts_select on public.contracts for select to authenticated
  using (office_id = (select private.my_office()) and (select private.app_role()) in ('ADMIN', 'CONTADOR'));

-- ================================================================ funções (RPC) por escritório
-- Todas conferem o perfil (como antes) E filtram pelo escritório do chamador.

create or replace function public.register_receipt(
  p_receivable_id uuid,
  p_paid_on date default null,
  p_amount numeric default null,
  p_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receivables;
  v_pay public.payments;
  v_today date := private.br_today();
  v_paid_on date;
begin
  perform private.require_finance_writer();
  select * into r from public.receivables where id = p_receivable_id and office_id = private.my_office() for update;
  if not found then
    raise exception 'Cobrança não encontrada.' using errcode = 'P0002';
  end if;
  if r.canceled_at is not null then
    raise exception 'Cobrança cancelada não pode ser recebida.' using errcode = '23514';
  end if;

  select * into v_pay from public.payments where receivable_id = r.id;
  if found then
    return jsonb_build_object('status', 'already_paid', 'payment_id', v_pay.id, 'paid_on', v_pay.paid_on);
  end if;

  v_paid_on := coalesce(p_paid_on, v_today);
  if v_paid_on > v_today then
    raise exception 'A data do pagamento não pode ser futura.' using errcode = '23514';
  end if;

  insert into public.payments (receivable_id, amount, paid_on, method)
  values (r.id, coalesce(p_amount, r.amount), v_paid_on, nullif(btrim(p_method), ''))
  returning * into v_pay;

  return jsonb_build_object('status', 'paid', 'payment_id', v_pay.id, 'paid_on', v_pay.paid_on);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_paid');
end;
$$;

create or replace function public.register_payable_payment(
  p_payable_id uuid,
  p_paid_on date default null,
  p_amount numeric default null,
  p_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payables;
  v_pay public.payments;
  v_today date := private.br_today();
  v_paid_on date;
begin
  perform private.require_finance_writer();
  select * into r from public.payables where id = p_payable_id and office_id = private.my_office() for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  if r.canceled_at is not null then
    raise exception 'Conta cancelada não pode ser paga.' using errcode = '23514';
  end if;

  select * into v_pay from public.payments where payable_id = r.id;
  if found then
    return jsonb_build_object('status', 'already_paid', 'payment_id', v_pay.id, 'paid_on', v_pay.paid_on);
  end if;

  v_paid_on := coalesce(p_paid_on, v_today);
  if v_paid_on > v_today then
    raise exception 'A data do pagamento não pode ser futura.' using errcode = '23514';
  end if;

  insert into public.payments (payable_id, amount, paid_on, method)
  values (r.id, coalesce(p_amount, r.amount), v_paid_on, nullif(btrim(p_method), ''))
  returning * into v_pay;

  return jsonb_build_object('status', 'paid', 'payment_id', v_pay.id, 'paid_on', v_pay.paid_on);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_paid');
end;
$$;

create or replace function public.cancel_receivable(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.receivables;
begin
  perform private.require_finance_writer();
  select * into r from public.receivables where id = p_id and office_id = private.my_office() for update;
  if not found then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  if r.canceled_at is not null then return; end if;
  if exists (select 1 from public.payments where receivable_id = r.id) then
    raise exception 'Cobrança já recebida não pode ser cancelada.' using errcode = '23514';
  end if;
  update public.receivables
     set canceled_at = now(), canceled_by = (select auth.uid()), cancel_reason = nullif(btrim(p_reason), '')
   where id = r.id;
end;
$$;

create or replace function public.cancel_payable(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.payables;
begin
  perform private.require_finance_writer();
  select * into r from public.payables where id = p_id and office_id = private.my_office() for update;
  if not found then raise exception 'Conta não encontrada.' using errcode = 'P0002'; end if;
  if r.canceled_at is not null then return; end if;
  if exists (select 1 from public.payments where payable_id = r.id) then
    raise exception 'Conta já paga não pode ser cancelada.' using errcode = '23514';
  end if;
  update public.payables
     set canceled_at = now(), canceled_by = (select auth.uid()), cancel_reason = nullif(btrim(p_reason), '')
   where id = r.id;
end;
$$;

-- Honorários mensais: só os clientes FIXO do escritório do chamador.
create or replace function public.generate_monthly_fees(p_competence date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp date := date_trunc('month', coalesce(p_competence, private.br_today())::timestamp)::date;
  v_last date := (v_comp + interval '1 month - 1 day')::date;
  v_rows integer;
begin
  perform private.require_finance_writer();
  insert into public.receivables (office_id, client_id, description, category, competence, amount, due_date, is_demo)
  select c.office_id,
         c.id,
         'Honorários ' || to_char(v_comp, 'MM/YYYY'),
         'HONORARIOS',
         v_comp,
         c.monthly_fee,
         v_comp + (least(c.fee_due_day::int, extract(day from v_last)::int) - 1),
         c.is_demo
    from public.clients c
   where c.office_id = private.my_office()
     and c.active
     and c.kind = 'FIXO'
     and c.monthly_fee > 0
     and c.contract_start <= v_last
  on conflict (client_id, competence) where category = 'HONORARIOS' and canceled_at is null
  do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.generate_payable_occurrences(p_until date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.br_today();
  v_until date := coalesce(p_until, private.br_today() + 35);
  v_rule public.recurrence_rules;
  v_tpl public.payables;
  v_step integer;
  v_n integer;
  v_base date;
  v_day integer;
  v_due date;
  v_rows integer;
  v_total integer := 0;
begin
  perform private.require_finance_writer();
  for v_rule in
    select * from public.recurrence_rules
     where kind = 'PAGAR' and active and office_id = private.my_office()
  loop
    select * into v_tpl from public.payables
     where recurrence_rule_id = v_rule.id and office_id = v_rule.office_id
     order by (canceled_at is null) desc, due_date desc
     limit 1;
    if not found then continue; end if;

    v_step := case v_rule.frequency when 'MENSAL' then 1 when 'SEMESTRAL' then 6 else 12 end;
    v_n := 0;
    loop
      v_base := (date_trunc('month', v_rule.start_date::timestamp) + make_interval(months => v_n * v_step))::date;
      v_day := least(v_rule.day_of_month::int, extract(day from (v_base + interval '1 month - 1 day'))::int);
      v_due := v_base + (v_day - 1);
      exit when v_due > v_until or (v_rule.end_date is not null and v_due > v_rule.end_date);
      if v_due >= v_rule.start_date then
        insert into public.payables
          (office_id, description, category_id, supplier, amount, issue_date, due_date, recurrence_rule_id, notes, is_demo)
        values
          (v_rule.office_id, v_tpl.description, v_tpl.category_id, v_tpl.supplier, v_tpl.amount, v_today, v_due,
           v_rule.id, v_tpl.notes, v_tpl.is_demo)
        on conflict (recurrence_rule_id, due_date) do nothing;
        get diagnostics v_rows = row_count;
        v_total := v_total + v_rows;
      end if;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_total;
end;
$$;

create or replace function public.create_payable(
  p_description text,
  p_category_id uuid,
  p_supplier text,
  p_amount numeric,
  p_issue_date date,
  p_due_date date,
  p_notes text default null,
  p_frequency public.recurrence_frequency default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule uuid;
  v_id uuid;
begin
  perform private.require_finance_writer();
  if not exists (select 1 from public.financial_categories where id = p_category_id and office_id = private.my_office()) then
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;
  if p_frequency is not null then
    insert into public.recurrence_rules (kind, frequency, start_date, day_of_month)
    values ('PAGAR', p_frequency, p_due_date, extract(day from p_due_date)::int)
    returning id into v_rule;
  end if;

  insert into public.payables
    (description, category_id, supplier, amount, issue_date, due_date, recurrence_rule_id, notes)
  values
    (btrim(p_description), p_category_id, btrim(p_supplier), p_amount, p_issue_date, p_due_date, v_rule, nullif(btrim(p_notes), ''))
  returning id into v_id;

  if v_rule is not null then
    perform public.generate_payable_occurrences();
  end if;
  return v_id;
end;
$$;

-- Serviço avulso parcelado.
create or replace function private.make_installments(
  p_client_id uuid,
  p_description text,
  p_total numeric,
  p_n integer,
  p_first_due date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
  v_cents bigint := round(p_total * 100);
  v_base bigint;
  v_rem bigint;
  v_day integer := extract(day from p_first_due)::int;
  v_month date;
  v_due date;
  v_demo boolean;
  i integer;
begin
  if p_n is null or p_n not between 1 and 5 then
    raise exception 'O parcelamento permite de 1 a 5 parcelas.' using errcode = '23514';
  end if;
  if p_total is null or v_cents <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '23514';
  end if;
  v_base := v_cents / p_n;
  v_rem := v_cents - v_base * p_n;
  if v_base < 1 then
    raise exception 'Valor muito baixo para o número de parcelas.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Informe a descrição do serviço.' using errcode = '23514';
  end if;
  select is_demo into v_demo from public.clients
   where id = p_client_id and active and office_id = private.my_office();
  if not found then
    raise exception 'Cliente não encontrado ou inativo.' using errcode = 'P0002';
  end if;

  for i in 1..p_n loop
    v_month := (date_trunc('month', p_first_due::timestamp) + make_interval(months => i - 1))::date;
    v_due := v_month + (least(v_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    insert into public.receivables
      (client_id, description, category, competence, amount, due_date,
       installment_group_id, installment_number, installment_total, is_demo)
    values
      (p_client_id,
       case when p_n = 1 then btrim(p_description)
            else btrim(p_description) || ' — parcela ' || i || '/' || p_n end,
       'OUTROS', v_month,
       (v_base + case when i = 1 then v_rem else 0 end)::numeric / 100,
       v_due, v_group, i, p_n, v_demo);
  end loop;
  return v_group;
end;
$$;

create or replace function public.update_installment_plan(
  p_group uuid,
  p_description text,
  p_total numeric,
  p_installments integer,
  p_first_due date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_office uuid := private.my_office();
  v_client uuid;
  v_demo boolean;
  v_total_cents bigint := round(p_total * 100);
  v_paid_cents bigint;
  v_paid_count integer;
  v_open_count integer;
  v_remaining bigint;
  v_base bigint;
  v_rest bigint;
  v_final integer;
  v_day integer := extract(day from p_first_due)::int;
  v_month date;
  v_due date;
  i integer;
begin
  perform private.require_service_editor();

  perform 1 from public.receivables where installment_group_id = p_group and office_id = v_office for update;
  if not found then
    raise exception 'Serviço não encontrado.' using errcode = 'P0002';
  end if;
  select client_id, is_demo into v_client, v_demo
    from public.receivables where installment_group_id = p_group and office_id = v_office limit 1;

  select coalesce(sum(p.amount * 100), 0)::bigint, count(*)::int
    into v_paid_cents, v_paid_count
    from public.receivables r
    join public.payments p on p.receivable_id = r.id
   where r.installment_group_id = p_group and r.office_id = v_office and r.canceled_at is null;

  select count(*)::int into v_open_count
    from public.receivables r
   where r.installment_group_id = p_group and r.office_id = v_office and r.canceled_at is null
     and not exists (select 1 from public.payments p where p.receivable_id = r.id);

  if v_open_count = 0 then
    raise exception 'Não há parcelas em aberto neste serviço.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Informe a descrição do serviço.' using errcode = '23514';
  end if;
  if p_installments is null or p_installments < 1 or p_installments > 5 - v_paid_count then
    raise exception 'O serviço permite no máximo 5 parcelas no total (% já paga(s)).', v_paid_count
      using errcode = '23514';
  end if;
  v_remaining := v_total_cents - v_paid_cents;
  if v_remaining < p_installments then
    raise exception 'O valor total deve ser maior que o já pago (R$ %).', to_char(v_paid_cents / 100.0, 'FM999G999G990D00')
      using errcode = '23514';
  end if;

  v_base := v_remaining / p_installments;
  v_rest := v_remaining - v_base * p_installments;
  v_final := v_paid_count + p_installments;

  set constraints public.receivables_installment_uq deferred;

  update public.receivables r
     set canceled_at = now(), canceled_by = (select auth.uid()), cancel_reason = 'Serviço reparcelado',
         installment_group_id = null, installment_number = null, installment_total = null
   where r.installment_group_id = p_group and r.office_id = v_office and r.canceled_at is null
     and not exists (select 1 from public.payments p where p.receivable_id = r.id);

  update public.receivables
     set installment_group_id = null, installment_number = null, installment_total = null
   where installment_group_id = p_group and office_id = v_office and canceled_at is not null;

  update public.receivables r
     set installment_number = x.rn,
         installment_total = v_final,
         description = case when v_final > 1
                            then btrim(p_description) || ' — parcela ' || x.rn || '/' || v_final
                            else btrim(p_description) end
    from (select id, row_number() over (order by due_date, id)::int as rn
            from public.receivables
           where installment_group_id = p_group and office_id = v_office and canceled_at is null) x
   where r.id = x.id;

  for i in 1..p_installments loop
    v_month := (date_trunc('month', p_first_due::timestamp) + make_interval(months => i - 1))::date;
    v_due := v_month + (least(v_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    insert into public.receivables
      (client_id, description, category, competence, amount, due_date,
       installment_group_id, installment_number, installment_total, is_demo)
    values
      (v_client,
       case when v_final > 1
            then btrim(p_description) || ' — parcela ' || (v_paid_count + i) || '/' || v_final
            else btrim(p_description) end,
       'OUTROS', v_month,
       (v_base + case when i = 1 then v_rest else 0 end)::numeric / 100,
       v_due, p_group, v_paid_count + i, v_final, v_demo);
  end loop;

  return p_group;
end;
$$;

-- Cliente eventual + parcelas: o escritório vem do usuário (default), nunca do JSON enviado.
create or replace function public.create_occasional_client(
  p_client jsonb,
  p_description text,
  p_total numeric,
  p_installments integer,
  p_first_due date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(private.app_role()::text, '') not in ('ADMIN', 'CONTADOR') then
    raise exception 'Seu perfil não tem permissão para cadastrar clientes.' using errcode = '42501';
  end if;

  insert into public.clients (
    office_id, legal_name, trade_name, document, state_registration, municipal_registration,
    zip, street, number, complement, district, city, state, phone, email,
    tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes, kind,
    rg, representative_name, representative_rg, representative_document, representative_zip,
    representative_street, representative_number, representative_complement,
    representative_district, representative_city, representative_state
  ) values (
    private.my_office(),
    p_client ->> 'legal_name', p_client ->> 'trade_name', p_client ->> 'document',
    nullif(p_client ->> 'state_registration', ''), nullif(p_client ->> 'municipal_registration', ''),
    p_client ->> 'zip', p_client ->> 'street', p_client ->> 'number', nullif(p_client ->> 'complement', ''),
    p_client ->> 'district', p_client ->> 'city', (p_client ->> 'state')::char(2),
    p_client ->> 'phone', p_client ->> 'email',
    (p_client ->> 'tax_regime')::public.tax_regime, (p_client ->> 'contract_start')::date,
    array(select jsonb_array_elements_text(p_client -> 'modules')),
    0, 1, coalesce((p_client ->> 'active')::boolean, true), nullif(p_client ->> 'notes', ''), 'EVENTUAL',
    nullif(p_client ->> 'rg', ''), nullif(p_client ->> 'representative_name', ''),
    nullif(p_client ->> 'representative_rg', ''), nullif(p_client ->> 'representative_document', ''),
    nullif(p_client ->> 'representative_zip', ''), nullif(p_client ->> 'representative_street', ''),
    nullif(p_client ->> 'representative_number', ''), nullif(p_client ->> 'representative_complement', ''),
    nullif(p_client ->> 'representative_district', ''), nullif(p_client ->> 'representative_city', ''),
    nullif(p_client ->> 'representative_state', '')::char(2)
  ) returning id into v_id;

  perform private.make_installments(v_id, p_description, p_total, p_installments, p_first_due);
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------- tarefas
create or replace function public.save_task_type(
  p_id uuid,
  p_name text,
  p_category text,
  p_description text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_task_editor();
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Informe o nome da tarefa.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_category), '') = '' then
    raise exception 'Selecione a categoria.' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.task_types (name, category, description, active)
    values (btrim(p_name), btrim(p_category), nullif(btrim(p_description), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.task_types
       set name = btrim(p_name), category = btrim(p_category),
           description = nullif(btrim(p_description), ''), active = coalesce(p_active, true)
     where id = p_id and office_id = private.my_office()
    returning id into v_id;
    if v_id is null then
      raise exception 'Tarefa do catálogo não encontrada.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe uma tarefa cadastrada com este nome.' using errcode = '23514';
end;
$$;

create or replace function private.make_task(
  p_client_id uuid,
  p_task_type_id uuid,
  p_due_date date,
  p_assignee_id uuid,
  p_frequency public.recurrence_frequency,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.task_types;
  v_rule uuid;
  v_def uuid;
  v_exec uuid;
begin
  select * into t from public.task_types
   where id = p_task_type_id and active and office_id = private.my_office();
  if not found then
    raise exception 'Tarefa do catálogo não encontrada ou inativa.' using errcode = 'P0002';
  end if;
  if p_due_date is null then
    raise exception 'Informe o prazo de cada tarefa.' using errcode = '23514';
  end if;

  if p_frequency is not null then
    insert into public.recurrence_rules (kind, frequency, start_date, day_of_month)
    values ('TAREFA', p_frequency, p_due_date, extract(day from p_due_date)::int)
    returning id into v_rule;
  end if;

  insert into public.task_definitions
    (client_id, title, description, category, assignee_id, recurrence_rule_id, notes, task_type_id)
  values
    (p_client_id, t.name, t.description, t.category, p_assignee_id, v_rule, nullif(btrim(p_notes), ''), t.id)
  returning id into v_def;

  insert into public.task_executions (definition_id, due_date)
  values (v_def, p_due_date)
  returning id into v_exec;
  return v_exec;
end;
$$;

create or replace function private.check_task_target(p_client_id uuid, p_assignee_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.clients
                  where id = p_client_id and active and office_id = private.my_office()) then
    raise exception 'Cliente não encontrado ou inativo.' using errcode = 'P0002';
  end if;
  if p_assignee_id is not null
     and not exists (select 1 from public.profiles
                      where id = p_assignee_id and active and office_id = private.my_office()) then
    raise exception 'Responsável inválido.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.update_task(
  p_execution_id uuid,
  p_due_date date,
  p_assignee_id uuid default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare e public.task_executions;
begin
  perform private.require_task_editor();
  select * into e from public.task_executions
   where id = p_execution_id and office_id = private.my_office() for update;
  if not found then raise exception 'Tarefa não encontrada.' using errcode = 'P0002'; end if;
  if e.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception 'Tarefa finalizada não pode ser editada.' using errcode = '23514';
  end if;
  if p_assignee_id is not null
     and not exists (select 1 from public.profiles
                      where id = p_assignee_id and active and office_id = private.my_office()) then
    raise exception 'Responsável inválido.' using errcode = '23514';
  end if;

  update public.task_definitions
     set assignee_id = p_assignee_id, notes = nullif(btrim(p_notes), '')
   where id = e.definition_id and office_id = e.office_id;
  update public.task_executions set due_date = p_due_date where id = e.id;
exception
  when unique_violation then
    raise exception 'Já existe uma ocorrência desta tarefa neste prazo.' using errcode = '23514';
end;
$$;

create or replace function public.set_task_status(
  p_execution_id uuid,
  p_status public.task_status,
  p_notes text default null,
  p_stop_series boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.app_role();
  v_office uuid := private.my_office();
  e public.task_executions;
  d public.task_definitions;
  r public.recurrence_rules;
  v_next uuid;
  v_next_due date;
begin
  if v_role is null then
    raise exception 'Seu perfil não tem permissão para esta operação.' using errcode = '42501';
  end if;
  if p_status = 'PENDENTE' then
    raise exception 'Não é possível voltar uma tarefa para pendente.' using errcode = '23514';
  end if;

  select * into e from public.task_executions where id = p_execution_id and office_id = v_office for update;
  if not found then raise exception 'Tarefa não encontrada.' using errcode = 'P0002'; end if;
  select * into d from public.task_definitions where id = e.definition_id and office_id = v_office;

  if v_role = 'OPERADOR' and (d.assignee_id is distinct from (select auth.uid()) or p_status = 'CANCELADA') then
    raise exception 'Seu perfil só pode atualizar tarefas atribuídas a você.' using errcode = '42501';
  end if;

  if e.status = p_status then
    return jsonb_build_object('status', 'unchanged');
  end if;
  if e.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception 'Tarefa já finalizada.' using errcode = '23514';
  end if;
  if p_status = 'EM_ANDAMENTO' and e.status <> 'PENDENTE' then
    raise exception 'Transição de status inválida.' using errcode = '23514';
  end if;

  if p_status = 'EM_ANDAMENTO' then
    update public.task_executions set status = 'EM_ANDAMENTO', started_at = now() where id = e.id;
    return jsonb_build_object('status', 'changed');
  end if;

  if p_status = 'CONCLUIDA' then
    update public.task_executions
       set status = 'CONCLUIDA', completed_at = now(), completed_by = (select auth.uid()),
           completion_notes = nullif(btrim(p_notes), '')
     where id = e.id;
  else
    update public.task_executions
       set status = 'CANCELADA', canceled_at = now(), completion_notes = nullif(btrim(p_notes), '')
     where id = e.id;
  end if;

  if d.recurrence_rule_id is not null then
    if p_stop_series then
      update public.recurrence_rules set active = false where id = d.recurrence_rule_id and office_id = v_office;
      update public.task_definitions set active = false where id = d.id and office_id = v_office;
    else
      select * into r from public.recurrence_rules
       where id = d.recurrence_rule_id and active and office_id = v_office;
      if found then
        v_next_due := private.next_task_due(e.due_date, r.frequency, r.day_of_month::int);
        if r.end_date is null or v_next_due <= r.end_date then
          insert into public.task_executions (definition_id, due_date)
          values (d.id, v_next_due)
          on conflict (definition_id, due_date) do nothing
          returning id into v_next;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('status', 'changed', 'next_id', v_next);
end;
$$;

-- ------------------------------------------------------------------ dados do escritório e contratos
create or replace function public.save_office_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.app_role()::text, '') <> 'ADMIN' then
    raise exception 'Somente o administrador pode alterar os dados do escritório.' using errcode = '42501';
  end if;
  insert into public.office_settings (
    office_id, legal_name, trade_name, document, crc, representative_name, representative_document, representative_role,
    representative_crc, zip, street, number, complement, district, city, state, phone, email, default_forum,
    pix_key, updated_by
  ) values (
    private.my_office(),
    nullif(btrim(p ->> 'legal_name'), ''), nullif(btrim(p ->> 'trade_name'), ''), nullif(btrim(p ->> 'document'), ''),
    nullif(btrim(p ->> 'crc'), ''), nullif(btrim(p ->> 'representative_name'), ''),
    nullif(btrim(p ->> 'representative_document'), ''), nullif(btrim(p ->> 'representative_role'), ''),
    nullif(btrim(p ->> 'representative_crc'), ''), nullif(btrim(p ->> 'zip'), ''), nullif(btrim(p ->> 'street'), ''),
    nullif(btrim(p ->> 'number'), ''), nullif(btrim(p ->> 'complement'), ''), nullif(btrim(p ->> 'district'), ''),
    nullif(btrim(p ->> 'city'), ''), nullif(btrim(p ->> 'state'), '')::char(2), nullif(btrim(p ->> 'phone'), ''),
    nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'default_forum'), ''), nullif(btrim(p ->> 'pix_key'), ''),
    (select auth.uid())
  )
  on conflict (office_id) do update set
    legal_name = excluded.legal_name, trade_name = excluded.trade_name, document = excluded.document,
    crc = excluded.crc, representative_name = excluded.representative_name,
    representative_document = excluded.representative_document, representative_role = excluded.representative_role,
    representative_crc = excluded.representative_crc, zip = excluded.zip, street = excluded.street,
    number = excluded.number, complement = excluded.complement, district = excluded.district, city = excluded.city,
    state = excluded.state, phone = excluded.phone, email = excluded.email, default_forum = excluded.default_forum,
    pix_key = excluded.pix_key, updated_by = excluded.updated_by;
end;
$$;

create or replace function public.save_contract_template(
  p_id uuid,
  p_name text,
  p_audience public.contract_audience,
  p_body text,
  p_active boolean default true,
  p_party public.contract_party default 'QUALQUER'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_contract_manager();
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Informe o nome do modelo.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'O texto do modelo não pode ficar vazio.' using errcode = '23514';
  end if;
  if p_id is null then
    insert into public.contract_templates (name, audience, body, active, party)
    values (btrim(p_name), coalesce(p_audience, 'TODOS'), p_body, coalesce(p_active, true), coalesce(p_party, 'QUALQUER'))
    returning id into v_id;
  else
    update public.contract_templates
       set name = btrim(p_name), audience = coalesce(p_audience, 'TODOS'), body = p_body,
           active = coalesce(p_active, true), party = coalesce(p_party, 'QUALQUER')
     where id = p_id and office_id = private.my_office()
    returning id into v_id;
    if v_id is null then
      raise exception 'Modelo não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe um modelo com este nome.' using errcode = '23514';
end;
$$;

create or replace function public.issue_contract(
  p_client_id uuid,
  p_template_id uuid,
  p_variables jsonb,
  p_body text,
  p_issued_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_office uuid := private.my_office();
  t public.contract_templates;
  v_year integer;
  v_last integer;
  v_number text;
  v_body text;
  v_id uuid;
begin
  perform private.require_contract_manager();
  if not exists (select 1 from public.clients where id = p_client_id and office_id = v_office) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  select * into t from public.contract_templates where id = p_template_id and active and office_id = v_office;
  if not found then
    raise exception 'Modelo não encontrado ou inativo.' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_body), '') = '' or length(p_body) > 400000 then
    raise exception 'Texto do contrato inválido.' using errcode = '23514';
  end if;
  if p_issued_on is null or p_issued_on not between private.br_today() - 1 and private.br_today() + 1 then
    raise exception 'Data de emissão inválida.' using errcode = '23514';
  end if;
  if p_variables is null or jsonb_typeof(p_variables) <> 'object' then
    raise exception 'Dados do contrato inválidos.' using errcode = '23514';
  end if;

  v_year := extract(year from p_issued_on)::int;
  insert into public.contract_counters (office_id, year, last) values (v_office, v_year, 1)
  on conflict (office_id, year) do update set last = public.contract_counters.last + 1
  returning last into v_last;
  v_number := v_year || '/' || lpad(v_last::text, 3, '0');

  v_body := replace(p_body, '{{contrato.numero}}', v_number);
  insert into public.contracts (number, client_id, template_id, template_name, issued_on, variables, body)
  values (v_number, p_client_id, t.id, t.name, p_issued_on,
          p_variables || jsonb_build_object('contrato.numero', v_number), v_body)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

create or replace function public.cancel_contract(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.contracts;
begin
  perform private.require_contract_manager();
  select * into c from public.contracts where id = p_id and office_id = private.my_office() for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if c.status = 'CANCELADO' then return; end if;
  update public.contracts
     set status = 'CANCELADO', canceled_at = now(), canceled_by = (select auth.uid()),
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_id;
end;
$$;
