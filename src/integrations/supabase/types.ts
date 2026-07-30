export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      contas_financeiras: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          created_at: string
          id: string
          nome: string
          numero: string | null
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["tipo_conta"]
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          created_at?: string
          id?: string
          nome: string
          numero?: string | null
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["tipo_conta"]
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          created_at?: string
          id?: string
          nome?: string
          numero?: string | null
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["tipo_conta"]
        }
        Relationships: []
      }
      irmaos: {
        Row: {
          cim: string | null
          created_at: string
          data_elevacao: string | null
          data_exaltacao: string | null
          data_iniciacao: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          grau: Database["public"]["Enums"]["grau_macom"]
          id: string
          loja_origem: string | null
          nome_civil: string
          nome_simbolico: string | null
          potencia: string | null
          profissao: string | null
          situacao: Database["public"]["Enums"]["situacao_irmao"]
          telefone: string | null
          updated_at: string
          user_id: string | null
          valor_mensalidade: number
        }
        Insert: {
          cim?: string | null
          created_at?: string
          data_elevacao?: string | null
          data_exaltacao?: string | null
          data_iniciacao?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          grau?: Database["public"]["Enums"]["grau_macom"]
          id?: string
          loja_origem?: string | null
          nome_civil: string
          nome_simbolico?: string | null
          potencia?: string | null
          profissao?: string | null
          situacao?: Database["public"]["Enums"]["situacao_irmao"]
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
          valor_mensalidade?: number
        }
        Update: {
          cim?: string | null
          created_at?: string
          data_elevacao?: string | null
          data_exaltacao?: string | null
          data_iniciacao?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          grau?: Database["public"]["Enums"]["grau_macom"]
          id?: string
          loja_origem?: string | null
          nome_civil?: string
          nome_simbolico?: string | null
          potencia?: string | null
          profissao?: string | null
          situacao?: Database["public"]["Enums"]["situacao_irmao"]
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
          valor_mensalidade?: number
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          competencia_mes: string | null
          conta_destino_id: string | null
          conta_id: string | null
          created_at: string
          created_by: string | null
          data: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string
          id: string
          irmao_id: string | null
          is_mensalidade: boolean
          observacoes: string | null
          pago: boolean
          plano_conta_id: string | null
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at: string
          valor: number
        }
        Insert: {
          competencia_mes?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao: string
          id?: string
          irmao_id?: string | null
          is_mensalidade?: boolean
          observacoes?: string | null
          pago?: boolean
          plano_conta_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at?: string
          valor: number
        }
        Update: {
          competencia_mes?: string | null
          conta_destino_id?: string | null
          conta_id?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string
          id?: string
          irmao_id?: string | null
          is_mensalidade?: boolean
          observacoes?: string | null
          pago?: boolean
          plano_conta_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_irmao_id_fkey"
            columns: ["irmao_id"]
            isOneToOne: false
            referencedRelation: "irmaos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_plano_conta_id_fkey"
            columns: ["plano_conta_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      potencias: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          jurisdicao: string | null
          nome: string
          sigla: string | null
          site: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          jurisdicao?: string | null
          nome: string
          sigla?: string | null
          site?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          jurisdicao?: string | null
          nome?: string
          sigla?: string | null
          site?: string | null
        }
        Relationships: []
      }
      orgs: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          endereco: string | null
          fundacao: string | null
          grau_max: number
          grau_min: number
          id: string
          mensalidade_padrao: number
          natureza: Database["public"]["Enums"]["natureza_corpo"]
          nome: string
          numero: string | null
          potencia_id: string | null
          rito: string | null
          sigla: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          endereco?: string | null
          fundacao?: string | null
          grau_max?: number
          grau_min?: number
          id?: string
          mensalidade_padrao?: number
          natureza?: Database["public"]["Enums"]["natureza_corpo"]
          nome: string
          numero?: string | null
          potencia_id?: string | null
          rito?: string | null
          sigla?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          endereco?: string | null
          fundacao?: string | null
          grau_max?: number
          grau_min?: number
          id?: string
          mensalidade_padrao?: number
          natureza?: Database["public"]["Enums"]["natureza_corpo"]
          nome?: string
          numero?: string | null
          potencia_id?: string | null
          rito?: string | null
          sigla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgs_potencia_id_fkey"
            columns: ["potencia_id"]
            isOneToOne: false
            referencedRelation: "potencias"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs_graus: {
        Row: {
          grau: number
          id: string
          nome: string
          org_id: string
        }
        Insert: {
          grau: number
          id?: string
          nome: string
          org_id: string
        }
        Update: {
          grau?: number
          id?: string
          nome?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgs_graus_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      irmao_orgs: {
        Row: {
          created_at: string
          grau_atual: number | null
          id: string
          irmao_id: string
          org_id: string
          principal: boolean
        }
        Insert: {
          created_at?: string
          grau_atual?: number | null
          id?: string
          irmao_id: string
          org_id: string
          principal?: boolean
        }
        Update: {
          created_at?: string
          grau_atual?: number | null
          id?: string
          irmao_id?: string
          org_id?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "irmao_orgs_irmao_id_fkey"
            columns: ["irmao_id"]
            isOneToOne: false
            referencedRelation: "irmaos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irmao_orgs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_contas: {
        Row: {
          analitica: boolean
          ativo: boolean
          codigo: string
          created_at: string
          id: string
          nome: string
          parent_id: string | null
          tipo: Database["public"]["Enums"]["tipo_plano_conta"]
        }
        Insert: {
          analitica?: boolean
          ativo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nome: string
          parent_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_plano_conta"]
        }
        Update: {
          analitica?: boolean
          ativo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          parent_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_plano_conta"]
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_contabeis: {
        Row: {
          competencia: string
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string
          id: string
          origem_id: string | null
          origem_tipo: string | null
        }
        Insert: {
          competencia?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao: string
          id?: string
          origem_id?: string | null
          origem_tipo?: string | null
        }
        Update: {
          competencia?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          id?: string
          origem_id?: string | null
          origem_tipo?: string | null
        }
        Relationships: []
      }
      lancamentos_contabeis_itens: {
        Row: {
          conta_id: string
          descricao: string | null
          id: string
          lancamento_id: string
          tipo: string
          valor: number
        }
        Insert: {
          conta_id: string
          descricao?: string | null
          id?: string
          lancamento_id: string
          tipo: string
          valor: number
        }
        Update: {
          conta_id?: string
          descricao?: string | null
          id?: string
          lancamento_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_contabeis_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_contabeis_itens_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_contabeis"
            referencedColumns: ["id"]
          },
        ]
      }
      presencas: {
        Row: {
          created_at: string
          id: string
          irmao_id: string
          justificado: boolean
          presente: boolean
          sessao_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          irmao_id: string
          justificado?: boolean
          presente?: boolean
          sessao_id: string
        }
        Update: {
          created_at?: string
          id?: string
          irmao_id?: string
          justificado?: boolean
          presente?: boolean
          sessao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presencas_irmao_id_fkey"
            columns: ["irmao_id"]
            isOneToOne: false
            referencedRelation: "irmaos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          irmao_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          irmao_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          irmao_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sessoes: {
        Row: {
          created_at: string
          data: string
          grau: Database["public"]["Enums"]["grau_macom"]
          id: string
          observacoes: string | null
          tipo: Database["public"]["Enums"]["tipo_sessao"]
        }
        Insert: {
          created_at?: string
          data: string
          grau?: Database["public"]["Enums"]["grau_macom"]
          id?: string
          observacoes?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sessao"]
        }
        Update: {
          created_at?: string
          data?: string
          grau?: Database["public"]["Enums"]["grau_macom"]
          id?: string
          observacoes?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sessao"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_saldo_plano_contas: {
        Row: {
          codigo: string | null
          id: string | null
          nome: string | null
          saldo_devedor: number | null
          tipo: Database["public"]["Enums"]["tipo_plano_conta"] | null
          total_credito: number | null
          total_debito: number | null
        }
        Relationships: []
      }
      v_auditoria_contabil_desbalanceados: {
        Row: {
          data: string | null
          descricao: string | null
          diferenca: number | null
          lancamento_id: string | null
          origem_id: string | null
          origem_tipo: string | null
          total_credito: number | null
          total_debito: number | null
        }
        Relationships: []
      }
      v_saldo_contas: {
        Row: {
          id: string | null
          nome: string | null
          saldo_atual: number | null
          saldo_inicial: number | null
          tipo: Database["public"]["Enums"]["tipo_conta"] | null
        }
        Insert: {
          id?: string | null
          nome?: string | null
          saldo_atual?: never
          saldo_inicial?: number | null
          tipo?: Database["public"]["Enums"]["tipo_conta"] | null
        }
        Update: {
          id?: string | null
          nome?: string | null
          saldo_atual?: never
          saldo_inicial?: number | null
          tipo?: Database["public"]["Enums"]["tipo_conta"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      gerar_mensalidades: { Args: { _competencia: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      registrar_lancamento_contabil: {
        Args: {
          _competencia: string
          _data: string
          _descricao: string
          _itens: Json
          _origem_id?: string
          _origem_tipo?: string
        }
        Returns: string
      }
      gerar_graus_padrao_org: {
        Args: { _org_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "tesoureiro" | "secretario" | "irmao"
      grau_macom: "aprendiz" | "companheiro" | "mestre"
      natureza_corpo: "loja" | "capitulo" | "conselho" | "areopago" | "consistorio" | "outro"
      situacao_irmao: "ativo" | "quite" | "irregular" | "adormecido"
      tipo_conta: "caixa" | "banco" | "outro"
      tipo_lancamento: "entrada" | "saida" | "transferencia"
      tipo_plano_conta: "receita" | "despesa" | "ativo" | "passivo" | "patrimonio_liquido"
      tipo_sessao: "ordinaria" | "magna" | "branca" | "administrativa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "tesoureiro", "secretario", "irmao"],
      grau_macom: ["aprendiz", "companheiro", "mestre"],
      natureza_corpo: ["loja", "capitulo", "conselho", "areopago", "consistorio", "outro"],
      situacao_irmao: ["ativo", "quite", "irregular", "adormecido"],
      tipo_conta: ["caixa", "banco", "outro"],
      tipo_lancamento: ["entrada", "saida", "transferencia"],
      tipo_plano_conta: ["receita", "despesa", "ativo", "passivo", "patrimonio_liquido"],
      tipo_sessao: ["ordinaria", "magna", "branca", "administrativa"],
    },
  },
} as const
