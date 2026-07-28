export const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return new Intl.DateTimeFormat("pt-BR").format(date);
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

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
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  secretario: "Secretário",
  irmao: "Irmão",
};
