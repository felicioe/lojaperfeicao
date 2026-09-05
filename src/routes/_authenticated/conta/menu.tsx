import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  obterMinhasPreferenciasMenu,
  salvarMinhasPreferenciasMenu,
} from "@/lib/backend/menu-preferencias";
import { CATALOGO_MENU_AGRUPADO } from "@/lib/menu-catalogo";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { mensagemDeErro } from "@/lib/erro";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FAVORITOS = 8;

export const Route = createFileRoute("/_authenticated/conta/menu")({
  head: () => ({ meta: [{ title: "Preferências do Menu — Gestão Maçônica" }] }),
  component: PreferenciasMenuPage,
});

function PreferenciasMenuPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["minhas-preferencias-menu"],
    queryFn: () => obterMinhasPreferenciasMenu(),
  });
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Sincroniza o estado local com o que veio do servidor sempre que a query
  // resolver de novo (primeira carga, ou depois de um refetch) — sem isto o
  // estado local nasceria sempre vazio e "esqueceria" o que já estava salvo.
  useEffect(() => {
    if (data) {
      setOcultos(new Set(data.ocultos));
      setFavoritos(new Set(data.favoritos));
    }
  }, [data]);

  const daLoja = new Set(data?.daLoja ?? []);

  const alternarOculto = (to: string) => {
    setOcultos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(to)) proximo.delete(to);
      else proximo.add(to);
      return proximo;
    });
  };

  const alternarFavorito = (to: string) => {
    setFavoritos((prev) => {
      if (prev.has(to)) {
        const proximo = new Set(prev);
        proximo.delete(to);
        return proximo;
      }
      if (prev.size >= MAX_FAVORITOS) {
        toast.error(`Você já tem ${MAX_FAVORITOS} favoritos — remova um antes de adicionar outro.`);
        return prev;
      }
      return new Set(prev).add(to);
    });
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const sessao = await salvarMinhasPreferenciasMenu({
        data: { ocultos: [...ocultos], favoritos: [...favoritos] },
      });
      queryClient.setQueryData(SESSAO_QUERY_KEY, sessao);
      await queryClient.invalidateQueries({ queryKey: ["minhas-preferencias-menu"] });
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
        description="Oculte itens que não usa e fixe até 8 favoritos no topo da sidebar — tudo só para você, sem afetar os demais usuários da sua Loja."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens do menu</CardTitle>
          <CardDescription>
            A estrela fixa o item em destaque no topo do menu ({favoritos.size}/{MAX_FAVORITOS}). O
            checkbox oculta o item do seu menu — desmarque a qualquer momento para trazê-lo de
            volta.
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
                      <div
                        key={item.to}
                        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                      >
                        <button
                          type="button"
                          onClick={() => alternarFavorito(item.to)}
                          aria-label={
                            favoritos.has(item.to)
                              ? `Remover ${item.label} dos favoritos`
                              : `Favoritar ${item.label}`
                          }
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              favoritos.has(item.to) && "fill-amber-400 text-amber-500",
                            )}
                          />
                        </button>
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={ocultos.has(item.to)}
                            onCheckedChange={() => alternarOculto(item.to)}
                          />
                          {item.label}
                        </label>
                      </div>
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
