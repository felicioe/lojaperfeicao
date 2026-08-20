import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarOrgs,
  listarPotencias,
  salvarOrg,
  alternarAtivoOrg,
  excluirOrg,
  transferirDadosOrg,
  listarUsoOrgs,
  listarOrgsGraus,
  gerarGrausPadraoOrg,
  criarOrgGrau,
  renomearOrgGrau,
  atualizarIntersticioOrgGrau,
  removerOrgGrau,
  uploadLogoOrg,
  type Org,
  type UsoOrg,
} from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { useOrdenacao } from "@/lib/use-ordenacao";

export const Route = createFileRoute("/_authenticated/orgs/")({
  head: () => ({ meta: [{ title: "Corpos Maçônicos — Gestão Maçônica" }] }),
  component: Orgs,
});

type Natureza = "loja" | "capitulo" | "conselho" | "areopago" | "consistorio" | "outro";

const NATUREZA_LABEL: Record<Natureza, string> = {
  loja: "Loja",
  capitulo: "Capítulo",
  conselho: "Conselho",
  areopago: "Areópago",
  consistorio: "Consistório",
  outro: "Outro",
};

const FORM_VAZIO = {
  id: null as string | null,
  potencia_id: "none",
  nome: "",
  sigla: "",
  natureza: "loja" as Natureza,
  numero: "",
  rito: "",
  grau_min: 1,
  grau_max: 3,
  mensalidade_padrao: 0,
  cnpj: "",
  fundacao: "",
  endereco: "",
  logo_url: null as string | null,
};

function Orgs() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs_all"],
    queryFn: () => listarOrgs(),
  });

  const { data: potencias = [] } = useQuery({
    queryKey: ["potencias_all"],
    queryFn: () => listarPotencias(),
  });

  const { data: usoOrgs = [] } = useQuery({
    queryKey: ["orgs_uso"],
    queryFn: () => listarUsoOrgs(),
  });
  const usoPorOrg = new Map(usoOrgs.map((u) => [u.org_id, u]));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["orgs_all"] });

  const ord = useOrdenacao(orgs, {
    nome: (o) => o.nome,
    natureza: (o) => o.natureza,
    graus: (o) => o.grau_min,
    potencia: (o) => potencias.find((p) => p.id === o.potencia_id)?.sigla ?? null,
    ativo: (o) => (o.ativo ? 1 : 0),
  });

  const salvar = async () => {
    if (!form.nome.trim()) return;
    try {
      await salvarOrg({
        data: {
          id: form.id,
          potencia_id: form.potencia_id === "none" ? null : form.potencia_id,
          nome: form.nome.trim(),
          sigla: form.sigla || null,
          natureza: form.natureza,
          numero: form.numero || null,
          rito: form.rito || null,
          grau_min: Number(form.grau_min) || 1,
          grau_max: Number(form.grau_max) || 3,
          mensalidade_padrao: Number(form.mensalidade_padrao) || 0,
          cnpj: form.cnpj || null,
          fundacao: form.fundacao || null,
          endereco: form.endereco || null,
          logo_url: form.logo_url,
        },
      });
      toast.success(form.id ? "Corpo atualizado." : "Corpo criado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const uploadLogo = async (file: File) => {
    if (!form.id) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadLogoOrg({
        data: { orgId: form.id, nomeArquivo: file.name, dataUrl },
      });
      setForm({ ...form, logo_url: url });
      toast.success("Logo enviado — clique em Salvar para confirmar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o logo.");
    }
  };

  const editar = (o: Org) =>
    setForm({
      id: o.id,
      potencia_id: o.potencia_id ?? "none",
      nome: o.nome,
      sigla: o.sigla ?? "",
      // Dado legado: algum corpo antigo pode ter natureza vazia/inválida no
      // banco (não passa mais por aqui desde que salvarOrg exige um valor
      // do enum) — sem essa checagem, o Select ficava sem nada selecionado
      // e salvar QUALQUER campo do corpo falhava, travando a edição.
      natureza: o.natureza in NATUREZA_LABEL ? o.natureza : "loja",
      numero: o.numero ?? "",
      rito: o.rito ?? "",
      grau_min: o.grau_min,
      grau_max: o.grau_max,
      mensalidade_padrao: o.mensalidade_padrao,
      cnpj: o.cnpj ?? "",
      fundacao: o.fundacao ?? "",
      endereco: o.endereco ?? "",
      logo_url: o.logo_url,
    });

  const alternarAtivo = async (o: Org) => {
    try {
      await alternarAtivoOrg({ data: { id: o.id, ativo: !o.ativo } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  };

  const descreverUso = (uso: UsoOrg | undefined) => {
    if (!uso) return null;
    const partes = [
      uso.irmaos > 0 && `${uso.irmaos} irmão(s) vinculado(s)`,
      uso.gestoes > 0 && `${uso.gestoes} gestão(ões)`,
      uso.cobrancas > 0 && `${uso.cobrancas} cobrança(s) SGCAB`,
      uso.eventos > 0 && `${uso.eventos} evento(s)`,
      uso.comissoes > 0 && `${uso.comissoes} comissão(ões)`,
      uso.cargos > 0 && `${uso.cargos} cargo(s)`,
      uso.taxasGrau > 0 && `${uso.taxasGrau} taxa(s) de grau`,
      uso.comunicados > 0 && `${uso.comunicados} comunicado(s)`,
      uso.tabelaValores > 0 && `${uso.tabelaValores} valor(es) na Tabela de Valores`,
    ].filter(Boolean);
    return partes.length > 0 ? partes.join(", ") : null;
  };

  const excluir = async (o: Org) => {
    try {
      await excluirOrg({ data: { id: o.id } });
      toast.success("Corpo excluído.");
      invalidate();
      qc.invalidateQueries({ queryKey: ["orgs_uso"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const [destinoTransferencia, setDestinoTransferencia] = useState<string>("");
  const [transferindo, setTransferindo] = useState(false);

  const transferir = async (origem: Org) => {
    if (!destinoTransferencia) return;
    setTransferindo(true);
    try {
      await transferirDadosOrg({ data: { origemId: origem.id, destinoId: destinoTransferencia } });
      toast.success("Dados transferidos.");
      setDestinoTransferencia("");
      qc.invalidateQueries({ queryKey: ["orgs_uso"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao transferir.");
    } finally {
      setTransferindo(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Corpos Maçônicos"
        description="Lojas, capítulos e demais corpos administrados por esta instalação (suporte multi-loja)."
        actions={
          <Link to="/orgs/potencias">
            <Button variant="outline">Potência</Button>
          </Link>
        }
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">{form.id ? "Editar corpo" : "Novo corpo"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            {form.id && (
              <div className="md:col-span-4 flex items-center gap-4">
                {form.logo_url && (
                  <img
                    src={form.logo_url}
                    alt={`Logo de ${form.nome || "corpo maçônico"}`}
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 rounded object-contain border bg-white p-1"
                  />
                )}
                <div>
                  <Label htmlFor="org-logo">Logo (usado na fatura impressa)</Label>
                  <Input
                    id="org-logo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo(file);
                    }}
                  />
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <Label htmlFor="org-nome">Nome</Label>
              <Input
                id="org-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="org-sigla">Sigla</Label>
              <Input
                id="org-sigla"
                value={form.sigla}
                onChange={(e) => setForm({ ...form, sigla: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="org-numero">Número</Label>
              <Input
                id="org-numero"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="org-natureza">Natureza</Label>
              <Select
                value={form.natureza}
                onValueChange={(v) => setForm({ ...form, natureza: v as Natureza })}
              >
                <SelectTrigger id="org-natureza">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(NATUREZA_LABEL) as Natureza[]).map((n) => (
                    <SelectItem key={n} value={n}>
                      {NATUREZA_LABEL[n]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="org-rito">Rito</Label>
              <Input
                id="org-rito"
                value={form.rito}
                onChange={(e) => setForm({ ...form, rito: e.target.value })}
                placeholder="REAA"
              />
            </div>
            <div>
              <Label htmlFor="org-grau-min">Grau mínimo</Label>
              <Input
                id="org-grau-min"
                type="number"
                min={1}
                value={form.grau_min}
                onChange={(e) => setForm({ ...form, grau_min: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="org-grau-max">Grau máximo</Label>
              <Input
                id="org-grau-max"
                type="number"
                min={1}
                value={form.grau_max}
                onChange={(e) => setForm({ ...form, grau_max: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="org-potencia">Potência</Label>
              <Select
                value={form.potencia_id}
                onValueChange={(v) => setForm({ ...form, potencia_id: v })}
              >
                <SelectTrigger id="org-potencia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— nenhuma —</SelectItem>
                  {potencias.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sigla ?? p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="org-mensalidade">Mensalidade padrão</Label>
              <Input
                id="org-mensalidade"
                type="number"
                step="0.01"
                value={form.mensalidade_padrao}
                onChange={(e) => setForm({ ...form, mensalidade_padrao: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="org-cnpj">CNPJ</Label>
              <Input
                id="org-cnpj"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="org-fundacao">Fundação</Label>
              <Input
                id="org-fundacao"
                type="date"
                value={form.fundacao}
                onChange={(e) => setForm({ ...form, fundacao: e.target.value })}
              />
            </div>
            <div className="md:col-span-4">
              <Label htmlFor="org-endereco">Endereço</Label>
              <Input
                id="org-endereco"
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
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

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHeadOrdenavel campo="nome" ord={ord}>
                Nome
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="natureza" ord={ord} className="hidden sm:table-cell">
                Natureza
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="graus" ord={ord} className="hidden sm:table-cell">
                Graus
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="potencia" ord={ord} className="hidden lg:table-cell">
                Potência
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="ativo" ord={ord}>
                Ativo
              </TableHeadOrdenavel>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  Nenhum corpo cadastrado.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((o) => (
              <Fragment key={o.id}>
                <TableRow className={!o.ativo ? "opacity-50" : undefined}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandido(expandido === o.id ? null : o.id)}
                    >
                      {expandido === o.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    {o.nome}
                    {o.sigla ? ` (${o.sigla})` : ""}
                    <div className="text-xs text-muted-foreground sm:hidden">
                      {NATUREZA_LABEL[o.natureza]} · Graus {o.grau_min}–{o.grau_max}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">{NATUREZA_LABEL[o.natureza]}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {o.grau_min}–{o.grau_max}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {potencias.find((p) => p.id === o.potencia_id)?.sigla ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={o.ativo}
                      onCheckedChange={() => alternarAtivo(o)}
                      disabled={!can.canManageIrmaos}
                    />
                  </TableCell>
                  {can.canManageIrmaos && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => editar(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {(() => {
                        const usoDesc = descreverUso(usoPorOrg.get(o.id));
                        const outrosCorpos = orgs.filter((outro) => outro.id !== o.id);
                        return (
                          <AlertDialog
                            onOpenChange={(aberto) => !aberto && setDestinoTransferencia("")}
                          >
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir "{o.nome}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {usoDesc ? (
                                    <>
                                      Não é possível excluir: este corpo tem {usoDesc}. Transfira
                                      pra outro corpo abaixo, ou desative-o em vez de excluir.
                                    </>
                                  ) : (
                                    <>
                                      Essa ação não pode ser desfeita. Nenhum dado (irmão, gestão,
                                      cobrança, evento, comissão, cargo, taxa, comunicado ou valor
                                      da Tabela de Valores) está vinculado a este corpo.
                                    </>
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              {usoDesc && (
                                <div className="flex items-end gap-2">
                                  <div className="flex-1">
                                    <Label htmlFor="orgs-transferir-dados-para">
                                      Transferir dados para
                                    </Label>
                                    <Select
                                      value={destinoTransferencia}
                                      onValueChange={setDestinoTransferencia}
                                    >
                                      <SelectTrigger id="orgs-transferir-dados-para">
                                        <SelectValue placeholder="Selecione o corpo destino…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {outrosCorpos.map((outro) => (
                                          <SelectItem key={outro.id} value={outro.id}>
                                            {outro.nome}
                                            {!outro.ativo ? " (inativo)" : ""}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    variant="outline"
                                    disabled={!destinoTransferencia || transferindo}
                                    onClick={() => transferir(o)}
                                  >
                                    Transferir
                                  </Button>
                                </div>
                              )}
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => excluir(o)} disabled={!!usoDesc}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        );
                      })()}
                    </TableCell>
                  )}
                </TableRow>
                {expandido === o.id && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30">
                      <GrausPanel org={o} podeEditar={can.canManageIrmaos} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function GrausPanel({ org, podeEditar }: { org: Org; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novoGrau, setNovoGrau] = useState<{ grau: string; nome: string }>({ grau: "", nome: "" });

  const { data: graus = [] } = useQuery({
    queryKey: ["orgs_graus", org.id],
    queryFn: () => listarOrgsGraus({ data: { orgId: org.id } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["orgs_graus", org.id] });

  const ordGraus = useOrdenacao(graus, {
    grau: (g) => g.grau,
    nome: (g) => g.nome,
    intersticio: (g) => g.interstico_minimo_meses,
  });

  const gerarPadrao = async () => {
    try {
      await gerarGrausPadraoOrg({ data: { orgId: org.id } });
      toast.success("Graus padrão gerados.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar graus.");
    }
  };

  const adicionar = async () => {
    const g = Number(novoGrau.grau);
    if (!g || !novoGrau.nome.trim()) return;
    try {
      await criarOrgGrau({ data: { orgId: org.id, grau: g, nome: novoGrau.nome.trim() } });
      setNovoGrau({ grau: "", nome: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const renomear = async (id: string, nome: string) => {
    try {
      await renomearOrgGrau({ data: { id, nome } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear.");
    }
  };

  const alterarIntersticio = async (id: string, valor: string) => {
    const meses = valor.trim() === "" ? null : Number(valor);
    if (meses !== null && (!Number.isInteger(meses) || meses <= 0)) {
      return toast.error("Interstício precisa ser um número inteiro de meses maior que zero.");
    }
    try {
      await atualizarIntersticioOrgGrau({ data: { id, meses } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar interstício.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerOrgGrau({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <div className="py-2 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Graus de {org.nome}</div>
        {podeEditar && (
          <Button variant="outline" size="sm" onClick={gerarPadrao}>
            <Wand2 className="h-4 w-4 mr-1" /> Gerar padrão ({org.grau_min}–{org.grau_max})
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeadOrdenavel campo="grau" ord={ordGraus} className="w-20">
              Grau
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="nome" ord={ordGraus}>
              Nome
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="intersticio" ord={ordGraus} className="w-44">
              Interstício (meses)
            </TableHeadOrdenavel>
            {podeEditar && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {graus.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-sm">
                Nenhum grau cadastrado ainda.
              </TableCell>
            </TableRow>
          )}
          {ordGraus.itensOrdenados.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-mono">{g.grau}</TableCell>
              <TableCell>
                {podeEditar ? (
                  <Input
                    defaultValue={g.nome}
                    onBlur={(e) => e.target.value !== g.nome && renomear(g.id, e.target.value)}
                    className="h-8"
                  />
                ) : (
                  g.nome
                )}
              </TableCell>
              <TableCell>
                {podeEditar ? (
                  <Input
                    type="number"
                    min={1}
                    placeholder="Sem regra"
                    defaultValue={g.interstico_minimo_meses ?? ""}
                    onBlur={(e) =>
                      Number(e.target.value || 0) !== (g.interstico_minimo_meses ?? 0) &&
                      alterarIntersticio(g.id, e.target.value)
                    }
                    className="h-8 w-32"
                  />
                ) : (
                  (g.interstico_minimo_meses ?? "—")
                )}
              </TableCell>
              {podeEditar && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => remover(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {podeEditar && (
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="org-novo-grau-numero" className="text-xs">
              Grau
            </Label>
            <Input
              id="org-novo-grau-numero"
              type="number"
              className="h-8 w-20"
              value={novoGrau.grau}
              onChange={(e) => setNovoGrau({ ...novoGrau, grau: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="org-novo-grau-nome" className="text-xs">
              Nome
            </Label>
            <Input
              id="org-novo-grau-nome"
              className="h-8"
              value={novoGrau.nome}
              onChange={(e) => setNovoGrau({ ...novoGrau, nome: e.target.value })}
            />
          </div>
          <Button size="sm" onClick={adicionar}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
