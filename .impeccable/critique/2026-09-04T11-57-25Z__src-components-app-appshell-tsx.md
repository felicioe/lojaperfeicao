---
target: src/components/app/AppShell.tsx
total_score: 21
max_score: 36
na_heuristics: 9
p0_count: 1
p1_count: 1
target_identity: "file:C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\AppShell.tsx"
target_fingerprint: "sha256:18c0ed8944dd4286a34032dbaf04fa4316601d1e34271863f601322626bf2e97"
target_path: "C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\AppShell.tsx"
timestamp: 2026-09-04T11-57-25Z
slug: src-components-app-appshell-tsx
---
Method: dual-agent (Assessment A e B rodadas em sub-agentes isolados e paralelos)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Rota atual e grupo ativo se destacam; grupo único do irmão nasce fechado no primeiro acesso |
| 2 | Match System / Real World | 4 | Ícones e rótulos batem com o domínio maçônico/contábil real |
| 3 | User Control and Freedom | 2 | Sem favoritar/fixar itens; recolher a sidebar é a única liberdade oferecida |
| 4 | Consistency and Standards | 2 | Ícones repetidos dentro do mesmo grupo (Wallet 3x, AlertTriangle 2x em Tesouraria) |
| 5 | Error Prevention | 1 | "Resetar Financeiro" tem o mesmo peso visual de "Recibos" |
| 6 | Recognition Rather Than Recall | 3 | Auto-expansão do grupo ativo + persistência de estado no localStorage |
| 7 | Flexibility and Efficiency | 1 | Sem busca, sem atalho de teclado, sem forma de comprimir grupos densos |
| 8 | Aesthetic and Minimalist Design | 3 | Sub-cabeçalhos de seção dão chunking, mas competem com legibilidade a 11-13px |
| 9 | Error Recovery | n/a | Nav não renderiza estados de erro |
| 10 | Help and Documentation | 2 | Chamados de Suporte funciona como escape hatch; sem tooltip pra termos como "Tronco de Beneficência" |
| **Total** | | **21/36** | **Acceptable (58%)** |

## Design Specificity Verdict

**Avaliação qualitativa (Assessment A)**: Isto não é um painel admin genérico com nomes trocados. O vocabulário (Tronco de Beneficência, Interstício, Corpos Maçônicos, SGCAB, Balancete, Fechamento de Exercício) é maçônico e contábil-formal de verdade, embutido diretamente na estrutura de dados, com decisões de produto documentadas em comentários citando números de issue reais (#358, #366/#367/#380, #391).

**Scan determinístico (Assessment B)**: `detect.mjs` rodou limpo — 0 achados, nenhum sinal automatizado de drift de design-system ou padrão genérico. Reforça o veredito qualitativo: não há evidência mecânica de "isso poderia ser qualquer produto".

**Overlays visuais**: não disponíveis nesta sessão (extensão do Chrome não conectada) — toda a análise, das duas avaliações, veio de leitura de código-fonte, não de renderização ao vivo. Recomendo revalidar contraste de cor real (tokens `sidebar-foreground/NN%`) com inspeção visual quando possível.

## Overall Impression

A reorganização resolveu o problema que ela se propôs a resolver — desequilíbrio *entre* grupos (o grupo "Suporte" de 1 item sumiu, contagens ficaram mais parecidas). Mas não resolveu, e não tinha como resolver sem tocar no que você pediu pra manter, a densidade *dentro* dos dois grupos maiores (Tesouraria 22 itens, Comunicação & Site 10). A maior oportunidade agora é dar tratamento visual diferenciado à única ação genuinamente perigosa do menu (Resetar Financeiro) e destravar o primeiro acesso do irmão comum, que hoje esbarra num accordion fechado.

## What's Working

1. **Bifurcação de interação por perfil, não só de conteúdo** — o menu do irmão comum renderiza cada item como botão outline com alvo maior (`asButtons`), exatamente o público que mais precisa disso — decisão deliberada, documentada em comentário no próprio código.
2. **Fuga do flyout em hover** — clicar num ícone de grupo com a sidebar recolhida expande a sidebar inteira e já abre aquele grupo, em vez de depender de posicionamento de mouse preciso sobre um flyout. Bom para motricidade reduzida.
3. **Zero achados mecânicos de higiene básica** (Assessment B): nenhuma rota duplicada entre os 64 itens de `groupsAdmin`, nenhum ícone/label faltando, todos os 3 botões só-ícone do arquivo têm `aria-label`.

## Priority Issues

**[P0] Ação destrutiva sem nenhum destaque visual**
- **O quê**: "Resetar Financeiro" usa exatamente a mesma classe de item que "Recibos" — mesmo peso de fonte, cor e tamanho de ícone.
- **Por que importa**: é uma ação de altíssimo risco, a um clique de distância, no meio de uma lista de 22 itens que qualquer admin navega rotineiramente.
- **Fix**: aplicar `text-destructive` só nesse item, ou movê-lo pra fora do fluxo normal de "Encerramento" com fricção extra.
- **Suggested command**: `/impeccable harden`

**[P1] "Meu Painel" nasce fechado no primeiro acesso do irmão**
- **O quê**: o único grupo do menu member-only começa fechado quando nenhuma rota interna está ativa — e isso é exatamente o estado em que o irmão chega ao pousar em `/painel`.
- **Por que importa**: é o cenário exato da persona-alvo do produto (irmão mais velho, primeira vez, tentando achar "onde vejo minha situação financeira") — a informação fica atrás de um accordion fechado que ele precisa descobrir que existe.
- **Fix**: eliminar o wrapper collapsible nesse menu (só tem 1 grupo, não precisa ser recolhível) ou forçá-lo aberto por padrão.
- **Suggested command**: `/impeccable onboard`

**[P2] Alvos de toque abaixo do próprio padrão do produto — confirmado por medição exata**
- **O quê (Assessment A)**: itens do menu admin desktop usam padding pequeno (`px-2.5 py-1.5`) e texto 13px; cabeçalhos de grupo, 11px.
- **O quê (Assessment B, achado que a revisão qualitativa não pegou)**: o botão de recolher/expandir sidebar mede 28px (`h-7 w-7`), menor que o `SidebarIcon` vizinho de 40px na mesma área. No drawer mobile, os botões de tema/sair medem 36px (`h-9`, override explícito do padrão `h-11` do componente `Button`), menores que o próprio botão hambúrguer de 40px que abre esse drawer.
- **Por que importa**: o produto declara "alvos de toque grandes" como requisito de produto, não boa prática opcional, por causa do perfil etário dos irmãos — mas esse padrão só foi aplicado ao menu member-only, não ao admin (operado pelos mesmos irmãos em papéis de diretoria/tesouraria), e existe inconsistência mensurável mesmo dentro da própria sidebar.
- **Fix**: aumentar padding/fonte no `itemPad` desktop; remover o override `h-9` dos botões do drawer mobile (voltar ao `h-11` padrão do `Button`); alinhar o botão de recolher a 40px como os demais ícones da mesma área.
- **Suggested command**: `/impeccable adapt`

**[P2] Importadores de Ensino alocados em "Administração", não em "Agenda & Ensino"**
- **O quê**: "Importar Calendário", "Cronograma (PDF)" e "Planos de Ensino (PDF)" ficam sob "Administração", enquanto "Planos de Ensino" (o item não-importado) está em "Agenda & Ensino".
- **Por que importa**: quem for montar o calendário letivo do ano procura primeiro em "Agenda & Ensino" — a mesma tarefa mental fica dividida em dois grupos de topo, na contramão do critério "o que a Loja publica e pra quem" usado pra justificar a fusão de Comunicação & Site.
- **Fix**: mover o sub-grupo "Importadores" (ou ao menos os itens de calendário/ensino) pra dentro de "Agenda & Ensino".
- **Suggested command**: `/impeccable layout`

**[P3] Ícones repetidos no grupo mais denso + accordions sem exclusividade mútua**
- **O quê**: dentro de Tesouraria, `Wallet` aparece 3x, `ArrowLeftRight` 2x, e `AlertTriangle` é usado tanto em "Inadimplentes" quanto "Inadimplência Detalhada". Separadamente, nada impede abrir Tesouraria + Contabilidade + Comunicação & Site ao mesmo tempo (~50 links visíveis simultaneamente).
- **Por que importa**: num grupo que já viola "chunking ≤4", reduzir ainda mais o poder do ícone como atalho visual piora a localização; a falta de exclusividade faz o disclosure progressivo degradar ao longo de uma sessão real de uso.
- **Fix**: ícones únicos por item dentro do mesmo grupo; considerar accordion exclusivo pelo menos no menu admin.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Alex (Power User)**: sem busca/jump-to nem atalho de teclado em 64 itens de nav total; sem como fixar os 5 itens que usa todo dia dentro de um grupo de 22 — cada sessão é uma nova varredura visual do mesmo grupo denso.

**Sam (Acessibilidade)**: `aria-label` presente nos 3 botões só-ícone do arquivo (confirmado por Assessment B) é positivo pra leitor de tela; mas texto 11-13px e o padrão `sidebar-foreground/55` a `/75` pra "des-enfatizar" texto é risco de contraste que não pôde ser confirmado sem inspeção visual real — recomendo auditoria de contraste antes de dar como resolvido.

**Irmão idoso, pouco à vontade com tecnologia** (persona específica do produto): bate direto no P1 — chega no painel, vê "Início" e um único bloco fechado chamado "Meu Painel" com uma seta; precisa entender que precisa clicar ali antes de ver "Financeiro" ou "Comunicações". Uma vez aberto, a experiência melhora bastante (lista plana, botões grandes) — o problema é só o primeiro passo.

## Minor Observations

- `FileBarChart` é usado tanto para "Frequência" quanto para "Plano de Contas" — dois conceitos sem relação, mesmo ícone.
- O padrão de `section` só precisa ser declarado no primeiro item de cada subseção — funciona hoje, mas é um contrato implícito frágil: um item inserido no meio sem entender essa regra funde duas seções silenciosamente.
- O cabeçalho "Meu Painel" é redundante como rótulo de accordion sendo o único grupo existente — reforça a sugestão do P1.
- Zero rotas duplicadas, zero ícone/label faltando, aria-label completo nos botões só-ícone (Assessment B) — a higiene mecânica básica do arquivo está sólida.

## Questions to Consider

1. Se o objetivo da reorganização era corrigir "20 itens vs. 1 item", por que Tesouraria manteve 22 itens em vez de virar 2 grupos de topo (ex: "Tesouraria — Operações" e "Tesouraria — Relatórios")?
2. Dado que a persona do irmão idoso é prioridade de produto, por que o menu member-only (botões grandes) e o admin (denso, texto pequeno) não convergiram pro mesmo padrão de toque/legibilidade, já que a mesma pessoa pode transitar entre os dois papéis?
3. Existe uma tela de confirmação forte depois de "Resetar Financeiro"? Se não, isso eleva o P0 de achado de UX pra risco operacional real.
