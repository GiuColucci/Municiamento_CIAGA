const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (sess) await reg.registrar(req, sess.u, "sair");
  res.setHeader("Set-Cookie", s.cookieHeader("", 0));
  res.statusCode = 302;
  res.setHeader("Location", "/");
  res.end();
};
