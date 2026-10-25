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

// ---------------------------------------------------------------- rancho corrido (mesma rota: o plano gratuito limita as funções)
// GET  ?rancho=AAAA-MM-DD,AAAA-MM-DD   quem está de rancho corrido nesses dias (qualquer pessoa logada)
// POST ?rancho=AAAA-MM-DD              publica o que foi lido dos arquivos (qualquer pessoa logada; só acrescenta)
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const REFEICOES = ["Café", "Almoço", "Janta", "Ceia"];
const hojeBrasilia = () => new Date(Date.now()).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasEntre = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const MAX_ITENS_RANCHO = 300;
const MAX_BYTES_RANCHO = 120000;

function itemRanchoValido(i) {
  return !!i && typeof i === "object" && typeof i.c === "string" && /^[BMN]?\d{4}$/.test(i.c) && texto(i.n, 80) && i.n.trim().length > 0 &&
    texto(i.m || "", 160) && (i.p == null || texto(i.p, 40)) &&
    (i.r == null || (Array.isArray(i.r) && i.r.length <= 4 && i.r.every((x) => REFEICOES.includes(x))));
}

async function rancho(req, res, sess, q) {
  if (req.method === "GET") {
    const datas = [...new Set(String(q.get("rancho") || "").split(",").filter((d) => DATA.test(d)))].slice(0, 8);
    const dias = {};
    const hoje = hojeBrasilia();
    for (const d of datas) dias[d] = d < hoje ? [] : await cofre.lerRancho(d); // dia que passou não tem mais nada (e já foi apagado do banco)
    return json(res, 200, { dias });
  }
  if (req.method !== "POST") return json(res, 405, { erro: "Método não permitido." });
  if (!s.mesmaOrigem(req)) return json(res, 403, { erro: "Origem não permitida." });
  const data = q.get("rancho");
  if (!DATA.test(data || "") || isNaN(Date.parse(data))) return json(res, 400, { erro: "Data inválida." });
  const dif = diasEntre(data, hojeBrasilia());
  if (dif < 0) return json(res, 400, { erro: "Esse dia já passou: o rancho corrido só vale no próprio dia." });
  if (dif > 8) return json(res, 400, { erro: "Essa data está fora da semana: confira o dia." });
  if (s.limitar("rancho:" + sess.u, 20, 60 * 60 * 1000)) return json(res, 429, { erro: "Muitas publicações seguidas. Aguarde alguns minutos." });
  const corpo = req.body || {};
  const itens = corpo.itens;
  if (JSON.stringify(corpo).length > MAX_BYTES_RANCHO) return json(res, 413, { erro: "Arquivo grande demais para o rancho corrido." });
  if (!Array.isArray(itens) || !itens.length || itens.length > MAX_ITENS_RANCHO || !itens.every(itemRanchoValido) || !["a", "s", "x"].includes(corpo.origem)) {
    return json(res, 400, { erro: "Rancho corrido inválido. Leia o arquivo de novo." });
  }
  const limpos = itens.map((i) => ({ c: i.c, n: i.n.trim(), m: (i.m || "").trim(), r: i.r || null, p: i.p ? String(i.p).trim() : "" }));
  await cofre.gravarRancho(data, { por: await pessoas.nomeExibido(sess.u), em: Date.now(), origem: corpo.origem, itens: limpos });
  await reg.registrar(req, sess.u, "publicou_rancho", { alvo: data }); // só o evento: nenhum nome vai para o registro
  return json(res, 200, { ok: true, data, qtd: limpos.length });
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess || (await pessoas.removido(sess.u))) return json(res, 401, { erro: "Entre de novo." });
  if (!reg.config()) return json(res, 503, { erro: "Banco não configurado." });
  try {
    const q = new URL(req.url || "/", "http://x").searchParams;
    if (q.has("rancho")) return await rancho(req, res, sess, q);
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
