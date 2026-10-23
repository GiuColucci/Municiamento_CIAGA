const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const acessos = require("./_lib/acessos");

function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return Object.fromEntries(new URLSearchParams(String(req.body || "")));
}

async function tratar(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end();
  }
  const ip = reg.ipReal(req); // só em memória, para o limite de tentativas
  if (!s.mesmaOrigem(req)) {
    res.statusCode = 403;
    return res.end();
  }
  if (s.bloqueado(ip)) {
    res.statusCode = 302;
    res.setHeader("Location", "/?erro=limite");
    return res.end();
  }
  const { usuario, senha, acesso, modo } = corpo(req);
  const querAdmin = String(modo || "") === "admin"; // escolha "Entrar como administrador" no login
  let quem = null;
  let acessoOk;
  try {
    acessoOk = await acessos.conferir(acesso, querAdmin); // cada perfil tem o seu código de acesso (banco ou Vercel)
  } catch (e) {
    console.error("falha ao conferir o código de acesso:", e.message);
    acessoOk = s.conferirAcesso(acesso, querAdmin);
  }
  try {
    quem = await pessoas.conferir(usuario, senha);
    // ranchef de origem (Gordilho): se o banco está sem ranchef, ele assume no login, sem ninguém rodar nada
    if (quem && quem.papel < 2) {
      const g = await pessoas.garantirRanchef(quem.nome);
      if (g.ok) { quem.papel = 2; quem.admin = true; }
    }
    if (!quem && process.env.USERS) {
      const nome = s.conferirSenha(usuario, senha); // contas extras da equipe (opcional)
      if (nome) quem = { nome, papel: 0, admin: false };
    }
  } catch (e) {
    console.error("falha no login:", e.message);
  }
  if (!quem || !acessoOk) {
    s.falhou(ip);
    // só o nome digitado; o código/senha digitados nunca são registrados
    await reg.registrar(req, reg.limpar(usuario, 40), "login_falha");
    await new Promise((r) => setTimeout(r, 800));
    res.statusCode = 302;
    res.setHeader("Location", "/?erro=1");
    return res.end();
  }
  if (querAdmin && quem.papel < 1) {
    // credenciais certas, mas a pessoa não tem a função de administrador
    await reg.registrar(req, quem.nome, "admin_negado");
    res.statusCode = 302;
    res.setHeader("Location", "/?erro=nao_admin");
    return res.end();
  }
  await reg.registrar(req, quem.nome, querAdmin ? "login_admin" : "login_ok");
  res.setHeader("Set-Cookie", s.cookieHeader(s.criarCookie(quem.nome, quem.papel, querAdmin), s.duracaoSessao(querAdmin)));
  res.statusCode = 302;
  res.setHeader("Location", "/app");
  res.end();
}

module.exports = async (req, res) => {
  try {
    await tratar(req, res);
  } catch (e) {
    console.error("erro no login:", e.message);
    res.statusCode = 302;
    res.setHeader("Location", "/?erro=falha");
    res.end();
  }
};
