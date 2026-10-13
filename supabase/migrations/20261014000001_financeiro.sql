-- Gestão Contábil — financeiro (Etapa 3): categorias, recorrência, cobranças a receber, contas a pagar e pagamentos.
-- Execute no SQL Editor DEPOIS das migrações 0001–0003 e ANTES das 0005 e 0006.
--
-- Decisões:
--  * dinheiro em numeric(12,2); competência (`competence`, sempre dia 1), vencimento (`due_date`) e pagamento
--    (`paid_on`, em payments) são datas separadas
--  * o STATUS não é gravado: é derivado (pago = existe pagamento; cancelado = canceled_at; vencido = vencimento < hoje
--    sem pagamento). Assim uma cobrança vencida nunca aparece como "pendente"
--  * cobrança de honorários: no máximo UMA ativa por cliente e competência (índice único parcial)
--  * pagamento: no máximo UM por cobrança/conta (UNIQUE) e gravado só por função com bloqueio de linha (atômico, idempotente)
--  * cobranças não são excluídas: são canceladas. Cobrança paga não pode ser cancelada nem ter valor/vencimento alterados
--  * o valor da cobrança é copiado do contrato no momento da geração: alterar os honorários do cliente não muda o passado
--  * toda alteração financeira é registrada em audit_log por trigger

create type public.receivable_category as enum ('HONORARIOS', 'OUTROS');
create type public.recurrence_frequency as enum ('MENSAL', 'SEMESTRAL', 'ANUAL');
create type public.rule_kind as enum ('PAGAR', 'TAREFA');

-- --------------------------------------------------------- financial_categories
create table public.financial_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  kind        text not null check (kind in ('PAGAR', 'RECEBER')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (kind, name)
);

insert into public.financial_categories (name, kind) values
  ('Aluguel', 'PAGAR'), ('Utilidades', 'PAGAR'), ('Salários', 'PAGAR'), ('Impostos', 'PAGAR'),
  ('Software', 'PAGAR'), ('Material', 'PAGAR'), ('Taxas', 'PAGAR'), ('Outras', 'PAGAR');

-- -------------------------------------------------------------- recurrence_rules
-- Regra de recorrência. Para contas a pagar, o "modelo" é a ocorrência mais recente da própria regra.
create table public.recurrence_rules (
  id            uuid primary key default gen_random_uuid(),
  kind          public.rule_kind not null,
  frequency     public.recurrence_frequency not null,
  start_date    date not null,
  day_of_month  smallint not null check (day_of_month between 1 and 31),
  end_date      date check (end_date is null or end_date >= start_date),
  active        boolean not null default true,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger recurrence_rules_updated_at before update on public.recurrence_rules
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------------ receivables
create table public.receivables (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id),
  description   text not null check (length(btrim(description)) > 0),
  category      public.receivable_category not null default 'OUTROS',
  competence    date not null check (extract(day from competence) = 1),
  amount        numeric(12, 2) not null check (amount > 0),
  due_date      date not null,
  notes         text,
  canceled_at   timestamptz,
  canceled_by   uuid,
  cancel_reason text,
  is_demo       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Uma cobrança de honorários ATIVA por cliente e competência (cancelada libera a competência).
create unique index receivables_fee_competence_key
  on public.receivables (client_id, competence)
  where category = 'HONORARIOS' and canceled_at is null;
create index receivables_due_date_idx on public.receivables (due_date);
create index receivables_client_idx on public.receivables (client_id, competence desc);
create trigger receivables_updated_at before update on public.receivables
  for each row execute function private.set_updated_at();

-- --------------------------------------------------------------------- payables
create table public.payables (
  id                  uuid primary key default gen_random_uuid(),
  description         text not null check (length(btrim(description)) > 0),
  category_id         uuid not null references public.financial_categories (id),
  supplier            text not null check (length(btrim(supplier)) > 0),
  amount              numeric(12, 2) not null check (amount > 0),
  issue_date          date not null,
  due_date            date not null,
  recurrence_rule_id  uuid references public.recurrence_rules (id),
  notes               text,
  canceled_at         timestamptz,
  canceled_by         uuid,
  cancel_reason       text,
  is_demo             boolean not null default false,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- ocorrências de uma regra são identificadas pelo vencimento: rodar a geração de novo não duplica
  unique (recurrence_rule_id, due_date)
);
create index payables_due_date_idx on public.payables (due_date);
create index payables_category_idx on public.payables (category_id);
create trigger payables_updated_at before update on public.payables
  for each row execute function private.set_updated_at();

-- --------------------------------------------------------------------- payments
-- Recebimentos (receivable_id) e pagamentos (payable_id) efetivamente realizados. Imutável.
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  receivable_id  uuid unique references public.receivables (id),
  payable_id     uuid unique references public.payables (id),
  amount         numeric(12, 2) not null check (amount > 0),
  paid_on        date not null,
  method         text,
  notes          text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check (num_nonnulls(receivable_id, payable_id) = 1)
);
create index payments_paid_on_idx on public.payments (paid_on);

-- ------------------------------------------------------------------- auditoria
create trigger receivables_audit after insert or update or delete on public.receivables
  for each row execute function private.audit_row();
create trigger payables_audit after insert or update or delete on public.payables
  for each row execute function private.audit_row();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function private.audit_row();
create trigger recurrence_rules_audit after insert or update or delete on public.recurrence_rules
  for each row execute function private.audit_row();

-- ----------------------------------------------------- proteção contra edições inconsistentes
create or replace function private.guard_receivable_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.canceled_at is not null then
    raise exception 'Cobrança cancelada não pode ser alterada.' using errcode = '23514';
  end if;
  if (new.amount is distinct from old.amount or new.due_date is distinct from old.due_date)
     and exists (select 1 from public.payments p where p.receivable_id = old.id) then
    raise exception 'Cobrança já recebida não pode ter valor ou vencimento alterados.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger receivables_guard before update on public.receivables
  for each row execute function private.guard_receivable_update();

create or replace function private.guard_payable_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.canceled_at is not null then
    raise exception 'Conta cancelada não pode ser alterada.' using errcode = '23514';
  end if;
  if (new.amount is distinct from old.amount or new.due_date is distinct from old.due_date)
     and exists (select 1 from public.payments p where p.payable_id = old.id) then
    raise exception 'Conta já paga não pode ter valor ou vencimento alterados.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger payables_guard before update on public.payables
  for each row execute function private.guard_payable_update();

-- ============================================================ funções (RPC) atômicas
-- Todas: SECURITY DEFINER, conferem o perfil do chamador e rodam em uma única transação.

create or replace function private.br_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function private.require_finance_writer()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.app_role()::text, '') not in ('ADMIN', 'FINANCEIRO') then
    raise exception 'Seu perfil não tem permissão para esta operação financeira.' using errcode = '42501';
  end if;
end;
$$;

-- Registra o recebimento de uma cobrança. Idempotente: chamar de novo devolve "already_paid" sem duplicar.
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
  select * into r from public.receivables where id = p_receivable_id for update;
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
  select * into r from public.payables where id = p_payable_id for update;
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

-- Cancelamento (nunca exclusão). Cobrança/conta já paga não pode ser cancelada.
create or replace function public.cancel_receivable(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.receivables;
begin
  perform private.require_finance_writer();
  select * into r from public.receivables where id = p_id for update;
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
  select * into r from public.payables where id = p_id for update;
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

-- Gera os honorários mensais da competência para todos os clientes ATIVOS. Idempotente:
-- o índice único parcial impede duplicar; rodar de novo devolve 0.
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
     and c.monthly_fee > 0
     and c.contract_start <= v_last
  on conflict (client_id, competence) where category = 'HONORARIOS' and canceled_at is null
  do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Gera as ocorrências futuras das regras de recorrência de contas a pagar (até o horizonte).
-- Idempotente: (regra, vencimento) é único.
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
    select * from public.recurrence_rules where kind = 'PAGAR' and active
  loop
    select * into v_tpl from public.payables
     where recurrence_rule_id = v_rule.id
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
          (description, category_id, supplier, amount, issue_date, due_date, recurrence_rule_id, notes, is_demo)
        values
          (v_tpl.description, v_tpl.category_id, v_tpl.supplier, v_tpl.amount, v_today, v_due, v_rule.id, v_tpl.notes, v_tpl.is_demo)
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

-- Cria uma conta a pagar. Com p_frequency, cria a regra de recorrência e a primeira ocorrência na mesma transação.
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
