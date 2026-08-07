import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarNotificacoes,
  obterChavePublicaVapid,
  salvarInscricaoPush,
} from "@/lib/backend/notificacoes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, BellRing, Cake, FileWarning, RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONE_TIPO = {
  aniversario: Cake,
  fatura_vencida: FileWarning,
  recorrente_pendente: RefreshCw,
  interstico_completo: TrendingUp,
} as const;

function base64ParaUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Seguro = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64Seguro);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [ativando, setAtivando] = useState(false);

  const { data: itens = [] } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: () => listarNotificacoes(),
    refetchInterval: 5 * 60 * 1000,
  });

  const ativarPush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Este navegador não suporta notificações push.");
      return;
    }
    setAtivando(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        toast.error("Permissão de notificação negada.");
        return;
      }
      const chavePublica = await obterChavePublicaVapid();
      if (!chavePublica) {
        toast.error("Push ainda não configurado no servidor.");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ParaUint8Array(chavePublica) as BufferSource,
      });
      const json = inscricao.toJSON();
      await salvarInscricaoPush({
        data: {
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
      });
      toast.success("Notificações push ativadas neste dispositivo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ativar notificações.");
    } finally {
      setAtivando(false);
    }
  };

  const temNotificacoes = itens.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notificações"
          className={cn(
            "relative flex items-center justify-center rounded-md text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            collapsed ? "h-10 w-10" : "h-9 w-9",
          )}
        >
          {temNotificacoes ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {temNotificacoes && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-medium">Notificações</span>
          <Button variant="ghost" size="sm" onClick={ativarPush} disabled={ativando}>
            Ativar push
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {itens.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nada por aqui.</p>
          ) : (
            itens.map((n) => {
              const Icone = ICONE_TIPO[n.tipo];
              return (
                <div key={n.chave} className="flex items-start gap-2.5 border-b p-3 last:border-0">
                  <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.titulo}</p>
                    <p className="text-xs text-muted-foreground">{n.mensagem}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
