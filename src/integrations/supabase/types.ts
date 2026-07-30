export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      cargos: {
        Row: {
          id: any
          org_id: any
          nome: any
          ordem: any
          ativo: any
          created_at: any
        }
        Insert: {
          id?: any
          org_id?: any
          nome: any
          ordem: any
          ativo: any
          created_at: any
        }
        Update: {
          id?: any
          org_id?: any
          nome?: any
          ordem?: any
          ativo?: any
          created_at?: any
        }
      }
      cnpj_consultas_cache: {
        Row: {
          cnpj: any
          dados: any
          consultado_em: any
        }
        Insert: {
          cnpj?: any
          dados: any
          consultado_em: any
        }
        Update: {
          cnpj?: any
          dados?: any
          consultado_em?: any
        }
      }
      cnpj_rate_limit: {
        Row: {
          user_id: any
          tentativas: any
          janela_inicio: any
        }
        Insert: {
          user_id?: any
          tentativas: any
          janela_inicio: any
        }
        Update: {
          user_id?: any
          tentativas?: any
          janela_inicio?: any
        }
      }
      contas_financeiras: {
        Row: {
          id: any
          nome: any
          tipo: any
          banco: string | null
          agencia: string | null
          numero: string | null
          saldo_inicial: any
          ativo: any
          created_at: any
          plano_conta_id: any
        }
        Insert: {
          id?: any
          nome: any
          tipo: any
          banco?: string | null
          agencia?: string | null
          numero?: string | null
          saldo_inicial: any
          ativo: any
          created_at: any
          plano_conta_id?: any
        }
        Update: {
          id?: any
          nome?: any
          tipo?: any
          banco?: string | null
          agencia?: string | null
          numero?: string | null
          saldo_inicial?: any
          ativo?: any
          created_at?: any
          plano_conta_id?: any
        }
      }
      despesas_recorrentes: {
        Row: {
          id: any
          descricao: any
          valor: any
          dia_vencimento: any
          plano_conta_id: any
          terceiro_id: any
          data_inicio: any
          data_fim: string | null
          ativo: any
          observacoes: string | null
          created_at: any
          updated_at: any
        }
        Insert: {
          id?: any
          descricao: any
          valor: any
          dia_vencimento: any
          plano_conta_id: any
          terceiro_id?: any
          data_inicio: any
          data_fim?: string | null
          ativo: any
          observacoes?: string | null
          created_at: any
          updated_at: any
        }
        Update: {
          id?: any
          descricao?: any
          valor?: any
          dia_vencimento?: any
          plano_conta_id?: any
          terceiro_id?: any
          data_inicio?: any
          data_fim?: string | null
          ativo?: any
          observacoes?: string | null
          created_at?: any
          updated_at?: any
        }
      }
      fechamentos_exercicio: {
        Row: {
          id: any
          exercicio: any
          data_corte: any
          status: any
          lancamento_transporte_id: any
          resultado_apurado: any
          fechado_por: any
          fechado_em: any
          reaberto_por: any
          reaberto_em: string | null
          motivo_reabertura: string | null
          observacoes: string | null
        }
        Insert: {
          id?: any
          exercicio: any
          data_corte: any
          status: any
          lancamento_transporte_id?: any
          resultado_apurado?: any
          fechado_por?: any
          fechado_em: any
          reaberto_por?: any
          reaberto_em?: string | null
          motivo_reabertura?: string | null
          observacoes?: string | null
        }
        Update: {
          id?: any
          exercicio?: any
          data_corte?: any
          status?: any
          lancamento_transporte_id?: any
          resultado_apurado?: any
          fechado_por?: any
          fechado_em?: any
          reaberto_por?: any
          reaberto_em?: string | null
          motivo_reabertura?: string | null
          observacoes?: string | null
        }
      }
      fechamentos_exercicio_eventos: {
        Row: {
          id: any
          fechamento_id: any
          acao: any
          lancamento_id: any
          realizado_por: any
          realizado_em: any
          motivo: string | null
        }
        Insert: {
          id?: any
          fechamento_id: any
          acao: any
          lancamento_id?: any
          realizado_por?: any
          realizado_em: any
          motivo?: string | null
        }
        Update: {
          id?: any
          fechamento_id?: any
          acao?: any
          lancamento_id?: any
          realizado_por?: any
          realizado_em?: any
          motivo?: string | null
        }
      }
      gestao_cargos: {
        Row: {
          id: any
          gestao_id: any
          cargo_id: any
          irmao_id: any
          data_inicio: string | null
          data_fim: string | null
          observacoes: string | null
          created_at: any
        }
        Insert: {
          id?: any
          gestao_id: any
          cargo_id: any
          irmao_id: any
          data_inicio?: string | null
          data_fim?: string | null
          observacoes?: string | null
          created_at: any
        }
        Update: {
          id?: any
          gestao_id?: any
          cargo_id?: any
          irmao_id?: any
          data_inicio?: string | null
          data_fim?: string | null
          observacoes?: string | null
          created_at?: any
        }
      }
      gestoes: {
        Row: {
          id: any
          org_id: any
          nome: any
          data_inicio: any
          data_fim: any
          ativo: any
          created_at: any
        }
        Insert: {
          id?: any
          org_id: any
          nome: any
          data_inicio: any
          data_fim: any
          ativo: any
          created_at: any
        }
        Update: {
          id?: any
          org_id?: any
          nome?: any
          data_inicio?: any
          data_fim?: any
          ativo?: any
          created_at?: any
        }
      }
      irmao_elevacoes: {
        Row: {
          id: any
          irmao_id: any
          grau: any
          data: string | null
          created_at: any
        }
        Insert: {
          id?: any
          irmao_id: any
          grau: any
          data?: string | null
          created_at: any
        }
        Update: {
          id?: any
          irmao_id?: any
          grau?: any
          data?: string | null
          created_at?: any
        }
      }
      irmao_filhos: {
        Row: {
          id: any
          irmao_id: any
          nome: any
          data_nascimento: string | null
          created_at: any
        }
        Insert: {
          id?: any
          irmao_id: any
          nome: any
          data_nascimento?: string | null
          created_at: any
        }
        Update: {
          id?: any
          irmao_id?: any
          nome?: any
          data_nascimento?: string | null
          created_at?: any
        }
      }
      irmao_formacao: {
        Row: {
          id: any
          irmao_id: any
          curso: any
          instituicao: string | null
          nivel: string | null
          ano_conclusao: number | null
          created_at: any
        }
        Insert: {
          id?: any
          irmao_id: any
          curso: any
          instituicao?: string | null
          nivel?: string | null
          ano_conclusao?: number | null
          created_at: any
        }
        Update: {
          id?: any
          irmao_id?: any
          curso?: any
          instituicao?: string | null
          nivel?: string | null
          ano_conclusao?: number | null
          created_at?: any
        }
      }
      irmao_orgs: {
        Row: {
          id: any
          irmao_id: any
          org_id: any
          principal: any
          grau_atual: number | null
          created_at: any
        }
        Insert: {
          id?: any
          irmao_id: any
          org_id: any
          principal: any
          grau_atual?: number | null
          created_at: any
        }
        Update: {
          id?: any
          irmao_id?: any
          org_id?: any
          principal?: any
          grau_atual?: number | null
          created_at?: any
        }
      }
      irmao_parentes: {
        Row: {
          id: any
          irmao_id: any
          tipo: any
          nome: any
          data_nascimento: string | null
          telefone: string | null
          profissao: string | null
          data_casamento: string | null
          observacoes: string | null
          created_at: any
        }
        Insert: {
          id?: any
          irmao_id: any
          tipo: any
          nome: any
          data_nascimento?: string | null
          telefone?: string | null
          profissao?: string | null
          data_casamento?: string | null
          observacoes?: string | null
          created_at: any
        }
        Update: {
          id?: any
          irmao_id?: any
          tipo?: any
          nome?: any
          data_nascimento?: string | null
          telefone?: string | null
          profissao?: string | null
          data_casamento?: string | null
          observacoes?: string | null
          created_at?: any
        }
      }
      irmaos: {
        Row: {
          id: any
          user_id: any
          nome_civil: any
          nome_simbolico: string | null
          cim: string | null
          grau: any
          data_iniciacao: string | null
          data_elevacao: string | null
          data_exaltacao: string | null
          situacao: any
          potencia: string | null
          loja_origem: string | null
          email: string | null
          telefone: string | null
          endereco: string | null
          data_nascimento: string | null
          profissao: string | null
          valor_mensalidade: any
          created_at: any
          updated_at: any
          numero_matricula: string
        }
        Insert: {
          id?: any
          user_id?: any
          nome_civil: any
          nome_simbolico?: string | null
          cim?: string | null
          grau: any
          data_iniciacao?: string | null
          data_elevacao?: string | null
          data_exaltacao?: string | null
          situacao: any
          potencia?: string | null
          loja_origem?: string | null
          email?: string | null
          telefone?: string | null
          endereco?: string | null
          data_nascimento?: string | null
          profissao?: string | null
          valor_mensalidade: any
          created_at: any
          updated_at: any
          numero_matricula: string | null
        }
        Update: {
          id?: any
          user_id?: any
          nome_civil?: any
          nome_simbolico?: string | null
          cim?: string | null
          grau?: any
          data_iniciacao?: string | null
          data_elevacao?: string | null
          data_exaltacao?: string | null
          situacao?: any
          potencia?: string | null
          loja_origem?: string | null
          email?: string | null
          telefone?: string | null
          endereco?: string | null
          data_nascimento?: string | null
          profissao?: string | null
          valor_mensalidade?: any
          created_at?: any
          updated_at?: any
          numero_matricula?: string | null
        }
      }
      lancamentos: {
        Row: {
          id: any
          data: any
          data_vencimento: string | null
          data_pagamento: string | null
          descricao: any
          valor: any
          tipo: any
          conta_id: any
          conta_destino_id: any
          plano_conta_id: any
          irmao_id: any
          pago: any
          is_mensalidade: any
          competencia_mes: string | null
          observacoes: string | null
          created_by: any
          created_at: any
          updated_at: any
          terceiro_id: any
          recorrente_id: any
          recibo_id: any
          parcelamento_id: any
          categoria_recebimento: any
        }
        Insert: {
          id?: any
          data: any
          data_vencimento?: string | null
          data_pagamento?: string | null
          descricao: any
          valor: any
          tipo: any
          conta_id?: any
          conta_destino_id?: any
          plano_conta_id?: any
          irmao_id?: any
          pago: any
          is_mensalidade: any
          competencia_mes?: string | null
          observacoes?: string | null
          created_by?: any
          created_at: any
          updated_at: any
          terceiro_id?: any
          recorrente_id?: any
          recibo_id?: any
          parcelamento_id: any
          categoria_recebimento?: any
        }
        Update: {
          id?: any
          data?: any
          data_vencimento?: string | null
          data_pagamento?: string | null
          descricao?: any
          valor?: any
          tipo?: any
          conta_id?: any
          conta_destino_id?: any
          plano_conta_id?: any
          irmao_id?: any
          pago?: any
          is_mensalidade?: any
          competencia_mes?: string | null
          observacoes?: string | null
          created_by?: any
          created_at?: any
          updated_at?: any
          terceiro_id?: any
          recorrente_id?: any
          recibo_id?: any
          parcelamento_id?: any
          categoria_recebimento?: any
        }
      }
      lancamentos_contabeis: {
        Row: {
          id: any
          data: any
          competencia: any
          descricao: any
          origem_tipo: string | null
          origem_id: string | null
          criado_por: any
          criado_em: any
        }
        Insert: {
          id?: any
          data: any
          competencia: any
          descricao: any
          origem_tipo?: string | null
          origem_id?: string | null
          criado_por?: any
          criado_em: any
        }
        Update: {
          id?: any
          data?: any
          competencia?: any
          descricao?: any
          origem_tipo?: string | null
          origem_id?: string | null
          criado_por?: any
          criado_em?: any
        }
      }
      lancamentos_contabeis_itens: {
        Row: {
          id: any
          lancamento_id: any
          conta_id: any
          tipo: any
          valor: any
          descricao: string | null
        }
        Insert: {
          id?: any
          lancamento_id: any
          conta_id: any
          tipo: any
          valor: any
          descricao?: string | null
        }
        Update: {
          id?: any
          lancamento_id?: any
          conta_id?: any
          tipo?: any
          valor?: any
          descricao?: string | null
        }
      }
      ofx_lancamentos: {
        Row: {
          id: any
          conta_financeira_id: any
          fitid: string | null
          data: any
          valor: any
          tipo_ofx: string | null
          descricao: string | null
          chave_dedupe: any
          conciliado: any
          lancamento_id: any
          importado_em: any
          importado_por: any
        }
        Insert: {
          id?: any
          conta_financeira_id: any
          fitid?: string | null
          data: any
          valor: any
          tipo_ofx?: string | null
          descricao?: string | null
          chave_dedupe: any
          conciliado: any
          lancamento_id?: any
          importado_em: any
          importado_por?: any
        }
        Update: {
          id?: any
          conta_financeira_id?: any
          fitid?: string | null
          data?: any
          valor?: any
          tipo_ofx?: string | null
          descricao?: string | null
          chave_dedupe?: any
          conciliado?: any
          lancamento_id?: any
          importado_em?: any
          importado_por?: any
        }
      }
      orcamento_itens: {
        Row: {
          id: any
          orcamento_id: any
          conta_id: any
          mes: any
          valor: any
        }
        Insert: {
          id?: any
          orcamento_id: any
          conta_id: any
          mes: any
          valor: any
        }
        Update: {
          id?: any
          orcamento_id?: any
          conta_id?: any
          mes?: any
          valor?: any
        }
      }
      orcamentos: {
        Row: {
          id: any
          ano: any
          status: any
          observacoes: string | null
          created_by: any
          aprovado_por: any
          aprovado_em: string | null
          created_at: any
        }
        Insert: {
          id?: any
          ano: any
          status: any
          observacoes?: string | null
          created_by?: any
          aprovado_por?: any
          aprovado_em?: string | null
          created_at: any
        }
        Update: {
          id?: any
          ano?: any
          status?: any
          observacoes?: string | null
          created_by?: any
          aprovado_por?: any
          aprovado_em?: string | null
          created_at?: any
        }
      }
      orgs: {
        Row: {
          id: any
          potencia_id: any
          nome: any
          sigla: string | null
          natureza: any
          numero: string | null
          rito: string | null
          grau_min: any
          grau_max: any
          mensalidade_padrao: any
          cnpj: string | null
          fundacao: string | null
          endereco: string | null
          ativo: any
          created_at: any
          updated_at: any
        }
        Insert: {
          id?: any
          potencia_id?: any
          nome: any
          sigla?: string | null
          natureza: any
          numero?: string | null
          rito?: string | null
          grau_min: any
          grau_max: any
          mensalidade_padrao: any
          cnpj?: string | null
          fundacao?: string | null
          endereco?: string | null
          ativo: any
          created_at: any
          updated_at: any
        }
        Update: {
          id?: any
          potencia_id?: any
          nome?: any
          sigla?: string | null
          natureza?: any
          numero?: string | null
          rito?: string | null
          grau_min?: any
          grau_max?: any
          mensalidade_padrao?: any
          cnpj?: string | null
          fundacao?: string | null
          endereco?: string | null
          ativo?: any
          created_at?: any
          updated_at?: any
        }
      }
      orgs_graus: {
        Row: {
          id: any
          org_id: any
          grau: any
          nome: any
        }
        Insert: {
          id?: any
          org_id: any
          grau: any
          nome: any
        }
        Update: {
          id?: any
          org_id?: any
          grau?: any
          nome?: any
        }
      }
      parametros_financeiros: {
        Row: {
          id: any
          multa_ativa: any
          multa_percentual: any
          juros_ativo: any
          juros_diario_percentual: any
          updated_at: any
        }
        Insert: {
          id?: any
          multa_ativa: any
          multa_percentual: any
          juros_ativo: any
          juros_diario_percentual: any
          updated_at: any
        }
        Update: {
          id?: any
          multa_ativa?: any
          multa_percentual?: any
          juros_ativo?: any
          juros_diario_percentual?: any
          updated_at?: any
        }
      }
      parcelamentos: {
        Row: {
          id: any
          irmao_id: any
          data: any
          valor_original: any
          valor_multa: any
          valor_juros: any
          entrada: any
          valor_parcelado: any
          numero_parcelas: any
          observacoes: string | null
          created_at: any
          created_by: any
        }
        Insert: {
          id?: any
          irmao_id: any
          data: any
          valor_original: any
          valor_multa: any
          valor_juros: any
          entrada: any
          valor_parcelado: any
          numero_parcelas: any
          observacoes?: string | null
          created_at: any
          created_by?: any
        }
        Update: {
          id?: any
          irmao_id?: any
          data?: any
          valor_original?: any
          valor_multa?: any
          valor_juros?: any
          entrada?: any
          valor_parcelado?: any
          numero_parcelas?: any
          observacoes?: string | null
          created_at?: any
          created_by?: any
        }
      }
      plano_contas: {
        Row: {
          id: any
          codigo: any
          nome: any
          tipo: any
          ativo: any
          created_at: any
          analitica: any
          parent_id: any
        }
        Insert: {
          id?: any
          codigo: any
          nome: any
          tipo: any
          ativo: any
          created_at: any
          analitica: any
          parent_id?: any
        }
        Update: {
          id?: any
          codigo?: any
          nome?: any
          tipo?: any
          ativo?: any
          created_at?: any
          analitica?: any
          parent_id?: any
        }
      }
      potencias: {
        Row: {
          id: any
          nome: any
          sigla: string | null
          jurisdicao: string | null
          site: string | null
          ativo: any
          created_at: any
        }
        Insert: {
          id?: any
          nome: any
          sigla?: string | null
          jurisdicao?: string | null
          site?: string | null
          ativo: any
          created_at: any
        }
        Update: {
          id?: any
          nome?: any
          sigla?: string | null
          jurisdicao?: string | null
          site?: string | null
          ativo?: any
          created_at?: any
        }
      }
      presencas: {
        Row: {
          id: any
          sessao_id: any
          irmao_id: any
          presente: any
          justificado: any
          created_at: any
        }
        Insert: {
          id?: any
          sessao_id: any
          irmao_id: any
          presente: any
          justificado: any
          created_at: any
        }
        Update: {
          id?: any
          sessao_id?: any
          irmao_id?: any
          presente?: any
          justificado?: any
          created_at?: any
        }
      }
      profiles: {
        Row: {
          id: any
          full_name: string | null
          irmao_id: string | null
          created_at: any
          updated_at: any
        }
        Insert: {
          id?: any
          full_name?: string | null
          irmao_id?: string | null
          created_at: any
          updated_at: any
        }
        Update: {
          id?: any
          full_name?: string | null
          irmao_id?: string | null
          created_at?: any
          updated_at?: any
        }
      }
      recibo_itens: {
        Row: {
          id: any
          recibo_id: any
          lancamento_id: any
          valor_original: any
          valor_multa: any
          valor_juros: any
        }
        Insert: {
          id?: any
          recibo_id: any
          lancamento_id: any
          valor_original: any
          valor_multa: any
          valor_juros: any
        }
        Update: {
          id?: any
          recibo_id?: any
          lancamento_id?: any
          valor_original?: any
          valor_multa?: any
          valor_juros?: any
        }
      }
      recibos: {
        Row: {
          id: any
          irmao_id: any
          data: any
          valor_original: any
          valor_multa: any
          valor_juros: any
          desconto: any
          valor_total: any
          forma_pagamento: string | null
          conta_financeira_id: any
          observacoes: string | null
          created_at: any
          created_by: any
        }
        Insert: {
          id?: any
          irmao_id: any
          data: any
          valor_original: any
          valor_multa: any
          valor_juros: any
          desconto: any
          valor_total: any
          forma_pagamento?: string | null
          conta_financeira_id?: any
          observacoes?: string | null
          created_at: any
          created_by?: any
        }
        Update: {
          id?: any
          irmao_id?: any
          data?: any
          valor_original?: any
          valor_multa?: any
          valor_juros?: any
          desconto?: any
          valor_total?: any
          forma_pagamento?: string | null
          conta_financeira_id?: any
          observacoes?: string | null
          created_at?: any
          created_by?: any
        }
      }
      sessoes: {
        Row: {
          id: any
          data: any
          tipo: any
          grau: any
          observacoes: string | null
          created_at: any
        }
        Insert: {
          id?: any
          data: any
          tipo: any
          grau: any
          observacoes?: string | null
          created_at: any
        }
        Update: {
          id?: any
          data?: any
          tipo?: any
          grau?: any
          observacoes?: string | null
          created_at?: any
        }
      }
      terceiros: {
        Row: {
          id: any
          tipo: any
          nome: any
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
          ativo: any
          created_at: any
          updated_at: any
        }
        Insert: {
          id?: any
          tipo: any
          nome: any
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
          ativo: any
          created_at: any
          updated_at: any
        }
        Update: {
          id?: any
          tipo?: any
          nome?: any
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
          ativo?: any
          created_at?: any
          updated_at?: any
        }
      }
      user_roles: {
        Row: {
          id: any
          user_id: any
          role: any
          created_at: any
        }
        Insert: {
          id?: any
          user_id: any
          role: any
          created_at: any
        }
        Update: {
          id?: any
          user_id?: any
          role?: any
          created_at?: any
        }
      }
    }
    Views: {
      v_auditoria_contabil_desbalanceados: {
        Row: { [key: string]: any }
      }
      v_saldo_contas: {
        Row: { [key: string]: any }
      }
      v_saldo_plano_contas: {
        Row: { [key: string]: any }
      }
    }
    Functions: {
      _postar_provisao_fatura: { Args: { arg0: string | null, arg1: number | null, arg2: string | null, arg3: string | null, arg4: string | null, arg5: string | null }; Returns: any }
      aprovar_orcamento: { Args: { arg0: string | null }; Returns: any }
      baixar_conta_pagar: { Args: { arg0: string | null, arg1: string | null, arg2: string | null, arg3: string | null }; Returns: any }
      baixar_faturas: { Args: { arg0: any, arg1: string | null, arg2: string | null, arg3: string | null, arg4: number | null, arg5: string | null }; Returns: string | null }
      calcular_multa_juros: { Args: { arg0: number | null, arg1: string | null, arg2: string | null }; Returns: any }
      check_lancamento_balanceado: { Args: {}; Returns: any }
      check_plano_contas_sem_ciclo: { Args: {}; Returns: any }
      conciliar_ofx_existente: { Args: { arg0: string | null, arg1: string | null }; Returns: any }
      criar_conta_pagar: { Args: { arg0: string | null, arg1: number | null, arg2: string | null, arg3: string | null, arg4: string | null, arg5: string | null, arg6: string | null, arg7: string | null }; Returns: string | null }
      criar_fatura_avulsa: { Args: { arg0: string | null, arg1: number | null, arg2: string | null, arg3: string | null, arg4: string | null, arg5: string | null }; Returns: string | null }
      criar_lancamento_de_ofx: { Args: { arg0: string | null, arg1: string | null, arg2: any, arg3: string | null, arg4: string | null, arg5: string | null }; Returns: string | null }
      criar_orcamento: { Args: { arg0: number | null, arg1: string | null }; Returns: string | null }
      criar_parcelamento: { Args: { arg0: any, arg1: number | null, arg2: number | null, arg3: string | null, arg4: string | null, arg5: boolean | null, arg6: string | null }; Returns: string | null }
      criar_transferencia: { Args: { arg0: string | null, arg1: string | null, arg2: number | null, arg3: string | null, arg4: string | null }; Returns: string | null }
      definir_valor_orcamento: { Args: { arg0: string | null, arg1: string | null, arg2: number | null, arg3: number | null }; Returns: any }
      desativar_outras_gestoes: { Args: {}; Returns: any }
      efetivar_recorrentes_vencidas: { Args: {}; Returns: number | null }
      fechar_exercicio: { Args: { arg0: number | null, arg1: string | null, arg2: string | null }; Returns: string | null }
      flag_parent_nao_analitica: { Args: {}; Returns: any }
      gerar_graus_padrao_org: { Args: { arg0: string | null }; Returns: number | null }
      gerar_mensalidades: { Args: { arg0: string | null, arg1: string | null, arg2: string | null, arg3: string | null }; Returns: number | null }
      handle_new_user: { Args: {}; Returns: any }
      has_role: { Args: { arg0: string | null, arg1: any }; Returns: boolean | null }
      is_admin_or: { Args: { arg0: string | null, arg1: any }; Returns: boolean | null }
      reabrir_exercicio: { Args: { arg0: number | null, arg1: string | null }; Returns: any }
      reabrir_orcamento: { Args: { arg0: string | null }; Returns: any }
      registrar_lancamento_contabil: { Args: { arg0: string | null, arg1: string | null, arg2: string | null, arg3: string | null, arg4: string | null, arg5: string | null }; Returns: string | null }
      registrar_recebimento_avulso: { Args: { arg0: number | null, arg1: any, arg2: string | null, arg3: string | null, arg4: string | null, arg5: string | null, arg6: string | null, arg7: string | null, arg8: string | null, arg9: string | null }; Returns: string | null }
      set_updated_at: { Args: {}; Returns: any }
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
      tipo_plano_conta: 'receita' | 'despesa' | 'ativo' | 'passivo' | 'patrimonio_liquido' | 'ativo' | 'passivo' | 'patrimonio_liquido'
      tipo_sessao: 'ordinaria' | 'magna' | 'branca' | 'administrativa'
      tipo_terceiro: 'fornecedor' | 'cliente' | 'ambos'
    }
  }
}

