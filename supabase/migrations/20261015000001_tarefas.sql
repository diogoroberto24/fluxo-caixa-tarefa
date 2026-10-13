-- Gestão Contábil — tarefas (Etapa 4): definições, execuções (histórico) e recorrência.
-- Execute no SQL Editor DEPOIS das migrações 0001–0006 e ANTES das 0008 e 0009.
--
-- Modelo:
--  * task_definitions  = "o que fazer" para um cliente (título, categoria, responsável, recorrência)
--  * task_executions   = cada ocorrência (prazo, status, conclusão). É o HISTÓRICO de execuções
--  * "última realização" é DERIVADA: maior completed_at das execuções CONCLUIDA (view task_last_done)
--  * recorrência: ao concluir (ou cancelar) uma ocorrência, a próxima é criada na mesma transação;
--    (definição, prazo) é único, então repetir a operação nunca duplica
--  * tudo é gravado por função (RLS bloqueia escrita direta); nada é excluído

create type public.task_status as enum ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

create table public.task_definitions (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients (id),
  title               text not null check (length(btrim(title)) > 0),
  description         text,
  category            text not null check (length(btrim(category)) > 0),
  assignee_id         uuid references public.profiles (id),
  recurrence_rule_id  uuid references public.recurrence_rules (id),
  notes               text,
  active              boolean not null default true,
  is_demo             boolean not null default false,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index task_definitions_client_idx on public.task_definitions (client_id);
create index task_definitions_assignee_idx on public.task_definitions (assignee_id);
create trigger task_definitions_updated_at before update on public.task_definitions
  for each row execute function private.set_updated_at();

create table public.task_executions (
  id                uuid primary key default gen_random_uuid(),
  definition_id     uuid not null references public.task_definitions (id),
  due_date          date not null,
  status            public.task_status not null default 'PENDENTE',
  started_at        timestamptz,
  completed_at      timestamptz,
  completed_by      uuid,
  canceled_at       timestamptz,
  completion_notes  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (definition_id, due_date),
  check ((status = 'CONCLUIDA') = (completed_at is not null)),
  check ((status = 'CANCELADA') = (canceled_at is not null))
);
create index task_executions_due_idx on public.task_executions (due_date);
create index task_executions_status_idx on public.task_executions (status);
create trigger task_executions_updated_at before update on public.task_executions
  for each row execute function private.set_updated_at();

create trigger task_definitions_audit after insert or update or delete on public.task_definitions
  for each row execute function private.audit_row();
create trigger task_executions_audit after insert or update or delete on public.task_executions
  for each row execute function private.audit_row();

-- Última realização derivada do histórico (respeita o RLS de quem consulta).
create view public.task_last_done with (security_invoker = true) as
  select definition_id, max(completed_at) as last_done_at
    from public.task_executions
   where status = 'CONCLUIDA'
   group by definition_id;

-- ============================================================ funções (RPC)

create or replace function private.require_task_editor()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.app_role()::text, '') not in ('ADMIN', 'CONTADOR') then
    raise exception 'Seu perfil não tem permissão para criar ou editar tarefas.' using errcode = '42501';
  end if;
end;
$$;

-- Próximo prazo de uma regra, estritamente depois de p_after.
create or replace function private.next_task_due(p_after date, p_frequency public.recurrence_frequency, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (m + (least(p_day, extract(day from (m + interval '1 month - 1 day'))::int) - 1))::date
    from (
      select (date_trunc('month', p_after::timestamp)
              + make_interval(months => case p_frequency when 'MENSAL' then 1 when 'SEMESTRAL' then 6 else 12 end))::date as m
    ) s
$$;

-- Cria definição + primeira execução (+ regra de recorrência). Devolve o id da execução.
create or replace function public.create_task(
  p_client_id uuid,
  p_title text,
  p_category text,
  p_description text,
  p_due_date date,
  p_assignee_id uuid default null,
  p_frequency public.recurrence_frequency default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule uuid;
  v_def uuid;
  v_exec uuid;
begin
  perform private.require_task_editor();
  if not exists (select 1 from public.clients where id = p_client_id and active) then
    raise exception 'Cliente não encontrado ou inativo.' using errcode = 'P0002';
  end if;
  if p_assignee_id is not null
     and not exists (select 1 from public.profiles where id = p_assignee_id and active) then
    raise exception 'Responsável inválido.' using errcode = '23514';
  end if;

  if p_frequency is not null then
    insert into public.recurrence_rules (kind, frequency, start_date, day_of_month)
    values ('TAREFA', p_frequency, p_due_date, extract(day from p_due_date)::int)
    returning id into v_rule;
  end if;

  insert into public.task_definitions (client_id, title, description, category, assignee_id, recurrence_rule_id, notes)
  values (p_client_id, btrim(p_title), nullif(btrim(p_description), ''), btrim(p_category),
          p_assignee_id, v_rule, nullif(btrim(p_notes), ''))
  returning id into v_def;

  insert into public.task_executions (definition_id, due_date)
  values (v_def, p_due_date)
  returning id into v_exec;
  return v_exec;
end;
$$;

-- Edita uma execução ABERTA e a definição dela. Concluída/cancelada não muda.
create or replace function public.update_task(
  p_execution_id uuid,
  p_title text,
  p_category text,
  p_description text,
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
  select * into e from public.task_executions where id = p_execution_id for update;
  if not found then raise exception 'Tarefa não encontrada.' using errcode = 'P0002'; end if;
  if e.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception 'Tarefa finalizada não pode ser editada.' using errcode = '23514';
  end if;
  if p_assignee_id is not null
     and not exists (select 1 from public.profiles where id = p_assignee_id and active) then
    raise exception 'Responsável inválido.' using errcode = '23514';
  end if;

  update public.task_definitions
     set title = btrim(p_title), category = btrim(p_category), description = nullif(btrim(p_description), ''),
         assignee_id = p_assignee_id, notes = nullif(btrim(p_notes), '')
   where id = e.definition_id;
  update public.task_executions set due_date = p_due_date where id = e.id;
exception
  when unique_violation then
    raise exception 'Já existe uma ocorrência desta tarefa neste prazo.' using errcode = '23514';
end;
$$;

-- Muda o status de uma execução. Idempotente (mesmo status = sem efeito).
-- Ao CONCLUIR ou CANCELAR uma ocorrência de tarefa recorrente, cria a próxima (salvo p_stop_series).
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

  select * into e from public.task_executions where id = p_execution_id for update;
  if not found then raise exception 'Tarefa não encontrada.' using errcode = 'P0002'; end if;
  select * into d from public.task_definitions where id = e.definition_id;

  -- Operador só atualiza as tarefas atribuídas a ele; cancelar é decisão de ADMIN/CONTADOR.
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

  -- recorrência
  if d.recurrence_rule_id is not null then
    if p_stop_series then
      update public.recurrence_rules set active = false where id = d.recurrence_rule_id;
      update public.task_definitions set active = false where id = d.id;
    else
      select * into r from public.recurrence_rules where id = d.recurrence_rule_id and active;
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
