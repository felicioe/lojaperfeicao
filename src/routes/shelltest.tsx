import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/shelltest")({
  ssr: false,
  component: () => (
    <AppShell>
      <PageHeader title="Teste de layout" description="Rota temporária" />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableHead key={i}>Coluna {i + 1}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, r) => (
              <TableRow key={r}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <TableCell key={i}>Valor {r}-{i}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  ),
});
