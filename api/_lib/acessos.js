// Códigos de acesso (um para alunos, outro para administradores), trocáveis pelo painel.
// O código em uso fica no banco só como hash (HMAC com a PEPPER + scrypt); o texto nunca é guardado.
// Enquanto ninguém trocou, vale o que está nas variáveis da Vercel (ACCESS_CODE e ACCESS_CODE_ADMIN).
const crypto = require("crypto");
const s = require("./seguranca");
const reg = require("./registro");

const MIN = 8;
const MAX = 64;
const chave = (admin) => (admin ? "acesso:admin" : "acesso:aluno");

async function lerRegistro(admin) {
  const r = await reg.chamar([["GET", chave(admin)]]);
  const bruto = r && r[0].result;
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch { return null; }
}

// Confere o código digitado no login. Sem troca feita, usa a variável da Vercel (administrador sem código = ninguém entra).
async function conferir(informado, admin) {
  const guardado = reg.config() ? await lerRegistro(admin) : null;
  if (!guardado) return s.conferirAcesso(informado, admin);
  const calc = Buffer.from(s.hashAcesso(admin ? "admin" : "aluno", informado, guardado.s).split("$")[2], "base64");
  return crypto.timingSafeEqual(calc, Buffer.from(guardado.h, "base64"));
}

// Quem trocou por último e quando (nunca o código). origem: "painel" ou "vercel" (ainda o valor inicial).
async function situacao(admin) {
  const g = reg.config() ? await lerRegistro(admin) : null;
  if (g) return { origem: "painel", por: g.por, em: g.em };
  return { origem: "vercel", configurado: !!process.env[admin ? "ACCESS_CODE_ADMIN" : "ACCESS_CODE"] };
}

// Troca o código. Devolve {ok} ou {erro}. Regras: de 8 a 64 caracteres e diferente do código do outro perfil.
async function definir(admin, novo, por) {
  if (!reg.config()) return { erro: "sem_banco" };
  const codigo = String(novo || "").trim();
  if (codigo.length < MIN || codigo.length > MAX) return { erro: "codigo_curto" };
  if (await conferir(codigo, !admin)) return { erro: "codigo_igual_outro" }; // alunos e administradores precisam de chaves diferentes
  const [, sal, h] = s.hashAcesso(admin ? "admin" : "aluno", codigo).split("$");
  await reg.chamar([["SET", chave(admin), JSON.stringify({ s: sal, h, por, em: Date.now() })]]);
  return { ok: true };
}

module.exports = { conferir, situacao, definir, MIN, MAX };
