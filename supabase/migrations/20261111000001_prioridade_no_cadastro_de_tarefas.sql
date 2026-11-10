-- Gestão Contábil — a prioridade passa a ser definida no Cadastro de tarefas (catálogo).
-- Execute no SQL Editor DEPOIS da 20261110000001 e ANTES de publicar o código novo. FAÇA UM BACKUP ANTES (npm run backup).
--
-- Regras:
--  * task_types.priority: 1 (alta), 2 (média), 3 (baixa) ou vazio
--  * toda tarefa lançada recebe a prioridade do seu tipo; mudar a prioridade no cadastro muda TODAS as tarefas
--    daquele tipo (já lançadas, próximas ocorrências e Alvarás)
--  * a prioridade não é mais escolhida no lançamento nem na edição de uma tarefa (set_task_priority deixa de existir)
--  * o tipo "Alvará" começa com prioridade 1 (como os Alvarás já criados)

-- ------------------------------------------------------------------ coluna
alter table public.task_types add column priority smallint check (priority between 1 and 3);

update public.task_types set priority = 1 where lower(btrim(name)) = 'alvará';

-- As tarefas já lançadas passam a seguir o cadastro.
update public.task_definitions d
   set priority = t.priority
  from public.task_types t
 where t.id = d.task_type_id and t.office_id = d.office_id
   and d.priority is distinct from t.priority;

-- ------------------------------------------------------------------ mudou no cadastro: muda nas tarefas
create or replace function private.task_type_priority_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.task_definitions
     set priority = new.priority
   where task_type_id = new.id and office_id = new.office_id
     and priority is distinct from new.priority;
  return null;
end;
$$;

create trigger task_types_priority_sync
  after update of priority on public.task_types
  for each row execute function private.task_type_priority_sync();

-- ------------------------------------------------------------------ cadastro com prioridade
drop function public.save_task_type(uuid, text, text, text, boolean);

create or replace function public.save_task_type(
  p_id uuid,
  p_name text,
  p_category text,
  p_description text default null,
  p_active boolean default true,
  p_priority smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_task_editor();
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Informe o nome da tarefa.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_category), '') = '' then
    raise exception 'Selecione a categoria.' using errcode = '23514';
  end if;
  if p_priority is not null and p_priority not between 1 and 3 then
    raise exception 'Prioridade inválida.' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.task_types (name, category, description, active, priority)
    values (btrim(p_name), btrim(p_category), nullif(btrim(p_description), ''), coalesce(p_active, true), p_priority)
    returning id into v_id;
  else
    update public.task_types
       set name = btrim(p_name), category = btrim(p_category),
           description = nullif(btrim(p_description), ''), active = coalesce(p_active, true),
           priority = p_priority
     where id = p_id and office_id = private.my_office()
    returning id into v_id;
    if v_id is null then
      raise exception 'Tarefa do catálogo não encontrada.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe uma tarefa cadastrada com este nome.' using errcode = '23514';
end;
$$;
revoke all on function public.save_task_type(uuid, text, text, text, boolean, smallint) from public, anon;
grant execute on function public.save_task_type(uuid, text, text, text, boolean, smallint) to authenticated;

-- ------------------------------------------------------------------ lançamento: prioridade vem do tipo
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
  select * into t from public.task_types
   where id = p_task_type_id and active and office_id = private.my_office();
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
    (client_id, title, description, category, assignee_id, recurrence_rule_id, notes, task_type_id, priority)
  values
    (p_client_id, t.name, t.description, t.category, p_assignee_id, v_rule, nullif(btrim(p_notes), ''), t.id,
     t.priority)
  returning id into v_def;

  insert into public.task_executions (definition_id, due_date)
  values (v_def, p_due_date)
  returning id into v_exec;
  return v_exec;
end;
$$;

-- ------------------------------------------------------------------ Alvará: prioridade vem do tipo "Alvará"
create or replace function private.ensure_alvara(p_client_id uuid, p_first_due date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.clients;
  v_type public.task_types;
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

  select * into v_type from public.task_types
   where office_id = c.office_id and lower(btrim(name)) = 'alvará'
   order by active desc limit 1;

  insert into public.task_definitions
    (office_id, client_id, title, description, category, priority, auto_kind, task_type_id, is_demo)
  values
    (c.office_id, c.id, 'Alvará', 'Renovação anual do alvará do cliente.', 'Obrigações acessórias',
     case when v_type.id is null then 1 else v_type.priority end, 'ALVARA', v_type.id, c.is_demo)
  returning id into v_def;

  if p_first_due is not null then
    insert into public.task_executions (office_id, definition_id, due_date)
    values (c.office_id, v_def, p_first_due)
    on conflict (definition_id, due_date) do nothing;
  end if;
end;
$$;
revoke all on function private.ensure_alvara(uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------------ não se escolhe mais por tarefa
drop function public.set_task_priority(uuid[], smallint);
