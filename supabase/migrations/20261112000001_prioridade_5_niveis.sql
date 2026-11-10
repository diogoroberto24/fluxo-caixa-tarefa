-- Gestão Contábil — prioridade das tarefas passa de 3 para 5 níveis.
-- Execute no SQL Editor DEPOIS da 20261111000001 e ANTES de publicar o código novo. FAÇA UM BACKUP ANTES (npm run backup).
--
-- Níveis: 1 muito alta, 2 alta, 3 média, 4 baixa, 5 muito baixa (vazio = sem prioridade).
-- Nenhum dado muda: só o limite permitido passa de 1–3 para 1–5.

-- ------------------------------------------------------------------ troca as restrições de 1–3 por 1–5
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.task_definitions'::regclass, 'public.task_types'::regclass)
       and pg_get_constraintdef(c.oid) ilike '%priority%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.task_definitions
  add constraint task_definitions_priority_check check (priority between 1 and 5);
alter table public.task_types
  add constraint task_types_priority_check check (priority between 1 and 5);

-- ------------------------------------------------------------------ cadastro aceita 1–5
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
  if p_priority is not null and p_priority not between 1 and 5 then
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
