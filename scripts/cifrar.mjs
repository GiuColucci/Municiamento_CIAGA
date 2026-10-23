// Uso: APP_KEY=<64 hex> node scripts/cifrar.mjs caminho/conferencia_digital.html
import fs from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";

const [, , entrada] = process.argv;
const hex = process.env.APP_KEY;
if (!entrada || !/^[0-9a-f]{64}$/i.test(hex || "")) {
  console.error("Uso: APP_KEY=<64 caracteres hex> node scripts/cifrar.mjs <conferencia_digital.html>");
  console.error("Gerar chave: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  process.exit(1);
}
const comprimido = zlib.brotliCompressSync(fs.readFileSync(entrada), {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
});
const iv = crypto.randomBytes(12);
const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(hex, "hex"), iv);
const cifrado = Buffer.concat([c.update(comprimido), c.final()]);
fs.mkdirSync("dados", { recursive: true });
fs.writeFileSync("dados/app.enc", Buffer.concat([iv, c.getAuthTag(), cifrado]));
console.log(`dados/app.enc gerado (${(cifrado.length / 1024 / 1024).toFixed(2)} MB cifrado)`);
