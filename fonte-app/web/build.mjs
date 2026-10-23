/* Junta código, bibliotecas, estilos e imagens em um único HTML, que abre com dois
   cliques e funciona sem internet.

     node web/build.mjs            -> as três versões abaixo
     node web/build.mjs abertura   -> municiamento_ciaga.html (regra padrão: dias úteis
                                      + municiados de sábado e domingo)
     node web/build.mjs completa   -> conferencia_impressa.html (municiados e
                                      NÃO municiados em todos os dias, com filtro de situação)
     node web/build.mjs rela       -> conferencia_digital.html (escolhe dia, refeição e
                                      ano; marca quem veio e gera a rela copiável)

   O Municiamento.html (versão final 2.1, sem abertura) não é mais gerado aqui: ele fica
   congelado como cópia de segurança (tag v2.1.0). */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(WEB, "..");
const ler = (...p) => readFileSync(join(...p), "utf-8");
const base64 = (...p) => readFileSync(join(...p)).toString("base64");

// Dentro de <script>, "</script" fecharia o bloco e "<!--" pode confundir o HTML.
function seguroParaScript(js, nome) {
  if (/<\/script/i.test(js)) throw new Error(`${nome} contém </script`);
  return js.replace(/<!--/g, "<\\!--");
}

const estilo = ler(WEB, "estilo.css")
  // brasão do CIAGA no fundo e no selo do cabeçalho; é colorido, serve aos dois temas
  .replace("{{BRASAO_CLARO}}", base64(RAIZ, "assets", "brasao_ciaga.png"))
  .replace("{{BRASAO_ESCURO}}", base64(RAIZ, "assets", "brasao_ciaga.png"));

// lazy: o texto vai no HTML mas só é executado depois da abertura (veja src/bibliotecas.js)
const bibliotecas = (lazy) => ["xlsx.full.min.js", "jszip.min.js", "jspdf.umd.min.js", "pdf.worker.min.js", "pdf.min.js"]
  .map((f) => `<script${lazy ? ' type="text/plain" data-lib="' + f + '"' : ""}>/* ${f} */\n${seguroParaScript(ler(WEB, "vendor", f), f)}\n</script>`)
  .join("\n");

const imagens = `globalThis.Municiamento = globalThis.Municiamento || {};
Municiamento.IMAGENS = {
  marca: "${base64(RAIZ, "assets", "marca_dagua_ciaga.png")}"
};`;
const codigoDe = (regra, app, documento) => [imagens, `Municiamento.REGRA = "${regra}";`,
  `Municiamento.TITULO_DOC = ${JSON.stringify(documento)};`]
  .concat(["texto.js", "entradas.js", "pdf.js", "parser.js", "report.js", "documentos.js", "hospedado.js", "bibliotecas.js", app]
    .map((f) => `/* ${f} */\n` + seguroParaScript(ler(WEB, "src", f), f)))
  .concat(["Municiamento.iniciar();"])
  .join("\n");

const VERSOES = {
  abertura: { arquivo: "municiamento_ciaga.html", regra: "padrao", pagina: "pagina.html", app: "app.js" },
  completa: { arquivo: "conferencia_impressa.html", regra: "completa", pagina: "pagina.html", app: "app.js",
    titulo: "Conferência CIAGA", documento: "Conferência", aba: "Conferência CIAGA – Impressa" },
  rela: { arquivo: "conferencia_digital.html", regra: "rela", pagina: "pagina_rela.html", app: "rela.js", lazy: true,
    titulo: "Conferência CIAGA", documento: "Conferência", aba: "Conferência CIAGA – Digital" },
};
const pedidas = process.argv.slice(2).filter((v) => VERSOES[v]);
for (const nome of pedidas.length ? pedidas : Object.keys(VERSOES)) {
  // nome do sistema (abertura, cabeçalho, aba) e título das listas impressas
  const { arquivo, regra, pagina, app, lazy = false, titulo = "Municiamento Ciaga", documento = "Municiamento", aba = titulo } = VERSOES[nome];
  const html = ler(WEB, pagina)
    .replace(/<title>[^<]*<\/title>/, () => "<title>" + aba + "</title>") // título da aba do navegador
    .replace(/\{\{NOME_SISTEMA\}\}/g, () => titulo)
    .replace("/*ESTILO*/", () => estilo)
    .replace("<body>", () => "<body>\n" + ler(WEB, "abertura.html").replace("{{TITULO_ABERTURA}}", titulo))
    .replace("<!--BIBLIOTECAS-->", () => bibliotecas(lazy))
    .replace("<!--CODIGO-->", () => `<script>\n${codigoDe(regra, app, documento)}\n</script>`);
  writeFileSync(join(RAIZ, arquivo), html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`${arquivo}: ${kb} KB, regra ${regra}, sha256 ${createHash("sha256").update(html).digest("hex").slice(0, 12)}`);
}
