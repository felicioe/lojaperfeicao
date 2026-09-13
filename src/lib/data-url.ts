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

// Redimensiona/recomprime uma foto no cliente ANTES de subir (achado #568 da
// auditoria mobile): uma foto tirada com celular moderno (4-12 MB) virava até
// ~6,7 MB em base64 (overhead de 33% do encoding), pesado tanto pra subir
// (upload costuma ser bem mais lento que download em 4G) quanto pra baixar de
// novo em toda leitura do perfil — que só exibe uma miniatura pequena.
// Sempre reduz pra JPEG (fotos de pessoa não precisam de transparência) numa
// largura máxima generosa o bastante pra qualquer exibição em tela, bem menor
// que o original.
export function redimensionarImagemParaDataUrl(
  file: File,
  opcoes: { larguraMaxima?: number; qualidade?: number } = {},
): Promise<string> {
  const larguraMaxima = opcoes.larguraMaxima ?? 480;
  const qualidade = opcoes.qualidade ?? 0.82;
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler o arquivo."));
    leitor.onload = () => {
      const dataUrlOriginal = leitor.result as string;
      const img = new Image();
      // Formato que o navegador não consegue decodificar como <img> (raro,
      // dado que o seletor de arquivo já filtra por image/*) — sobe o
      // original sem redimensionar em vez de falhar o upload inteiro.
      img.onerror = () => resolve(dataUrlOriginal);
      img.onload = () => {
        const escala = Math.min(1, larguraMaxima / img.width);
        const largura = Math.round(img.width * escala);
        const altura = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrlOriginal);
          return;
        }
        ctx.drawImage(img, 0, 0, largura, altura);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = dataUrlOriginal;
    };
    leitor.readAsDataURL(file);
  });
}
