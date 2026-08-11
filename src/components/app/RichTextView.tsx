import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { normalizarRichText } from "@/lib/rich-text";
import { RICH_TEXT_CLASSES } from "./rich-text-classes";

// Renderiza HTML salvo pelo RichTextEditor (informações de sessão/evento)
// já sanitizado — o conteúdo é visto por outros irmãos, então nunca deve
// ser injetado sem passar por aqui. Sanitização só roda no navegador: o
// conteúdo vem de useQuery (busca só client-side), então durante o SSR
// esse componente nunca tem HTML real pra mostrar mesmo — evita puxar
// jsdom (isomorphic-dompurify) pro bundle do servidor só por causa disso.
export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (typeof window === "undefined" || !html) return null;
  const limpo = DOMPurify.sanitize(normalizarRichText(html), {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
  if (!limpo) return null;
  return (
    <div className={cn(RICH_TEXT_CLASSES, className)} dangerouslySetInnerHTML={{ __html: limpo }} />
  );
}
