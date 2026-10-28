# Publicação (Vercel + Supabase) e operação

## 1. Antes de publicar (checklist)
- [ ] Todas as migrações `supabase/migrations/*.sql` executadas, em ordem (ver `docs/SUPABASE.md`).
- [ ] `npm run clear:demo` executado (remove clientes, financeiro e tarefas de demonstração).
- [ ] Administrador criado (`npm run seed`) e **senha forte** definida. Crie os demais usuários em
      *Authentication → Users* e libere cada um em `profiles` (perfil e `active = true`).
- [ ] *Authentication → Sign In / Providers*: **Allow new users to sign up desligado**.
- [ ] Verificação em duas etapas ligada nas contas do Supabase, Vercel e e-mail do administrador.
- [ ] `npm run typecheck`, `npm test` e `npm run build` sem erros.
- [ ] Chaves que já passaram por chat, print ou arquivo compartilhado: **gere novas** no painel do Supabase.

## 2. Vercel
1. Importe o repositório (Next.js é detectado sozinho).
2. *Settings → Environment Variables* (Production e Preview), **somente**:
   - `NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`, sem `/rest/v1`)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. **Não cadastre** `SUPABASE_SECRET_KEY` nem `SEED_*` (são só para scripts na sua máquina).
   - Opcional, para o **Assistente IA**: `GOOGLE_GENERATIVE_AI_API_KEY` (e `AI_MODEL`, se quiser outro modelo).
     É variável de servidor: nunca com prefixo `NEXT_PUBLIC_`. Com dados reais, use uma chave do plano pago
     (no gratuito o Google pode usar o conteúdo enviado). Ver a seção "Assistente de IA" do `README.md`.
4. Região das funções: **São Paulo (gru1)**, igual ao banco, para menor latência.
5. Depois do primeiro deploy, no Supabase: *Authentication → URL Configuration* → *Site URL* = endereço publicado.

## 3. Segurança já aplicada
- Acesso aos dados só com login e perfil **ativo**; permissões por perfil no **banco (RLS)** e de novo no servidor.
- Escritas financeiras e de tarefas só por funções SQL (atômicas, idempotentes); nada é excluído (cancela/inativa).
- Auditoria de clientes, financeiro e tarefas em `audit_log` (leitura só ADMIN).
- Cabeçalhos de segurança (`X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`).
- Chave secreta fora do código do app e do bundle (verificado no build).
- Exportação CSV neutraliza fórmulas de planilha (`=`, `+`, `-`, `@`).

## 4. Riscos conhecidos e aceitos
- **`npm audit` (PostCSS embutido no Next 15):** alertas de leitura de *source map* ao processar CSS de terceiros. O
  PostCSS roda só na compilação, com CSS do próprio projeto. A correção exige Next 16 (mudança maior); reavalie ao migrar.
- **Sem CSP estrita:** o Next exige configuração com *nonce* para CSP rigorosa; ficou para uma evolução.
- **Limite de tentativas de login:** vem do próprio Supabase Auth (configurável em *Authentication → Rate Limits*).
- **Geração automática de honorários/recorrências:** acionada pelo app (ao abrir a página ou pelos botões). Para gerar sem
  ninguém abrir o sistema, agende com a extensão `pg_cron` do Supabase.

## 5. Backup e restauração (na sua máquina)
```bash
npm run backup                              # cria backups/<data-hora>/ com JSON + manifesto com SHA-256
npm run restore -- backups/<pasta> --confirm
```
- Faça backup **toda semana** (ou antes de qualquer mudança grande) e guarde cópia **fora do computador** (disco externo/nuvem
  protegida). Os arquivos contêm dados dos clientes: não envie para o Git nem por e-mail.
- A restauração **só roda em banco sem clientes** (nunca sobrescreve) e confere a integridade dos arquivos antes de gravar.
  Para recomeçar em um projeto Supabase novo: aplique as migrações, rode `npm run seed`, depois `restore`.
- **Não restaura** contas de login (ficam no Supabase Auth) nem regrava `audit_log` (os arquivos ficam no backup).
- Teste a restauração em um projeto Supabase de teste pelo menos uma vez antes de depender dela.
- O Supabase também faz backups próprios; confira o plano em *Project Settings → Database → Backups*.

## 6. Operação mensal sugerida
1. Início do mês: *Contas a Receber → Gerar honorários* (idempotente).
2. *Contas a Pagar* ao abrir já gera as recorrências.
3. *Relatórios → Inadimplência* para cobrança; *Fluxo de caixa* para fechamento.
4. `npm run backup`.
