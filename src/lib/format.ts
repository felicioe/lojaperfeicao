// Instâncias reusadas em vez de criadas a cada chamada (achado #554 da
// auditoria de performance) — construir um Intl.NumberFormat/DateTimeFormat
// não é grátis, e brl/fmtDate/fmtMesAno são chamadas centenas de vezes por
// render em tabelas grandes (relatórios, extratos). Mesmo espírito do
// colatorPtBr já cacheado em use-ordenacao.ts.
const formatadorMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatadorData = new Intl.DateTimeFormat("pt-BR");
const formatadorMesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export const brl = (v: number | null | undefined) => formatadorMoeda.format(Number(v ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return formatadorData.format(date);
};

// Competência é um período (mês/ano), não um dia — "01/07/2026" sugere uma
// data específica que não existe; "julho de 2026" é o que o campo significa.
export const fmtMesAno = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return formatadorMesAno.format(date);
};

export const toISODate = (d: Date) => {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

export const GRAU_LABEL: Record<string, string> = {
  aprendiz: "Aprendiz",
  companheiro: "Companheiro",
  mestre: "Mestre",
};

export const SITUACAO_LABEL: Record<string, string> = {
  ativo: "Ativo",
  quite: "Quite",
  irregular: "Irregular",
  adormecido: "Adormecido",
};

export const TIPO_SESSAO_LABEL: Record<string, string> = {
  ordinaria: "Ordinária",
  magna: "Magna",
  branca: "Branca",
  administrativa: "Administrativa",
  iniciacao: "Iniciação",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  secretario: "Secretário",
  irmao: "Irmão",
  super_admin: "Super administrador",
  editor_cms: "Editor CMS",
  aprovador_cms: "Aprovador CMS",
};
