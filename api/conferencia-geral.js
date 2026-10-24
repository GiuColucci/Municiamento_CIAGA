// Conferência Geral (qualquer pessoa autenticada, aluno ou administrador): junta o trabalho de todas as pessoas que conferiram o mesmo dia e a mesma refeição.
// Lê os rascunhos cifrados de cada pessoa (a decifragem acontece só aqui, no servidor, a cada consulta) e devolve a UNIÃO das
// marcações: o aluno consta se qualquer conferente o marcou. Nada do resultado é guardado.
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const cofre = require("./_lib/cofre");

const DIAS = ["Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta", "Quinta"];
const REFEICOES = ["Café", "Almoço", "Janta", "Ceia"];

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

const chaveTexto = (k) => typeof k === "string" && k.length <= 160;

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess || (await pessoas.removido(sess.u))) return json(res, 401, { erro: "Entre de novo." });
  if (req.method !== "GET") return json(res, 405, { erro: "Método não permitido." });
  if (!reg.config()) return json(res, 503, { erro: "Banco não configurado." });
  try {
    const pub = await cofre.lerPlanilha();
    if (!pub) return json(res, 404, { vazio: true });
    const st = await pessoas.estado();
    const nomes = [...st.pessoas.keys()];
    const rascunhos = await cofre.lerRascunhos(nomes);
    // só vale o trabalho feito na planilha publicada agora
    const registros = [];
    rascunhos.forEach((d, i) => {
      if (!d || d.v !== 1 || d.planilha !== pub.id || !Array.isArray(d.listas)) return;
      registros.push({ nome: st.pessoas.get(nomes[i]).d || nomes[i], listas: d.listas, em: Number(d.salvoEm) || null });
    });

    const q = new URL(req.url, "http://x").searchParams;
    const dia = q.get("dia"), refeicao = q.get("refeicao");
    if (!dia && !refeicao) {
      // quais combinações (dia x refeição) têm conferentes
      const cont = new Map();
      for (const r of registros) {
        const vistas = new Set();
        for (const l of r.listas) {
          if (!l || !Array.isArray(l.marcados) || !l.marcados.length) continue;
          if (!DIAS.includes(l.dia) || !REFEICOES.includes(l.refeicao)) continue;
          vistas.add(l.dia + "|" + l.refeicao);
        }
        for (const k of vistas) cont.set(k, (cont.get(k) || 0) + 1);
      }
      const opcoes = [...cont].map(([k, n]) => { const [d, r] = k.split("|"); return { dia: d, refeicao: r, conferentes: n }; })
        .sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || REFEICOES.indexOf(a.refeicao) - REFEICOES.indexOf(b.refeicao));
      return json(res, 200, { planilha: pub.id, sexta: pub.dados.sexta || null, opcoes });
    }
    if (!DIAS.includes(dia) || !REFEICOES.includes(refeicao)) return json(res, 400, { erro: "Dia ou refeição inválidos." });

    const marcados = new Set();
    const conferentes = [];
    for (const r of registros) {
      const proprias = r.listas.filter((l) => l && l.dia === dia && l.refeicao === refeicao && Array.isArray(l.marcados) && l.marcados.length);
      if (!proprias.length) continue;
      const dela = new Set();
      for (const l of proprias) for (const k of l.marcados) if (chaveTexto(k)) { dela.add(k); marcados.add(k); }
      conferentes.push({ nome: r.nome, listas: proprias.length, finalizadas: proprias.filter((l) => l.finalizada).length, marcados: dela.size, em: r.em });
    }
    conferentes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    await reg.registrar(req, sess.u, "viu_conferencia_geral");
    return json(res, 200, { planilha: pub.id, sexta: pub.dados.sexta || null, dia, refeicao, conferentes, marcados: [...marcados] });
  } catch (e) {
    console.error("falha na conferência geral:", e.message);
    return json(res, 500, { erro: "Não consegui concluir. Tente de novo." });
  }
};
