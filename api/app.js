const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");

// Arquivo: [12 bytes IV][16 bytes tag][texto cifrado]; conteúdo = HTML comprimido com brotli
function abrir() {
  const bruto = fs.readFileSync(process.env.APP_ENC_PATH || path.join(process.cwd(), "dados", "app.enc"));
  const chave = Buffer.from(s.exigir("APP_KEY"), "hex");
  const d = crypto.createDecipheriv("aes-256-gcm", chave, bruto.subarray(0, 12));
  d.setAuthTag(bruto.subarray(12, 28));
  return zlib.brotliDecompressSync(Buffer.concat([d.update(bruto.subarray(28)), d.final()]));
}

// Monitor injetado: avisa o servidor quando a pessoa carrega planilha ou baixa PDF/DOCX.
// Envia só o nome da ação, nunca conteúdo da planilha.
const MONITOR = `<script>(function(){
function av(a){try{fetch("/api/evento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({acao:a}),keepalive:true,credentials:"same-origin"})}catch(e){}}
document.addEventListener("click",function(e){var d=e.target.closest&&e.target.closest("[data-baixar]");
if(d){av(d.getAttribute("data-baixar")==="docx"?"baixar_docx":"baixar_pdf");return;}
var b=e.target.closest&&e.target.closest("button,a");if(!b)return;var t=(b.textContent||"").toLowerCase();
if(t.indexOf("baixar pdf")>-1)av("baixar_pdf");else if(t.indexOf("baixar docx")>-1)av("baixar_docx");},true);
document.addEventListener("change",function(e){if(e.target&&e.target.type==="file")av("planilha_carregada");},true);
})();</script>`;

// "Administrador" fica no cabeçalho do app (mesmo estilo dos outros botões), só para quem entrou como administrador
// (decidido no servidor). "Sair" fica no fim da página, como um botão comum, não fixo na tela.
const ESTILO_EXTRA = `<style>
.menu a.link-faixa{display:inline-flex;align-items:center;text-decoration:none}
#cg-rodape{width:100%;max-width:var(--largura,1240px);margin:0 auto;padding:0 var(--margem,1rem) 2.5rem;display:flex;justify-content:flex-end}
#cg-rodape a{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:.6rem 1.6rem;border-radius:10px;font:700 1rem var(--sistema,"Times New Roman",serif);text-decoration:none;color:var(--link,#17345F);background:var(--vidro,rgba(255,255,255,.7));border:1px solid var(--secundaria-borda,#17345F)}
#cg-rodape a:hover{border-color:var(--destaque,#C8A24A)}
@media (max-width:640px){#cg-rodape a{width:100%}}
@media print{#cg-rodape,.menu a.link-faixa{display:none}}
</style>`;
const RODAPE = '<div id="cg-rodape"><a href="/sair">Sair</a></div>';

// As bibliotecas embutidas no app têm "</main>", "<nav" etc. dentro de textos de código; por isso a busca parte
// das marcas do próprio app (cabeçalho e área principal), que vêm antes das bibliotecas.
function inserirMenu(html, admin) {
  const cab = html.indexOf('<header class="faixa"');
  const nav = cab >= 0 ? html.indexOf('<nav class="menu"', cab) : -1;
  const fim = nav >= 0 ? html.indexOf(">", nav) : -1;
  if (fim < 0) return null;
  // "Como usar" para todos (muda de página, como o painel); "Administrador" só para administradores
  const links = '<a class="link-faixa" href="/ajuda">Como usar</a>' + (admin ? '<a class="link-faixa" href="/admin">Administrador</a>' : "");
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
    const admin = await pessoas.ehAdmin(sess.u, sess);
    html = inserirMenu(html, admin) || html;
    const config = configApp(admin, await pessoas.nomeExibido(sess.u));
    const comRodape = inserirRodape(html, config);
    if (comRodape) html = comRodape;
    const extra = MONITOR + ESTILO_EXTRA + (comRodape ? "" : RODAPE + config);
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
