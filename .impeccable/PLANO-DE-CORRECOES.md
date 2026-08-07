# Plano de Correções — Impeccable Critique

**Data:** 2026-08-06  
**Score atual:** 21/40 (Aceitável)  
**Snapshot:** `.impeccable/critique/2026-08-06T14-35-20Z__src.md`

---

## Restrições globais (aplicam-se a todos os itens)

- Não alterar regras de negócio nem lógica de backend
- Não alterar banco de dados
- Não fazer commit nem push
- Executar lint/build após cada item
- Preservar todas as funcionalidades existentes

---

## Status atual das alterações desta sessão

### Arquivos modificados (já alterados)

| Arquivo                                          | Status                                  |
| ------------------------------------------------ | --------------------------------------- |
| `src/routes/_authenticated/tesouraria/index.tsx` | **Modificado** — itens 1 e 2a aplicados |
| `src/routes/_authenticated/painel/index.tsx`     | **Modificado** — item 2b aplicado       |

### Arquivos criados (esta sessão)

| Arquivo                                             | Conteúdo                    |
| --------------------------------------------------- | --------------------------- |
| `.impeccable/critique/2026-08-06T14-35-20Z__src.md` | Snapshot do critique report |
| `.impeccable/PLANO-DE-CORRECOES.md`                 | Este arquivo                |

---

## Itens pendentes de revisão/validação

Os itens 1 e 2 foram implementados mas **ainda não tiveram lint/build executados**.  
Executar antes de prosseguir:

```bash
npm run lint
npm run build
```

---

## Plano completo de execução

### ✅ Item 1 — Tabela da Tesouraria (adapt)

**Prioridade:** P0  
**Arquivo:** `src/routes/_authenticated/tesouraria/index.tsx`  
**Status:** Implementado — aguardando validação (lint/build)

**O que foi feito:**

- `<Table>` envolvida em `<div className="overflow-x-auto">` para scroll horizontal em viewports menores
- Coluna "Emissão" oculta em telas < sm (`hidden sm:table-cell`) em `<TableHead>` e `<TableCell>`
- Coluna "Categoria" oculta em telas < lg (`hidden lg:table-cell`) em `<TableHead>` e `<TableCell>`
- Badge de tipo corrigido: exibe "Entrada" e "Saída" (com acento, capitalizado) em vez de `l.tipo` bruto

**O que NÃO foi alterado:**

- Lógica de busca e paginação (`listarLancamentos`, `usePaginacao`)
- Estrutura de dados dos lançamentos
- `colSpan={9}` no estado vazio (mantido — correto para 9 colunas definidas)

---

### ✅ Item 2a — Confirmação antes de gerar mensalidades (harden)

**Prioridade:** P1  
**Arquivo:** `src/routes/_authenticated/tesouraria/index.tsx`  
**Status:** Implementado — aguardando validação (lint/build)

**O que foi feito:**

- Adicionado estado `openConfirmGerar: boolean`
- Botão "Gerar mensalidades do mês" agora abre `AlertDialog` em vez de chamar a função diretamente
- Dialog mostra: mês/ano de referência (`mesAtual`), aviso de não-duplicação, aviso de irreversibilidade
- `AlertDialogAction` chama `gerarMensalidades` — **função de negócio inalterada**
- Variável auxiliar `agora` e `mesAtual` adicionadas para cálculo de display (sem afetar o cálculo interno de `gerarMensalidades`)

**O que NÃO foi alterado:**

- Função `gerarMensalidades` — lógica, chamada de API, tratamento de erro e toast intocados
- `can.canManageFinancas` — guarda de permissão mantida

---

### ✅ Item 2b — Skeleton de loading no Painel do membro (harden)

**Prioridade:** P2  
**Arquivo:** `src/routes/_authenticated/painel/index.tsx`  
**Status:** Implementado — aguardando validação (lint/build)

**O que foi feito:**

- `import { Skeleton } from "@/components/ui/skeleton"` adicionado
- `if (meuIrmao.isLoading) return null` substituído por skeleton contextual:
  - **Desktop:** `<PageHeader>` + grid de 3 `<Card>` com skeletons de label, valor e ícone
  - **Mobile:** skeleton do bloco de boas-vindas + grid 4-colunas com 5 tiles skeleton
- Hooks chamados na mesma ordem — sem violação da regra de hooks do React

**O que NÃO foi alterado:**

- Lógica de `useMeuIrmao`, `useQuery`, `useIsDesktop`
- Estados `!meuIrmao.data` (usuário sem vínculo) e renderização autenticada
- Componente `MetricCard` e tiles — intocados

---

### ⬜ Item 3 — Fix do label de login (clarify)

**Prioridade:** P1  
**Arquivo:** `src/routes/auth.tsx`  
**Status:** Pendente

**O que fazer:**

- Alinhar label ("E-mail" ou "Usuário", conforme o backend exige) com o `type` do input e o placeholder
- Verificar o campo enviado em `handleLogin` (atualmente enviado como `email`)
- Adicionar texto de ajuda: "Problemas para entrar? Fale com o Secretário" + contato

**Restrições:**

- Não alterar `handleLogin` nem a chamada de API
- Não criar fluxo de recuperação de senha (não existe backend para isso)

---

### ⬜ Item 4 — Contraste do sidebar (audit)

**Prioridade:** P2  
**Arquivo:** Estilos do `AppShell` / `src/styles.css`  
**Status:** Pendente

**O que fazer:**

- Verificar contraste de `text-sidebar-foreground/40` nos rótulos de seção (linhas ~226 do AppShell)
- Aumentar opacidade de `/40` para pelo menos `/65` nos `section labels`
- Verificar também `/55` em subítens secundários
- Confirmar WCAG AA (4.5:1) para texto de 11px uppercase

**Restrições:**

- Não alterar a paleta de cores base (`--sidebar`, `--sidebar-foreground`)
- Não alterar comportamento de collapse do sidebar

---

### ⬜ Item 5 — "Comunicações" no tab bar mobile (layout)

**Prioridade:** P2  
**Arquivo:** `PainelShell.tsx` (localizar caminho exato antes de editar)  
**Status:** Pendente

**O que fazer:**

- Localizar o array `ABAS` no `PainelShell`
- Adicionar "Comunicações" ao tab bar em substituição ao item menos frequente
- Corrigir mapa de títulos para cobrir `/painel/eventos`

**Restrições:**

- Não alterar rotas nem permissões
- Manter no máximo 5-6 tabs (limite ergonômico)

---

### ⬜ Item 6 — Polish final (polish)

**Prioridade:** P2-P3  
**Arquivos:** `tesouraria/index.tsx`, AppShell, outros  
**Status:** Pendente — executar após todos os itens anteriores

**O que fazer:**

- Substituir `<input type="checkbox">` nativo pelo `<Checkbox>` do shadcn no `LancamentoDialog`
- Adicionar `aria-label` ao símbolo ⚜ nos lugares onde é renderizado sem texto acessível
- Normalizar badge "saida" → "Saída" em outros locais que ainda usem o valor bruto (verificar se há outros além do já corrigido)

**Restrições:**

- Nenhuma alteração de lógica de formulário
- Manter `id="pago"` e associação `htmlFor` ao substituir o checkbox

---

## Ordem de execução recomendada

```
Item 1 + 2 (feitos) → validar lint/build
→ Item 3 (auth.tsx — baixo risco, isolado)
→ Item 4 (estilos — só CSS, sem lógica)
→ Item 5 (PainelShell — navigation only)
→ Item 6 (polish — últimas inconsistências)
→ Re-executar /impeccable critique para medir score final
```

---

## Comandos de validação

```bash
# Lint
npm run lint

# Build (verifica TypeScript + bundling)
npm run build

# Detector de design (após cada item visual)
node "C:\Users\Evandro\.claude\plugins\cache\impeccable\impeccable\4.0.4\skills\impeccable\scripts\detect.mjs" --json src public
```
