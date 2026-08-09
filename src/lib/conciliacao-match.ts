// Sugestão automática de faturas por depositante (issue #123) — extrai um
// "nome provável" a partir da descrição de uma linha do extrato OFX,
// removendo termos bancários genéricos que não ajudam a identificar quem
// pagou (ex.: "PIX RECEBIDO - JOAO DA SILVA" vira "joao da silva").
// Puramente client-side (string matching), sem chamada ao servidor.

const TERMOS_BANCARIOS = new Set([
  "pix",
  "recebido",
  "recebimento",
  "enviado",
  "envio",
  "transferencia",
  "ted",
  "doc",
  "deposito",
  "credito",
  "debito",
  "de",
  "da",
  "do",
  "para",
  "pagamento",
  "compensacao",
  "compra",
  "boleto",
  "cobranca",
  "liquidacao",
  "origem",
  "destino",
  "cpf",
  "cnpj",
]);

export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extrairPossivelNome(descricaoOfx: string): string {
  const termos = normalizarTexto(descricaoOfx)
    .split(" ")
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !TERMOS_BANCARIOS.has(t));
  // Só primeiro nome + sobrenome: juntar todos os termos restantes trazia
  // lixo da descrição do banco (ex.: "outra", número de agência/conta) que
  // não faz parte do nome e quebrava o filtro por substring na tela de
  // conciliação.
  return termos.slice(0, 2).join(" ");
}
