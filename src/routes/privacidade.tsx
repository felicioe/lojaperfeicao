import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PoliticaPrivacidadeConteudo } from "@/components/app/PoliticaPrivacidade";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Gestão Maçônica" },
      { name: "description", content: "Como tratamos seus dados pessoais, conforme a LGPD." },
    ],
  }),
  component: PrivacidadePublica,
});

function PrivacidadePublica() {
  return (
    <div className="min-h-screen bg-muted/40 p-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/auth">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Política de Privacidade</CardTitle>
          </CardHeader>
          <CardContent>
            <PoliticaPrivacidadeConteudo />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
