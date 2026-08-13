export function CabecalhoInstitucional({ compacto = false }: { compacto?: boolean }) {
  return (
    <header
      className={`institutional-header grid grid-cols-[1fr_auto] items-center gap-3 border-b border-primary/50 bg-background sm:grid-cols-[auto_1fr_auto] ${
        compacto ? "mb-4 px-1 pb-3" : "mb-6 px-2 pb-4"
      }`}
    >
      <div className="flex items-center gap-2" aria-label="Loja e Capítulo">
        <img
          src="/institucional/logo-capitulo-ayres-gevaerd.png"
          alt="Sublime Capítulo Adonhiramita Ayres Gevaerd"
          className={compacto ? "h-12 w-12 object-contain" : "h-16 w-16 object-contain"}
        />
        <img
          src="/institucional/logo-loja-perfeicao-adonhiram.png"
          alt="Loja de Perfeição Adonhiram"
          className={compacto ? "h-12 w-12 object-contain" : "h-16 w-16 object-contain"}
        />
      </div>

      <div className="col-span-2 row-start-2 min-w-0 text-center leading-tight sm:col-span-1 sm:row-start-auto">
        <div className={compacto ? "text-xs font-semibold" : "text-sm font-semibold"}>
          LOJA DE PERFEIÇÃO ADONHIRAM
        </div>
        <div className={compacto ? "text-xs font-semibold" : "text-sm font-semibold"}>
          SUBLIME CAPÍTULO ADONHIRAMITA AYRES GEVAERD
        </div>
      </div>

      <img
        src="/institucional/logo-sgcab.png"
        alt="Sublime Grande Capítulo Adonhiramita do Brasil"
        className={compacto ? "h-12 w-14 object-contain" : "h-16 w-20 object-contain"}
      />
    </header>
  );
}
