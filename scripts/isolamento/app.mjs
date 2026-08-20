// Sobe o app apontando pro banco descartável da suíte (issue #351).
//
// Roda o dev server (e não o build) de propósito: as provas de IDOR chamam as
// server functions importando `/src/lib/backend/*.ts` de dentro do navegador,
// o que só o Vite em dev serve. É a mesma ponte que a aplicação usa — as
// chamadas passam pelo mesmo cliente RPC, com o mesmo cookie de sessão — mas
// permite invocar qualquer função direto, inclusive as que a interface nunca
// oferece com um id de outra loja.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";

export const PORTA = Number(process.env.ISOLAMENTO_PORTA ?? 8099);
export const BASE = `http://localhost:${PORTA}`;

/**
 * Um servidor esquecido de uma execução anterior responderia ao health check
 * e a suíte rodaria contra o banco ERRADO, achando que subiu o seu. Derruba
 * quem estiver na porta antes de começar.
 */
function liberarPorta() {
  try {
    const saida = execFileSync(
      "bash",
      ["-lc", `fuser -k ${PORTA}/tcp 2>/dev/null; sleep 1; true`],
      {
        encoding: "utf8",
      },
    );
    return saida;
  } catch {
    return "";
  }
}

export async function subirApp(banco, arquivoLog) {
  liberarPorta();
  const log = fs.openSync(arquivoLog, "w");
  const proc = spawn("npx", ["vite", "dev", "--port", String(PORTA), "--strictPort"], {
    env: {
      ...process.env,
      // Só o nome do banco muda: usuário, senha e host continuam vindo do
      // .env do projeto, que é quem manda no carregamento. O banco é lido de
      // process.env porque MYSQL_DATABASE não está no .env de teste — ver o
      // comentário em banco.mjs sobre a concessão de acesso.
      MYSQL_DATABASE: banco,
      NODE_ENV: "development",
      PORT: String(PORTA),
    },
    stdio: ["ignore", log, log],
    detached: true,
  });

  const limite = Date.now() + 180_000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`${BASE}/auth`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return proc;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`app não respondeu em ${BASE} — ver ${arquivoLog}`);
}

export function derrubarApp(proc) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* já morreu */
    }
  }
}
