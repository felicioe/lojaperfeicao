// Nome do arquivo PDF da fatura (issue #783). Antes cada ponto que gerava
// PDF montava o nome sozinho — `fatura-{competencia}.pdf` ou, sem
// competência, `fatura-{8 primeiros do id}.pdf` — e o resultado não dizia
// nem de quem era a fatura nem quando vencia: ao juntar os PDFs de vários
// irmãos numa pasta, era preciso abrir cada um pra saber qual era qual.
//
// Centralizar aqui é o mesmo cuidado já documentado no cabeçalho de
// fatura-pdf.ts: com uma cópia do nome em cada um dos cinco pontos de uso,
// elas divergem no primeiro ajuste. Todos os pontos agora chamam estas
// funções.
//
// Formato (decisão do usuário, 2026-11-12):
//   "Fatura - Vencimento 10.11.2026 - João da Silva.pdf"
//   "Recibo - Vencimento 10.11.2026 - João da Silva.pdf"
// Ponto como separador de data — o hífen já separa as partes do nome.

export type TipoDocumentoFatura = "Fatura" | "Recibo" | "Faturas";

// Só os campos necessários pra montar o nome — de propósito mais estreito
// que LancamentoDetalhe, pra poder ser usado também com linhas parciais de
// consulta sem forçar carregar regiões/Pix que não importam aqui.
export type DadosParaNomeArquivo = {
  id: string;
  data: string | null;
  data_vencimento: string | null;
  irmao_nome: string | null;
  descricao: string | null;
};

// Windows, macOS e Android recusam estes em nome de arquivo; um só deles
// faz o navegador trocar o nome silenciosamente ou recusar o download.
// Os caracteres de controle (0x00-0x1F e 0x7F) entram junto — um nome
// vindo do banco com quebra de linha produziria um arquivo ilegível no
// Windows. Construídos por código de caractere pra não disparar
// no-control-regex, que existe pra pegar uso acidental deles em regex.
const CARACTERES_PROIBIDOS = new RegExp(
  `[\\\\/:*?"<>|${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
  "g",
);

// Limites de tamanho: o nome completo precisa caber nos 255 bytes que os
// sistemas de arquivo aceitam, e um nome de irmão por extenso já consome
// boa parte disso. O limite é generoso o bastante pra não cortar nenhum
// nome real da Loja.
const MAX_NOME_PESSOA = 60;
const MAX_DESCRICAO = 40;

function limparParte(texto: string, maximo: number): string {
  const limpo = texto
    .replace(CARACTERES_PROIBIDOS, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Ponto e espaço no fim do nome são ignorados/recusados no Windows.
    .replace(/[. ]+$/, "");
  return limpo.length > maximo ? limpo.slice(0, maximo).trim() : limpo;
}

// Formata "YYYY-MM-DD" (coluna DATE do MySQL) como "10.11.2026" montando a
// string na mão: `new Date(...)` interpretaria como UTC e, em fuso negativo,
// o vencimento cairia no dia anterior — erro que só apareceria em produção.
function formatarDataParaNome(d: string | null): string | null {
  if (!d) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR").format(date).replace(/\//g, ".");
}

// Fallbacks (decisão do usuário): sem irmão vinculado — lançamento de
// tronco, por exemplo — usa a descrição; sem vencimento, usa a data de
// emissão. O nome nunca quebra por falta de dado.
function nomeDaPessoa(fatura: DadosParaNomeArquivo): string | null {
  const irmao = limparParte(fatura.irmao_nome ?? "", MAX_NOME_PESSOA);
  if (irmao) return irmao;
  const descricao = limparParte(fatura.descricao ?? "", MAX_DESCRICAO);
  return descricao || null;
}

function vencimentoDa(fatura: DadosParaNomeArquivo): string | null {
  return formatarDataParaNome(fatura.data_vencimento ?? fatura.data);
}

function montar(partes: (string | null)[]): string {
  const preenchidas = partes.filter((p): p is string => !!p);
  return `${preenchidas.join(" - ")}.pdf`;
}

export function nomeArquivoFatura(
  fatura: DadosParaNomeArquivo,
  tipo: TipoDocumentoFatura = "Fatura",
): string {
  const data = vencimentoDa(fatura);
  const pessoa = nomeDaPessoa(fatura);
  // Último recurso: sem data e sem pessoa (fatura sem descrição e sem
  // irmão), ainda é melhor um identificador curto do que "Fatura.pdf"
  // repetido em todo download.
  const identificador = data || pessoa ? null : fatura.id.slice(0, 8);
  return montar([tipo, data ? `Vencimento ${data}` : null, pessoa ?? identificador]);
}

// Várias faturas baixadas juntas (tesouraria/faturas/imprimir.tsx). Quando
// todas são do mesmo irmão — o caso comum, o botão agrupa as pendências
// dele — o nome segue o formato de uma fatura, no plural; o vencimento
// único aparece quando todas vencem no mesmo dia, senão conta os vencimentos.
export function nomeArquivoFaturasAgrupadas(faturas: DadosParaNomeArquivo[]): string {
  if (faturas.length === 1) return nomeArquivoFatura(faturas[0], "Fatura");
  const nomes = new Set(faturas.map((f) => nomeDaPessoa(f) ?? ""));
  const mesmoIrmao = nomes.size === 1 && [...nomes][0] !== "";
  const vencimentos = new Set(faturas.map(vencimentoDa).filter((d): d is string => !!d));
  const vencimento =
    vencimentos.size === 1
      ? `Vencimento ${[...vencimentos][0]}`
      : vencimentos.size > 1
        ? `${vencimentos.size} vencimentos`
        : null;
  return montar(["Faturas", vencimento, mesmoIrmao ? [...nomes][0] : `${faturas.length} faturas`]);
}

// Um mesmo irmão pode ter várias faturas anexadas no mesmo e-mail
// (enviarFaturasAbertasPorEmail) e, sem esta desambiguação, dois anexos
// cairiam no mesmo nome e um sobrescreveria o outro. Mesmo esquema que os
// navegadores usam ao baixar arquivos repetidos: "… (2).pdf", "… (3).pdf".
export function desambiguarNomesArquivo(nomes: string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((nome) => {
    if (!usados.has(nome)) {
      usados.add(nome);
      return nome;
    }
    const base = nome.replace(/\.pdf$/i, "");
    let indice = 2;
    let candidato = `${base} (${indice}).pdf`;
    while (usados.has(candidato)) {
      indice++;
      candidato = `${base} (${indice}).pdf`;
    }
    usados.add(candidato);
    return candidato;
  });
}
