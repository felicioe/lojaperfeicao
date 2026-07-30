export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type app_role = 'admin' | 'tesoureiro' | 'secretario' | 'irmao'
export type categoria_recebimento = 'mensalidade' | 'taxa_grau' | 'tronco' | 'doacao' | 'outros'
export type grau_macom = 'aprendiz' | 'companheiro' | 'mestre'
export type natureza_corpo = 'loja' | 'capitulo' | 'conselho' | 'areopago' | 'consistorio' | 'outro'
export type situacao_irmao = 'ativo' | 'quite' | 'irregular' | 'adormecido'
export type tipo_conta = 'caixa' | 'banco' | 'outro'
export type tipo_lancamento = 'entrada' | 'saida' | 'transferencia'
export type tipo_parente_irmao = 'pai' | 'mae' | 'conjuge' | 'contato_emergencia' | 'outro'
export type tipo_plano_conta = 'receita' | 'despesa' | 'ativo' | 'passivo' | 'patrimonio_liquido'
export type tipo_sessao = 'ordinaria' | 'magna' | 'branca' | 'administrativa'
export type tipo_terceiro = 'fornecedor' | 'cliente' | 'ambos'

export interface Database {
  public: {
    Tables: {
      cargos: {
        Row: {
          id: unknown | null
          org_id: unknown | null
          nome: unknown
          ordem: unknown
          ativo: unknown
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          org_id?: unknown | null
          nome: unknown
          ordem?: unknown | null
          ativo?: unknown | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          org_id?: unknown | null
          nome?: unknown | null
          ordem?: unknown | null
          ativo?: unknown | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      cnpj_consultas_cache: {
        Row: {
          cnpj: unknown | null
          dados: unknown
          consultado_em: unknown
        }
        Insert: {
          cnpj?: unknown | null
          dados: unknown
          consultado_em?: unknown | null
        }
        Update: {
          cnpj?: unknown | null
          dados?: unknown | null
          consultado_em?: unknown | null
        }
        Relationships: []
      }
      cnpj_rate_limit: {
        Row: {
          user_id: unknown | null
          tentativas: unknown
          janela_inicio: unknown
        }
        Insert: {
          user_id?: unknown | null
          tentativas?: unknown | null
          janela_inicio?: unknown | null
        }
        Update: {
          user_id?: unknown | null
          tentativas?: unknown | null
          janela_inicio?: unknown | null
        }
        Relationships: []
      }
      contas_financeiras: {
        Row: {
          id: unknown | null
          nome: unknown
          tipo: unknown
          banco: string | null
          agencia: string | null
          numero: string | null
          saldo_inicial: unknown
          ativo: unknown
          created_at: unknown
          plano_conta_id: unknown | null
        }
        Insert: {
          id?: unknown | null
          nome: unknown
          tipo?: unknown | null
          banco?: string | null
          agencia?: string | null
          numero?: string | null
          saldo_inicial?: unknown | null
          ativo?: unknown | null
          created_at?: unknown | null
          plano_conta_id?: unknown | null
        }
        Update: {
          id?: unknown | null
          nome?: unknown | null
          tipo?: unknown | null
          banco?: string | null
          agencia?: string | null
          numero?: string | null
          saldo_inicial?: unknown | null
          ativo?: unknown | null
          created_at?: unknown | null
          plano_conta_id?: unknown | null
        }
        Relationships: []
      }
      despesas_recorrentes: {
        Row: {
          id: unknown | null
          descricao: unknown
          valor: unknown
          dia_vencimento: unknown
          plano_conta_id: unknown
          terceiro_id: unknown | null
          data_inicio: unknown
          data_fim: string | null
          ativo: unknown
          observacoes: string | null
          created_at: unknown
          updated_at: unknown
        }
        Insert: {
          id?: unknown | null
          descricao: unknown
          valor: unknown
          dia_vencimento: unknown
          plano_conta_id: unknown
          terceiro_id?: unknown | null
          data_inicio?: unknown | null
          data_fim?: string | null
          ativo?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          descricao?: unknown | null
          valor?: unknown | null
          dia_vencimento?: unknown | null
          plano_conta_id?: unknown | null
          terceiro_id?: unknown | null
          data_inicio?: unknown | null
          data_fim?: string | null
          ativo?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Relationships: []
      }
      fechamentos_exercicio: {
        Row: {
          id: unknown | null
          exercicio: unknown
          data_corte: unknown
          status: unknown
          lancamento_transporte_id: unknown | null
          resultado_apurado: unknown | null
          fechado_por: unknown | null
          fechado_em: unknown
          reaberto_por: unknown | null
          reaberto_em: string | null
          motivo_reabertura: string | null
          observacoes: string | null
        }
        Insert: {
          id?: unknown | null
          exercicio: unknown
          data_corte: unknown
          status?: unknown | null
          lancamento_transporte_id?: unknown | null
          resultado_apurado?: unknown | null
          fechado_por?: unknown | null
          fechado_em?: unknown | null
          reaberto_por?: unknown | null
          reaberto_em?: string | null
          motivo_reabertura?: string | null
          observacoes?: string | null
        }
        Update: {
          id?: unknown | null
          exercicio?: unknown | null
          data_corte?: unknown | null
          status?: unknown | null
          lancamento_transporte_id?: unknown | null
          resultado_apurado?: unknown | null
          fechado_por?: unknown | null
          fechado_em?: unknown | null
          reaberto_por?: unknown | null
          reaberto_em?: string | null
          motivo_reabertura?: string | null
          observacoes?: string | null
        }
        Relationships: []
      }
      fechamentos_exercicio_eventos: {
        Row: {
          id: unknown | null
          fechamento_id: unknown
          acao: unknown
          lancamento_id: unknown | null
          realizado_por: unknown | null
          realizado_em: unknown
          motivo: string | null
        }
        Insert: {
          id?: unknown | null
          fechamento_id: unknown
          acao: unknown
          lancamento_id?: unknown | null
          realizado_por?: unknown | null
          realizado_em?: unknown | null
          motivo?: string | null
        }
        Update: {
          id?: unknown | null
          fechamento_id?: unknown | null
          acao?: unknown | null
          lancamento_id?: unknown | null
          realizado_por?: unknown | null
          realizado_em?: unknown | null
          motivo?: string | null
        }
        Relationships: []
      }
      gestao_cargos: {
        Row: {
          id: unknown | null
          gestao_id: unknown
          cargo_id: unknown
          irmao_id: unknown
          data_inicio: string | null
          data_fim: string | null
          observacoes: string | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          gestao_id: unknown
          cargo_id: unknown
          irmao_id: unknown
          data_inicio?: string | null
          data_fim?: string | null
          observacoes?: string | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          gestao_id?: unknown | null
          cargo_id?: unknown | null
          irmao_id?: unknown | null
          data_inicio?: string | null
          data_fim?: string | null
          observacoes?: string | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      gestoes: {
        Row: {
          id: unknown | null
          org_id: unknown
          nome: unknown
          data_inicio: unknown
          data_fim: unknown
          ativo: unknown
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          org_id: unknown
          nome: unknown
          data_inicio: unknown
          data_fim: unknown
          ativo?: unknown | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          org_id?: unknown | null
          nome?: unknown | null
          data_inicio?: unknown | null
          data_fim?: unknown | null
          ativo?: unknown | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      irmao_elevacoes: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          grau: unknown
          data: string | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          grau: unknown
          data?: string | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          grau?: unknown | null
          data?: string | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      irmao_filhos: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          nome: unknown
          data_nascimento: string | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          nome: unknown
          data_nascimento?: string | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          nome?: unknown | null
          data_nascimento?: string | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      irmao_formacao: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          curso: unknown
          instituicao: string | null
          nivel: string | null
          ano_conclusao: number | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          curso: unknown
          instituicao?: string | null
          nivel?: string | null
          ano_conclusao?: number | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          curso?: unknown | null
          instituicao?: string | null
          nivel?: string | null
          ano_conclusao?: number | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      irmao_orgs: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          org_id: unknown
          principal: unknown
          grau_atual: number | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          org_id: unknown
          principal?: unknown | null
          grau_atual?: number | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          org_id?: unknown | null
          principal?: unknown | null
          grau_atual?: number | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      irmao_parentes: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          tipo: unknown
          nome: unknown
          data_nascimento: string | null
          telefone: string | null
          profissao: string | null
          data_casamento: string | null
          observacoes: string | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          tipo: unknown
          nome: unknown
          data_nascimento?: string | null
          telefone?: string | null
          profissao?: string | null
          data_casamento?: string | null
          observacoes?: string | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          tipo?: unknown | null
          nome?: unknown | null
          data_nascimento?: string | null
          telefone?: string | null
          profissao?: string | null
          data_casamento?: string | null
          observacoes?: string | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      irmaos: {
        Row: {
          id: unknown | null
          user_id: unknown | null
          nome_civil: unknown
          nome_simbolico: string | null
          cim: string | null
          grau: unknown
          data_iniciacao: string | null
          data_elevacao: string | null
          data_exaltacao: string | null
          situacao: unknown
          potencia: string | null
          loja_origem: string | null
          email: string | null
          telefone: string | null
          endereco: string | null
          data_nascimento: string | null
          profissao: string | null
          valor_mensalidade: unknown
          created_at: unknown
          updated_at: unknown
          numero_matricula: string
        }
        Insert: {
          id?: unknown | null
          user_id?: unknown | null
          nome_civil: unknown
          nome_simbolico?: string | null
          cim?: string | null
          grau?: unknown | null
          data_iniciacao?: string | null
          data_elevacao?: string | null
          data_exaltacao?: string | null
          situacao?: unknown | null
          potencia?: string | null
          loja_origem?: string | null
          email?: string | null
          telefone?: string | null
          endereco?: string | null
          data_nascimento?: string | null
          profissao?: string | null
          valor_mensalidade?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
          numero_matricula?: string | null
        }
        Update: {
          id?: unknown | null
          user_id?: unknown | null
          nome_civil?: unknown | null
          nome_simbolico?: string | null
          cim?: string | null
          grau?: unknown | null
          data_iniciacao?: string | null
          data_elevacao?: string | null
          data_exaltacao?: string | null
          situacao?: unknown | null
          potencia?: string | null
          loja_origem?: string | null
          email?: string | null
          telefone?: string | null
          endereco?: string | null
          data_nascimento?: string | null
          profissao?: string | null
          valor_mensalidade?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
          numero_matricula?: string | null
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          id: unknown | null
          data: unknown
          data_vencimento: string | null
          data_pagamento: string | null
          descricao: unknown
          valor: unknown
          tipo: unknown
          conta_id: unknown | null
          conta_destino_id: unknown | null
          plano_conta_id: unknown | null
          irmao_id: unknown | null
          pago: unknown
          is_mensalidade: unknown
          competencia_mes: string | null
          observacoes: string | null
          created_by: unknown | null
          created_at: unknown
          updated_at: unknown
          terceiro_id: unknown | null
          recorrente_id: unknown | null
          recibo_id: unknown | null
          parcelamento_id: unknown
          categoria_recebimento: unknown | null
        }
        Insert: {
          id?: unknown | null
          data?: unknown | null
          data_vencimento?: string | null
          data_pagamento?: string | null
          descricao: unknown
          valor: unknown
          tipo: unknown
          conta_id?: unknown | null
          conta_destino_id?: unknown | null
          plano_conta_id?: unknown | null
          irmao_id?: unknown | null
          pago?: unknown | null
          is_mensalidade?: unknown | null
          competencia_mes?: string | null
          observacoes?: string | null
          created_by?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
          terceiro_id?: unknown | null
          recorrente_id?: unknown | null
          recibo_id?: unknown | null
          parcelamento_id?: unknown | null
          categoria_recebimento?: unknown | null
        }
        Update: {
          id?: unknown | null
          data?: unknown | null
          data_vencimento?: string | null
          data_pagamento?: string | null
          descricao?: unknown | null
          valor?: unknown | null
          tipo?: unknown | null
          conta_id?: unknown | null
          conta_destino_id?: unknown | null
          plano_conta_id?: unknown | null
          irmao_id?: unknown | null
          pago?: unknown | null
          is_mensalidade?: unknown | null
          competencia_mes?: string | null
          observacoes?: string | null
          created_by?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
          terceiro_id?: unknown | null
          recorrente_id?: unknown | null
          recibo_id?: unknown | null
          parcelamento_id?: unknown | null
          categoria_recebimento?: unknown | null
        }
        Relationships: []
      }
      lancamentos_contabeis: {
        Row: {
          id: unknown | null
          data: unknown
          competencia: unknown
          descricao: unknown
          origem_tipo: string | null
          origem_id: string | null
          criado_por: unknown | null
          criado_em: unknown
        }
        Insert: {
          id?: unknown | null
          data?: unknown | null
          competencia?: unknown | null
          descricao: unknown
          origem_tipo?: string | null
          origem_id?: string | null
          criado_por?: unknown | null
          criado_em?: unknown | null
        }
        Update: {
          id?: unknown | null
          data?: unknown | null
          competencia?: unknown | null
          descricao?: unknown | null
          origem_tipo?: string | null
          origem_id?: string | null
          criado_por?: unknown | null
          criado_em?: unknown | null
        }
        Relationships: []
      }
      lancamentos_contabeis_itens: {
        Row: {
          id: unknown | null
          lancamento_id: unknown
          conta_id: unknown
          tipo: unknown
          valor: unknown
          descricao: string | null
        }
        Insert: {
          id?: unknown | null
          lancamento_id: unknown
          conta_id: unknown
          tipo: unknown
          valor: unknown
          descricao?: string | null
        }
        Update: {
          id?: unknown | null
          lancamento_id?: unknown | null
          conta_id?: unknown | null
          tipo?: unknown | null
          valor?: unknown | null
          descricao?: string | null
        }
        Relationships: []
      }
      ofx_lancamentos: {
        Row: {
          id: unknown | null
          conta_financeira_id: unknown
          fitid: string | null
          data: unknown
          valor: unknown
          tipo_ofx: string | null
          descricao: string | null
          chave_dedupe: unknown
          conciliado: unknown
          lancamento_id: unknown | null
          importado_em: unknown
          importado_por: unknown | null
        }
        Insert: {
          id?: unknown | null
          conta_financeira_id: unknown
          fitid?: string | null
          data: unknown
          valor: unknown
          tipo_ofx?: string | null
          descricao?: string | null
          chave_dedupe: unknown
          conciliado?: unknown | null
          lancamento_id?: unknown | null
          importado_em?: unknown | null
          importado_por?: unknown | null
        }
        Update: {
          id?: unknown | null
          conta_financeira_id?: unknown | null
          fitid?: string | null
          data?: unknown | null
          valor?: unknown | null
          tipo_ofx?: string | null
          descricao?: string | null
          chave_dedupe?: unknown | null
          conciliado?: unknown | null
          lancamento_id?: unknown | null
          importado_em?: unknown | null
          importado_por?: unknown | null
        }
        Relationships: []
      }
      orcamento_itens: {
        Row: {
          id: unknown | null
          orcamento_id: unknown
          conta_id: unknown
          mes: unknown
          valor: unknown
        }
        Insert: {
          id?: unknown | null
          orcamento_id: unknown
          conta_id: unknown
          mes: unknown
          valor?: unknown | null
        }
        Update: {
          id?: unknown | null
          orcamento_id?: unknown | null
          conta_id?: unknown | null
          mes?: unknown | null
          valor?: unknown | null
        }
        Relationships: []
      }
      orcamentos: {
        Row: {
          id: unknown | null
          ano: unknown
          status: unknown
          observacoes: string | null
          created_by: unknown | null
          aprovado_por: unknown | null
          aprovado_em: string | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          ano: unknown
          status?: unknown | null
          observacoes?: string | null
          created_by?: unknown | null
          aprovado_por?: unknown | null
          aprovado_em?: string | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          ano?: unknown | null
          status?: unknown | null
          observacoes?: string | null
          created_by?: unknown | null
          aprovado_por?: unknown | null
          aprovado_em?: string | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      orgs: {
        Row: {
          id: unknown | null
          potencia_id: unknown | null
          nome: unknown
          sigla: string | null
          natureza: unknown
          numero: string | null
          rito: string | null
          grau_min: unknown
          grau_max: unknown
          mensalidade_padrao: unknown
          cnpj: string | null
          fundacao: string | null
          endereco: string | null
          ativo: unknown
          created_at: unknown
          updated_at: unknown
        }
        Insert: {
          id?: unknown | null
          potencia_id?: unknown | null
          nome: unknown
          sigla?: string | null
          natureza?: unknown | null
          numero?: string | null
          rito?: string | null
          grau_min?: unknown | null
          grau_max?: unknown | null
          mensalidade_padrao?: unknown | null
          cnpj?: string | null
          fundacao?: string | null
          endereco?: string | null
          ativo?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          potencia_id?: unknown | null
          nome?: unknown | null
          sigla?: string | null
          natureza?: unknown | null
          numero?: string | null
          rito?: string | null
          grau_min?: unknown | null
          grau_max?: unknown | null
          mensalidade_padrao?: unknown | null
          cnpj?: string | null
          fundacao?: string | null
          endereco?: string | null
          ativo?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Relationships: []
      }
      orgs_graus: {
        Row: {
          id: unknown | null
          org_id: unknown
          grau: unknown
          nome: unknown
        }
        Insert: {
          id?: unknown | null
          org_id: unknown
          grau: unknown
          nome: unknown
        }
        Update: {
          id?: unknown | null
          org_id?: unknown | null
          grau?: unknown | null
          nome?: unknown | null
        }
        Relationships: []
      }
      parametros_financeiros: {
        Row: {
          id: unknown | null
          multa_ativa: unknown
          multa_percentual: unknown
          juros_ativo: unknown
          juros_diario_percentual: unknown
          updated_at: unknown
        }
        Insert: {
          id?: unknown | null
          multa_ativa?: unknown | null
          multa_percentual?: unknown | null
          juros_ativo?: unknown | null
          juros_diario_percentual?: unknown | null
          updated_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          multa_ativa?: unknown | null
          multa_percentual?: unknown | null
          juros_ativo?: unknown | null
          juros_diario_percentual?: unknown | null
          updated_at?: unknown | null
        }
        Relationships: []
      }
      parcelamentos: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          data: unknown
          valor_original: unknown
          valor_multa: unknown
          valor_juros: unknown
          entrada: unknown
          valor_parcelado: unknown
          numero_parcelas: unknown
          observacoes: string | null
          created_at: unknown
          created_by: unknown | null
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          data?: unknown | null
          valor_original: unknown
          valor_multa?: unknown | null
          valor_juros?: unknown | null
          entrada?: unknown | null
          valor_parcelado: unknown
          numero_parcelas: unknown
          observacoes?: string | null
          created_at?: unknown | null
          created_by?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          data?: unknown | null
          valor_original?: unknown | null
          valor_multa?: unknown | null
          valor_juros?: unknown | null
          entrada?: unknown | null
          valor_parcelado?: unknown | null
          numero_parcelas?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
          created_by?: unknown | null
        }
        Relationships: []
      }
      plano_contas: {
        Row: {
          id: unknown | null
          codigo: unknown
          nome: unknown
          tipo: unknown
          ativo: unknown
          created_at: unknown
          analitica: unknown
          parent_id: unknown | null
        }
        Insert: {
          id?: unknown | null
          codigo: unknown
          nome: unknown
          tipo: unknown
          ativo?: unknown | null
          created_at?: unknown | null
          analitica?: unknown | null
          parent_id?: unknown | null
        }
        Update: {
          id?: unknown | null
          codigo?: unknown | null
          nome?: unknown | null
          tipo?: unknown | null
          ativo?: unknown | null
          created_at?: unknown | null
          analitica?: unknown | null
          parent_id?: unknown | null
        }
        Relationships: []
      }
      potencias: {
        Row: {
          id: unknown | null
          nome: unknown
          sigla: string | null
          jurisdicao: string | null
          site: string | null
          ativo: unknown
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          nome: unknown
          sigla?: string | null
          jurisdicao?: string | null
          site?: string | null
          ativo?: unknown | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          nome?: unknown | null
          sigla?: string | null
          jurisdicao?: string | null
          site?: string | null
          ativo?: unknown | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      presencas: {
        Row: {
          id: unknown | null
          sessao_id: unknown
          irmao_id: unknown
          presente: unknown
          justificado: unknown
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          sessao_id: unknown
          irmao_id: unknown
          presente?: unknown | null
          justificado?: unknown | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          sessao_id?: unknown | null
          irmao_id?: unknown | null
          presente?: unknown | null
          justificado?: unknown | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: unknown | null
          full_name: string | null
          irmao_id: string | null
          created_at: unknown
          updated_at: unknown
        }
        Insert: {
          id?: unknown | null
          full_name?: string | null
          irmao_id?: string | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          full_name?: string | null
          irmao_id?: string | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Relationships: []
      }
      recibo_itens: {
        Row: {
          id: unknown | null
          recibo_id: unknown
          lancamento_id: unknown
          valor_original: unknown
          valor_multa: unknown
          valor_juros: unknown
        }
        Insert: {
          id?: unknown | null
          recibo_id: unknown
          lancamento_id: unknown
          valor_original: unknown
          valor_multa?: unknown | null
          valor_juros?: unknown | null
        }
        Update: {
          id?: unknown | null
          recibo_id?: unknown | null
          lancamento_id?: unknown | null
          valor_original?: unknown | null
          valor_multa?: unknown | null
          valor_juros?: unknown | null
        }
        Relationships: []
      }
      recibos: {
        Row: {
          id: unknown | null
          irmao_id: unknown
          data: unknown
          valor_original: unknown
          valor_multa: unknown
          valor_juros: unknown
          desconto: unknown
          valor_total: unknown
          forma_pagamento: string | null
          conta_financeira_id: unknown | null
          observacoes: string | null
          created_at: unknown
          created_by: unknown | null
        }
        Insert: {
          id?: unknown | null
          irmao_id: unknown
          data?: unknown | null
          valor_original: unknown
          valor_multa?: unknown | null
          valor_juros?: unknown | null
          desconto?: unknown | null
          valor_total: unknown
          forma_pagamento?: string | null
          conta_financeira_id?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
          created_by?: unknown | null
        }
        Update: {
          id?: unknown | null
          irmao_id?: unknown | null
          data?: unknown | null
          valor_original?: unknown | null
          valor_multa?: unknown | null
          valor_juros?: unknown | null
          desconto?: unknown | null
          valor_total?: unknown | null
          forma_pagamento?: string | null
          conta_financeira_id?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
          created_by?: unknown | null
        }
        Relationships: []
      }
      sessoes: {
        Row: {
          id: unknown | null
          data: unknown
          tipo: unknown
          grau: unknown
          observacoes: string | null
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          data: unknown
          tipo?: unknown | null
          grau?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          data?: unknown | null
          tipo?: unknown | null
          grau?: unknown | null
          observacoes?: string | null
          created_at?: unknown | null
        }
        Relationships: []
      }
      terceiros: {
        Row: {
          id: unknown | null
          tipo: unknown
          nome: unknown
          nome_fantasia: string | null
          cnpj: string | null
          cpf: string | null
          contato: string | null
          email: string | null
          categoria: string | null
          cep: string | null
          logradouro: string | null
          numero: string | null
          bairro: string | null
          municipio: string | null
          uf: string | null
          observacoes: string | null
          ativo: unknown
          created_at: unknown
          updated_at: unknown
        }
        Insert: {
          id?: unknown | null
          tipo?: unknown | null
          nome: unknown
          nome_fantasia?: string | null
          cnpj?: string | null
          cpf?: string | null
          contato?: string | null
          email?: string | null
          categoria?: string | null
          cep?: string | null
          logradouro?: string | null
          numero?: string | null
          bairro?: string | null
          municipio?: string | null
          uf?: string | null
          observacoes?: string | null
          ativo?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          tipo?: unknown | null
          nome?: unknown | null
          nome_fantasia?: string | null
          cnpj?: string | null
          cpf?: string | null
          contato?: string | null
          email?: string | null
          categoria?: string | null
          cep?: string | null
          logradouro?: string | null
          numero?: string | null
          bairro?: string | null
          municipio?: string | null
          uf?: string | null
          observacoes?: string | null
          ativo?: unknown | null
          created_at?: unknown | null
          updated_at?: unknown | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: unknown | null
          user_id: unknown
          role: unknown
          created_at: unknown
        }
        Insert: {
          id?: unknown | null
          user_id: unknown
          role: unknown
          created_at?: unknown | null
        }
        Update: {
          id?: unknown | null
          user_id?: unknown | null
          role?: unknown | null
          created_at?: unknown | null
        }
        Relationships: []
      }
    }
    Views: {
      v_auditoria_contabil_desbalanceados: {
        Row: { [key: string]: unknown }
      }
      v_saldo_contas: {
        Row: { [key: string]: unknown }
      }
      v_saldo_plano_contas: {
        Row: { [key: string]: unknown }
      }
    }
    Functions: {
      _postar_provisao_fatura: { Args: { lancamento_id: string; valor: number; data: string; competencia: string; descricao: string; rateio: string }; Returns: unknown }
      aprovar_orcamento: { Args: { orcamento_id: string }; Returns: unknown }
      baixar_conta_pagar: { Args: { lancamento_id: string; conta_financeira_id: string; forma_pagamento: string; data_pagamento: string }; Returns: unknown }
      baixar_faturas: { Args: { lancamento_ids: { [key: number]: string } & string[]; conta_financeira_id: string; forma_pagamento: string; data_pagamento: string; desconto: number; observacoes: string }; Returns: string }
      calcular_multa_juros: { Args: { valor: number; vencimento: string; data_referencia: string }; Returns: unknown }
      check_lancamento_balanceado: { Args: {}; Returns: unknown }
      check_plano_contas_sem_ciclo: { Args: {}; Returns: unknown }
      conciliar_ofx_existente: { Args: { ofx_id: string; lancamento_id: string }; Returns: unknown }
      criar_conta_pagar: { Args: { descricao: string; valor: number; plano_conta_id: string; data: string; data_vencimento: string; competencia_mes: string; terceiro_id: string; observacoes: string }; Returns: string }
      criar_fatura_avulsa: { Args: { irmao_id: string; valor: number; competencia_mes: string; data_vencimento: string; descricao: string; rateio: string }; Returns: string }
      criar_lancamento_de_ofx: { Args: { ofx_id: string; plano_conta_id: string; categoria: unknown; irmao_id: string; terceiro_id: string; descricao: string }; Returns: string }
      criar_orcamento: { Args: { ano: number; observacoes: string }; Returns: string }
      criar_parcelamento: { Args: { lancamento_ids: { [key: number]: string } & string[]; numero_parcelas: number; entrada: number; conta_financeira_id: string; data: string; incluir_multa_juros: boolean; observacoes: string }; Returns: string }
      criar_transferencia: { Args: { conta_origem_id: string; conta_destino_id: string; valor: number; data: string; descricao: string }; Returns: string }
      definir_valor_orcamento: { Args: { orcamento_id: string; conta_id: string; mes: number; valor: number }; Returns: unknown }
      desativar_outras_gestoes: { Args: {}; Returns: unknown }
      efetivar_recorrentes_vencidas: { Args: {}; Returns: number }
      fechar_exercicio: { Args: { exercicio: number; data_corte: string; observacoes: string }; Returns: string }
      flag_parent_nao_analitica: { Args: {}; Returns: unknown }
      gerar_graus_padrao_org: { Args: { org_id: string }; Returns: number }
      gerar_mensalidades: { Args: { competencia: string; data_vencimento: string; irmao_id: string; rateio: string }; Returns: number }
      handle_new_user: { Args: {}; Returns: unknown }
      has_role: { Args: { user_id: string; role: unknown }; Returns: boolean }
      is_admin_or: { Args: { user_id: string; role: unknown }; Returns: boolean }
      reabrir_exercicio: { Args: { exercicio: number; motivo: string }; Returns: unknown }
      reabrir_orcamento: { Args: { orcamento_id: string }; Returns: unknown }
      registrar_lancamento_contabil: { Args: { data: string; competencia: string; descricao: string; itens: string; origem_tipo: string; origem_id: string }; Returns: string }
      registrar_recebimento_avulso: { Args: { valor: number; categoria: unknown; plano_conta_id: string; conta_financeira_id: string; data: string; forma_pagamento: string; irmao_id: string; terceiro_id: string; descricao: string; observacoes: string }; Returns: string }
      set_updated_at: { Args: {}; Returns: unknown }
    }
    Enums: {
      app_role: 'admin' | 'tesoureiro' | 'secretario' | 'irmao'
      categoria_recebimento: 'mensalidade' | 'taxa_grau' | 'tronco' | 'doacao' | 'outros'
      grau_macom: 'aprendiz' | 'companheiro' | 'mestre'
      natureza_corpo: 'loja' | 'capitulo' | 'conselho' | 'areopago' | 'consistorio' | 'outro'
      situacao_irmao: 'ativo' | 'quite' | 'irregular' | 'adormecido'
      tipo_conta: 'caixa' | 'banco' | 'outro'
      tipo_lancamento: 'entrada' | 'saida' | 'transferencia'
      tipo_parente_irmao: 'pai' | 'mae' | 'conjuge' | 'contato_emergencia' | 'outro'
      tipo_plano_conta: 'receita' | 'despesa' | 'ativo' | 'passivo' | 'patrimonio_liquido'
      tipo_sessao: 'ordinaria' | 'magna' | 'branca' | 'administrativa'
      tipo_terceiro: 'fornecedor' | 'cliente' | 'ambos'
    }
  }
}

