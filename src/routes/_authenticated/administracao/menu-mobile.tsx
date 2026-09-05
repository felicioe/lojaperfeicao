import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listarMenuMobilePorPapel,
  salvarMenuMobilePorPapel,
  PAPEIS_MENU_MOBILE,
  type PapelMenuMobile,
} from "@/lib/backend/menu-mobile-papel";
import { CATALOGO_MENU_AGRUPADO } from "@/lib/menu-catalogo";
import { ITENS_MOBILE_IRMAO } from "@/lib/menu-mobile-irmao";
import { ROLE_LABEL } from "@/lib/format";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mensagemDeErro } from "@/lib/erro";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

// issue #464: admin da Loja define, por papel, quais itens ficam ativos na
// navegação mobile e em que ordem — os primeiros da lista viram abas fixas
// no Meu Painel do irmão (PainelShell.tsx), o resto cai no menu-gaveta; pra
// admin/tesoureiro/secretario, a mesma ordem organiza os itens dentro da
// gaveta mobile do AppShell. Item fora da lista não aparece pra ninguém
// daquele papel em mobile, nem pela preferência pessoal (#459/#460).
export const Route = createFileRoute("/_authenticated/administracao/menu-mobile")({
  head: () => ({ meta: [{ title: "Menu Mobile por Papel — Gestão Maçônica" }] }),
  component: MenuMobilePorPapelPage,
});

function MenuMobilePorPapelPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["administracao", "menu-mobile-papel"],
    queryFn: () => listarMenuMobilePorPapel(),
  });
  const [papel, setPapel] = useState<PapelMenuMobile>("irmao");
  const [itens, setItens] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Troca de papel (ou primeira carga) recarrega o estado local a partir do
  // que já está salvo pra aquele papel — mesmo raciocínio do useEffect de
  // conta/menu.tsx: sem isto, o estado local nasceria vazio e "esqueceria"
  // o que já foi configurado antes.
  useEffect(() => {
    if (!data) return;
    setItens(data.find((c) => c.papel === papel)?.itens ?? []);
  }, [data, papel]);

  const alternarItem = (to: string) => {
    setItens((prev) => (prev.includes(to) ? prev.filter((i) => i !== to) : [...prev, to]));
  };

  const mover = (indice: number, direcao: -1 | 1) => {
    setItens((prev) => {
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= prev.length) return prev;
      const proximo = [...prev];
      [proximo[indice], proximo[alvo]] = [proximo[alvo], proximo[indice]];
      return proximo;
    });
  };

  const salvar = async () => {
    // Achado da auditoria de UX (issue #467, P2): salvar lista vazia zera a
    // navegação mobile inteira daquele papel pra todo mundo, sem volta fácil
    // — trava (não é só uma sugestão) antes de confirmar explicitamente.
    if (
      itens.length === 0 &&
      !window.confirm(
        `Isso deixa o papel ${ROLE_LABEL[papel]} sem NENHUM item ativo no menu mobile (só "Início" continua). Tem certeza?`,
      )
    ) {
      return;
    }
    setSalvando(true);
    try {
      await salvarMenuMobilePorPapel({ data: { papel, itens } });
      await queryClient.invalidateQueries({ queryKey: ["administracao", "menu-mobile-papel"] });
      toast.success(`Menu mobile de ${ROLE_LABEL[papel]} salvo.`);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao salvar o menu mobile."));
    } finally {
      setSalvando(false);
    }
  };

  // Achado da auditoria de UX (issue #467, P1): pro papel "irmão" só os
  // itens de ITENS_MOBILE_IRMAO têm QUALQUER efeito (é exatamente o filtro
  // que PainelShell.tsx/menu-mobile-irmao.ts aplicam pra montar a navegação
  // dele) — mostrar o catálogo inteiro do sistema (63 rotas, Tesouraria e
  // Contabilidade incluídas) pra marcar algo que quase sempre seria um no-op
  // silencioso. Pros papéis administrativos, o catálogo inteiro continua
  // fazendo sentido (a gaveta mobile do AppShell pode mostrar qualquer um
  // deles, dependendo do que o papel já vê no desktop).
  const gruposExibidos: (typeof CATALOGO_MENU_AGRUPADO)[number][] =
    papel === "irmao"
      ? [
          [
            "Meu Painel",
            ITENS_MOBILE_IRMAO.map(({ to, label }) => ({ to, label, grupo: "Meu Painel" })),
          ],
        ]
      : CATALOGO_MENU_AGRUPADO;

  // Rótulo de cada item, pra exibir a lista de prioridade sem precisar
  // varrer o catálogo toda hora. Usa sempre o catálogo completo (não
  // gruposExibidos) — um item salvo antes de trocar de papel/filtro ainda
  // precisa exibir o próprio rótulo corretamente.
  const rotuloPorRota = new Map(
    CATALOGO_MENU_AGRUPADO.flatMap(([, itensGrupo]) => itensGrupo).map((i) => [i.to, i.label]),
  );

  return (
    <>
      <PageHeader
        title="Menu Mobile por Papel"
        description="Escolha quais itens ficam ativos na navegação mobile de cada papel, e em que ordem — os primeiros da lista viram abas fixas no Meu Painel do irmão. Item fora da lista some pra todo mundo daquele papel, mesmo na preferência pessoal."
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Papel</CardTitle>
            <CardDescription>Cada papel tem sua própria lista.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={papel} onValueChange={(v) => setPapel(v as PapelMenuMobile)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS_MENU_MOBILE.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROLE_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ordem de prioridade ({itens.length})
              </div>
              {itens.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum item selecionado — marque itens na lista ao lado.
                </p>
              ) : (
                <ol className="space-y-1">
                  {itens.map((to, indice) => (
                    <li
                      key={to}
                      className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <span className="flex-1 truncate">
                        {indice + 1}. {rotuloPorRota.get(to) ?? to}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        disabled={indice === 0}
                        onClick={() => mover(indice, -1)}
                        aria-label={`Mover ${rotuloPorRota.get(to) ?? to} pra cima`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        disabled={indice === itens.length - 1}
                        onClick={() => mover(indice, 1)}
                        aria-label={`Mover ${rotuloPorRota.get(to) ?? to} pra baixo`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <Button onClick={salvar} disabled={salvando || isLoading} className="w-full">
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens disponíveis</CardTitle>
            <CardDescription>
              Marque os itens que devem ficar ativos em mobile pra {ROLE_LABEL[papel]}.
              {papel === "irmao" &&
                " Mostrando só os itens do Meu Painel — o resto do sistema não aparece na navegação mobile do irmão de qualquer forma."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gruposExibidos.map(([grupo, itensGrupo]) => (
                  <div key={grupo} className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {grupo}
                    </div>
                    {itensGrupo.map((item) => (
                      <label
                        key={item.to}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={itens.includes(item.to)}
                          onCheckedChange={() => alternarItem(item.to)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
