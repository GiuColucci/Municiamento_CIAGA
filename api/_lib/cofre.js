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
const MAX_PUBLICACOES_RANCHO = 40; // por dia

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

// Lê os rascunhos de várias pessoas de uma vez (uma só chamada MGET). Quem não tem, ou tem um adulterado, vem como null.
// Só a Conferência Geral usa isto, e devolve apenas o resultado agregado (nunca o rascunho bruto) a uma pessoa autenticada.
async function lerRascunhos(nomes) {
  if (!nomes.length) return [];
  const r = await reg.chamar([["MGET", ...nomes.map(chaveRascunho)]]);
  const valores = (r && r[0].result) || [];
  return nomes.map((n, i) => { try { return abrir(valores[i], "rascunho:" + n); } catch { return null; } });
}

// Rancho corrido: uma lista no Redis por dia ("rancho:AAAA-MM-DD"); cada publicação é um item cifrado, no contexto do dia.
// Publicar só ACRESCENTA (RPUSH): duas pessoas publicando ao mesmo tempo não se atropelam.
// A lista APAGA A SI MESMA quando o dia passa: expira à meia-noite de Brasília (00h do dia seguinte = 03h UTC; o Brasil não tem horário de verão).
const fimDoDia = (data) => { const [a, m, d] = data.split("-").map(Number); return Math.floor(Date.UTC(a, m - 1, d + 1, 3, 0, 0) / 1000); };
const chaveRancho = (data) => "rancho:" + data;
async function gravarRancho(data, obj) {
  const chave = chaveRancho(data);
  await reg.chamar([["RPUSH", chave, cifrar(obj, chave)], ["LTRIM", chave, -MAX_PUBLICACOES_RANCHO, -1], ["EXPIREAT", chave, fimDoDia(data)]]);
}
async function lerRancho(data) {
  const chave = chaveRancho(data);
  const r = await reg.chamar([["LRANGE", chave, 0, -1]]);
  return ((r && r[0].result) || []).map((v) => { try { return abrir(v, chave); } catch { return null; } }).filter(Boolean);
}
const apagarRancho = (data) => apagar(chaveRancho(data));

module.exports = {
  cifrar, abrir, chaveRascunho, ler, gravar, apagar, lerRascunhos, gravarRancho, lerRancho, apagarRancho, fimDoDia,
  TTL_PLANILHA_S, TTL_RASCUNHO_S,
  lerPlanilha: () => ler("planilha", "planilha"),
  gravarPlanilha: (obj) => gravar("planilha", "planilha", obj, TTL_PLANILHA_S),
  apagarPlanilha: () => apagar("planilha"),
  lerRascunho: (nome) => ler(chaveRascunho(nome), "rascunho:" + nome),
  gravarRascunho: (nome, obj) => gravar(chaveRascunho(nome), "rascunho:" + nome, obj, TTL_RASCUNHO_S),
  apagarRascunho: (nome) => apagar(chaveRascunho(nome)),
};
