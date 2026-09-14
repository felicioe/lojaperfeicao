// Validação de CPF (formato + dígito verificador) — extraído de pix.ts
// (onde já existia, só para validar chave Pix) pra ser reaproveitado no
// cadastro de Irmãos (achado #606 da auditoria de Irmãos: o campo cpf
// aceitava qualquer string, sem checagem de formato nem de duplicidade).
export function validarCPF(valor: string): boolean {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(digitos[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto >= 10) resto = 0;
  if (resto !== Number(digitos[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(digitos[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto >= 10) resto = 0;
  return resto === Number(digitos[10]);
}

export function normalizarCPF(valor: string): string {
  return valor.replace(/\D/g, "");
}
