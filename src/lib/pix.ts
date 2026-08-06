// Gerador do "Pix Copia e Cola" (BR Code, padrão EMV do Banco Central) —
// puro/determinístico, sem chamada a nenhuma API de banco: qualquer chave
// Pix válida gera um código estático que os apps de banco sabem ler.
// Especificação: https://www.bcb.gov.br/estabilidadefinanceira/pix (manual
// de padrões para iniciação do Pix).

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — exigido como
// último campo (63) do BR Code.
function crc16ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Merchant Name/City só aceitam ASCII sem acento, tamanho limitado — corta
// e limpa defensivamente mesmo que os dados já devessem vir sanitizados no
// cadastro da chave.
function sanitizar(s: string, max: number): string {
  const semAcento = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = semAcento.replace(/[^A-Za-z0-9 ]/g, "").trim();
  return (limpo.slice(0, max) || "NA").toUpperCase();
}

export function gerarPixCopiaCola(params: {
  chave: string;
  nomeBeneficiario: string;
  cidade: string;
  valor?: number | null;
  txid?: string | null;
}): string {
  const { chave, nomeBeneficiario, cidade, valor, txid } = params;
  const merchantAccountInfo = tlv("00", "br.gov.bcb.pix") + tlv("01", chave);
  const txidValido = txid && /^[A-Za-z0-9]{1,25}$/.test(txid) ? txid : "***";
  const additionalData = tlv("05", txidValido);

  let payload =
    tlv("00", "01") +
    tlv("26", merchantAccountInfo) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (valor && valor > 0 ? tlv("54", valor.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", sanitizar(nomeBeneficiario, 25)) +
    tlv("60", sanitizar(cidade, 15)) +
    tlv("62", additionalData);

  payload += "6304";
  return payload + crc16ccitt(payload);
}
