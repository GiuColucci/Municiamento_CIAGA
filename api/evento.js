const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");

// Só estas ações são aceitas; o navegador não consegue gravar texto livre no registro.
const PERMITIDAS = new Set(["planilha_carregada", "baixar_pdf", "baixar_docx"]);

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (req.method !== "POST" || !sess || !s.mesmaOrigem(req)) {
    res.statusCode = 403;
    return res.end();
  }
  let acao = req.body && req.body.acao;
  if (typeof req.body === "string") {
    try { acao = JSON.parse(req.body).acao; } catch { acao = null; }
  }
  if (PERMITIDAS.has(acao)) await reg.registrar(req, sess.u, acao);
  res.statusCode = 204;
  res.end();
};
