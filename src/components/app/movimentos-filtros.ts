// Constante e hook que moravam em RecebimentoAvulso.tsx.
//
// Foram separados porque o fast refresh do Vite só funciona quando um arquivo
// exporta apenas componentes: com a constante e o hook juntos, qualquer edição
// naquele arquivo recarregava a página inteira em vez de atualizar o
// componente no lugar. Como os dois já eram importados por quatro telas
// diferentes, o arquivo próprio também deixa a dependência mais honesta.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarLancamentos } from "@/lib/backend/tesouraria-lancamentos";
import { toISODate } from "@/lib/format";

export const CATEGORIA_LABEL: Record<string, string> = {
  mensalidade: "Mensalidade",
  taxa_grau: "Taxa de grau",
  tronco: "Tronco de Beneficência",
  doacao: "Doação",
  outros: "Outros",
};

export function useMovimentosFiltrados(filtrosIniciais?: {
  categoria?: string;
  statusInicial?: "todos" | "pago" | "nao_pago" | "vencido" | "a_vencer";
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [contaId, setContaId] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState(filtrosIniciais?.categoria ?? "todas");
  const [irmaoId, setIrmaoId] = useState("todos");
  // Padrão "não pago": é o que mais importa acompanhar no dia a dia
  // (cobrar quem ainda deve) — "Todos"/"Pago" ficam a um clique. Telas
  // como Tronco de Beneficência, onde o lançamento nasce sempre pago,
  // sobrescrevem via statusInicial pra não ficar com a lista vazia.
  // "Vencido"/"A vencer" refinam "não pago" comparando data_vencimento
  // com hoje — não existe coluna própria pra isso, é filtrado no cliente.
  const [status, setStatus] = useState<"todos" | "pago" | "nao_pago" | "vencido" | "a_vencer">(
    filtrosIniciais?.statusInicial ?? "nao_pago",
  );

  const { data: movimentosBrutos = [], isError } = useQuery({
    queryKey: ["movimentos_financeiros", de, ate, contaId, tipo, categoria, irmaoId, status],
    queryFn: () =>
      listarLancamentos({
        data: {
          de: de || null,
          ate: ate || null,
          contaId: contaId !== "todas" ? contaId : null,
          tipo: tipo !== "todos" ? (tipo as "entrada" | "saida" | "transferencia") : null,
          categoria: categoria !== "todas" ? categoria : null,
          irmaoId: irmaoId !== "todos" ? irmaoId : null,
          pago: status === "pago" ? true : status === "todos" ? null : false,
          limite: 500,
        },
      }),
  });

  const hoje = toISODate(new Date());
  const movimentos =
    status === "vencido"
      ? movimentosBrutos.filter((m) => m.data_vencimento && m.data_vencimento < hoje)
      : status === "a_vencer"
        ? movimentosBrutos.filter((m) => !m.data_vencimento || m.data_vencimento >= hoje)
        : movimentosBrutos;

  return {
    movimentos,
    isError,
    de,
    setDe,
    ate,
    setAte,
    contaId,
    setContaId,
    tipo,
    setTipo,
    categoria,
    setCategoria,
    irmaoId,
    setIrmaoId,
    status,
    setStatus,
  };
}
