import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { obterMeuMenuOculto, salvarMeuMenuOculto } from "@/lib/backend/menu-preferencias";
import { CATALOGO_MENU_AGRUPADO } from "@/lib/menu-catalogo";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { mensagemDeErro } from "@/lib/erro";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conta/menu")({
  head: () => ({ meta: [{ title: "Preferências do Menu — Gestão Maçônica" }] }),
  component: PreferenciasMenuPage,
});

function PreferenciasMenuPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["meu-menu-oculto"],
    queryFn: () => obterMeuMenuOculto(),
  });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Sincroniza a seleção com o que veio do servidor sempre que a query
  // resolver de novo (primeira carga, ou depois de um refetch) — sem isto o
  // estado local nasceria sempre vazio e "esqueceria" o que já estava salvo.
  useEffect(() => {
    if (data) setSelecionados(new Set(data.pessoal));
  }, [data]);

  const daLoja = new Set(data?.daLoja ?? []);

  const alternar = (to: string) => {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(to)) proximo.delete(to);
      else proximo.add(to);
      return proximo;
    });
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const sessao = await salvarMeuMenuOculto({ data: { itens: [...selecionados] } });
      queryClient.setQueryData(SESSAO_QUERY_KEY, sessao);
      await queryClient.invalidateQueries({ queryKey: ["meu-menu-oculto"] });
      toast.success("Preferências do menu salvas.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao salvar as preferências do menu."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Preferências do Menu"
        description="Oculte, só para você, itens do menu lateral que não usa. Não afeta os demais usuários da sua Loja."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens do menu</CardTitle>
          <CardDescription>
            Itens marcados somem do seu menu lateral. Você pode desmarcar a qualquer momento para
            trazê-los de volta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATALOGO_MENU_AGRUPADO.map(([grupo, itens]) => {
                const itensDisponiveis = itens.filter((i) => !daLoja.has(i.to));
                if (itensDisponiveis.length === 0) return null;
                return (
                  <div key={grupo} className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {grupo}
                    </div>
                    {itensDisponiveis.map((item) => (
                      <label
                        key={item.to}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selecionados.has(item.to)}
                          onCheckedChange={() => alternar(item.to)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-4 flex justify-end">
        <Button onClick={salvar} disabled={salvando || isLoading}>
          {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Salvar
        </Button>
      </div>
    </>
  );
}
