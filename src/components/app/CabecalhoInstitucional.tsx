import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarLogosInstitucionais } from "@/lib/backend/orgs";
import { obterLojaAtual } from "@/lib/backend/loja-atual";

// Antes desta issue (#340), os 3 logos e os 2 nomes abaixo eram fixos no
// código — corretos só para a instalação da Adonhiram, quebrados para
// qualquer outra Loja do SaaS. Agora vêm dos Orgs/Potências da Loja da
// sessão (cada um com seu próprio logo_url, já existente desde "Logo por
// corpo") e do nome da própria Loja (lojas.nome).
export function CabecalhoInstitucional({ compacto = false }: { compacto?: boolean }) {
  const { data: logos = [] } = useQuery({
    queryKey: ["logos_institucionais"],
    queryFn: () => listarLogosInstitucionais(),
  });
  const { data: loja } = useQuery({
    queryKey: ["loja_atual"],
    queryFn: () => obterLojaAtual(),
  });
  // Logos antigos (path em disco de antes da migração 0118) ficam com a URL
  // salva apontando pro nada — esconde a imagem quebrada em vez de mostrar
  // o ícone de "não carregou" no cabeçalho impresso, mesmo padrão do
  // FaturaCard/QR Pix.
  const [quebrados, setQuebrados] = useState<Set<string>>(new Set());

  if (logos.length === 0 && !loja) return null;

  const tamanho = compacto ? "h-12 w-12" : "h-16 w-16";

  return (
    <header
      className={`institutional-header grid grid-cols-[1fr_auto] items-center gap-3 border-b border-primary/50 sm:grid-cols-[auto_1fr_auto] ${
        compacto ? "mb-4 px-1 pb-3" : "mb-6 px-2 pb-4"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap" aria-label="Logos institucionais">
        {logos
          .filter((logo) => !quebrados.has(logo.logoUrl))
          .map((logo) => (
            <img
              key={logo.logoUrl}
              src={logo.logoUrl}
              alt={logo.nome}
              className={`${tamanho} object-contain`}
              onError={() => setQuebrados((atual) => new Set(atual).add(logo.logoUrl))}
            />
          ))}
      </div>

      {loja && (
        <div className="col-span-2 row-start-2 min-w-0 text-center leading-tight sm:col-span-1 sm:row-start-auto">
          <div className={compacto ? "text-xs font-semibold" : "text-sm font-semibold"}>
            {(loja.razaoSocial || loja.nome).toUpperCase()}
          </div>
        </div>
      )}
    </header>
  );
}
