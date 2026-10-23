// Planilha da semana: só administradores publicam; todos os usuários logados leem. Guardada cifrada (cofre).
const crypto = require("crypto");
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const cofre = require("./_lib/cofre");

const MAX_BYTES = 1500000; // da planilha já empacotada
const MAX_ALUNOS = 3000;

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

const texto = (v, max) => typeof v === "string" && v.length <= max;

// Formato empacotado pelo app (hospedado.js): sem confiar em nada que venha do navegador.
function planilhaValida(d) {
  if (!d || d.v !== 1 || !Array.isArray(d.alunos) || !Array.isArray(d.turmas) || !Array.isArray(d.avisos)) return false;
  if (!d.alunos.length || d.alunos.length > MAX_ALUNOS || d.turmas.length > 200 || d.avisos.length > 2000) return false;
  if (d.sexta != null && !/^\d{4}-\d{2}-\d{2}$/.test(d.sexta)) return false;
  if (!["XLSX", "CSV", "PDF"].includes(d.formato)) return false;
  const aluno = (a) => Array.isArray(a) && a.length === 4 && texto(a[0], 120) && texto(a[1], 12) && texto(a[2], 12) && Number.isInteger(a[3]) && a[3] >= 0 && a[3] < 2 ** 28;
  return d.alunos.every(aluno) && d.turmas.every((t) => Array.isArray(t) && texto(t[0], 12) && Number.isInteger(t[1]) && texto(t[2] || "", 200)) && d.avisos.every((a) => Array.isArray(a) && texto(a[0], 600));
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess || (await pessoas.removido(sess.u))) return json(res, 401, { erro: "Entre de novo." });
  if (!reg.config()) return json(res, 503, { erro: "Banco não configurado." });
  try {
    if (req.method === "GET") {
      const p = await cofre.lerPlanilha();
      return p ? json(res, 200, p) : json(res, 404, { vazio: true });
    }
    if (req.method !== "POST" && req.method !== "DELETE") return json(res, 405, { erro: "Método não permitido." });
    if (!s.mesmaOrigem(req)) return json(res, 403, { erro: "Origem não permitida." });
    // Só administrador em sessão de administrador (conferido ao vivo no banco).
    if ((await pessoas.papelAtual(sess.u, sess)) < 1) {
      await reg.registrar(req, sess.u, "admin_negado");
      return json(res, 403, { erro: "Só administradores publicam a planilha." });
    }
    if (req.method === "DELETE") {
      await cofre.apagarPlanilha();
      await reg.registrar(req, sess.u, "admin_removeu_planilha");
      return json(res, 200, { ok: true });
    }
    const dados = req.body && req.body.dados;
    const bruto = JSON.stringify(dados || null);
    if (bruto.length > MAX_BYTES) return json(res, 413, { erro: "Planilha grande demais." });
    if (!planilhaValida(dados)) return json(res, 400, { erro: "Planilha inválida. Leia o arquivo do municiamento de novo." });
    const meta = {
      id: crypto.createHash("sha256").update(bruto).digest("hex").slice(0, 16),
      por: await pessoas.nomeExibido(sess.u),
      em: Date.now(),
    };
    await cofre.gravarPlanilha({ ...meta, dados });
    await reg.registrar(req, sess.u, "admin_publicou_planilha"); // só o evento: nada da planilha vai para o registro
    return json(res, 200, { ok: true, ...meta });
  } catch (e) {
    console.error("falha na planilha:", e.message);
    return json(res, 500, { erro: "Não consegui concluir. Tente de novo." });
  }
};
