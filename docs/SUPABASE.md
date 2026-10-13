# Configuração do Supabase — passo a passo

**Regra de ouro:** nenhuma chave, senha ou token vai para o chat, para o git ou para a Vercel
(exceto as duas variáveis públicas do passo 6). Se uma chave secreta vazar, gere uma nova no painel.

## 1. Projeto
Projeto próprio do escritório, região São Paulo, com Data API **ligada**,
"Automatically expose new tables" **desligado** e "Enable automatic RLS" **ligado**.

## 2. Autenticação
**Authentication → Sign In / Providers:** mantenha **Email** ligado e **Allow new users to sign up desligado**
(só o administrador cria contas). Senha mínima de 8 caracteres.

## 3. Variáveis (`.env.local`)
| Variável | Valor | Vai ao navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (**só a raiz**, sem `/rest/v1`) | Sim |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave `sb_publishable_...` | Sim |
| `SUPABASE_SECRET_KEY` | chave `sb_secret_...` | **Nunca** (só scripts locais) |
| `SEED_ADMIN_NAME/EMAIL/PASSWORD` | dados do administrador inicial (senha com 8+ caracteres) | Nunca |

## 4. Criar as tabelas e as regras de segurança
**SQL Editor → New query.** Rode, **uma vez cada e nesta ordem**, o conteúdo de:
1. `supabase/migrations/20261013000001_base.sql`
2. `supabase/migrations/20261013000002_rls_policies.sql`
3. `supabase/migrations/20261013000003_service_role_grants.sql`
4. `supabase/migrations/20261014000001_financeiro.sql` (Etapa 3: cobranças, contas a pagar, pagamentos, recorrência e funções)
5. `supabase/migrations/20261014000002_financeiro_rls.sql`
6. `supabase/migrations/20261014000003_financeiro_service_role.sql`

7. `supabase/migrations/20261015000001_tarefas.sql` (Etapa 4: tarefas, execuções, recorrência)
8. `supabase/migrations/20261015000002_tarefas_rls.sql`
9. `supabase/migrations/20261015000003_tarefas_service_role.sql`

Cada uma deve terminar com "Success. No rows returned". Rodar de novo gera erro "já existe" (esperado, sem dano).
Confira em **Table Editor**: `profiles`, `clients`, `client_fee_history`, `audit_log`, `financial_categories`,
`recurrence_rules`, `receivables`, `payables` e `payments`, todas com RLS ativado.

## 5. Criar o administrador (e, opcionalmente, dados de demonstração)
```bash
npm run seed         # só o administrador
npm run seed:demo    # administrador + 8 clientes e o financeiro de demonstração (is_demo = true; recriado a cada execução)
```
Pode rodar de novo sem duplicar. Para remover a demonstração antes da operação real:
```bash
npm run clear:demo   # apaga somente is_demo = true; clientes reais não são tocados
```

## 6. Rodar e publicar
```bash
npm run dev
```
Na Vercel cadastre **somente** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Depois, em **Authentication → URL Configuration**, ajuste o *Site URL* para o endereço publicado.

## Como o acesso funciona
- Conta nova no Auth nasce com perfil **inativo** (sem acesso). O administrador a libera: perfil `ADMIN` /
  `CONTADOR` / `FINANCEIRO` / `OPERADOR` e `active = true` na tabela `profiles`.
- Permissões são aplicadas no banco (RLS) e conferidas de novo no servidor em cada ação.
- Clientes nunca são excluídos: são inativados. Toda alteração fica em `audit_log` (visível só ao ADMIN).

## Regras do financeiro (Etapa 3)
- **Status é derivado**, nunca digitado: pago = existe pagamento; cancelado = cancelada; vencido = vencimento antes de hoje sem pagamento.
- **Honorários:** uma cobrança ativa por cliente e competência (índice único). O valor é copiado do contrato na geração; alterar o contrato não muda cobranças antigas.
- **Pagamento atômico e idempotente:** só por função SQL (`register_receipt`, `register_payable_payment`), com bloqueio de linha. Clicar duas vezes não duplica.
- **Nada é excluído:** cobranças e contas são canceladas. Item pago não pode ser cancelado nem ter valor/vencimento alterados.
- **Recorrência:** `generate_payable_occurrences` e `generate_monthly_fees` são idempotentes. O app as chama ao abrir Contas a Pagar e pelos botões "Gerar recorrências" e "Gerar honorários".
- **Perfis:** OPERADOR não vê o financeiro; CONTADOR só lê cobranças; ADMIN e FINANCEIRO operam tudo.
- Opcional: para gerar os honorários todo mês sem depender de alguém abrir o sistema, dá para agendar com a extensão **pg_cron** do Supabase. Hoje a geração é acionada pelo app.

## Regras das tarefas (Etapa 4)
- **Definição x execução:** a tarefa ("o que fazer") tem várias execuções (cada ocorrência, com prazo e status). O histórico é a lista de execuções.
- **Última realização é derivada** das execuções concluídas (view `task_last_done`), não digitada.
- **Recorrência:** ao concluir ou cancelar uma ocorrência recorrente, a próxima é criada na mesma transação (mensal, semestral, anual; dia 31 vira o último dia do mês). `(tarefa, prazo)` é único: nada duplica. Cancelar pode encerrar a série.
- **Status idempotente:** concluir duas vezes não altera nada e não gera outra ocorrência. Tarefa concluída/cancelada não reabre nem é editada.
- **Perfis:** ADMIN e CONTADOR criam/editam/cancelam; FINANCEIRO atualiza status; OPERADOR atualiza só as tarefas atribuídas a ele e não cancela.

## Backup
O plano gratuito tem backups limitados. Veja `npm run backup` e `npm run restore` em `docs/DEPLOY.md`.
