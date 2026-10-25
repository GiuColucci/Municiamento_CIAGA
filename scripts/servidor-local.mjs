// Servidor local para testar o site no seu computador, SEM deploy e sem tocar no banco de verdade.
//   npm run local        (depois abra http://localhost:4174)
// Usa um Redis falso em memória, chaves aleatórias e pessoas FICTÍCIAS. Nada é gravado em disco e tudo some ao fechar.
// Só para desenvolvimento: nunca coloque dados reais aqui.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(raiz, "x.js"));
const PORTA = Number(process.env.PORTA) || 4174;
const SENHA_ALUNOS = "aluno-2026", SENHA_ADMIN = "admin-2026";

Object.assign(process.env, {
  APP_KEY: crypto.randomBytes(32).toString("hex"), DATA_KEY: crypto.randomBytes(32).toString("hex"),
  SESSION_SECRET: crypto.randomBytes(16).toString("hex"), PEPPER: crypto.randomBytes(16).toString("hex"),
  KV_REST_API_URL: "http://redis.falso", KV_REST_API_TOKEN: "x", ACCESS_CODE: SENHA_ALUNOS, ACCESS_CODE_ADMIN: SENHA_ADMIN,
});

// 1) o app: gera (se preciso) e cifra num arquivo temporário, como no site de verdade
const appHtml = path.join(raiz, "fonte-app", "conferencia_digital.html");
if (!fs.existsSync(appHtml) || process.argv.includes("--build")) {
  console.log("Gerando o app…");
  execFileSync(process.execPath, [path.join(raiz, "fonte-app", "web", "build.mjs"), "rela"], { cwd: raiz, stdio: "inherit" });
}
const iv = crypto.randomBytes(12);
const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(process.env.APP_KEY, "hex"), iv);
const cifrado = Buffer.concat([c.update(zlib.brotliCompressSync(fs.readFileSync(appHtml))), c.final()]);
const tmp = path.join(os.tmpdir(), "conferencia-local-" + process.pid + ".enc");
fs.writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), cifrado]));
process.env.APP_ENC_PATH = tmp;
process.on("exit", () => { try { fs.rmSync(tmp, { force: true }); } catch { /* já apagado */ } }); // o app cifrado temporário some ao fechar
process.on("SIGINT", () => process.exit(0));

// 2) Redis falso em memória
const hash = new Map(), textos = new Map(), listas = new Map(); // listas: por chave (rancho corrido)
let lista = [];
const fatia = (arr, a, b) => arr.slice(a < 0 ? Math.max(arr.length + a, 0) : a, (b < 0 ? arr.length + b : b) + 1);
global.fetch = async (u, init) => {
  const out = JSON.parse(init.body).map(([cmd, k, ...a]) => ({
    result:
      cmd === "HGET" ? hash.get(a[0]) ?? null
      : cmd === "HSET" ? (hash.set(a[0], a[1]), 1)
      : cmd === "HDEL" ? (hash.delete(a[0]) ? 1 : 0)
      : cmd === "SET" ? (textos.set(k, a[0]), "OK")
      : cmd === "GET" ? (textos.get(k) ?? null)
      : cmd === "MGET" ? [k, ...a].map((x) => textos.get(x) ?? null)
      : cmd === "DEL" ? (textos.delete(k) || listas.delete(k) ? 1 : 0)
      : cmd === "HGETALL" ? [...hash].flat()
      : cmd === "LPUSH" ? (lista.unshift(a[0]), 1)
      : cmd === "LTRIM" ? (k !== "log" ? (listas.set(k, fatia(listas.get(k) || [], Number(a[0]), Number(a[1]))), "OK") : ((lista = fatia(lista, Number(a[0]), Number(a[1]))), "OK"))
      : cmd === "LRANGE" ? (k !== "log" ? fatia(listas.get(k) || [], Number(a[0]), Number(a[1])) : fatia(lista, Number(a[0]), Number(a[1])))
      : cmd === "RPUSH" ? (listas.set(k, (listas.get(k) || []).concat(a[0])), 1)
      : 1,
  }));
  return { ok: true, json: async () => out };
};

// 3) pessoas fictícias
const PESSOAS = [
  { nome: "Alfa", codigo: "B1901", papel: "ranchef" },
  { nome: "Bravo", codigo: "B1902", papel: "admin" },
  { nome: "Charlie", codigo: "B1903" },
  { nome: "Delta", codigo: "B1904" },
];
await require(path.join(raiz, "api/_lib/pessoas.js")).carregarLista(PESSOAS);

const tipos = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".png": "image/png" };
const rotas = {
  "/api/login": "api/login.js", "/api/admin-acao": "api/admin-acao.js", "/api/admin-exportar": "api/admin-baixar.js", "/api/admin-lista": "api/admin-baixar.js",
  "/api/planilha": "api/planilha.js", "/api/rascunho": "api/rascunho.js", "/api/evento": "api/evento.js", "/api/conferencia-geral": "api/conferencia-geral.js",
  "/app": "api/app.js", "/admin": "api/admin.js", "/admin/planilha": "api/planilha-ver.js", "/ajuda": "api/ajuda.js", "/sair": "api/sair.js",
};
// PDFs de exemplo do rancho corrido, no mesmo desenho dos formulários da unidade (nomes e números do arquivo de teste)
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
function exemploRancho(servico) {
  const lib = require(path.join(raiz, "fonte-app", "web", "vendor", "jspdf.umd.min.js"));
  const { jsPDF } = lib.jspdf || lib;
  const d = new jsPDF({ unit: "pt", format: "a4" });
  d.setFontSize(10);
  const t = (x, y, s) => d.text(s, x, 842 - y);
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [a, m, di] = hoje.split("-");
  if (!servico) {
    t(207, 721, "AUTORIZAÇÃO PARA RANCHO CORRIDO"); t(57, 694, `Data: ${di}/${m}/${a}`); t(57, 667, "Refeição: Almoço"); t(57, 640, "Motivo: Prova de recuperação (exemplo)");
    t(281, 569, "1º ANO"); t(62, 550, "Nº Interno"); t(139, 550, "Nome de Guerra"); t(242, 550, "Pelotão/"); t(298, 550, "Nº Interno"); t(385, 550, "Nome de Guerra");
    t(62, 536, "1037"); t(139, 536, "ALVES"); t(242, 536, "1º PEL"); t(298, 536, "1074"); t(385, 536, "ÂNGELO"); t(493, 536, "2º PEL");
  } else {
    t(200, 800, "DETALHE DE SERVIÇO DO CORPO DE ALUNOS"); t(60, 780, `SERVIÇO: ${Number(di)} ${MESES[Number(m) - 1]} ${a}`);
    t(60, 740, "1° ANO"); t(250, 720, "SERVIÇO DE QUARTO"); t(240, 706, "0800-1200P / 2000-0000P"); t(440, 706, "1200-1600P / 0000-0400P");
    t(60, 690, "CHEFE DE DIA"); t(190, 690, "1111"); t(225, 690, "B"); t(260, 690, "ARAUJO"); t(440, 690, "3110"); t(475, 690, "M"); t(505, 690, "BRUNO TELES");
  }
  return d.output("arraybuffer");
}
const lerCorpo = (req) => new Promise((ok) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => ok(b)); });

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // atalho só do servidor local: com a planilha já publicada, cria dois rascunhos de conferentes fictícios (hoje, Janta)
  if (url.pathname === "/_demo") {
    const cofre = require(path.join(raiz, "api/_lib/cofre.js"));
    const pub = await cofre.lerPlanilha();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    if (!pub) return res.end("Publique uma planilha primeiro (entre como Alfa em Administrador, carregue o XLSX e clique em Publicar).");
    // a Conferência Geral só mostra o dia de hoje: descobre qual dia da semana da planilha é hoje
    const DIAS = ["Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta", "Quinta"];
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const dif = pub.dados.sexta ? Math.round((Date.parse(hoje) - Date.parse(pub.dados.sexta)) / 86400000) : 0;
    if (dif < 0 || dif > 6) return res.end(`A planilha de exemplo é da semana que começa em ${pub.dados.sexta}; hoje (${hoje}) está fora dela, então a Conferência Geral não mostraria nada. Use uma planilha da semana atual.`);
    const dia = DIAS[dif];
    const chaves = pub.dados.alunos.map((a) => a[2] + "|" + a[1] + "|" + a[0]);
    const rasc = (marcados, fin) => ({ v: 1, planilha: pub.id, sexta: pub.dados.sexta, ativa: 1, proximoId: 2, salvoEm: Date.now(),
      listas: [{ id: 1, dia, refeicao: "Janta", ano: "1", finalizada: fin, criterio: "alfabetica", agrupar: "ano", separar: false, turmas: null,
        mostrar: "todos", turmasMarcacao: null, marcacaoPorTurma: false, filtroMarcacao: "todos", marcados }] });
    const ano1 = chaves.filter((k) => k.charAt(1) === "1");
    await cofre.gravarRascunho("charlie", rasc(ano1.slice(0, 8), true));
    await cofre.gravarRascunho("delta", rasc(ano1.slice(5, 12), false));
    return res.end(`Pronto: Charlie e Delta 'conferiram' ${dia} · Janta (hoje), com alguns alunos em comum. Abra Menu → Conferência geral.`);
  }
  // arquivos de exemplo (FICTÍCIOS) do rancho corrido, com a data de hoje: /_exemplo-autorizacao.pdf e /_exemplo-servico.pdf
  if (url.pathname === "/_exemplo-autorizacao.pdf" || url.pathname === "/_exemplo-servico.pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${url.pathname.slice(1)}"`);
    return res.end(Buffer.from(exemploRancho(url.pathname.includes("servico"))));
  }
  // arquivo de teste seu (a escala real, por exemplo): ARQUIVO_TESTE=C:\\caminho\\arquivo.pdf npm run local  ->  /_arquivo-teste (fica só no seu computador)
  if (url.pathname === "/_arquivo-teste" && process.env.ARQUIVO_TESTE && fs.existsSync(process.env.ARQUIVO_TESTE)) {
    const ext = path.extname(process.env.ARQUIVO_TESTE).toLowerCase();
    res.setHeader("Content-Type", ext === ".pdf" ? "application/pdf" : ext === ".csv" ? "text/csv" : "application/octet-stream");
    return res.end(fs.readFileSync(process.env.ARQUIVO_TESTE));
  }
  // auditoria de layout (só desenvolvimento): http://localhost:4174/_auditoria.js
  if (url.pathname === "/_auditoria.js") {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    return res.end(fs.readFileSync(path.join(raiz, "scripts", "auditoria-layout.js")));
  }
  // planilha de exemplo (fictícia) para carregar no app: http://localhost:4174/_exemplo.xlsx
  if (url.pathname === "/_exemplo.xlsx") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="ficticio.xlsx"');
    return res.end(fs.readFileSync(path.join(raiz, "fonte-app", "tests", "fixtures", "ficticio.xlsx")));
  }
  const rota = rotas[url.pathname];
  if (rota) {
    const bruto = await lerCorpo(req);
    const ehJson = String(req.headers["content-type"] || "").includes("json");
    req.body = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
      ? (ehJson ? (() => { try { return JSON.parse(bruto); } catch { return {}; } })() : Object.fromEntries(new URLSearchParams(bruto))) : undefined;
    // os endereços antigos de download viram o parâmetro de api/admin-baixar.js (como o vercel.json faz)
    if (url.pathname === "/api/admin-lista") req.url = "/api/admin-baixar?o=lista";
    if (url.pathname === "/api/admin-exportar") req.url = "/api/admin-baixar?o=backup";
    return require(path.join(raiz, rota))(req, res);
  }
  const arq = path.join(raiz, "public", url.pathname === "/" ? "index.html" : url.pathname);
  if (arq.startsWith(path.join(raiz, "public")) && fs.existsSync(arq) && fs.statSync(arq).isFile()) {
    res.setHeader("Content-Type", tipos[path.extname(arq)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    return res.end(fs.readFileSync(arq));
  }
  res.statusCode = 404;
  res.end("não achei");
});
// se a porta já estiver em uso (outro servidor local aberto), tenta as próximas em vez de falhar
function subir(porta, restantes) {
  servidor.once("error", (e) => {
    if (e.code === "EADDRINUSE" && restantes > 0) { console.log(`A porta ${porta} já está em uso (talvez outro "npm run local" aberto). Tentando a ${porta + 1}…`); subir(porta + 1, restantes - 1); }
    else { console.error(e.code === "EADDRINUSE" ? "Nenhuma porta livre entre " + PORTA + " e " + porta + ". Feche o outro servidor local." : e); process.exit(1); }
  });
  servidor.listen(porta, "127.0.0.1");
}
servidor.once("listening", () => {
    const PORTA = servidor.address().port; // o texto abaixo usa a porta que ficou valendo
  console.log(`\nSite local pronto: http://localhost:${PORTA}/\n`);
  console.log("Pessoas FICTÍCIAS (nome · número interno · cargo):");
  PESSOAS.forEach((p) => console.log(`  ${p.nome.padEnd(8)} ${p.codigo}  ${p.papel || "aluno"}`));
  console.log(`\nSenha dos alunos: ${SENHA_ALUNOS}    Senha dos administradores: ${SENHA_ADMIN}`);
  console.log("Para entrar como administrador, escolha 'Administrador' e use a senha dos administradores.");
  console.log(`Planilha de exemplo (fictícia): http://localhost:${PORTA}/_exemplo.xlsx`);
  console.log(`Rancho corrido de exemplo (fictício, com a data de hoje): http://localhost:${PORTA}/_exemplo-autorizacao.pdf e /_exemplo-servico.pdf`);
  console.log(`Depois de publicar uma planilha, abra http://localhost:${PORTA}/_demo para criar conferentes de exemplo.`);
  console.log("Tudo fica na memória e some ao fechar (Ctrl+C).\n");
});
subir(PORTA, 9);

