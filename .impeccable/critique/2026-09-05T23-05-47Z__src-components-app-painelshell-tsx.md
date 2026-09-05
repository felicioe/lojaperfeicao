---
target: "src/components/app/PainelShell.tsx — reavaliacao pos #467/#463"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\PainelShell.tsx"
target_fingerprint: "sha256:e2d4e4bf7c609dba201fe5c1d73b54dde86541307bd3a3589e059c5cd634cbc0"
target_path: "C:\\users\\evandro\\projetos\\lojaperfeicao\\src\\components\\app\\PainelShell.tsx"
timestamp: 2026-09-05T23-05-47Z
slug: src-components-app-painelshell-tsx
---
Method: dual-agent (Assessment A — revisão manual de design · Assessment B — detector + evidência de navegador), ambos executados como sub-agentes isolados, sem visibilidade um do outro.

## Design Health Score

| # | Heurística | Nota | Achado-chave |
|---|-----------|-------|-----------|
| 1 | Visibilidade do status do sistema | 3 | Badges de não-lidos, skeleton dimensionado pela config real; falta empty-state pra "Frequentes" vazio e `aria-current` na aba ativa |
| 2 | Correspondência com o mundo real | 3 | Rótulos em PT-BR, ícones intuitivos; toast referencia o glifo "☰" em vez de descrever o botão |
| 3 | Controle e liberdade do usuário | 3 | `window.confirm` permite cancelar antes de salvar lista vazia; sem preview do resultado no Meu Painel enquanto o admin configura |
| 4 | Consistência e padrões | 3 | Cor unificada via fonte única corrige a quebra original, mas introduz 3 nova(s): ícone da aba sem par dark-mode, `window.confirm` isolado (só 2 arquivos usam vs. `AlertDialog` em ~20), "Segurança" categorizada diferente na home vs. na gaveta |
| 5 | Prevenção de erros | 2 | Guarda de lista vazia existe, mas nada impede o render de "Frequentes" vazio nem entradas legadas órfãs no picker do admin |
| 6 | Reconhecimento em vez de memorização | 3 | Picker do admin agora mostra só os 11 itens relevantes pro papel Irmão; gaveta agrupada com chips de cor |
| 7 | Flexibilidade e eficiência de uso | 3 | Camadas loja/pessoal/papel continuam poderosas pro admin e invisíveis pro irmão — sem mudança nesta rodada |
| 8 | Design estético e minimalista | 3 | Divisão real "Frequentes"/"Mais" (mesma fatia da barra de abas, não é só rótulo), mas "Mais" ainda pode chegar a 8 itens soltos |
| 9 | Ajuda a reconhecer/diagnosticar/recuperar de erros | 2 | Sem mudança nas duas lacunas novas (Frequentes vazio, entrada órfã) |
| 10 | Ajuda e documentação | 2 | O toast único é a única ajuda contextual nova desta rodada |
| **Total** | | **27/40** | **Aceitável** |

Scan determinístico (`detect.mjs --json`) nos 5 arquivos revisados: **0 achados, exit code 0** — limpo. O detector não pega os dois problemas mais importantes desta rodada (contraste dark-mode e touch target real por breakpoint), que só apareceram com evidência ao vivo (tema escuro lido no CSS, `getBoundingClientRect` em produção). Isso não é falso-negativo do detector — é o tipo de achado que exige inspeção visual/comportamental, exatamente o papel da Assessment B.

## Veredito de Especificidade de Design

**Avaliação manual**: Agora parece autoral, não genérico. Existe uma fonte única real (`menu-mobile-irmao.ts`) que decide cor, ordem e conjunto pras três superfícies (aba, gaveta, grade da home), o picker do admin foi deliberadamente recortado pros 11 itens que fazem sentido pro papel Irmão, e o toast de aviso foi desenhado especificamente pra proteger o hábito motor de quem sempre tocava "Frequência" numa posição fixa — não é um padrão genérico de app. Por outro lado, as correções foram aplicadas arquivo por arquivo, não como um passe único e coerente: alguns detalhes de acabamento (par de cor no modo escuro, ramificação de texto do toast, guarda de estado vazio) foram tratados em algumas superfícies e esquecidos nas irmãs — exatamente o tipo de lacuna que um teste de todos os estados juntos teria pego antes de publicar.

**Scan determinístico**: 0 achados nos 5 arquivos (`PainelShell.tsx`, `AppShell.tsx`, `painel/index.tsx`, `menu-mobile.tsx`, `menu-mobile-irmao.ts`). Sem falsos positivos a reportar — não havia achados pra avaliar.

**Evidência ao vivo**: sessão pré-autenticada como admin/super-admin (não vinculado a irmão) — mesma limitação da rodada anterior. `/administracao/menu-mobile` com papel "Irmão" confirmado visualmente: um único grupo "MEU PAINEL" com exatamente 11 itens (era catálogo completo de 63 rotas em 7 grupos). Emulação de viewport estreito falhou 3/3 tentativas de novo (`resize_window` reporta sucesso, `window.innerWidth` não muda) — real PainelShell e a gaveta mobile do AppShell continuam não-visualizáveis nesta sessão. Zero erros de console nas duas telas testadas, em múltiplos carregamentos.

## Impressão Geral

A arquitetura da correção está certa — uma fonte única de itens/cor/ordem é exatamente o tipo de fix estrutural que fecha a causa raiz, não só o sintoma. Mas a auditoria anterior pediu consistência, e a implementação, ao perseguir consistência de cor, escondeu duas inconsistências novas que só aparecem quando alguém realmente troca de tema ou mede o botão renderizado — nenhuma das duas seria pega batendo o olho no modo claro em viewport largo, que é provavelmente como foi validado. A maior oportunidade agora não é mais desenhar mais coisa: é testar o que já existe nos dois extremos (tema escuro, breakpoint real) antes do próximo "ficou bom".

## O Que Está Funcionando

- **Fonte única de verdade** (`menu-mobile-irmao.ts`): fecha de vez o risco de duas listas divergentes que a auditoria anterior identificou — não é cosmético, é arquitetural.
- **Touch targets tratados sistematicamente** (não pontualmente): hambúrguer, avatar, botões da gaveta e (na intenção, ver achado novo abaixo) botões de reordenar do admin — todos revisados juntos, não um de cada vez.
- **Picker do admin recortado pro papel**: mostrar só os 11 itens que têm efeito real pro Irmão em vez do catálogo de 63 rotas elimina uma classe inteira de configuração-que-não-faz-nada.

## Priority Issues

**[P1] Ícones da barra de abas ficam com contraste ruim no modo escuro**
- **Por que importa**: `onPrimary` (ex.: `text-emerald-300` em `menu-mobile-irmao.ts:46`) não tem par `dark:`, ao contrário de `tint` no mesmo objeto. A cor de fundo da barra (`bg-primary`) inverte de navy escuro no tema claro (`styles.css:96`) pra dourado claro no tema escuro (`styles.css:155`) — então um ícone pensado pra contrastar com fundo escuro perde contraste exatamente quando o fundo vira claro. É o público de 60+ que mais provavelmente liga o modo escuro por conforto visual, e é ele quem sofre a regressão.
- **Fix**: dar a `onPrimary` a mesma disciplina de par claro/escuro que `tint` já tem.
- **Suggested command**: `/impeccable harden`

**[P1] Toast de aviso manda o usuário pro lugar errado quando o item foi removido de vez**
- **Por que importa**: `PainelShell.tsx:79-87` sempre diz "toque no ☰ pra encontrá-la", mas se o admin excluiu Frequência da lista do papel (não só tirou da aba), `resolverItensMobileIrmao` já filtra o item completamente (`menu-mobile-irmao.ts:148-150`) — ele não está na gaveta pra ser encontrado. Um aviso pensado pra tranquilizar vira uma instrução que não funciona, exatamente no momento em que o usuário já está inseguro.
- **Fix**: ramificar o texto do toast entre "foi pro menu ☰" (demovido) e "não está mais disponível pro seu papel" (removido).
- **Suggested command**: `/impeccable clarify`

**[P2] O fix dos botões de reordenar não chega a 44×44 no uso real do admin**
- **Por que importa**: `menu-mobile.tsx:170,181` define `className="h-11 w-11"`, mas o componente `Button` (`button.tsx:24`) já define `size="icon"` como `"h-11 w-11 sm:h-9 sm:w-9"` — o `sm:` vence a partir de 640px porque o `cn()`/`twMerge` não trata classe sem prefixo e classe `sm:`-prefixada como o mesmo conflito. Medido ao vivo: **36×36px**, não 44×44, em qualquer viewport ≥640px — ou seja, exatamente a largura de tela em que um admin normalmente configura essa tela (notebook/desktop). O objetivo da correção só se realiza abaixo de 640px, que não é o contexto real de uso desta tela específica.
- **Fix**: sobrescrever explicitamente o `sm:h-9 sm:w-9` (ex.: `className="h-11 w-11 sm:h-11 sm:w-11"`) já que aqui o alvo é 44×44 em qualquer largura, não um comportamento mobile-first.
- **Suggested command**: `/impeccable audit`

**[P2] `window.confirm` foge do padrão de confirmação do resto do app**
- **Por que importa**: `menu-mobile.tsx:76-83` é só o segundo lugar no projeto a usar `window.confirm` nativo pra uma ação destrutiva — o padrão dominante (~20 arquivos, ex. `resetar-financeiro.tsx`) usa `AlertDialog`. Funciona, mas quebra a consistência visual que o resto da correção desta rodada buscou.
- **Fix**: trocar por `AlertDialog` do design system.
- **Suggested command**: `/impeccable polish`

**[P2] Seção "Frequentes" pode renderizar vazia, e "Segurança" é categorizada de dois jeitos diferentes**
- **Por que importa**: `painel/index.tsx:252` não tem guarda de tamanho (ao contrário da linha 253, que na prática nunca é falsa, já que `tilesMais` sempre inclui `ITEM_SEGURANCA_IRMAO`) — se um admin salvar 0 itens pro papel, a home mostra o rótulo "Frequentes" sobre uma grade vazia. Separadamente, "Segurança" entra misturada em "Mais" na home (`painel/index.tsx:46`) mas ganha seção própria "Conta" na gaveta (`PainelShell.tsx:228-231`) — o mesmo item, duas taxonomias, nas duas telas que deveriam estar unificadas.
- **Fix**: guarda de tamanho na grade da home; escolher uma classificação pra "Segurança" (conteúdo ou chrome de conta) e replicar nas duas telas.
- **Suggested command**: `/impeccable harden`

## Persona Red Flags

**Irmão, 60+, pouca familiaridade com internet/celular** (persona específica do projeto — audiência declarada do `/painel`): se ele ligar o modo escuro pelo próprio menu (oferecido ali do lado, plausivelmente porque ajuda a vista) os ícones coloridos da barra de abas perdem contraste — o mesmo recurso pensado pra conforto visual prejudica a legibilidade que a correção de cor deveria ter garantido. Se o admin da loja mudar a config do papel dele e remover algo, o aviso único que deveria tranquilizá-lo ("toque no ☰ pra encontrar") manda pra um lugar onde o item não existe mais — o momento pensado pra evitar "acho que quebrou" pode acabar causando exatamente isso.

**Alex (admin configurando o menu mobile)**: os botões de subir/descer prioridade, embora codificados como 44×44, renderizam 36×36 no notebook/desktop dele — mais perto do padrão anterior do que o changelog sugere. Sem preview ao vivo de como a grade "Frequentes"/"Mais" vai ficar pro irmão, ele não tem como notar de configuração que zerar a lista deixa um cabeçalho "Frequentes" vazio na tela de quem usa.

## Minor Observations

- `rotuloPorRota` continua usando sempre o catálogo completo (não `gruposExibidos`) pra resolver rótulos (`menu-mobile.tsx:118-120`) — boa decisão defensiva, mantém o rótulo correto mesmo pra item salvo antes de trocar de papel.
- `MAX_ABAS_EXTRAS` (`PainelShell.tsx:31`) e `MAX_TILES_FREQUENTES` (`painel/index.tsx:32`) são a mesma constante `4` definida duas vezes — contraria o próprio objetivo de `menu-mobile-irmao.ts` de centralizar tudo num só lugar.
- Se `menuMobilePapel` do papel Irmão um dia guardar uma rota fora dos 11 itens (config legada), ela fica presa na lista de prioridade sem checkbox correspondente pra removê-la — improvável no fluxo atual, mas sem tratamento.
- Toast fica em `localStorage` (por aparelho, não por conta) — em celular compartilhado da família, outro usuário pode nunca ver o aviso, ou vê-lo de novo desnecessariamente.
- Falta `aria-current` na aba ativa da barra de baixo (`PainelShell.tsx:139-159`) — lacuna pré-existente, não tocada nesta rodada.

## Questions to Consider

- Se o modo escuro tivesse sido testado uma vez só contra a nova barra de abas colorida antes de publicar, essa regressão teria sobrevivido? Qual é o passo de revisão que deveria pegar "um token visual novo não foi checado nos dois temas"?
- O objetivo declarado de `menu-mobile-irmao.ts` era "uma lista só, sem desvio" — por que as duas telas que a consomem ainda definem cada uma o próprio "4" mágico? Centralizar cor mas não quantidade foi descuido, ou sinal de que a correção saiu sob pressão de tempo?
- "Segurança" é conteúdo ou é chrome de conta? As duas telas construídas na mesma leva discordam entre si — qual resposta é a pretendida, e vale alinhar a outra agora, enquanto ainda é o escopo de uma única issue?
