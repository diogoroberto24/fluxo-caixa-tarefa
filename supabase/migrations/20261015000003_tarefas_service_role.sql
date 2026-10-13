-- Gestão Contábil — permissões do service_role para tarefas. Execute DEPOIS da 0007 e da 0008.
-- Usado pelos scripts locais (npm run seed:demo / clear:demo). O papel anon continua sem acesso.

grant all on public.task_definitions, public.task_executions to service_role;
grant select on public.task_last_done to service_role;
