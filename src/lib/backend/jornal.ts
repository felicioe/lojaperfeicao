import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import { comPapelEditorialCms } from "./cms-editorial-authz";

// Edição em formato "jornalzinho" (issue #665) — agrupa 2+ notícias já
// publicadas num único envio (e-mail) + página pública, reaproveitando a
// infraestrutura de e-mail avulso por notícia (#663). Módulo próprio (não
// dentro de noticias.ts) porque lida com um recurso diferente
// (edicoes_jornal), embora leia notícias pra montar o conteúdo.

const jornalSchema = z.object({
  titulo: z.string().min(1).max(200),
  // Mínimo 2: a própria issue #665 define o gatilho da tela como "mais de 2
  // selecionadas", mas o mínimo técnico pra fazer sentido como "jornal"
  // (manchete + pelo menos uma secundária) é 2.
  noticiaIds: z.array(z.string().uuid()).min(2),
  mancheteId: z.string().uuid(),
});

type NoticiaParaJornal = {
  id: string;
  titulo: string;
  resumo: string | null;
  imagem_capa_url: string | null;
};

type JornalMontado = {
  assunto: string;
  html: string;
  texto: string;
  anexos: { filename: string; content: Buffer; contentType: string; cid?: string }[];
};

function origemPublica(): string {
  return process.env.PUBLIC_ORIGIN || "http://localhost:5173";
}

/** Monta o HTML/texto da edição a partir das notícias selecionadas — manchete
 * em destaque (imagem grande + resumo + link), demais em formato lista (foto
 * pequena + título + resumo), logos institucionais no topo e no rodapé
 * (mesmo layout aprovado no modelo visual da issue #665).
 *
 * modo "previa": imagens como data: URL direto — é o que fica GRAVADO em
 * edicoes_jornal.html (vira também a página pública, que não tem anexo cid
 * nenhum, só um <img src> normal). modo "envio": imagens viram anexo `cid`
 * — só usado no momento de mandar o e-mail, nunca persistido. */
async function montarJornal(
  conn: PoolConnection,
  lojaId: string,
  titulo: string,
  noticiaIds: string[],
  mancheteId: string,
  modo: "previa" | "envio",
): Promise<JornalMontado | null> {
  if (!noticiaIds.includes(mancheteId)) return null;

  const placeholders = noticiaIds.map(() => "?").join(",");
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, titulo, resumo, imagem_capa_url FROM noticias
     WHERE loja_id = ? AND status = 'publicado' AND id IN (${placeholders})`,
    [lojaId, ...noticiaIds],
  );
  if (rows.length !== noticiaIds.length) return null;

  const porId = new Map<string, NoticiaParaJornal>(
    rows.map((r) => [
      r.id as string,
      {
        id: r.id as string,
        titulo: r.titulo as string,
        resumo: r.resumo as string | null,
        imagem_capa_url: r.imagem_capa_url as string | null,
      },
    ]),
  );
  const manchete = porId.get(mancheteId);
  if (!manchete) return null;
  const secundarias = noticiaIds.filter((id) => id !== mancheteId).map((id) => porId.get(id)!);

  const { obterLogosInstitucionais } = await import("./orgs");
  const { logoImgTag, escapeHtml, prepararImagemEmail } = await import("../email-dispatch");
  const logos = await obterLogosInstitucionais(conn);

  const anexos: JornalMontado["anexos"] = [];
  const linkNoticia = (id: string) => `${origemPublica()}/noticias/${id}`;

  const imgManchete = prepararImagemEmail(manchete.imagem_capa_url, "manchete", modo);
  if (imgManchete.anexo) anexos.push(imgManchete.anexo);
  const tituloManchete = escapeHtml(manchete.titulo);
  const resumoManchete = manchete.resumo ? escapeHtml(manchete.resumo) : null;

  const blocoManchete = `
    <tr><td style="padding:16px 0;">
      ${imgManchete.src ? `<img src="${imgManchete.src}" alt="" width="600" style="width:100%;max-width:600px;border-radius:8px;display:block;margin-bottom:12px;" />` : ""}
      <h1 style="font-family:Georgia,'Times New Roman',serif;margin:0 0 8px 0;font-size:24px;color:#0f2a52;">${tituloManchete}</h1>
      ${resumoManchete ? `<p style="color:#4b5563;margin:0 0 8px 0;">${resumoManchete}</p>` : ""}
      <a href="${linkNoticia(manchete.id)}" style="color:#a3822f;font-weight:bold;">Leia a matéria completa »</a>
    </td></tr>`;

  const blocosSecundarios = secundarias
    .map((n, i) => {
      const cid = `secundaria-${i}`;
      const img = prepararImagemEmail(n.imagem_capa_url, cid, modo);
      if (img.anexo) anexos.push(img.anexo);
      const tituloN = escapeHtml(n.titulo);
      const resumoN = n.resumo ? escapeHtml(n.resumo) : null;
      return `
    <tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${img.src ? `<td width="80" valign="top" style="padding-right:12px;"><img src="${img.src}" alt="" width="80" style="width:80px;height:80px;object-fit:cover;border-radius:6px;display:block;" /></td>` : ""}
        <td valign="top">
          <h3 style="font-family:Georgia,'Times New Roman',serif;margin:0 0 4px 0;font-size:16px;color:#0f2a52;">${tituloN}</h3>
          ${resumoN ? `<p style="color:#4b5563;margin:0 0 4px 0;font-size:14px;">${resumoN}</p>` : ""}
          <a href="${linkNoticia(n.id)}" style="color:#a3822f;font-size:14px;">Leia mais »</a>
        </td>
      </tr></table>
    </td></tr>`;
    })
    .join("");

  const tituloEdicaoEscapado = escapeHtml(titulo);
  const faixaLogos = `
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left">${logoImgTag(logos[0])}</td>
      <td align="right">${logoImgTag(logos[1])}</td>
    </tr></table>`;

  // Layout em <table> (não flexbox/grid): mesmo motivo de montarEmailNoticia
  // — é o subconjunto de HTML/CSS com suporte confiável em Outlook desktop.
  const html = `
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#fdfaf3;">
    <tr><td style="padding:16px;border-bottom:3px solid #0f2a52;">
      ${faixaLogos}
      <h2 style="text-align:center;font-family:Georgia,'Times New Roman',serif;margin:12px 0 0 0;font-size:22px;color:#0f2a52;">${tituloEdicaoEscapado}</h2>
    </td></tr>
    <tr><td style="padding:0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${blocoManchete}
        ${blocosSecundarios}
      </table>
    </td></tr>
    <tr><td style="padding:16px;border-top:3px solid #0f2a52;">
      ${faixaLogos}
    </td></tr>
  </table>`;

  const texto =
    `${titulo}\n\n${manchete.titulo}\n${manchete.resumo ?? ""}\n${linkNoticia(manchete.id)}\n\n` +
    secundarias.map((n) => `${n.titulo}\n${n.resumo ?? ""}\n${linkNoticia(n.id)}`).join("\n\n");

  return { assunto: titulo, html, texto, anexos };
}

/** Prévia sem efeito colateral — mesmo papel de obterPreviaEmailNoticia
 * (#663): revisar antes de publicar/enviar. Não grava edição, não envia
 * nada. */
export const obterPreviaJornal = createServerFn({ method: "GET" })
  .validator((d: unknown) => jornalSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, _usuarioId, lojaId) => {
      const montado = await montarJornal(
        conn,
        lojaId,
        data.titulo,
        data.noticiaIds,
        data.mancheteId,
        "previa",
      );
      if (!montado) {
        throw new Error(
          "Alguma notícia selecionada não existe, não está publicada, ou a manchete não está entre as selecionadas.",
        );
      }
      return { assunto: montado.assunto, html: montado.html };
    });
  });

/** Publica a edição (grava edicoes_jornal com snapshot do HTML — reaproveitado
 * pela página pública) e, na sequência, envia por e-mail a todos os Irmãos
 * ativos com e-mail cadastrado. As duas coisas acontecem juntas: não faz
 * sentido publicar uma edição sem avisar ninguém, nem mandar e-mail de uma
 * edição que não existe em lugar nenhum pra reler depois. */
export const publicarEEnviarJornal = createServerFn({ method: "POST" })
  .validator((d: unknown) => jornalSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioId, lojaId) => {
      const web = await montarJornal(
        conn,
        lojaId,
        data.titulo,
        data.noticiaIds,
        data.mancheteId,
        "previa",
      );
      if (!web) {
        throw new Error(
          "Alguma notícia selecionada não existe, não está publicada, ou a manchete não está entre as selecionadas.",
        );
      }

      const [[proximoRow]] = await conn.query<RowDataPacket[]>(
        "SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM edicoes_jornal WHERE loja_id = ?",
        [lojaId],
      );
      const numero = Number(proximoRow.proximo);
      const id = randomUUID();
      await conn.query(
        `INSERT INTO edicoes_jornal (id, loja_id, numero, titulo, manchete_noticia_id, noticias_ids_json, html, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          lojaId,
          numero,
          data.titulo,
          data.mancheteId,
          JSON.stringify(data.noticiaIds),
          web.html,
          usuarioId,
        ],
      );
      await registrarAuditoria(conn, usuarioId, "publicar", "edicao_jornal", id, null, {
        numero,
        titulo: data.titulo,
        noticias: data.noticiaIds.length,
      });

      const envio = await montarJornal(
        conn,
        lojaId,
        data.titulo,
        data.noticiaIds,
        data.mancheteId,
        "envio",
      );
      const { enviarNewsletterGenerica } = await import("../email-dispatch");
      const resultado = envio
        ? await enviarNewsletterGenerica(conn, {
            lojaId,
            tipo: "edicao_jornal",
            chave: `edicao_jornal:${id}`,
            assunto: envio.assunto,
            html: envio.html,
            texto: envio.texto,
            anexos: envio.anexos,
          })
        : [];

      return { numero, resultado };
    });
  });
