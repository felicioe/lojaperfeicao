import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { comPapel } from "./authz";

// Helper compartilhado de exportação/e-mail de relatórios (issue #111).
// Papéis fixos em admin/tesoureiro por enquanto — todos os relatórios que
// vão consumir isto (issues #112-#115) são da Tesouraria; se um relatório
// fora desse escopo precisar do mesmo helper no futuro, isto vira um
// parâmetro em vez de constante.
const PAPEIS = ["admin", "tesoureiro"];

const colunaSchema = z.object({ chave: z.string(), titulo: z.string() });
const linhaSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

const baseSchema = z.object({
  formato: z.enum(["xlsx", "pdf", "csv", "txt"]),
  titulo: z.string().min(1).max(100),
  colunas: z.array(colunaSchema).min(1),
  linhas: z.array(linhaSchema),
});

export const gerarArquivoRelatorio = createServerFn({ method: "POST" })
  .validator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }): Promise<{ base64: string; nomeArquivo: string; mimeType: string }> => {
    return comPapel(PAPEIS, async () => {
      const { gerarArquivo, mimeTypePara, extensaoPara } = await import("../relatorio-export");
      const buffer = await gerarArquivo(data.formato, data.titulo, data.colunas, data.linhas);
      return {
        base64: buffer.toString("base64"),
        nomeArquivo: `${data.titulo}.${extensaoPara(data.formato)}`,
        mimeType: mimeTypePara(data.formato),
      };
    });
  });

const enviarSchema = baseSchema.extend({
  destinatarios: z.array(z.string().email()).min(1).max(10),
});

export const enviarRelatorioPorEmail = createServerFn({ method: "POST" })
  .validator((d: unknown) => enviarSchema.parse(d))
  // O tipo está repetido aqui em vez de importado de email-dispatch de
  // propósito: este arquivo é alcançável pelo cliente, e importar de lá
  // arrastaria o nodemailer (e o pool MySQL) para o bundle do navegador.
  // `erro` acompanha o resultado para a tela poder dizer POR QUE falhou.
  .handler(
    async ({ data }): Promise<{ destinatario: string; sucesso: boolean; erro?: string }[]> => {
      return comPapel(PAPEIS, async (_conn, _usuarioId, lojaId) => {
        const { gerarArquivo, mimeTypePara, extensaoPara } = await import("../relatorio-export");
        const { enviarArquivoPorEmail } = await import("../email-dispatch");
        const buffer = await gerarArquivo(data.formato, data.titulo, data.colunas, data.linhas);
        return enviarArquivoPorEmail({
          lojaId,
          destinatarios: data.destinatarios,
          assunto: `Relatório: ${data.titulo}`,
          corpoTexto: `Segue em anexo o relatório "${data.titulo}".`,
          anexoBuffer: buffer,
          anexoNome: `${data.titulo}.${extensaoPara(data.formato)}`,
          anexoMimeType: mimeTypePara(data.formato),
        });
      });
    },
  );
