import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { withUserConnection } from "./backend/db";
import { SENHA_PADRAO } from "./backend/usuarios";

// Envio de e-mail com fila (issue #103 + issue #XXX) — SMTP da própria
// Hostinger via nodemailer. Isolado aqui e importado via import() dinâmico
// em server.ts (evita que db.ts vaze pro bundle do cliente).
//
// Estratégia:
// 1. Sob demanda (fatura, comunicado, relatório): grava na fila + processa
//    síncrono (feedback imediato ao usuário)
// 2. Se falhar: fica na fila com retry automático via CRON
// 3. Lembretes vencidas: apenas @ 12h, apenas faturas vencidas

let transporter: Transporter | undefined;

function origemPublica(): string {
  return process.env.PUBLIC_ORIGIN || "http://localhost:5173";
}

// Contexto do SMTP para acompanhar a mensagem de erro. Sem saber contra QUAL
// servidor e com QUAL usuário a tentativa foi feita, um "535 authentication
// failed" não distingue senha errada de host errado — e quem administra a Loja
// pelo navegador não tem como conferir as variáveis de ambiente do servidor.
// A senha nunca entra aqui.
function contextoSmtp(): string {
  const host = process.env.SMTP_HOST || "(SMTP_HOST vazio)";
  const porta = process.env.SMTP_PORT || "(SMTP_PORT vazio)";
  const usuario = process.env.SMTP_USER || "(SMTP_USER vazio)";
  const senhaDefinida = process.env.SMTP_PASSWORD ? "sim" : "NÃO";
  return `servidor ${host}:${porta}, usuário ${usuario}, senha definida: ${senhaDefinida}`;
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

// Tenta enviar email via SMTP e atualiza fila com resultado
async function tentarEnviarFilaEmail(
  conn: PoolConnection,
  filaId: string,
  destinatarios: string[],
  assunto: string,
  html: string,
  texto: string,
  anexos?: { filename: string; content: Buffer; contentType: string }[],
): Promise<{ sucesso: number; falhas: number; ultimoErro: string | null }> {
  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  let sucesso = 0;
  let falhas = 0;
  let ultimoErro: string | null = null;

  for (const dest of destinatarios) {
    try {
      await getTransporter().sendMail({
        from: remetente,
        to: dest,
        subject: assunto,
        html,
        text: texto,
        attachments: anexos,
      });
      sucesso++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ultimoErro = `${msg} (${contextoSmtp()})`.slice(0, 500);
      falhas++;
      console.error(`Falha ao enviar e-mail para ${dest}:`, ultimoErro);
    }
  }

  // Atualiza status na fila (retry em 2 minutos se falhar)
  const novoStatus = falhas === 0 ? "enviado" : "erro_permanente";
  const enviadoEm = falhas === 0 ? "CURRENT_TIMESTAMP" : null;
  const proximaTentativa = falhas > 0 ? "DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 MINUTE)" : null;

  await conn.query(
    `UPDATE filas_email SET
     status = ?,
     tentativas = tentativas + 1,
     ultimo_erro = ?,
     enviado_em = ${enviadoEm ? "CURRENT_TIMESTAMP" : "NULL"},
     proxima_tentativa = ${proximaTentativa ? "DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)" : "NULL"},
     atualizado_em = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [novoStatus, ultimoErro, filaId],
  );

  return { sucesso, falhas, ultimoErro };
}

// Grava na fila de envio (sob demanda)
async function gravarNaFila(
  conn: PoolConnection,
  params: {
    chave: string;
    tipo:
      | "fatura_emitida"
      | "boas_vindas"
      | "comunicado"
      | "cobranca_manual"
      | "relatorio_manual"
      | "lembrete_vencida";
    destinatarios: string[];
    assunto: string;
    html: string;
    texto: string;
    anexo?: { buffer: Buffer; nome: string; mimeType: string };
    criadoPor?: string;
  },
): Promise<string> {
  // O id precisa ser gerado aqui e gravado junto: quem chama usa o retorno
  // para dar UPDATE na linha depois de tentar enviar. Antes o INSERT deixava
  // o DEFAULT uuid() do MariaDB gerar o id e a função devolvia um randomUUID()
  // sem relação nenhuma com a linha — todo UPDATE ... WHERE id = ? afetava
  // zero linhas. Efeito: a fila ficava eternamente 'pendente' com tentativas 0,
  // ultimo_erro NUNCA era preenchido e o retry do CRON (que procura
  // 'erro_permanente') nunca via nada para reprocessar.
  const id = randomUUID();
  await conn.query(
    `INSERT INTO filas_email (id, chave, tipo, destinatarios_json, assunto, corpo_html, corpo_texto, anexo_buffer, anexo_nome, anexo_mime_type, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.chave,
      params.tipo,
      JSON.stringify(params.destinatarios),
      params.assunto,
      params.html,
      params.texto,
      params.anexo?.buffer || null,
      params.anexo?.nome || null,
      params.anexo?.mimeType || null,
      params.criadoPor || null,
    ],
  );
  return id;
}

// Verifica se já foi enviado com sucesso (para evitar reenvios desnecessários)
async function jaEnviadoComSucesso(conn: PoolConnection, chave: string): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM filas_email WHERE chave = ? AND status = 'enviado' LIMIT 1",
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

// ---------- Fatura emitida (sob demanda, com fila) ----------

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

    const filaId = await gravarNaFila(conn, {
      chave,
      tipo: "fatura_emitida",
      destinatarios: [fatura.email],
      assunto: `Fatura emitida — ${fatura.descricao}`,
      html,
      texto,
    });

    // Processa síncrono (feedback imediato)
    await tentarEnviarFilaEmail(
      conn,
      filaId,
      [fatura.email],
      `Fatura emitida — ${fatura.descricao}`,
      html,
      texto,
    );
  });
}

// ---------- Boas-vindas / primeiro acesso (issue #105, com fila) ----------
// Alternativa opcional ao fluxo já existente de admin comunicar login/senha
// manualmente. Só dispara se o irmão tiver e-mail de contato cadastrado.

export async function enviarEmailBoasVindas(usuarioId: string): Promise<boolean> {
  return withUserConnection(null, async (conn) => {
    const [[dados]] = await conn.query<RowDataPacket[]>(
      `SELECT u.email AS login, i.nome_civil, i.email AS email_contato
       FROM usuarios u JOIN irmaos i ON i.usuario_id = u.id
       WHERE u.id = ?`,
      [usuarioId],
    );
    if (!dados || !dados.email_contato) return false;

    const linkAcesso = `${origemPublica()}/auth`;
    const html = `
      <p>Olá, ${dados.nome_civil}!</p>
      <p>Seu acesso ao sistema de gestão da loja foi criado. Use os dados abaixo para o primeiro acesso:</p>
      <ul>
        <li><strong>Login:</strong> ${dados.login}</li>
        <li><strong>Senha:</strong> ${SENHA_PADRAO}</li>
      </ul>
      <p>Acesse em <a href="${linkAcesso}">${linkAcesso}</a>.</p>
    `;
    const texto = `Olá, ${dados.nome_civil}! Seu acesso foi criado. Login: ${dados.login}, senha: ${SENHA_PADRAO}. Acesse ${linkAcesso}.`;

    const filaId = await gravarNaFila(conn, {
      chave: `boas_vindas:${usuarioId}:${randomUUID()}`,
      tipo: "boas_vindas",
      destinatarios: [dados.email_contato],
      assunto: "Seu acesso ao sistema de gestão da loja",
      html,
      texto,
      criadoPor: usuarioId,
    });

    // Processa síncrono
    const resultado = await tentarEnviarFilaEmail(
      conn,
      filaId,
      [dados.email_contato],
      "Seu acesso ao sistema de gestão da loja",
      html,
      texto,
    );
    return resultado.falhas === 0;
  });
}

// ---------- Comunicado publicado (issue #107, com fila) ----------
// Opcional por comunicado (checkbox desmarcado por padrão).
// Destinatários: irmãos ativos com e-mail, respeitando visibilidade.

export async function enviarEmailComunicado(
  comunicadoId: string,
): Promise<ResultadoEnvioRelatorio> {
  return withUserConnection(null, async (conn) => {
    const [[comunicado]] = await conn.query<RowDataPacket[]>(
      "SELECT titulo, corpo, publico, org_id FROM comunicados WHERE id = ?",
      [comunicadoId],
    );
    if (!comunicado) return [];

    const [destinatarios] = await conn.query<RowDataPacket[]>(
      comunicado.publico === "org"
        ? `SELECT DISTINCT i.email FROM irmaos i
           JOIN irmao_orgs io ON io.irmao_id = i.id
           WHERE i.situacao = 'ativo' AND i.email IS NOT NULL AND i.email != '' AND io.org_id = ?`
        : `SELECT email FROM irmaos WHERE situacao = 'ativo' AND email IS NOT NULL AND email != ''`,
      comunicado.publico === "org" ? [comunicado.org_id] : [],
    );

    const corpoHtml = String(comunicado.corpo).replace(/\n/g, "<br>");
    const html = `<h3>${comunicado.titulo}</h3><p>${corpoHtml}</p>`;
    const texto = `${comunicado.titulo}\n\n${comunicado.corpo}`;
    const chave = `comunicado:${comunicadoId}`;
    const listaEmails = destinatarios.map((r) => (r as { email: string }).email);

    const filaId = await gravarNaFila(conn, {
      chave,
      tipo: "comunicado",
      destinatarios: listaEmails,
      assunto: `Comunicado — ${comunicado.titulo}`,
      html,
      texto,
    });

    // Processa síncrono
    const resultado = await tentarEnviarFilaEmail(
      conn,
      filaId,
      listaEmails,
      `Comunicado — ${comunicado.titulo}`,
      html,
      texto,
    );

    // Retorna resultado por destinatário
    const resultados: ResultadoEnvioRelatorio = listaEmails.map((email) => ({
      destinatario: email,
      sucesso: resultado.sucesso > 0,
    }));
    return resultados;
  });
}

// ---------- Lembrete de fatura em aberto (cron + manual) ----------

type FaturaLembrete = {
  descricao: string;
  data_vencimento: string;
  nome_civil: string;
  valor_original: number;
  valor_pago: number;
};

// Mesmo cálculo usado por relatorioInadimplenciaDetalhado (relatorios.ts):
// multa/juros incidem sobre o SALDO ainda devido (valor - valor_pago), não
// sobre o valor de face da fatura — senão um irmão que já pagou parte é
// cobrado a mais. calcular_multa_juros devolve multa=juros=0 e total=saldo
// quando ainda não venceu, então é seguro chamar sempre.
async function calcularSaldoDevido(
  conn: PoolConnection,
  saldoPrincipal: number,
  vencimento: string,
  hojeISO: string,
): Promise<{ multa: number; juros: number; total: number }> {
  await conn.query("CALL calcular_multa_juros(?, ?, ?, @multa, @juros, @dias, @total)", [
    saldoPrincipal,
    vencimento,
    hojeISO,
  ]);
  const [[out]] = await conn.query<RowDataPacket[]>(
    "SELECT @multa AS multa, @juros AS juros, @total AS total",
  );
  return { multa: Number(out.multa), juros: Number(out.juros), total: Number(out.total) };
}

function montarLembreteFatura(
  fatura: FaturaLembrete,
  saldo: { multa: number; juros: number; total: number },
  hojeISO: string,
) {
  const vencida = new Date(fatura.data_vencimento) < new Date(hojeISO);
  const linhasExtra = [
    fatura.valor_pago > 0 ? `<li><strong>Já pago:</strong> ${brl(fatura.valor_pago)}</li>` : "",
    saldo.multa > 0 ? `<li><strong>Multa:</strong> ${brl(saldo.multa)}</li>` : "",
    saldo.juros > 0 ? `<li><strong>Juros:</strong> ${brl(saldo.juros)}</li>` : "",
  ].join("");
  const html = `
    <p>Olá, ${fatura.nome_civil}!</p>
    <p>${vencida ? "Você tem uma fatura vencida" : "Sua fatura está próxima do vencimento"}:</p>
    <ul>
      <li><strong>Descrição:</strong> ${fatura.descricao}</li>
      <li><strong>Valor original:</strong> ${brl(fatura.valor_original)}</li>
      ${linhasExtra}
      <li><strong>Vencimento:</strong> ${fmtDate(fatura.data_vencimento)}</li>
      <li><strong>Valor devido:</strong> ${brl(saldo.total)}</li>
    </ul>
    <p>Acesse o sistema em <a href="${origemPublica()}/painel/financeiro">${origemPublica()}/painel/financeiro</a> para regularizar.</p>
  `;
  const texto = `${vencida ? "Fatura vencida" : "Fatura próxima do vencimento"}: ${fatura.descricao}, valor devido ${brl(saldo.total)}, vencimento ${fmtDate(fatura.data_vencimento)}. Acesse ${origemPublica()}/painel/financeiro.`;
  const assunto = vencida
    ? `Fatura vencida — ${fatura.descricao}`
    : `Lembrete de fatura — ${fatura.descricao}`;
  return { assunto, html, texto };
}

export type ResultadoLembretes = { avaliadas: number; enviadas: number; falhas: number };
export type ResultadoFilaEmails = {
  processadas: number;
  enviadas: number;
  falhas: number;
  pendentes: number;
};

// CRON @ a cada 2 minutos — Processa fila de emails com retry automático
export async function processarFilaEmails(): Promise<ResultadoFilaEmails> {
  return withUserConnection(null, async (conn) => {
    // Busca filas prontas para retry (status = erro_permanente, proxima_tentativa <= NOW, tentativas < 3)
    const [filas] = await conn.query<RowDataPacket[]>(
      `SELECT id, chave, tipo, destinatarios_json, assunto, corpo_html, corpo_texto, anexo_buffer, anexo_nome, anexo_mime_type, tentativas
       FROM filas_email
       WHERE status = 'erro_permanente'
         AND proxima_tentativa IS NOT NULL
         AND proxima_tentativa <= NOW()
         AND tentativas < 3
       ORDER BY proxima_tentativa ASC
       LIMIT 100`,
    );

    let processadas = 0;
    let enviadas = 0;
    let falhas = 0;

    for (const fila of filas) {
      const destinatarios = JSON.parse(fila.destinatarios_json) as string[];
      const anexos = fila.anexo_buffer
        ? [
            {
              filename: fila.anexo_nome,
              content: fila.anexo_buffer as Buffer,
              contentType: fila.anexo_mime_type,
            },
          ]
        : undefined;

      const resultado = await tentarEnviarFilaEmail(
        conn,
        fila.id,
        destinatarios,
        fila.assunto,
        fila.corpo_html,
        fila.corpo_texto,
        anexos,
      );

      processadas++;
      if (resultado.falhas === 0) enviadas++;
      else falhas++;
    }

    // Conta pendentes ainda aguardando
    const [[pendentesResult]] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM filas_email
       WHERE status IN ('pendente', 'erro_permanente')
         AND proxima_tentativa IS NOT NULL`,
    );
    const pendentes = Number(pendentesResult?.count || 0);

    return { processadas, enviadas, falhas, pendentes };
  });
}

// CRON @ 12:00h — Envia lembretes apenas de faturas VENCIDAS (não antecedência)
export async function executarLembretesFaturas(): Promise<ResultadoLembretes> {
  return withUserConnection(null, async (conn) => {
    // Apenas faturas já vencidas (não vencendo em X dias)
    const [faturas] = await conn.query<RowDataPacket[]>(
      `SELECT l.id, l.descricao, l.valor, l.valor_pago, l.data_vencimento, i.nome_civil, i.email
       FROM lancamentos l JOIN irmaos i ON i.id = l.irmao_id
       WHERE l.tipo = 'entrada' AND l.is_mensalidade = TRUE AND l.pago = FALSE
         AND l.data_vencimento < CURRENT_DATE
         AND i.email IS NOT NULL AND i.email != ''`,
    );

    let enviadas = 0;
    let falhas = 0;
    const hojeISO = new Date().toISOString().slice(0, 10);

    for (const fatura of faturas) {
      // Dedup: uma vez por dia por fatura (chave com data)
      const chave = `lembrete_vencida:${fatura.id}:${hojeISO}`;
      if (await jaEnviadoComSucesso(conn, chave)) continue;

      const saldoPrincipal = Number(fatura.valor) - Number(fatura.valor_pago);
      const saldo = await calcularSaldoDevido(
        conn,
        saldoPrincipal,
        fatura.data_vencimento,
        hojeISO,
      );
      const { assunto, html, texto } = montarLembreteFatura(
        {
          descricao: fatura.descricao,
          data_vencimento: fatura.data_vencimento,
          nome_civil: fatura.nome_civil,
          valor_original: Number(fatura.valor),
          valor_pago: Number(fatura.valor_pago),
        },
        saldo,
        hojeISO,
      );

      const filaId = await gravarNaFila(conn, {
        chave,
        tipo: "lembrete_vencida",
        destinatarios: [fatura.email],
        assunto,
        html,
        texto,
      });

      // Processa síncrono
      const resultado = await tentarEnviarFilaEmail(
        conn,
        filaId,
        [fatura.email],
        assunto,
        html,
        texto,
      );
      if (resultado.falhas === 0) enviadas++;
      else falhas++;
    }

    return { avaliadas: faturas.length, enviadas, falhas };
  });
}

// ---------- Cobrança manual (issue #115, com fila) ----------
// Sob demanda — botão "Gerar cobrança" do relatório de inadimplência.
export async function enviarCobrancaManual(lancamentoId: string): Promise<boolean> {
  return withUserConnection(null, async (conn) => {
    const [[fatura]] = await conn.query<RowDataPacket[]>(
      `SELECT l.descricao, l.valor, l.valor_pago, l.data_vencimento, i.nome_civil, i.email
       FROM lancamentos l JOIN irmaos i ON i.id = l.irmao_id
       WHERE l.id = ?`,
      [lancamentoId],
    );
    if (!fatura || !fatura.email) return false;

    const hojeISO = new Date().toISOString().slice(0, 10);
    const saldoPrincipal = Number(fatura.valor) - Number(fatura.valor_pago);
    const saldo = await calcularSaldoDevido(conn, saldoPrincipal, fatura.data_vencimento, hojeISO);
    const { assunto, html, texto } = montarLembreteFatura(
      {
        descricao: fatura.descricao,
        data_vencimento: fatura.data_vencimento,
        nome_civil: fatura.nome_civil,
        valor_original: Number(fatura.valor),
        valor_pago: Number(fatura.valor_pago),
      },
      saldo,
      hojeISO,
    );

    const filaId = await gravarNaFila(conn, {
      chave: `cobranca_manual:${lancamentoId}:${randomUUID()}`,
      tipo: "cobranca_manual",
      destinatarios: [fatura.email],
      assunto,
      html,
      texto,
    });

    // Processa síncrono
    const resultado = await tentarEnviarFilaEmail(
      conn,
      filaId,
      [fatura.email],
      assunto,
      html,
      texto,
    );
    return resultado.falhas === 0;
  });
}

// ---------- Envio manual de relatório (issue #111, com fila) ----------
// Sob demanda — cada chamada gera uma chave única (randomUUID).

// `erro` só vem preenchido quando sucesso = false. É a mensagem que o servidor
// SMTP devolveu ("Invalid login", "Message size exceeds limit"...), sem a qual
// quem administra a Loja pelo navegador não tem como saber o que corrigir.
export type ResultadoEnvioRelatorio = {
  destinatario: string;
  sucesso: boolean;
  erro?: string;
}[];

export async function enviarArquivoPorEmail(params: {
  destinatarios: string[];
  assunto: string;
  corpoTexto: string;
  anexoBuffer: Buffer;
  anexoNome: string;
  anexoMimeType: string;
}): Promise<ResultadoEnvioRelatorio> {
  return withUserConnection(null, async (conn) => {
    const html = `<p>${params.corpoTexto}</p>`;
    const chave = `relatorio_manual:${randomUUID()}`;

    const filaId = await gravarNaFila(conn, {
      chave,
      tipo: "relatorio_manual",
      destinatarios: params.destinatarios,
      assunto: params.assunto,
      html,
      texto: params.corpoTexto,
      anexo: {
        buffer: params.anexoBuffer,
        nome: params.anexoNome,
        mimeType: params.anexoMimeType,
      },
    });

    // Processa síncrono com anexos
    const remetente = process.env.SMTP_FROM || process.env.SMTP_USER || "";
    let sucessoCount = 0;
    const resultados: ResultadoEnvioRelatorio = [];
    // O motivo real da falha (senha SMTP recusada, host errado, anexo grande
    // demais...) vinha só do console.error, que em produção fica no log do
    // servidor — inacessível para quem administra a Loja pelo navegador. A
    // tela mostrava "Falha ao enviar" sem dizer por quê, e a coluna
    // filas_email.ultimo_erro, que existe justamente para isso, ficava NULL.
    // Agora o erro é guardado e devolvido junto com o resultado.
    let ultimoErro: string | null = null;

    for (const dest of params.destinatarios) {
      try {
        await getTransporter().sendMail({
          from: remetente,
          to: dest,
          subject: params.assunto,
          html,
          text: params.corpoTexto,
          attachments: [
            {
              filename: params.anexoNome,
              content: params.anexoBuffer,
              contentType: params.anexoMimeType,
            },
          ],
        });
        sucessoCount++;
        resultados.push({ destinatario: dest, sucesso: true });
      } catch (err) {
        const msg = `${err instanceof Error ? err.message : String(err)} (${contextoSmtp()})`;
        console.error(`Falha ao enviar relatório para ${dest}:`, msg);
        ultimoErro = msg;
        resultados.push({ destinatario: dest, sucesso: false, erro: msg });
      }
    }

    // Atualiza fila (status = enviado se todos OK, senão erro_permanente)
    const todoEnviado = sucessoCount === params.destinatarios.length;
    await conn.query(
      `UPDATE filas_email SET
       status = ?,
       tentativas = 1,
       ultimo_erro = ?,
       enviado_em = ${todoEnviado ? "CURRENT_TIMESTAMP" : "NULL"},
       atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      // VARCHAR(500) na tabela: corta antes para não estourar a coluna e
      // perder o registro inteiro por causa do tamanho da mensagem.
      [todoEnviado ? "enviado" : "erro_permanente", ultimoErro?.slice(0, 500) ?? null, filaId],
    );

    return resultados;
  });
}
