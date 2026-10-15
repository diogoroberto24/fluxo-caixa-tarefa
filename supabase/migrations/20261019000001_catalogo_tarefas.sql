-- Gestão Contábil — cadastro (catálogo) de tarefas.
-- Execute no SQL Editor DEPOIS das migrações anteriores e ANTES de publicar o código novo.
--
-- Regras:
--  * task_types = catálogo de tarefas padrão do escritório (nome, categoria, descrição). Começa VAZIO.
--  * lançar tarefa para um cliente = vincular um item ATIVO do catálogo (não existe mais texto livre)
--  * o nome/categoria/descrição são COPIADOS para a tarefa no momento do lançamento: renomear ou inativar um item
--    do catálogo vale para os próximos lançamentos e não altera tarefas nem histórico já existentes
--  * observação (notes) continua opcional, por tarefa
--  * criar/editar catálogo e lançar/editar tarefa: ADMIN e CONTADOR (como antes)
--  * as funções antigas com texto livre (create_task / update_task) são REMOVIDAS

create table public.task_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) > 0),
  category     text not null check (length(btrim(category)) > 0),
  description  text,
  active       boolean not null default true,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Nome único, sem diferenciar maiúsculas/minúsculas nem espaços nas pontas.
create unique index task_types_name_key on public.task_types (lower(btrim(name)));

create trigger task_types_updated_at before update on public.task_types
  for each row execute function private.set_updated_at();
create trigger task_types_audit after insert or update or delete on public.task_types
  for each row execute function private.audit_row();

alter table public.task_definitions
  add column task_type_id uuid references public.task_types (id);
create index task_definitions_type_idx on public.task_definitions (task_type_id);

-- ------------------------------------------------------------------ segurança
alter table public.task_types enable row level security;
revoke all on public.task_types from public, anon, authenticated;
grant select on public.task_types to authenticated;
grant all on public.task_types to service_role;
create policy task_types_select on public.task_types for select to authenticated
  using ((select private.app_role()) is not null);

-- ----------------------------------------------------------------- funções
-- Cria (p_id nulo) ou edita um item do catálogo.
create or replace function public.save_task_type(
  p_id uuid,
  p_name text,
  p_category text,
  p_description text default null,
  p_active boolean default true
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

  if p_id is null then
    insert into public.task_types (name, category, description, active)
    values (btrim(p_name), btrim(p_category), nullif(btrim(p_description), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.task_types
       set name = btrim(p_name), category = btrim(p_category),
           description = nullif(btrim(p_description), ''), active = coalesce(p_active, true)
     where id = p_id
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

-- Lançamento NOVO: vincula um item ativo do catálogo (substitui a versão de texto livre).
drop function if exists public.create_task(uuid, text, text, text, date, uuid, public.recurrence_frequency, text);

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
declare
  t public.task_types;
  v_rule uuid;
  v_def uuid;
  v_exec uuid;
begin
  perform private.require_task_editor();
  if not exists (select 1 from public.clients where id = p_client_id and active) then
    raise exception 'Cliente não encontrado ou inativo.' using errcode = 'P0002';
  end if;
  select * into t from public.task_types where id = p_task_type_id and active;
  if not found then
    raise exception 'Tarefa do catálogo não encontrada ou inativa.' using errcode = 'P0002';
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

-- Edição de uma execução ABERTA: prazo, responsável e observação (a tarefa em si vem do catálogo).
drop function if exists public.update_task(uuid, text, text, text, date, uuid, text);

create or replace function public.update_task(
  p_execution_id uuid,
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
     set assignee_id = p_assignee_id, notes = nullif(btrim(p_notes), '')
   where id = e.definition_id;
  update public.task_executions set due_date = p_due_date where id = e.id;
exception
  when unique_violation then
    raise exception 'Já existe uma ocorrência desta tarefa neste prazo.' using errcode = '23514';
end;
$$;

revoke all on function public.save_task_type(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.create_task(uuid, uuid, date, uuid, public.recurrence_frequency, text) from public, anon;
revoke all on function public.update_task(uuid, date, uuid, text) from public, anon;
grant execute on function public.save_task_type(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.create_task(uuid, uuid, date, uuid, public.recurrence_frequency, text) to authenticated;
grant execute on function public.update_task(uuid, date, uuid, text) to authenticated;
