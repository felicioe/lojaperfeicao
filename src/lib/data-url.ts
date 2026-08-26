// Arquivos de peça de arquitetura e documento passaram a vir do banco como
// data URL (migração 0117), não mais como um caminho HTTP real em disco.
// Navegação de topo (window.open/target=_blank) para uma data URL é
// bloqueada ou tratada de forma inconsistente entre navegadores — um blob
// URL (revogável, escopado à aba atual) não tem essa restrição e é o
// padrão usado por apps web pra "abrir PDF em nova aba"/imprimir.
export function dataUrlParaBlobUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;
  const binario = atob(match[2]);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const blob = new Blob([bytes], { type: match[1] });
  return URL.createObjectURL(blob);
}

// Um data:/blob: URL só existe dentro desta aba — não é um link que faça
// sentido copiar, mandar por WhatsApp ou passar pro Web Share API (o
// destinatário não teria como abrir). Só URLs http(s) reais são
// compartilháveis dessa forma.
export function ehUrlCompartilhavel(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}
