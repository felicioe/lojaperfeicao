import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  obterIrmao,
  atualizarPerfilIrmao,
  excluirIrmao,
  uploadFotoIrmao,
  listarIrmaoOrgs,
  criarIrmaoOrg,
  removerIrmaoOrg,
  listarIrmaoElevacoes,
  criarIrmaoElevacao,
  removerIrmaoElevacao,
  listarIrmaoFormacao,
  criarIrmaoFormacao,
  removerIrmaoFormacao,
  listarIrmaoFilhos,
  criarIrmaoFilho,
  removerIrmaoFilho,
  listarIrmaoParentes,
  criarIrmaoParente,
  removerIrmaoParente,
  listarLancamentosIrmao,
  listarCargosHistoricoIrmao,
  type TipoParente,
} from "@/lib/backend/irmaos";
import { listarOrgs } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useEffect, useState } from "react";
import { useCan } from "@/lib/auth-hooks";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { brl, fmtDate, GRAU_LABEL, SITUACAO_LABEL } from "@/lib/format";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import type { Irmao } from "@/lib/backend/irmaos";

export const Route = createFileRoute("/_authenticated/irmaos/$id")({
  head: () => ({ meta: [{ title: "Irmão — Gestão Maçônica" }] }),
  component: IrmaoDetail,
});

const CAMPOS_PERFIL = [
  "nome_civil",
  "nome_simbolico",
  "cim",
  "numero_matricula",
  "estado_civil",
  "cpf",
  "rg",
  "data_nascimento",
  "naturalidade",
  "nacionalidade",
  "religiao",
  "observacoes",
  "foto_url",
  "grau",
  "situacao",
  "data_iniciacao",
  "data_elevacao",
  "data_exaltacao",
  "loja_origem",
  "numero_grande_oriente",
  "fundador",
  "benemerito",
  "honorario",
  "licenciado",
  "potencia",
  "profissao",
  "empresa",
  "cargo_profissional",
  "area_atuacao",
  "valor_mensalidade",
  "email",
  "telefone",
  "celular",
  "endereco",
  "cep",
  "logradouro",
  "numero_endereco",
  "complemento",
  "bairro",
  "cidade",
  "estado",
] as const;

function IrmaoDetail() {
  const { id } = useParams({ from: "/_authenticated/irmaos/$id" });
  const nav = useNavigate();
  const can = useCan();
  const qc = useQueryClient();
  const [perfil, setPerfil] = useState<Irmao | null>(null);
  const [saving, setSaving] = useState(false);
  const [fotoQuebrada, setFotoQuebrada] = useState(false);
  const podeEditar = can.canManageIrmaos;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["irmao", id],
    queryFn: () => obterIrmao({ data: { id } }),
  });

  useEffect(() => {
    if (data && !perfil) setPerfil(data);
  }, [data, perfil]);

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Não foi possível carregar o perfil do irmão.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (isLoading || !perfil) return <p className="text-muted-foreground">Carregando…</p>;

  // Aceita tanto o evento de um <input>/<textarea> quanto o valor direto de
  // um <Select> — o mesmo padrão do IrmaoForm.
  const set =
    (k: keyof Irmao) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string | boolean) =>
      setPerfil({
        ...perfil,
        [k]: typeof e === "string" || typeof e === "boolean" ? e : e.target.value,
      });

  const salvarPerfil = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const k of CAMPOS_PERFIL) payload[k] = perfil[k] === "" ? null : perfil[k];
    try {
      await atualizarPerfilIrmao({ data: { id, perfil: payload } });
      toast.success("Salvo.");
      qc.invalidateQueries({ queryKey: ["irmao", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const buscarCep = async () => {
    const cep = (perfil.cep ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return toast.error("CEP inválido");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await resp.json();
      if (j.erro) return toast.error("CEP não encontrado");
      setPerfil({
        ...perfil,
        logradouro: j.logradouro || perfil.logradouro,
        bairro: j.bairro || perfil.bairro,
        cidade: j.localidade || perfil.cidade,
        estado: j.uf || perfil.estado,
      });
      toast.success("Endereço preenchido.");
    } catch {
      toast.error("Falha ao consultar o CEP.");
    }
  };

  const uploadFoto = async (file: File) => {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadFotoIrmao({
        data: { irmaoId: id, dataUrl },
      });
      setFotoQuebrada(false);
      setPerfil({ ...perfil, foto_url: url });
      toast.success("Foto enviada — clique em Salvar para confirmar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    }
  };

  return (
    <>
      <PageHeader
        title={perfil.nome_civil}
        description={perfil.nome_simbolico ? `∴ ${perfil.nome_simbolico}` : undefined}
        actions={
          <div className="flex gap-2">
            {podeEditar && (
              <Button onClick={salvarPerfil} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar alterações
              </Button>
            )}
            {can.isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Excluir</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir irmão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação removerá o cadastro e todos os dados relacionados (formação,
                      família, elevações, presenças). Lançamentos financeiros ficarão sem vínculo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await excluirIrmao({ data: { id } });
                          toast.success("Excluído.");
                          nav({ to: "/irmaos" });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
                        }
                      }}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <Tabs defaultValue="identificacao">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="identificacao">Identificação</TabsTrigger>
          <TabsTrigger value="maconico">Maçônico</TabsTrigger>
          <TabsTrigger value="profissional">Profissional</TabsTrigger>
          <TabsTrigger value="familia">Família</TabsTrigger>
          <TabsTrigger value="contato">Contato</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="cargos">Cargos</TabsTrigger>
        </TabsList>

        <TabsContent value="identificacao">
          <Card>
            <CardContent className="grid gap-4 md:grid-cols-3 pt-6">
              <div className="md:col-span-3 flex items-center gap-4">
                {perfil.foto_url && !fotoQuebrada && (
                  <img
                    src={perfil.foto_url}
                    alt={`Foto de ${perfil.nome_civil}`}
                    loading="lazy"
                    decoding="async"
                    onError={() => setFotoQuebrada(true)}
                    className="h-20 w-20 rounded-full object-cover border"
                  />
                )}
                {podeEditar && (
                  <div>
                    <Label htmlFor="irmao-foto">Foto</Label>
                    <Input
                      id="irmao-foto"
                      type="file"
                      accept="image/*"
                      disabled={!podeEditar}
                      onChange={(e) => e.target.files?.[0] && uploadFoto(e.target.files[0])}
                    />
                  </div>
                )}
              </div>
              <Field label="Nome civil *" id="irmao-nome-civil">
                <Input
                  id="irmao-nome-civil"
                  required
                  value={perfil.nome_civil ?? ""}
                  onChange={set("nome_civil")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Nome simbólico" id="irmao-nome-simbolico">
                <Input
                  id="irmao-nome-simbolico"
                  value={perfil.nome_simbolico ?? ""}
                  onChange={set("nome_simbolico")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="CIM" id="irmao-cim">
                <Input
                  id="irmao-cim"
                  value={perfil.cim ?? ""}
                  onChange={set("cim")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Matrícula" id="irmao-matricula">
                <Input
                  id="irmao-matricula"
                  value={perfil.numero_matricula ?? ""}
                  onChange={set("numero_matricula")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Estado civil" id="irmao-estado-civil">
                <Select
                  value={perfil.estado_civil ?? ""}
                  onValueChange={set("estado_civil")}
                  disabled={!podeEditar}
                >
                  <SelectTrigger id="irmao-estado-civil">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {["solteiro", "casado", "divorciado", "viuvo", "uniao_estavel"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Data de nascimento" id="irmao-data-nascimento">
                <Input
                  id="irmao-data-nascimento"
                  type="date"
                  value={perfil.data_nascimento ?? ""}
                  onChange={set("data_nascimento")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="CPF" id="irmao-cpf">
                <Input
                  id="irmao-cpf"
                  value={perfil.cpf ?? ""}
                  onChange={set("cpf")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="RG" id="irmao-rg">
                <Input
                  id="irmao-rg"
                  value={perfil.rg ?? ""}
                  onChange={set("rg")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Naturalidade" id="irmao-naturalidade">
                <Input
                  id="irmao-naturalidade"
                  value={perfil.naturalidade ?? ""}
                  onChange={set("naturalidade")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Nacionalidade" id="irmao-nacionalidade">
                <Input
                  id="irmao-nacionalidade"
                  value={perfil.nacionalidade ?? ""}
                  onChange={set("nacionalidade")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Religião" id="irmao-religiao">
                <Input
                  id="irmao-religiao"
                  value={perfil.religiao ?? ""}
                  onChange={set("religiao")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Observações" className="md:col-span-3" id="irmao-observacoes">
                <Textarea
                  id="irmao-observacoes"
                  value={perfil.observacoes ?? ""}
                  onChange={set("observacoes")}
                  disabled={!podeEditar}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maconico">
          <Card className="mb-4">
            <CardContent className="grid gap-4 md:grid-cols-3 pt-6">
              <Field label="Grau" id="irmao-grau">
                <Select
                  value={perfil.grau ?? "aprendiz"}
                  onValueChange={set("grau")}
                  disabled={!podeEditar}
                >
                  <SelectTrigger id="irmao-grau">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GRAU_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Situação" id="irmao-situacao">
                <Select
                  value={perfil.situacao ?? "ativo"}
                  onValueChange={set("situacao")}
                  disabled={!podeEditar}
                >
                  <SelectTrigger id="irmao-situacao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SITUACAO_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Potência (texto livre)" id="irmao-potencia">
                <Input
                  id="irmao-potencia"
                  value={perfil.potencia ?? ""}
                  onChange={set("potencia")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Data de iniciação" id="irmao-data-iniciacao">
                <Input
                  id="irmao-data-iniciacao"
                  type="date"
                  value={perfil.data_iniciacao ?? ""}
                  onChange={set("data_iniciacao")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Data de elevação" id="irmao-data-elevacao">
                <Input
                  id="irmao-data-elevacao"
                  type="date"
                  value={perfil.data_elevacao ?? ""}
                  onChange={set("data_elevacao")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Data de exaltação" id="irmao-data-exaltacao">
                <Input
                  id="irmao-data-exaltacao"
                  type="date"
                  value={perfil.data_exaltacao ?? ""}
                  onChange={set("data_exaltacao")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Loja de origem" id="irmao-loja-origem">
                <Input
                  id="irmao-loja-origem"
                  value={perfil.loja_origem ?? ""}
                  onChange={set("loja_origem")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Número (Grande Oriente)" id="irmao-numero-grande-oriente">
                <Input
                  id="irmao-numero-grande-oriente"
                  value={perfil.numero_grande_oriente ?? ""}
                  onChange={set("numero_grande_oriente")}
                  disabled={!podeEditar}
                />
              </Field>
              <div className="flex flex-wrap gap-4 md:col-span-3">
                {(["fundador", "benemerito", "honorario", "licenciado"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <Switch
                      id={`irmao-flag-${k}`}
                      checked={!!perfil[k]}
                      onCheckedChange={set(k)}
                      disabled={!podeEditar}
                    />
                    <Label htmlFor={`irmao-flag-${k}`} className="!m-0 capitalize">
                      {k}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <CorposPanel irmaoId={id} podeEditar={podeEditar} />
            <ElevacoesPanel irmaoId={id} podeEditar={podeEditar} />
          </div>
        </TabsContent>

        <TabsContent value="profissional">
          <Card className="mb-4">
            <CardContent className="grid gap-4 md:grid-cols-3 pt-6">
              <Field label="Profissão" id="irmao-profissao">
                <Input
                  id="irmao-profissao"
                  value={perfil.profissao ?? ""}
                  onChange={set("profissao")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Empresa" id="irmao-empresa">
                <Input
                  id="irmao-empresa"
                  value={perfil.empresa ?? ""}
                  onChange={set("empresa")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Cargo" id="irmao-cargo-profissional">
                <Input
                  id="irmao-cargo-profissional"
                  value={perfil.cargo_profissional ?? ""}
                  onChange={set("cargo_profissional")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Área de atuação" id="irmao-area-atuacao">
                <Input
                  id="irmao-area-atuacao"
                  value={perfil.area_atuacao ?? ""}
                  onChange={set("area_atuacao")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Mensalidade" id="irmao-mensalidade">
                <Input
                  id="irmao-mensalidade"
                  type="number"
                  step="0.01"
                  value={perfil.valor_mensalidade ?? 0}
                  onChange={set("valor_mensalidade")}
                  disabled={!podeEditar}
                />
              </Field>
            </CardContent>
          </Card>
          <FormacaoPanel irmaoId={id} podeEditar={podeEditar} />
        </TabsContent>

        <TabsContent value="familia">
          <div className="grid gap-4 md:grid-cols-2">
            <ParentesPanel
              irmaoId={id}
              tipo="conjuge"
              titulo="Cônjuge"
              podeEditar={podeEditar}
              unico
            />
            <ParentesPanel
              irmaoId={id}
              tipo="contato_emergencia"
              titulo="Contato de emergência"
              podeEditar={podeEditar}
              unico
            />
            <ParentesPanel irmaoId={id} tipo="pai" titulo="Pai" podeEditar={podeEditar} unico />
            <ParentesPanel irmaoId={id} tipo="mae" titulo="Mãe" podeEditar={podeEditar} unico />
          </div>
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <FilhosPanel irmaoId={id} podeEditar={podeEditar} />
            <ParentesPanel
              irmaoId={id}
              tipo="outro"
              titulo="Outros aniversariantes"
              podeEditar={podeEditar}
            />
          </div>
        </TabsContent>

        <TabsContent value="contato">
          <Card>
            <CardContent className="grid gap-4 md:grid-cols-3 pt-6">
              <Field label="E-mail" id="irmao-email">
                <Input
                  id="irmao-email"
                  type="email"
                  value={perfil.email ?? ""}
                  onChange={set("email")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Telefone" id="irmao-telefone">
                <Input
                  id="irmao-telefone"
                  value={perfil.telefone ?? ""}
                  onChange={set("telefone")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Celular" id="irmao-celular">
                <Input
                  id="irmao-celular"
                  value={perfil.celular ?? ""}
                  onChange={set("celular")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="CEP" id="irmao-cep">
                <div className="flex gap-2">
                  <Input
                    id="irmao-cep"
                    value={perfil.cep ?? ""}
                    onChange={set("cep")}
                    disabled={!podeEditar}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={buscarCep}
                    disabled={!podeEditar}
                  >
                    Buscar
                  </Button>
                </div>
              </Field>
              <Field label="Logradouro" id="irmao-logradouro">
                <Input
                  id="irmao-logradouro"
                  value={perfil.logradouro ?? ""}
                  onChange={set("logradouro")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Número" id="irmao-numero-endereco">
                <Input
                  id="irmao-numero-endereco"
                  value={perfil.numero_endereco ?? ""}
                  onChange={set("numero_endereco")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Complemento" id="irmao-complemento">
                <Input
                  id="irmao-complemento"
                  value={perfil.complemento ?? ""}
                  onChange={set("complemento")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Bairro" id="irmao-bairro">
                <Input
                  id="irmao-bairro"
                  value={perfil.bairro ?? ""}
                  onChange={set("bairro")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Cidade" id="irmao-cidade">
                <Input
                  id="irmao-cidade"
                  value={perfil.cidade ?? ""}
                  onChange={set("cidade")}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Estado" id="irmao-estado">
                <Input
                  id="irmao-estado"
                  value={perfil.estado ?? ""}
                  onChange={set("estado")}
                  disabled={!podeEditar}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro">
          <FinanceiroPanel irmaoId={id} />
        </TabsContent>

        <TabsContent value="cargos">
          <CargosHistoricoPanel irmaoId={id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({
  label,
  children,
  className,
  id,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// =========================================
// Corpos vinculados (irmao_orgs)
// =========================================
function CorposPanel({ irmaoId, podeEditar }: { irmaoId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ org_id: "", grau_atual: "", principal: false });

  const { data: vinculos = [] } = useQuery({
    queryKey: ["irmao_orgs", irmaoId],
    queryFn: () => listarIrmaoOrgs({ data: { irmaoId } }),
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs_all"],
    queryFn: () => listarOrgs(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["irmao_orgs", irmaoId] });

  const ord = useOrdenacao(vinculos, {
    corpo: (v) => v.orgs?.sigla ?? v.orgs?.nome,
    grau: (v) => v.grau_atual,
    principal: (v) => (v.principal ? 1 : 0),
  });

  const adicionar = async () => {
    if (!novo.org_id) return;
    try {
      await criarIrmaoOrg({
        data: {
          irmaoId,
          orgId: novo.org_id,
          principal: novo.principal,
          grauAtual: novo.grau_atual ? Number(novo.grau_atual) : null,
        },
      });
      setNovo({ org_id: "", grau_atual: "", principal: false });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (vid: string) => {
    try {
      await removerIrmaoOrg({ data: { id: vid } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Corpos vinculados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="corpo" ord={ord}>
                Corpo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="grau" ord={ord}>
                Grau
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="principal" ord={ord}>
                Principal
              </TableHeadOrdenavel>
              {podeEditar && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vinculos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
                  Nenhum corpo vinculado.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{v.orgs?.sigla ?? v.orgs?.nome}</TableCell>
                <TableCell>{v.grau_atual ?? "—"}</TableCell>
                <TableCell>{v.principal ? <Badge>Sim</Badge> : "—"}</TableCell>
                {podeEditar && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remover(v.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {podeEditar && (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-32">
              <Label htmlFor="corpo-org" className="text-xs">
                Corpo
              </Label>
              <Select value={novo.org_id} onValueChange={(v) => setNovo({ ...novo, org_id: v })}>
                <SelectTrigger id="corpo-org" className="h-8">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.sigla ?? o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-20">
              <Label htmlFor="corpo-grau" className="text-xs">
                Grau
              </Label>
              <Input
                id="corpo-grau"
                type="number"
                className="h-8"
                value={novo.grau_atual}
                onChange={(e) => setNovo({ ...novo, grau_atual: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-1">
              <Switch
                id="corpo-principal"
                checked={novo.principal}
                onCheckedChange={(v) => setNovo({ ...novo, principal: v })}
              />
              <Label htmlFor="corpo-principal" className="text-xs !m-0">
                Principal
              </Label>
            </div>
            <Button size="sm" onClick={adicionar}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================
// Elevações de grau (irmao_elevacoes)
// =========================================
function ElevacoesPanel({ irmaoId, podeEditar }: { irmaoId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ grau: "", data: "" });

  const { data: elevacoes = [] } = useQuery({
    queryKey: ["irmao_elevacoes", irmaoId],
    queryFn: () => listarIrmaoElevacoes({ data: { irmaoId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["irmao_elevacoes", irmaoId] });

  const ord = useOrdenacao(elevacoes, {
    grau: (e) => e.grau,
    data: (e) => e.data,
  });

  const adicionar = async () => {
    const g = Number(novo.grau);
    if (!g) return;
    try {
      await criarIrmaoElevacao({ data: { irmaoId, grau: g, data: novo.data || null } });
      setNovo({ grau: "", data: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerIrmaoElevacao({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Elevações de grau</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="grau" ord={ord}>
                Grau
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="data" ord={ord}>
                Data
              </TableHeadOrdenavel>
              {podeEditar && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {elevacoes.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground text-sm">
                  Nenhuma elevação registrada.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono">{e.grau}</TableCell>
                <TableCell>{fmtDate(e.data)}</TableCell>
                {podeEditar && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remover(e.id)}>
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
            <div className="w-20">
              <Label htmlFor="elevacao-grau" className="text-xs">
                Grau
              </Label>
              <Input
                id="elevacao-grau"
                type="number"
                className="h-8"
                value={novo.grau}
                onChange={(e) => setNovo({ ...novo, grau: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="elevacao-data" className="text-xs">
                Data
              </Label>
              <Input
                id="elevacao-data"
                type="date"
                className="h-8"
                value={novo.data}
                onChange={(e) => setNovo({ ...novo, data: e.target.value })}
              />
            </div>
            <Button size="sm" onClick={adicionar}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================
// Formação acadêmica (irmao_formacao)
// =========================================
function FormacaoPanel({ irmaoId, podeEditar }: { irmaoId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ curso: "", instituicao: "", nivel: "", ano_conclusao: "" });

  const { data: itens = [] } = useQuery({
    queryKey: ["irmao_formacao", irmaoId],
    queryFn: () => listarIrmaoFormacao({ data: { irmaoId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["irmao_formacao", irmaoId] });

  const ord = useOrdenacao(itens, {
    curso: (f) => f.curso,
    instituicao: (f) => f.instituicao,
    nivel: (f) => f.nivel,
    conclusao: (f) => f.ano_conclusao,
  });

  const adicionar = async () => {
    if (!novo.curso.trim()) return;
    try {
      await criarIrmaoFormacao({
        data: {
          irmaoId,
          curso: novo.curso.trim(),
          instituicao: novo.instituicao || null,
          nivel: novo.nivel || null,
          anoConclusao: novo.ano_conclusao ? Number(novo.ano_conclusao) : null,
        },
      });
      setNovo({ curso: "", instituicao: "", nivel: "", ano_conclusao: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerIrmaoFormacao({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Formação acadêmica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="curso" ord={ord}>
                Curso
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="instituicao" ord={ord}>
                Instituição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="nivel" ord={ord}>
                Nível
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="conclusao" ord={ord}>
                Conclusão
              </TableHeadOrdenavel>
              {podeEditar && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  Nenhuma formação cadastrada.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.curso}</TableCell>
                <TableCell>{f.instituicao ?? "—"}</TableCell>
                <TableCell>{f.nivel ?? "—"}</TableCell>
                <TableCell>{f.ano_conclusao ?? "—"}</TableCell>
                {podeEditar && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remover(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {podeEditar && (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-32">
              <Label htmlFor="formacao-curso" className="text-xs">
                Curso
              </Label>
              <Input
                id="formacao-curso"
                className="h-8"
                value={novo.curso}
                onChange={(e) => setNovo({ ...novo, curso: e.target.value })}
              />
            </div>
            <div className="flex-1 min-w-32">
              <Label htmlFor="formacao-instituicao" className="text-xs">
                Instituição
              </Label>
              <Input
                id="formacao-instituicao"
                className="h-8"
                value={novo.instituicao}
                onChange={(e) => setNovo({ ...novo, instituicao: e.target.value })}
              />
            </div>
            <div className="w-32">
              <Label htmlFor="formacao-nivel" className="text-xs">
                Nível
              </Label>
              <Input
                id="formacao-nivel"
                className="h-8"
                value={novo.nivel}
                onChange={(e) => setNovo({ ...novo, nivel: e.target.value })}
              />
            </div>
            <div className="w-24">
              <Label htmlFor="formacao-ano" className="text-xs">
                Ano
              </Label>
              <Input
                id="formacao-ano"
                type="number"
                className="h-8"
                value={novo.ano_conclusao}
                onChange={(e) => setNovo({ ...novo, ano_conclusao: e.target.value })}
              />
            </div>
            <Button size="sm" onClick={adicionar}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================
// Filhos (irmao_filhos)
// =========================================
function FilhosPanel({ irmaoId, podeEditar }: { irmaoId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ nome: "", data_nascimento: "" });

  const { data: itens = [] } = useQuery({
    queryKey: ["irmao_filhos", irmaoId],
    queryFn: () => listarIrmaoFilhos({ data: { irmaoId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["irmao_filhos", irmaoId] });

  const ord = useOrdenacao(itens, {
    nome: (f) => f.nome,
    nascimento: (f) => f.data_nascimento,
  });

  const adicionar = async () => {
    if (!novo.nome.trim()) return;
    try {
      await criarIrmaoFilho({
        data: { irmaoId, nome: novo.nome.trim(), dataNascimento: novo.data_nascimento || null },
      });
      setNovo({ nome: "", data_nascimento: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerIrmaoFilho({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Filhos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="nome" ord={ord}>
                Nome
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="nascimento" ord={ord}>
                Nascimento
              </TableHeadOrdenavel>
              {podeEditar && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground text-sm">
                  Nenhum filho cadastrado.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.nome}</TableCell>
                <TableCell>{fmtDate(f.data_nascimento)}</TableCell>
                {podeEditar && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remover(f.id)}>
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
            <div className="flex-1">
              <Label htmlFor="filho-nome" className="text-xs">
                Nome
              </Label>
              <Input
                id="filho-nome"
                className="h-8"
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="filho-nascimento" className="text-xs">
                Nascimento
              </Label>
              <Input
                id="filho-nascimento"
                type="date"
                className="h-8"
                value={novo.data_nascimento}
                onChange={(e) => setNovo({ ...novo, data_nascimento: e.target.value })}
              />
            </div>
            <Button size="sm" onClick={adicionar}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================
// Pai/mãe/cônjuge/contato de emergência/outros (irmao_parentes)
// "unico" = mostra só o primeiro registro desse tipo com edição inline
// (pai/mãe/cônjuge/contato de emergência); sem "unico" vira lista livre
// (outros aniversariantes).
// =========================================
function ParentesPanel({
  irmaoId,
  tipo,
  titulo,
  podeEditar,
  unico,
}: {
  irmaoId: string;
  tipo: TipoParente;
  titulo: string;
  podeEditar: boolean;
  unico?: boolean;
}) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({
    nome: "",
    data_nascimento: "",
    telefone: "",
    profissao: "",
    data_casamento: "",
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["irmao_parentes", irmaoId, tipo],
    queryFn: () => listarIrmaoParentes({ data: { irmaoId, tipo } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["irmao_parentes", irmaoId, tipo] });

  const ord = useOrdenacao(itens, {
    nome: (p) => p.nome,
    nascimento: (p) => p.data_nascimento,
    telefone: (p) => p.telefone,
  });

  const adicionar = async () => {
    if (!novo.nome.trim()) return;
    try {
      await criarIrmaoParente({
        data: {
          irmaoId,
          tipo,
          nome: novo.nome.trim(),
          dataNascimento: novo.data_nascimento || null,
          telefone: novo.telefone || null,
          profissao: novo.profissao || null,
          dataCasamento: novo.data_casamento || null,
        },
      });
      setNovo({ nome: "", data_nascimento: "", telefone: "", profissao: "", data_casamento: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerIrmaoParente({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  const podeAdicionar = !unico || itens.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="nome" ord={ord}>
                Nome
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="nascimento" ord={ord}>
                Nascimento
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="telefone" ord={ord}>
                Telefone
              </TableHeadOrdenavel>
              {podeEditar && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
                  Nenhum registro.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.nome}</TableCell>
                <TableCell>{fmtDate(p.data_nascimento)}</TableCell>
                <TableCell>{p.telefone ?? "—"}</TableCell>
                {podeEditar && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remover(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {podeEditar && podeAdicionar && (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-24">
              <Label htmlFor={`parente-${tipo}-nome`} className="text-xs">
                Nome
              </Label>
              <Input
                id={`parente-${tipo}-nome`}
                className="h-8"
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`parente-${tipo}-nascimento`} className="text-xs">
                Nascimento
              </Label>
              <Input
                id={`parente-${tipo}-nascimento`}
                type="date"
                className="h-8"
                value={novo.data_nascimento}
                onChange={(e) => setNovo({ ...novo, data_nascimento: e.target.value })}
              />
            </div>
            <div className="w-32">
              <Label htmlFor={`parente-${tipo}-telefone`} className="text-xs">
                Telefone
              </Label>
              <Input
                id={`parente-${tipo}-telefone`}
                className="h-8"
                value={novo.telefone}
                onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
              />
            </div>
            <Button size="sm" onClick={adicionar}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =========================================
// Financeiro — histórico de lançamentos do irmão (somente leitura)
// =========================================
function FinanceiroPanel({ irmaoId }: { irmaoId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["irmao_lancamentos", irmaoId],
    queryFn: () => listarLancamentosIrmao({ data: { irmaoId } }),
  });

  const ord = useOrdenacao(itens, {
    data: (l) => l.data,
    descricao: (l) => l.descricao,
    tipo: (l) => l.tipo,
    valor: (l) => Number(l.valor),
    status: (l) => (l.pago ? 1 : 0),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico financeiro</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="data" ord={ord}>
                Data
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="descricao" ord={ord}>
                Descrição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="tipo" ord={ord}>
                Tipo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                Valor
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum lançamento.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{fmtDate(l.data)}</TableCell>
                <TableCell>{l.descricao}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {l.tipo === "entrada"
                      ? "Entrada"
                      : l.tipo === "saida"
                        ? "Saída"
                        : l.tipo === "transferencia"
                          ? "Transferência"
                          : l.tipo}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{brl(l.valor)}</TableCell>
                <TableCell>
                  {l.pago ? <Badge>Pago</Badge> : <Badge variant="secondary">Em aberto</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// =========================================
// Cargos — histórico de gestao_cargos (somente leitura)
// =========================================
function CargosHistoricoPanel({ irmaoId }: { irmaoId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["irmao_cargos_historico", irmaoId],
    queryFn: () => listarCargosHistoricoIrmao({ data: { irmaoId } }),
  });

  const ord = useOrdenacao(itens, {
    cargo: (o) => o.cargos?.nome,
    gestao: (o) => o.gestoes?.nome,
    corpo: (o) => o.gestoes?.orgs?.sigla ?? o.gestoes?.orgs?.nome,
    status: (o) => (o.gestoes?.ativo ? 1 : 0),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de cargos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="cargo" ord={ord}>
                Cargo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="gestao" ord={ord}>
                Gestão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="corpo" ord={ord}>
                Corpo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  Nenhum cargo ocupado.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.cargos?.nome}</TableCell>
                <TableCell>{o.gestoes?.nome}</TableCell>
                <TableCell>{o.gestoes?.orgs?.sigla ?? o.gestoes?.orgs?.nome}</TableCell>
                <TableCell>
                  {o.gestoes?.ativo ? (
                    <Badge>Atual</Badge>
                  ) : (
                    <Badge variant="outline">Encerrada</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
