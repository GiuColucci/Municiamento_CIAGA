/* Tabela de serviço FICTÍCIA de uma semana (7 páginas, uma por dia), no mesmo desenho do arquivo da unidade.
   Os alunos são os da planilha de exemplo (fonte-app/tests/fixtures/ficticio.xlsx).
   Uso:  node scripts/exemplo-servico-semana.cjs caminho\saida.pdf   (ou a rota /_exemplo-servico-semana.pdf do servidor local) */
const fs = require("fs");
const path = require("path");

const ALUNOS = [
  ["B1037", "ALVES"], ["B1074", "ANGELO"], ["B1111", "ARAUJO"], ["B1148", "BARBOSA"], ["B1185", "BEATRIZ LIMA"], ["B1222", "CORREA"], ["B1259", "DAVI ROCHA"],
  ["B1296", "ERICA MOTA"], ["B1333", "FERRAZ"], ["B1370", "GUSTAVO PIRES"], ["B1407", "HELENA"], ["B1444", "IRIS"], ["B1481", "JOANA"], ["B1518", "KARLA DIAS"],
  ["M2555", "LEMOS"], ["M2592", "MARTINS"], ["M2629", "NADIA SOUZA"], ["M2666", "OTAVIO"], ["M2703", "PALMIERI"], ["M2740", "QUEIROZ"], ["M2777", "RAMOS"],
  ["N2814", "SOFIA PRADO"], ["N2851", "TAVARES"], ["N2888", "URSULA"], ["N2925", "VIEIRA"], ["N2962", "WAGNER"], ["N2999", "XAVIER"], ["N2036", "YARA"],
];
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const TURNOS = ["1200-1500P / 0000-0200P", "1500-1800P / 0200-0400P", "1800-2100P / 0400-0800P", "2100-0000P / 0800-1200P"];

/** inicio: "AAAA-MM-DD" do primeiro dia; 7 dias seguidos. */
function gerar(inicio, raiz) {
  const lib = require(path.join(raiz, "fonte-app", "web", "vendor", "jspdf.umd.min.js"));
  const { jsPDF } = lib.jspdf || lib;
  const d = new jsPDF({ unit: "pt", format: "a4" });
  const t = (x, y, s) => d.text(s, x, 842 - y);
  const [a0, m0, d0] = inicio.split("-").map(Number);
  for (let k = 0; k < 7; k++) {
    if (k) d.addPage();
    const dia = new Date(Date.UTC(a0, m0 - 1, d0 + k));
    const pega = (n) => Array.from({ length: n }, (_, i) => ALUNOS[(k * 5 + i + pegaDeslocamento.v++) % ALUNOS.length]);
    const pegaDeslocamento = { v: 0 };
    d.setFontSize(10);
    t(190, 800, "DETALHE DE SERVIÇO DO CORPO DE ALUNOS");
    t(60, 780, `SERVIÇO: ${dia.getUTCDate()} ${MESES[dia.getUTCMonth()]} ${dia.getUTCFullYear()}`);
    t(60, 750, "3° ANO"); t(60, 735, "SERVIÇO DIÁRIO");
    const linha = (y, funcao, alunos) => {
      t(60, y, funcao);
      alunos.forEach(([c, n], i) => { const x = 140 + i * 110; t(x, y, c.slice(1)); t(x + 30, y, c[0]); t(x + 42, y, n); });
    };
    linha(718, "AJOSCA", pega(1));
    t(60, 690, "SERVIÇO DE QUARTO");
    TURNOS.forEach((s, i) => t(140 + i * 110, 672, s));
    linha(654, "CHEFE DE DIA", pega(4));
    linha(636, "RETÉM", pega(2));
    linha(618, "PAV 3A", pega(4));
    linha(600, "POLÍCIA", pega(3));
  }
  return d.output("arraybuffer");
}

module.exports = { gerar };
if (require.main === module) {
  const saida = process.argv[2];
  if (!saida) { console.error("Uso: node scripts/exemplo-servico-semana.cjs caminho\saida.pdf [AAAA-MM-DD do primeiro dia]"); process.exit(1); }
  const inicio = process.argv[3] || new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  fs.writeFileSync(saida, Buffer.from(gerar(inicio, path.join(__dirname, ".."))));
  console.log("Gerado:", saida, "(7 dias a partir de", inicio + ")");
}
