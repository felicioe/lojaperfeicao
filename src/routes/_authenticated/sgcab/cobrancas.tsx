import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarCobrancasSgcab,
  registrarPagamentoSgcab,
  uploadComprovanteSgcab,
  type SgcabCobranca,
} from "@/lib/backend/sgcab";
import { listarOrgs } from "@/lib/backend/orgs";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl, fmtDate } from "@/lib/format";
import { Ban, CheckCircle2, Paperclip, ScrollText } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/sgcab/cobrancas")({
  head: () => ({ meta: [{ title: "Cobranças SGCAB — Gestão Maçônica" }] }),
  component: CobrancasSgcabPage,
});

const ANO_ATUAL = new Date().getFullYear();

const TIPO_LABEL: Record<SgcabCobranca["tipo"], string> = {
  sgcab: "SGCAB",
  ritual: "Ritual",
  diploma: "Diploma",
  taxa_propria: "Taxa própria",
};

const STATUS_LABEL: Record<SgcabCobranca["status"], string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_VARIANT: Record<SgcabCobranca["status"], "default" | "outline" | "secondary"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "secondary",
};

function CobrancasSgcabPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState<string>("todos");
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  // Padrão "pendente": é quem ainda deve, o que mais importa cobrar —
  // mesma lógica de "não pago" aplicada nas outras telas do sistema.
  const [status, setStatus] = useState<string>("pendente");
  const [irmaoId, setIrmaoId] = useState<string>("todos");

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const filtro = {
    orgId: orgId === "todos" ? null : orgId,
    ano: ano || null,
    status: status === "todos" ? null : (status as SgcabCobranca["status"]),
    irmaoId: irmaoId === "todos" ? null : irmaoId,
  };

  const { data: cobrancas = [] } = useQuery({
    queryKey: ["sgcab_cobrancas", filtro],
    queryFn: () => listarCobrancasSgcab({ data: filtro }),
  });
  // Totais Pendente/Pago precisam ignorar o filtro de status (senão, com
  // o padrão "pendente", o card "Pago" sempre mostraria R$ 0,00) — busca
  // à parte, com os mesmos filtros de corpo/ano/irmão mas sem status.
  const { data: cobrancasParaTotais = [] } = useQuery({
    queryKey: ["sgcab_cobrancas_totais", filtro.orgId, filtro.ano, filtro.irmaoId],
    queryFn: () =>
      listarCobrancasSgcab({
        data: { orgId: filtro.orgId, ano: filtro.ano, irmaoId: filtro.irmaoId, status: null },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sgcab_cobrancas"] });
    qc.invalidateQueries({ queryKey: ["sgcab_cobrancas_totais"] });
  };
  const ord = useOrdenacao(cobrancas, {
    irmao: (c) => c.irmao_nome,
    corpo: (c) => c.org_nome,
    grau: (c) => c.grau,
    tipo: (c) => TIPO_LABEL[c.tipo],
    valor: (c) => Number(c.valor),
    status: (c) => c.status,
    pagamento: (c) => c.data_pagamento,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  const totalPendente = cobrancasParaTotais
    .filter((c) => c.status === "pendente")
    .reduce((s, c) => s + Number(c.valor), 0);
  const totalPago = cobrancasParaTotais
    .filter((c) => c.status === "pago")
    .reduce((s, c) => s + Number(c.valor), 0);

  return (
    <>
      <PageHeader
        title="Cobranças SGCAB"
        description="Controle de cobrança por irmão das taxas de grau — repasse extracontábil, fora do fluxo de faturas/tesouraria."
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-5">
          <div>
            <Label>Corpo maçônico</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
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
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Irmão</Label>
            <Select value={irmaoId} onValueChange={setIrmaoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {irmaos.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.nome_civil}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <div>
              Pendente: <span className="font-medium">{brl(totalPendente)}</span>
            </div>
            <div>
              Pago: <span className="font-medium">{brl(totalPago)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        {cobrancas.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nenhuma cobrança encontrada com esses filtros." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="irmao" ord={ord}>
                  Irmão
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="corpo" ord={ord}>
                  Corpo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="grau" ord={ord}>
                  Grau
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ord}>
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor" ord={ord}>
                  Valor
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="status" ord={ord}>
                  Status
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="pagamento" ord={ord}>
                  Pagamento
                </TableHeadOrdenavel>
                {can.isTesoureiro && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensPagina.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.irmao_nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.org_nome}</TableCell>
                  <TableCell className="font-mono">
                    {c.grau}
                    {c.nome_grau ? ` — ${c.nome_grau}` : ""}
                  </TableCell>
                  <TableCell>{TIPO_LABEL[c.tipo]}</TableCell>
                  <TableCell>{brl(c.valor)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.data_pagamento ? fmtDate(c.data_pagamento) : "—"}
                    {c.comprovante_url && (
                      <a
                        href={c.comprovante_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1.5 inline-flex items-center text-primary"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </TableCell>
                  {can.isTesoureiro && (
                    <TableCell className="text-right">
                      {c.status === "pendente" && (
                        <RegistrarPagamentoDialog cobranca={c} onDone={invalidate} />
                      )}
                      {c.status === "pendente" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Ban className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancelar esta cobrança?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Marca a cobrança de {brl(c.valor)} como cancelada. Pode ser
                                revertido depois registrando o pagamento normalmente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Voltar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    await registrarPagamentoSgcab({
                                      data: {
                                        id: c.id,
                                        status: "cancelado",
                                        dataPagamento: null,
                                        comprovanteUrl: null,
                                        observacoes: c.observacoes,
                                      },
                                    });
                                    invalidate();
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error ? err.message : "Erro ao cancelar.",
                                    );
                                  }
                                }}
                              >
                                Cancelar cobrança
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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

function RegistrarPagamentoDialog({
  cobranca,
  onDone,
}: {
  cobranca: SgcabCobranca;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const enviarComprovante = async (file: File) => {
    setEnviando(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadComprovanteSgcab({
        data: { cobrancaId: cobranca.id, nomeArquivo: file.name, dataUrl },
      });
      setComprovanteUrl(url);
      toast.success("Comprovante anexado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar comprovante.");
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    setSalvando(true);
    try {
      await registrarPagamentoSgcab({
        data: {
          id: cobranca.id,
          status: "pago",
          dataPagamento,
          comprovanteUrl,
          observacoes: observacoes || null,
        },
      });
      toast.success("Pagamento registrado.");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar pagamento.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento — {TIPO_LABEL[cobranca.tipo]}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="text-sm text-muted-foreground">
            {cobranca.irmao_nome} · {brl(cobranca.valor)}
          </div>
          <div>
            <Label>Data do pagamento</Label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
          <div>
            <Label>Comprovante</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              disabled={enviando}
              onChange={(e) => e.target.files?.[0] && enviarComprovante(e.target.files[0])}
            />
            {comprovanteUrl && <p className="mt-1 text-xs text-emerald-600">Arquivo anexado.</p>}
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando || enviando}>
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
