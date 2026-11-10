-- TESTE do Alvará automático. Não grava nada: tudo é desfeito no final (rollback).
-- Rode tudo de uma vez no SQL Editor. O resultado aparece como uma mensagem de "erro" no final:
-- o erro é proposital, é ele que garante que nada fique gravado.
begin;

create temp table _resultado (teste text, esperado text, obtido text) on commit drop;

-- 1) Cliente fixo novo: cópia de um cliente existente, com contrato começando em 10/11/2026
create temp table _c on commit drop as
  select * from public.clients where kind = 'FIXO' and active order by created_at limit 1;
update _c set id = gen_random_uuid(), document = '11222333000181', contract_start = date '2026-11-10',
              trade_name = 'TESTE ALVARA', legal_name = 'TESTE ALVARA';
insert into public.clients select * from _c;

insert into _resultado
select '1. cliente novo ganha Alvará em 30 dias', '09/12/2026 · prioridade 1 · sem responsável',
       coalesce(string_agg(to_char(e.due_date, 'DD/MM/YYYY') || ' · prioridade ' || d.priority
                || case when d.assignee_id is null then ' · sem responsável' else ' · COM responsável' end, ' | '), 'nenhuma')
  from public.task_definitions d
  join public.task_executions e on e.definition_id = d.id
 where d.client_id = (select id from _c) and d.auto_kind = 'ALVARA';

-- 2) 1º de janeiro de 2027: os 43 clientes atuais ganham o Alvará de 2027 (o cliente do teste também, porque o dele vence em 2026)
select private.generate_alvaras_for(id, date '2027-01-01') from public.offices where active;

insert into _resultado
select '2. tarefas criadas em 01/01/2027', '44 (43 atuais + o cliente do teste), todas com prazo 31/05/2027',
       count(*) || ' · prazos: ' || string_agg(distinct to_char(e.due_date, 'DD/MM/YYYY'), ', ')
  from public.task_executions e
  join public.task_definitions d on d.id = e.definition_id
 where d.auto_kind = 'ALVARA' and e.due_date = date '2027-05-31';

-- 3) Rodar de novo no mesmo ano não duplica
insert into _resultado
select '3. rodar de novo no mesmo ano', '0',
       sum(private.generate_alvaras_for(id, date '2027-03-15'))::text from public.offices where active;

-- 4) Cliente desativado não ganha em 2028
update public.clients set active = false where id = (select id from _c);
select private.generate_alvaras_for(id, date '2028-01-01') from public.offices where active;
insert into _resultado
select '4. cliente desativado em 2028', '0',
       count(*)::text
  from public.task_executions e
  join public.task_definitions d on d.id = e.definition_id
 where d.client_id = (select id from _c) and e.due_date = date '2028-05-31';

do $$
declare v text;
begin
  select string_agg(teste || E'
   esperado: ' || esperado || E'
   obtido:   ' || coalesce(obtido, 'nada'), E'
') into v
    from _resultado;
  raise exception E'RESULTADO DO TESTE (nada foi gravado):
%', v;
end $$;
