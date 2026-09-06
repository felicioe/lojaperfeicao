import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // bg-destructive/3, não /10 (achado da auditoria técnica): o fundo
        // tingido MAIS saturado piora o contraste do texto, não melhora —
        // quanto mais perto de bg-destructive puro, mais o fundo converge
        // pra mesma cor do texto. Calculado (OKLCH→sRGB→WCAG): /10 dava
        // 4.14:1 no tema claro (abaixo do mínimo AA de 4.5:1 pro texto de
        // 11px do badge); /3 dá 4.62:1, com margem, mantendo o fundo ainda
        // visivelmente tingido.
        destructive: "border-transparent bg-destructive/3 text-destructive hover:bg-destructive/8",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
