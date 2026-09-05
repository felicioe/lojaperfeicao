---
target: src/components/app/PainelShell.tsx — reavaliacao rodada 3 pos-fix
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\PainelShell.tsx"
target_fingerprint: "sha256:4705018a4484339848cdbb2892d1d9ba5bde48ef78f3714ced308d5a1431614b"
target_path: "C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\PainelShell.tsx"
timestamp: 2026-09-05T23-51-10Z
slug: src-components-app-painelshell-tsx
---
Method: dual-agent (Assessment A — revisão manual de design · Assessment B — detector + evidência de navegador ao vivo em produção), ambas rodadas como sub-agentes isolados.

## Design Health Score

| # | Heurística | Nota | Achado-chave |
|---|-----------|-------|-----------|
| 1 | Visibilidade do status do sistema | 3 | Toast distingue corretamente "foi pra gaveta" vs "sumiu de vez"; toast único nunca refaz se o admin reconfigurar de novo |
| 2 | Correspondência com o mundo real | 4 | PT-BR claro em todo lugar, sem jargão |
| 3 | Controle e liberdade do usuário | 3 | Cancelar no AlertDialog realmente aborta; sem forma de "repinar" um item demovido sem ir no admin |
| 4 | Consistência e padrões | 3 | AlertDialog agora no padrão do resto do app; ainda sobra 1 `window.confirm` fora do escopo (contas-pagar.tsx) |
| 5 | Prevenção de erros | 4 | Guarda de lista vazia é fricção real contra uma mudança destrutiva pra todo o papel |
| 6 | Reconhecimento em vez de memorização | 3 | Fonte única unifica aba/gaveta/home; grupo "Conta" vazio-aparente prejudicava isso (corrigido nesta rodada) |
| 7 | Flexibilidade e eficiência | 3 | Reorder do admin com alvo de toque real de 44×44, confirmado ao vivo |
| 8 | Estética e minimalismo | 3 (era 2) | Grid de 1 item esticado em 4 colunas corrigido nesta rodada |
| 9 | Ajuda a recuperar de erros | 3 | Copy do guard de lista vazia nomeia a consequência exata, não é "tem certeza?" genérico |
| 10 | Ajuda e documentação | 2 | Sem mudança — fora do escopo desta rodada |
| **Total** | | **30/40** | **Bom** |

Scan determinístico: **0 achados, limpo** nos 5 arquivos.

## Veredito de especificidade

4 das 5 correções da rodada anterior foram confirmadas corretas com evidência forte — inclusive medição ao vivo em produção (botão de reordenar: 44×44px reais, className resolvida sem `sm:h-9/w-9` residual; AlertDialog: diálogo temático confirmado via `role="alertdialog"`, automação nunca travou nele, Cancelar realmente não salva). A 5ª correção (grid "Frequentes"/"Mais"/"Conta") resolveu o problema que foi pedido pra resolver mas criou um novo: "Conta" com 1 item só num `grid-cols-4` deixava 3 colunas vazias sob o rótulo — parecia carregamento quebrado. Corrigido nesta mesma rodada.

## O que está funcionando

- Fix do botão de reordenar confirmado por medição real no DOM de produção, não só leitura de código — o tipo de correção que merece confiança.
- Toast e AlertDialog resolvidos com evidência comportamental ao vivo (não só estática).
- Fonte única de itens continua pagando dividendo: nenhuma correção precisou tocar em mais de uma lista.

## Priority Issues

**[P1 — corrigido nesta rodada] Grupo "Conta" de 1 item esticado num grid-cols-4** — `painel/index.tsx` `GradeTiles` agora só usa `grid-cols-4` com mais de 3 itens; com menos, vira `flex` com tile de `w-1/4` (mesma largura visual, sem reservar colunas vazias). Cobre também "Mais" quando o admin configurar poucos itens.

## Minor Observations

- Comentário do arquivo ainda dizia "dois grupos" quando o código já produzia três — atualizado.
- `menu-mobile-irmao.ts`: `text-amber-300 dark:text-amber-800` (Legislação) é a única cor cujo par escuro é da mesma família de matiz do fundo dourado do tema escuro — contraste numérico deve passar, mas pode ler como "mais apagado" que os outros 10 ícones. Não verificável sem screenshot real do `/painel` em modo escuro (conta de teste não é vinculada a irmão). Candidato a `/impeccable colorize` se for notado ao vivo.
- `src/routes/_authenticated/tesouraria/contas-pagar.tsx:283` ainda usa `window.confirm` nativo pra um delete irreversível — mais grave que o caso já corrigido aqui, mas é outro arquivo/outra tela: fora do escopo desta issue, candidato a issue própria.

## Questions to Consider

- O toast do fix #2 dispara uma vez só, pra sempre, por navegador — é a política certa, ou toda futura reconfiguração do admin merece seu próprio aviso pontual?
- Vale abrir uma issue separada só pra varrer o projeto atrás de outros `window.confirm` (ex. `contas-pagar.tsx`), já que o padrão `AlertDialog` acabou de virar convenção reforçada nesta correção?
