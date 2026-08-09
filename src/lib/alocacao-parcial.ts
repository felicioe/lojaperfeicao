// Pagamento parcial (issue #131) — sugestão automática de como distribuir
// um valor recebido entre faturas selecionadas: as mais antigas (vencidas
// primeiro) recebem prioridade, até o valor acabar. A última fatura
// tocada pode ficar com saldo parcial; as que vierem depois dela na
// ordem não recebem nada (ficam de fora da alocação sugerida, mas o
// usuário pode ajustar manualmente antes de confirmar). Usa centavos
// inteiros pra não acumular erro de ponto flutuante.

export type FaturaParaAlocar = {
  id: string;
  saldo: number;
  dataVencimento: string | null;
};

export function sugerirAlocacao(
  faturas: FaturaParaAlocar[],
  valorDisponivel: number,
): Record<string, number> {
  const ordenadas = [...faturas].sort((a, b) => {
    if (a.dataVencimento === b.dataVencimento) return 0;
    if (!a.dataVencimento) return 1;
    if (!b.dataVencimento) return -1;
    return a.dataVencimento.localeCompare(b.dataVencimento);
  });
  const alocacao: Record<string, number> = {};
  let restanteCentavos = Math.round(valorDisponivel * 100);
  for (const f of ordenadas) {
    if (restanteCentavos <= 0) break;
    const saldoCentavos = Math.round(f.saldo * 100);
    const aplicarCentavos = Math.min(restanteCentavos, saldoCentavos);
    if (aplicarCentavos > 0) {
      alocacao[f.id] = aplicarCentavos / 100;
      restanteCentavos -= aplicarCentavos;
    }
  }
  return alocacao;
}

export function somaAlocacao(alocacao: Record<string, number>): number {
  return Object.values(alocacao).reduce((s, v) => s + (Number(v) || 0), 0);
}
