-- Gestão Contábil — contas a pagar "Empresa / Pessoal" e geração automática diária do financeiro.
-- Execute no SQL Editor DEPOIS da 20261023000002 e ANTES de publicar o código novo. FAÇA UM BACKUP ANTES (npm run backup).
--
-- Regras:
--  * offices.split_payables: liga/desliga a separação Empresa/Pessoal (desligada por padrão). Só o ADMIN altera,
--    pela função set_split_payables
--  * payables.scope: EMPRESA ou PESSOAL. As contas que já existem ficam como EMPRESA; com a separação ligada o app
--    exige a escolha nas contas novas
--  * as ocorrências de uma despesa recorrente copiam o tipo da última ocorrência da série
--  * rotina diária (pg_cron, 00:10 no horário de Brasília): gera os honorários do mês e as ocorrências das despesas
--    recorrentes até 35 dias à frente, para todos os escritórios ativos. Pode rodar quantas vezes for preciso:
--    nunca duplica (as mesmas travas de unicidade de antes)

-- ------------------------------------------------------------------ Empresa / Pessoal
alter table public.offices add column split_payables boolean not null default false;

alter table public.payables add column scope text not null default 'EMPRESA'
  check (scope in ('EMPRESA', 'PESSOAL'));
grant update (scope) on public.payables to authenticated;

create or replace function public.set_split_payables(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.app_role()::text, '') <> 'ADMIN' then
    raise exception 'Somente o administrador pode alterar esta configuração.' using errcode = '42501';
  end if;
  update public.offices set split_payables = coalesce(p_enabled, false) where id = private.my_office();
  if not found then
    raise exception 'Escritório não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_split_payables(boolean) from public, anon;
grant execute on function public.set_split_payables(boolean) to authenticated;

-- ------------------------------------------------------------------ geração por escritório
-- Versões internas que recebem o escritório: usadas pelas funções do app (escritório do usuário logado)
-- e pela rotina diária (todos os escritórios, sem usuário logado).

create or replace function private.generate_monthly_fees_for(p_office uuid, p_competence date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp date := date_trunc('month', p_competence::timestamp)::date;
  v_last date := (v_comp + interval '1 month - 1 day')::date;
  v_rows integer;
begin
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
   where c.office_id = p_office
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

create or replace function private.generate_payable_occurrences_for(p_office uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.br_today();
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
  for v_rule in
    select * from public.recurrence_rules
     where kind = 'PAGAR' and active and office_id = p_office
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
      exit when v_due > p_until or (v_rule.end_date is not null and v_due > v_rule.end_date);
      if v_due >= v_rule.start_date then
        insert into public.payables
          (office_id, description, category_id, supplier, amount, issue_date, due_date, recurrence_rule_id, notes,
           scope, is_demo)
        values
          (v_rule.office_id, v_tpl.description, v_tpl.category_id, v_tpl.supplier, v_tpl.amount, v_today, v_due,
           v_rule.id, v_tpl.notes, v_tpl.scope, v_tpl.is_demo)
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

revoke all on function private.generate_monthly_fees_for(uuid, date) from public, anon, authenticated;
revoke all on function private.generate_payable_occurrences_for(uuid, date) from public, anon, authenticated;

-- Funções chamadas pelo app: mesmas assinaturas e regras de antes, agora usando as versões internas.
create or replace function public.generate_monthly_fees(p_competence date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_finance_writer();
  return private.generate_monthly_fees_for(private.my_office(), coalesce(p_competence, private.br_today()));
end;
$$;

create or replace function public.generate_payable_occurrences(p_until date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_finance_writer();
  return private.generate_payable_occurrences_for(private.my_office(), coalesce(p_until, private.br_today() + 35));
end;
$$;

-- ------------------------------------------------------------------ create_payable com o tipo
-- Novo parâmetro p_scope (opcional, EMPRESA por padrão): o código antigo continua funcionando.
drop function public.create_payable(text, uuid, text, numeric, date, date, text, public.recurrence_frequency);

create or replace function public.create_payable(
  p_description text,
  p_category_id uuid,
  p_supplier text,
  p_amount numeric,
  p_issue_date date,
  p_due_date date,
  p_notes text default null,
  p_frequency public.recurrence_frequency default null,
  p_scope text default 'EMPRESA'
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
    (description, category_id, supplier, amount, issue_date, due_date, recurrence_rule_id, notes, scope)
  values
    (btrim(p_description), p_category_id, btrim(p_supplier), p_amount, p_issue_date, p_due_date, v_rule,
     nullif(btrim(p_notes), ''), coalesce(p_scope, 'EMPRESA'))
  returning id into v_id;

  if v_rule is not null then
    perform public.generate_payable_occurrences();
  end if;
  return v_id;
end;
$$;
revoke all on function public.create_payable(text, uuid, text, numeric, date, date, text, public.recurrence_frequency, text)
  from public, anon;
grant execute on function public.create_payable(text, uuid, text, numeric, date, date, text, public.recurrence_frequency, text)
  to authenticated;

-- ------------------------------------------------------------------ rotina diária
create or replace function private.run_daily_finance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_office uuid;
  v_today date := private.br_today();
begin
  for v_office in select id from public.offices where active loop
    -- um escritório com problema não impede os outros
    begin
      perform private.generate_monthly_fees_for(v_office, v_today);
      perform private.generate_payable_occurrences_for(v_office, v_today + 35);
    exception when others then
      raise warning 'Rotina diária do financeiro: falha no escritório %: %', v_office, sqlerrm;
    end;
  end loop;
end;
$$;
revoke all on function private.run_daily_finance() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- 03:10 UTC = 00:10 em Brasília. Reagenda sem duplicar se esta migração rodar de novo.
select cron.unschedule(jobid) from cron.job where jobname = 'gerar-financeiro-diario';
select cron.schedule('gerar-financeiro-diario', '10 3 * * *', 'select private.run_daily_finance()');

-- Roda uma vez agora para já deixar honorários e recorrências em dia.
select private.run_daily_finance();
