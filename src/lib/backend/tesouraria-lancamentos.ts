import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original: SELECT admin/tesoureiro/secretario (tudo) OU o próprio
// irmão vinculado; escrita (INSERT/UPDATE direto, sem procedure) admin OU
// tesoureiro.
const PAPEIS_LEITURA = ["admin", "tesoureiro", "secretario"];
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

async function ehPrivilegiadoLancamentos(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_LEITURA.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(`SELECT (${condicoes}) AS ok`, PAPEIS_LEITURA);
  return !!row.ok;
}

export type Lancamento = {
  id: string;
  data: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  descricao: string;
  valor: number;
  valor_pago: number;
  tipo: "entrada" | "saida" | "transferencia";
  pago: boolean;
  forma_pagamento: string | null;
  categoria_recebimento: string | null;
  conta_id: string | null;
  conta_destino_id: string | null;
  plano_conta_id: string | null;
  irmao_id: string | null;
  irmao_nome: string | null;
  contas_financeiras: { nome: string } | null;
  destino: { nome: string } | null;
  plano_contas: { nome: string } | null;
};

const filtrosSchema = z.object({
  de: z.string().nullable().optional(),
  ate: z.string().nullable().optional(),
  contaId: z.string().uuid().nullable().optional(),
  tipo: z.enum(["entrada", "saida", "transferencia"]).nullable().optional(),
  categoria: z.string().nullable().optional(),
  limite: z.number().int().positive().max(1000).optional(),
});

export const listarLancamentos = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtrosSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<Lancamento[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiadoLancamentos(conn);
      const condicoes: string[] = [];
      const valores: unknown[] = [];
      if (!privilegiado) {
        condicoes.push("l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      if (data.de) {
        condicoes.push("l.data >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("l.data <= ?");
        valores.push(data.ate);
      }
      if (data.contaId) {
        condicoes.push("l.conta_id = ?");
        valores.push(data.contaId);
      }
      if (data.tipo) {
        condicoes.push("l.tipo = ?");
        valores.push(data.tipo);
      }
      if (data.categoria) {
        condicoes.push("l.categoria_recebimento = ?");
        valores.push(data.categoria);
      }
      const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
      const limite = data.limite ?? 200;

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data, l.data_vencimento, l.data_pagamento, l.descricao, l.valor, l.valor_pago, l.tipo, l.pago,
                l.forma_pagamento, l.categoria_recebimento, l.conta_id, l.conta_destino_id, l.plano_conta_id,
                l.irmao_id, i.nome_civil AS irmao_nome,
                cf.nome AS conta_nome, cfd.nome AS destino_nome, pc.nome AS plano_conta_nome
         FROM lancamentos l
         LEFT JOIN irmaos i ON i.id = l.irmao_id
         LEFT JOIN contas_financeiras cf ON cf.id = l.conta_id
         LEFT JOIN contas_financeiras cfd ON cfd.id = l.conta_destino_id
         LEFT JOIN plano_contas pc ON pc.id = l.plano_conta_id
         ${where}
         ORDER BY l.data DESC
         LIMIT ?`,
        [...valores, limite],
      );
      return rows.map((r) => ({
        id: r.id,
        data: r.data,
        data_vencimento: r.data_vencimento,
        data_pagamento: r.data_pagamento,
        descricao: r.descricao,
        valor: r.valor,
        valor_pago: r.valor_pago,
        tipo: r.tipo,
        pago: r.pago,
        forma_pagamento: r.forma_pagamento,
        categoria_recebimento: r.categoria_recebimento,
        conta_id: r.conta_id,
        conta_destino_id: r.conta_destino_id,
        plano_conta_id: r.plano_conta_id,
        irmao_id: r.irmao_id,
        irmao_nome: r.irmao_nome,
        contas_financeiras: r.conta_nome ? { nome: r.conta_nome } : null,
        destino: r.destino_nome ? { nome: r.destino_nome } : null,
        plano_contas: r.plano_conta_nome ? { nome: r.plano_conta_nome } : null,
      }));
    });
  });

export type LancamentoDetalhe = {
  id: string;
  data: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  descricao: string;
  valor: number;
  valor_pago: number;
  pago: boolean;
  competencia_mes: string | null;
  is_mensalidade: boolean;
  irmao_nome: string | null;
  irmao_cim: string | null;
  org_nome: string | null;
  org_logo_url: string | null;
  forma_cobranca: "pix" | "boleto" | null;
  pix_chave: string | null;
  pix_nome_beneficiario: string | null;
  pix_cidade: string | null;
};

// Detalhe de um lançamento pra tela de impressão/edição — inclui dados do
// irmão e do corpo maçônico PRINCIPAL dele (logo pra imprimir) quando
// houver, além da chave PIX escolhida na fatura (se houver) pra gerar o
// QR code na impressão. Acesso "privilegiado ou próprio" (mesmo padrão de
// podeVerIrmao em irmaos.ts) — o próprio irmão pode abrir/imprimir a
// fatura dele no Meu Painel, não só admin/tesoureiro/secretario.
export const obterLancamento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<LancamentoDetalhe | null> => {
    return comSessao(async (conn, usuarioId) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data, l.data_vencimento, l.data_pagamento, l.descricao, l.valor, l.valor_pago, l.pago,
                l.competencia_mes, l.is_mensalidade, l.forma_cobranca,
                i.nome_civil AS irmao_nome, i.cim AS irmao_cim, i.usuario_id AS irmao_usuario_id,
                o.nome AS org_nome, o.logo_url AS org_logo_url,
                pix.chave AS pix_chave, pix.nome_beneficiario AS pix_nome_beneficiario,
                pix.cidade AS pix_cidade
         FROM lancamentos l
         LEFT JOIN irmaos i ON i.id = l.irmao_id
         LEFT JOIN irmao_orgs io ON io.irmao_id = i.id AND io.principal = TRUE
         LEFT JOIN orgs o ON o.id = io.org_id
         LEFT JOIN contas_financeiras_pix pix ON pix.id = l.pix_chave_id
         WHERE l.id = ?`,
        [data.id],
      );
      if (!row) return null;
      if (!(await ehPrivilegiadoLancamentos(conn)) && row.irmao_usuario_id !== usuarioId) {
        throw new SemPermissaoError();
      }
      return row as LancamentoDetalhe;
    });
  });

export const marcarLancamentoPago = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), dataPagamento: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT pago, data_pagamento FROM lancamentos WHERE id = ?",
        [data.id],
      );
      await conn.query("UPDATE lancamentos SET pago = TRUE, data_pagamento = ? WHERE id = ?", [
        data.dataPagamento,
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "marcar_pago", "lancamentos", data.id, antes, {
        pago: true,
        data_pagamento: data.dataPagamento,
      });
    });
  });

// Desfaz a baixa — volta o lançamento pra "aberto", pra corrigir uma
// marcação de pago feita por engano (sem apagar o lançamento em si).
export const desmarcarLancamentoPago = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT pago, data_pagamento FROM lancamentos WHERE id = ?",
        [data.id],
      );
      await conn.query(
        "UPDATE lancamentos SET pago = FALSE, data_pagamento = NULL, valor_pago = 0 WHERE id = ?",
        [data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "desmarcar_pago",
        "lancamentos",
        data.id,
        antes,
        { pago: false },
      );
    });
  });

const atribuirIrmaoLancamentoSchema = z.object({
  id: z.string().uuid(),
  irmaoId: z.string().uuid().nullable(),
});

// Atribuição/correção do irmão vinculado — diferente de atualizarLancamento
// (que mexe em data/vencimento/descrição/valor e por isso é bloqueado pra
// lançamento já pago), aqui é só metadado de quem pagou, não afeta valor
// nem contabilização, então funciona independente do status. Caso de uso
// principal: lançamento avulso criado a partir de uma linha do OFX (issue
// #136) — a atribuição pode não ter sido feita na hora, ou precisar de
// correção depois.
export const atribuirIrmaoLancamento = createServerFn({ method: "POST" })
  .validator((d: unknown) => atribuirIrmaoLancamentoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT irmao_id FROM lancamentos WHERE id = ?",
        [data.id],
      );
      if (!antes) throw new Error("Lançamento não encontrado.");
      await conn.query("UPDATE lancamentos SET irmao_id = ? WHERE id = ?", [data.irmaoId, data.id]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atribuir_irmao",
        "lancamentos",
        data.id,
        { irmao_id: antes.irmao_id },
        { irmao_id: data.irmaoId },
      );
    });
  });

const atualizarLancamentoSchema = z.object({
  id: z.string().uuid(),
  data: z.string(),
  dataVencimento: z.string().nullable(),
  descricao: z.string().min(1),
  valor: z.number().positive(),
});

// Só permite editar lançamento ainda em aberto — um já pago já moveu
// dinheiro de verdade (banco/caixa), editar o valor dele corromperia a
// conciliação. Pra corrigir um pago por engano, primeiro desfaz a baixa.
export const atualizarLancamento = createServerFn({ method: "POST" })
  .validator((d: unknown) => atualizarLancamentoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT data, data_vencimento, descricao, valor, valor_pago, pago FROM lancamentos WHERE id = ?",
        [data.id],
      );
      if (!antes) throw new Error("Lançamento não encontrado.");
      if (antes.pago) {
        throw new Error("Não é possível editar um lançamento já pago. Desfaça a baixa primeiro.");
      }
      if (Number(antes.valor_pago) > 0) {
        throw new Error(
          "Esta fatura já recebeu pagamento parcial — não é possível editar o valor dela.",
        );
      }
      await conn.query(
        "UPDATE lancamentos SET data = ?, data_vencimento = ?, descricao = ?, valor = ? WHERE id = ?",
        [data.data, data.dataVencimento, data.descricao, data.valor, data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "editar", "lancamentos", data.id, antes, {
        data: data.data,
        data_vencimento: data.dataVencimento,
        descricao: data.descricao,
        valor: data.valor,
      });
    });
  });

const formaCobrancaSchema = z.object({
  id: z.string().uuid(),
  formaCobranca: z.enum(["pix", "boleto"]).nullable(),
  pixChaveId: z.string().uuid().nullable(),
});

// Forma de cobrança "ofertada" na fatura (o que aparece impresso pro
// irmão pagar) — não confundir com lancamentos.forma_pagamento, que só é
// preenchido na baixa e registra o que foi de fato usado (pode ser
// diferente: cobrou por PIX, mas o irmão pagou em dinheiro na
// secretaria).
export const definirFormaCobranca = createServerFn({ method: "POST" })
  .validator((d: unknown) => formaCobrancaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT forma_cobranca, pix_chave_id, pago FROM lancamentos WHERE id = ?",
        [data.id],
      );
      if (!antes) throw new Error("Lançamento não encontrado.");
      if (antes.pago) {
        throw new Error("Não é possível alterar a forma de cobrança de um lançamento já pago.");
      }
      if (data.formaCobranca && !data.pixChaveId) {
        throw new Error("Selecione a chave PIX que vai gerar o QR code.");
      }
      await conn.query("UPDATE lancamentos SET forma_cobranca = ?, pix_chave_id = ? WHERE id = ?", [
        data.formaCobranca,
        data.pixChaveId,
        data.id,
      ]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "definir_forma_cobranca",
        "lancamentos",
        data.id,
        antes,
        { forma_cobranca: data.formaCobranca, pix_chave_id: data.pixChaveId },
      );
    });
  });

// Estorno = exclusão de um lançamento ainda em aberto (fatura errada,
// duplicada, lançamento manual incorreto etc.) — junto com a contrapartida
// contábil de partida dobrada (lancamentos_contabeis/itens), se existir,
// pra não deixar rastro órfão na contabilidade. Só em aberto: um lançamento
// pago já moveu dinheiro de verdade, apagar destruiria o histórico de
// caixa — desfaça a baixa antes, se for o caso.
export const estornarLancamento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[lancamento]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM lancamentos WHERE id = ?",
        [data.id],
      );
      if (!lancamento) throw new Error("Lançamento não encontrado.");
      if (lancamento.pago) {
        throw new Error("Não é possível estornar um lançamento já pago. Desfaça a baixa primeiro.");
      }
      if (Number(lancamento.valor_pago) > 0) {
        throw new Error(
          "Esta fatura já recebeu pagamento parcial — não é possível estorná-la sem reverter o pagamento primeiro.",
        );
      }

      const [contabeis] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM lancamentos_contabeis WHERE origem_id = ? AND origem_tipo IN ('fatura_provisao', 'recebimento_avulso')`,
        [data.id],
      );
      for (const lc of contabeis) {
        await conn.query("DELETE FROM lancamentos_contabeis_itens WHERE lancamento_id = ?", [
          lc.id,
        ]);
        await conn.query("DELETE FROM lancamentos_contabeis WHERE id = ?", [lc.id]);
      }

      await conn.query("DELETE FROM lancamentos WHERE id = ?", [data.id]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "estornar",
        "lancamentos",
        data.id,
        lancamento,
        null,
      );
    });
  });

const novoLancamentoSchema = z.object({
  data: z.string(),
  data_vencimento: z.string().nullable(),
  descricao: z.string().min(1),
  valor: z.number().positive(),
  tipo: z.enum(["entrada", "saida"]),
  conta_id: z.string().uuid(),
  plano_conta_id: z.string().uuid().nullable(),
  pago: z.boolean(),
  data_pagamento: z.string().nullable(),
  observacoes: z.string().nullable(),
});

// Lançamento manual — igual ao original, é INSERT direto (sem stored
// procedure), não gera lançamento contábil de partida dobrada (achado #157
// da revisão de segurança — a contrapartida contábil em si ficou como
// decisão em aberto na issue, é mudança estrutural maior; aqui só a
// auditoria, que é o gap claro e sem ambiguidade).
export const criarLancamentoManual = createServerFn({ method: "POST" })
  .validator((d: unknown) => novoLancamentoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query(
        `INSERT INTO lancamentos (data, data_vencimento, descricao, valor, tipo, conta_id, plano_conta_id, pago, data_pagamento, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.data,
          data.data_vencimento,
          data.descricao,
          data.valor,
          data.tipo,
          data.conta_id,
          data.plano_conta_id,
          data.pago,
          data.data_pagamento,
          data.observacoes,
        ],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "criar",
        "lancamento_manual",
        null,
        null,
        data,
      );
    });
  });

const recebimentoAvulsoSchema = z.object({
  valor: z.number().positive(),
  categoria: z.enum(["mensalidade", "taxa_grau", "tronco", "doacao", "outros"]),
  planoContaId: z.string().uuid(),
  contaFinanceiraId: z.string().uuid(),
  data: z.string(),
  formaPagamento: z.string().nullable(),
  descricao: z.string().nullable(),
  observacoes: z.string().nullable(),
});

export const registrarRecebimentoAvulso = createServerFn({ method: "POST" })
  .validator((d: unknown) => recebimentoAvulsoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query(
        "CALL registrar_recebimento_avulso(?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, @lanc_id)",
        [
          data.valor,
          data.categoria,
          data.planoContaId,
          data.contaFinanceiraId,
          data.data,
          data.formaPagamento,
          data.descricao,
          data.observacoes,
        ],
      );
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "criar",
        "recebimento_avulso",
        lanc_id,
        null,
        data,
      );
      return { id: lanc_id };
    });
  });

const transferenciaSchema = z.object({
  contaOrigemId: z.string().uuid(),
  contaDestinoId: z.string().uuid(),
  valor: z.number().positive(),
  data: z.string(),
  descricao: z.string().min(1),
});

export const criarTransferencia = createServerFn({ method: "POST" })
  .validator((d: unknown) => transferenciaSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("CALL criar_transferencia(?, ?, ?, ?, ?, @lanc_id)", [
        data.contaOrigemId,
        data.contaDestinoId,
        data.valor,
        data.data,
        data.descricao,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "transferencia", lanc_id, null, data);
      return { id: lanc_id };
    });
  });

const rateioSchema = z
  .array(z.object({ conta_id: z.string().uuid(), percentual: z.number() }))
  .nullable();

export const gerarMensalidades = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        competencia: z.string(),
        dataVencimento: z.string().nullable().optional(),
        rateio: rateioSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<number> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("CALL gerar_mensalidades(?, ?, NULL, ?, @total)", [
        data.competencia,
        data.dataVencimento ?? null,
        data.rateio ? JSON.stringify(data.rateio) : null,
      ]);
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      await registrarAuditoria(conn, usuarioIdAtual, "gerar_lote", "mensalidades", null, null, {
        ...data,
        total_gerado: total,
      });

      // Dispara e-mail de "fatura emitida" (issue #103) pra cada mensalidade
      // gerada — dedup por lancamento_id em email-dispatch.ts garante que
      // rodar de novo pra uma competência já processada não reenvia.
      const [gerados] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM lancamentos WHERE competencia_mes = ? AND is_mensalidade = TRUE",
        [data.competencia],
      );
      const { enviarEmailFaturaEmitida } = await import("../email-dispatch");
      for (const g of gerados) {
        enviarEmailFaturaEmitida(g.id as string).catch((err) =>
          console.error("Falha ao enviar e-mail de fatura emitida:", err),
        );
      }

      return Number(total);
    });
  });
