/* Carrega as bibliotecas e o código do sistema no Node, como o navegador faz. */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..");
const WEB = path.join(RAIZ, "web");
const ARQUIVOS = ["texto.js", "entradas.js", "pdf.js", "parser.js", "report.js", "documentos.js", "hospedado.js", "bibliotecas.js"];

globalThis.XLSX = require(path.join(WEB, "vendor", "xlsx.full.min.js"));
globalThis.JSZip = require(path.join(WEB, "vendor", "jszip.min.js"));
globalThis.jspdf = require(path.join(WEB, "vendor", "jspdf.umd.min.js"));
globalThis.pdfjsWorker = require(path.join(WEB, "vendor", "pdf.worker.min.js"));
globalThis.pdfjsLib = require(path.join(WEB, "vendor", "pdf.min.js"));
for (const f of ARQUIVOS) require(path.join(WEB, "src", f));

const M = globalThis.Municiamento;
M.IMAGENS = {
  marca: fs.readFileSync(path.join(RAIZ, "assets", "marca_dagua_ciaga.png")).toString("base64"),
};

function fixture(nome) {
  return new Uint8Array(fs.readFileSync(path.join(RAIZ, "tests", "fixtures", nome)));
}

module.exports = { M, RAIZ, fixture, ARQUIVOS };
