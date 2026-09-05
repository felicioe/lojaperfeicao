---
target: menu lateral do painel (AppShell.tsx)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\AppShell.tsx"
target_fingerprint: "sha256:802f5e433033bd22dbc75ce5b96e7dd648a3c485d29b776975feb898a524868e"
target_path: "C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\AppShell.tsx"
timestamp: 2026-09-04T23-51-19Z
slug: src-components-app-appshell-tsx
---
Method: dual-agent (Assessment A e B rodadas em sub-agentes isolados e paralelos)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Estado ativo e grupo aberto refletem a rota; falta indicador de "carregando" ou contagens (ex.: pendências em Chamados/Aprovações) |
| 2 | Match System / Real World | 4 | Terminologia maçônica/contábil correta e consistente com o domínio |
| 3 | User Control and Freedom | 3 | Accordion exclusivo reduz ruído e é reversível/persistido; falta "abrir tudo" ou atalho de volta |
| 4 | Consistency and Standards | 2 | `asButtons` cria dois vocabulários visuais para o mesmo componente (`NavTree`) sem sinal perceptível do porquê |
| 5 | Error Prevention | 2 | "Resetar Financeiro" ganhou cor de perigo, mas nenhuma fricção extra na própria navegação antes de chegar à confirmação |
| 6 | Recognition Rather Than Recall | 2 | Grupo Tesouraria com ~22 itens exige varredura visual longa; sem busca ou favoritos |
| 7 | Flexibility and Efficiency | 1 | `cmdk` já é dependência do projeto e o `ui/sidebar.tsx` morto já tinha atalho Ctrl/Cmd+B — nenhum dos dois é usado; sem busca, atalho ou pinned items |
| 8 | Aesthetic and Minimalist Design | 3 | Sub-rótulos de seção ajudam, mas Tesouraria e Comunicação & Site continuam com carga visual alta |
| 9 | Error Recovery | 3 | Fora do escopo direto da sidebar; `NotificationBell` trata erro de fetch com "Tentar novamente" |
| 10 | Help and Documentation | 2 | "Chamados de Suporte" existe como item de menu, mas sem tooltip/onboarding para quem nunca navegou |
| **Total** | | **25/40** | **Acceptable (62,5%)** |

## Design Specificity Verdict

**Avaliação qualitativa (Assessment A)**: Autoral, não genérico. Vocabulário de domínio correto e não simplificado (Tronco de Beneficência, Interstício, SGCAB, Balancete, Fechamento de Exercício, DRE Orçado); o token `--sidebar` é fixado como "azul-marinho institucional, constante nos dois temas" por decisão documentada de marca; existe um shell inteiramente separado (`PlataformaShell.tsx`, paleta índigo/slate) só para sinalizar "você saiu do contexto de uma Loja"; o campo `NavItem.destructive` foi criado sob medida para o caso "Resetar Financeiro" em vez de reaproveitar uma variant genérica. Achado colateral relevante: `src/components/ui/sidebar.tsx` (686 linhas de boilerplate shadcn, com `SidebarProvider`, atalho Ctrl/Cmd+B, `SidebarMenuButton` etc.) não é importado em lugar nenhum do projeto — a sidebar real foi toda escrita à mão em `AppShell.tsx`. Reforça a autoria, mas é código morto a limpar.

**Scan determinístico (Assessment B)**: `detect.mjs` rodou limpo — `[]`, exit code 0. Nenhuma regra de design-system genérico violada, nenhum sinal automatizado de drift. Sem achados, portanto sem falsos positivos a reconciliar.

**Overlays visuais**: não disponíveis nesta sessão — a extensão Claude-in-Chrome não estava conectada (mesmo erro nas duas tentativas de Assessment B: "Browser extension is not connected"). Nenhum overlay foi injetado; nenhum foi inventado. Toda a análise das duas avaliações veio de leitura de código-fonte. Assessment A foi além da leitura visual e calculou contraste WCAG real a partir dos tokens OKLCH declarados em `styles.css` (conversão para sRGB, blend de alpha em espaço gama, luminância relativa, razão de contraste) — matemática exata sobre os valores do arquivo, ainda assim não equivalente a medir o pixel renderizado na tela. Recomendo reconectar a extensão e revalidar visualmente antes de fechar os achados de contraste como definitivos.

## Overall Impression

Os 5 fixes do commit anterior (`9343dd5`) resolveram 3 dos 5 problemas por completo (Meu Painel abre por padrão, alvos de toque 40-44px, importadores movidos para Agenda & Ensino) e resolveram parcialmente os outros 2: o destaque do item destrutivo existe mas introduziu uma regressão de contraste real no tema claro (3.41:1, abaixo do mínimo WCAG AA de 4.5:1), e a diferenciação de ícones em Tesouraria reduziu mas não eliminou a repetição (`Landmark` ainda aparece 2x, `Receipt`/`ReceiptText` seguem quase idênticos a 14px). A maior oportunidade de alavancagem agora não é mais o que foi corrigido, é o que nunca foi endereçado: o projeto já tem `cmdk` como dependência e um atalho de teclado pronto (não usado) no componente shadcn morto — dar busca/paleta de comando ao menu resolveria de uma vez a densidade de Tesouraria (22 itens) sem precisar reestruturar grupos.

## What's Working

1. **Accordion exclusivo com preservação de contexto por rota**: abrir uma rota dentro de um grupo sincroniza automaticamente `open` com `activeGroupId` via `useEffect`, então o usuário nunca perde a localização mesmo entrando por link direto, não só por clique no menu.
2. **Reaproveitamento de `Collapsible` do Radix** em vez de accordion próprio — dá `aria-expanded`, foco e navegação por teclado de graça.
3. **Zero achados mecânicos** (Assessment B): scan determinístico limpo, reforçando que a estrutura de nav (rotas, ícones, labels) está mecanicamente saudável mesmo com os problemas de julgamento abaixo.

## Priority Issues

**[P1] Contraste do item destrutivo falha no tema claro — regressão do próprio fix anterior**
- **O quê**: `text-destructive` no item "Resetar Financeiro" herda o token global `--destructive`. No tema claro, `oklch(0.577 0.215 27)` sobre o navy fixo do sidebar `oklch(0.24 0.045 258)` dá 3.41:1 de contraste — abaixo do mínimo WCAG AA de 4.5:1 para texto normal (o item usa `text-sm`/13px, não texto grande). No tema escuro o token muda para `oklch(0.704 0.19 22.216)` e o contraste sobe para 6.73:1 (ok).
- **Por que importa**: é exatamente o item que mais precisa ser inequívoco (ação irreversível), no tema que é o padrão do sistema. O fix do commit anterior resolveu "destaque" mas não testou legibilidade no tema claro contra o navy fixo da sidebar — o sidebar não segue o toggle de tema, mas `--destructive` sim, então os dois nunca foram calibrados juntos.
- **Fix**: criar um token dedicado, ex. `--sidebar-destructive`, calibrado contra o navy fixo (próximo do valor já usado no tema escuro, ~L 0.70-0.75), em vez de herdar `--destructive` global.
- **Suggested command**: `/impeccable harden`

**[P2] Diferenciação de ícones em Tesouraria ficou incompleta**
- **O quê**: `Landmark` ainda se repete 2x no mesmo grupo ("Contas" e "Extrato Bancário"); `Wallet` é usado tanto no ícone do grupo quanto no item "Visão Geral"; `Receipt` (Recibos) vs `ReceiptText` (Contas a Pagar) são visualmente quase idênticos a 14px.
- **Por que importa**: o achado original ("ícones repetidos enfraquecem o atalho visual") foi reduzido mas não eliminado no grupo mais denso do menu — quem escaneia por forma de ícone, não por texto, ainda tropeça nas mesmas ambiguidades.
- **Fix**: trocar `Landmark` em um dos dois usos (ex.: "Extrato Bancário" → `BadgeDollarSign` ou `FileClock`); usar um ícone mais distinto para "Contas a Pagar".
- **Suggested command**: `/impeccable clarify`

**[P2] Densidade de Tesouraria (22 itens) e Comunicação & Site (9 itens) segue alta**
- **O quê**: mesmo com sub-rótulos de seção (Cadastro/Operações/Relatórios/Encerramento), o grupo Tesouraria é uma lista rolável única de ~22 links visíveis assim que aberto — os sub-rótulos categorizam mas não escondem nada.
- **Por que importa**: viola diretamente "chunking ≤4" e "≤4 opções visíveis por decisão"; pior ainda para o irmão idoso que eventualmente acumula papel de tesoureiro/secretário.
- **Fix**: segundo nível de disclosure — cada `section` vira um sub-accordion recolhido por padrão, abrindo só a seção da rota ativa (mesmo padrão já usado para o grupo pai).
- **Suggested command**: `/impeccable layout`

**[P3] Sem busca ou atalho de teclado, apesar da infraestrutura já existir no projeto**
- **O quê**: `cmdk` já é dependência do `package.json`, e `ui/sidebar.tsx` (não usado) já tinha atalho Ctrl/Cmd+B pronto — nenhum dos dois é aproveitado no `AppShell` real.
- **Por que importa**: para o perfil "Alex/power user" (secretaria/tesouraria acessando dezenas de rotas por dia), navegar sempre por accordion + scroll é ineficiência evitável a baixo custo de implementação, já que as peças já existem no repositório.
- **Fix**: `Cmd/Ctrl+K` abrindo uma paleta de comando (`Command`/`CommandDialog` do shadcn) listando os itens de `visibleGroups` com fuzzy search.
- **Suggested command**: `/impeccable optimize`

**[P3] `asButtons` cria dois vocabulários visuais para o mesmo componente sem sinal perceptível**
- **O quê**: `NavTree` renderiza "Meu Painel" (irmão comum) como botões outline e o menu admin como links com hover simples — dois "sistemas de design" de navegação diferentes, motivados só por uma decisão documentada em comentário.
- **Por que importa**: quem transita entre os dois contextos (ex.: super-admin trocando de papel) percebe uma inconsistência de padrão sem explicação visível na própria UI.
- **Fix**: não é necessariamente um erro (decisão de produto documentada), mas aproximar cantos/cores compartilhados evitaria a sensação de duas telas de apps diferentes.
- **Suggested command**: `/impeccable polish`

## Persona Red Flags

**Irmão idoso, pouco à vontade com tecnologia** (persona específica do produto): textos em 10-11px (subtítulo "Gestão de Loja Filosófica", link de Política de Privacidade) passam na razão de contraste calculada (~4.85:1) mas ficam abaixo do tamanho confortável de leitura para esse público — o requisito de produto é "texto legível", não só "aprovado no cálculo de contraste".

**Sam (Acessibilidade)**: o contraste 3.41:1 do texto destrutivo em tema claro é uma falha WCAG AA concreta (P1 acima), não estimativa. Também falta `aria-current="page"` explícito nos links ativos — o estado atual é só visual (`bg-sidebar-accent`), o que é uma lacuna para leitores de tela indicarem "você está aqui".

**Alex (Power User)**: sem busca, atalho ou favoritos; precisa reabrir o grupo Tesouraria (22 itens) e rolar toda vez que alterna entre Movimento Financeiro e algo em Contabilidade, porque o accordion exclusivo fecha o grupo anterior — funcional, mas lento para quem faz isso dezenas de vezes por dia.

## Minor Observations

- `src/components/ui/sidebar.tsx` é código shadcn morto (686 linhas, zero imports no projeto) — vale remover para não confundir o próximo dev que for mexer na sidebar real.
- Itens de navegação desktop (`px-2.5 py-1.5 text-[13px]`) resultam em linhas de ~27-28px — abaixo do padrão de 40px do resto da barra; não é alvo de toque (é contexto desktop/mouse), mas aperta em notebooks com tela touch.
- O footer da sidebar duplica o bloco nome/e-mail do usuário em três lugares (desktop expandido, header mobile, drawer mobile) com pequenas variações de classe — risco de drift se um for atualizado e o outro não.
- `PlataformaShell.tsx` não usa tokens de tema (`slate-950`/`indigo-500` fixos) — deliberado, mas significa que esse shell nunca respeita o toggle claro/escuro que o resto do sistema tem.
- Zero achados mecânicos do detector determinístico (Assessment B): nenhuma regra de design-system genérico violada no arquivo.

## Questions to Consider

1. `cmdk` está no projeto sem uso na navegação principal por decisão deliberada (custo/benefício ainda não valeu a pena) ou é lacuna que ninguém percebeu? Se for a segunda, é o fix de maior alavancagem desta lista.
2. Por que Tesouraria não virou dois grupos de nível superior (ex. "Tesouraria — Operações" e "Tesouraria — Relatórios/Fechamento") em vez de crescer para 22 itens com sub-rótulos internos? Vale confirmar com um tesoureiro real antes de aceitar 22 itens como definitivo.
3. Se "Resetar Financeiro" exige digitar "RESETAR" no destino, por que a sidebar não adiciona nenhum degrau extra de fricção antes de chegar lá (ex.: isolar o item fora do accordion, sempre visível e sempre vermelho, para reduzir cliques acidentais no item vizinho)?
