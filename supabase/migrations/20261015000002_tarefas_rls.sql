-- Gestão Contábil — segurança das tarefas (RLS e permissões). Execute DEPOIS da 0007.
--
--  * todo perfil ativo LÊ tarefas e a última realização
--  * escrita SOMENTE pelas funções create_task / update_task / set_task_status (sem INSERT/UPDATE direto)
--  * ADMIN e CONTADOR criam/editam; qualquer perfil ativo atualiza status (OPERADOR só as próprias, sem cancelar)
--  * regras de recorrência do tipo TAREFA ficam legíveis a todo perfil ativo (para exibir a frequência)

revoke all on function private.require_task_editor() from public;
revoke all on function private.next_task_due(date, public.recurrence_frequency, integer) from public;
grant execute on function private.require_task_editor() to authenticated;
grant execute on function private.next_task_due(date, public.recurrence_frequency, integer) to authenticated;

alter table public.task_definitions enable row level security;
alter table public.task_executions  enable row level security;

revoke all on public.task_definitions, public.task_executions, public.task_last_done
  from public, anon, authenticated;

grant select on public.task_definitions, public.task_executions, public.task_last_done to authenticated;

create policy task_definitions_select on public.task_definitions for select to authenticated
  using ((select private.app_role()) is not null);
create policy task_executions_select on public.task_executions for select to authenticated
  using ((select private.app_role()) is not null);

create policy rules_select_tasks on public.recurrence_rules for select to authenticated
  using (kind = 'TAREFA' and (select private.app_role()) is not null);

revoke all on function public.create_task(uuid, text, text, text, date, uuid, public.recurrence_frequency, text) from public, anon;
revoke all on function public.update_task(uuid, text, text, text, date, uuid, text) from public, anon;
revoke all on function public.set_task_status(uuid, public.task_status, text, boolean) from public, anon;
grant execute on function public.create_task(uuid, text, text, text, date, uuid, public.recurrence_frequency, text) to authenticated;
grant execute on function public.update_task(uuid, text, text, text, date, uuid, text) to authenticated;
grant execute on function public.set_task_status(uuid, public.task_status, text, boolean) to authenticated;
