---
name: frontend-design
description: Regras visuais e de interface do sistema de gestão do escritório contábil (Next.js + Tailwind). Use antes de criar ou alterar qualquer tela, componente, formulário, tabela, card ou preview deste projeto, e ao revisar se uma tela "parece feita por IA".
---

# Frontend design do projeto

Sistema interno de um escritório contábil. Quem usa são o administrador e a equipe financeira, todos os dias e por horas seguidas. A interface deve parecer **um sistema de gestão sério e consistente**, não uma landing page nem um app de demonstração.

Base: princípios de `emil-design-eng` (detalhes invisíveis, pouca animação em telas de uso diário) e `ui-ux-pro-max` (acessibilidade, consistência, densidade de dashboard), adaptados a este projeto.

## 1. Antes de desenhar
1. Procure uma tela parecida no projeto e **copie o padrão dela**. A referência principal é `src/components/finance/payables-view.tsx`: filtros em grade, cabeçalho de tabela e linhas com borda.
2. Use os componentes de `src/components/ui/` (`Card`, `Button`, `Badge`, `Field`, `Input`, `Select`, `Dialog`, `EmptyState`) antes de criar elementos novos.
3. Mudança visual relevante: faça um preview em HTML e mostre ao usuário antes de alterar o código.

## 2. Cores (tokens em `tailwind.config.ts`)
- Texto principal `text-navy` / `text-ink`; texto secundário `text-slate-500`.
- Bordas `border-line`; fundo de áreas neutras `bg-surface`; cards `bg-white`.
- Ação principal `primary`. Estados: `success`, `warning`, `danger` (com `-soft` para fundos).
- Tipo de conta: **Empresa = `primary`**, **Pessoal = `personal`** (verde-petróleo). Não use violeta, rosa ou gradientes para representar tipos ou categorias.
- Cor sempre acompanhada de texto. Nunca use só a cor para transmitir uma informação.
- Nada de cores puras do Tailwind (`violet-*`, `pink-*`, `emerald-*`) quando existir um token do projeto para aquilo.

## 3. Tipografia e densidade
- Fonte Inter. Títulos de página `text-2xl font-bold text-navy`; título de card `text-[16px] font-semibold`.
- Corpo de tabela `text-[13px]`/`text-sm`; rótulos e cabeçalhos `text-xs font-medium text-slate-600`.
- Cabeçalho de lista/tabela: `rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600`.
- Números (valores, contagens) alinhados à direita e com `tabular-nums`.
- Densidade de sistema de gestão: espaçamentos de 8 a 20px. Evite blocos enormes e muito ar.

## 4. O que faz uma tela "parecer IA" (evitar)
- Etiquetas arredondadas coloridas para tudo (pílulas, chips com fundo pastel).
- Bordas tracejadas e fundos coloridos em áreas de soltar ou cards.
- Ícone decorativo ao lado de cada título, alças de arrastar em toda linha, emojis.
- Parágrafos explicativos longos no topo dos cards. Prefira uma linha curta, ou nenhuma.
- Gradientes, sombras fortes, `rounded-2xl`/`3xl`, brilhos, contornos coloridos grossos.
- Botões coloridos para ações secundárias. Ações secundárias são links discretos (`text-slate-500 hover:text-navy`).
- Muitos tons diferentes na mesma tela.

## 5. O que fazer
- Listas de dados em **tabela** (ou grade com cabeçalho), separadas por `border-b border-line`.
- Escolhas múltiplas por linha: **caixa de marcar** (`accent-primary`), não botões-pílula.
- Agrupamentos: card branco, `border border-line`, `rounded-lg`/`rounded-xl`, cabeçalho com uma marca pequena de cor (quadradinho de 8px) e a contagem à direita.
- Estado ativo/arrastando: só a borda muda de cor, com um anel suave (`ring-2 ring-primary/20`).
- Badges só para status (Pago, Vencido, Pendente) e tipo (Empresa, Pessoal).
- Textos em português do Brasil, curtos e diretos.

## 6. Interação e movimento
- Telas de uso diário: sem animação de entrada. Só transições de cor/borda de até 150ms.
- Todo botão precisa de estado de foco visível (`focus-visible:ring-2 ring-primary/40`).
- Ações que salvam mostram retorno (spinner pequeno ou toast via `notify`).
- Arrastar e soltar sempre tem uma alternativa por clique (caixa de marcar ou botão), que funcione no celular.

## 7. Acessibilidade e responsivo
- Contraste mínimo 4.5:1. Botões só com ícone precisam de `aria-label`.
- Áreas de toque de pelo menos 32px de altura em tabelas e 40px em formulários.
- Funcionar a partir de 360px de largura, sem rolagem horizontal da página; tabelas largas viram linhas empilhadas no celular (`md:grid`).

## 8. Checklist antes de entregar
- [ ] Segue o padrão de uma tela existente do projeto?
- [ ] Só usa tokens de cor do projeto?
- [ ] Sem pílulas, tracejados, gradientes ou textos explicativos longos?
- [ ] Funciona no celular e por teclado?
- [ ] Testado no navegador local, com print para o usuário?
