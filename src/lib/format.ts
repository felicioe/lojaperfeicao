export const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return new Intl.DateTimeFormat("pt-BR").format(date);
};

// Competência é um período (mês/ano), não um dia — "01/07/2026" sugere uma
// data específica que não existe; "julho de 2026" é o que o campo significa.
export const fmtMesAno = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
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
};
