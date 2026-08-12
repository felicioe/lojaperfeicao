import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarPlanoContas,
  salvarConta,
  alternarAtivoConta,
  type Conta,
  type TipoConta,
} from "@/lib/backend/plano-contas";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { usePaginacao } from "@/lib/use-paginacao";

export const Route = createFileRoute("/_authenticated/tesouraria/plano-contas")({
  head: () => ({ meta: [{ title: "Plano de Contas — Gestão Maçônica" }] }),
  component: PlanoContas,
});

const TIPO_LABEL: Record<TipoConta, string> = {
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio Líquido",
  receita: "Receita",
  despesa: "Despesa",
};

const TIPO_VARIANT: Record<TipoConta, "default" | "secondary" | "destructive" | "outline"> = {
  ativo: "default",
  passivo: "secondary",
  patrimonio_liquido: "outline",
  receita: "default",
  despesa: "destructive",
};

type ContaComProfundidade = Conta & { profundidade: number };

function montarArvore(contas: Conta[]): ContaComProfundidade[] {
  const filhosPorPai = new Map<string | null, Conta[]>();
  for (const c of contas) {
    const lista = filhosPorPai.get(c.parent_id) ?? [];
    lista.push(c);
    filhosPorPai.set(c.parent_id, lista);
  }
  for (const lista of filhosPorPai.values()) lista.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const resultado: ContaComProfundidade[] = [];
  const visitar = (parentId: string | null, profundidade: number) => {
    for (const c of filhosPorPai.get(parentId) ?? []) {
      resultado.push({ ...c, profundidade });
      visitar(c.id, profundidade + 1);
    }
  };
  visitar(null, 0);
  return resultado;
}

const FORM_VAZIO = {
  id: null as string | null,
  codigo: "",
  nome: "",
  tipo: "despesa" as TipoConta,
  parent_id: "none",
  analitica: true,
};

function PlanoContas() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoConta | "todos">("todos");
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const { data = [] } = useQuery({
    queryKey: ["plano_contas_all"],
    queryFn: () => listarPlanoContas(),
  });

  const arvore = useMemo(() => montarArvore(data), [data]);

  const filtrada = arvore.filter((c) => {
    if (!mostrarInativas && !c.ativo) return false;
    if (tipoFiltro !== "todos" && c.tipo !== tipoFiltro) return false;
    if (q && !`${c.codigo} ${c.nome}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(filtrada);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plano_contas_all"] });

  const salvar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) return;
    try {
      await salvarConta({
        data: {
          id: form.id,
          codigo: form.codigo.trim(),
          nome: form.nome.trim(),
          tipo: form.tipo,
          parent_id: form.parent_id === "none" ? null : form.parent_id,
          analitica: form.analitica,
        },
      });
      toast.success(form.id ? "Conta atualizada." : "Conta criada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (c: Conta) =>
    setForm({
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
      tipo: c.tipo,
      parent_id: c.parent_id ?? "none",
      analitica: c.analitica,
    });

  const alternarAtivo = async (c: Conta) => {
    try {
      await alternarAtivoConta({ data: { id: c.id, ativo: !c.ativo } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  };

  return (
    <>
      <PageHeader
        title="Plano de Contas"
        description="Árvore hierárquica de contas patrimoniais, de receita e de despesa."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">{form.id ? "Editar conta" : "Nova conta"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label>Código</Label>
            <Input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              placeholder="5.1.06"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) =>
                setForm({ ...form, tipo: v as TipoConta, parent_id: "none" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as TipoConta[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Conta pai</Label>
            <Select
              value={form.parent_id}
              onValueChange={(v) => setForm({ ...form, parent_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— nenhuma (conta de topo) —</SelectItem>
                {data
                  .filter((c) => c.id !== form.id && c.tipo === form.tipo && c.ativo)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch
              checked={form.analitica}
              onCheckedChange={(v) => setForm({ ...form, analitica: v })}
            />
            <Label className="!m-0">Analítica (recebe lançamento)</Label>
          </div>
          <div className="md:col-span-5 flex gap-2">
            <Button onClick={salvar} disabled={!form.codigo || !form.nome}>
              {form.id ? "Salvar alterações" : "Adicionar"}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 p-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por código ou nome…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoConta | "todos")}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(Object.keys(TIPO_LABEL) as TipoConta[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch checked={mostrarInativas} onCheckedChange={setMostrarInativas} />
          <Label className="!m-0">Mostrar inativas</Label>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Analítica</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrada.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhuma conta encontrada.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((c) => (
              <TableRow key={c.id} className={!c.ativo ? "opacity-50" : undefined}>
                <TableCell
                  className="font-mono"
                  style={{ paddingLeft: `${1 + c.profundidade * 1.5}rem` }}
                >
                  {c.codigo}
                </TableCell>
                <TableCell className={c.analitica ? undefined : "font-semibold"}>
                  {c.nome}
                </TableCell>
                <TableCell>
                  <Badge variant={TIPO_VARIANT[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>
                </TableCell>
                <TableCell>
                  {c.analitica ? (
                    <Badge variant="outline">Sim</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Sintética</span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch checked={c.ativo} onCheckedChange={() => alternarAtivo(c)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => editar(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TabelaPaginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={totalItens}
          tamanhoPagina={tamanhoPagina}
          setPagina={setPagina}
        />
      </Card>
    </>
  );
}
