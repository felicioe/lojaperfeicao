import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DirecaoOrdenacao } from "@/lib/use-ordenacao";

export type OrdenacaoTabela = {
  coluna: string | null;
  direcao: DirecaoOrdenacao;
  alternar: (campo: string) => void;
};

// Cabeçalho de coluna clicável, pra usar junto com useOrdenacao — mostra
// uma seta indicando a direção ativa, ou um ícone neutro nas colunas
// ainda não ordenadas. Recebe o objeto inteiro devolvido por
// useOrdenacao pra não precisar repassar coluna/direção/alternar campo a
// campo em cada `<TableHeadOrdenavel>` de uma tabela.
export function TableHeadOrdenavel({
  campo,
  ord,
  className,
  children,
}: {
  campo: string;
  ord: OrdenacaoTabela;
  className?: string;
  children: React.ReactNode;
}) {
  const ativa = ord.coluna === campo;
  const ariaSort = ativa ? (ord.direcao === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHead className={cn("select-none", className)} aria-sort={ariaSort}>
      <button
        type="button"
        className={cn(
          "inline-flex min-h-9 items-center gap-1 rounded-sm text-left transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className?.includes("text-right") && "ml-auto",
        )}
        onClick={() => ord.alternar(campo)}
        aria-label={`${ativa ? "Alterar" : "Ordenar"} por ${String(children)}${
          ativa ? `, ordem ${ord.direcao === "asc" ? "crescente" : "decrescente"}` : ""
        }`}
      >
        {children}
        {ativa ? (
          ord.direcao === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}
