import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type GrauIrmao = "aprendiz" | "companheiro" | "mestre";
export type SituacaoIrmao = "ativo" | "quite" | "irregular" | "adormecido";

export type IrmaoData = {
  nome_civil: string;
  nome_simbolico?: string | null;
  cim?: string | null;
  grau: GrauIrmao;
  data_iniciacao?: string | null;
  data_elevacao?: string | null;
  data_exaltacao?: string | null;
  situacao: SituacaoIrmao;
  potencia?: string | null;
  loja_origem?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  data_nascimento?: string | null;
  profissao?: string | null;
  valor_mensalidade: number;
};

export function IrmaoForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Partial<IrmaoData>;
  onSubmit: (d: IrmaoData) => void;
  submitting?: boolean;
}) {
  const [d, setD] = useState<IrmaoData>({
    nome_civil: initial?.nome_civil ?? "",
    nome_simbolico: initial?.nome_simbolico ?? "",
    cim: initial?.cim ?? "",
    grau: initial?.grau ?? "aprendiz",
    data_iniciacao: initial?.data_iniciacao ?? "",
    data_elevacao: initial?.data_elevacao ?? "",
    data_exaltacao: initial?.data_exaltacao ?? "",
    situacao: initial?.situacao ?? "ativo",
    potencia: initial?.potencia ?? "",
    loja_origem: initial?.loja_origem ?? "",
    email: initial?.email ?? "",
    telefone: initial?.telefone ?? "",
    endereco: initial?.endereco ?? "",
    data_nascimento: initial?.data_nascimento ?? "",
    profissao: initial?.profissao ?? "",
    valor_mensalidade: initial?.valor_mensalidade ?? 0,
  });

  // Aceita tanto o evento de um <input>/<textarea> quanto o valor direto que
  // um <Select> entrega — daí a união em vez de `any`.
  const set =
    (k: keyof IrmaoData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) =>
      setD({ ...d, [k]: typeof e === "string" ? e : e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Campo de data vazio chega como "" do <input type="date">; o banco espera
    // NULL. A lista é tipada como (keyof IrmaoData)[] para o compilador
    // recusar um nome de campo que não exista mais.
    const camposDeData: (keyof IrmaoData)[] = [
      "data_iniciacao",
      "data_elevacao",
      "data_exaltacao",
      "data_nascimento",
    ];
    const clean: IrmaoData = { ...d, valor_mensalidade: Number(d.valor_mensalidade) || 0 };
    for (const k of camposDeData) {
      if (!clean[k]) (clean[k] as string | null) = null;
    }
    onSubmit(clean);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Nome civil *" id="irmao-form-nome-civil">
            <Input
              id="irmao-form-nome-civil"
              required
              value={d.nome_civil}
              onChange={set("nome_civil")}
            />
          </Field>
          <Field label="Data de nascimento" id="irmao-form-data-de-nascimento">
            <Input
              id="irmao-form-data-de-nascimento"
              type="date"
              value={d.data_nascimento ?? ""}
              onChange={set("data_nascimento")}
            />
          </Field>
          <Field label="E-mail" id="irmao-form-e-mail">
            <Input
              id="irmao-form-e-mail"
              type="email"
              value={d.email ?? ""}
              onChange={set("email")}
            />
          </Field>
          <Field label="Telefone" id="irmao-form-telefone">
            <Input id="irmao-form-telefone" value={d.telefone ?? ""} onChange={set("telefone")} />
          </Field>
          <Field label="Profissão" id="irmao-form-profissao">
            <Input
              id="irmao-form-profissao"
              value={d.profissao ?? ""}
              onChange={set("profissao")}
            />
          </Field>
          <Field label="Endereço" className="md:col-span-2" id="irmao-form-endereco">
            <Textarea
              id="irmao-form-endereco"
              value={d.endereco ?? ""}
              onChange={set("endereco")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados maçônicos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Nome simbólico" id="irmao-form-nome-simbolico">
            <Input
              id="irmao-form-nome-simbolico"
              value={d.nome_simbolico ?? ""}
              onChange={set("nome_simbolico")}
            />
          </Field>
          <Field label="CIM" id="irmao-form-cim">
            <Input id="irmao-form-cim" value={d.cim ?? ""} onChange={set("cim")} />
          </Field>
          <Field label="Grau" id="irmao-form-grau">
            <Select value={d.grau} onValueChange={(v) => setD({ ...d, grau: v as GrauIrmao })}>
              <SelectTrigger id="irmao-form-grau">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aprendiz">Aprendiz</SelectItem>
                <SelectItem value="companheiro">Companheiro</SelectItem>
                <SelectItem value="mestre">Mestre</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Situação" id="irmao-form-situacao">
            <Select
              value={d.situacao}
              onValueChange={(v) => setD({ ...d, situacao: v as SituacaoIrmao })}
            >
              <SelectTrigger id="irmao-form-situacao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="quite">Quite</SelectItem>
                <SelectItem value="irregular">Irregular</SelectItem>
                <SelectItem value="adormecido">Adormecido</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data de iniciação" id="irmao-form-data-de-iniciacao">
            <Input
              id="irmao-form-data-de-iniciacao"
              type="date"
              value={d.data_iniciacao ?? ""}
              onChange={set("data_iniciacao")}
            />
          </Field>
          <Field label="Data de elevação" id="irmao-form-data-de-elevacao">
            <Input
              id="irmao-form-data-de-elevacao"
              type="date"
              value={d.data_elevacao ?? ""}
              onChange={set("data_elevacao")}
            />
          </Field>
          <Field label="Data de exaltação" id="irmao-form-data-de-exaltacao">
            <Input
              id="irmao-form-data-de-exaltacao"
              type="date"
              value={d.data_exaltacao ?? ""}
              onChange={set("data_exaltacao")}
            />
          </Field>
          <Field label="Potência" id="irmao-form-potencia">
            <Input id="irmao-form-potencia" value={d.potencia ?? ""} onChange={set("potencia")} />
          </Field>
          <Field label="Loja de origem" id="irmao-form-loja-de-origem">
            <Input
              id="irmao-form-loja-de-origem"
              value={d.loja_origem ?? ""}
              onChange={set("loja_origem")}
            />
          </Field>
          <Field label="Valor da mensalidade (R$)" id="irmao-form-valor-da-mensalidade-r">
            <Input
              id="irmao-form-valor-da-mensalidade-r"
              type="number"
              step="0.01"
              min="0"
              value={d.valor_mensalidade}
              onChange={(e) => setD({ ...d, valor_mensalidade: Number(e.target.value) })}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  className,
  children,
  id,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1 block">
        {label}
      </Label>
      {children}
    </div>
  );
}
