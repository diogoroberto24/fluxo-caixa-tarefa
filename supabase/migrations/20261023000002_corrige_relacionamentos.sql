-- Gestão Contábil — correção da 20261023000001 (vários escritórios). Execute logo DEPOIS dela.
--
-- Problema: a migração anterior criou chaves estrangeiras COMPOSTAS (id, office_id) sem remover as chaves de coluna única
-- que já existiam. Com duas relações entre as mesmas tabelas, a API (PostgREST) não sabe qual usar nas consultas que
-- juntam tabelas (ex.: cobranças + pagamentos) e responde "more than one relationship was found" (PGRST201),
-- derrubando as telas.
--
-- Correção: remove as chaves de coluna única que têm uma composta equivalente. A composta já garante a mesma
-- integridade (o registro pai precisa existir) E que seja do mesmo escritório. Nenhum dado é alterado.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
      join pg_constraint o
        on o.conrelid = c.conrelid
       and o.confrelid = c.confrelid
       and o.contype = 'f'
       and array_length(o.conkey, 1) = 2
       and o.conkey[1] = c.conkey[1]
     where c.contype = 'f'
       and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;
