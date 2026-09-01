import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Faixa única e compacta de filtros — reúne campos de período, seleção
// (chips) e busca numa única linha, com "Limpar filtros" aparecendo só
// quando algo foge do estado padrão da tela. Substitui o padrão anterior de
// dois cards empilhados (grade de campos + card de chips separado).
export function BarraFiltros({
  children,
  temFiltroAtivo,
  onLimpar,
}: {
  children: ReactNode;
  temFiltroAtivo: boolean;
  onLimpar: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      {children}
      {temFiltroAtivo && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-auto h-auto p-0 text-xs"
          onClick={onLimpar}
        >
          <X className="mr-1 h-3 w-3" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

export function CampoFiltroCompacto({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={htmlFor}
        className="whitespace-nowrap text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function SeparadorFiltro() {
  return <div className="h-6 w-px shrink-0 bg-border" />;
}
