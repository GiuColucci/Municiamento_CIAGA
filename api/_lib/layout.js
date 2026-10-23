// Páginas geradas pelo servidor (reautenticação e painel), com o mesmo cabeçalho, cores e brasão do app.
const esc = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// CSP rígida: só arquivos do próprio site; nenhum script ou estilo inline.
const CSP_PAGINA = "default-src 'none'; style-src 'self'; img-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const TEMA_BOTAO = `<button type="button" class="botao-tema" id="botao-tema" aria-label="Alternar tema claro/escuro" title="Alternar tema claro/escuro">
<svg class="icone-sol" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<svg class="icone-lua" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
</button>`;

// links: [{href, texto}]
function pagina({ titulo, corpo, links = [], centro = false, sair = false, scripts = [] }) {
  const menu = links.map((l) => `<a class="link-faixa" href="${esc(l.href)}"${l.novaAba ? ' target="_blank" rel="noopener"' : ""}>${esc(l.texto)}</a>`).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${esc(titulo)} · Conferência CIAGA</title>
<link rel="icon" href="/brasao.png">
<script src="/tema.js"></script>
<link rel="stylesheet" href="/tema.css">
</head>
<body>
<header class="faixa">
  <div class="faixa-interna">
    <a class="marca" href="/app">
      <span class="selo" aria-hidden="true"></span>
      <span class="marca-texto">
        <span class="marca-nome">Conferência CIAGA - Digital</span>
        <span class="marca-sub">Centro de Instrução Almirante Graça Aranha</span>
      </span>
    </a>
    <nav class="menu" aria-label="Ações">${menu}${TEMA_BOTAO}</nav>
  </div>
</header>
<main class="pagina${centro ? " centro" : ""}" id="conteudo">
${corpo}
</main>
${scripts.map((x) => `<script src="${esc(x)}"></script>`).join("")}
${sair ? '<div class="rodape-sair"><a class="botao sec" href="/sair">Sair</a></div>' : ""}
</body>
</html>`;
}

module.exports = { esc, pagina, CSP_PAGINA };
