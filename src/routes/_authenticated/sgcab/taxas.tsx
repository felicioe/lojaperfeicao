import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarTaxasGrau,
  salvarTaxaGrau,
  excluirTaxaGrau,
  gerarCobrancasSgcab,
  type TaxaGrau,
} from "@/lib/backend/sgcab";
import { listarOrgs, listarOrgsGraus } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { brl } from "@/lib/format";
import { Pencil, Trash2, Wand2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/sgcab/taxas")({
  head: () => ({ meta: [{ title: "Taxas por Grau (SGCAB) — Gestão Maçônica" }] }),
  component: TaxasGrauPage,
});

const ANO_ATUAL = new Date().getFullYear();

const FORM_VAZIO = {
  id: null as string | null,
  grau: "",
  sgcab: 0,
  ritual: 0,
  diploma: 0,
  taxaPropria: 0,
  ativo: true,
};

function TaxasGrauPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState<string>("");
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [form, setForm] = useState(FORM_VAZIO);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const { data: graus = [] } = useQuery({
    queryKey: ["orgs_graus", orgId],
    queryFn: () => listarOrgsGraus({ data: { orgId } }),
    enabled: !!orgId,
  });

  const { data: taxas = [] } = useQuery({
    queryKey: ["taxas_grau", orgId, ano],
    queryFn: () => listarTaxasGrau({ data: { orgId, ano } }),
    enabled: !!orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["taxas_grau", orgId, ano] });

  const salvar = async () => {
    const g = Number(form.grau);
    if (!orgId || !g) return;
    try {
      await salvarTaxaGrau({
        data: {
          id: form.id,
          orgId,
          ano,
          grau: g,
          sgcab: Number(form.sgcab) || 0,
          ritual: Number(form.ritual) || 0,
          diploma: Number(form.diploma) || 0,
          taxaPropria: Number(form.taxaPropria) || 0,
          ativo: form.ativo,
        },
      });
      toast.success(form.id ? "Taxa atualizada." : "Taxa cadastrada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (t: TaxaGrau) =>
    setForm({
      id: t.id,
      grau: String(t.grau),
      sgcab: t.sgcab,
      ritual: t.ritual,
      diploma: t.diploma,
      taxaPropria: t.taxa_propria,
      ativo: t.ativo,
    });

  const excluir = async (id: string) => {
    try {
      await excluirTaxaGrau({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const gerarCobrancas = async () => {
    if (!orgId) return;
    try {
      const { totalGerado } = await gerarCobrancasSgcab({ data: { orgId, ano } });
      toast.success(`${totalGerado} cobrança(s) gerada(s) para os irmãos do corpo.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar cobranças.");
    }
  };

  return (
    <>
      <PageHeader
        title="Taxas por Grau (SGCAB)"
        description="Catálogo de valores (SGCAB, ritual, diploma, taxa própria) por grau/corpo/ano. Repassado a órgão federativo — não gera lançamento contábil."
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3">
          <div>
            <Label>Corpo maçônico</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                    {o.sigla ? ` (${o.sigla})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ano</Label>
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
          </div>
          {can.canManageIrmaos && (
            <div className="flex items-end">
              <Button variant="outline" onClick={gerarCobrancas} disabled={!orgId}>
                <Wand2 className="mr-1.5 h-4 w-4" /> Gerar cobranças do ano
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!orgId ? (
        <Card className="p-6 text-center text-muted-foreground">
          Selecione um corpo maçônico para ver/editar as taxas.
        </Card>
      ) : (
        <>
          {can.canManageIrmaos && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">{form.id ? "Editar taxa" : "Nova taxa"}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-6">
                <div>
                  <Label>Grau</Label>
                  {graus.length > 0 ? (
                    <Select value={form.grau} onValueChange={(v) => setForm({ ...form, grau: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Grau…" />
                      </SelectTrigger>
                      <SelectContent>
                        {graus.map((g) => (
                          <SelectItem key={g.id} value={String(g.grau)}>
                            {g.grau} — {g.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      max={33}
                      value={form.grau}
                      onChange={(e) => setForm({ ...form, grau: e.target.value })}
                    />
                  )}
                </div>
                <div>
                  <Label>SGCAB</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sgcab}
                    onChange={(e) => setForm({ ...form, sgcab: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Ritual</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.ritual}
                    onChange={(e) => setForm({ ...form, ritual: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Diploma</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.diploma}
                    onChange={(e) => setForm({ ...form, diploma: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Taxa própria</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.taxaPropria}
                    onChange={(e) => setForm({ ...form, taxaPropria: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={salvar} disabled={!form.grau}>
                    {form.id ? "Salvar" : "Adicionar"}
                  </Button>
                  {form.id && (
                    <Button variant="outline" size="icon" onClick={() => setForm(FORM_VAZIO)}>
                      <X className="h-4 w-4" />
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
                  <TableHead>Grau</TableHead>
                  <TableHead>SGCAB</TableHead>
                  <TableHead>Ritual</TableHead>
                  <TableHead>Diploma</TableHead>
                  <TableHead>Taxa própria</TableHead>
                  <TableHead>Status</TableHead>
                  {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      Nenhuma taxa cadastrada para {ano}.
                    </TableCell>
                  </TableRow>
                )}
                {taxas.map((t) => (
                  <TableRow key={t.id} className={!t.ativo ? "opacity-50" : undefined}>
                    <TableCell className="font-mono">
                      {t.grau} {t.nome_grau ? `— ${t.nome_grau}` : ""}
                    </TableCell>
                    <TableCell>{brl(t.sgcab)}</TableCell>
                    <TableCell>{brl(t.ritual)}</TableCell>
                    <TableCell>{brl(t.diploma)}</TableCell>
                    <TableCell>{brl(t.taxa_propria)}</TableCell>
                    <TableCell>
                      <Badge variant={t.ativo ? "default" : "outline"}>
                        {t.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    {can.canManageIrmaos && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => editar(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => excluir(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
