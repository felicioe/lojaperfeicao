import { cloneElement, isValidElement, useId, useState } from "react";
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
          <Field label="Nome civil *">
            <Input required value={d.nome_civil} onChange={set("nome_civil")} />
          </Field>
          <Field label="Data de nascimento">
            <Input type="date" value={d.data_nascimento ?? ""} onChange={set("data_nascimento")} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={d.email ?? ""} onChange={set("email")} />
          </Field>
          <Field label="Telefone">
            <Input value={d.telefone ?? ""} onChange={set("telefone")} />
          </Field>
          <Field label="Profissão">
            <Input value={d.profissao ?? ""} onChange={set("profissao")} />
          </Field>
          <Field label="Endereço" className="md:col-span-2">
            <Textarea value={d.endereco ?? ""} onChange={set("endereco")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados maçônicos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Nome simbólico">
            <Input value={d.nome_simbolico ?? ""} onChange={set("nome_simbolico")} />
          </Field>
          <Field label="CIM">
            <Input value={d.cim ?? ""} onChange={set("cim")} />
          </Field>
          <Field label="Grau" controlId="irmao-grau">
            <Select value={d.grau} onValueChange={(v) => setD({ ...d, grau: v as GrauIrmao })}>
              <SelectTrigger id="irmao-grau">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aprendiz">Aprendiz</SelectItem>
                <SelectItem value="companheiro">Companheiro</SelectItem>
                <SelectItem value="mestre">Mestre</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Situação" controlId="irmao-situacao">
            <Select
              value={d.situacao}
              onValueChange={(v) => setD({ ...d, situacao: v as SituacaoIrmao })}
            >
              <SelectTrigger id="irmao-situacao">
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
          <Field label="Data de iniciação">
            <Input type="date" value={d.data_iniciacao ?? ""} onChange={set("data_iniciacao")} />
          </Field>
          <Field label="Data de elevação">
            <Input type="date" value={d.data_elevacao ?? ""} onChange={set("data_elevacao")} />
          </Field>
          <Field label="Data de exaltação">
            <Input type="date" value={d.data_exaltacao ?? ""} onChange={set("data_exaltacao")} />
          </Field>
          <Field label="Potência">
            <Input value={d.potencia ?? ""} onChange={set("potencia")} />
          </Field>
          <Field label="Loja de origem">
            <Input value={d.loja_origem ?? ""} onChange={set("loja_origem")} />
          </Field>
          <Field label="Valor da mensalidade (R$)">
            <Input
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
  controlId,
  children,
}: {
  label: string;
  className?: string;
  controlId?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const resolvedId = controlId ?? generatedId;
  const control =
    isValidElement<{ id?: string }>(children) && children.type !== Select
      ? cloneElement(children, { id: children.props.id ?? resolvedId })
      : children;

  return (
    <div className={className}>
      <Label htmlFor={resolvedId} className="mb-1 block">
        {label}
      </Label>
      {control}
    </div>
  );
}
