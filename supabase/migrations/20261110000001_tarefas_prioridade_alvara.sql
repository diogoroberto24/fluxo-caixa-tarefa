-- Gestão Contábil — prioridade das tarefas e Alvará anual automático para clientes fixos.
-- Execute no SQL Editor DEPOIS da 20261109000001 e ANTES de publicar o código novo. FAÇA UM BACKUP ANTES (npm run backup).
--
-- Regras:
--  * task_definitions.priority: 1 (alta), 2 (média), 3 (baixa) ou vazio. As tarefas atuais ficam sem prioridade
--  * task_definitions.auto_kind = 'ALVARA': a série anual de Alvará de um cliente (uma por cliente)
--  * cliente que passa a ser FIXO e ativo (cadastro novo, eventual que vira fixo): ganha a série e a primeira tarefa,
--    com prazo de 30 dias após o início do contrato, prioridade 1, sem responsável
--  * todo ano (rotina diária, a partir de 1º de janeiro): cada série ativa de cliente fixo ativo ganha a tarefa do ano,
--    com prazo em 31/05, mesmo que a do ano anterior ainda esteja aberta. Nunca cria duas no mesmo ano, e a série
--    criada no próprio ano só começa no ano seguinte
--  * cliente desativado ou que deixa de ser fixo: a série para (o que estiver aberto continua na lista)
--  * clientes fixos atuais: a série é criada agora, SEM tarefa visível; a primeira aparece em 01/01 do ano que vem

-- ------------------------------------------------------------------ colunas
alter table public.task_definitions
  add column priority smallint check (priority between 1 and 3),
  add column auto_kind text check (auto_kind in ('ALVARA'));

create unique index task_definitions_alvara_key
  on public.task_definitions (client_id) where auto_kind = 'ALVARA';

-- ------------------------------------------------------------------ catálogo: tipo "Alvará"
insert into public.task_types (office_id, name, category, description)
select o.id, 'Alvará', 'Obrigações acessórias', 'Renovação anual do alvará do cliente.'
  from public.offices o
 where not exists (select 1 from public.task_types t
                    where t.office_id = o.id and lower(btrim(t.name)) = 'alvará');

-- ------------------------------------------------------------------ prioridade (lançar e editar)
-- Define a prioridade das tarefas informadas (vale para a série: as próximas ocorrências herdam).
create or replace function public.set_task_priority(p_execution_ids uuid[], p_priority smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_task_editor();
  if p_priority is not null and p_priority not between 1 and 3 then
    raise exception 'Prioridade inválida.' using errcode = '23514';
  end if;
  update public.task_definitions d
     set priority = p_priority
   where d.office_id = private.my_office()
     and d.id in (select e.definition_id from public.task_executions e
                   where e.id = any (p_execution_ids) and e.office_id = private.my_office());
end;
$$;
revoke all on function public.set_task_priority(uuid[], smallint) from public, anon;
grant execute on function public.set_task_priority(uuid[], smallint) to authenticated;

-- ------------------------------------------------------------------ Alvará: criação da série
create or replace function private.ensure_alvara(p_client_id uuid, p_first_due date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.clients;
  v_type uuid;
  v_def uuid;
begin
  select * into c from public.clients where id = p_client_id;
  if not found then return; end if;

  select id into v_def from public.task_definitions
   where client_id = c.id and auto_kind = 'ALVARA';
  if found then
    update public.task_definitions set active = true where id = v_def and not active;
    return;
  end if;

  select id into v_type from public.task_types
   where office_id = c.office_id and lower(btrim(name)) = 'alvará'
   order by active desc limit 1;

  insert into public.task_definitions
    (office_id, client_id, title, description, category, priority, auto_kind, task_type_id, is_demo)
  values
    (c.office_id, c.id, 'Alvará', 'Renovação anual do alvará do cliente.', 'Obrigações acessórias', 1, 'ALVARA',
     v_type, c.is_demo)
  returning id into v_def;

  if p_first_due is not null then
    insert into public.task_executions (office_id, definition_id, due_date)
    values (c.office_id, v_def, p_first_due)
    on conflict (definition_id, due_date) do nothing;
  end if;
end;
$$;
revoke all on function private.ensure_alvara(uuid, date) from public, anon, authenticated;

-- Cliente que passa a ser fixo e ativo ganha o Alvará; o que deixa de ser para de gerar.
create or replace function private.client_alvara()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'FIXO' and new.active then
    if tg_op = 'INSERT' or old.kind is distinct from 'FIXO' or not old.active then
      perform private.ensure_alvara(new.id, coalesce(new.contract_start, private.br_today()) + 30);
    end if;
  elsif tg_op = 'UPDATE' then
    update public.task_definitions set active = false
     where client_id = new.id and auto_kind = 'ALVARA' and active;
  end if;
  return null;
end;
$$;

create trigger clients_alvara
  after insert or update of kind, active on public.clients
  for each row execute function private.client_alvara();

-- ------------------------------------------------------------------ Alvará: geração anual
create or replace function private.generate_alvaras_for(p_office uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from p_today)::int;
  v_rows integer;
begin
  insert into public.task_executions (office_id, definition_id, due_date)
  select d.office_id, d.id, make_date(v_year, 5, 31)
    from public.task_definitions d
    join public.clients c on c.id = d.client_id and c.office_id = d.office_id
   where d.office_id = p_office
     and d.auto_kind = 'ALVARA'
     and d.active
     and c.active
     and c.kind = 'FIXO'
     -- série criada neste ano só começa no próximo
     and (d.created_at at time zone 'America/Sao_Paulo')::date < make_date(v_year, 1, 1)
     -- nunca duas no mesmo ano
     and not exists (select 1 from public.task_executions e
                      where e.definition_id = d.id
                        and e.due_date between make_date(v_year, 1, 1) and make_date(v_year, 12, 31))
  on conflict (definition_id, due_date) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke all on function private.generate_alvaras_for(uuid, date) from public, anon, authenticated;

-- Rotina diária (agendada às 00:10 de Brasília): agora também gera os Alvarás do ano.
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
    begin
      perform private.generate_alvaras_for(v_office, v_today);
    exception when others then
      raise warning 'Rotina diária (Alvará): falha no escritório %: %', v_office, sqlerrm;
    end;
  end loop;
end;
$$;
revoke all on function private.run_daily_finance() from public, anon, authenticated;

-- ------------------------------------------------------------------ concluir/cancelar: "parar série" vale para o Alvará
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

  -- Alvará: a próxima vem pela rotina de 1º de janeiro; aqui só se pode parar a série
  if d.auto_kind = 'ALVARA' then
    if p_stop_series then
      update public.task_definitions set active = false where id = d.id and office_id = v_office;
    end if;
    return jsonb_build_object('status', 'changed', 'next_id', null);
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

-- ------------------------------------------------------------------ clientes fixos atuais
-- Cria a série de cada cliente fixo ativo, sem tarefa: a primeira aparece em 01/01 do ano que vem (vence 31/05).
select private.ensure_alvara(c.id, null)
  from public.clients c
 where c.kind = 'FIXO' and c.active;
