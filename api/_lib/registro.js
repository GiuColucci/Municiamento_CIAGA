// Registro de acessos num Redis (Upstash) via REST. Sem as variáveis, só escreve no log da Vercel.
// Nunca grava código de aluno, senha, nem dados da planilha: só quem, ação, IP, aparelho e horário.
const LIMITE = 5000;
const DIAS_GUARDA = 30;

function config() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

const limpar = (t, n) => String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

// IP completo: usado só na memória (limite de tentativas), nunca gravado.
function ipReal(req) {
  return limpar(String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0], 64) || "?";
}

// IP mascarado, o único que vai para o registro: 187.12.34.56 -> 187.12.x.x ; IPv6 -> 3 primeiros grupos
function mascararIp(ip) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::x";
  return "?";
}

function ipDe(req) {
  return mascararIp(ipReal(req));
}

async function chamar(comandos) {
  const c = config();
  if (!c) return null;
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
  });
  if (!r.ok) throw new Error("registro HTTP " + r.status);
  return r.json();
}

// Manutenção do registro (limite de eventos + apagar os com mais de DIAS_GUARDA dias). A lista é do mais
// novo ao mais velho; olha a ponta velha. Roda só no login, para gastar poucos comandos do plano gratuito.
async function manter() {
  const limite = Date.now() - DIAS_GUARDA * 24 * 60 * 60 * 1000;
  const res = await chamar([["LTRIM", "log", 0, LIMITE - 1], ["LRANGE", "log", -200, -1]]);
  if (!res) return;
  const cauda = (res[1].result || []).map((x) => { try { return JSON.parse(x).t; } catch { return 0; } });
  let velhos = 0;
  for (let i = cauda.length - 1; i >= 0 && cauda[i] < limite; i--) velhos++;
  if (velhos) await chamar([["LTRIM", "log", 0, -(velhos + 1)]]);
}

async function registrar(req, quem, acao, extra) {
  const ev = { t: Date.now(), u: limpar(quem, 60), a: acao, ip: ipDe(req), ua: limpar(req.headers["user-agent"], 160), ...(extra || {}) };
  try {
    await chamar([["LPUSH", "log", JSON.stringify(ev)]]);
    if (acao === "login_ok") await manter();
  } catch (e) {
    console.error("falha ao registrar:", e.message);
  }
  if (!config()) console.log("evento", JSON.stringify(ev));
}

async function ler(n) {
  const res = await chamar([["LRANGE", "log", 0, n - 1]]);
  if (!res) return null;
  return (res[0].result || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

module.exports = { registrar, ler, chamar, limpar, ipDe, ipReal, mascararIp, config, DIAS_GUARDA };
