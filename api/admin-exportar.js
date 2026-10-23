const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");

// Backup da lista de acessos (nomes e hashes dependentes da PEPPER). Só o administrador ranchef
// (em sessão de administrador).
module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  const permitido = req.method === "GET" && sess && (await pessoas.papelAtual(sess.u, sess)) === 2;
  if (!permitido) {
    if (sess) await reg.registrar(req, sess.u, "admin_negado");
    res.statusCode = 403;
    return res.end("Acesso negado.");
  }
  try {
    const dados = await pessoas.exportar();
    await reg.registrar(req, sess.u, "admin_exportou");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lista-acessos-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(dados, null, 1));
  } catch (e) {
    console.error("falha ao exportar:", e.message);
    res.statusCode = 500;
    res.end("Erro interno.");
  }
};
