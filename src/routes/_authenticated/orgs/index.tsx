import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarOrgs,
  listarPotencias,
  salvarOrg,
  alternarAtivoOrg,
  listarOrgsGraus,
  gerarGrausPadraoOrg,
  criarOrgGrau,
  renomearOrgGrau,
  atualizarIntersticioOrgGrau,
  removerOrgGrau,
  uploadLogoOrg,
  type Org,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

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

  const invalidate = () => qc.invalidateQueries({ queryKey: ["orgs_all"] });

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
                    alt="Logo"
                    className="h-16 w-16 rounded object-contain border bg-white p-1"
                  />
                )}
                <div>
                  <Label>Logo (usado na fatura impressa)</Label>
                  <Input
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
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Sigla</Label>
              <Input
                value={form.sigla}
                onChange={(e) => setForm({ ...form, sigla: e.target.value })}
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
              <Label>Natureza</Label>
              <Select
                value={form.natureza}
                onValueChange={(v) => setForm({ ...form, natureza: v as Natureza })}
              >
                <SelectTrigger>
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
              <Label>Rito</Label>
              <Input
                value={form.rito}
                onChange={(e) => setForm({ ...form, rito: e.target.value })}
                placeholder="REAA"
              />
            </div>
            <div>
              <Label>Grau mínimo</Label>
              <Input
                type="number"
                min={1}
                value={form.grau_min}
                onChange={(e) => setForm({ ...form, grau_min: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Grau máximo</Label>
              <Input
                type="number"
                min={1}
                value={form.grau_max}
                onChange={(e) => setForm({ ...form, grau_max: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label>Potência</Label>
              <Select
                value={form.potencia_id}
                onValueChange={(v) => setForm({ ...form, potencia_id: v })}
              >
                <SelectTrigger>
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
              <Label>Mensalidade padrão</Label>
              <Input
                type="number"
                step="0.01"
                value={form.mensalidade_padrao}
                onChange={(e) => setForm({ ...form, mensalidade_padrao: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </div>
            <div>
              <Label>Fundação</Label>
              <Input
                type="date"
                value={form.fundacao}
                onChange={(e) => setForm({ ...form, fundacao: e.target.value })}
              />
            </div>
            <div className="md:col-span-4">
              <Label>Endereço</Label>
              <Input
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
              <TableHead>Nome</TableHead>
              <TableHead>Natureza</TableHead>
              <TableHead>Graus</TableHead>
              <TableHead>Potência</TableHead>
              <TableHead>Ativo</TableHead>
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
            {orgs.map((o) => (
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
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{NATUREZA_LABEL[o.natureza]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.grau_min}–{o.grau_max}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
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
            <TableHead className="w-20">Grau</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead className="w-44">Interstício (meses)</TableHead>
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
          {graus.map((g) => (
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
            <Label className="text-xs">Grau</Label>
            <Input
              type="number"
              className="h-8 w-20"
              value={novoGrau.grau}
              onChange={(e) => setNovoGrau({ ...novoGrau, grau: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Nome</Label>
            <Input
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
