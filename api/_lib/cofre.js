// Cofre: tudo o que sai da planilha (nomes, turmas, marcações) é cifrado ANTES de ir para o banco.
// AES-256-GCM, com chave derivada (HKDF) da DATA_KEY, que existe só nas variáveis da Vercel. Mesmo que
// roubem o banco inteiro, o que há lá é texto cifrado: nenhum nome, turma ou dado da planilha é legível.
// Cada conteúdo é amarrado ao seu "contexto" (planilha, ou rascunho de uma pessoa): um blob não serve em outro lugar.
const crypto = require("crypto");
const zlib = require("zlib");
const s = require("./seguranca");
const reg = require("./registro");

const PREFIXO = "v1.";
const TTL_PLANILHA_S = 14 * 24 * 60 * 60; // a planilha publicada some sozinha em 14 dias
const TTL_RASCUNHO_S = 7 * 24 * 60 * 60; // o rascunho de cada pessoa, em 7 dias (renovado a cada salvamento)

function chaveMestra() {
  const hex = s.exigir("DATA_KEY");
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("DATA_KEY deve ter 64 caracteres hexadecimais");
  return Buffer.from(hex, "hex");
}

function chaveDe(contexto) {
  return Buffer.from(crypto.hkdfSync("sha256", chaveMestra(), Buffer.alloc(0), Buffer.from("cg:" + contexto), 32));
}

function cifrar(objeto, contexto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chaveDe(contexto), iv);
  c.setAAD(Buffer.from(contexto));
  const dados = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(objeto))), c.final()]);
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64");
}

// Devolve o objeto, ou null se não existir. Conteúdo adulterado, de outro contexto ou com outra chave lança erro.
function abrir(texto, contexto) {
  if (!texto) return null;
  if (!String(texto).startsWith(PREFIXO)) throw new Error("formato desconhecido");
  const b = Buffer.from(String(texto).slice(PREFIXO.length), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", chaveDe(contexto), b.subarray(0, 12));
  d.setAAD(Buffer.from(contexto));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)), d.final()])).toString("utf8"));
}

// A chave do banco não leva o nome da pessoa: é um código derivado dele (o banco não mostra quem tem rascunho).
function chaveRascunho(nome) {
  return "r:" + crypto.createHmac("sha256", chaveMestra()).update("rascunho:" + nome).digest("hex").slice(0, 32);
}

async function ler(chave, contexto) {
  const r = await reg.chamar([["GET", chave]]);
  return abrir(r && r[0].result, contexto);
}

async function gravar(chave, contexto, objeto, ttl) {
  await reg.chamar([["SET", chave, cifrar(objeto, contexto), "EX", ttl]]);
}

async function apagar(chave) {
  await reg.chamar([["DEL", chave]]);
}

module.exports = {
  cifrar, abrir, chaveRascunho, ler, gravar, apagar,
  TTL_PLANILHA_S, TTL_RASCUNHO_S,
  lerPlanilha: () => ler("planilha", "planilha"),
  gravarPlanilha: (obj) => gravar("planilha", "planilha", obj, TTL_PLANILHA_S),
  apagarPlanilha: () => apagar("planilha"),
  lerRascunho: (nome) => ler(chaveRascunho(nome), "rascunho:" + nome),
  gravarRascunho: (nome, obj) => gravar(chaveRascunho(nome), "rascunho:" + nome, obj, TTL_RASCUNHO_S),
  apagarRascunho: (nome) => apagar(chaveRascunho(nome)),
};
