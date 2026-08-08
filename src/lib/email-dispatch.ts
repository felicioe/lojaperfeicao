import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { withUserConnection } from "./backend/db";

// Envio de e-mail (issue #103) — SMTP da própria Hostinger via nodemailer,
// decisão confirmada (sem custo extra, sem cadastro em serviço terceiro).
// Isolado aqui e importado só por server.ts/dentro de handlers via
// import() dinâmico — mesmo motivo de backup-dispatch.ts/push-dispatch.ts:
// evita que db.ts vaze pro bundle do cliente.

let transporter: Transporter | undefined;

function origemPublica(): string {
  return process.env.PUBLIC_ORIGIN || "http://localhost:5173";
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !port || !user || !password) {
    throw new Error("Envio de e-mail não está configurado neste servidor.");
  }
  const options: SMTPTransport.Options = {
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass: password },
  };
  transporter = nodemailer.createTransport(options);
  return transporter;
}

// Grava a tentativa (sucesso ou falha) e devolve se enviou de verdade.
// A dedup por `chave` é feita ANTES de chamar esta função (ver
// jaEnviadoComSucesso) — aqui só registra o resultado desta tentativa.
async function enviarEGravar(
  conn: PoolConnection,
  params: {
    chave: string;
    destinatario: string;
    assunto: string;
    html: string;
    texto: string;
    anexos?: { filename: string; content: Buffer; contentType: string }[];
  },
): Promise<boolean> {
  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  try {
    await getTransporter().sendMail({
      from: remetente,
      to: params.destinatario,
      subject: params.assunto,
      html: params.html,
      text: params.texto,
      attachments: params.anexos,
    });
    await conn.query(
      "INSERT INTO emails_enviados (chave, destinatario, assunto, sucesso) VALUES (?, ?, ?, TRUE)",
      [params.chave, params.destinatario, params.assunto],
    );
    return true;
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error(`Falha ao enviar e-mail (${params.chave}):`, mensagem);
    await conn.query(
      "INSERT INTO emails_enviados (chave, destinatario, assunto, sucesso, erro) VALUES (?, ?, ?, FALSE, ?)",
      [params.chave, params.destinatario, params.assunto, mensagem.slice(0, 500)],
    );
    return false;
  }
}

async function jaEnviadoComSucesso(conn: PoolConnection, chave: string): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM emails_enviados WHERE chave = ? AND sucesso = TRUE LIMIT 1",
    [chave],
  );
  return rows.length > 0;
}

function brl(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${d}T00:00:00`));
}

// Semana ISO (segunda a domingo) de hoje, ex.: "2026-W32" — usada como
// sufixo de chave pro lembrete se repetir semanalmente sem virar spam
// diário, enquanto a fatura continuar em aberto.
function semanaIsoDeHoje(): string {
  const hoje = new Date();
  const data = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const diaSemana = (data.getUTCDay() + 6) % 7; // segunda = 0
  data.setUTCDate(data.getUTCDate() - diaSemana + 3);
  const primeiraQuinta = new Date(Date.UTC(data.getUTCFullYear(), 0, 4));
  const semana =
    1 +
    Math.round(
      ((data.getTime() - primeiraQuinta.getTime()) / 86400000 -
        3 +
        ((primeiraQuinta.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${data.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

// ---------- Fatura emitida ----------

export async function enviarEmailFaturaEmitida(lancamentoId: string): Promise<void> {
  await withUserConnection(null, async (conn) => {
    const chave = `fatura_emitida:${lancamentoId}`;
    if (await jaEnviadoComSucesso(conn, chave)) return;

    const [[fatura]] = await conn.query<RowDataPacket[]>(
      `SELECT l.descricao, l.valor, l.data_vencimento, i.nome_civil, i.email
       FROM lancamentos l JOIN irmaos i ON i.id = l.irmao_id
       WHERE l.id = ?`,
      [lancamentoId],
    );
    if (!fatura || !fatura.email) return;

    const html = `
      <p>Olá, ${fatura.nome_civil}!</p>
      <p>Uma nova fatura foi emitida em seu nome:</p>
      <ul>
        <li><strong>Descrição:</strong> ${fatura.descricao}</li>
        <li><strong>Valor:</strong> ${brl(fatura.valor)}</li>
        <li><strong>Vencimento:</strong> ${fmtDate(fatura.data_vencimento)}</li>
      </ul>
      <p>Acesse o sistema em <a href="${origemPublica()}/painel/financeiro">${origemPublica()}/painel/financeiro</a> para mais detalhes.</p>
    `;
    const texto = `Olá, ${fatura.nome_civil}! Fatura emitida: ${fatura.descricao}, valor ${brl(fatura.valor)}, vencimento ${fmtDate(fatura.data_vencimento)}. Acesse ${origemPublica()}/painel/financeiro.`;

    await enviarEGravar(conn, {
      chave,
      destinatario: fatura.email,
      assunto: `Fatura emitida — ${fatura.descricao}`,
      html,
      texto,
    });
  });
}

// ---------- Lembrete de fatura em aberto (cron + manual) ----------

type FaturaLembrete = {
  descricao: string;
  valor: number;
  data_vencimento: string;
  nome_civil: string;
};

function montarLembreteFatura(fatura: FaturaLembrete, hojeISO: string) {
  const vencida = new Date(fatura.data_vencimento) < new Date(hojeISO);
  const html = `
    <p>Olá, ${fatura.nome_civil}!</p>
    <p>${vencida ? "Você tem uma fatura vencida" : "Sua fatura está próxima do vencimento"}:</p>
    <ul>
      <li><strong>Descrição:</strong> ${fatura.descricao}</li>
      <li><strong>Valor:</strong> ${brl(fatura.valor)}</li>
      <li><strong>Vencimento:</strong> ${fmtDate(fatura.data_vencimento)}</li>
    </ul>
    <p>Acesse o sistema em <a href="${origemPublica()}/painel/financeiro">${origemPublica()}/painel/financeiro</a> para regularizar.</p>
  `;
  const texto = `${vencida ? "Fatura vencida" : "Fatura próxima do vencimento"}: ${fatura.descricao}, valor ${brl(fatura.valor)}, vencimento ${fmtDate(fatura.data_vencimento)}. Acesse ${origemPublica()}/painel/financeiro.`;
  const assunto = vencida
    ? `Fatura vencida — ${fatura.descricao}`
    : `Lembrete de fatura — ${fatura.descricao}`;
  return { assunto, html, texto };
}

export type ResultadoLembretes = { avaliadas: number; enviadas: number; falhas: number };

export async function executarLembretesFaturas(): Promise<ResultadoLembretes> {
  return withUserConnection(null, async (conn) => {
    // Vencendo em até 3 dias, ou já vencida — mesma janela usada pro
    // "fatura_vencida" do sino de notificações, mais a antecedência de 3
    // dias (o sino só avisa admin/secretaria de já vencidas; aqui o
    // objetivo é lembrar o próprio irmão antes de vencer).
    const [faturas] = await conn.query<RowDataPacket[]>(
      `SELECT l.id, l.descricao, l.valor, l.data_vencimento, i.nome_civil, i.email
       FROM lancamentos l JOIN irmaos i ON i.id = l.irmao_id
       WHERE l.tipo = 'entrada' AND l.is_mensalidade = TRUE AND l.pago = FALSE
         AND l.data_vencimento <= DATE_ADD(CURRENT_DATE, INTERVAL 3 DAY)
         AND i.email IS NOT NULL AND i.email != ''`,
    );

    let enviadas = 0;
    let falhas = 0;
    const anoSemana = semanaIsoDeHoje();
    const hojeISO = new Date().toISOString().slice(0, 10);

    for (const fatura of faturas) {
      const chave = `lembrete_fatura:${fatura.id}:${anoSemana}`;
      if (await jaEnviadoComSucesso(conn, chave)) continue;

      const { assunto, html, texto } = montarLembreteFatura(
        fatura as unknown as FaturaLembrete,
        hojeISO,
      );
      const ok = await enviarEGravar(conn, {
        chave,
        destinatario: fatura.email,
        assunto,
        html,
        texto,
      });
      if (ok) enviadas++;
      else falhas++;
    }

    return { avaliadas: faturas.length, enviadas, falhas };
  });
}

// ---------- Cobrança manual (issue #115) ----------
// Chamado pelo botão "Gerar cobrança" do relatório de inadimplência.
// Reaproveita o mesmo template do lembrete automático, mas com chave
// sempre única (randomUUID) — diferente do lembrete semanal, aqui o
// tesoureiro está pedindo o envio de propósito, não faz sentido a dedup
// por semana bloquear.
export async function enviarCobrancaManual(lancamentoId: string): Promise<boolean> {
  return withUserConnection(null, async (conn) => {
    const [[fatura]] = await conn.query<RowDataPacket[]>(
      `SELECT l.descricao, l.valor, l.data_vencimento, i.nome_civil, i.email
       FROM lancamentos l JOIN irmaos i ON i.id = l.irmao_id
       WHERE l.id = ?`,
      [lancamentoId],
    );
    if (!fatura || !fatura.email) return false;

    const hojeISO = new Date().toISOString().slice(0, 10);
    const { assunto, html, texto } = montarLembreteFatura(
      fatura as unknown as FaturaLembrete,
      hojeISO,
    );
    return enviarEGravar(conn, {
      chave: `cobranca_manual:${lancamentoId}:${randomUUID()}`,
      destinatario: fatura.email,
      assunto,
      html,
      texto,
    });
  });
}

// ---------- Envio manual de relatório (issue #111) ----------
// Sem dedup por chave (cada chamada gera uma chave única com randomUUID):
// é um envio manual disparado pelo usuário, não um job periódico que
// possa repetir — não faz sentido "já enviado antes" bloquear um reenvio
// pedido de propósito. Ainda assim grava em emails_enviados pelo mesmo
// motivo dos outros fluxos: auditoria de o que foi mandado e quando.

export type ResultadoEnvioRelatorio = { destinatario: string; sucesso: boolean }[];

export async function enviarArquivoPorEmail(params: {
  destinatarios: string[];
  assunto: string;
  corpoTexto: string;
  anexoBuffer: Buffer;
  anexoNome: string;
  anexoMimeType: string;
}): Promise<ResultadoEnvioRelatorio> {
  return withUserConnection(null, async (conn) => {
    const resultados: ResultadoEnvioRelatorio = [];
    for (const destinatario of params.destinatarios) {
      const ok = await enviarEGravar(conn, {
        chave: `relatorio_manual:${randomUUID()}`,
        destinatario,
        assunto: params.assunto,
        html: `<p>${params.corpoTexto}</p>`,
        texto: params.corpoTexto,
        anexos: [
          {
            filename: params.anexoNome,
            content: params.anexoBuffer,
            contentType: params.anexoMimeType,
          },
        ],
      });
      resultados.push({ destinatario, sucesso: ok });
    }
    return resultados;
  });
}
