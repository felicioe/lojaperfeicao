import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brl, fmtDate, fmtMesAno } from "@/lib/format";
import { gerarPixCopiaCola } from "@/lib/pix";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { LancamentoDetalhe } from "@/lib/backend/tesouraria-lancamentos";
import { CabecalhoInstitucional } from "@/components/app/CabecalhoInstitucional";

// Impressão agrupada de 2+ faturas do mesmo irmão numa única página (issue
// #318) — mesmo modelo do FaturaCard (single), mas com uma linha por fatura
// e um único Pix/QR pro total somado.

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

export function FaturaAgrupadaCard({ faturas }: { faturas: LancamentoDetalhe[] }) {
  const primeira = faturas[0];
  const totalSaldo = faturas.reduce((s, f) => s + (Number(f.valor) - Number(f.valor_pago)), 0);

  const copiaCola =
    primeira.pix_copia_cola ||
    (primeira.forma_cobranca &&
    primeira.pix_chave &&
    primeira.pix_nome_beneficiario &&
    primeira.pix_cidade
      ? gerarPixCopiaCola({
          chave: primeira.pix_chave,
          nomeBeneficiario: primeira.pix_nome_beneficiario,
          cidade: primeira.pix_cidade,
          valor: totalSaldo,
          txid: `G${primeira.id.replace(/-/g, "")}`.slice(0, 25),
        })
      : null);
  const qrGerado = usePixQrCode(copiaCola);
  const qrDataUrl = qrGerado;

  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  const copiar = async () => {
    if (!copiaCola) return;
    await navigator.clipboard.writeText(copiaCola);
    toast.success("Código Pix copiado.");
  };

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden print:border-none print:shadow-none">
      <div className="bg-primary px-8 py-1.5 text-center text-xs font-medium text-primary-foreground print:bg-primary">
        Documento gerado eletronicamente pelo sistema — pagamento exclusivo via Pix
      </div>
      <CardContent className="space-y-6 p-8">
        <CabecalhoInstitucional compacto />

        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Fatura da Associação</h2>
            <p className="text-sm text-muted-foreground">
              {faturas.length} faturas agrupadas — documento para pagamento
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Emitida em {hoje}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Favorecido
            </div>
            <div className="font-medium">ASSOCIACAO CAPITULAR ADONHIRAMITA AO VALE DE ITAJAI</div>
            <div className="text-xs text-muted-foreground">CNPJ 26.649.083/0001-38</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pagador
            </div>
            <div className="font-medium">{primeira.irmao_nome ?? "—"}</div>
            {primeira.irmao_cim && (
              <div className="text-xs text-muted-foreground">CIM {primeira.irmao_cim}</div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Itens agrupados
          </div>
          <div className="divide-y rounded-md border text-sm">
            {faturas.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <div>
                  <div className="font-medium">{f.descricao}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.competencia_mes && `Competência ${fmtMesAno(f.competencia_mes)} · `}
                    Vencimento {f.data_vencimento ? fmtDate(f.data_vencimento) : "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right font-medium">
                  {brl(Number(f.valor) - Number(f.valor_pago))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
          <div className="text-sm font-medium">Total a pagar</div>
          <div className="text-lg font-semibold">{brl(totalSaldo)}</div>
        </div>

        {qrDataUrl && (
          <div className="overflow-hidden rounded-md border">
            <div className="flex flex-col items-center gap-4 bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-center sm:text-left">
                <div className="text-sm font-semibold">Pague com Pix</div>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Abra o app do seu banco, escaneie o QR Code ou copie o código Pix Copia e Cola
                  abaixo. Um único pagamento quita todas as faturas listadas.
                </p>
                {primeira.pix_chave && (
                  <div className="text-xs">
                    <span className="font-semibold">Chave PIX:</span> {primeira.pix_chave}
                  </div>
                )}
                <div className="text-xs">
                  <span className="font-semibold">Favorecido:</span> ASSOCIACAO CAPITULAR
                  ADONHIRAMITA AO VALE DE ITAJAI
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
              <img
                src={qrDataUrl}
                alt="QR code Pix"
                className="h-36 w-36 rounded border bg-white p-1.5"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
