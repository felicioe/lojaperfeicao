import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  isError,
  onRetry,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "success" | "warning" | "danger" | "gold";
  isError?: boolean;
  onRetry?: () => void;
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30",
    warning: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30",
    danger: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30",
    gold: "text-gold-foreground bg-gold-muted",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            {isError ? (
              <p className="mt-1 text-sm text-destructive">
                Erro ao carregar.{" "}
                <button className="underline" onClick={onRetry}>
                  Tentar novamente
                </button>
              </p>
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
                {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
              </>
            )}
          </div>
          <div className={`shrink-0 rounded-md p-2 ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
