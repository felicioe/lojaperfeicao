import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brl, fmtDate, fmtMesAno } from "@/lib/format";
import { gerarPixCopiaCola } from "@/lib/pix";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { LancamentoDetalhe } from "@/lib/backend/tesouraria-lancamentos";
import { CabecalhoInstitucional } from "@/components/app/CabecalhoInstitucional";
import { obterLojaAtual } from "@/lib/backend/loja-atual";

// Card imprimível de uma fatura (com QR Pix/boleto) — compartilhado entre a
// tela administrativa (/tesouraria/faturas/$id) e o Meu Painel do irmão
// (/painel/faturas/$id), que reutilizam o mesmo `obterLancamento` (acesso
// "privilegiado ou próprio").

function usePixQrCode(copiaCola: string | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!copiaCola) {
      setDataUrl(null);
      return;
    }
    let cancelado = false;
    QRCode.toDataURL(copiaCola, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelado) setDataUrl(url);
      })
      .catch((erro) => {
        console.error("Erro ao gerar QR code:", erro);
        if (!cancelado) setDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [copiaCola]);

  return dataUrl;
}

export function FaturaCard({ fatura }: { fatura: LancamentoDetalhe }) {
  const { data: loja } = useQuery({
    queryKey: ["loja_atual"],
    queryFn: () => obterLojaAtual(),
  });
  const copiaCola =
    fatura.pix_copia_cola ||
    (fatura.forma_cobranca && fatura.pix_chave && fatura.pix_nome_beneficiario && fatura.pix_cidade
      ? gerarPixCopiaCola({
          chave: fatura.pix_chave,
          nomeBeneficiario: fatura.pix_nome_beneficiario,
          cidade: fatura.pix_cidade,
          valor: Number(fatura.valor) - Number(fatura.valor_pago),
          txid: fatura.id.replace(/-/g, "").slice(0, 25),
        })
      : null);
  const qrGerado = usePixQrCode(copiaCola);
  // fatura.pix_qr_code_url pode ser um resquício de upload anterior à
  // migração 0108 (era gravado como caminho em disco, public/uploads/, que
  // não sobrevive a um novo deploy da Hostinger) — nesse caso o valor no
  // banco não é vazio, então o fallback por "||" nunca entrava em ação, e a
  // imagem ficava quebrada pra sempre. onError troca pro QR gerado no
  // cliente a partir do Copia e Cola, que sempre funciona.
  const [qrArmazenadoFalhou, setQrArmazenadoFalhou] = useState(false);
  const qrDataUrl = (!qrArmazenadoFalhou && fatura.pix_qr_code_url) || qrGerado;

  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  const copiar = async () => {
    if (!copiaCola) return;
    await navigator.clipboard.writeText(copiaCola);
    toast.success("Código Pix copiado.");
  };

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden print:border-none print:shadow-none">
      <div className="bg-primary px-8 py-1.5 text-center text-xs font-medium text-primary-foreground print:bg-primary">
        {fatura.pago
          ? "Fatura quitada"
          : "Documento gerado eletronicamente pelo sistema — pagamento exclusivo via Pix"}
      </div>
      <CardContent className="space-y-6 p-8">
        <CabecalhoInstitucional compacto />

        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Fatura da Associação</h2>
            <p className="text-sm text-muted-foreground">Documento para pagamento</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (fatura.pago
                  ? "bg-success-muted text-success-foreground"
                  : "bg-warning-muted text-warning-foreground")
              }
            >
              {fatura.pago ? "Pago" : fatura.valor_pago > 0 ? "Parcial" : "Em aberto"}
            </span>
            <span className="text-xs text-muted-foreground">Emitida em {hoje}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Favorecido
            </div>
            <div className="font-medium">
              {(loja?.razaoSocial || loja?.nome || "").toUpperCase()}
            </div>
            {loja?.cnpj && <div className="text-xs text-muted-foreground">CNPJ {loja.cnpj}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pagador
            </div>
            <div className="font-medium">{fatura.irmao_nome ?? "—"}</div>
            {fatura.irmao_cim && (
              <div className="text-xs text-muted-foreground">CIM {fatura.irmao_cim}</div>
            )}
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Referente a
          </div>
          <div className="font-medium">{fatura.descricao}</div>
          {fatura.competencia_mes && (
            <div className="text-xs text-muted-foreground">
              Competência {fmtMesAno(fatura.competencia_mes)} · Emissão {fmtDate(fatura.data)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x rounded-md border bg-muted/40">
          <div className="p-3">
            <div className="text-xs text-muted-foreground">Vencimento</div>
            <div className="font-semibold">
              {fatura.data_vencimento ? fmtDate(fatura.data_vencimento) : "—"}
            </div>
          </div>
          <div className="p-3">
            <div className="text-xs text-muted-foreground">
              {fatura.valor_pago > 0 && !fatura.pago ? "Saldo restante" : "Valor"}
            </div>
            <div className="text-lg font-semibold">
              {brl(Number(fatura.valor) - Number(fatura.valor_pago))}
            </div>
            {fatura.valor_pago > 0 && !fatura.pago && (
              <div className="text-xs text-muted-foreground">
                {brl(fatura.valor_pago)} já pago de {brl(fatura.valor)}
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="text-xs text-muted-foreground">
              {fatura.pago ? "Pago em" : "Forma de pagamento"}
            </div>
            <div className="font-semibold">
              {fatura.pago ? (fatura.data_pagamento ? fmtDate(fatura.data_pagamento) : "—") : "PIX"}
            </div>
          </div>
        </div>

        {!fatura.pago && qrDataUrl && (
          <>
            <div className="overflow-hidden rounded-md border">
              <div className="flex flex-col items-center gap-4 bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2 text-center sm:text-left">
                  <div className="text-sm font-semibold">Pague com Pix</div>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Abra o app do seu banco, escaneie o QR Code ou copie o código Pix Copia e Cola
                    abaixo.
                  </p>
                  {fatura.pix_chave && (
                    <div className="text-xs">
                      <span className="font-semibold">Chave PIX:</span> {fatura.pix_chave}
                    </div>
                  )}
                  <div className="text-xs">
                    <span className="font-semibold">Favorecido:</span>{" "}
                    {fatura.pix_nome_beneficiario || loja?.razaoSocial || loja?.nome}
                  </div>
                  <div className="text-xs font-semibold">PIX Copia e Cola</div>
                  <div className="flex w-full max-w-xs items-start gap-2 sm:max-w-none">
                    <code
                      tabIndex={0}
                      aria-label="Código PIX Copia e Cola completo"
                      className="min-w-0 flex-1 select-all whitespace-normal break-all rounded border bg-background px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-xs print:border-foreground print:text-[9px]"
                    >
                      {copiaCola}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copiar}
                      className="shrink-0 print:hidden"
                      aria-label="Copiar código PIX completo"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="QR code Pix"
                    className="h-36 w-36 rounded border bg-white p-1.5"
                    onError={() => setQrArmazenadoFalhou(true)}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
