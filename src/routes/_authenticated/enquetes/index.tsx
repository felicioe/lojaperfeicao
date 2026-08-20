import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarEnquetes,
  criarEnquete,
  encerrarEnquete,
  excluirEnquete,
  votar,
  listarOpcoesEnquete,
  listarResultadoEnquete,
  type Enquete,
} from "@/lib/backend/enquetes";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fmtDate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { Vote, Plus, Trash2, Lock, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/enquetes/")({
  head: () => ({
    meta: [
      { title: "Enquetes — Gestão Maçônica" },
      { name: "description", content: "Consultas rápidas e votações internas." },
    ],
  }),
  component: EnquetesPage,
});

function encerradaEfetiva(e: Enquete): boolean {
  if (e.encerrada) return true;
  if (e.data_limite && new Date(e.data_limite) < new Date(new Date().toISOString().slice(0, 10))) {
    return true;
  }
  return false;
}

function EnquetesPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  // Muda a cada abertura pra forçar o React a remontar NovaEnqueteDialog do
  // zero (sem isso, o formulário mantinha título/opções da vez anterior).
  const [novaChave, setNovaChave] = useState(0);
  const [resultadoDe, setResultadoDe] = useState<Enquete | null>(null);

  const { data: enquetes = [], isLoading } = useQuery({
    queryKey: ["enquetes"],
    queryFn: () => listarEnquetes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["enquetes"] });

  const encerrar = async (id: string) => {
    try {
      await encerrarEnquete({ data: { id } });
      toast.success("Enquete encerrada.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao encerrar.");
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirEnquete({ data: { id } });
      toast.success("Enquete excluída.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  return (
    <>
      <PageHeader
        title="Enquetes"
        description="Consultas rápidas e não-sigilosas — não substitui eleições formais nem votações estatutárias."
        actions={
          can.canManageIrmaos && (
            <Dialog
              open={novaAberta}
              onOpenChange={(v) => {
                setNovaAberta(v);
                if (v) setNovaChave((c) => c + 1);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" /> Nova enquete
                </Button>
              </DialogTrigger>
              <NovaEnqueteDialog
                key={novaChave}
                onCriada={() => {
                  setNovaAberta(false);
                  invalidate();
                }}
              />
            </Dialog>
          )
        }
      />

      {!isLoading && enquetes.length === 0 ? (
        <Card>
          <EmptyState icon={Vote} title="Nenhuma enquete criada ainda" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {enquetes.map((e) => (
            <EnqueteCard
              key={e.id}
              enquete={e}
              podeGerenciar={can.canManageIrmaos}
              onVotou={invalidate}
              onEncerrar={() => encerrar(e.id)}
              onExcluir={() => excluir(e.id)}
              onVerResultado={() => setResultadoDe(e)}
              podeExcluir={can.isAdmin}
            />
          ))}
        </div>
      )}

      <Dialog open={resultadoDe !== null} onOpenChange={(v) => !v && setResultadoDe(null)}>
        <DialogContent>{resultadoDe && <ResultadoConteudo enquete={resultadoDe} />}</DialogContent>
      </Dialog>
    </>
  );
}

function EnqueteCard({
  enquete: e,
  podeGerenciar,
  podeExcluir,
  onVotou,
  onEncerrar,
  onExcluir,
  onVerResultado,
}: {
  enquete: Enquete;
  podeGerenciar: boolean;
  podeExcluir: boolean;
  onVotou: () => void;
  onEncerrar: () => void;
  onExcluir: () => void;
  onVerResultado: () => void;
}) {
  const encerrada = encerradaEfetiva(e);
  const { data: opcoes = [] } = useQuery({
    queryKey: ["enquete_opcoes", e.id],
    queryFn: () => listarOpcoesEnquete({ data: { enqueteId: e.id } }),
    enabled: !e.meu_voto_opcao_id && !encerrada,
  });
  const [opcaoEscolhida, setOpcaoEscolhida] = useState("");
  const [votando, setVotando] = useState(false);

  const votarNaOpcao = async () => {
    if (!opcaoEscolhida) return toast.error("Escolha uma opção.");
    setVotando(true);
    try {
      await votar({ data: { enqueteId: e.id, opcaoId: opcaoEscolhida } });
      toast.success("Voto registrado.");
      onVotou();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao votar.");
    } finally {
      setVotando(false);
    }
  };

  const podeVerResultadoAgora = e.mostrar_resultado_sempre || encerrada || podeGerenciar;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Vote className="h-4 w-4" /> {e.titulo}
            </CardTitle>
            {e.descricao && <CardDescription>{e.descricao}</CardDescription>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={encerrada ? "secondary" : "default"}>
              {encerrada ? "Encerrada" : "Aberta"}
            </Badge>
            <Badge variant="outline">{e.nominal ? "Nominal" : "Anônima"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {e.data_limite && (
          <p className="text-xs text-muted-foreground">Prazo: {fmtDate(e.data_limite)}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {e.total_votos} voto(s) — criada por {e.criador_nome ?? "—"}
        </p>

        {e.meu_voto_opcao_id ? (
          <p className="text-sm text-muted-foreground">Você já votou nesta enquete.</p>
        ) : encerrada ? (
          <p className="text-sm text-muted-foreground">Votação encerrada.</p>
        ) : (
          <div className="space-y-2">
            <RadioGroup value={opcaoEscolhida} onValueChange={setOpcaoEscolhida}>
              {opcoes.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <RadioGroupItem value={o.id} id={`op-${o.id}`} />
                  <Label htmlFor={`op-${o.id}`} className="cursor-pointer font-normal">
                    {o.texto}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <Button size="sm" onClick={votarNaOpcao} disabled={votando || !opcaoEscolhida}>
              Votar
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-3">
          {podeVerResultadoAgora ? (
            <Button variant="outline" size="sm" onClick={onVerResultado}>
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Ver resultado
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Lock className="mr-1.5 h-3.5 w-3.5" /> Resultado após encerrar
            </Button>
          )}
          {podeGerenciar && !encerrada && (
            <Button variant="outline" size="sm" onClick={onEncerrar}>
              Encerrar
            </Button>
          )}
          {podeExcluir && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir enquete?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{e.titulo}" e todos os votos registrados serão removidos permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onExcluir}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultadoConteudo({ enquete: e }: { enquete: Enquete }) {
  const {
    data: resultado = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["enquete_resultado", e.id],
    queryFn: () => listarResultadoEnquete({ data: { enqueteId: e.id } }),
  });
  const totalVotos = resultado.reduce((soma, r) => soma + r.votos, 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Resultado — {e.titulo}</DialogTitle>
        <DialogDescription>{totalVotos} voto(s) no total.</DialogDescription>
      </DialogHeader>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && (
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Erro ao carregar resultado."}
        </p>
      )}
      <div className="space-y-3">
        {resultado.map((r) => {
          const percentual = totalVotos > 0 ? Math.round((r.votos / totalVotos) * 100) : 0;
          return (
            <div key={r.opcao_id}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{r.texto}</span>
                <span className="text-muted-foreground">
                  {r.votos} voto(s) — {percentual}%
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${percentual}%` }} />
              </div>
              {r.eleitores && r.eleitores.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{r.eleitores.join(", ")}</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function NovaEnqueteDialog({ onCriada }: { onCriada: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [nominal, setNominal] = useState(true);
  const [mostrarResultadoSempre, setMostrarResultadoSempre] = useState(true);
  const [dataLimite, setDataLimite] = useState("");
  const [opcoes, setOpcoes] = useState(["", ""]);
  const [salvando, setSalvando] = useState(false);

  const atualizarOpcao = (indice: number, valor: string) => {
    setOpcoes((atual) => atual.map((o, i) => (i === indice ? valor : o)));
  };

  const salvar = async () => {
    const opcoesValidas = opcoes.map((o) => o.trim()).filter(Boolean);
    if (!titulo.trim()) return toast.error("Título é obrigatório.");
    if (opcoesValidas.length < 2) return toast.error("Cadastre pelo menos 2 opções.");
    setSalvando(true);
    try {
      await criarEnquete({
        data: {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          nominal,
          mostrarResultadoSempre,
          dataLimite: dataLimite || null,
          opcoes: opcoesValidas,
        },
      });
      toast.success("Enquete criada.");
      onCriada();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar enquete.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Nova enquete</DialogTitle>
        <DialogDescription>
          Pergunta, opções e como o resultado e os votos ficam visíveis — tudo definido agora, não
          muda depois.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label htmlFor="enquete-pergunta">Pergunta</Label>
          <Input id="enquete-pergunta" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="enquete-descricao-opcional">Descrição (opcional)</Label>
          <Textarea
            id="enquete-descricao-opcional"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
          />
        </div>
        <div>
          {/* "Opções" nomeia o conjunto, não um campo: são N inputs. Daí
              role="group" + aria-labelledby, e cada linha com seu próprio
              nome ("Opção 1", "Opção 2"…). */}
          <Label id="enquete-opcoes">Opções</Label>
          <div className="space-y-2" role="group" aria-labelledby="enquete-opcoes">
            {opcoes.map((o, i) => (
              <Input
                key={i}
                aria-label={`Opção ${i + 1}`}
                value={o}
                placeholder={`Opção ${i + 1}`}
                onChange={(e) => atualizarOpcao(i, e.target.value)}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => setOpcoes((atual) => [...atual, ""])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar opção
          </Button>
        </div>
        <div>
          <Label htmlFor="enquete-prazo-opcional">Prazo (opcional)</Label>
          <Input
            id="enquete-prazo-opcional"
            type="date"
            value={dataLimite}
            onChange={(e) => setDataLimite(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm" htmlFor="enquete-votos-nominais">
              Votos nominais
            </Label>
            <p className="text-xs text-muted-foreground">
              Mostra quem votou em cada opção. Desligado = sempre anônima.
            </p>
          </div>
          <Switch id="enquete-votos-nominais" checked={nominal} onCheckedChange={setNominal} />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm" htmlFor="enquete-resultado-visivel">
              Resultado visível durante a votação
            </Label>
            <p className="text-xs text-muted-foreground">
              Desligado = só aparece depois de encerrada (pra quem não gerencia).
            </p>
          </div>
          <Switch
            id="enquete-resultado-visivel"
            checked={mostrarResultadoSempre}
            onCheckedChange={setMostrarResultadoSempre}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? "Criando…" : "Criar enquete"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
