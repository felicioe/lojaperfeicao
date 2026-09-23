import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { ehPrivilegiado } from "./irmaos";
import { PODE_VER_CONDICAO } from "./pecas-arquitetura";

// Busca ampla de conteúdo (issue #710) — campo fixo no topo do menu lateral,
// nos três shells (AppShell/PainelShell/PlataformaShell). Diferente da busca
// de menu (issue #697, MenuSearch.tsx), que só filtra rótulos de item de
// menu (lista estática rota+nome em memória), esta consulta o BANCO por
// texto (LIKE), sem IA/FULLTEXT — volume institucional (dezenas a centenas
// de linhas por tabela) não justifica nada mais pesado.
//
// Cada fonte roda com EXATAMENTE a mesma regra de permissão que a tela/
// backend de origem já usa hoje (comSessao é a base comum: todo mundo que
// chega aqui já está autenticado numa Loja) — nada é reinventado:
// - Notícias: mesma condição de noticias-publica.ts (status='publicado'),
//   sem filtro de visibilidade extra — quem busca aqui já tem sessão válida
//   (comSessao), então "restrita" sempre entra, igual à regra da #690 pra
//   visitante logado.
// - Páginas do site: mesmo raciocínio — paginas-site-publica.ts só esconde
//   'restrita' de quem NÃO tem sessão; aqui sempre tem. status='publicado'.
// - Edições do jornal (edicoes_jornal): migração 0158 não tem nenhuma coluna
//   de visibilidade/restrição — decisão em aberto da issue confirmada no
//   código: é sempre pública dentro da Loja, sem filtro extra.
// - Irmãos: mesma regra de listarIrmaos (irmaos.ts) — privilegiado
//   (admin/secretario/tesoureiro) vê todos, os demais só a si mesmo.
// - Documentos (legislação): mesma regra de listarDocumentos (documentos.ts)
//   — comSessao puro, qualquer Irmão logado vê tudo da própria Loja.
// - Peças de Arquitetura (biblioteca): mesma condição PODE_VER_CONDICAO de
//   pecas-arquitetura.ts (tratamento crítico: nunca vazar peça de grau
//   superior a quem não pode vê-la).
//
// Cada fonte devolve só id + título + trecho curto (nunca conteúdo/arquivo
// completo) e um indicador booleano de arquivo associado — mesma lição já
// registrada em documentos.ts/noticias-publica.ts sobre nunca trazer o
// binário/conteúdo integral numa resposta que não seja sob demanda.
const LIMITE_POR_FONTE = 5;
const TAMANHO_TRECHO = 160;

export type CategoriaBusca =
  "noticias" | "paginas" | "jornal" | "irmaos" | "documentos" | "biblioteca";

export type ResultadoBusca = {
  id: string;
  titulo: string;
  trecho: string | null;
  restrito: boolean;
  temArquivo: boolean;
  // Caminho pra "origem" do resultado (navegação ao clicar no card) — já
  // resolvido aqui, pra tela de resultados não precisar conhecer a forma da
  // rota de cada fonte.
  href: string;
  // Só preenchido quando temArquivo — rota de download (issue #710).
  arquivoHref: string | null;
};

export type GrupoResultadoBusca = {
  categoria: CategoriaBusca;
  label: string;
  itens: ResultadoBusca[];
};

// Escapa os coringas do LIKE (%, _ e a própria barra de escape) antes de
// envolver o termo em '%...%' — sem isso, um usuário digitando "_" ou "%"
// (comuns em CIM/matrícula) vira um coringa SQL em vez de um caractere
// literal buscado.
function termoLike(termo: string): string {
  return `%${termo.replace(/([\\%_])/g, "\\$1")}%`;
}

// Trecho curto de contexto: colapsa espaços (o conteúdo pode vir com quebras
// de linha/HTML já sanitizado) e corta em TAMANHO_TRECHO, nunca o campo
// inteiro — mesma lição de performance já documentada em documentos.ts.
function truncar(texto: string | null | undefined): string | null {
  if (!texto) return null;
  // Remove marcação HTML básica (conteúdo rico de notícias/páginas) — só
  // pra exibir um trecho de texto puro no card, não uma renderização real.
  const semTags = texto.replace(/<[^>]+>/g, " ");
  const normalizado = semTags.replace(/\s+/g, " ").trim();
  if (!normalizado) return null;
  return normalizado.length > TAMANHO_TRECHO
    ? `${normalizado.slice(0, TAMANHO_TRECHO).trimEnd()}…`
    : normalizado;
}

async function buscarNoticias(conn: PoolConnection, termo: string): Promise<ResultadoBusca[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, titulo, resumo, visibilidade
       FROM noticias
      WHERE loja_id = @current_loja_id AND status = 'publicado'
        AND (titulo LIKE ? ESCAPE '\\\\' OR resumo LIKE ? ESCAPE '\\\\')
      ORDER BY publicado_em DESC
      LIMIT ${LIMITE_POR_FONTE}`,
    [termoLike(termo), termoLike(termo)],
  );
  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    trecho: truncar(row.resumo),
    restrito: row.visibilidade === "restrita",
    temArquivo: false,
    href: `/noticias/${row.id}`,
    arquivoHref: null,
  }));
}

async function buscarPaginasSite(conn: PoolConnection, termo: string): Promise<ResultadoBusca[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, titulo, slug, restrita, LEFT(conteudo, 400) AS trecho_bruto
       FROM paginas_site
      WHERE loja_id = @current_loja_id AND status = 'publicado'
        AND (titulo LIKE ? ESCAPE '\\\\' OR conteudo LIKE ? ESCAPE '\\\\')
      ORDER BY titulo
      LIMIT ${LIMITE_POR_FONTE}`,
    [termoLike(termo), termoLike(termo)],
  );
  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    trecho: truncar(row.trecho_bruto),
    restrito: !!row.restrita,
    temArquivo: false,
    href: `/paginas/${row.slug}`,
    arquivoHref: null,
  }));
}

async function buscarEdicoesJornal(conn: PoolConnection, termo: string): Promise<ResultadoBusca[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, numero, titulo
       FROM edicoes_jornal
      WHERE loja_id = @current_loja_id AND titulo LIKE ? ESCAPE '\\\\'
      ORDER BY publicado_em DESC
      LIMIT ${LIMITE_POR_FONTE}`,
    [termoLike(termo)],
  );
  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    trecho: `Edição nº ${row.numero}`,
    restrito: false,
    temArquivo: false,
    href: `/jornal/${row.numero}`,
    arquivoHref: null,
  }));
}

async function buscarIrmaos(
  conn: PoolConnection,
  usuarioId: string,
  termo: string,
): Promise<ResultadoBusca[]> {
  // Mesma regra de listarIrmaos (irmaos.ts): privilegiado vê todos, os
  // demais só a si mesmo — reaproveitada aqui, não reinventada.
  const privilegiado = await ehPrivilegiado(conn);
  const condicaoEscopo = privilegiado ? "" : "AND usuario_id = ?";
  const parametrosBusca = [termoLike(termo), termoLike(termo), termoLike(termo)];
  const parametros = privilegiado ? parametrosBusca : [...parametrosBusca, usuarioId];
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, nome_civil, nome_simbolico, cim, grau
       FROM irmaos
      WHERE loja_id = @current_loja_id
        AND (nome_civil LIKE ? ESCAPE '\\\\' OR nome_simbolico LIKE ? ESCAPE '\\\\' OR cim LIKE ? ESCAPE '\\\\')
        ${condicaoEscopo}
      ORDER BY nome_civil
      LIMIT ${LIMITE_POR_FONTE}`,
    parametros,
  );
  return rows.map((row) => ({
    id: row.id,
    titulo: row.nome_civil,
    trecho: [row.nome_simbolico, row.cim ? `CIM ${row.cim}` : null, `Grau ${row.grau}`]
      .filter(Boolean)
      .join(" · "),
    restrito: false,
    temArquivo: false,
    href: `/irmaos/${row.id}`,
    arquivoHref: null,
  }));
}

async function buscarDocumentos(conn: PoolConnection, termo: string): Promise<ResultadoBusca[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, titulo, categoria, LEFT(conteudo, 400) AS trecho_bruto,
            (arquivo_url IS NOT NULL AND arquivo_url <> '') AS tem_arquivo
       FROM documentos
      WHERE loja_id = @current_loja_id
        AND (titulo LIKE ? ESCAPE '\\\\' OR conteudo LIKE ? ESCAPE '\\\\')
      ORDER BY criado_em DESC
      LIMIT ${LIMITE_POR_FONTE}`,
    [termoLike(termo), termoLike(termo)],
  );
  return rows.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    trecho: truncar(row.trecho_bruto),
    restrito: false,
    temArquivo: !!row.tem_arquivo,
    href: "/documentos",
    arquivoHref: row.tem_arquivo ? `/api/documentos/${row.id}/arquivo` : null,
  }));
}

async function buscarPecasArquitetura(
  conn: PoolConnection,
  termo: string,
): Promise<ResultadoBusca[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pa.id, pa.titulo, pa.tema, pa.resumo, pa.situacao,
            (pa.arquivo_url IS NOT NULL AND pa.arquivo_url <> '') AS tem_arquivo
       FROM pecas_arquitetura pa
       JOIN irmaos i ON i.id = pa.autor_id AND i.loja_id = @current_loja_id
      WHERE pa.loja_id = @current_loja_id AND ${PODE_VER_CONDICAO}
        AND (pa.titulo LIKE ? ESCAPE '\\\\' OR pa.tema LIKE ? ESCAPE '\\\\' OR pa.resumo LIKE ? ESCAPE '\\\\')
      ORDER BY pa.criado_em DESC
      LIMIT ${LIMITE_POR_FONTE}`,
    [termoLike(termo), termoLike(termo), termoLike(termo)],
  );
  const SITUACAO_LABEL: Record<string, string> = {
    em_analise: "Em análise",
    rejeitado: "Rejeitado",
    aprovado: "Aprovado",
  };
  return rows.map((row) => {
    const trechoBase = truncar(row.resumo ?? row.tema);
    const situacaoLabel = SITUACAO_LABEL[row.situacao as string] ?? null;
    const trecho =
      row.situacao !== "aprovado" && situacaoLabel
        ? [situacaoLabel, trechoBase].filter(Boolean).join(" — ")
        : trechoBase;
    return {
      id: row.id,
      titulo: row.titulo,
      trecho,
      restrito: false,
      temArquivo: !!row.tem_arquivo,
      href: "/biblioteca",
      arquivoHref: row.tem_arquivo ? `/api/biblioteca/${row.id}/arquivo` : null,
    };
  });
}

const buscaSchema = z.object({
  termo: z.string().trim().min(2).max(100),
});

export const buscarConteudo = createServerFn({ method: "GET" })
  .validator((d: unknown) => buscaSchema.parse(d))
  .handler(async ({ data }): Promise<GrupoResultadoBusca[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [noticias, paginas, jornal, irmaos, documentos, biblioteca] = await Promise.all([
        buscarNoticias(conn, data.termo),
        buscarPaginasSite(conn, data.termo),
        buscarEdicoesJornal(conn, data.termo),
        buscarIrmaos(conn, usuarioId, data.termo),
        buscarDocumentos(conn, data.termo),
        buscarPecasArquitetura(conn, data.termo),
      ]);

      const grupos: GrupoResultadoBusca[] = [
        { categoria: "noticias", label: "Notícias", itens: noticias },
        { categoria: "paginas", label: "Páginas do Site", itens: paginas },
        { categoria: "jornal", label: "Edições do Jornal", itens: jornal },
        { categoria: "irmaos", label: "Irmãos", itens: irmaos },
        { categoria: "documentos", label: "Documentos (Legislação)", itens: documentos },
        { categoria: "biblioteca", label: "Peças de Arquitetura", itens: biblioteca },
      ];
      return grupos.filter((g) => g.itens.length > 0);
    });
  });
