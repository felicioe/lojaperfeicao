import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TabelaPaginacao({
  pagina,
  totalPaginas,
  totalItens,
  tamanhoPagina,
  setPagina,
}: {
  pagina: number;
  totalPaginas: number;
  totalItens: number;
  tamanhoPagina: number;
  setPagina: (fn: (p: number) => number) => void;
}) {
  if (totalItens === 0 || totalPaginas <= 1) return null;

  const inicio = (pagina - 1) * tamanhoPagina + 1;
  const fim = Math.min(pagina * tamanhoPagina, totalItens);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
      <p className="text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{inicio}</span>–
        <span className="font-medium text-foreground">{fim}</span> de{" "}
        <span className="font-medium text-foreground">{totalItens}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagina <= 1}
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Anterior
        </Button>
        <span className="min-w-[5.5rem] text-center text-muted-foreground">
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
        >
          Próxima <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
