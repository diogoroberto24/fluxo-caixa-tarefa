-- Gestão Contábil — novo regime tributário "Pessoa Física/Autônomo".
-- Execute no SQL Editor do Supabase, uma vez, ANTES de publicar o código novo
-- (sem isto, salvar um cliente com esse regime falha).
alter type public.tax_regime add value if not exists 'PESSOA_FISICA';
