const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const cofre = require("./_lib/cofre");
const acessos = require("./_lib/acessos");

const EVENTO = { cadastrar: "admin_cadastrou", promover: "admin_promoveu", rebaixar: "admin_rebaixou", remover: "admin_removeu", limpar_planilha: "admin_removeu_planilha",
  codigo_aluno: "admin_mudou_codigo_aluno", codigo_admin: "admin_mudou_codigo_admin",
  transferir_ranchef: "admin_transferiu_ranchef", assumir_ranchef: "admin_assumiu_ranchef" };
// Só o ranchef mexe nos administradores; isso inclui a senha de administrador (um administrador não tranca os outros).
const SO_RANCHEF = new Set(["promover", "rebaixar", "codigo_admin", "transferir_ranchef"]);

// Assumir o cargo de ranchef (só se não houver nenhum): confirma com o número interno de quem assume.
async function assumir(c, sess) {
  if (s.limitar("assumir:" + sess.u, 5, 15 * 60 * 1000)) return { erro: "limite" };
  if (!(await pessoas.conferir(sess.u, c.confirmar))) return { erro: "confirmacao" };
  return pessoas.assumirRanchef(sess.u);
}

// Transferir o cargo de ranchef: pede o número interno de quem transfere (confirma que é a pessoa) e limita as tentativas.
async function transferir(c, sess) {
  if (s.limitar("transferir:" + sess.u, 5, 15 * 60 * 1000)) return { erro: "limite" };
  if (!(await pessoas.conferir(sess.u, c.confirmar))) return { erro: "confirmacao" };
  return pessoas.transferirRanchef(c.nome, sess.u);
}

// Troca de senha: pede o código novo duas vezes e o número interno de quem está trocando (confirma que é a pessoa).
async function trocarCodigo(admin, c, sess) {
  if (s.limitar("codigo:" + sess.u, 5, 15 * 60 * 1000)) return { erro: "limite" };
  if (String(c.novo || "") !== String(c.repetir || "")) return { erro: "codigo_diferente" };
  if (!(await pessoas.conferir(sess.u, c.confirmar))) return { erro: "confirmacao" };
  const r = await acessos.definir(admin, c.novo, await pessoas.nomeExibido(sess.u));
  return r.ok ? { ok: true, nome: "" } : r;
}

function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return Object.fromEntries(new URLSearchParams(String(req.body || "")));
}

function voltar(res, qs, cookie) {
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.statusCode = 303;
  res.setHeader("Location", "/admin?" + qs);
  res.end();
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (req.method !== "POST" || !sess || !s.mesmaOrigem(req)) {
    res.statusCode = 403;
    return res.end();
  }
  // Papel conferido ao vivo: aluno comum nunca executa nada, e rebaixado perde o poder na hora.
  const papel = await pessoas.papelAtual(sess.u, sess);
  if (papel < 1) {
    await reg.registrar(req, sess.u, "admin_negado");
    res.statusCode = 403;
    return res.end("Acesso negado.");
  }
  const c = corpo(req);
  const { acao, nome, codigo } = c;
  if (!EVENTO[acao]) {
    res.statusCode = 400;
    return res.end();
  }
  // Só o administrador ranchef tem poder sobre os outros administradores.
  if (SO_RANCHEF.has(acao) && papel !== 2) {
    await reg.registrar(req, sess.u, "admin_negado", { alvo: reg.limpar(nome, 40) });
    return voltar(res, "e=sem_permissao");
  }
  let r;
  try {
    r =
      acao === "cadastrar" ? await pessoas.cadastrar(nome, codigo)
      : acao === "promover" ? await pessoas.promover(nome)
      : acao === "rebaixar" ? await pessoas.rebaixar(nome, sess.u)
      : acao === "limpar_planilha" ? (await cofre.apagarPlanilha(), { ok: true, nome: "" })
      : acao === "transferir_ranchef" ? await transferir(c, sess)
      : acao === "assumir_ranchef" ? await assumir(c, sess)
      : acao === "codigo_aluno" ? await trocarCodigo(false, c, sess)
      : acao === "codigo_admin" ? await trocarCodigo(true, c, sess)
      : await pessoas.remover(nome, sess.u);
  } catch (e) {
    console.error("falha na ação de admin:", e.message);
    return voltar(res, "e=falha");
  }
  if (r.erro) return voltar(res, "e=" + r.erro);
  await reg.registrar(req, sess.u, EVENTO[acao], { alvo: r.nome });
  voltar(res, "m=" + acao);
};
