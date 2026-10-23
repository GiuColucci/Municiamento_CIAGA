// Visualizador da planilha publicada (só administradores): mostra, em tabela, o que o sistema leu — qualquer que tenha sido
// o arquivo enviado (XLSX, CSV ou PDF, que já foi convertido na leitura). Só leitura: sem botão de baixar.
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const cofre = require("./_lib/cofre");
const { esc, pagina, CSP_PAGINA } = require("./_lib/layout");

const DIAS = ["Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta", "Quinta"];
const REF = ["Café", "Almoço", "Janta", "Ceia"];
const quando = (t) => new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const marcou = (n, i) => Math.floor(n / 2 ** i) % 2 === 1;

function enviar(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", CSP_PAGINA);
  res.setHeader("Cache-Control", "no-store");
  res.end(html);
}

const LINKS = [{ href: "/admin", texto: "Voltar ao painel" }, { href: "/app", texto: "Voltar ao app" }];
const aviso = (corpo) => pagina({ titulo: "Planilha publicada", links: LINKS, sair: true, corpo: `<section class="cartao estreito"><h1>Planilha publicada</h1>${corpo}</section>` });

function tabela(turma, alunos) {
  const tot = new Array(28).fill(0);
  const linhas = alunos.map((a, i) => {
    let tds = "";
    for (let b = 0; b < 28; b++) {
      const x = marcou(a[3], b);
      if (x) tot[b]++;
      tds += `<td class="${x ? "x" : ""}${b % 4 === 3 ? " fim" : ""}">${x ? "x" : ""}</td>`;
    }
    return `<tr><td class="n">${i + 1}</td><td class="nome">${esc(a[0])}</td><td class="cod">${esc(a[1])}</td>${tds}</tr>`;
  }).join("");
  const dias = DIAS.map((d) => `<th colspan="4" class="fim">${esc(d)}</th>`).join("");
  const refs = DIAS.map(() => REF.map((r, j) => `<th class="${j === 3 ? "fim" : ""}" title="${esc(r)}">${esc(r.slice(0, 3))}</th>`).join("")).join("");
  const totais = tot.map((n, b) => `<td class="${b % 4 === 3 ? "fim" : ""}">${n}</td>`).join("");
  return `<div class="rolar"><table class="planilha-ver"><thead><tr><th rowspan="2">Nº</th><th rowspan="2" class="nome">Nome</th><th rowspan="2">Código</th>${dias}</tr><tr>${refs}</tr></thead><tbody>${linhas}</tbody><tfoot><tr><td colspan="3">Total marcado</td>${totais}</tr></tfoot></table></div>`;
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  if ((await pessoas.papelAtual(sess.u, sess)) < 1) {
    await reg.registrar(req, sess.u, "admin_negado");
    return enviar(res, 403, aviso('<p class="dica">Só administradores que escolheram “Administrador” ao entrar veem a planilha.</p>'));
  }
  let pub;
  try {
    pub = await cofre.lerPlanilha();
  } catch {
    return enviar(res, 500, aviso('<p class="alerta aviso">Não consegui ler a planilha publicada agora.</p>'));
  }
  if (!pub) return enviar(res, 200, aviso('<p class="dica">Nenhuma planilha publicada. No app, leia a planilha e use Publicar.</p>'));

  const d = pub.dados;
  const turmas = d.turmas.map((t) => t[0]).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const q = new URL(req.url, "http://x").searchParams;
  const turma = turmas.includes(q.get("turma")) ? q.get("turma") : turmas[0];
  const doTurma = d.alunos.filter((a) => a[2] === turma);
  const nTurmas = d.turmas.length;
  const graves = d.avisos.filter((a) => a[1]).length;

  await reg.registrar(req, sess.u, "admin_viu_planilha");
  const chips = turmas.map((t) => `<a class="chip-turma${t === turma ? " ativa" : ""}" href="/admin/planilha?turma=${encodeURIComponent(t)}"${t === turma ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("");
  const avisos = d.avisos.length
    ? `<details class="cartao"${graves ? " open" : ""}><summary><strong>Avisos da leitura (${d.avisos.length})</strong></summary><ul class="lista-avisos">${d.avisos.map((a) => `<li>${esc(a[0])}</li>`).join("")}</ul></details>`
    : "";
  const corpo = `<section class="cartao">
<h1>Planilha publicada</h1>
<p>Lida de um arquivo <strong>${esc(d.formato)}</strong>${d.formato === "PDF" ? " e convertida em tabela" : ""}. Publicada por <strong>${esc(pub.por)}</strong> em ${esc(quando(pub.em))}${d.sexta ? `. Sexta-feira da primeira coluna: <strong>${esc(d.sexta.split("-").reverse().join("/"))}</strong>` : ""}.</p>
<p><strong>${d.alunos.length}</strong> alunos em <strong>${nTurmas}</strong> turmas. É isto que os alunos recebem no app. Aqui só dá para conferir: não há botão de baixar.</p>
${d.formato === "PDF" ? '<p class="alerta aviso">Arquivo PDF: pode haver pequenas diferenças de marcação. Confira com atenção ou publique o XLSX.</p>' : ""}
</section>
${avisos}
<section class="cartao">
<h2>Turma ${esc(turma)} (${doTurma.length} alunos)</h2>
<nav class="chips-turma" aria-label="Turmas">${chips}</nav>
${tabela(turma, doTurma)}
</section>`;
  enviar(res, 200, pagina({ titulo: "Planilha publicada", links: LINKS, sair: true, corpo }));
};
