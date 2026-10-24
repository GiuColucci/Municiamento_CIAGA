// Rascunho automático (auto-save) das marcações de cada pessoa. Individual, cifrado (cofre) e temporário (7 dias).
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const cofre = require("./_lib/cofre");

const MAX_BYTES = 400000;

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function rascunhoValido(d) {
  return !!d && d.v === 1 && typeof d.planilha === "string" && d.planilha.length <= 64 && Array.isArray(d.listas) && d.listas.length <= 60;
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess || (await pessoas.removido(sess.u))) return json(res, 401, { erro: "Entre de novo." });
  if (!reg.config()) return json(res, 503, { erro: "Banco não configurado." });
  try {
    if (req.method === "GET") {
      const r = await cofre.lerRascunho(sess.u);
      return r ? json(res, 200, { dados: r }) : json(res, 404, { vazio: true });
    }
    if (req.method !== "PUT" && req.method !== "DELETE") return json(res, 405, { erro: "Método não permitido." });
    if (!s.mesmaOrigem(req)) return json(res, 403, { erro: "Origem não permitida." });
    if (req.method === "DELETE") {
      await cofre.apagarRascunho(sess.u);
      return json(res, 200, { ok: true });
    }
    const dados = req.body;
    if (JSON.stringify(dados || null).length > MAX_BYTES) return json(res, 413, { erro: "Rascunho grande demais." });
    if (!rascunhoValido(dados)) return json(res, 400, { erro: "Rascunho inválido." });
    await cofre.gravarRascunho(sess.u, { ...dados, salvoEm: Date.now() }); // salvoEm: a Conferência Geral mostra quando foi salvo; // não vai para o registro de eventos: salvar é só do dono
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("falha no rascunho:", e.message);
    // rascunho de outra chave ou adulterado não pode travar a pessoa: ela recomeça do zero
    if (req.method === "GET") return json(res, 404, { vazio: true });
    return json(res, 500, { erro: "Não consegui salvar." });
  }
};
