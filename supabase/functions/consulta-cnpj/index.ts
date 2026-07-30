// Consulta de CNPJ com cache e rate-limit (issue #6).
//
// O sistema PHP legado (api.php, action=consulta_cnpj) fazia essa mesma
// consulta (BrasilAPI, com fallback ReceitaWS) direto do backend, mas sem
// cache nem limite de chamadas, e devolvia o payload bruto do provedor
// inteiro ao client. Esta função corrige as duas coisas: cacheia por CNPJ
// (30 dias) e limita a 10 consultas por usuário a cada 5 minutos, além de
// devolver só os campos normalizados que o formulário usa.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente com o token do usuário chamador, só para identificar quem é.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
  const userId = userData.user.id;

  // Cliente com service role para checar papel, cache e rate-limit,
  // ignorando RLS (essas tabelas não são acessíveis pelo client direto).
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roleNames = (roles ?? []).map((r: { role: string }) => r.role);
  const autorizado = roleNames.includes("admin") || roleNames.includes("tesoureiro");
  if (!autorizado) return json({ error: "Acesso negado" }, 403);

  const body = await req.json().catch(() => ({}));
  const cnpj = String(body?.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) return json({ error: "CNPJ inválido" }, 400);

  // Rate limit por usuário.
  const { data: limite } = await admin.from("cnpj_rate_limit").select("*").eq("user_id", userId).maybeSingle();
  const agora = Date.now();
  if (limite) {
    const janelaInicio = new Date(limite.janela_inicio).getTime();
    if (agora - janelaInicio < RATE_LIMIT_WINDOW_MS) {
      if (limite.tentativas >= RATE_LIMIT_MAX) {
        return json({ error: "Muitas consultas. Aguarde alguns minutos e tente novamente." }, 429);
      }
      await admin.from("cnpj_rate_limit").update({ tentativas: limite.tentativas + 1 }).eq("user_id", userId);
    } else {
      await admin.from("cnpj_rate_limit").update({ tentativas: 1, janela_inicio: new Date().toISOString() }).eq("user_id", userId);
    }
  } else {
    await admin.from("cnpj_rate_limit").insert({ user_id: userId, tentativas: 1 });
  }

  // Cache.
  const { data: cacheado } = await admin.from("cnpj_consultas_cache").select("*").eq("cnpj", cnpj).maybeSingle();
  if (cacheado && agora - new Date(cacheado.consultado_em).getTime() < CACHE_TTL_MS) {
    return json({ ok: true, data: cacheado.dados, cache: true });
  }

  const urls = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
  ];
  let ultimoErro = "";
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "FraternityLedger/1.0" },
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) { ultimoErro = `HTTP ${resp.status}`; continue; }
      const j = await resp.json();
      const nome = j.razao_social ?? j.nome ?? j.fantasia ?? "";
      if (!nome) { ultimoErro = j.message ?? j.status ?? "CNPJ não localizado"; continue; }

      const dados = {
        nome,
        fantasia: j.nome_fantasia ?? j.fantasia ?? "",
        contato: [j.ddd_telefone_1, j.telefone].filter(Boolean).join(" ").trim(),
        categoria: j.cnae_fiscal_descricao ?? j.atividade_principal?.[0]?.text ?? "",
        logradouro: j.logradouro ?? "",
        numero: j.numero ?? "",
        bairro: j.bairro ?? "",
        municipio: j.municipio ?? j.cidade ?? "",
        uf: j.uf ?? "",
        cep: j.cep ?? "",
      };

      await admin.from("cnpj_consultas_cache").upsert({ cnpj, dados, consultado_em: new Date().toISOString() });
      return json({ ok: true, data: dados, cache: false });
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
    }
  }

  return json({ ok: false, error: `Não foi possível consultar o CNPJ${ultimoErro ? `: ${ultimoErro}` : ""}` }, 502);
});
