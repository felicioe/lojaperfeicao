import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/format";

// Tabela de alocação de pagamento parcial (issue #131), compartilhada
// entre a baixa manual de faturas e a conciliação: mostra a sugestão
// automática (mais antigas primeiro) já preenchida, com o valor de cada
// fatura editável antes de confirmar.

export type FaturaAlocavel = {
  id: string;
  descricao: string;
  saldo: number;
  dataVencimento: string | null;
};

export function AlocacaoParcialTable({
  faturas,
  alocacao,
  onChange,
}: {
  faturas: FaturaAlocavel[];
  alocacao: Record<string, number>;
  onChange: (id: string, valor: number) => void;
}) {
  const hojeIso = new Date().toISOString().slice(0, 10);
  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fatura</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="text-right w-36">Aplicar agora</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faturas.map((f) => {
            const vencida = !!f.dataVencimento && f.dataVencimento < hojeIso;
            const valor = alocacao[f.id] ?? 0;
            return (
              <TableRow key={f.id}>
                <TableCell className="max-w-xs truncate">{f.descricao}</TableCell>
                <TableCell>
                  {f.dataVencimento ? fmtDate(f.dataVencimento) : "—"}{" "}
                  {vencida && (
                    <Badge variant="destructive" className="ml-1">
                      Vencida
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{brl(f.saldo)}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={f.saldo}
                    className="h-8 text-right"
                    value={valor === 0 ? "" : valor}
                    placeholder="0,00"
                    onChange={(e) => {
                      const v = Math.min(Number(e.target.value) || 0, f.saldo);
                      onChange(f.id, v);
                    }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
