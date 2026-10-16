-- Gestão Contábil — dados do escritório (Configurações) e módulo de contratos (fase 1).
-- Execute no SQL Editor DEPOIS da 0020 (tarefas em lote).
--
-- Regras:
--  * office_settings: dados do escritório que saem no contrato (uma única linha). Edita: ADMIN. Lê: ADMIN e CONTADOR
--  * contract_templates: modelos de contrato com campos {{grupo.campo}}. Gerencia: ADMIN e CONTADOR
--  * contracts: contrato EMITIDO. O texto é uma CÓPIA (snapshot) do momento da emissão e NÃO muda mais, mesmo que o
--    cadastro do cliente ou o modelo mudem depois. Só pode ser CANCELADO (nunca excluído nem editado)
--  * número do contrato: ANO/NNN, gerado pelo banco com contador atômico (sem repetir, mesmo em emissões simultâneas);
--    o texto enviado traz {{contrato.numero}} e o banco o substitui pelo número real

create type public.contract_status as enum ('EMITIDO', 'CANCELADO');
create type public.contract_audience as enum ('FIXO', 'EVENTUAL', 'TODOS');

-- ------------------------------------------------------------ dados do escritório
create table public.office_settings (
  id                      uuid primary key default gen_random_uuid(),
  singleton               boolean not null default true unique check (singleton),
  legal_name              text,
  trade_name              text,
  document                text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  crc                     text,
  representative_name     text,
  representative_document text check (representative_document is null or representative_document ~ '^[0-9]{11}$'),
  representative_role     text,
  representative_crc      text,
  zip                     text check (zip is null or zip ~ '^[0-9]{8}$'),
  street                  text,
  number                  text,
  complement              text,
  district                text,
  city                    text,
  state                   char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  phone                   text check (phone is null or phone ~ '^[0-9]{10,11}$'),
  email                   text check (email is null or position('@' in email) > 1),
  default_forum           text,
  updated_by              uuid,
  updated_at              timestamptz not null default now()
);
create trigger office_settings_updated_at before update on public.office_settings
  for each row execute function private.set_updated_at();
create trigger office_settings_audit after insert or update or delete on public.office_settings
  for each row execute function private.audit_row();

-- --------------------------------------------------------------------- modelos
create table public.contract_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  audience    public.contract_audience not null default 'TODOS',
  body        text not null check (length(btrim(body)) > 0 and length(body) <= 200000),
  active      boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index contract_templates_name_key on public.contract_templates (lower(btrim(name)));
create trigger contract_templates_updated_at before update on public.contract_templates
  for each row execute function private.set_updated_at();
create trigger contract_templates_audit after insert or update or delete on public.contract_templates
  for each row execute function private.audit_row();

-- ------------------------------------------------------------------- contratos
create table public.contract_counters (
  year  integer primary key,
  last  integer not null default 0
);

create table public.contracts (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  client_id      uuid not null references public.clients (id),
  template_id    uuid references public.contract_templates (id),
  template_name  text not null,
  issued_on      date not null,
  variables      jsonb not null,
  body           text not null,
  status         public.contract_status not null default 'EMITIDO',
  canceled_at    timestamptz,
  canceled_by    uuid,
  cancel_reason  text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check ((status = 'CANCELADO') = (canceled_at is not null))
);
create index contracts_client_idx on public.contracts (client_id, issued_on desc);
create trigger contracts_audit after insert or update or delete on public.contracts
  for each row execute function private.audit_row();

-- O texto e os dados emitidos são imutáveis: só o cancelamento pode alterar a linha.
create or replace function private.guard_contract_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'CANCELADO' then
    raise exception 'Contrato cancelado não pode ser alterado.' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'status' - 'canceled_at' - 'canceled_by' - 'cancel_reason')
     is distinct from
     (to_jsonb(old) - 'status' - 'canceled_at' - 'canceled_by' - 'cancel_reason') then
    raise exception 'O texto e os dados de um contrato emitido não podem ser alterados.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger contracts_guard before update on public.contracts
  for each row execute function private.guard_contract_update();

create or replace function private.guard_contract_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Contratos não podem ser excluídos; cancele o contrato.' using errcode = '23514';
end;
$$;
create trigger contracts_no_delete before delete on public.contracts
  for each row execute function private.guard_contract_delete();

-- ------------------------------------------------------------------- segurança
alter table public.office_settings    enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_counters  enable row level security;
alter table public.contracts          enable row level security;

revoke all on public.office_settings, public.contract_templates, public.contract_counters, public.contracts
  from public, anon, authenticated;
grant select on public.office_settings, public.contract_templates, public.contracts to authenticated;
grant all on public.office_settings, public.contract_templates, public.contract_counters, public.contracts to service_role;

create policy office_settings_select on public.office_settings for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'CONTADOR'));
create policy contract_templates_select on public.contract_templates for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'CONTADOR'));
create policy contracts_select on public.contracts for select to authenticated
  using ((select private.app_role()) in ('ADMIN', 'CONTADOR'));

create or replace function private.require_contract_manager()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.app_role()::text, '') not in ('ADMIN', 'CONTADOR') then
    raise exception 'Seu perfil não tem permissão para esta operação com contratos.' using errcode = '42501';
  end if;
end;
$$;

-- ------------------------------------------------------------------- funções
-- Salva os dados do escritório (somente ADMIN). Campos vazios viram nulos.
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
    legal_name, trade_name, document, crc, representative_name, representative_document, representative_role,
    representative_crc, zip, street, number, complement, district, city, state, phone, email, default_forum, updated_by
  ) values (
    nullif(btrim(p ->> 'legal_name'), ''), nullif(btrim(p ->> 'trade_name'), ''), nullif(btrim(p ->> 'document'), ''),
    nullif(btrim(p ->> 'crc'), ''), nullif(btrim(p ->> 'representative_name'), ''),
    nullif(btrim(p ->> 'representative_document'), ''), nullif(btrim(p ->> 'representative_role'), ''),
    nullif(btrim(p ->> 'representative_crc'), ''), nullif(btrim(p ->> 'zip'), ''), nullif(btrim(p ->> 'street'), ''),
    nullif(btrim(p ->> 'number'), ''), nullif(btrim(p ->> 'complement'), ''), nullif(btrim(p ->> 'district'), ''),
    nullif(btrim(p ->> 'city'), ''), nullif(btrim(p ->> 'state'), '')::char(2), nullif(btrim(p ->> 'phone'), ''),
    nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'default_forum'), ''), (select auth.uid())
  )
  on conflict (singleton) do update set
    legal_name = excluded.legal_name, trade_name = excluded.trade_name, document = excluded.document,
    crc = excluded.crc, representative_name = excluded.representative_name,
    representative_document = excluded.representative_document, representative_role = excluded.representative_role,
    representative_crc = excluded.representative_crc, zip = excluded.zip, street = excluded.street,
    number = excluded.number, complement = excluded.complement, district = excluded.district, city = excluded.city,
    state = excluded.state, phone = excluded.phone, email = excluded.email, default_forum = excluded.default_forum,
    updated_by = excluded.updated_by;
end;
$$;

-- Cria (p_id nulo) ou edita um modelo.
create or replace function public.save_contract_template(
  p_id uuid,
  p_name text,
  p_audience public.contract_audience,
  p_body text,
  p_active boolean default true
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
    insert into public.contract_templates (name, audience, body, active)
    values (btrim(p_name), coalesce(p_audience, 'TODOS'), p_body, coalesce(p_active, true))
    returning id into v_id;
  else
    update public.contract_templates
       set name = btrim(p_name), audience = coalesce(p_audience, 'TODOS'), body = p_body, active = coalesce(p_active, true)
     where id = p_id
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

-- Emite o contrato: numera (ANO/NNN), troca {{contrato.numero}} no texto e guarda o snapshot.
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
  t public.contract_templates;
  v_year integer;
  v_last integer;
  v_number text;
  v_body text;
  v_id uuid;
begin
  perform private.require_contract_manager();
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  select * into t from public.contract_templates where id = p_template_id and active;
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
  insert into public.contract_counters (year, last) values (v_year, 1)
  on conflict (year) do update set last = public.contract_counters.last + 1
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
  select * into c from public.contracts where id = p_id for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if c.status = 'CANCELADO' then return; end if;
  update public.contracts
     set status = 'CANCELADO', canceled_at = now(), canceled_by = (select auth.uid()),
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_id;
end;
$$;

revoke all on function private.require_contract_manager() from public, anon, authenticated;
revoke all on function public.save_office_settings(jsonb) from public, anon;
revoke all on function public.save_contract_template(uuid, text, public.contract_audience, text, boolean) from public, anon;
revoke all on function public.issue_contract(uuid, uuid, jsonb, text, date) from public, anon;
revoke all on function public.cancel_contract(uuid, text) from public, anon;
grant execute on function public.save_office_settings(jsonb) to authenticated;
grant execute on function public.save_contract_template(uuid, text, public.contract_audience, text, boolean) to authenticated;
grant execute on function public.issue_contract(uuid, uuid, jsonb, text, date) to authenticated;
grant execute on function public.cancel_contract(uuid, text) to authenticated;
