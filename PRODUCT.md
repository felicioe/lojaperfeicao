# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois grupos de usuários autenticados, mais o público em geral na parte institucional:

- **Irmãos (membros) de uma loja maçônica** — acessam o "Painel" (`/painel`) pra ver sua
  situação financeira, faturas, frequência, eventos e comunicações. Perfil etário
  predominantemente mais velho.
- **Administração da loja** (secretaria, tesouraria, diretoria) — operam tesouraria,
  contabilidade formal, cadastro de irmãos, sessões, ensino, comissões, comunicações,
  CMS do site institucional e configurações da própria loja.
- **Super-admins da plataforma** (equipe do SGLFM) — gerenciam todas as lojas clientes
  pelo painel `admin-saas` (lojas, usuários, chamados de suporte, configurações globais).
- **Visitante do site institucional público** — a parte pública embutida no mesmo app
  (`/`, `/agenda`, `/noticias`, `/paginas/:slug`) é vitrine da loja (não do SGLFM como
  produto) e é editável pela própria administração via CMS.

## Product Purpose

Sistema de gestão para lojas filosóficas maçônicas (SGLFM): substitui planilhas e
sistemas genéricos de associação por um único sistema que já entende a estrutura e o
vocabulário maçônico (irmãos, sessões, interstício, tronco de beneficência, potências)
integrado a um financeiro/contábil completo (tesouraria, contabilidade formal,
cobrança de mensalidade). Sucesso = a loja consegue rodar toda a operação
administrativa e financeira dentro do sistema, e os irmãos conseguem acompanhar sua
própria situação sem precisar perguntar à secretaria.

## Positioning

Modelagem nativa da estrutura maçônica — interstício, sessões e frequência, cargos e
graus, tronco de beneficência, potências/organizações superiores — que nenhum ERP
genérico de associação sem fins lucrativos modela de fábrica, combinada a um módulo
financeiro/contábil completo (DRE, balancete, plano de contas, razão, fechamento)
integrado ao cadastro de membros. Um concorrente genérico teria que ser customizado
pra cada um desses conceitos; aqui já vêm prontos.

## Operating Context

- SaaS multi-loja real: hoje atende a Associação Adonhiram Ita
  (sistema.associacaoadonhiramita.org) e a arquitetura (`admin-saas`, `saas-lojas`,
  isolamento por `loja_id` verificado em `checar:escopo-loja`) existe para dar suporte
  a múltiplas lojas clientes simultaneamente, cada uma com seu próprio subdomínio/site
  institucional.
- Hospedagem exclusiva na Hostinger, deploy via GitHub → build Node no painel da
  Hostinger (ver CLAUDE.md do repositório).
- Módulos principais: tesouraria (contas, movimentos, conciliação, cobranças,
  parcelamentos, faturas, recibos, tronco), contabilidade (plano de contas, razão,
  diário, balancete, DRE, DRE orçado, fechamento), gestão de irmãos (cadastro,
  frequência, interstício, comissões, cargos/gestões), ensino (planos, importação de
  calendário/sessões), CMS institucional (notícias, páginas, agenda, menu do site,
  fluxo de aprovação editor→aprovador), comunicações, eventos, enquetes, biblioteca,
  documentos, chamados de suporte (loja↔plataforma), backups, auditoria, segurança
  (2FA, passkey, recuperação de senha).
- PWA instalável (SGLFM) pro painel autenticado.

## Capabilities and Constraints

- Autorização em duas camadas: papel dentro da loja (`comPapel`) e papel de plataforma
  (`comSuperAdmin`), com isolamento de dados por `loja_id` verificado automaticamente
  (`npm run checar:escopo-loja`).
- CMS com fluxo editor → aprovador antes de publicar conteúdo público.
- Site institucional público é multi-tenant também: cada loja edita o próprio menu,
  notícias, páginas e agenda.
- Terminologia é a da maçonaria brasileira (irmão, loja, sessão, interstício, tronco,
  potência) — não traduzir/genericizar esses termos em UI ou documentação.

## Accessibility & Inclusion

Perfil etário dos irmãos tende a ser mais avançado — texto legível, contraste
suficiente, alvos de toque grandes e navegação sem depender de gestos ou jargão
técnico são requisito de produto, não só boa prática genérica de acessibilidade.

## Product Principles

1. A estrutura maçônica (sessões, interstício, cargos, tronco, potências) é modelada
   nativamente, nunca forçada dentro de campos genéricos de "associação".
2. Financeiro e contábil formal vivem integrados ao cadastro de membros — nunca um
   sistema à parte.
3. Isolamento de dados entre lojas é inegociável: toda funcionalidade nova precisa
   passar por `checar:escopo-loja` antes de ser considerada pronta.
4. O site institucional público de cada loja é editável pela própria loja (CMS), não
   hardcoded pelo time da plataforma.
5. Legibilidade e simplicidade de interação vêm antes de densidade de informação,
   por causa do perfil etário do usuário final (irmão).
