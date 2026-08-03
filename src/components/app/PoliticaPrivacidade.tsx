// Conteúdo da Política de Privacidade — usado tanto na página pública
// (/privacidade) quanto na tela de aceite (/aceite-termos). É um modelo
// genérico alinhado à LGPD (Lei 13.709/2018); antes de publicar oficialmente,
// revise com um advogado e preencha os dados reais da loja/associação nos
// campos marcados com [ ].
export function PoliticaPrivacidadeConteudo() {
  return (
    <div className="space-y-5 text-sm leading-relaxed text-foreground">
      <section>
        <h2 className="mb-1.5 font-semibold">1. Quem trata os seus dados</h2>
        <p>
          Esta plataforma é operada por <strong>[Nome da Loja/Associação]</strong>, CNPJ{" "}
          <strong>[00.000.000/0000-00]</strong>, controladora dos dados pessoais tratados aqui, nos
          termos da Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">2. Quais dados coletamos</h2>
        <p>
          Dados cadastrais (nome civil e simbólico, CIM, data de nascimento, CPF, RG, endereço,
          telefone, e-mail, profissão), dados maçônicos (grau, situação, datas de
          iniciação/elevação/exaltação, cargos), dados financeiros (mensalidades, pagamentos,
          lançamentos) e dados de frequência (presença em sessões).
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">3. Para que usamos esses dados</h2>
        <p>
          Para administrar o vínculo associativo (cadastro, cargos, frequência), controlar as
          finanças da loja (mensalidades, contas, prestação de contas) e cumprir obrigações legais e
          estatutárias de guarda de registros contábeis e associativos.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">4. Base legal</h2>
        <p>
          Execução do vínculo associativo firmado com o irmão (art. 7º, V, LGPD) e cumprimento de
          obrigação legal para os registros financeiros e contábeis (art. 7º, II, LGPD).
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">5. Com quem compartilhamos</h2>
        <p>
          Não compartilhamos seus dados com terceiros, exceto quando exigido por lei, ordem judicial
          ou órgão regulador maçônico competente.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">6. Por quanto tempo guardamos</h2>
        <p>
          Enquanto durar o vínculo associativo e, após o desligamento, pelo prazo exigido pela
          legislação contábil e associativa para guarda de registros financeiros.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">7. Seus direitos</h2>
        <p>
          Você pode solicitar a qualquer momento acesso, correção, exclusão ou portabilidade dos
          seus dados, e revogar este consentimento, através do canal "Meus dados e privacidade" no
          Meu Painel. Pedidos de exclusão de dados com obrigação legal de guarda (ex.: registros
          financeiros) podem ser atendidos por anonimização em vez de exclusão total, quando a
          exclusão total não for legalmente possível.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">8. Segurança</h2>
        <p>
          Seus dados são protegidos por senha individual, sessão criptografada e controle de acesso
          por papel — cada pessoa só vê os próprios dados, exceto administração e tesouraria, que
          têm acesso necessário para a gestão da loja.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-semibold">9. Contato</h2>
        <p>
          Dúvidas ou solicitações sobre seus dados:{" "}
          <strong>[e-mail do encarregado/DPO ou da secretaria]</strong>.
        </p>
      </section>
    </div>
  );
}
