import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { comSuperAdmin } from "./authz";
import { registrarAuditoriaPlataforma } from "./auditoria";
import { SQL_SITUACAO_CONVITE, type ConviteResumo, type SituacaoConvite } from "./saas-convites";
import { filtrarRotasValidas } from "../menu-catalogo";

// Administração do SaaS em si (issue #339): o cadastro das lojas-cliente.
//
// Tudo aqui roda sob comSuperAdmin — fora do escopo de qualquer loja. É a
// única camada do backend que enxerga mais de uma loja ao mesmo tempo, e
// mesmo assim só metadado: nome, slug, se está ativa, quantos usuários tem.
// Nenhuma função deste arquivo lê dado interno de loja alguma (financeiro,
// irmãos, sessões) — sem impersonação nesta fase, decisão registrada na
// issue.

export type LojaResumo = {
  id: string;
  slug: string;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  ativa: boolean;
  criada_em: string;
  usuarios_ativos: number;
  administradores: number;
  ultimo_acesso: string | null;
  /** Convite mais recente do primeiro admin (issue #339, parte 2), ou null se
   * a Loja nunca recebeu um. É o que diz, na lista, se a Loja está esperando
   * alguém aceitar, se o link venceu ou se já tem dono. */
  convite: ConviteResumo | null;
  /** Rotas do menu ocultadas pra todos os usuários desta Loja (issue #456). */
  menu_itens_ocultos: string[];
};

export const listarLojas = createServerFn({ method: "GET" }).handler(
  async (): Promise<LojaResumo[]> =>
    comSuperAdmin(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.slug, l.nome, l.razao_social, l.cnpj, l.ativa, l.criada_em,
                l.menu_itens_ocultos_json,
                COALESCE(n.usuarios_ativos, 0) AS usuarios_ativos,
                COALESCE(n.administradores, 0) AS administradores,
                acesso.ultimo_acesso,
                c.id AS convite_id, c.email AS convite_email,
                c.nome_completo AS convite_nome, c.expira_em AS convite_expira_em,
                c.criado_em AS convite_criado_em, c.aceito_em AS convite_aceito_em,
                ${SQL_SITUACAO_CONVITE} AS convite_situacao
           FROM lojas l
           LEFT JOIN (
             SELECT u.loja_id,
                    COUNT(*) AS usuarios_ativos,
                    COUNT(p.usuario_id) AS administradores
               FROM usuarios u
               LEFT JOIN usuarios_papeis p ON p.usuario_id = u.id AND p.papel = 'admin'
              WHERE u.ativo = TRUE
              GROUP BY u.loja_id
           ) n ON n.loja_id = l.id
           LEFT JOIN (
             -- Último login de qualquer usuário da loja. A loja sai de
             -- usuarios.loja_id, e não de auditoria.loja_id, de propósito:
             -- a coluna da auditoria ainda carrega o DEFAULT de transição da
             -- migração 0092 (removido só na #350), então hoje ela diria
             -- "Adonhiram" para o login de qualquer loja. O dono do registro
             -- é confiável; o carimbo dele ainda não.
             SELECT u.loja_id, MAX(a.criado_em) AS ultimo_acesso
               FROM auditoria a
               JOIN usuarios u ON u.id = a.usuario_id
              WHERE a.acao = 'login'
              GROUP BY u.loja_id
           ) acesso ON acesso.loja_id = l.id
           -- Só o convite mais recente de cada Loja: os anteriores (revogados
           -- ao emitir um novo) são histórico, e quem administra a plataforma
           -- quer saber o estado de agora.
           LEFT JOIN loja_convites c ON c.id = (
             SELECT c2.id FROM loja_convites c2
              WHERE c2.loja_id = l.id
              ORDER BY c2.criado_em DESC, c2.id DESC
              LIMIT 1
           )
          ORDER BY l.nome`,
      );
      return rows.map((r) => ({
        id: r.id as string,
        slug: r.slug as string,
        nome: r.nome as string,
        razao_social: r.razao_social as string | null,
        cnpj: r.cnpj as string | null,
        ativa: !!r.ativa,
        criada_em: new Date(r.criada_em).toISOString(),
        menu_itens_ocultos: Array.isArray(r.menu_itens_ocultos_json)
          ? r.menu_itens_ocultos_json
          : JSON.parse(r.menu_itens_ocultos_json ?? "[]"),
        usuarios_ativos: Number(r.usuarios_ativos),
        administradores: Number(r.administradores),
        ultimo_acesso: r.ultimo_acesso ? new Date(r.ultimo_acesso).toISOString() : null,
        convite: r.convite_id
          ? {
              id: r.convite_id as string,
              email: r.convite_email as string,
              nome_completo: r.convite_nome as string,
              situacao: r.convite_situacao as SituacaoConvite,
              expira_em: new Date(r.convite_expira_em).toISOString(),
              criado_em: new Date(r.convite_criado_em).toISOString(),
              aceito_em: r.convite_aceito_em ? new Date(r.convite_aceito_em).toISOString() : null,
            }
          : null,
      }));
    }),
);

// O slug é o subdomínio de acesso (issue #338), então precisa ser um rótulo
// DNS válido: minúsculas, dígitos e hífen, sem hífen nas pontas, até 63
// caracteres. Validar aqui e não só no banco evita descobrir o problema
// meses depois, quando o DNS recusar o host.
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

// Nomes que não podem virar subdomínio de loja porque já são (ou virão a
// ser) endereços da própria plataforma. Reservar agora é barato; renomear
// uma loja depois que os usuários dela decoraram o endereço, não.
const SLUGS_RESERVADOS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "mail",
  "smtp",
  "webmail",
  "ftp",
  "cpanel",
  "painel",
  "suporte",
  "status",
  "static",
  "assets",
  "cdn",
]);

const lojaSchema = z.object({
  id: z.string().uuid().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "O endereço precisa de pelo menos 2 caracteres.")
    .max(63, "O endereço pode ter no máximo 63 caracteres.")
    .regex(SLUG_RE, "Use só letras minúsculas, números e hífen (sem hífen no começo ou no fim)."),
  nome: z.string().trim().min(1, "Informe o nome da Loja."),
  razaoSocial: z.string().trim().max(255).default(""),
  cnpj: z.string().trim().max(20).default(""),
});

function validarLoja(d: unknown) {
  const r = lojaSchema.safeParse(d);
  // Mesmo motivo de email-parametros.ts: a `message` de um ZodError é o JSON
  // inteiro do erro, e a tela mostra err.message.
  if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join(" "));
  if (SLUGS_RESERVADOS.has(r.data.slug)) {
    throw new Error(`"${r.data.slug}" é um endereço reservado da plataforma. Escolha outro.`);
  }
  return r.data;
}

export const salvarLoja = createServerFn({ method: "POST" })
  .validator(validarLoja)
  .handler(async ({ data }): Promise<{ id: string }> =>
    comSuperAdmin(async (conn, usuarioId) => {
      const [[emUso]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM lojas WHERE slug = ? AND (? IS NULL OR id <> ?)",
        [data.slug, data.id, data.id],
      );
      // O UNIQUE do banco já barraria, mas com "Duplicate entry ... for key
      // 'slug'" na cara do usuário. A checagem explícita existe pela
      // mensagem, não pela garantia — a garantia continua sendo o UNIQUE.
      if (emUso) throw new Error(`O endereço "${data.slug}" já é usado por outra Loja.`);

      const razaoSocial = data.razaoSocial || null;
      const cnpj = data.cnpj || null;

      if (data.id) {
        const [[antes]] = await conn.query<RowDataPacket[]>(
          "SELECT slug, nome, razao_social, cnpj FROM lojas WHERE id = ?",
          [data.id],
        );
        if (!antes) throw new Error("Loja não encontrada.");
        await conn.query(
          "UPDATE lojas SET slug = ?, nome = ?, razao_social = ?, cnpj = ? WHERE id = ?",
          [data.slug, data.nome, razaoSocial, cnpj, data.id],
        );
        await registrarAuditoriaPlataforma(conn, usuarioId, "editar_loja", data.id, antes, {
          slug: data.slug,
          nome: data.nome,
          razao_social: razaoSocial,
          cnpj,
        });
        return { id: data.id };
      }

      // O id é gerado aqui, e não pelo DEFAULT (UUID()) da tabela: sem isso
      // não há como saber qual linha foi criada (a PK é CHAR(36), então
      // insertId volta 0) — foi exatamente o bug da fila de e-mail, em que a
      // função devolvia um id que não existia em lugar nenhum.
      const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT UUID() AS novo_id");
      await conn.query(
        "INSERT INTO lojas (id, slug, nome, razao_social, cnpj, ativa) VALUES (?, ?, ?, ?, ?, 1)",
        [novo_id, data.slug, data.nome, razaoSocial, cnpj],
      );
      // Sem isto a Loja nasce inutilizável: toda baixa de fatura falha (o
      // SIGNAL de parâmetro contábil não configurado, issue #354) e Gestões
      // não tem cargo nenhum pra vincular (issue #340).
      await conn.query("CALL seed_loja_padrao(?)", [novo_id]);
      await registrarAuditoriaPlataforma(conn, usuarioId, "criar_loja", novo_id as string, null, {
        slug: data.slug,
        nome: data.nome,
        razao_social: razaoSocial,
        cnpj,
      });
      return { id: novo_id as string };
    }),
  );

const ativaSchema = z.object({ id: z.string().uuid(), ativa: z.boolean() });

export const definirLojaAtiva = createServerFn({ method: "POST" })
  .validator((d: unknown) => ativaSchema.parse(d))
  .handler(async ({ data }): Promise<void> =>
    comSuperAdmin(async (conn, usuarioId) => {
      const [[loja]] = await conn.query<RowDataPacket[]>(
        "SELECT nome, ativa FROM lojas WHERE id = ?",
        [data.id],
      );
      if (!loja) throw new Error("Loja não encontrada.");
      if (!!loja.ativa === data.ativa) return;

      if (!data.ativa) {
        // Trava contra se trancar pra fora: suspender uma loja derruba TODOS
        // os usuários dela (usuario-sessao.ts devolve null quando a loja está
        // inativa), inclusive um super-admin que more nela — e aí não sobra
        // ninguém que possa reativá-la, porque reativar exige justamente
        // entrar na plataforma. A saída seria um UPDATE à mão no banco.
        const [[{ super_admins }]] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS super_admins
             FROM usuarios u
             JOIN usuarios_papeis p ON p.usuario_id = u.id AND p.papel = 'super_admin'
            WHERE u.loja_id = ? AND u.ativo = TRUE`,
          [data.id],
        );
        if (Number(super_admins) > 0) {
          throw new Error(
            "Esta Loja abriga um administrador da plataforma. Suspendê-la tiraria o acesso a este painel — mova o administrador para outra Loja antes.",
          );
        }
      }

      const [r] = await conn.query<ResultSetHeader>("UPDATE lojas SET ativa = ? WHERE id = ?", [
        data.ativa,
        data.id,
      ]);
      if (r.affectedRows === 0) throw new Error("Loja não encontrada.");
      await registrarAuditoriaPlataforma(
        conn,
        usuarioId,
        data.ativa ? "reativar_loja" : "suspender_loja",
        data.id,
        { nome: loja.nome, ativa: !!loja.ativa },
        { nome: loja.nome, ativa: data.ativa },
      );
    }),
  );

const menuOcultoSchema = z.object({ id: z.string().uuid(), itens: z.array(z.string()) });

// Issue #456: quais rotas do menu lateral do painel ficam ocultas pra todos
// os usuários desta Loja. `filtrarRotasValidas` trava contra salvar rota que
// não existe no catálogo (digitada errado no cliente, ou item removido do
// catálogo desde então) — a validação de verdade é essa, não decorativa.
export const salvarMenuOcultoLoja = createServerFn({ method: "POST" })
  .validator((d: unknown) => menuOcultoSchema.parse(d))
  .handler(async ({ data }): Promise<void> =>
    comSuperAdmin(async (conn, usuarioId) => {
      const [[loja]] = await conn.query<RowDataPacket[]>(
        "SELECT nome, menu_itens_ocultos_json FROM lojas WHERE id = ?",
        [data.id],
      );
      if (!loja) throw new Error("Loja não encontrada.");

      const antes = Array.isArray(loja.menu_itens_ocultos_json)
        ? loja.menu_itens_ocultos_json
        : JSON.parse(loja.menu_itens_ocultos_json ?? "[]");
      const itens = filtrarRotasValidas(data.itens);

      await conn.query("UPDATE lojas SET menu_itens_ocultos_json = ? WHERE id = ?", [
        JSON.stringify(itens),
        data.id,
      ]);
      await registrarAuditoriaPlataforma(
        conn,
        usuarioId,
        "editar_menu_oculto_loja",
        data.id,
        {
          nome: loja.nome,
          itens: antes,
        },
        { nome: loja.nome, itens },
      );
    }),
  );

export type EventoPlataforma = {
  id: string;
  acao: string;
  criado_em: string;
  usuario_email: string | null;
  loja_nome: string | null;
  alvo_email: string | null;
  dados_depois: string | null;
};

export type ResumoPlataforma = {
  total_lojas: number;
  lojas_ativas: number;
  lojas_suspensas: number;
  usuarios_ativos: number;
};

// Números gerais pro painel inicial da Plataforma (issue #358) — total de
// Lojas ativas/suspensas e usuários ativos. Crescimento e ranking de
// atividade ficam em obterMetricasPlataforma (issue #360).
export const obterResumoPlataforma = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResumoPlataforma> =>
    comSuperAdmin(async (conn) => {
      const [[lojasRow]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total_lojas,
                SUM(CASE WHEN ativa THEN 1 ELSE 0 END) AS lojas_ativas
           FROM lojas`,
      );
      const [[usuariosRow]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS usuarios_ativos FROM usuarios WHERE ativo = TRUE",
      );
      const totalLojas = Number(lojasRow.total_lojas);
      const lojasAtivas = Number(lojasRow.lojas_ativas);
      return {
        total_lojas: totalLojas,
        lojas_ativas: lojasAtivas,
        lojas_suspensas: totalLojas - lojasAtivas,
        usuarios_ativos: Number(usuariosRow.usuarios_ativos),
      };
    }),
);

export type PontoMensal = { mes: string; total: number };

export type LojaAtividade = {
  id: string;
  nome: string;
  slug: string;
  ultimo_acesso: string | null;
};

export type MetricasPlataforma = {
  crescimentoLojas: PontoMensal[];
  crescimentoUsuarios: PontoMensal[];
  lojasMaisAtivas: LojaAtividade[];
  lojasMenosAtivas: LojaAtividade[];
};

// 6 chaves "AAAA-MM" dos últimos 6 meses (incluindo o atual), mais antigo
// primeiro — usado pra preencher com zero os meses sem nenhum registro,
// já que agrupar direto no banco só devolve os meses que existem.
function ultimosSeisMeses(): string[] {
  const chaves: string[] = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return chaves;
}

function preencherMeses(chaves: string[], contagens: Map<string, number>): PontoMensal[] {
  return chaves.map((mes) => ({ mes, total: contagens.get(mes) ?? 0 }));
}

// Métricas agregadas da plataforma (issue #360) — crescimento de Lojas e
// usuários nos últimos 6 meses, e ranking de Lojas mais/menos ativas.
// "Atividade" = login mais recente de qualquer usuário da Loja (decisão do
// usuário) — mesma métrica e mesmo subquery já usados em listarLojas().
// Só Lojas ativas entram no ranking: uma Loja suspensa já é sabidamente
// inativa por definição, incluí-la só faria ruído nas duas pontas.
export const obterMetricasPlataforma = createServerFn({ method: "GET" }).handler(
  async (): Promise<MetricasPlataforma> =>
    comSuperAdmin(async (conn) => {
      const chaves = ultimosSeisMeses();

      const [lojasRows] = await conn.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(criada_em, '%Y-%m') AS mes, COUNT(*) AS total
           FROM lojas
          WHERE criada_em >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
          GROUP BY mes`,
      );
      const [usuariosRows] = await conn.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(criado_em, '%Y-%m') AS mes, COUNT(*) AS total
           FROM usuarios
          WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
          GROUP BY mes`,
      );
      const mapaLojas = new Map(lojasRows.map((r) => [r.mes as string, Number(r.total)]));
      const mapaUsuarios = new Map(usuariosRows.map((r) => [r.mes as string, Number(r.total)]));

      const [maisAtivas] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.nome, l.slug, acesso.ultimo_acesso
           FROM lojas l
           LEFT JOIN (
             SELECT u.loja_id, MAX(a.criado_em) AS ultimo_acesso
               FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id
              WHERE a.acao = 'login'
              GROUP BY u.loja_id
           ) acesso ON acesso.loja_id = l.id
          WHERE l.ativa = TRUE
          ORDER BY (acesso.ultimo_acesso IS NULL) ASC, acesso.ultimo_acesso DESC
          LIMIT 5`,
      );
      const [menosAtivas] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.nome, l.slug, acesso.ultimo_acesso
           FROM lojas l
           LEFT JOIN (
             SELECT u.loja_id, MAX(a.criado_em) AS ultimo_acesso
               FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id
              WHERE a.acao = 'login'
              GROUP BY u.loja_id
           ) acesso ON acesso.loja_id = l.id
          WHERE l.ativa = TRUE
          ORDER BY (acesso.ultimo_acesso IS NULL) DESC, acesso.ultimo_acesso ASC
          LIMIT 5`,
      );

      const paraAtividade = (rows: RowDataPacket[]): LojaAtividade[] =>
        rows.map((r) => ({
          id: r.id as string,
          nome: r.nome as string,
          slug: r.slug as string,
          ultimo_acesso: r.ultimo_acesso ? new Date(r.ultimo_acesso).toISOString() : null,
        }));

      return {
        crescimentoLojas: preencherMeses(chaves, mapaLojas),
        crescimentoUsuarios: preencherMeses(chaves, mapaUsuarios),
        lojasMaisAtivas: paraAtividade(maisAtivas),
        lojasMenosAtivas: paraAtividade(menosAtivas),
      };
    }),
);

export const listarAuditoriaPlataforma = createServerFn({ method: "GET" }).handler(
  async (): Promise<EventoPlataforma[]> =>
    comSuperAdmin(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        // loja_id IS NULL é o que distingue ação de plataforma de ação
        // interna de loja — ver registrarAuditoriaPlataforma. entidade_tipo
        // separa duas famílias de ação de plataforma: sobre uma Loja
        // (entidade_id = lojas.id) ou sobre uma conta (entidade_id =
        // usuarios.id, issue #361) — os dois LEFT JOINs abaixo só "acertam"
        // no que corresponde ao tipo da linha.
        `SELECT a.id, a.acao, a.criado_em, u.email AS usuario_email,
                l.nome AS loja_nome, alvo.email AS alvo_email, a.dados_depois
           FROM auditoria a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           LEFT JOIN lojas l ON l.id = a.entidade_id AND a.entidade_tipo = 'loja'
           LEFT JOIN usuarios alvo ON alvo.id = a.entidade_id AND a.entidade_tipo = 'usuario'
          WHERE a.entidade_tipo IN ('loja', 'usuario') AND a.loja_id IS NULL
          ORDER BY a.criado_em DESC
          LIMIT 100`,
      );
      return rows.map((r) => ({
        id: r.id as string,
        acao: r.acao as string,
        criado_em: new Date(r.criado_em).toISOString(),
        usuario_email: r.usuario_email as string | null,
        loja_nome: r.loja_nome as string | null,
        alvo_email: r.alvo_email as string | null,
        dados_depois: r.dados_depois === null ? null : JSON.stringify(r.dados_depois),
      }));
    }),
);
