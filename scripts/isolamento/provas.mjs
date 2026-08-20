// Provas de isolamento entre duas lojas (issue #351).
//
// As chamadas acontecem DENTRO do navegador, importando os módulos de
// `/src/lib/backend/*.ts` que o Vite serve em dev. Isso é proposital: é o
// mesmo cliente RPC e o mesmo cookie de sessão que a aplicação usa, então o
// que passa aqui passa de verdade — mas dá pra invocar qualquer função com
// qualquer id, inclusive os que a interface jamais ofereceria.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// O Playwright não entra em package.json de propósito: a Hostinger roda
// `npm install` no deploy e baixaria os navegadores a cada publicação, sem
// nunca rodar esta suíte. Aqui ele é resolvido em tempo de execução — do
// projeto, se alguém instalou, senão da instalação global.
async function carregarChromium() {
  const tentativas = [process.env.ISOLAMENTO_PLAYWRIGHT, "playwright"].filter(Boolean);
  try {
    const raizGlobal = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    tentativas.push(pathToFileURL(`${raizGlobal}/playwright/index.mjs`).href);
  } catch {
    /* sem npm global acessível */
  }
  for (const alvo of tentativas) {
    try {
      return (await import(alvo)).chromium;
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error(
    "Playwright não encontrado. Instale com `npm i -D playwright` ou aponte ISOLAMENTO_PLAYWRIGHT para o módulo.",
  );
}

const HOJE = "2026-12-31";
const INICIO = "2026-01-01";

/** Toda função GET sem argumento do backend: a varredura ampla da prova 1. */
const LEITURAS_SEM_ARGUMENTO = [
  ["administracao-fechamento-periodo", "listarPeriodosFechados"],
  ["administracao-fechamento-periodo", "listarEventosPeriodosFechados"],
  ["administracao-reset", "contarMovimentoFinanceiro"],
  ["backups", "listarBackupsGerados"],
  ["comissoes", "listarComissoes"],
  ["comunicacoes", "listarComunicados"],
  ["comunicacoes", "contarComunicadosNaoLidos"],
  ["configuracoes-lgpd", "obterConfiguracoesLgpd"],
  ["contabilidade-fechamento", "listarFechamentos"],
  ["contabilidade-fechamento", "listarEventosFechamento"],
  ["contabilidade-fechamento", "listarNomesUsuarios"],
  ["contabilidade-orcamento", "listarContasOrcamento"],
  ["contabilidade-orcamento", "listarOrcamentos"],
  ["contabilidade", "listarContasAnaliticas"],
  ["contabilidade", "listarSaldoPlanoContas"],
  ["contabilidade", "listarAuditoriaDesbalanceados"],
  ["dashboard", "contarMembrosAtivos"],
  ["dashboard", "contarSessoesMes"],
  ["dashboard", "listarAniversariantesMes"],
  ["dashboard", "obterResumoContasReceber"],
  ["documentos", "listarDocumentos"],
  ["enquetes", "listarEnquetes"],
  ["eventos", "listarEventos"],
  ["exportacao", "listarModulosExportaveis"],
  ["fluxo-caixa", "obterSaldoBaseContas"],
  ["gestoes", "listarCargos"],
  ["gestoes", "listarGestoes"],
  ["interstico", "listarElegibilidadeInterstico"],
  ["irmaos", "listarIrmaos"],
  ["irmaos", "listarIrmaosNomes"],
  ["irmaos", "obterMeuIrmao"],
  ["irmaos", "obterStatusQuitacao"],
  ["notificacoes", "listarNotificacoes"],
  ["orgs", "listarPotencias"],
  ["orgs", "listarOrgs"],
  ["orgs", "listarUsoOrgs"],
  ["pecas-arquitetura", "listarPecasArquitetura"],
  ["plano-contas", "listarPlanoContas"],
  ["planos-ensino", "listarPlanosEnsino"],
  ["relatorios", "relatorioFrequencia"],
  ["relatorios", "relatorioInadimplenciaDetalhado"],
  ["sessoes", "listarSessoes"],
  ["sessoes", "listarResponsaveisSessoes"],
  ["tabela-valores", "listarTabelaValores"],
  ["terceiros", "listarTerceiros"],
  ["terceiros", "listarFornecedores"],
  ["tesouraria-contas-pagar", "listarContasPagarAbertas"],
  ["tesouraria-contas-pagar", "listarContasPagarPagas"],
  ["tesouraria-contas", "listarContasFinanceiras"],
  ["tesouraria-contas", "listarSaldoContas"],
  ["tesouraria-contas", "listarTodasChavesPix"],
  ["tesouraria-faturas", "listarFaturasAbertas"],
  ["tesouraria-parametros", "obterParametrosFinanceiros"],
  ["tesouraria-parcelamentos", "listarParcelamentos"],
  ["tesouraria-recibos", "listarRecibos"],
  ["tesouraria-recibos", "listarRecibosAvulsos"],
  ["tesouraria-recibos", "listarConciliacoesParaRecibo"],
  ["tesouraria-recorrentes", "listarDespesasRecorrentes"],
  ["tesouraria-tronco", "obterResumoTronco"],
  ["usuarios", "listarUsuarios"],
  ["usuarios", "listarIrmaosSemAcesso"],
];

/** Leituras que recebem um id — aqui vai o id da OUTRA loja (IDOR). */
const leiturasComIdAlheio = (b) => [
  ["irmaos", "obterIrmao", { id: b.irmaos[0] }],
  ["irmaos", "listarIrmaoOrgs", { irmaoId: b.irmaos[0] }],
  ["irmaos", "listarIrmaoElevacoes", { irmaoId: b.irmaos[0] }],
  ["irmaos", "listarIrmaoFormacao", { irmaoId: b.irmaos[0] }],
  ["irmaos", "listarIrmaoFilhos", { irmaoId: b.irmaos[0] }],
  ["irmaos", "listarIrmaoParentes", { irmaoId: b.irmaos[0], tipo: "pai" }],
  ["irmaos", "listarLancamentosIrmao", { irmaoId: b.irmaos[0] }],
  ["irmaos", "listarFrequenciaIrmao", { irmaoId: b.irmaos[0] }],
  ["irmaos", "listarCargosHistoricoIrmao", { irmaoId: b.irmaos[0] }],
  ["enquetes", "listarOpcoesEnquete", { enqueteId: b.enquete }],
  ["enquetes", "listarResultadoEnquete", { enqueteId: b.enquete }],
  ["pecas-arquitetura", "obterPecaArquitetura", { id: b.peca }],
  ["sessoes", "obterSessao", { id: b.sessao }],
  ["sessoes", "listarPresencas", { sessaoId: b.sessao }],
  ["sessoes", "listarMembrosOrg", { orgId: b.org }],
  ["contabilidade", "listarItensRazao", { contaId: b.contaReceita, de: INICIO, ate: HOJE }],
  ["contabilidade", "obterSaldoAnteriorConta", { contaId: b.contaReceita, antesDe: HOJE }],
  ["tesouraria-contas", "listarChavesPix", { contaId: b.conta }],
];

/**
 * Escritas apontadas para a outra loja. O veredito NÃO é "lançou erro" — é o
 * estado do banco depois: uma escrita escopada simplesmente não acha a linha
 * e afeta 0 registros, sem erro nenhum, e isso está correto. O que não pode
 * é a linha da outra loja mudar.
 */
const escritasCruzadas = (b) => [
  {
    nome: "excluirIrmao",
    modulo: "irmaos",
    fn: "excluirIrmao",
    arg: { id: b.irmaos[2] },
    conferir: (sql) => sql(`SELECT COUNT(*) FROM irmaos WHERE id = '${b.irmaos[2]}'`) === "1",
    esperado: "o irmão da outra loja continua existindo",
  },
  {
    nome: "alternarAtivoConta",
    modulo: "plano-contas",
    fn: "alternarAtivoConta",
    arg: { id: b.contaReceita, ativo: false },
    conferir: (sql) => sql(`SELECT ativo FROM plano_contas WHERE id = '${b.contaReceita}'`) === "1",
    esperado: "a conta da outra loja continua ativa",
  },
  {
    nome: "excluirEnquete",
    modulo: "enquetes",
    fn: "excluirEnquete",
    arg: { id: b.enquete },
    conferir: (sql) => sql(`SELECT COUNT(*) FROM enquetes WHERE id = '${b.enquete}'`) === "1",
    esperado: "a enquete da outra loja continua existindo",
  },
  {
    nome: "excluirDocumento",
    modulo: "documentos",
    fn: "excluirDocumento",
    arg: { id: b.documento },
    conferir: (sql) => sql(`SELECT COUNT(*) FROM documentos WHERE id = '${b.documento}'`) === "1",
    esperado: "o documento da outra loja continua existindo",
  },
  {
    nome: "excluirComunicado",
    modulo: "comunicacoes",
    fn: "excluirComunicado",
    arg: { id: b.comunicado },
    conferir: (sql) => sql(`SELECT COUNT(*) FROM comunicados WHERE id = '${b.comunicado}'`) === "1",
    esperado: "o comunicado da outra loja continua existindo",
  },
  {
    nome: "excluirPecaArquitetura",
    modulo: "pecas-arquitetura",
    fn: "excluirPecaArquitetura",
    arg: { id: b.peca },
    conferir: (sql) => sql(`SELECT COUNT(*) FROM pecas_arquitetura WHERE id = '${b.peca}'`) === "1",
    esperado: "a peça da outra loja continua existindo",
  },
  {
    nome: "alternarAtivoTerceiro",
    modulo: "terceiros",
    fn: "alternarAtivoTerceiro",
    arg: { id: b.terceiro, ativo: false },
    conferir: (sql) => sql(`SELECT ativo FROM terceiros WHERE id = '${b.terceiro}'`) === "1",
    esperado: "o fornecedor da outra loja continua ativo",
  },
  {
    nome: "togglePresenca",
    modulo: "sessoes",
    fn: "togglePresenca",
    arg: { sessaoId: b.sessao, irmaoId: b.irmaos[0], presente: false },
    conferir: (sql) =>
      sql(`SELECT presente FROM presencas WHERE sessao_id = '${b.sessao}'`) === "1" &&
      sql(`SELECT COUNT(*) FROM presencas WHERE sessao_id = '${b.sessao}'`) === "1",
    esperado: "a presença da outra loja continua marcada e nenhuma cópia foi criada",
  },
];

/**
 * Preenche e envia o formulário até entrar. O servidor sobe a frio a cada
 * execução, e o primeiro clique costuma cair antes de o React ter hidratado a
 * página — aí o clique não faz nada e nenhuma mensagem aparece. Por isso o
 * ciclo inteiro (preencher + enviar) é repetido, e não só o clique.
 */
async function tentarLogin(pagina, base, email, senha, tentativas = 12) {
  await pagina.goto(`${base}/auth`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await pagina
    .getByRole("button", { name: /entrar/i })
    .first()
    .waitFor({ state: "visible" });
  for (let i = 1; i <= tentativas; i++) {
    await pagina.waitForTimeout(i === 1 ? 4000 : 2000);
    try {
      await pagina
        .getByLabel(/e-?mail/i)
        .first()
        .fill(email);
      await pagina.getByLabel(/senha/i).first().fill(senha);
      await pagina
        .getByRole("button", { name: /entrar/i })
        .first()
        .click();
      await pagina.waitForURL(/dashboard|painel/, { timeout: 15_000 });
      return true;
    } catch {
      if (/dashboard|painel/.test(pagina.url())) return true;
      // Mensagem de recusa do servidor: insistir não muda o resultado.
      const texto = await pagina.locator("body").innerText();
      if (/inválidos|mais de uma loja|inativo|bloquead/i.test(texto)) return false;
    }
  }
  return /dashboard|painel/.test(pagina.url());
}

async function entrar(navegador, base, email, senha) {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 1000 } });
  const pagina = await contexto.newPage();
  const ok = await tentarLogin(pagina, base, email, senha);
  if (!ok) throw new Error(`login de ${email} não completou`);
  return pagina;
}

/** Chama uma server function no contexto do navegador, com a sessão em vigor. */
const chamar = (pagina, modulo, fn, arg) =>
  pagina.evaluate(
    async ({ modulo, fn, arg }) => {
      const mod = await import(`/src/lib/backend/${modulo}.ts`);
      if (typeof mod[fn] !== "function") return { erro: `função ${fn} não existe em ${modulo}` };
      try {
        const r = arg === undefined ? await mod[fn]() : await mod[fn]({ data: arg });
        return { valor: r };
      } catch (e) {
        return { recusou: String(e?.message ?? e).slice(0, 200) };
      }
    },
    { modulo, fn, arg },
  );

const vazio = (v) =>
  v === null ||
  v === undefined ||
  (Array.isArray(v) && v.length === 0) ||
  v === 0 ||
  (typeof v === "object" && Object.keys(v).length === 0);

export async function rodarProvas({
  base,
  lojaA,
  lojaB,
  senha,
  sql,
  idsDeFora,
  emailCompartilhado,
}) {
  const resultados = [];
  const registrar = (grupo, nome, ok, detalhe = "") =>
    resultados.push({ grupo, nome, ok, detalhe });

  const chromium = await carregarChromium();
  const navegador = await chromium.launch();
  try {
    const pagina = await entrar(navegador, base, lojaA.emails.admin, senha);

    // ---- Prova 1: nenhuma leitura devolve id de fora da loja -----------------
    const procurarVazamento = (valor) => {
      const texto = JSON.stringify(valor ?? null);
      const achados = idsDeFora.filter((id) => texto.includes(id));
      return achados;
    };

    for (const [modulo, fn] of LEITURAS_SEM_ARGUMENTO) {
      const r = await chamar(pagina, modulo, fn);
      if (r.erro) {
        registrar("leitura", `${modulo}.${fn}`, false, r.erro);
        continue;
      }
      if (r.recusou) {
        // Recusar é resposta legítima (papel insuficiente) — não vaza nada.
        registrar("leitura", `${modulo}.${fn}`, true, `recusou: ${r.recusou.slice(0, 60)}`);
        continue;
      }
      const vazados = procurarVazamento(r.valor);
      registrar(
        "leitura",
        `${modulo}.${fn}`,
        vazados.length === 0,
        vazados.length ? `ids de outra loja na resposta: ${vazados.slice(0, 3).join(", ")}` : "",
      );
    }

    // ---- Prova 2: agregados batem com a loja A sozinha -----------------------
    // As duas lojas têm valores idênticos de propósito: um vazamento dobra o
    // número em vez de deixá-lo estranho, e é isso que se mede aqui.
    const agregados = [
      [
        "dashboard.contarMembrosAtivos",
        "dashboard",
        "contarMembrosAtivos",
        (v) => v === 3,
        "3 irmãos ativos",
      ],
      [
        "irmaos.listarIrmaos",
        "irmaos",
        "listarIrmaos",
        (v) => Array.isArray(v) && v.length === 3,
        "3 irmãos",
      ],
      [
        "plano-contas.listarPlanoContas",
        "plano-contas",
        "listarPlanoContas",
        (v) => Array.isArray(v) && v.length === 2,
        "2 contas contábeis",
      ],
      [
        "tesouraria-faturas.listarFaturasAbertas",
        "tesouraria-faturas",
        "listarFaturasAbertas",
        (v) => Array.isArray(v) && v.length === 1,
        "1 fatura em aberto",
      ],
      [
        "sessoes.listarSessoes",
        "sessoes",
        "listarSessoes",
        (v) => Array.isArray(v) && v.length === 1,
        "1 sessão",
      ],
      [
        "tesouraria-contas.listarSaldoContas",
        "tesouraria-contas",
        "listarSaldoContas",
        (v) => Array.isArray(v) && v.length === 1 && Math.abs(Number(v[0].saldo_atual) - 60) < 0.01,
        "1 conta com saldo 60,00 (100 recebidos - 40 pagos)",
      ],
    ];
    for (const [nome, modulo, fn, confere, esperado] of agregados) {
      const r = await chamar(pagina, modulo, fn);
      const ok = !r.recusou && !r.erro && confere(r.valor);
      registrar(
        "agregado",
        nome,
        ok,
        ok ? "" : `esperado ${esperado}, veio ${JSON.stringify(r.valor ?? r).slice(0, 160)}`,
      );
    }

    // ---- Prova 3: exportação e backup só com dado da loja --------------------
    const modulos = await chamar(pagina, "exportacao", "listarModulosExportaveis");
    const nomesModulos = Array.isArray(modulos.valor)
      ? modulos.valor.map((m) => m.chave ?? m.id ?? m.nome ?? m)
      : [];
    const exportado = await chamar(pagina, "exportacao", "exportarTudo");
    if (exportado.recusou || exportado.erro) {
      registrar("exportacao", "exportarTudo", false, exportado.recusou ?? exportado.erro);
    } else {
      const vazados = procurarVazamento(exportado.valor);
      registrar(
        "exportacao",
        `exportarTudo (${nomesModulos.length} módulos)`,
        vazados.length === 0,
        vazados.length ? `ids de outra loja no arquivo: ${vazados.slice(0, 3).join(", ")}` : "",
      );
    }

    // ---- Prova 4: IDOR de leitura -------------------------------------------
    for (const [modulo, fn, arg] of leiturasComIdAlheio(lojaB)) {
      const r = await chamar(pagina, modulo, fn, arg);
      if (r.erro) {
        registrar("idor", `${modulo}.${fn}`, false, r.erro);
        continue;
      }
      if (r.recusou) {
        registrar("idor", `${modulo}.${fn}`, true, "recusou");
        continue;
      }
      const vazados = procurarVazamento(r.valor);
      const ok = vazados.length === 0 && vazio(r.valor);
      registrar(
        "idor",
        `${modulo}.${fn}`,
        ok,
        ok
          ? ""
          : vazados.length
            ? `devolveu registro da outra loja: ${vazados.slice(0, 2).join(", ")}`
            : `devolveu conteúdo em vez de vazio: ${JSON.stringify(r.valor).slice(0, 160)}`,
      );
    }

    // ---- Controle positivo ---------------------------------------------------
    // Sem isto a suíte passaria com um sistema que simplesmente não devolve
    // nada a ninguém: as mesmas funções, com os ids da PRÓPRIA loja, têm que
    // responder normalmente.
    const controles = [
      [
        "irmaos.obterIrmao",
        "irmaos",
        "obterIrmao",
        { id: lojaA.irmaos[0] },
        (v) => v?.id === lojaA.irmaos[0],
      ],
      [
        "irmaos.listarFrequenciaIrmao",
        "irmaos",
        "listarFrequenciaIrmao",
        { irmaoId: lojaA.irmaos[0] },
        (v) => Array.isArray(v) && v.length === 1 && v[0].presente === true,
      ],
      [
        "irmaos.listarLancamentosIrmao",
        "irmaos",
        "listarLancamentosIrmao",
        { irmaoId: lojaA.irmaos[0] },
        (v) => Array.isArray(v) && v.length >= 1,
      ],
      [
        "sessoes.obterSessao",
        "sessoes",
        "obterSessao",
        { id: lojaA.sessao },
        (v) => v?.id === lojaA.sessao,
      ],
      [
        "sessoes.listarPresencas",
        "sessoes",
        "listarPresencas",
        { sessaoId: lojaA.sessao },
        (v) => Array.isArray(v) && v.length === 1,
      ],
      [
        "enquetes.listarOpcoesEnquete",
        "enquetes",
        "listarOpcoesEnquete",
        { enqueteId: lojaA.enquete },
        (v) => Array.isArray(v) && v.length === 1,
      ],
      [
        "pecas-arquitetura.obterPecaArquitetura",
        "pecas-arquitetura",
        "obterPecaArquitetura",
        { id: lojaA.peca },
        (v) => v?.id === lojaA.peca,
      ],
    ];
    for (const [nome, modulo, fn, arg, confere] of controles) {
      const r = await chamar(pagina, modulo, fn, arg);
      const ok = !r.recusou && !r.erro && confere(r.valor);
      registrar(
        "controle",
        nome,
        ok,
        ok ? "" : `com o id da própria loja deveria responder: ${JSON.stringify(r).slice(0, 160)}`,
      );
    }

    // ---- Prova 5: escrita cruzada -------------------------------------------
    for (const caso of escritasCruzadas(lojaB)) {
      await chamar(pagina, caso.modulo, caso.fn, caso.arg);
      const intacto = caso.conferir(sql);
      registrar(
        "escrita",
        `${caso.modulo}.${caso.fn}`,
        intacto,
        intacto ? "" : `ESTADO ALTERADO — esperado que ${caso.esperado}`,
      );
    }

    // Canário: nada pode ter caído na loja semente por causa do DEFAULT.
    const canario = sql(
      `SELECT (SELECT COUNT(*) FROM irmaos WHERE loja_id = '00000000-0000-4000-8000-000000000001')
            + (SELECT COUNT(*) FROM lancamentos WHERE loja_id = '00000000-0000-4000-8000-000000000001')
            + (SELECT COUNT(*) FROM presencas WHERE loja_id = '00000000-0000-4000-8000-000000000001')`,
    );
    registrar(
      "escrita",
      "canário da loja semente",
      canario === "0",
      canario === "0"
        ? ""
        : `${canario} registro(s) caíram na loja semente pelo DEFAULT de loja_id`,
    );

    await pagina.context().close();

    // ---- Prova 6: login ------------------------------------------------------
    const paginaB = await entrar(navegador, base, lojaB.emails.admin, senha);
    const irmaosB = await chamar(paginaB, "irmaos", "listarIrmaos");
    const idsA = idsDeFora.filter((id) => id.startsWith(lojaA.prefixo));
    const textoB = JSON.stringify(irmaosB.valor ?? null);
    const contaminado = idsA.filter((id) => textoB.includes(id));
    registrar(
      "login",
      "usuário da loja B enxerga só a loja B",
      contaminado.length === 0 && Array.isArray(irmaosB.valor) && irmaosB.valor.length === 3,
      contaminado.length
        ? `ids da loja A na sessão da loja B: ${contaminado.slice(0, 3).join(", ")}`
        : "",
    );
    await paginaB.context().close();

    // Papel sem privilégio: continua vendo o próprio cadastro (senão a
    // checagem de loja teria virado um "nega tudo") e continua sem ver o do
    // irmão ao lado — aqui a barreira é de papel, não de loja.
    const paginaIrmao = await entrar(navegador, base, lojaA.emails.irmao, senha);
    const proprio = await chamar(paginaIrmao, "irmaos", "obterIrmao", { id: lojaA.irmaos[0] });
    registrar(
      "controle",
      "irmão vê o próprio cadastro",
      proprio.valor?.id === lojaA.irmaos[0],
      proprio.valor?.id === lojaA.irmaos[0] ? "" : JSON.stringify(proprio).slice(0, 160),
    );
    const alheio = await chamar(paginaIrmao, "irmaos", "obterIrmao", { id: lojaA.irmaos[1] });
    registrar(
      "controle",
      "irmão não vê o cadastro de outro irmão da mesma loja",
      !!alheio.recusou || vazio(alheio.valor),
      alheio.recusou || vazio(alheio.valor) ? "" : "devolveu o cadastro de outro irmão",
    );
    await paginaIrmao.context().close();

    // E-mail que existe nas duas lojas: sem resolução por subdomínio (#338), a
    // resposta correta é recusar, não escolher uma loja qualquer.
    const contexto = await navegador.newContext();
    const paginaAmbigua = await contexto.newPage();
    const entrouMesmoAssim = await tentarLogin(paginaAmbigua, base, emailCompartilhado, senha, 4);
    registrar(
      "login",
      "e-mail repetido nas duas lojas não entra numa loja arbitrária",
      !entrouMesmoAssim,
      entrouMesmoAssim ? `entrou em ${paginaAmbigua.url()} escolhendo uma loja sozinho` : "",
    );
    await contexto.close();
  } finally {
    await navegador.close();
  }

  return resultados;
}
