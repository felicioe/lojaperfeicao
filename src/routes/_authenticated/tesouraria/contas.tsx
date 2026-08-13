import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarSaldoContas,
  criarContaFinanceira,
  listarChavesPix,
  criarChavePix,
  removerChavePix,
  uploadQrCodePix,
  type ChavePix,
} from "@/lib/backend/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { brl } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ImageIcon, Trash2 } from "lucide-react";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/tesouraria/contas")({
  head: () => ({ meta: [{ title: "Contas — Gestão Maçônica" }] }),
  component: Contas,
});

const TIPO_PIX_LABEL: Record<ChavePix["tipo"], string> = {
  email: "E-mail",
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  aleatoria: "Aleatória",
};

function Contas() {
  const qc = useQueryClient();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [nova, setNova] = useState<{
    nome: string;
    tipo: "caixa" | "banco" | "outro";
    saldo_inicial: number;
    banco: string;
  }>({ nome: "", tipo: "caixa", saldo_inicial: 0, banco: "" });

  const saldos = useQuery({
    queryKey: ["saldos"],
    queryFn: () => listarSaldoContas(),
  });
  const ord = useOrdenacao(saldos.data ?? [], {
    nome: (c) => c.nome,
    tipo: (c) => c.tipo,
    saldo_inicial: (c) => Number(c.saldo_inicial),
    saldo_atual: (c) => Number(c.saldo_atual),
  });

  const criar = async () => {
    try {
      await criarContaFinanceira({ data: { ...nova, banco: nova.banco || null } });
      toast.success("Conta criada.");
      setNova({ nome: "", tipo: "caixa", saldo_inicial: 0, banco: "" });
      qc.invalidateQueries({ queryKey: ["saldos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    }
  };

  return (
    <>
      <PageHeader title="Contas financeiras" description="Caixa, contas bancárias e saldos." />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Nova conta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label>Nome</Label>
            <Input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select
              value={nova.tipo}
              onValueChange={(v) => setNova({ ...nova, tipo: v as typeof nova.tipo })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caixa">Caixa</SelectItem>
                <SelectItem value="banco">Banco</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Banco</Label>
            <Input
              value={nova.banco}
              onChange={(e) => setNova({ ...nova, banco: e.target.value })}
            />
          </div>
          <div>
            <Label>Saldo inicial</Label>
            <Input
              type="number"
              step="0.01"
              value={nova.saldo_inicial}
              onChange={(e) => setNova({ ...nova, saldo_inicial: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={criar} disabled={!nova.nome}>
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHeadOrdenavel campo="nome" ord={ord}>
                  Nome
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ord}>
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="saldo_inicial" ord={ord} className="text-right">
                  Saldo inicial
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="saldo_atual" ord={ord} className="text-right">
                  Saldo atual
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ord.itensOrdenados.map((c) => (
                <Fragment key={c.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandido(expandido === c.id ? null : c.id)}
                      >
                        {expandido === c.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>
                      {{ caixa: "Caixa", banco: "Banco", outro: "Outro" }[c.tipo as string] ??
                        c.tipo}
                    </TableCell>
                    <TableCell className="text-right">{brl(c.saldo_inicial)}</TableCell>
                    <TableCell className="text-right font-medium">{brl(c.saldo_atual)}</TableCell>
                  </TableRow>
                  {expandido === c.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <ChavesPixPanel contaId={c.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}

function ChavesPixPanel({ contaId }: { contaId: string }) {
  const qc = useQueryClient();
  const [nova, setNova] = useState<{
    tipo: ChavePix["tipo"];
    chave: string;
    pix_copia_cola: string;
    qr_code_url: string | null;
    nome_beneficiario: string;
    cidade: string;
    principal: boolean;
  }>({
    tipo: "email",
    chave: "",
    pix_copia_cola: "",
    qr_code_url: null,
    nome_beneficiario: "",
    cidade: "",
    principal: false,
  });
  const [enviandoQr, setEnviandoQr] = useState(false);

  const { data: chaves = [] } = useQuery({
    queryKey: ["chaves_pix", contaId],
    queryFn: () => listarChavesPix({ data: { contaId } }),
  });
  const ordChaves = useOrdenacao(chaves, {
    tipo: (c) => TIPO_PIX_LABEL[c.tipo],
    chave: (c) => c.chave,
    beneficiario: (c) => c.nome_beneficiario,
    cidade: (c) => c.cidade,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["chaves_pix", contaId] });

  const adicionar = async () => {
    if (!nova.chave.trim() && !nova.pix_copia_cola.trim() && !nova.qr_code_url) {
      return toast.error("Informe uma chave, um código copia e cola ou uma imagem do QR Code.");
    }
    if (!nova.nome_beneficiario.trim()) return toast.error("Informe o nome do beneficiário.");
    if (!nova.cidade.trim()) return toast.error("Informe a cidade do beneficiário.");
    try {
      await criarChavePix({
        data: {
          contaFinanceiraId: contaId,
          tipo: nova.tipo,
          chave: nova.chave.trim(),
          pixCopiaCola: nova.pix_copia_cola.trim() || null,
          qrCodeUrl: nova.qr_code_url,
          nomeBeneficiario: nova.nome_beneficiario.trim(),
          cidade: nova.cidade.trim(),
          principal: nova.principal || chaves.length === 0,
        },
      });
      setNova({
        tipo: "email",
        chave: "",
        pix_copia_cola: "",
        qr_code_url: null,
        nome_beneficiario: "",
        cidade: "",
        principal: false,
      });
      toast.success("Dados PIX salvos.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const enviarQrCode = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem maior que 5 MB.");
    setEnviandoQr(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resultado = await uploadQrCodePix({ data: { nomeArquivo: file.name, dataUrl } });
      setNova((atual) => ({ ...atual, qr_code_url: resultado.url }));
      toast.success("Imagem do QR Code enviada.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviandoQr(false);
    }
  };

  const remover = async (id: string) => {
    try {
      await removerChavePix({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <div className="py-2 space-y-3">
      <div className="text-sm font-medium">Chaves PIX</div>
      <p className="text-xs text-muted-foreground">
        Usadas pra gerar o QR code do Pix nas faturas cobradas com essa conta. Nome do beneficiário
        (máx. 25 caracteres) e cidade (máx. 15) são exigidos pelo padrão do Banco Central.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="tipo" ord={ordChaves}>
                Tipo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="chave" ord={ordChaves}>
                Chave
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="beneficiario" ord={ordChaves}>
                Beneficiário
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="cidade" ord={ordChaves}>
                Cidade
              </TableHeadOrdenavel>
              <TableHead></TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chaves.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-sm">
                  Nenhuma chave cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
            {ordChaves.itensOrdenados.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{TIPO_PIX_LABEL[c.tipo]}</TableCell>
                <TableCell className="max-w-56 truncate font-mono text-sm">
                  {c.chave || "Código/QR cadastrado"}
                  <div className="mt-1 flex gap-1">
                    {c.pix_copia_cola && <Badge variant="outline">Copia e cola</Badge>}
                    {c.qr_code_url && <Badge variant="outline">Imagem QR</Badge>}
                  </div>
                </TableCell>
                <TableCell>{c.nome_beneficiario}</TableCell>
                <TableCell>{c.cidade}</TableCell>
                <TableCell>{c.principal && <Badge variant="secondary">Principal</Badge>}</TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir chave PIX?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A chave "{c.chave}" ({TIPO_PIX_LABEL[c.tipo]}) será removida
                          permanentemente. Faturas que já usam essa chave para gerar o QR code
                          deixarão de funcionar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remover(c.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select
            value={nova.tipo}
            onValueChange={(v) => setNova({ ...nova, tipo: v as ChavePix["tipo"] })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_PIX_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Chave PIX (opcional)</Label>
          <Input
            className="h-8"
            value={nova.chave}
            onChange={(e) => setNova({ ...nova, chave: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Telefone: use +55. Chave aleatória: UUID.
          </p>
        </div>
        <div>
          <Label className="text-xs">Beneficiário</Label>
          <Input
            className="h-8"
            maxLength={25}
            value={nova.nome_beneficiario}
            onChange={(e) => setNova({ ...nova, nome_beneficiario: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Cidade</Label>
          <Input
            className="h-8"
            maxLength={15}
            value={nova.cidade}
            onChange={(e) => setNova({ ...nova, cidade: e.target.value })}
          />
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <Label className="text-xs">PIX copia e cola (opcional)</Label>
          <Textarea
            rows={3}
            maxLength={1000}
            value={nova.pix_copia_cola}
            onChange={(e) => setNova({ ...nova, pix_copia_cola: e.target.value })}
            placeholder="Cole aqui o código PIX completo"
            className="font-mono text-xs"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Imagem do QR Code (opcional)</Label>
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={enviandoQr}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void enviarQrCode(file);
            }}
          />
          {nova.qr_code_url && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-4 w-4" /> Imagem pronta para salvar
              <img
                src={nova.qr_code_url}
                alt="Prévia do QR Code"
                className="h-16 w-16 rounded border bg-white object-contain p-1"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`principal-${contaId}`}
            checked={nova.principal}
            onCheckedChange={(v) => setNova({ ...nova, principal: v === true })}
          />
          <Label htmlFor={`principal-${contaId}`} className="text-xs cursor-pointer">
            Principal
          </Label>
        </div>
        <Button size="sm" onClick={adicionar} disabled={enviandoQr}>
          Salvar dados PIX
        </Button>
      </div>
    </div>
  );
}
