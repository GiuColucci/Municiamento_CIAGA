const crypto = require("crypto");

const DURACAO_SESSAO_S = 12 * 60 * 60;
const DURACAO_ADMIN_S = 2 * 60 * 60; // quem entra como administrador tem sessão mais curta
const duracaoSessao = (modoAdmin) => (modoAdmin ? DURACAO_ADMIN_S : DURACAO_SESSAO_S);

function exigir(nome) {
  const v = process.env[nome];
  if (!v) throw new Error("Variável de ambiente ausente: " + nome);
  return v;
}

function usuarios() {
  // USERS (opcional) = {"maria":"scrypt$<salt-b64>$<hash-b64>", ...}
  return JSON.parse(exigir("USERS"));
}

function hashSenha(senha, saltB64) {
  const salt = saltB64 ? Buffer.from(saltB64, "base64") : crypto.randomBytes(16);
  const h = crypto.scryptSync(senha.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return "scrypt$" + salt.toString("base64") + "$" + h.toString("base64");
}

// Código de aluno: HMAC com a PEPPER (segredo só da Vercel) + scrypt. Quem roubar só o banco
// não consegue testar códigos offline, porque falta a PEPPER.
function hashCodigo(codigo, saltB64) {
  const mac = crypto.createHmac("sha256", exigir("PEPPER")).update(String(codigo || "").trim().toUpperCase()).digest("hex");
  return hashSenha(mac, saltB64);
}

// Versão assíncrona (usa o pool de threads): para conferir um código contra várias pessoas sem travar o servidor.
function hashCodigoAsync(codigo, saltB64) {
  const mac = crypto.createHmac("sha256", exigir("PEPPER")).update(String(codigo || "").trim().toUpperCase()).digest("hex");
  return new Promise((ok, falha) =>
    crypto.scrypt(mac.normalize("NFKC"), Buffer.from(saltB64, "base64"), 64, { N: 16384, r: 8, p: 1 }, (e, h) => (e ? falha(e) : ok(h.toString("base64"))))
  );
}

// Código de acesso (perfil "aluno" ou "admin"): o perfil entra no cálculo, então um hash não serve para o outro.
function hashAcesso(perfil, codigo, saltB64) {
  const mac = crypto.createHmac("sha256", exigir("PEPPER")).update("acesso:" + perfil + ":" + String(codigo || "").trim().normalize("NFKC")).digest("hex");
  return hashSenha(mac, saltB64);
}

const DUMMY = hashSenha("sem-usuario", Buffer.alloc(16).toString("base64"));

function conferirSenha(usuario, senha) {
  const mapa = usuarios();
  const chave = String(usuario || "").trim().toLowerCase();
  const guardado = Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : null;
  const alvo = guardado || DUMMY; // mesmo custo com usuário inexistente
  const [, salt, hash] = alvo.split("$");
  const calc = Buffer.from(hashSenha(String(senha || ""), salt).split("$")[2], "base64");
  const ok = crypto.timingSafeEqual(calc, Buffer.from(hash, "base64"));
  return ok && guardado ? chave : null;
}

function normalizarNome(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Códigos de acesso, uma chave para cada perfil:
//   ACCESS_CODE        -> quem entra como aluno;
//   ACCESS_CODE_ADMIN  -> quem entra como administrador.
// Os dois são obrigatórios: perfil sem código definido (na Vercel ou pelo painel) é perfil em que ninguém entra.
function conferirAcesso(informado, admin) {
  const esperado = process.env[admin ? "ACCESS_CODE_ADMIN" : "ACCESS_CODE"];
  if (!esperado) return false;
  const h = (x) => crypto.createHash("sha256").update(String(x || "").trim().normalize("NFKC")).digest();
  return crypto.timingSafeEqual(h(informado), h(esperado));
}

function assinar(texto) {
  return crypto.createHmac("sha256", exigir("SESSION_SECRET")).update(texto).digest("base64url");
}

// papel: 2/"ranchef", 1/true/"admin", senão "aluno" (o papel vale só de reserva; o servidor confere ao vivo)
function nomePapel(p) {
  return p === 2 || p === "ranchef" ? "ranchef" : p === 1 || p === true || p === "admin" ? "admin" : "aluno";
}

// modoAdmin: a pessoa escolheu "Entrar como administrador" no login (e tem a função). Só nesse modo o painel abre
// e o botão aparece; o papel de verdade continua sendo conferido ao vivo no banco.
function criarCookie(usuario, papel, modoAdmin) {
  const modo = modoAdmin === true;
  const corpo = Buffer.from(
    JSON.stringify({ u: usuario, r: modo ? nomePapel(papel) : "aluno", m: modo ? 1 : 0, exp: Math.floor(Date.now() / 1000) + duracaoSessao(modo) })
  ).toString("base64url");
  return corpo + "." + assinar(corpo);
}

function lerSessao(req) {
  const m = /(?:^|;\s*)sessao=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return null;
  const [corpo, assin] = m[1].split(".");
  if (!corpo || !assin) return null;
  let b;
  try {
    b = Buffer.from(assinar(corpo));
  } catch (e) {
    console.error("sessão ignorada:", e.message); // SESSION_SECRET ausente: trata como "sem sessão"
    return null;
  }
  const a = Buffer.from(assin);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString());
    return d.exp > Date.now() / 1000 ? d : null;
  } catch {
    return null;
  }
}

// Proteção contra envio de formulário de outro site (CSRF). O cookie já é SameSite=Strict; isto é reforço.
// Com Origin "null" (alguns navegadores com política de referência restrita), vale o Sec-Fetch-Site.
function mesmaOrigem(req) {
  const sf = req.headers["sec-fetch-site"];
  if (sf) return sf === "same-origin" || sf === "none";
  const o = req.headers.origin;
  if (!o) return true;
  try {
    return new URL(o).host === req.headers.host;
  } catch {
    return false;
  }
}

function cookieHeader(valor, maxAge, nome = "sessao") {
  return `${nome}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// Limitador genérico por chave (em memória, por instância): true = passou do limite; senão registra o uso.
const usos = new Map();
function limitar(chave, max, janelaMs) {
  const agora = Date.now();
  const lista = (usos.get(chave) || []).filter((x) => agora - x < janelaMs);
  if (lista.length >= max) { usos.set(chave, lista); return true; }
  lista.push(agora);
  usos.set(chave, lista);
  return false;
}

// Limite de tentativas erradas por IP: até 8 erros por dia (o contador zera à meia-noite de Brasília). No 8º erro o IP
// fica bloqueado por 15 minutos e o contador volta a zero. É por instância do servidor; complementa o atraso fixo e o custo do scrypt.
const MAX_ERROS_DIA = 8;
const BLOQUEIO_MS = 15 * 60 * 1000;
const tentativas = new Map(); // ip -> { dia, n, ate }
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
function bloqueado(ip) {
  const t = tentativas.get(ip);
  return !!t && t.ate > Date.now();
}
function falhou(ip) {
  const t = tentativas.get(ip);
  const dia = hoje();
  const n = (t && t.dia === dia ? t.n : 0) + 1;
  tentativas.set(ip, n >= MAX_ERROS_DIA ? { dia, n: 0, ate: Date.now() + BLOQUEIO_MS } : { dia, n, ate: (t && t.ate) || 0 });
  if (tentativas.size > 5000) for (const [k, v] of tentativas) if (v.dia !== dia && v.ate < Date.now()) tentativas.delete(k); // limpa os antigos
}

module.exports = {
  hashSenha, hashCodigo, hashAcesso, hashCodigoAsync, limitar, conferirSenha, conferirAcesso, normalizarNome,
  criarCookie, lerSessao, mesmaOrigem, cookieHeader, bloqueado, falhou, exigir, DURACAO_SESSAO_S, duracaoSessao,
};
