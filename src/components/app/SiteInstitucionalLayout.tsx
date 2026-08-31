import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import type { ItemMenuPublico } from "@/lib/menu-site-publica";
import { Button } from "@/components/ui/button";

// Layout compartilhado das rotas públicas do site institucional embutido
// (issue #382: /, /agenda, /noticias, /noticias/:id, /paginas/:slug) — header
// com o menu de navegação vindo de /api/publico/menu (editável em
// /menu-site, issue #381) e rodapé simples. Reaproveita os tokens de cor já
// usados no resto do app (bg-primary etc.) em vez de inventar uma paleta
// nova só pro site público.

function destinoParaHref(item: ItemMenuPublico): string {
  switch (item.tipo_destino) {
    case "pagina":
      return `/paginas/${item.destino}`;
    case "agenda":
      return "/agenda";
    case "noticias":
      return "/noticias";
    case "link_externo":
      return item.destino;
  }
}

function ehLinkExterno(item: ItemMenuPublico): boolean {
  return item.tipo_destino === "link_externo";
}

// Link fixo pro login do sistema interno — não depende do item "Área
// restrita"/"Acesso restrito" cadastrado em /menu-site (conteúdo do CMS,
// editável e já visto quebrar por URL cadastrada errada: sem o subdomínio
// certo, ou sem o /auth no final, já que "/" sozinho não é mais tela de
// login nenhuma, é a home pública — ver src/routes/index.tsx). Fica sempre
// certo, independente do que estiver salvo no menu editável.
const LINK_ACESSO_RESTRITO = "https://sistema.associacaoadonhiramita.org/auth";

function ItemDeMenu({ item }: { item: ItemMenuPublico }) {
  const href = destinoParaHref(item);
  // Sem target="_blank": em modo standalone (PWA instalado na tela de
  // início, iOS/Android) abrir nova aba costuma falhar silenciosamente — o
  // toque não faz nada, fica na mesma página, sem erro. "Área restrita"
  // (o link mais importante daqui, leva pro sistema/login) é o caso mais
  // grave disso. Navegar na mesma aba funciona em qualquer modo.
  const conteudo = ehLinkExterno(item) ? (
    <a href={href} className="hover:text-primary">
      {item.label}
    </a>
  ) : (
    <Link to={href} className="hover:text-primary">
      {item.label}
    </Link>
  );

  if (item.filhos.length === 0) return <li>{conteudo}</li>;

  return (
    <li className="group relative">
      {conteudo}
      <ul className="mt-1 ml-3 space-y-1 border-l pl-3 text-sm text-muted-foreground sm:absolute sm:mt-0 sm:hidden sm:min-w-40 sm:border sm:bg-popover sm:p-2 sm:shadow-md sm:group-hover:block">
        {item.filhos.map((filho) => (
          <ItemDeMenu key={filho.label + filho.destino} item={filho} />
        ))}
      </ul>
    </li>
  );
}

export function SiteInstitucionalLayout({
  children,
  menuInicial,
}: {
  children: ReactNode;
  // Cada rota pública carrega o menu no próprio `loader` (SSR) e repassa
  // aqui como dado inicial — sem isso, o header saía sem nenhum link até a
  // hidratação terminar e o useQuery completar, quebrando a navegação para
  // quem chega via crawler ou com JS desabilitado (achado do review
  // automático da PR #386).
  menuInicial: ItemMenuPublico[];
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const { data: menu = menuInicial } = useQuery({
    queryKey: ["menu_publico"],
    queryFn: () => obterMenuPublicoFn(),
    initialData: menuInicial,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Associação Adonhiramita
          </Link>
          <nav className="hidden sm:block">
            <ul className="flex items-center gap-6 text-sm font-medium">
              {menu.map((item) => (
                <ItemDeMenu key={item.label + item.destino} item={item} />
              ))}
              <li>
                <a href={LINK_ACESSO_RESTRITO} className="hover:text-primary">
                  Acesso restrito
                </a>
              </li>
            </ul>
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:hidden"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Abrir menu"
          >
            {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        {menuAberto && (
          <nav className="border-t border-primary-foreground/20 px-4 py-3 sm:hidden">
            <ul className="space-y-2 text-sm font-medium">
              {menu.map((item) => (
                <li key={item.label + item.destino}>
                  {ehLinkExterno(item) ? (
                    <a href={destinoParaHref(item)}>{item.label}</a>
                  ) : (
                    <Link to={destinoParaHref(item)} onClick={() => setMenuAberto(false)}>
                      {item.label}
                    </Link>
                  )}
                  {item.filhos.length > 0 && (
                    <ul className="mt-2 ml-3 space-y-2 border-l pl-3 text-primary-foreground/80">
                      {item.filhos.map((filho) => (
                        <li key={filho.label + filho.destino}>
                          {ehLinkExterno(filho) ? (
                            <a href={destinoParaHref(filho)}>{filho.label}</a>
                          ) : (
                            <Link to={destinoParaHref(filho)} onClick={() => setMenuAberto(false)}>
                              {filho.label}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              <li>
                <a href={LINK_ACESSO_RESTRITO} onClick={() => setMenuAberto(false)}>
                  Acesso restrito
                </a>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t bg-muted/40 py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Associação Adonhiramita
        </div>
      </footer>
    </div>
  );
}
