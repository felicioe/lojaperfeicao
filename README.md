# Fraternity Ledger

Crie um sistema de gestão para uma loja maçônica, com as seguintes áreas:

Irmãos: cadastro completo, gestão de dados pessoais e maçônicos, relatório de frequência e relatório de inadimplentes.

Tesouraria: controle financeiro, lançamentos de movimento (entradas/saídas), transferências entre contas, relatórios financeiros.

Contabilidade: DRE, balancete, orçamento e trilha de auditoria.

Configurações: parâmetros do sistema, gestão de usuários com permissões, backup, log de atualizações.

Dashboard inicial com três painéis: Contas a Pagar (próximos 30 dias), Saldo de Caixa do dia, Saldo Projetado (30 dias).

Use autenticação de usuários (login), controle de acesso por perfil/permissão, e um layout limpo e profissional adequado para uso administrativo.

## Deploy

O deploy roda exclusivamente na Hostinger: ela puxa este repositório do GitHub
e roda o build ela mesma, num Node normal (`nitro.preset = "node-server"` em
`vite.config.ts`). As variáveis de ambiente ficam no painel Node.js da
Hostinger — não há leitura de `.env` em produção.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
