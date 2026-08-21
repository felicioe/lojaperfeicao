import { useId, useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { criarTerceiroRapido, listarTerceirosAtivosPorTipo } from "@/lib/backend/terceiros";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NOVO = "__novo_terceiro__";

export function TerceiroSelect({
  value,
  onValueChange,
  tipo,
  permitirNenhum = true,
  triggerId,
}: {
  value: string;
  onValueChange: (value: string) => void;
  tipo: "fornecedor" | "cliente";
  permitirNenhum?: boolean;
  triggerId?: string;
}) {
  const qc = useQueryClient();
  const uid = useId();
  const rotulo = tipo === "fornecedor" ? "fornecedor" : "cliente";
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", documento: "", contato: "", email: "" });
  const { data: terceiros = [] } = useQuery({
    queryKey: ["terceiros_ativos", tipo],
    queryFn: () => listarTerceirosAtivosPorTipo({ data: { tipo } }),
  });

  const selecionar = (novoValor: string) => {
    if (novoValor === NOVO) {
      setAberto(true);
      return;
    }
    onValueChange(novoValor);
  };

  const salvar = async () => {
    if (form.nome.trim().length < 2) return;
    setSalvando(true);
    try {
      const terceiro = await criarTerceiroRapido({
        data: {
          tipo,
          nome: form.nome.trim(),
          documento: form.documento || null,
          contato: form.contato || null,
          email: form.email || null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["terceiros_ativos"] });
      await qc.invalidateQueries({ queryKey: ["terceiros_fornecedores"] });
      onValueChange(terceiro.id);
      setForm({ nome: "", documento: "", contato: "", email: "" });
      setAberto(false);
      toast.success(
        `${tipo === "fornecedor" ? "Fornecedor" : "Cliente"} cadastrado e selecionado.`,
      );
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : `Não foi possível cadastrar o ${rotulo}.`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={selecionar}>
        <SelectTrigger id={triggerId}>
          <SelectValue placeholder={`Selecione um ${rotulo}`} />
        </SelectTrigger>
        <SelectContent>
          {permitirNenhum && <SelectItem value="none">— nenhum —</SelectItem>}
          <SelectItem value={NOVO} className="font-medium text-primary">
            <Plus className="mr-2 inline h-4 w-4" /> Adicionar {rotulo}
          </SelectItem>
          {terceiros.map((terceiro) => (
            <SelectItem key={terceiro.id} value={terceiro.id}>
              {terceiro.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo {rotulo}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor={`${uid}-nome`}>Nome ou razão social</Label>
              <Input
                id={`${uid}-nome`}
                autoFocus
                maxLength={200}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${uid}-documento`}>CNPJ ou CPF</Label>
              <Input
                id={`${uid}-documento`}
                maxLength={18}
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${uid}-contato`}>Contato</Label>
              <Input
                id={`${uid}-contato`}
                maxLength={100}
                value={form.contato}
                onChange={(e) => setForm({ ...form, contato: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`${uid}-email`}>E-mail</Label>
              <Input
                id={`${uid}-email`}
                type="email"
                maxLength={200}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || form.nome.trim().length < 2}>
              {salvando ? "Salvando…" : "Cadastrar e selecionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FornecedorSelect(props: Omit<ComponentProps<typeof TerceiroSelect>, "tipo">) {
  return <TerceiroSelect {...props} tipo="fornecedor" />;
}
