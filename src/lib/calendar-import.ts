// Parsers de .ics/.csv para importação de calendário (issue #22) — puro
// texto, sem dependência externa. Equivalente a `_parseICSCalendar()` e
// `_parseCSVCalendar()` do legado PHP: extrai título/data/hora/descrição;
// a detecção de grau e checagem de duplicidade ficam no servidor
// (importacao-calendario.ts), não aqui.
export type ItemCalendario = {
  titulo: string;
  data: string; // YYYY-MM-DD
  hora: string | null; // HH:MM
  descricao: string | null;
};

function pegarValorLinha(bloco: string, chave: string): string | null {
  const linha = bloco
    .split(/\r?\n/)
    .find((l) => l.startsWith(chave + ":") || l.startsWith(chave + ";"));
  if (!linha) return null;
  const idx = linha.indexOf(":");
  if (idx === -1) return null;
  return linha
    .slice(idx + 1)
    .replace(/\\n/g, " ")
    .trim();
}

function parseDataICS(valor: string): { data: string; hora: string | null } | null {
  // formatos comuns: YYYYMMDD ou YYYYMMDDTHHMMSS(Z)
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, ano, mes, dia, hh, mm] = m;
  return {
    data: `${ano}-${mes}-${dia}`,
    hora: hh && mm ? `${hh}:${mm}` : null,
  };
}

export function parseICS(texto: string): ItemCalendario[] {
  const itens: ItemCalendario[] = [];
  const blocos = texto.split("BEGIN:VEVENT").slice(1);
  for (const bloco of blocos) {
    const corpo = bloco.split("END:VEVENT")[0];
    const titulo = pegarValorLinha(corpo, "SUMMARY");
    const dtstart = pegarValorLinha(corpo, "DTSTART");
    const descricao = pegarValorLinha(corpo, "DESCRIPTION");
    if (!titulo || !dtstart) continue;
    const dataHora = parseDataICS(dtstart);
    if (!dataHora) continue;
    itens.push({ titulo, data: dataHora.data, hora: dataHora.hora, descricao });
  }
  return itens;
}

const CABECALHOS: Record<string, keyof ItemCalendario> = {
  titulo: "titulo",
  title: "titulo",
  assunto: "titulo",
  data: "data",
  date: "data",
  hora: "hora",
  time: "hora",
  descricao: "descricao",
  descrição: "descricao",
  description: "descricao",
};

function normalizarData(valor: string): string | null {
  // aceita YYYY-MM-DD ou DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function parseCSV(texto: string): ItemCalendario[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) return [];
  const separador = linhas[0].includes(";") ? ";" : ",";
  const cabecalho = linhas[0].split(separador).map((c) => c.trim().toLowerCase());
  const colunas = cabecalho.map((c) => CABECALHOS[c] ?? null);

  const itens: ItemCalendario[] = [];
  for (const linha of linhas.slice(1)) {
    const campos = linha.split(separador);
    const item: Partial<ItemCalendario> = { hora: null, descricao: null };
    colunas.forEach((chave, i) => {
      if (chave) (item as Record<string, string>)[chave] = (campos[i] ?? "").trim();
    });
    if (!item.titulo || !item.data) continue;
    const data = normalizarData(item.data);
    if (!data) continue;
    itens.push({
      titulo: item.titulo,
      data,
      hora: item.hora || null,
      descricao: item.descricao || null,
    });
  }
  return itens;
}

export function parseArquivoCalendario(nomeArquivo: string, texto: string): ItemCalendario[] {
  if (nomeArquivo.toLowerCase().endsWith(".ics")) return parseICS(texto);
  return parseCSV(texto);
}
