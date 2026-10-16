-- Gestão Contábil — dados exigidos pelo contrato padrão do escritório.
-- Execute no SQL Editor DEPOIS da 0021 (escritório e contratos).
--
--  * clients: RG (pessoa física) e "representante legal" (nome, RG, CPF e endereço de residência) para empresas
--  * office_settings: chave PIX para recebimento dos honorários
--  * contract_templates.party: modelo para empresa (PJ), pessoa física (PF) ou qualquer cliente
--  * a emissão do contrato só acontece com os dados necessários (a tela avisa o que falta)

-- ------------------------------------------------------------------ clientes
alter table public.clients
  add column rg                      text,
  add column representative_name     text,
  add column representative_rg       text,
  add column representative_document text check (representative_document is null or representative_document ~ '^[0-9]{11}$'),
  add column representative_zip      text check (representative_zip is null or representative_zip ~ '^[0-9]{8}$'),
  add column representative_street   text,
  add column representative_number   text,
  add column representative_complement text,
  add column representative_district text,
  add column representative_city     text,
  add column representative_state    char(2) check (representative_state is null or representative_state ~ '^[A-Z]{2}$');

-- Quem cadastra/edita clientes (ADMIN e CONTADOR, via RLS) também grava os novos campos.
grant insert (rg, representative_name, representative_rg, representative_document, representative_zip,
              representative_street, representative_number, representative_complement,
              representative_district, representative_city, representative_state)
  on public.clients to authenticated;
grant update (rg, representative_name, representative_rg, representative_document, representative_zip,
              representative_street, representative_number, representative_complement,
              representative_district, representative_city, representative_state)
  on public.clients to authenticated;

-- ---------------------------------------------------------------- escritório
alter table public.office_settings add column pix_key text;

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
    representative_crc, zip, street, number, complement, district, city, state, phone, email, default_forum,
    pix_key, updated_by
  ) values (
    nullif(btrim(p ->> 'legal_name'), ''), nullif(btrim(p ->> 'trade_name'), ''), nullif(btrim(p ->> 'document'), ''),
    nullif(btrim(p ->> 'crc'), ''), nullif(btrim(p ->> 'representative_name'), ''),
    nullif(btrim(p ->> 'representative_document'), ''), nullif(btrim(p ->> 'representative_role'), ''),
    nullif(btrim(p ->> 'representative_crc'), ''), nullif(btrim(p ->> 'zip'), ''), nullif(btrim(p ->> 'street'), ''),
    nullif(btrim(p ->> 'number'), ''), nullif(btrim(p ->> 'complement'), ''), nullif(btrim(p ->> 'district'), ''),
    nullif(btrim(p ->> 'city'), ''), nullif(btrim(p ->> 'state'), '')::char(2), nullif(btrim(p ->> 'phone'), ''),
    nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'default_forum'), ''), nullif(btrim(p ->> 'pix_key'), ''),
    (select auth.uid())
  )
  on conflict (singleton) do update set
    legal_name = excluded.legal_name, trade_name = excluded.trade_name, document = excluded.document,
    crc = excluded.crc, representative_name = excluded.representative_name,
    representative_document = excluded.representative_document, representative_role = excluded.representative_role,
    representative_crc = excluded.representative_crc, zip = excluded.zip, street = excluded.street,
    number = excluded.number, complement = excluded.complement, district = excluded.district, city = excluded.city,
    state = excluded.state, phone = excluded.phone, email = excluded.email, default_forum = excluded.default_forum,
    pix_key = excluded.pix_key, updated_by = excluded.updated_by;
end;
$$;

-- ------------------------------------------------------------------- modelos
create type public.contract_party as enum ('QUALQUER', 'PJ', 'PF');
alter table public.contract_templates add column party public.contract_party not null default 'QUALQUER';

-- Nova assinatura (com o tipo de pessoa); a antiga é removida para não haver duas versões.
drop function if exists public.save_contract_template(uuid, text, public.contract_audience, text, boolean);

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

revoke all on function public.save_contract_template(uuid, text, public.contract_audience, text, boolean, public.contract_party) from public, anon;
grant execute on function public.save_contract_template(uuid, text, public.contract_audience, text, boolean, public.contract_party) to authenticated;

-- ------------------------------------------- cliente eventual: grava RG e representante
-- (a função original da 0017 lista as colunas uma a uma; recriada com os campos novos)
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
    legal_name, trade_name, document, state_registration, municipal_registration,
    zip, street, number, complement, district, city, state, phone, email,
    tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes, kind,
    rg, representative_name, representative_rg, representative_document, representative_zip,
    representative_street, representative_number, representative_complement,
    representative_district, representative_city, representative_state
  ) values (
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
