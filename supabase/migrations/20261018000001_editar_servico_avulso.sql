-- Gestão Contábil — editar o serviço avulso (reparcelar) e lançar novo serviço para cliente existente.
-- Execute no SQL Editor DEPOIS da 0017 (clientes eventuais).
--
-- Regras:
--  * "Editar serviço" = reparcelar o SALDO EM ABERTO. Parcelas já pagas NÃO mudam (valor, data e pagamento intactos)
--  * as parcelas em aberto antigas são CANCELADAS (ficam no histórico) e novas parcelas são criadas com o novo plano
--  * o novo valor total do serviço precisa ser maior que o já pago; o serviço nunca passa de 5 parcelas no total
--    (pagas + novas); a numeração (i/N) e a descrição de todas as parcelas ativas são atualizadas
--  * perfis: ADMIN, FINANCEIRO e CONTADOR (lançar novo serviço e editar serviço)

-- A numeração pode ser reorganizada dentro de uma transação: a unicidade passa a ser "deferrable".
drop index if exists public.receivables_installment_key;
alter table public.receivables
  add constraint receivables_installment_uq unique (installment_group_id, installment_number)
  deferrable initially immediate;

-- Cobrança cancelada continua imutável, EXCETO desligar do grupo de parcelas (função de edição do serviço).
create or replace function private.guard_receivable_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.canceled_at is not null then
    if (to_jsonb(new) - 'installment_group_id' - 'installment_number' - 'installment_total' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'installment_group_id' - 'installment_number' - 'installment_total' - 'updated_at') then
      raise exception 'Cobrança cancelada não pode ser alterada.' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.amount is distinct from old.amount or new.due_date is distinct from old.due_date)
     and exists (select 1 from public.payments p where p.receivable_id = old.id) then
    raise exception 'Cobrança já recebida não pode ter valor ou vencimento alterados.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.require_service_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.app_role()::text, '') not in ('ADMIN', 'FINANCEIRO', 'CONTADOR') then
    raise exception 'Seu perfil não tem permissão para lançar ou editar serviços.' using errcode = '42501';
  end if;
end;
$$;

-- Novo serviço avulso para um cliente existente: agora também o CONTADOR (que cadastra clientes eventuais).
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
  perform private.require_service_editor();
  return private.make_installments(p_client_id, p_description, p_total, p_installments, p_first_due);
end;
$$;

-- Reparcela o saldo em aberto de um serviço (grupo de parcelas).
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

  perform 1 from public.receivables where installment_group_id = p_group for update;
  if not found then
    raise exception 'Serviço não encontrado.' using errcode = 'P0002';
  end if;
  select client_id, is_demo into v_client, v_demo
    from public.receivables where installment_group_id = p_group limit 1;

  select coalesce(sum(p.amount * 100), 0)::bigint, count(*)::int
    into v_paid_cents, v_paid_count
    from public.receivables r
    join public.payments p on p.receivable_id = r.id
   where r.installment_group_id = p_group and r.canceled_at is null;

  select count(*)::int into v_open_count
    from public.receivables r
   where r.installment_group_id = p_group and r.canceled_at is null
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

  -- 1) cancela as parcelas em aberto (ficam no histórico) e as desliga do grupo
  update public.receivables r
     set canceled_at = now(), canceled_by = (select auth.uid()), cancel_reason = 'Serviço reparcelado',
         installment_group_id = null, installment_number = null, installment_total = null
   where r.installment_group_id = p_group and r.canceled_at is null
     and not exists (select 1 from public.payments p where p.receivable_id = r.id);

  -- 2) desliga do grupo as já canceladas antes (só liberam a numeração)
  update public.receivables
     set installment_group_id = null, installment_number = null, installment_total = null
   where installment_group_id = p_group and canceled_at is not null;

  -- 3) renumera as parcelas pagas (mantêm valor, vencimento e pagamento) e atualiza a descrição
  update public.receivables r
     set installment_number = x.rn,
         installment_total = v_final,
         description = case when v_final > 1
                            then btrim(p_description) || ' — parcela ' || x.rn || '/' || v_final
                            else btrim(p_description) end
    from (select id, row_number() over (order by due_date, id)::int as rn
            from public.receivables
           where installment_group_id = p_group and canceled_at is null) x
   where r.id = x.id;

  -- 4) novas parcelas para o saldo
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

revoke all on function public.update_installment_plan(uuid, text, numeric, integer, date) from public, anon;
revoke all on function public.create_installments(uuid, text, numeric, integer, date) from public, anon;
grant execute on function public.update_installment_plan(uuid, text, numeric, integer, date) to authenticated;
grant execute on function public.create_installments(uuid, text, numeric, integer, date) to authenticated;
