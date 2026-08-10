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
  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-foreground", className)}
      onClick={() => ord.alternar(campo)}
    >
      <span className="inline-flex items-center gap-1">
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
      </span>
    </TableHead>
  );
}
