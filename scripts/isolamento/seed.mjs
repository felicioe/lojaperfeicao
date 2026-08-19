// Seed de duas lojas para a suíte de isolamento (issue #351).
//
// Regra de ouro do seed: as duas lojas recebem os MESMOS nomes e os MESMOS
// valores. Isso é deliberado — se um vazamento acontecer, o dado invasor vai
// parecer perfeitamente plausível na tela, e é justamente esse o caso que um
// teste com dados diferentes deixaria passar. O que separa uma loja da outra
// é só o id: todo id da Loja A começa com "1" e todo id da Loja B começa com
// "2", então qualquer id de fora salta aos olhos numa resposta.
//
// A loja semente da 0092 (Adonhiram) fica vazia de propósito: ela é o alvo do
// DEFAULT transitório de `loja_id`, então serve de canário — se alguma escrita
// esquecer a loja, o registro cai lá e a suíte acusa.
import bcrypt from "bcryptjs";
import { sql } from "./banco.mjs";

export const SENHA = "Isolamento@2026";
export const LOJA_SEMENTE = "00000000-0000-4000-8000-000000000001";

/** Ids determinísticos: o primeiro caractere identifica a loja. */
const id = (prefixo, n) => `${prefixo}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const LOJAS = [
  { chave: "A", prefixo: "1", slug: "alfa", nome: "Loja Alfa" },
  { chave: "B", prefixo: "2", slug: "beta", nome: "Loja Beta" },
].map((l) => ({
  ...l,
  id: id(l.prefixo, 1),
  usuarioAdmin: id(l.prefixo, 10),
  usuarioTesoureiro: id(l.prefixo, 11),
  usuarioIrmao: id(l.prefixo, 12),
  usuarioEmailCompartilhado: id(l.prefixo, 13),
  org: id(l.prefixo, 20),
  irmaos: [id(l.prefixo, 30), id(l.prefixo, 31), id(l.prefixo, 32)],
  conta: id(l.prefixo, 40),
  contaReceita: id(l.prefixo, 50),
  contaDespesa: id(l.prefixo, 51),
  faturaPaga: id(l.prefixo, 60),
  faturaAberta: id(l.prefixo, 61),
  despesa: id(l.prefixo, 62),
  sessao: id(l.prefixo, 70),
  enquete: id(l.prefixo, 80),
  enqueteOpcao: id(l.prefixo, 81),
  documento: id(l.prefixo, 90),
  peca: id(l.prefixo, 100),
  comunicado: id(l.prefixo, 110),
  terceiro: id(l.prefixo, 120),
  emails: {
    admin: `admin@${l.slug}.test`,
    tesoureiro: `tesoureiro@${l.slug}.test`,
    irmao: `irmao@${l.slug}.test`,
  },
}));

/** Mesmo e-mail nas duas lojas — a unicidade é (loja_id, email), não global. */
export const EMAIL_COMPARTILHADO = "mesmo.email@teste.local";

const esc = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

export function semear() {
  const hash = bcrypt.hashSync(SENHA, 10);
  const partes = [];

  for (const l of LOJAS) {
    partes.push(`
INSERT INTO lojas (id, slug, nome, ativa) VALUES (${esc(l.id)}, ${esc(l.slug)}, ${esc(l.nome)}, TRUE);

INSERT INTO usuarios (id, email, senha_hash, nome_completo, ativo, deve_trocar_senha, consentimento_lgpd_em, loja_id) VALUES
  (${esc(l.usuarioAdmin)}, ${esc(l.emails.admin)}, ${esc(hash)}, 'Administrador', TRUE, FALSE, NOW(), ${esc(l.id)}),
  (${esc(l.usuarioTesoureiro)}, ${esc(l.emails.tesoureiro)}, ${esc(hash)}, 'Tesoureiro', TRUE, FALSE, NOW(), ${esc(l.id)}),
  (${esc(l.usuarioIrmao)}, ${esc(l.emails.irmao)}, ${esc(hash)}, 'Irmão Comum', TRUE, FALSE, NOW(), ${esc(l.id)}),
  (${esc(l.usuarioEmailCompartilhado)}, ${esc(EMAIL_COMPARTILHADO)}, ${esc(hash)}, 'Conta Homônima', TRUE, FALSE, NOW(), ${esc(l.id)});

INSERT INTO usuarios_papeis (usuario_id, papel, loja_id) VALUES
  (${esc(l.usuarioAdmin)}, 'admin', ${esc(l.id)}),
  (${esc(l.usuarioTesoureiro)}, 'tesoureiro', ${esc(l.id)}),
  (${esc(l.usuarioIrmao)}, 'irmao', ${esc(l.id)}),
  (${esc(l.usuarioEmailCompartilhado)}, 'irmao', ${esc(l.id)});

INSERT INTO orgs (id, nome, sigla, natureza, ativo, loja_id)
  VALUES (${esc(l.org)}, 'Loja Simbólica', 'LS', 'loja', TRUE, ${esc(l.id)});

INSERT INTO irmaos (id, usuario_id, nome_civil, nome_simbolico, grau, situacao, valor_mensalidade, email, loja_id) VALUES
  (${esc(l.irmaos[0])}, ${esc(l.usuarioIrmao)}, 'Irmão Um', 'Alfa', 3, 'ativo', 100.00, ${esc(l.emails.irmao)}, ${esc(l.id)}),
  (${esc(l.irmaos[1])}, NULL, 'Irmão Dois', 'Beta', 2, 'ativo', 100.00, NULL, ${esc(l.id)}),
  (${esc(l.irmaos[2])}, NULL, 'Irmão Três', 'Gama', 1, 'ativo', 100.00, NULL, ${esc(l.id)});

INSERT INTO plano_contas (id, codigo, nome, tipo, ativo, analitica, loja_id) VALUES
  (${esc(l.contaReceita)}, '3.1.01', 'Mensalidades', 'receita', TRUE, TRUE, ${esc(l.id)}),
  (${esc(l.contaDespesa)}, '4.1.01', 'Manutenção', 'despesa', TRUE, TRUE, ${esc(l.id)});

INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial, ativo, loja_id)
  VALUES (${esc(l.conta)}, 'Caixa', 'caixa', 0.00, TRUE, ${esc(l.id)});

INSERT INTO lancamentos (id, data, data_vencimento, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id, irmao_id, pago, is_mensalidade, competencia_mes, loja_id) VALUES
  (${esc(l.faturaPaga)}, '2026-07-01', '2026-07-10', '2026-07-08', 'Mensalidade 07/2026', 100.00, 100.00, 'entrada', ${esc(l.conta)}, ${esc(l.contaReceita)}, ${esc(l.irmaos[0])}, TRUE, TRUE, '2026-07-01', ${esc(l.id)}),
  (${esc(l.faturaAberta)}, '2026-08-01', '2026-08-10', NULL, 'Mensalidade 08/2026', 100.00, 0.00, 'entrada', ${esc(l.conta)}, ${esc(l.contaReceita)}, ${esc(l.irmaos[1])}, FALSE, TRUE, '2026-08-01', ${esc(l.id)}),
  (${esc(l.despesa)}, '2026-07-15', '2026-07-20', '2026-07-19', 'Conta de luz', 40.00, 40.00, 'saida', ${esc(l.conta)}, ${esc(l.contaDespesa)}, NULL, TRUE, FALSE, NULL, ${esc(l.id)});

INSERT INTO sessoes (id, data, tipo, grau, org_id, local, loja_id)
  VALUES (${esc(l.sessao)}, '2026-07-05', 'ordinaria', 3, ${esc(l.org)}, 'Templo', ${esc(l.id)});

INSERT INTO presencas (id, sessao_id, irmao_id, presente, loja_id)
  VALUES (${esc(id(l.prefixo, 71))}, ${esc(l.sessao)}, ${esc(l.irmaos[0])}, TRUE, ${esc(l.id)});

INSERT INTO enquetes (id, titulo, descricao, criado_por, loja_id)
  VALUES (${esc(l.enquete)}, 'Data do próximo ágape', 'Consulta rápida', ${esc(l.usuarioAdmin)}, ${esc(l.id)});
INSERT INTO enquete_opcoes (id, enquete_id, texto, ordem, loja_id)
  VALUES (${esc(l.enqueteOpcao)}, ${esc(l.enquete)}, 'Primeiro sábado', 1, ${esc(l.id)});

INSERT INTO documentos (id, titulo, categoria, conteudo, hash_conteudo, criado_por, loja_id)
  VALUES (${esc(l.documento)}, 'Regimento Interno', 'legislacao', 'Conteúdo do regimento.', REPEAT('a', 64), ${esc(l.usuarioAdmin)}, ${esc(l.id)});

INSERT INTO pecas_arquitetura (id, autor_id, titulo, grau, situacao, loja_id)
  VALUES (${esc(l.peca)}, ${esc(l.irmaos[0])}, 'A simbologia do esquadro', 3, 'aprovado', ${esc(l.id)});

INSERT INTO comunicados (id, titulo, corpo, publico, criado_por, loja_id)
  VALUES (${esc(l.comunicado)}, 'Convocação', 'Sessão magna no próximo mês.', 'todos', ${esc(l.usuarioAdmin)}, ${esc(l.id)});

INSERT INTO terceiros (id, tipo, nome, ativo, loja_id)
  VALUES (${esc(l.terceiro)}, 'fornecedor', 'Elétrica Central', TRUE, ${esc(l.id)});
`);
  }

  sql(partes.join("\n"));
}

/** Contagem por loja de cada tabela semeada — base das provas de agregado. */
export const TABELAS_SEMEADAS = [
  "usuarios",
  "irmaos",
  "orgs",
  "plano_contas",
  "contas_financeiras",
  "lancamentos",
  "sessoes",
  "presencas",
  "enquetes",
  "enquete_opcoes",
  "documentos",
  "pecas_arquitetura",
  "comunicados",
  "terceiros",
];
