import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarModulosExportaveis, exportarModulo, exportarTudo } from "@/lib/backend/exportacao";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/administracao/exportar-dados")({
  head: () => ({ meta: [{ title: "Exportar Dados — Gestão Maçônica" }] }),
  component: ExportarDadosPage,
});

function baixarArquivo(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ExportarDadosPage() {
  const can = useCan();
  const [modulo, setModulo] = useState("");
  const [formato, setFormato] = useState<"csv" | "json">("csv");
  const [exportando, setExportando] = useState(false);

  const { data: modulos = [] } = useQuery({
    queryKey: ["modulos_exportaveis"],
    queryFn: () => listarModulosExportaveis(),
    enabled: can.isAdmin,
  });

  if (!can.isAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas administradores podem acessar esta função.
      </Card>
    );
  }

  const exportar = async () => {
    if (!modulo) return toast.error("Selecione um módulo.");
    setExportando(true);
    try {
      const { nomeArquivo, conteudo } = await exportarModulo({ data: { modulo, formato } });
      baixarArquivo(nomeArquivo, conteudo);
      toast.success("Exportação concluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar.");
    } finally {
      setExportando(false);
    }
  };

  const exportarBackupCompleto = async () => {
    setExportando(true);
    try {
      const { nomeArquivo, conteudo } = await exportarTudo();
      baixarArquivo(nomeArquivo, conteudo);
      toast.success("Backup completo gerado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar backup.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Exportar Dados"
        description="Exportação por módulo (CSV ou JSON) ou backup completo em JSON."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exportar por módulo</CardTitle>
            <CardDescription>Escolha o módulo e o formato do arquivo.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Select value={modulo} onValueChange={setModulo}>
              <SelectTrigger>
                <SelectValue placeholder="Módulo…" />
              </SelectTrigger>
              <SelectContent>
                {modulos.map((m) => (
                  <SelectItem key={m.chave} value={m.chave}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={formato} onValueChange={(v) => setFormato(v as "csv" | "json")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportar} disabled={exportando || !modulo}>
              <Download className="mr-1.5 h-4 w-4" /> Exportar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backup completo</CardTitle>
            <CardDescription>Todos os módulos disponíveis num único arquivo JSON.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={exportarBackupCompleto} disabled={exportando}>
              <Download className="mr-1.5 h-4 w-4" /> Baixar backup completo
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
