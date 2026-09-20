// Cliente da Web Push API (achado #647) — pede permissão, assina no
// PushManager do navegador e grava a inscrição no servidor. O backend de
// disparo (push-dispatch.ts) já existe desde a issue #27; faltava só isto.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Normalizado = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = window.atob(base64Normalizado);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

export function suportaPush(): boolean {
  // typeof, não acesso direto: esta função roda durante o SSR também (mesmo
  // padrão de browserSupportsWebAuthn, já usado neste mesmo arquivo de
  // Segurança da Conta pro card de Passkeys) — window/navigator/Notification
  // não existem no servidor, e um acesso direto lançaria ReferenceError
  // antes mesmo de a página carregar no navegador.
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/** Inscrição ativa NESTE navegador, ou null se nunca inscrito aqui. Não diz
 * se o servidor ainda a reconhece — só o estado local do navegador. */
export async function inscricaoPushAtual(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null;
  const registro = await navigator.serviceWorker.ready;
  return registro.pushManager.getSubscription();
}

/** Pede permissão (se ainda não concedida/negada) e assina no PushManager.
 * Lança se o usuário negar ou se a chave pública VAPID não estiver
 * configurada no servidor (Hostinger). */
export async function assinarPushNesteAparelho(chavePublica: string): Promise<PushSubscription> {
  if (Notification.permission === "denied") {
    throw new Error("Notificações bloqueadas neste navegador. Permita em Configurações do site.");
  }
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    throw new Error("Permissão de notificação não concedida.");
  }
  const registro = await navigator.serviceWorker.ready;
  const existente = await registro.pushManager.getSubscription();
  return (
    existente ??
    registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(chavePublica) as BufferSource,
    })
  );
}

export function inscricaoParaPayload(inscricao: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  const chaves = inscricao.toJSON().keys;
  if (!chaves?.p256dh || !chaves?.auth) {
    throw new Error("Inscrição de push incompleta — tente novamente.");
  }
  return { endpoint: inscricao.endpoint, p256dh: chaves.p256dh, auth: chaves.auth };
}
