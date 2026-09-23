import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import {
  Search,
  X,
  Newspaper,
  FileText,
  BookOpen,
  Users,
  Scale,
  Library,
  Lock,
  Download,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buscarConteudo, type CategoriaBusca } from "@/lib/backend/busca-conteudo";

// Campo fixo de busca ampla de conteúdo (issue #710) — sempre visível no
// topo do menu lateral dos três shells, SEM atalho de teclado (diferente da
// busca de menu Ctrl+K, issue #697/MenuSearch.tsx, que continua existindo à
// parte pra filtrar rótulos de item de menu). Ao digitar, quem usa o campo
// decide quando isso conta como "buscando" via debounce (~300ms) — feito
// pelo componente pai (cada shell), não aqui, porque o pai também precisa
// saber quando trocar a área principal pela tela de resultados.
export function CampoBuscaConteudo({
  value,
  onChange,
  className,
  dark = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Sidebars escuras (AppShell/PlataformaShell) precisam de um contraste
   * diferente do padrão claro do Input — mesmo raciocínio de asButtons em
   * NavTree: um único componente, duas variantes visuais. */
  dark?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2",
          dark ? "text-sidebar-foreground/50" : "text-muted-foreground",
        )}
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar notícias, irmãos, documentos…"
        aria-label="Buscar conteúdo"
        className={cn(
          "pl-8 pr-8",
          dark &&
            "border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus-visible:border-sidebar-ring",
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
          className={cn(
            "absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
            dark
              ? "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

const ICONE_CATEGORIA: Record<CategoriaBusca, LucideIcon> = {
  noticias: Newspaper,
  paginas: FileText,
  jornal: BookOpen,
  irmaos: Users,
  documentos: Scale,
  biblioteca: Library,
};

// Termo mínimo pra disparar a consulta — evita rodar 6 queries em paralelo
// pra cada letra digitada antes do usuário terminar de pensar no que quer.
export const TERMO_MINIMO_BUSCA = 2;

function destacarTermo(texto: string, termo: string): ReactNode {
  if (!termo.trim()) return texto;
  const escapado = termo.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const partes = texto.split(new RegExp(`(${escapado})`, "gi"));
  if (partes.length === 1) return texto;
  return partes.map((parte, i) =>
    parte.toLowerCase() === termo.trim().toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-inherit">
        {parte}
      </mark>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  );
}

// Versão mínima local do EmptyState de AppShell.tsx — não importado de lá
// pra não criar dependência circular (AppShell também importa deste
// arquivo, para montar o campo de busca fixo).
function BlocoVazioBusca({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Search className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium">{titulo}</div>
      <p className="max-w-sm text-xs text-muted-foreground sm:text-sm">{descricao}</p>
    </div>
  );
}

/** Tela de resultados que substitui a área de conteúdo principal enquanto o
 * termo buscado (já debounced) tiver pelo menos TERMO_MINIMO_BUSCA
 * caracteres — ver cada shell (AppShell/PainelShell/PlataformaShell) pela
 * troca em si. */
export function ResultadosBuscaConteudo({ termo }: { termo: string }) {
  const termoLimpo = termo.trim();
  const {
    data: grupos,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["busca-conteudo", termoLimpo],
    queryFn: () => buscarConteudo({ data: { termo: termoLimpo } }),
    enabled: termoLimpo.length >= TERMO_MINIMO_BUSCA,
    staleTime: 30_000,
  });

  const totalResultados = grupos?.reduce((soma, g) => soma + g.itens.length, 0) ?? 0;

  return (
    <div>
      <h1 className="mb-1 font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
        Resultados para <span className="text-primary">&quot;{termoLimpo}&quot;</span>
      </h1>
      {!isLoading && !isError && (
        <p className="mb-6 text-sm text-muted-foreground">
          {totalResultados === 0
            ? "Nenhum resultado encontrado."
            : `${totalResultados} resultado${totalResultados === 1 ? "" : "s"} encontrado${totalResultados === 1 ? "" : "s"}.`}
        </p>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
        </div>
      )}

      {isError && (
        <BlocoVazioBusca
          titulo="Não foi possível buscar agora"
          descricao="Tente novamente em instantes."
        />
      )}

      {!isLoading && !isError && totalResultados === 0 && (
        <BlocoVazioBusca
          titulo="Nada encontrado"
          descricao="Tente outro termo, ou verifique a grafia."
        />
      )}

      {!isLoading &&
        !isError &&
        grupos?.map((grupo) => {
          const Icone = ICONE_CATEGORIA[grupo.categoria];
          return (
            <section key={grupo.categoria} className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Icone className="h-4 w-4" />
                {grupo.label}
                <Badge variant="secondary" className="ml-1 font-normal">
                  {grupo.itens.length}
                </Badge>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {grupo.itens.map((item) => (
                  <div
                    key={item.id}
                    className="group flex flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"
                  >
                    <Link
                      to={item.href}
                      className="flex items-start gap-2.5 focus-visible:outline-none"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium leading-snug">
                            {destacarTermo(item.titulo, termoLimpo)}
                          </span>
                          {item.restrito && (
                            <Lock
                              className="h-3 w-3 shrink-0 text-muted-foreground"
                              aria-label="Restrito"
                            />
                          )}
                        </span>
                        {item.trecho && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {destacarTermo(item.trecho, termoLimpo)}
                          </span>
                        )}
                      </span>
                    </Link>
                    {item.arquivoHref && (
                      <a
                        href={item.arquivoHref}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-[2.625rem] inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download className="h-3 w-3" /> Abrir PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
