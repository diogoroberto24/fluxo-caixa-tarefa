-- Gestão Contábil — clientes eventuais e serviços avulsos parcelados.
-- Execute no SQL Editor DEPOIS das migrações anteriores, ANTES de publicar o código novo.
--
-- Regras:
--  * clients.kind: FIXO (comportamento atual, honorários mensais) ou EVENTUAL (serviço avulso, sem mensalidade)
--  * o tipo é definido na criação e NÃO pode ser alterado depois (não há grant de UPDATE em kind)
--  * generate_monthly_fees passa a ignorar clientes EVENTUAL (nunca gera mensalidade para eles)
--  * serviço avulso: 1 (à vista) a 5 parcelas mensais, sempre no dia do 1º vencimento
--    (mês mais curto usa o último dia; o dia original volta nos meses seguintes)
--  * centavos que não dividem igualmente ficam na 1ª parcela (a soma das parcelas é sempre o total)
--  * antecipar = registrar o pagamento de uma parcela antes do vencimento (register_receipt já permite)

create type public.client_kind as enum ('FIXO', 'EVENTUAL');

alter table public.clients add column kind public.client_kind not null default 'FIXO';

alter table public.receivables
  add column installment_group_id uuid,
  add column installment_number   smallint,
  add column installment_total    smallint,
  add constraint receivables_installment_chk check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (installment_group_id is not null
        and installment_total between 1 and 5
        and installment_number between 1 and installment_total)
  );

create unique index receivables_installment_key
  on public.receivables (installment_group_id, installment_number)
  where installment_group_id is not null;

-- Histórico de honorários só faz sentido para cliente fixo.
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
    insert into public.client_fee_history (client_id, monthly_fee, due_day)
    values (new.id, new.monthly_fee, new.fee_due_day);
  end if;
  return null;
end;
$$;

-- Honorários mensais: somente clientes FIXO.
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
  insert into public.receivables (client_id, description, category, competence, amount, due_date, is_demo)
  select c.id,
         'Honorários ' || to_char(v_comp, 'MM/YYYY'),
         'HONORARIOS',
         v_comp,
         c.monthly_fee,
         v_comp + (least(c.fee_due_day::int, extract(day from v_last)::int) - 1),
         c.is_demo
    from public.clients c
   where c.active
     and c.kind = 'FIXO'
     and c.monthly_fee > 0
     and c.contract_start <= v_last
  on conflict (client_id, competence) where category = 'HONORARIOS' and canceled_at is null
  do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Cria as parcelas (interna; quem chama confere o perfil).
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
  select is_demo into v_demo from public.clients where id = p_client_id and active;
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

-- Parcela um serviço avulso de um cliente existente (ADMIN e FINANCEIRO).
create or replace function public.create_installments(
  p_client_id uuid,
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
begin
  perform private.require_finance_writer();
  return private.make_installments(p_client_id, p_description, p_total, p_installments, p_first_due);
end;
$$;

-- Cadastra um cliente EVENTUAL e as cobranças do serviço na mesma transação (ADMIN e CONTADOR).
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
    tax_regime, contract_start, modules, monthly_fee, fee_due_day, active, notes, kind
  ) values (
    p_client ->> 'legal_name', p_client ->> 'trade_name', p_client ->> 'document',
    nullif(p_client ->> 'state_registration', ''), nullif(p_client ->> 'municipal_registration', ''),
    p_client ->> 'zip', p_client ->> 'street', p_client ->> 'number', nullif(p_client ->> 'complement', ''),
    p_client ->> 'district', p_client ->> 'city', (p_client ->> 'state')::char(2),
    p_client ->> 'phone', p_client ->> 'email',
    (p_client ->> 'tax_regime')::public.tax_regime, (p_client ->> 'contract_start')::date,
    array(select jsonb_array_elements_text(p_client -> 'modules')),
    0, 1, coalesce((p_client ->> 'active')::boolean, true), nullif(p_client ->> 'notes', ''), 'EVENTUAL'
  ) returning id into v_id;

  perform private.make_installments(v_id, p_description, p_total, p_installments, p_first_due);
  return v_id;
end;
$$;

revoke all on function public.create_installments(uuid, text, numeric, integer, date) from public, anon;
revoke all on function public.create_occasional_client(jsonb, text, numeric, integer, date) from public, anon;
revoke all on function private.make_installments(uuid, text, numeric, integer, date) from public, anon, authenticated;
grant execute on function public.create_installments(uuid, text, numeric, integer, date) to authenticated;
grant execute on function public.create_occasional_client(jsonb, text, numeric, integer, date) to authenticated;
