// Reconstrói, por evento de conciliação em lote, qual linha do OFX pagou
// qual lançamento — a procedure conciliar_ofx_lote (0044) só grava que a
// SOMA de N linhas do banco bateu com a SOMA de M lançamentos, nunca o
// par individual. Achado do usuário: um evento com 6 Pix de R$ 70 em datas
// diferentes, batido contra 6 mensalidades de meses diferentes, aparecia
// nos relatórios com as 6 mensalidades penduradas em CADA uma das 6 linhas
// do banco — cada Pix "vinculado" a mensalidades que na prática outro Pix
// pagou.
//
// Só reconstrói quando dá pra deduzir com certeza: mesma quantidade dos
// dois lados. Tenta primeiro casar por VALOR idêntico (quando os dois
// lados trazem valor e isso decompõe o lote em grupos do mesmo tamanho,
// sem sobra de nenhum lado) — é o caso mais comum e mais seguro: várias
// linhas do mesmo dia com valores diferentes (achado do usuário, comparado
// com o extrato real do Sicoob — ex.: uma pessoa pagando 3 coisas
// diferentes no mesmo Pix/dia) ficam pareadas certas mesmo sem depender de
// ordem cronológica nenhuma. Só cai pra ordem por data (1º por data ↔ 1º
// por vencimento) quando o valor não decompõe (ex.: as 6 mensalidades de
// R$ 70 do achado original — todas do mesmo valor, só a data separa).
// Quantidades diferentes, ou valor que não decompõe E data repetida dentro
// do mesmo valor, não permitem nenhuma dedução segura — nesse caso quem
// chama deve mostrar que é um lote sem separação possível, não inventar
// um vínculo.
//
// Extraída de relatorios.ts (issue #510) pra ser reutilizada também em
// dashboard.ts e fluxo-caixa.ts — os três lugares que decidem "em que data
// esse lançamento foi de fato pago" precisam da mesma reconstrução, senão
// divergem entre si silenciosamente quando um lote de conciliação junta
// faturas de meses diferentes.
export function parearLotePorOrdem(
  ofx: { id: string; data: string; valor?: number }[],
  lancamentos: { id: string; ordenacao: string; valor?: number }[],
): Map<string, string> | null {
  if (ofx.length === 0 || ofx.length !== lancamentos.length) return null;

  if (ofx.every((o) => o.valor != null) && lancamentos.every((l) => l.valor != null)) {
    const porValorOfx = new Map<string, typeof ofx>();
    for (const o of ofx) {
      const chave = Math.abs(o.valor!).toFixed(2);
      porValorOfx.set(chave, [...(porValorOfx.get(chave) ?? []), o]);
    }
    const porValorLanc = new Map<string, typeof lancamentos>();
    for (const l of lancamentos) {
      const chave = Math.abs(l.valor!).toFixed(2);
      porValorLanc.set(chave, [...(porValorLanc.get(chave) ?? []), l]);
    }
    const chaves = new Set([...porValorOfx.keys(), ...porValorLanc.keys()]);
    const decompoeSemSobra = [...chaves].every(
      (chave) => (porValorOfx.get(chave)?.length ?? 0) === (porValorLanc.get(chave)?.length ?? 0),
    );
    if (decompoeSemSobra) {
      const pares = new Map<string, string>();
      for (const chave of chaves) {
        const ofxDoValor = [...(porValorOfx.get(chave) ?? [])].sort(
          (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
        );
        const lancDoValor = [...(porValorLanc.get(chave) ?? [])].sort(
          (a, b) => a.ordenacao.localeCompare(b.ordenacao) || a.id.localeCompare(b.id),
        );
        ofxDoValor.forEach((o, i) => pares.set(o.id, lancDoValor[i].id));
      }
      return pares;
    }
  }

  const ofxOrdenado = [...ofx].sort(
    (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
  );
  const lancOrdenado = [...lancamentos].sort(
    (a, b) => a.ordenacao.localeCompare(b.ordenacao) || a.id.localeCompare(b.id),
  );
  const pares = new Map<string, string>();
  ofxOrdenado.forEach((o, i) => pares.set(o.id, lancOrdenado[i].id));
  return pares;
}

/** Dado um conjunto de linhas conciliadas em lote (mesma conciliacao_id) e
 * as linhas OFX desse mesmo evento, devolve um mapa id-do-vínculo → data
 * real de pagamento — usando parearLotePorOrdem quando há mais de uma
 * linha OFX no lote, ou a única data disponível quando não há ambiguidade.
 * Uso típico: agrupar `itensPorConciliacao`/`ofxPorConciliacao` por
 * `conciliacao_id` e chamar esta função pra cada grupo. */
export function reconstruirDataPagamentoLote(
  ofxDoLote: { id: string; data: string; valor: number }[],
  itensDoLote: { id: string; ordenacao: string; valor: number }[],
): Map<string, string> {
  const dataPorId = new Map<string, string>();
  if (ofxDoLote.length === 1) {
    // Sem ambiguidade: só 1 linha do banco no evento, é ela mesma.
    for (const item of itensDoLote) dataPorId.set(item.id, ofxDoLote[0].data);
    return dataPorId;
  }
  const pares = parearLotePorOrdem(ofxDoLote, itensDoLote);
  if (!pares) return dataPorId;
  const dataPorOfxId = new Map(ofxDoLote.map((o) => [o.id, o.data]));
  for (const [ofxId, itemId] of pares) {
    dataPorId.set(itemId, dataPorOfxId.get(ofxId)!);
  }
  return dataPorId;
}
