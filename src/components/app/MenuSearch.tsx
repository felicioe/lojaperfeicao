import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Extraído de AppShell.tsx (issue #697): a paleta de comando (Ctrl/Cmd+K)
// nasceu só dentro do AppShell — este componente existe pra ser reusada
// também por PainelShell (mobile do papel "irmao") e PlataformaShell
// (/admin-saas), cada um passando a própria lista de itens já filtrada por
// permissão (useCan/menuOcultos/menuMobilePapel), sem vazar nada que o shell
// não mostraria de qualquer forma.
export type MenuSearchItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
};

export type MenuSearchGroup = {
  id: string;
  label: string;
  items: MenuSearchItem[];
};

// Mesmo padrão de normalização já usado em outros pontos do projeto (ex.:
// src/lib/conciliacao-match.ts, src/lib/pix.ts) — minúsculas + remoção de
// diacríticos, pra "sessao" encontrar "Sessões" e "SESSOES" também. O filtro
// padrão do cmdk (command-score) é fuzzy mas não trata acento, então esta
// busca troca o algoritmo por um substring simples, o que já cobre o pedido
// da issue #697 (case-insensitive + tolerância a acento, sem fuzzy search
// avançado).
function normalizarTexto(valor: string): string {
  return valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function filtrarItemDeMenu(value: string, search: string): number {
  return normalizarTexto(value).includes(normalizarTexto(search)) ? 1 : 0;
}

export function MenuSearch({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Cada grupo já deve vir filtrado pelo shell chamador (só o que o
  // usuário/papel atual pode ver naquele shell).
  groups: MenuSearchGroup[];
}) {
  const nav = useNavigate();

  const goTo = (to: string) => {
    onOpenChange(false);
    nav({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} filter={filtrarItemDeMenu}>
      <CommandInput placeholder="Buscar no menu..." />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g.id} heading={g.label}>
            {g.items.map((i) => (
              <CommandItem key={i.to} value={`${g.label} ${i.label}`} onSelect={() => goTo(i.to)}>
                <i.icon className={cn("h-4 w-4", i.destructive && "text-destructive")} />
                <span className={cn(i.destructive && "text-destructive")}>{i.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
