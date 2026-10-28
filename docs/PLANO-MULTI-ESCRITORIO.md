# Plano: cada escritório enxerga somente a sua própria base

## 1. O problema hoje
O sistema foi feito para **um único escritório**. Todas as tabelas (clientes, cobranças, contas a pagar, tarefas,
contratos, modelos, dados do escritório) são compartilhadas: qualquer usuário ativo, de acordo com o seu perfil
(ADMIN, CONTADOR, FINANCEIRO, OPERADOR), enxerga **tudo**. As regras de segurança do banco (RLS) filtram por *perfil*,
não por *dono dos dados*. Se outra pessoa criar uma conta, ela veria os clientes do Anderson.

## 2. O objetivo (como entendi)
Transformar o sistema em **multi-escritório** (multi-tenant): cada escritório que se cadastrar tem a sua base isolada.
Um usuário só vê e altera dados do **seu** escritório, e nunca os de outro, mesmo que tente por meios técnicos
(o isolamento fica no banco, não só nas telas).

> Termos: **escritório** = quem contrata o sistema (hoje, o Anderson). **Cliente** = cliente do escritório (empresa/pessoa).
> Se a ideia for outra (o *cliente do Anderson* entrar e ver só os próprios dados, um portal do cliente), o plano
> muda — ver pergunta 1 na seção 8.

## 3. Princípio de segurança
1. **Toda linha pertence a um escritório** (`office_id`).
2. **Todo usuário pertence a exatamente um escritório** (no perfil).
3. **O banco impõe o isolamento** (RLS por `office_id`), e as funções do banco (RPC) também checam o escritório.
   O aplicativo nunca decide sozinho.
4. O `office_id` **nunca vem do navegador**: é sempre derivado do usuário logado.

## 4. Mudanças no banco (migração nova, em etapas seguras)

### 4.1 Estrutura
- Nova tabela `offices` (id, nome, CNPJ, situação ativo/suspenso, criado em).
- `profiles.office_id` (obrigatório): o escritório do usuário.
- Coluna `office_id` (not null, com índice) em **todas** as tabelas de dados: `clients`, `client_fee_history`,
  `recurrence_rules`, `receivables`, `payables`, `payments`, `financial_categories`, `task_types`,
  `task_definitions`, `task_executions`, `contract_templates`, `contract_counters`, `contracts`, `audit_log`.
- `office_settings` deixa de ser "linha única" e passa a ter **uma linha por escritório**.

### 4.2 Regras que hoje são globais e viram "por escritório"
| Hoje (global) | Passa a ser |
|---|---|
| CNPJ/CPF do cliente único no sistema | único **dentro do escritório** (dois escritórios podem ter o mesmo cliente) |
| Nome de modelo de contrato, de categoria e de tarefa únicos | únicos dentro do escritório |
| Numeração de contrato `ANO/NNN` (contador por ano) | contador **por escritório e ano** |
| Dados do escritório (singleton) | uma linha por escritório |

### 4.3 Segurança (RLS)
- Função `private.my_office()` que devolve o escritório do usuário logado.
- **Todas as policies** passam a exigir `office_id = private.my_office()` **além** do perfil.
- `office_id` preenchido automaticamente por gatilho a partir do usuário (e **bloqueado para alteração**): não dá para
  gravar em outro escritório nem "mover" um registro.
- As ~47 funções do banco (emitir contrato, gerar honorários, criar clientes eventuais, lançar tarefas em lote, etc.)
  são revisadas uma a uma: filtram por escritório e recusam IDs de outro escritório ("não encontrado").
- A geração mensal de honorários passa a rodar por escritório.
- Chaves estrangeiras compostas ou gatilhos garantem que, por exemplo, uma cobrança só aponte para cliente **do mesmo escritório**.

### 4.4 Dados existentes
Criar o escritório "Anderson Cardozo Assessoria Contábil" e **atribuir todos os dados atuais e usuários atuais a ele**
antes de ativar as novas regras. Nada se perde. Backup completo (`npm run backup`) antes de aplicar.

## 5. Mudanças no aplicativo
- **Cadastro de novo escritório** (fluxo de entrada): cria o escritório e o primeiro usuário (ADMIN dele) em uma única
  operação atômica no servidor.
- **Convite de usuários** pelo ADMIN do escritório (e-mail + perfil): o usuário convidado entra **no escritório de quem convidou**.
  O ADMIN só gerencia usuários do próprio escritório.
- O perfil/escritório do usuário é lido no servidor (`getCurrentUser`) e disponível para todas as ações.
- Telas de dados do escritório, modelos de contrato, categorias e catálogo de tarefas passam a ser por escritório.
  Escritório novo começa **vazio**, com categorias padrão e (opcional) os modelos de contrato de exemplo.
- Scripts de administração (`backup`, `restore`, `seed`, `clear-demo`) passam a receber o escritório alvo.
- Um **superadministrador da plataforma** (você), fora dos escritórios, para criar/suspender escritórios,
  sem enxergar os dados deles por padrão.

## 6. Ordem de execução (cada etapa testada antes da seguinte)
1. **Backup** completo e congelar novas mudanças.
2. **Migração A (aditiva, sem risco):** tabela `offices`, colunas `office_id` (nulas), criar o escritório do Anderson e
   preencher tudo com ele; depois `not null` + índices + novas unicidades por escritório.
3. **Migração B (segurança):** `my_office()`, gatilhos de preenchimento/bloqueio, novas policies, revisão das funções.
4. **Testes automáticos de isolamento** (ver seção 7). Só avança se **todos** passarem.
5. **Aplicativo:** leitura do escritório do usuário, cadastro de escritório, convites, ajustes de telas e scripts.
6. **Teste ao vivo** com dois escritórios de teste e usuários dos dois lados.
7. Publicação (GitHub/Vercel) somente com a sua aprovação, depois de rodar a migração no seu Supabase.

## 7. Como vamos provar que está isolado (testes obrigatórios)
Com dois escritórios (A e B), cada um com todos os tipos de dado:
- Usuário de A **não lista, não lê por ID, não altera, não exclui** nada de B, em **todas** as tabelas.
- Usuário de A **não consegue criar** registro apontando para cliente/cobrança/modelo de B, nem mudar `office_id`.
- Funções (RPC) chamadas por A com IDs de B respondem erro "não encontrado".
- Mesmo CNPJ de cliente cadastrado em A e em B funciona; duplicado dentro de A é recusado.
- Numeração de contratos é independente (A e B ambos têm `2026/001`) e continua sem repetir sob concorrência.
- Convite: usuário convidado cai no escritório certo; ADMIN de A não vê nem convida para B.
- Usuário sem escritório ou de escritório suspenso não acessa nada.
- Perfis (OPERADOR, FINANCEIRO…) continuam com as mesmas permissões **dentro** do seu escritório.
- Anônimo não lê nada.
- Teste de regressão: tudo que funcionava (financeiro, tarefas, contratos) continua funcionando para o escritório do Anderson.

## 8. Decisões tomadas
1. **Quem cadastra o login:** outro **escritório de contabilidade**, com base própria (este plano).
2. **Como um escritório novo entra:** inicialmente **somente criado pelo dono da plataforma ou por convite**. No futuro, **assinatura**: só escritório com assinatura ativa acessa o sistema. A chave `offices.active` já existe para isso (suspenso = ninguém acessa).
3. **Escritório novo recebe** as categorias padrão e os **modelos de contrato editáveis**.
4. Cobrança/planos/limites: fase posterior.

## 8-b. Situação da implementação
- [x] Migração `20261023000001_multi_escritorio.sql` (escritórios, office_id em todas as tabelas, RLS, chaves compostas, unicidades por escritório, funções reescritas).
- [x] Testes de isolamento (dois escritórios, ataques por id, RPC, escrita cruzada, suspensão, sem escritório, auto-cadastro) e teste da migração sobre dados existentes.
- [x] Scripts: criar escritório, adicionar usuário, listar/suspender/reativar, modelos por escritório; backup/restore/seed adaptados.
- [x] App: acesso exige escritório ativo; mensagem de login atualizada.
- [ ] Executar a migração no Supabase (após backup) e testar ao vivo com um escritório de teste.
- [ ] Tela de convite de usuários pelo ADMIN do escritório (hoje é por script).
- [ ] Cobrança da assinatura ligando/desligando `offices.active`.

## 9. Riscos e cuidados
- É uma mudança **estrutural e sensível**: mexe em todas as tabelas e funções. Por isso o backup, a migração em duas
  etapas e a bateria de testes de isolamento antes de qualquer publicação.
- Enquanto a Migração B não estiver completa, **não abrir cadastro para outros escritórios** (hoje um novo usuário veria tudo).
  Medida imediata recomendada: **não criar contas para pessoas de fora** até concluirmos.
- Contratos emitidos continuam imutáveis e sem exclusão; cada escritório só vê os seus.
