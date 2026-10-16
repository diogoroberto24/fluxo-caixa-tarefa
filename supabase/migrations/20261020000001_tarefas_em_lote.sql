-- Gestão Contábil — lançar várias tarefas de uma vez para o mesmo cliente.
-- Execute no SQL Editor DEPOIS da 0019 (catálogo de tarefas).
--
--  * create_tasks cria TODAS as tarefas na mesma transação: se uma falhar, nenhuma é criada
--  * cada item informa a tarefa do catálogo (ativa), o prazo e, opcionalmente, a recorrência
--  * responsável e observação valem para todas; a mesma tarefa não pode aparecer duas vezes no pedido
--  * máximo de 30 tarefas por lançamento; perfis: ADMIN e CONTADOR (como create_task)

-- Lógica única de criação de UMA tarefa (create_task e create_tasks usam a mesma).
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
  select * into t from public.task_types where id = p_task_type_id and active;
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

-- Valida cliente e responsável (comum às duas funções públicas).
create or replace function private.check_task_target(p_client_id uuid, p_assignee_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.clients where id = p_client_id and active) then
    raise exception 'Cliente não encontrado ou inativo.' using errcode = 'P0002';
  end if;
  if p_assignee_id is not null
     and not exists (select 1 from public.profiles where id = p_assignee_id and active) then
    raise exception 'Responsável inválido.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.create_task(
  p_client_id uuid,
  p_task_type_id uuid,
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
begin
  perform private.require_task_editor();
  perform private.check_task_target(p_client_id, p_assignee_id);
  return private.make_task(p_client_id, p_task_type_id, p_due_date, p_assignee_id, p_frequency, p_notes);
end;
$$;

-- Lança várias tarefas de uma vez. p_items = [{"task_type_id": "...", "due_date": "YYYY-MM-DD", "frequency": "MENSAL"|null}, ...]
create or replace function public.create_tasks(
  p_client_id uuid,
  p_items jsonb,
  p_assignee_id uuid default null,
  p_notes text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_types uuid[] := '{}';
  v_type uuid;
  v_freq public.recurrence_frequency;
begin
  perform private.require_task_editor();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecione ao menos uma tarefa.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Máximo de 30 tarefas por lançamento.' using errcode = '23514';
  end if;
  perform private.check_task_target(p_client_id, p_assignee_id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Lançamento inválido.' using errcode = '23514';
    end if;
    v_type := nullif(v_item ->> 'task_type_id', '')::uuid;
    if v_type is null then
      raise exception 'Selecione a tarefa.' using errcode = '23514';
    end if;
    if v_type = any (v_types) then
      raise exception 'A mesma tarefa foi selecionada mais de uma vez.' using errcode = '23514';
    end if;
    v_types := v_types || v_type;
    v_freq := nullif(v_item ->> 'frequency', '')::public.recurrence_frequency;
    v_ids := v_ids || private.make_task(
      p_client_id, v_type, nullif(v_item ->> 'due_date', '')::date, p_assignee_id, v_freq, p_notes
    );
  end loop;
  return v_ids;
end;
$$;

revoke all on function private.make_task(uuid, uuid, date, uuid, public.recurrence_frequency, text) from public, anon, authenticated;
revoke all on function private.check_task_target(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_task(uuid, uuid, date, uuid, public.recurrence_frequency, text) from public, anon;
revoke all on function public.create_tasks(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.create_task(uuid, uuid, date, uuid, public.recurrence_frequency, text) to authenticated;
grant execute on function public.create_tasks(uuid, jsonb, uuid, text) to authenticated;
