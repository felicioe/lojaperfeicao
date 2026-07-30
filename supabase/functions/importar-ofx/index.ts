// Importação de extrato bancário OFX — issue #13.
//
// O sistema PHP legado (parseOFXImport/_readOFXFile) fazia essa mesma
// coisa no client: parser SGML manual + detecção de encoding (extratos de
// banco brasileiro costumam vir em Windows-1252, e quando um navegador
// lê como UTF-8 aparece mojibake nos acentos) + chave de deduplicação
// composta para reimportação idempotente. Portamos a mesma estratégia
// aqui, mas do lado do servidor.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

// Conta caracteres de substituição (U+FFFD) e outros sinais de encoding
// errado para decidir entre UTF-8 e Windows-1252.
function pontuarDecodificacao(texto: string): number {
  let pontos = 0;
  for (const ch of texto) {
    if (ch === "�") pontos += 10;
    const code = ch.codePointAt(0)!;
    if (code >= 0x80 && code <= 0x9f) pontos += 5; // faixa de controle C1 — quase sempre indica decodificação errada
  }
  return pontos;
}

function decodificarMelhorEsforco(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const win1252 = new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  return pontuarDecodificacao(utf8) <= pontuarDecodificacao(win1252) ? utf8 : win1252;
}

function extrairCampo(bloco: string, tag: string): string {
  // OFX/SGML frequentemente omite a tag de fechamento em elementos-folha
  // (ex.: <TRNAMT>100.00 sem </TRNAMT>), terminando na próxima tag ou
  // quebra de linha.
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : "";
}

function normalizarData(ofxDate: string): string | null {
  // OFX usa YYYYMMDD[HHMMSS][.sss][fuso]
  const m = ofxDate.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roleNames = (roles ?? []).map((r: { role: string }) => r.role);
  if (!roleNames.includes("admin") && !roleNames.includes("tesoureiro")) return json({ error: "Acesso negado" }, 403);

  const body = await req.json().catch(() => ({}));
  const contaFinanceiraId = body?.conta_financeira_id as string | undefined;
  const arquivoBase64 = body?.arquivo_base64 as string | undefined;
  if (!contaFinanceiraId || !arquivoBase64) return json({ error: "conta_financeira_id e arquivo_base64 são obrigatórios" }, 400);

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(arquivoBase64), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: "arquivo_base64 inválido" }, 400);
  }

  const conteudo = decodificarMelhorEsforco(bytes);
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>)/gi) ?? [];

  let novos = 0;
  let jaImportados = 0;
  const erros: string[] = [];

  for (const bloco of blocos) {
    const trnamt = extrairCampo(bloco, "TRNAMT");
    const dtposted = extrairCampo(bloco, "DTPOSTED");
    const fitid = extrairCampo(bloco, "FITID");
    const trntype = extrairCampo(bloco, "TRNTYPE");
    const nome = extrairCampo(bloco, "NAME") || extrairCampo(bloco, "PAYEE");
    const memo = extrairCampo(bloco, "MEMO");
    const descricao = [nome, memo].filter(Boolean).join(" - ") || "Lançamento importado";

    const valor = parseFloat(trnamt);
    const data = normalizarData(dtposted);
    if (isNaN(valor) || !data) { erros.push(`Linha com dados inválidos (valor="${trnamt}", data="${dtposted}")`); continue; }

    const chaveDedupe = [fitid || "", data, valor.toFixed(2), trntype, normalizarTexto(descricao)].join("|");

    const { error, count } = await admin
      .from("ofx_lancamentos")
      .upsert(
        { conta_financeira_id: contaFinanceiraId, fitid: fitid || null, data, valor, tipo_ofx: trntype || null, descricao, chave_dedupe: chaveDedupe, importado_por: userId },
        { onConflict: "conta_financeira_id,chave_dedupe", ignoreDuplicates: true, count: "exact" },
      );
    if (error) { erros.push(error.message); continue; }
    if (count && count > 0) novos++; else jaImportados++;
  }

  return json({ ok: true, total: blocos.length, novos, ja_importados: jaImportados, erros });
});
