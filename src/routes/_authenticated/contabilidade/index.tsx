import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Book,
  DollarSign,
  FileText,
  Settings,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contabilidade/")({
  component: ContabilidadeIndex,
});

function ContabilidadeIndex() {
  const modulos = [
    {
      title: "Plano de Contas",
      description: "Estrutura contábil e classificação de contas",
      href: "/contabilidade/plano-contas",
      icon: Book,
    },
    {
      title: "Diário",
      description: "Registro detalhado de todos os lançamentos",
      href: "/contabilidade/diario",
      icon: FileText,
    },
    {
      title: "Razão",
      description: "Movimento por conta contábil",
      href: "/contabilidade/razao",
      icon: BarChart,
    },
    {
      title: "Balancete",
      description: "Resumo das contas em determinada data",
      href: "/contabilidade/balancete",
      icon: DollarSign,
    },
    {
      title: "DRE",
      description: "Demonstração de Resultado do Exercício",
      href: "/contabilidade/dre",
      icon: TrendingUp,
    },
    {
      title: "Fluxo de Caixa",
      description: "Previsão e controle de caixa",
      href: "/contabilidade/fluxo-caixa",
      icon: TrendingUp,
    },
    {
      title: "Orçamento",
      description: "Planejamento e controle orçamentário",
      href: "/contabilidade/orcamento",
      icon: Settings,
    },
    {
      title: "Auditoria",
      description: "Histórico imutável de alterações",
      href: "/contabilidade/auditoria",
      icon: FileText,
    },
    {
      title: "Parâmetros Contábeis",
      description: "Papel contábil → conta do plano (mensalidades, fornecedores, multas…)",
      href: "/contabilidade/parametros",
      icon: Settings2,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Contabilidade" description="Demonstrações e controles financeiros" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modulos.map((modulo) => (
          <Link key={modulo.href} to={modulo.href}>
            <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <modulo.icon className="h-5 w-5 text-primary" />
                  {modulo.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{modulo.description}</p>
                <Button variant="outline" className="mt-4 w-full" asChild>
                  <Link to={modulo.href}>Acessar</Link>
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
