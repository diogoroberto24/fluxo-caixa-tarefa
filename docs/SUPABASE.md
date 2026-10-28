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

10. `supabase/migrations/20261016000001_regime_pessoa_fisica.sql` (regime Pessoa Física/Autônomo)
11. `supabase/migrations/20261017000001_clientes_eventuais.sql` (clientes eventuais e serviço parcelado)
12. `supabase/migrations/20261018000001_editar_servico_avulso.sql` (editar/reparcelar serviço avulso)
13. `supabase/migrations/20261019000001_catalogo_tarefas.sql` (cadastro/catálogo de tarefas)
14. `supabase/migrations/20261020000001_tarefas_em_lote.sql` (lançar várias tarefas de uma vez)
15. `supabase/migrations/20261021000001_escritorio_contratos.sql` (dados do escritório e contratos)
16. `supabase/migrations/20261022000001_contrato_representante_pix.sql` (representante legal e RG do cliente, chave PIX do escritório, tipo de pessoa do modelo)
17. `supabase/migrations/20261023000001_multi_escritorio.sql` (vários escritórios, cada um enxergando só os próprios dados) — **faça `npm run backup` antes**

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

## Clientes fixos e eventuais
- **Fixo:** honorários mensais recorrentes (comportamento original, sem mudança).
- **Eventual:** serviço avulso. Nunca gera mensalidade (`generate_monthly_fees` ignora). No cadastro informa-se a descrição, o valor total, à vista ou 2 a 5 parcelas e o vencimento (da 1ª parcela).
- **Parcelas:** vencem todo mês no dia do 1º vencimento (mês curto usa o último dia). Os centavos que sobram ficam na 1ª parcela; a soma é sempre o total.
- **Antecipação:** qualquer parcela em aberto pode ser paga antes do vencimento (botão "Antecipar pagamento").
- O tipo é definido no cadastro e não muda depois.
- **Cliente eventual que volta:** ao cadastrar com um CPF/CNPJ já existente, o sistema oferece lançar o serviço no cadastro existente (que não é alterado). Também: Clientes → detalhe → **Novo serviço**, ou Contas a Receber → Nova cobrança.
- **Editar serviço (reparcelar):** só o saldo em aberto. Parcelas pagas não mudam; as em aberto são canceladas (ficam no histórico) e recriadas no novo plano. O valor total precisa ser maior que o já pago e o serviço tem no máximo 5 parcelas no total (pagas + novas).
- Perfis: ADMIN, FINANCEIRO e CONTADOR lançam e editam serviço.

## Cadastro (catálogo) de tarefas
- Em **Tarefas → Cadastro de tarefas** o escritório cadastra as tarefas padrão (nome, categoria e descrição opcional). O catálogo **começa vazio**.
- Ao lançar uma tarefa para um cliente escolhe-se um item do catálogo (não há mais texto livre) e, se quiser, uma **observação opcional**.
- O nome e a categoria são copiados para a tarefa no lançamento: renomear ou inativar um item vale para os próximos lançamentos; o histórico não muda.
- Perfis: ADMIN e CONTADOR gerenciam o catálogo e lançam/editam tarefas.

## Contratos e dados do escritório
- **Configurações → Dados do escritório** (só o administrador edita): razão social, CNPJ, CRC, responsável pela assinatura, endereço, contato e foro padrão. Saem nos contratos.
- **Contratos → Modelos de contrato:** o texto do contrato com campos automáticos, por exemplo `{{cliente.razao_social}}`, `{{contrato.honorarios_extenso}}`. Há um modelo para clientes fixos, outro para eventuais, ou um para todos.
- **Emitir contrato:** escolhe-se o cliente e o modelo, ajustam-se as condições (início, vigência, serviços, honorários, vencimento, foro…) e confere-se a prévia. O texto é montado no **servidor** com os dados do banco; se faltar algum dado obrigatório o contrato não é emitido.
- **Número ANO/NNN** gerado pelo banco (sem repetir). O texto emitido é uma **cópia** e nunca mais muda (mesmo que o modelo ou o cadastro mudem); só pode ser **cancelado**, nunca excluído.
- **PDF:** abra o contrato e use **Imprimir / PDF** (no navegador: destino "Salvar como PDF").
- Perfis: ADMIN e CONTADOR emitem e gerenciam modelos; só ADMIN altera os dados do escritório.
- Os modelos do escritório estão em `docs/modelos/*.modelo.txt` (empresa, pessoa física e serviço avulso) e entram no sistema com `npm run seed:contratos` (cadastra só os que ainda não existem; `-- --update` substitui o texto dos existentes). Cada modelo tem um **tipo de pessoa** (empresa, pessoa física ou qualquer) e só aparece para clientes compatíveis.
- **Trechos condicionais:** `{{#se modulo.fiscal}} … {{/se}}` (também `modulo.contabil`, `modulo.folha`, `modulo.societario`) só sai no contrato se o serviço foi marcado na emissão; `{{n}}` numera os trechos que saírem (1, 2, 3…).
- **Dados que o contrato de empresa exige do cliente:** representante legal (nome, RG, CPF e endereço de residência) no cadastro do cliente. Pessoa física: RG. Do escritório: CRC (só o número), categoria (ex.: CONTADOR), CPF do responsável, endereço, **chave PIX** e razão social (assina o contrato). Se faltar algo, a emissão é bloqueada e a tela lista o que falta.

## Vários escritórios (isolamento de dados)
Cada escritório tem a sua base: um usuário só enxerga e altera dados do **próprio** escritório, garantido pelo banco (RLS), não só pelas telas.
- **Escritório novo (somente por você, com a chave secreta):** `npm run office:create -- --name "Escritório X" --admin-email adm@x.com --admin-name "Fulano"`. Cria o escritório, o administrador (senha provisória mostrada uma vez), as categorias padrão e os modelos de contrato (editáveis na tela).
- **Mais usuários num escritório existente:** `npm run office:user -- --office <id> --email pessoa@x.com --name "Nome" --role CONTADOR` (ids com `npm run office:list`).
- **Assinatura:** `npm run office:list -- --suspend <id>` suspende o escritório (ninguém dele acessa nada) e `-- --activate <id>` reativa. No futuro, o pagamento da assinatura só precisará ligar/desligar essa mesma chave.
- **Não deixe o cadastro público aberto:** no Supabase, **Authentication → Sign In / Providers → desligue "Allow new users to sign up"**. Mesmo com o cadastro aberto, uma conta nova nasce sem escritório e sem perfil ativo (não vê nada), mas não há motivo para deixar aberto.
- Todos os dados que já existiam passam para o escritório principal (criado pela migração com o nome do cadastro em Configurações).
- CNPJ/CPF de cliente, nomes de modelo/tarefa/categoria e a numeração ANO/NNN dos contratos passam a valer **por escritório**.
- `npm run seed:contratos` cadastra modelos e categorias que faltarem em todos os escritórios (ou `-- --office <id>`).

## Digitação e endereço
- CPF, CNPJ, telefone e CEP são formatados enquanto se digita; no banco ficam só os dígitos.
- Ao completar o CEP, rua, bairro, cidade e UF são buscados no ViaCEP (consulta feita pelo servidor, com tempo limite). Se falhar, o preenchimento é manual.

## Backup
O plano gratuito tem backups limitados. Veja `npm run backup` e `npm run restore` em `docs/DEPLOY.md`.
