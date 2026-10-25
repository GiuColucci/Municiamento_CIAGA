const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const { menuSuspenso } = require("./_lib/layout");

// Arquivo: [12 bytes IV][16 bytes tag][texto cifrado]; conteúdo = HTML comprimido com brotli
function abrir() {
  const bruto = fs.readFileSync(process.env.APP_ENC_PATH || path.join(process.cwd(), "dados", "app.enc"));
  const chave = Buffer.from(s.exigir("APP_KEY"), "hex");
  const d = crypto.createDecipheriv("aes-256-gcm", chave, bruto.subarray(0, 12));
  d.setAuthTag(bruto.subarray(12, 28));
  return zlib.brotliDecompressSync(Buffer.concat([d.update(bruto.subarray(28)), d.final()]));
}

// Monitor injetado: avisa o servidor quando a pessoa carrega planilha ou baixa o PDF.
// Envia só o nome da ação, nunca conteúdo da planilha.
const MONITOR = `<script>(function(){
function av(a){try{fetch("/api/evento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({acao:a}),keepalive:true,credentials:"same-origin"})}catch(e){}}
document.addEventListener("click",function(e){var d=e.target.closest&&e.target.closest("[data-baixar]");
if(d){av("baixar_pdf");return;}
var b=e.target.closest&&e.target.closest("button,a");if(!b)return;var t=(b.textContent||"").toLowerCase();
if(t.indexOf("baixar pdf")>-1)av("baixar_pdf");},true);
document.addEventListener("change",function(e){if(e.target&&e.target.type==="file")av("planilha_carregada");},true);
})();</script>`;

// "Administrador" fica no cabeçalho do app (mesmo estilo dos outros botões), só para quem entrou como administrador
// (decidido no servidor). "Sair" fica no fim da página, como um botão comum, não fixo na tela.
const LINK_CSS = '<link rel="stylesheet" href="/menu.css">'; // menu suspenso, cabeçalho largo e Sair: um só arquivo, o mesmo das páginas do servidor
const RODAPE = '<div id="cg-rodape"><a href="/sair">Sair</a></div>';

// As bibliotecas embutidas no app têm "</main>", "<nav" etc. dentro de textos de código; por isso a busca parte
// das marcas do próprio app (cabeçalho e área principal), que vêm antes das bibliotecas.
function inserirMenu(html, admin) {
  const cab = html.indexOf('<header class="faixa"');
  const nav = cab >= 0 ? html.indexOf('<nav class="menu"', cab) : -1;
  const fim = nav >= 0 ? html.indexOf(">", nav) : -1;
  if (fim < 0) return null;
  // Menu suspenso: "Conferência geral" e "Como usar" para todos (mudam de tela/página, como o painel); "Administrador" só para administradores
  const links = menuSuspenso([
    { href: "/app", texto: "Voltar ao app", attrs: "data-voltar-app hidden" }, // o app o mostra só na Conferência Geral
    { href: "#conferencia-geral", texto: "Conferência geral", attrs: "data-abrir-geral" },
    { href: "#rancho-corrido", texto: "Rancho corrido", attrs: "data-abrir-rancho" },
    ...(admin ? [{ href: "/admin", texto: "Administrador" }] : []),
    { href: "/ajuda", texto: "Como usar" },
  ]);
  return html.slice(0, fim + 1) + links + html.slice(fim + 1);
}

// Perfil de quem abriu o app (decidido aqui, no servidor): o app usa só para mostrar ou esconder telas; quem de fato
// pode publicar a planilha é conferido de novo no servidor, a cada envio.
function configApp(admin, nome) {
  const dados = JSON.stringify({ perfil: admin ? "admin" : "aluno", nome }).replace(/</g, "\\u003c");
  return `<script>globalThis.Municiamento=globalThis.Municiamento||{};Municiamento.HOSPEDADO=${dados};document.documentElement.classList.add("hospedado","perfil-${admin ? "admin" : "aluno"}");</script>`;
}

// Depois do </main> da área principal (antes das bibliotecas e do código do app); sem ele, no fim da página.
function inserirRodape(html, config) {
  const main = html.indexOf('<main id="conteudo"');
  const i = main >= 0 ? html.indexOf("</main>", main) : -1;
  return i < 0 ? null : html.slice(0, i + 7) + RODAPE + config + html.slice(i + 7);
}

// A página tem ~3,4 MB; comprimida (brotli ou gzip) cai para ~1,1 MB, o que ajuda muito a abrir no celular.
function compactar(html, aceita) {
  const bruto = Buffer.from(html, "utf8");
  const a = String(aceita || "");
  if (/\bbr\b/.test(a)) {
    const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bruto.length };
    return { corpo: zlib.brotliCompressSync(bruto, { params }), codificacao: "br" };
  }
  if (/\bgzip\b/.test(a)) return { corpo: zlib.gzipSync(bruto, { level: 6 }), codificacao: "gzip" };
  return { corpo: bruto, codificacao: null };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob:",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  if (await pessoas.removido(sess.u)) {
    res.setHeader("Set-Cookie", s.cookieHeader("", 0));
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  try {
    let html = abrir().toString("utf8");
    // O app traz uma regra que bloqueia toda rede (connect-src 'none'). Liberamos só o próprio site, para o monitor
    // avisar "carregou planilha / baixou PDF". Rede externa continua bloqueada.
    html = html.replace("connect-src 'none'", "connect-src 'self'");
    // idem para estilos: o app só aceita estilo embutido; liberamos o arquivo /menu.css do próprio site (menu e cabeçalho)
    html = html.replace("style-src 'unsafe-inline'", "style-src 'self' 'unsafe-inline'");
    // leitor de fotos do rancho corrido (OCR): scripts, worker e WebAssembly só do próprio site (/ocr/); a regra do cabeçalho HTTP já permitia
    html = html.replace("script-src 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:");
    html = html.replace("worker-src 'none'", "worker-src 'self' blob:");
    const admin = await pessoas.ehAdmin(sess.u, sess);
    html = inserirMenu(html, admin) || html;
    const config = configApp(admin, await pessoas.nomeExibido(sess.u));
    const comRodape = inserirRodape(html, config);
    if (comRodape) html = comRodape;
    const extra = MONITOR + (comRodape ? "" : RODAPE + config);
    // o CSS vai no <head> (o primeiro </head> é o do app; as bibliotecas ficam depois, dentro do <body>)
    const cab = html.indexOf("</head>");
    html = cab >= 0 ? html.slice(0, cab) + LINK_CSS + html.slice(cab) : html;
    // O </body> verdadeiro é o ÚLTIMO: o app embute bibliotecas que têm "</body>" dentro de textos de código.
    const fim = html.lastIndexOf("</body>");
    html = fim >= 0 ? html.slice(0, fim) + extra + html.slice(fim) : html + extra;
    await reg.registrar(req, sess.u, "app_aberto");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Accept-Encoding");
    const { corpo, codificacao } = compactar(html, req.headers["accept-encoding"]);
    if (codificacao) res.setHeader("Content-Encoding", codificacao);
    res.setHeader("Content-Length", corpo.length);
    res.end(corpo);
  } catch (e) {
    console.error("falha ao abrir o app:", e.message);
    res.statusCode = 500;
    res.end("Erro interno.");
  }
};
