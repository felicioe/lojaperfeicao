import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Estrela de favorito direto no item do menu (issue #782). Antes o único
// jeito de fixar um favorito era abrir /conta/menu, achar o item na grade e
// clicar em "Salvar" — sair da tela em que se está trabalhando, que é
// justamente a fadiga que o favorito deveria resolver.
//
// A visibilidade da estrela é responsabilidade de quem renderiza (o
// NavTree), e não daqui: no desktop ela só aparece no hover do item (a
// lista tem ~50 itens e 50 estrelas sempre visíveis transformam o menu
// num campo de marcação, competindo com o conteúdo); no toque, onde não
// existe hover, ela é sempre visível — senão seria inalcançável.

export function EstrelaFavorito({
  ativo,
  rotulo,
  onAlternar,
  className,
}: {
  ativo: boolean;
  // Rótulo do item do menu — usado no aria-label ("Adicionar Faturas aos
  // favoritos"); sem ele o leitor de tela só anunciaria "botão".
  rotulo: string;
  onAlternar: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // aria-pressed comunica o estado marcado/desmarcado.
          aria-pressed={ativo}
          aria-label={
            ativo ? `Remover ${rotulo} dos favoritos` : `Adicionar ${rotulo} aos favoritos`
          }
          onClick={(e) => {
            // O item do menu é um Link que envolve a linha inteira; sem
            // isto, clicar na estrela também navegaria pra rota.
            e.preventDefault();
            e.stopPropagation();
            onAlternar();
          }}
          className={cn(
            "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring hover:text-sidebar-primary",
            ativo && "text-sidebar-primary",
            // Mesmo recurso do SidebarMenuAction do shadcn/ui: o `after:`
            // estende a área clicável para 44px onde não há mouse, sem
            // ocupar espaço visual na linha do menu.
            "after:absolute after:-inset-3 after:md:hidden",
            className,
          )}
        >
          <Star className={cn("h-3.5 w-3.5", ativo && "fill-current")} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {ativo ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      </TooltipContent>
    </Tooltip>
  );
}
