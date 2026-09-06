import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-hooks";
import { useIsDesktop } from "@/lib/use-media-query";
import {
  resolverItensMobileIrmao,
  ITEM_SEGURANCA_IRMAO,
  type ItemMobileIrmao,
} from "@/lib/menu-mobile-irmao";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { LogIn, LayoutGrid, Smartphone, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/ajuda")({
  head: () => ({ meta: [{ title: "Ajuda — Gestão Maçônica" }] }),
  component: PainelAjuda,
});

// Conteúdo de ajuda por item do menu — chaveado por rota pra reaproveitar
// exatamente o mesmo ícone/cor/rótulo/ordem de menu-mobile-irmao.ts (fonte
// única já usada pela barra de abas, gaveta e grade da home). Isto também
// garante que a ajuda nunca menciona um item que o admin ocultou pro papel
// do usuário: passa pelo mesmo resolverItensMobileIrmao que monta a
// navegação de verdade, então o que aparece aqui bate com o que a pessoa
// realmente vê no próprio Meu Painel.
const AJUDA_POR_ROTA: Record<string, { texto: string; passos?: string[] }> = {
  "/painel/financeiro": {
    texto:
      "Aqui você vê suas mensalidades: quais já foram pagas e quais ainda estão em aberto, com valor e data de vencimento.",
    passos: [
      "Toque numa mensalidade da lista para ver os detalhes completos.",
      "Toque em “Baixar PDF” para salvar ou compartilhar o comprovante — vira um arquivo de verdade no seu celular, não precisa tirar print da tela.",
      "Se estiver tudo em dia, você pode emitir o Certificado de Quitação, um documento que comprova que você não tem pendência com a Loja.",
    ],
  },
  "/painel/sessoes": {
    texto:
      "Mostra as próximas sessões da Loja e as sessões que já aconteceram, com data e assunto de cada uma.",
  },
  "/painel/comunicacoes": {
    texto:
      "É o mural de avisos da Loja. Comunicados que você ainda não leu aparecem com a marca “Novo” ao lado do título — depois que você abre a tela, eles somem sozinhos da contagem de pendências.",
  },
  "/painel/eventos": {
    texto:
      "Lista os eventos da Loja (jantares, confraternizações, palestras). Em cada um, você pode confirmar presença tocando em “Vou”, “Talvez” ou “Não vou” — isso ajuda a organização a se planejar.",
  },
  "/painel/frequencia": {
    texto:
      "Mostra em quais sessões você esteve presente e em quais faltou, ao longo do tempo — é a mesma frequência usada para calcular seu interstício (o tempo mínimo entre um grau e outro).",
  },
  "/painel/dados": {
    texto:
      "Aqui ficam suas informações pessoais. Seu grau e sua situação na Loja só a secretaria pode alterar, mas você mesmo pode manter atualizado telefone, celular, e-mail, endereço, profissão, empresa e cargo.",
    passos: ["Altere o que precisar.", "Toque em “Salvar” no fim da tela."],
  },
  "/biblioteca": {
    texto:
      "Reúne as peças de arquitetura (trabalhos apresentados pelos irmãos) já aprovadas — um acervo para consulta e estudo.",
  },
  "/calendario": {
    texto:
      "Junta, numa única visão, as sessões e os eventos da Loja — útil para planejar sua agenda de um jeito só.",
  },
  "/enquetes": {
    texto:
      "Quando a Loja abre uma votação ou consulta entre os irmãos, é aqui que você participa — toque na opção escolhida para registrar seu voto.",
  },
  "/documentos": {
    texto:
      "Guarda os estatutos, regimentos e demais documentos oficiais da Loja, sempre disponíveis para consulta.",
  },
  "/painel/chamados": {
    texto:
      "Use esta área quando tiver alguma dúvida ou dificuldade com o próprio sistema — não é para assuntos da Loja em si, e sim para quando algo no aplicativo não estiver funcionando como deveria.",
    passos: [
      "Toque em “Abrir chamado”.",
      "Escreva um assunto curto e, na descrição, explique o que aconteceu com o máximo de detalhes possível.",
      "Envie. Você recebe uma resposta na própria tela, e também por e-mail.",
    ],
  },
  "/conta/seguranca": {
    texto:
      "É onde você protege e personaliza a forma de entrar no sistema: trocar a senha, cadastrar Face ID ou digital, ativar a verificação em duas etapas ou vincular sua conta Google. Tudo opcional, exceto trocar a senha quando quiser — login e senha já são suficientes pra usar o sistema normalmente.",
  },
};

function SecaoAjuda({ item }: { item: ItemMobileIrmao }) {
  const conteudo = AJUDA_POR_ROTA[item.to];
  if (!conteudo) return null;
  return (
    <AccordionItem value={item.to}>
      <AccordionTrigger className="min-h-11 py-3 text-base">
        <span className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.tint}`}
          >
            <item.icon className="h-4.5 w-4.5" />
          </span>
          {item.label}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pl-12 text-sm text-muted-foreground">
        <p>{conteudo.texto}</p>
        {conteudo.passos && (
          <ol className="mt-2 list-decimal space-y-1.5 pl-4">
            {conteudo.passos.map((passo, i) => (
              <li key={i}>{passo}</li>
            ))}
          </ol>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function PainelAjuda() {
  const isDesktop = useIsDesktop();
  const { user } = useSession();

  const itensResolvidos = resolverItensMobileIrmao({
    menuItensOcultos: user?.menuItensOcultos ?? [],
    menuItensOcultosPessoal: user?.menuItensOcultosPessoal ?? [],
    menuMobilePapel: user?.menuMobilePapel ?? null,
  });

  return (
    <div className="space-y-4">
      {isDesktop && <PageHeader title="Ajuda" />}

      <Card>
        <CardContent className="flex items-start gap-3 pt-6 text-sm text-muted-foreground">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            Este guia mostra o que aparece no Meu Painel — a área do sistema feita para você, irmão.
            Toque no título de cada item abaixo para abrir a explicação.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex items-center gap-2 font-medium">
            <LogIn className="h-4 w-4 text-primary" /> Como entrar no sistema
          </div>
          <p className="text-sm text-muted-foreground">
            O acesso é feito pelo endereço que a secretaria da sua Loja informou. O login e a senha
            também são fornecidos por ela — digite os dois na tela de entrada e toque em “Entrar”.
            Esqueceu a senha? Toque em “Esqueci minha senha”, logo acima do campo de senha.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex items-center gap-2 font-medium">
            <LayoutGrid className="h-4 w-4 text-primary" /> Conhecendo a tela inicial
          </div>
          <p className="text-sm text-muted-foreground">
            No celular, a barra de baixo traz os atalhos mais usados, sempre visíveis. O ícone ☰ no
            canto superior esquerdo abre o menu com o restante das opções, incluindo Segurança da
            conta e o botão para sair. A cor de cada ícone é sempre a mesma em qualquer tela do
            sistema — com o tempo, você reconhece cada área só pela cor.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Accordion type="single" collapsible>
            {itensResolvidos.map((item) => (
              <SecaoAjuda key={item.to} item={item} />
            ))}
            <SecaoAjuda item={ITEM_SEGURANCA_IRMAO} />
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex items-center gap-2 font-medium">
            <Smartphone className="h-4 w-4 text-primary" /> Instalar no celular
          </div>
          <p className="text-sm text-muted-foreground">
            O sistema pode ser instalado como um aplicativo de verdade no seu celular, com ícone na
            tela — sem precisar baixar nada de loja de aplicativos. Na tela de entrada (login),
            procure o cartão que oferece “Instalar aplicativo”: no Android, toque e confirme; no
            iPhone, toque em “Ver como instalar” e siga o passo a passo (compartilhar → Adicionar à
            Tela de Início).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2 font-medium">
            <HelpCircle className="h-4 w-4 text-primary" /> Dúvidas frequentes
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Esqueci meu login, e agora?</p>
              <p className="text-muted-foreground">
                Fale com a secretaria da sua Loja — só ela pode confirmar ou reenviar seu login.
              </p>
            </div>
            <div>
              <p className="font-medium">Posso trocar a cor ou o tamanho da letra?</p>
              <p className="text-muted-foreground">
                No menu ☰, em “Conta”, há a opção de alternar entre modo claro e modo escuro. O
                tamanho do texto segue o que estiver configurado no seu próprio celular.
              </p>
            </div>
            <div>
              <p className="font-medium">Algo não está funcionando — o que eu faço?</p>
              <p className="text-muted-foreground">
                Abra um chamado em{" "}
                <Link to="/painel/chamados" className="underline underline-offset-2">
                  Chamados de Suporte
                </Link>
                , contando o que aconteceu.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
