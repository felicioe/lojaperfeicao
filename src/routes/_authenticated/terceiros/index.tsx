import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarTerceiros,
  salvarTerceiro,
  alternarAtivoTerceiro,
  consultarCnpj,
  type Terceiro,
} from "@/lib/backend/terceiros";
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
import { Loader2, Pencil, Search, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/terceiros/")({
  head: () => ({ meta: [{ title: "Fornecedores e Clientes — Gestão Maçônica" }] }),
  component: Terceiros,
});

type Tipo = "fornecedor" | "cliente" | "ambos";

const TIPO_LABEL: Record<Tipo, string> = {
  fornecedor: "Fornecedor",
  cliente: "Cliente",
  ambos: "Fornecedor e Cliente",
};

const FORM_VAZIO = {
  id: null as string | null,
  tipo: "fornecedor" as Tipo,
  nome: "",
  nome_fantasia: "",
  cnpj: "",
  cpf: "",
  contato: "",
  email: "",
  categoria: "",
  cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  municipio: "",
  uf: "",
  observacoes: "",
};

function Terceiros() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [q, setQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<Tipo | "todos">("todos");
  const [consultando, setConsultando] = useState(false);
  const podeEditar = can.canManageFinancas;

  const { data = [] } = useQuery({
    queryKey: ["terceiros_all"],
    queryFn: () => listarTerceiros(),
  });

  const filtrados = useMemo(
    () =>
      data.filter((t) => {
        if (tipoFiltro !== "todos" && t.tipo !== tipoFiltro) return false;
        if (
          q &&
          !`${t.nome} ${t.nome_fantasia ?? ""} ${t.cnpj ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase())
        )
          return false;
        return true;
      }),
    [data, tipoFiltro, q],
  );
  const ord = useOrdenacao(filtrados, {
    nome: (t) => t.nome,
    tipo: (t) => t.tipo,
    documento: (t) => t.cnpj ?? t.cpf,
    categoria: (t) => t.categoria,
    ativo: (t) => (t.ativo ? 1 : 0),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["terceiros_all"] });

  const buscarCnpj = async () => {
    const cnpj = form.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) return toast.error("Informe um CNPJ com 14 dígitos.");
    setConsultando(true);
    try {
      const { dados: d, cache } = await consultarCnpj({ data: { cnpj } });
      setForm({
        ...form,
        nome: d.nome || form.nome,
        nome_fantasia: d.fantasia || form.nome_fantasia,
        contato: d.contato || form.contato,
        categoria: d.categoria || form.categoria,
        logradouro: d.logradouro || form.logradouro,
        numero: d.numero || form.numero,
        bairro: d.bairro || form.bairro,
        municipio: d.municipio || form.municipio,
        uf: d.uf || form.uf,
        cep: d.cep || form.cep,
      });
      toast.success(cache ? "Dados preenchidos (do cache)." : "Dados preenchidos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na consulta.");
    } finally {
      setConsultando(false);
    }
  };

  const salvar = async () => {
    if (!form.nome.trim()) return;
    try {
      await salvarTerceiro({
        data: {
          id: form.id,
          tipo: form.tipo,
          nome: form.nome.trim(),
          nome_fantasia: form.nome_fantasia || null,
          cnpj: form.cnpj ? form.cnpj.replace(/\D/g, "") : null,
          cpf: form.cpf || null,
          contato: form.contato || null,
          email: form.email || null,
          categoria: form.categoria || null,
          cep: form.cep || null,
          logradouro: form.logradouro || null,
          numero: form.numero || null,
          bairro: form.bairro || null,
          municipio: form.municipio || null,
          uf: form.uf || null,
          observacoes: form.observacoes || null,
        },
      });
      toast.success(form.id ? "Atualizado." : "Cadastrado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (t: Terceiro) =>
    setForm({
      id: t.id,
      tipo: t.tipo,
      nome: t.nome,
      nome_fantasia: t.nome_fantasia ?? "",
      cnpj: t.cnpj ?? "",
      cpf: t.cpf ?? "",
      contato: t.contato ?? "",
      email: t.email ?? "",
      categoria: t.categoria ?? "",
      cep: t.cep ?? "",
      logradouro: t.logradouro ?? "",
      numero: t.numero ?? "",
      bairro: t.bairro ?? "",
      municipio: t.municipio ?? "",
      uf: t.uf ?? "",
      observacoes: t.observacoes ?? "",
    });

  const alternarAtivo = async (t: Terceiro) => {
    try {
      await alternarAtivoTerceiro({ data: { id: t.id, ativo: !t.ativo } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  };

  return (
    <>
      <PageHeader
        title="Fornecedores e Clientes"
        description="Cadastro de terceiros usados em contas a pagar e recebimentos avulsos."
      />

      {podeEditar && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">{form.id ? "Editar" : "Novo cadastro"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
                <Button type="button" variant="outline" onClick={buscarCnpj} disabled={consultando}>
                  {consultando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Label>CPF (se pessoa física)</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>

            <div className="md:col-span-2">
              <Label>Razão social / Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Nome fantasia</Label>
              <Input
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
              />
            </div>

            <div>
              <Label>Contato</Label>
              <Input
                value={form.contato}
                onChange={(e) => setForm({ ...form, contato: e.target.value })}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Categoria</Label>
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              />
            </div>

            <div>
              <Label>CEP</Label>
              <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Logradouro</Label>
              <Input
                value={form.logradouro}
                onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
              />
            </div>
            <div>
              <Label>Número</Label>
              <Input
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input
                value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
              />
            </div>
            <div>
              <Label>Município</Label>
              <Input
                value={form.municipio}
                onChange={(e) => setForm({ ...form, municipio: e.target.value })}
              />
            </div>
            <div>
              <Label>UF</Label>
              <Input value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} />
            </div>

            <div className="md:col-span-4">
              <Label>Observações</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>

            <div className="md:col-span-4 flex gap-2">
              <Button onClick={salvar} disabled={!form.nome}>
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
      )}

      <Card className="mb-4 p-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome ou CNPJ…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as Tipo | "todos")}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="nome" ord={ord}>
                Nome
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="tipo" ord={ord}>
                Tipo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="documento" ord={ord}>
                CNPJ/CPF
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="categoria" ord={ord}>
                Categoria
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="ativo" ord={ord}>
                Ativo
              </TableHeadOrdenavel>
              {podeEditar && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum cadastro encontrado.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((t) => (
              <TableRow key={t.id} className={!t.ativo ? "opacity-50" : undefined}>
                <TableCell className="font-medium">
                  {t.nome}
                  {t.nome_fantasia ? ` (${t.nome_fantasia})` : ""}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{TIPO_LABEL[t.tipo]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{t.cnpj ?? t.cpf ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{t.categoria ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={t.ativo}
                    onCheckedChange={() => alternarAtivo(t)}
                    disabled={!podeEditar}
                  />
                </TableCell>
                {podeEditar && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => editar(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
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
