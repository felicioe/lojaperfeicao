import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { obterLancamento } from "@/lib/backend/tesouraria-lancamentos";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";
import { gerarPixCopiaCola } from "@/lib/pix";
import { FileWarning, Printer, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tesouraria/faturas/$id")({
  head: () => ({ meta: [{ title: "Fatura — Gestão Maçônica" }] }),
  component: FaturaDetalhe,
});

function usePixQrCode(copiaCola: string | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!copiaCola) {
      setDataUrl(null);
      return;
    }
    let cancelado = false;
    QRCode.toDataURL(copiaCola, { margin: 1, width: 220 })
      .then((url) => !cancelado && setDataUrl(url))
      .catch(() => !cancelado && setDataUrl(null));
    return () => {
      cancelado = true;
    };
  }, [copiaCola]);
  return dataUrl;
}

function FaturaDetalhe() {
  const { id } = useParams({ from: "/_authenticated/tesouraria/faturas/$id" });
  const { data: fatura, isLoading } = useQuery({
    queryKey: ["fatura", id],
    queryFn: () => obterLancamento({ data: { id } }),
  });

  const copiaCola =
    fatura?.forma_cobranca && fatura.pix_chave && fatura.pix_nome_beneficiario && fatura.pix_cidade
      ? gerarPixCopiaCola({
          chave: fatura.pix_chave,
          nomeBeneficiario: fatura.pix_nome_beneficiario,
          cidade: fatura.pix_cidade,
          valor: Number(fatura.valor),
          txid: fatura.id.replace(/-/g, "").slice(0, 25),
        })
      : null;
  const qrDataUrl = usePixQrCode(copiaCola);

  if (isLoading) return null;

  if (!fatura) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={FileWarning} title="Fatura não encontrada" />
        </CardContent>
      </Card>
    );
  }

  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());

  const copiar = async () => {
    if (!copiaCola) return;
    await navigator.clipboard.writeText(copiaCola);
    toast.success("Código Pix copiado.");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Fatura" />
      <div className="print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF
        </Button>
      </div>
      <Card className="mx-auto max-w-2xl print:border-none print:shadow-none">
        <CardContent className="space-y-6 p-8">
          <div className="flex items-start justify-between gap-4 border-b pb-4">
            <div className="flex items-center gap-3">
              {fatura.org_logo_url && (
                <img
                  src={fatura.org_logo_url}
                  alt={fatura.org_nome ?? "Logo"}
                  className="h-14 w-14 object-contain"
                />
              )}
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Fatura de mensalidade</h2>
                {fatura.org_nome && (
                  <p className="text-sm text-muted-foreground">{fatura.org_nome}</p>
                )}
                <p className="text-xs text-muted-foreground">Emitida em {hoje}</p>
              </div>
            </div>
            <span
              className={
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium " +
                (fatura.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")
              }
            >
              {fatura.pago ? "Pago" : "Em aberto"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Irmão</div>
              <div className="font-medium">{fatura.irmao_nome ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">CIM</div>
              <div className="font-medium">{fatura.irmao_cim ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Descrição</div>
              <div className="font-medium">{fatura.descricao}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Competência</div>
              <div className="font-medium">
                {fatura.competencia_mes ? fmtDate(fatura.competencia_mes) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Data de emissão</div>
              <div className="font-medium">{fmtDate(fatura.data)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Vencimento</div>
              <div className="font-medium">
                {fatura.data_vencimento ? fmtDate(fatura.data_vencimento) : "—"}
              </div>
            </div>
            {fatura.pago && (
              <div>
                <div className="text-muted-foreground">Data de pagamento</div>
                <div className="font-medium">
                  {fatura.data_pagamento ? fmtDate(fatura.data_pagamento) : "—"}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Valor total</span>
            <span className="text-2xl font-semibold">{brl(fatura.valor)}</span>
          </div>

          {!fatura.pago && fatura.forma_cobranca === "pix" && qrDataUrl && (
            <div className="flex flex-col items-center gap-3 border-t pt-6 text-center">
              <div className="text-sm font-medium">Pague com Pix</div>
              <img src={qrDataUrl} alt="QR code Pix" className="h-44 w-44" />
              <div className="flex w-full max-w-sm items-center gap-2">
                <input
                  readOnly
                  value={copiaCola ?? ""}
                  className="flex-1 truncate rounded border bg-muted/40 px-2 py-1.5 text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button size="sm" variant="outline" onClick={copiar} className="print:hidden">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {!fatura.pago && fatura.forma_cobranca === "boleto" && qrDataUrl && (
            <div className="border-t pt-6">
              <div className="rounded-md border">
                <div className="flex items-center justify-between bg-foreground px-4 py-2 text-background">
                  <span className="font-serif text-lg font-bold tracking-tight">
                    {fatura.org_nome ?? "Fatura"}
                  </span>
                  <span className="text-xs">Documento não é um boleto bancário registrado</span>
                </div>
                <div className="grid grid-cols-3 divide-x border-b text-xs">
                  <div className="p-3">
                    <div className="text-muted-foreground">Beneficiário</div>
                    <div className="font-medium">{fatura.org_nome ?? "—"}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-muted-foreground">Pagador</div>
                    <div className="font-medium">{fatura.irmao_nome ?? "—"}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-muted-foreground">Vencimento</div>
                    <div className="font-medium">
                      {fatura.data_vencimento ? fmtDate(fatura.data_vencimento) : "—"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x border-b text-xs">
                  <div className="p-3">
                    <div className="text-muted-foreground">Nosso número</div>
                    <div className="font-mono font-medium">
                      {fatura.id.replace(/-/g, "").slice(0, 12).toUpperCase()}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-muted-foreground">Descrição</div>
                    <div className="font-medium">{fatura.descricao}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-muted-foreground">Valor do documento</div>
                    <div className="font-medium">{brl(fatura.valor)}</div>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3 p-4">
                  <div className="text-xs text-muted-foreground">
                    Código de barras substituído pelo QR Code Pix abaixo — escaneie no app do seu
                    banco pra pagar.
                  </div>
                  <img src={qrDataUrl} alt="QR code Pix" className="h-40 w-40" />
                  <div className="flex w-full max-w-sm items-center gap-2">
                    <input
                      readOnly
                      value={copiaCola ?? ""}
                      className="flex-1 truncate rounded border bg-muted/40 px-2 py-1.5 text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button size="sm" variant="outline" onClick={copiar} className="print:hidden">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
