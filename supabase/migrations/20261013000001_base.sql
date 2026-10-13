-- Gestão Contábil — esquema base (Etapa 2): usuários/perfis, clientes, histórico de honorários e auditoria.
-- Execute no SQL Editor do Supabase, UMA vez, antes das migrações 0002 e 0003.
--
-- Convenções:
--  * dinheiro em numeric(12,2) (nunca float); o app converte para centavos inteiros
--  * datas de calendário em `date`; instantes em timestamptz (UTC); fuso da operação: America/Sao_Paulo
--  * documentos e telefones guardados só com dígitos
--  * cliente nunca é excluído: é inativado (active = false), preservando financeiro e tarefas
--  * toda alteração em clientes é registrada em audit_log por trigger

create schema if not exists private;

create type public.user_role as enum ('ADMIN', 'CONTADOR', 'FINANCEIRO', 'OPERADOR');
create type public.tax_regime as enum ('MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles
-- Um perfil por usuário do Supabase Auth. Conta sem perfil ativo não acessa nada.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.user_role not null default 'OPERADOR',
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Novo usuário nasce SEM acesso (active = false, perfil mais restrito).
-- Um administrador libera o acesso e define o perfil.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Perfil do usuário logado; NULL se não existir ou estiver inativo.
create or replace function private.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active
$$;

-- ----------------------------------------------------------------- clients
create table public.clients (
  id                      uuid primary key default gen_random_uuid(),
  legal_name              text not null check (length(btrim(legal_name)) > 0),
  trade_name              text not null check (length(btrim(trade_name)) > 0),
  document                text not null check (document ~ '^([0-9]{11}|[0-9]{14})$'),
  state_registration      text,
  municipal_registration  text,
  zip                     text not null check (zip ~ '^[0-9]{8}$'),
  street                  text not null,
  number                  text not null,
  complement              text,
  district                text not null,
  city                    text not null,
  state                   char(2) not null check (state ~ '^[A-Z]{2}$'),
  phone                   text not null check (phone ~ '^[0-9]{10,11}$'),
  email                   text not null check (position('@' in email) > 1),
  tax_regime              public.tax_regime not null,
  contract_start          date not null,
  modules                 text[] not null
                            check (cardinality(modules) >= 1
                                   and modules <@ array['CONTABIL', 'FISCAL', 'FOLHA', 'SOCIETARIO']),
  monthly_fee             numeric(12, 2) not null check (monthly_fee >= 0),
  fee_due_day             smallint not null check (fee_due_day between 1 and 31),
  active                  boolean not null default true,
  notes                   text,
  is_demo                 boolean not null default false,
  created_by              uuid references public.profiles (id) default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Um cadastro por CNPJ/CPF.
create unique index clients_document_key on public.clients (document);
create index clients_trade_name_idx on public.clients (lower(trade_name));
create index clients_legal_name_idx on public.clients (lower(legal_name));
create index clients_active_idx on public.clients (active);

create trigger clients_updated_at before update on public.clients
  for each row execute function private.set_updated_at();

-- -------------------------------------------------- histórico de honorários
-- Guarda cada valor/dia de vencimento vigente. Cobranças já emitidas guardam o próprio valor
-- (Etapa 3); alterar o contrato não reescreve o passado.
create table public.client_fee_history (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references public.clients (id),
  monthly_fee  numeric(12, 2) not null check (monthly_fee >= 0),
  due_day      smallint not null check (due_day between 1 and 31),
  valid_from   date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index client_fee_history_client_idx on public.client_fee_history (client_id, valid_from desc);

create or replace function private.track_client_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.monthly_fee is distinct from old.monthly_fee
     or new.fee_due_day is distinct from old.fee_due_day then
    insert into public.client_fee_history (client_id, monthly_fee, due_day)
    values (new.id, new.monthly_fee, new.fee_due_day);
  end if;
  return null;
end;
$$;

create trigger clients_fee_history after insert or update on public.clients
  for each row execute function private.track_client_fee();

-- --------------------------------------------------------------- audit_log
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, at desc);

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (user_id, table_name, record_id, action, old_data)
    values ((select auth.uid()), tg_table_name, (to_jsonb(old) ->> 'id')::uuid, tg_op, to_jsonb(old));
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (user_id, table_name, record_id, action, new_data)
    values ((select auth.uid()), tg_table_name, (to_jsonb(new) ->> 'id')::uuid, tg_op, to_jsonb(new));
  else
    insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values ((select auth.uid()), tg_table_name, (to_jsonb(new) ->> 'id')::uuid, tg_op, to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end;
$$;

create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function private.audit_row();
