// Uso: node scripts/hash-senha.mjs
import readline from "node:readline";
import { createRequire } from "node:module";

const { hashSenha } = createRequire(import.meta.url)("../api/_lib/seguranca.js");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Usuário: ", (u) =>
  rl.question("Senha (mín. 12 caracteres): ", (p) => {
    rl.close();
    if (p.length < 12) {
      console.error("Senha curta demais.");
      process.exit(1);
    }
    console.log(`\nAdicione ao JSON da variável USERS:\n"${u.trim().toLowerCase()}": "${hashSenha(p)}"`);
  })
);
