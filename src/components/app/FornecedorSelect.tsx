import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { criarFornecedorRapido, listarFornecedores } from "@/lib/backend/terceiros";
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

const NOVO = "__novo_fornecedor__";

export function FornecedorSelect({
  value,
  onValueChange,
  permitirNenhum = true,
  triggerId,
}: {
  value: string;
  onValueChange: (value: string) => void;
  permitirNenhum?: boolean;
  triggerId?: string;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", documento: "", contato: "", email: "" });
  const { data: fornecedores = [] } = useQuery({
    queryKey: ["terceiros_fornecedores"],
    queryFn: () => listarFornecedores(),
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
      const fornecedor = await criarFornecedorRapido({
        data: {
          nome: form.nome.trim(),
          documento: form.documento || null,
          contato: form.contato || null,
          email: form.email || null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["terceiros_fornecedores"] });
      onValueChange(fornecedor.id);
      setForm({ nome: "", documento: "", contato: "", email: "" });
      setAberto(false);
      toast.success("Fornecedor cadastrado e selecionado.");
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível cadastrar o fornecedor.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={selecionar}>
        <SelectTrigger id={triggerId}>
          <SelectValue placeholder="Selecione um fornecedor" />
        </SelectTrigger>
        <SelectContent>
          {permitirNenhum && <SelectItem value="none">— nenhum —</SelectItem>}
          <SelectItem value={NOVO} className="font-medium text-primary">
            <Plus className="mr-2 inline h-4 w-4" /> Adicionar fornecedor
          </SelectItem>
          {fornecedores.map((fornecedor) => (
            <SelectItem key={fornecedor.id} value={fornecedor.id}>
              {fornecedor.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo fornecedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fornecedor-nome">Nome ou razão social</Label>
              <Input
                id="fornecedor-nome"
                autoFocus
                maxLength={200}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="fornecedor-documento">CNPJ ou CPF</Label>
              <Input
                id="fornecedor-documento"
                maxLength={18}
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="fornecedor-contato">Contato</Label>
              <Input
                id="fornecedor-contato"
                maxLength={100}
                value={form.contato}
                onChange={(e) => setForm({ ...form, contato: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="fornecedor-email">E-mail</Label>
              <Input
                id="fornecedor-email"
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
