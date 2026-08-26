import { cn } from "@/lib/utils";
import { RICH_TEXT_CLASSES } from "./rich-text-classes";

// Diferente de RichTextView (que só renderiza no cliente, via DOMPurify),
// este componente é seguro por construção durante o SSR: o HTML que ele
// recebe já passou por sanitizarRichTextPublico() no servidor (loaders de
// noticias-publica.ts/paginas-site-publica.ts) — sem isso, as páginas
// públicas (issue #382) mostrariam o conteúdo vazio até a hidratação,
// quebrando o SEO que é o motivo de existirem como rota própria.
export function ConteudoPublicoHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div className={cn(RICH_TEXT_CLASSES, className)} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
