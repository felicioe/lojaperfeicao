const [major = "0", minor = "0"] = process.versions.node.split(".");

const versaoAtual = {
  major: Number(major),
  minor: Number(minor),
};

const minimo = {
  major: 22,
  minor: 0,
};

const atendeMinimo =
  versaoAtual.major > minimo.major ||
  (versaoAtual.major === minimo.major && versaoAtual.minor >= minimo.minor);

if (!atendeMinimo) {
  console.error(
    [
      `Node ${process.versions.node} não é suportado por este projeto.`,
      "Use Node 22 ou superior antes de executar o build/deploy.",
      "Isso evita publicação inconsistente no Hostinger e falhas intermitentes em SSR/exportação.",
    ].join(" "),
  );
  process.exit(1);
}

console.log(`Node ${process.versions.node} OK para build.`);
