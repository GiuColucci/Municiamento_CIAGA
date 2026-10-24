import test from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const chave = crypto.randomBytes(32).toString("hex");
process.env.APP_KEY = chave;
process.env.SESSION_SECRET = "segredo-de-teste";
process.env.PEPPER = "pimenta-de-teste";
process.env.DATA_KEY = crypto.randomBytes(32).toString("hex");
process.env.KV_REST_API_URL = "http://redis.falso";
process.env.KV_REST_API_TOKEN = "t";
const s = require("../api/_lib/seguranca.js");
const p = require("../api/_lib/pessoas.js");
const reg = require("../api/_lib/registro.js");

// Redis falso em memória
const db = { h: new Map(), l: [], s: new Map(), ttl: new Map() };
const fatia = (arr, a, b) => arr.slice(a < 0 ? Math.max(arr.length + a, 0) : a, (b < 0 ? arr.length + b : b) + 1);
function cmd([c, k, ...a]) {
  switch (c) {
    case "LPUSH": db.l.unshift(a[0]); return 1;
    case "LTRIM": db.l = fatia(db.l, Number(a[0]), Number(a[1])); return "OK";
    case "LRANGE": return fatia(db.l, Number(a[0]), Number(a[1]));
    case "SET": db.s.set(k, a[0]); db.ttl.set(k, a[1] === "EX" ? a[2] : null); return "OK";
    case "GET": return db.s.get(k) ?? null;
    case "MGET": return [k, ...a].map((x) => db.s.get(x) ?? null);
    case "DEL": return db.s.delete(k) ? 1 : 0;
    case "HGETALL": return [...db.h].flat();
    case "HGET": return db.h.get(a[0]) ?? null;
    case "HSET": db.h.set(a[0], a[1]); return 1;
    case "HDEL": return db.h.delete(a[0]) ? 1 : 0;
    default: throw new Error("comando " + c);
  }
}
global.fetch = async (url, init) => {
  const out = JSON.parse(init.body).map((x) => ({ result: cmd(x) }));
  return { ok: true, json: async () => out };
};
const zerar = () => { db.h.clear(); db.l = []; db.s.clear(); db.ttl.clear(); };
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } });

const LISTA = [
  { nome: "Gordilho", codigo: "B1901", papel: "ranchef" },
  { nome: "Romeo", codigo: "B1902", papel: "admin" },
  { nome: "Mike", codigo: "B1903" },
  { nome: "Tango", codigo: "B1904" },
  { nome: "Ana Lima", codigo: "B1500" },
];
// cookie de sessão: papel > 0 = aberta em modo administrador; sem papel = modo aluno
const sessao = (quem, papel) => "sessao=" + s.criarCookie(quem, papel, !!papel);
const dadosCookie = (setCookie) => JSON.parse(Buffer.from(setCookie.split("=")[1].split(".")[0], "base64url").toString());

test("senha da equipe (USERS) certa e errada", () => {
  process.env.USERS = JSON.stringify({ maria: s.hashSenha("senha-bem-longa-1") });
  assert.equal(s.conferirSenha("Maria", "senha-bem-longa-1"), "maria");
  assert.equal(s.conferirSenha("maria", "errada"), null);
  assert.equal(s.conferirSenha("ninguem", "senha-bem-longa-1"), null);
  delete process.env.USERS;
});

test("cookie adulterado ou ausente é recusado; modo administrador dura menos", () => {
  const c = s.criarCookie("maria");
  assert.ok(s.lerSessao({ headers: { cookie: "sessao=" + c } }));
  const [corpo] = c.split(".");
  assert.equal(s.lerSessao({ headers: { cookie: "sessao=" + corpo + ".xxxx" } }), null);
  assert.equal(s.lerSessao({ headers: {} }), null);
  const aluno = s.lerSessao({ headers: { cookie: sessao("maria") } });
  const adm = s.lerSessao({ headers: { cookie: sessao("maria", 1) } });
  assert.equal(aluno.m, 0);
  assert.equal(adm.m, 1);
  assert.ok(adm.exp < aluno.exp); // sessão de administrador é mais curta
});

test("códigos de acesso diferentes: um para alunos, outro para administradores", () => {
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
  assert.equal(s.conferirAcesso("", false), false); // aluno sem código definido: ninguém entra (antes entrava sem pedir nada)
  assert.equal(s.conferirAcesso("qualquer", false), false);
  assert.equal(s.conferirAcesso("qualquer", true), false); // administrador sem código definido: ninguém entra
  process.env.ACCESS_CODE = "Unidade-2026";
  process.env.ACCESS_CODE_ADMIN = "Admin-2026";
  assert.equal(s.conferirAcesso("unidade-2026", false), false); // diferencia maiúscula
  assert.equal(s.conferirAcesso(" Unidade-2026 ", false), true);
  assert.equal(s.conferirAcesso("Admin-2026", true), true);
  assert.equal(s.conferirAcesso("Admin-2026", false), false); // o código de administrador não abre o perfil de aluno
  assert.equal(s.conferirAcesso("Unidade-2026", true), false); // o de aluno não abre o de administrador
  assert.equal(s.conferirAcesso("", true), false);
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("IP é mascarado antes de gravar", () => {
  assert.equal(reg.mascararIp("187.12.34.56"), "187.12.x.x");
  assert.equal(reg.mascararIp("2804:14d:5c80:1234::1"), "2804:14d:5c80::x");
  assert.equal(reg.mascararIp("lixo"), "?");
  assert.equal(reg.ipDe({ headers: { "x-forwarded-for": "200.1.2.3, 10.0.0.1" } }), "200.1.x.x");
});

test("lista no banco: login por nome + código, papéis, hash não revela o código", async () => {
  zerar();
  assert.deepEqual(await p.carregarLista(LISTA), { novos: 5, existentes: 0, atualizados: 0 });
  assert.deepEqual(await p.conferir("gordilho", "b1901"), { nome: "gordilho", papel: 2, admin: true });
  assert.deepEqual(await p.conferir("romeo", "B1902"), { nome: "romeo", papel: 1, admin: true });
  assert.deepEqual(await p.conferir(" MIKE ", "B1903"), { nome: "mike", papel: 0, admin: false });
  assert.equal(await p.conferir("romeo", "B1901"), null);
  assert.equal(await p.conferir("fulano", "B1901"), null);
  assert.equal(await p.conferir("", ""), null);
  const guardado = JSON.stringify([...db.h]);
  assert.ok(!guardado.includes("B1901") && !guardado.includes("b1901"));
  assert.deepEqual(await p.carregarLista(LISTA), { novos: 0, existentes: 5, atualizados: 0 }); // não altera quem existe
  process.env.PEPPER = "outra"; // banco roubado sozinho não serve
  assert.equal(await p.conferir("romeo", "B1902"), null);
  process.env.PEPPER = "pimenta-de-teste";
});

test("carga: nome repetido, código inválido, 2 rancheis, 3 administradores; ranchef novo só se não houver", async () => {
  zerar();
  await assert.rejects(p.carregarLista([{ nome: "Ana", codigo: "B1001" }, { nome: "ana", codigo: "B1002" }]), /repetido/);
  await assert.rejects(p.carregarLista([{ nome: "Ana", codigo: "XX" }]), /inválida/);
  const dois = [{ nome: "A", codigo: "B1001", papel: "ranchef" }, { nome: "B", codigo: "B1002", papel: "ranchef" }];
  await assert.rejects(p.carregarLista(dois), /ranchef/);
  const tres = ["A", "B", "C"].map((n, i) => ({ nome: "Adm" + n, codigo: "B100" + i, papel: "admin" }));
  await assert.rejects(p.carregarLista(tres), /administradores/);
  assert.equal(db.h.size, 0);
  await p.carregarLista([{ nome: "Gordilho", codigo: "B1901" }]);
  assert.deepEqual(await p.carregarLista([{ nome: "Gordilho", codigo: "B1901", papel: "ranchef" }]), { novos: 0, existentes: 1, atualizados: 1 });
  assert.equal((await p.conferir("gordilho", "B1901")).papel, 2);
  await p.carregarLista([{ nome: "Romeo", codigo: "B1902" }]);
  assert.deepEqual(await p.carregarLista([{ nome: "Romeo", codigo: "B1902", papel: "ranchef" }]), { novos: 0, existentes: 1, atualizados: 0 });
  assert.equal((await p.conferir("romeo", "B1902")).papel, 0);
});

test("login: escolher entrar como administrador ou como aluno", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const login = require("../api/login.js");
  process.env.ACCESS_CODE = "Unidade-2026";
  process.env.ACCESS_CODE_ADMIN = "Admin-2026";
  const entrar = async (usuario, senha, modo, acesso = modo === "admin" ? "Admin-2026" : "Unidade-2026") => {
    const r = res();
    await login({ method: "POST", headers: { "sec-fetch-site": "same-origin", host: "x" }, body: { usuario, senha, acesso, modo } }, r);
    return r;
  };
  // administrador escolhendo "Administrador": sessão em modo administrador
  let r = await entrar("gordilho", "B1901", "admin");
  assert.equal(r.headers.Location, "/app");
  assert.equal(dadosCookie(r.headers["Set-Cookie"]).m, 1);
  assert.equal(dadosCookie(r.headers["Set-Cookie"]).r, "ranchef");
  assert.match(r.headers["Set-Cookie"], /Max-Age=7200/); // 2 horas
  // mesmo administrador escolhendo "Aluno": sem poderes de administrador nesta sessão
  r = await entrar("romeo", "B1902", "aluno");
  assert.equal(r.headers.Location, "/app");
  assert.equal(dadosCookie(r.headers["Set-Cookie"]).m, 0);
  assert.match(r.headers["Set-Cookie"], /Max-Age=43200/); // 12 horas
  r = await entrar("romeo", "B1902", undefined); // sem escolha = aluno
  assert.equal(dadosCookie(r.headers["Set-Cookie"]).m, 0);
  // aluno escolhendo "Administrador": recusado, sem cookie
  r = await entrar("mike", "B1903", "admin");
  assert.equal(r.headers.Location, "/?erro=nao_admin");
  assert.equal(r.headers["Set-Cookie"], undefined);
  // código errado continua recusado
  r = await entrar("gordilho", "B9999", "admin");
  assert.equal(r.headers.Location, "/?erro=1");
  // cada perfil tem o seu código de acesso: o do aluno não abre o de administrador, e vice-versa
  r = await entrar("gordilho", "B1901", "admin", "Unidade-2026");
  assert.equal(r.headers.Location, "/?erro=1");
  r = await entrar("romeo", "B1902", "aluno", "Admin-2026");
  assert.equal(r.headers.Location, "/?erro=1");
  // sem código de administrador configurado no servidor, ninguém entra como administrador
  delete process.env.ACCESS_CODE_ADMIN;
  r = await entrar("gordilho", "B1901", "admin", "Unidade-2026");
  assert.equal(r.headers.Location, "/?erro=1");
  r = await entrar("gordilho", "B1901", "aluno");
  assert.equal(r.headers.Location, "/app"); // como aluno continua entrando
  delete process.env.ACCESS_CODE;
});

test("app: Administrador no cabeçalho só em modo administrador; Sair ao final da página, não fixo", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const html = '<html><script>var x="</body></html><nav class=\\"menu\\"></main>";</script><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; connect-src \'none\'; form-action \'none\'"></head><body><header class="faixa"><nav class="menu" aria-label="Ações"><button id="nova">Nova</button></nav></header><main id="conteudo">teste</main><script>lib</script></body></html>';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(chave, "hex"), iv);
  const enc = Buffer.concat([c.update(zlib.brotliCompressSync(html)), c.final()]);
  const tmp = require("path").join(require("os").tmpdir(), "teste-app-" + process.pid + ".enc");
  fs.writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), enc]));
  process.env.APP_ENC_PATH = tmp; // nunca toca em dados/app.enc de verdade
  try {
    const app = require("../api/app.js");
    const abrir = async (cookie) => {
      const r = res();
      await app({ headers: { cookie } }, r);
      return r;
    };
    const r1 = await abrir("");
    assert.equal(r1.statusCode, 302);

    // aluno comum
    let saida = (await abrir(sessao("mike"))).body.toString();
    assert.ok(saida.startsWith('<html><script>var x="</body></html><nav class=\\"menu\\"></main>";</script>')); // texto do app intacto
    assert.ok(saida.includes('</main><div id="cg-rodape"><a href="/sair">Sair</a></div><script>globalThis.Municiamento')); // Sair no fim, depois do conteúdo
    assert.ok(saida.indexOf("Municiamento.HOSPEDADO") < saida.indexOf("<script>lib</script>")); // e antes das bibliotecas
    // no cabeçalho, o aluno tem o menu suspenso com "Conferência geral" e "Como usar"; nada de Administrador
    assert.ok(saida.includes('<nav class="menu" aria-label="Ações"><details class="menu-suspenso"><summary class="link-faixa">Menu</summary><div class="menu-suspenso-lista"><a class="menu-suspenso-item" href="#conferencia-geral" data-abrir-geral>Conferência geral</a><a class="menu-suspenso-item" href="/ajuda">Como usar</a></div></details><button id="nova">'));
    assert.ok(!saida.includes('href="/admin"'));
    assert.ok(saida.includes("/api/evento") && saida.endsWith("</body></html>"));
    assert.ok(!saida.includes("position:fixed")); // Sair não é flutuante
    assert.ok(saida.includes("connect-src 'self'") && !saida.includes("connect-src 'none'")); // só o próprio site pode receber o aviso
    assert.ok(saida.includes("style-src 'self' 'unsafe-inline'")); // e carregar o menu.css
    assert.ok(saida.includes("default-src 'none'") && saida.includes("form-action 'none'")); // o resto da regra do app continua

    // administrador em modo administrador: botão no cabeçalho; Sair continua no fim
    for (const [quem, papel] of [["gordilho", 2], ["romeo", 1]]) {
      saida = (await abrir(sessao(quem, papel))).body.toString();
      // menu suspenso: Conferência geral, Administrador e Como usar numa só entrada
      assert.ok(saida.includes('<nav class="menu" aria-label="Ações"><details class="menu-suspenso"><summary class="link-faixa">Menu</summary><div class="menu-suspenso-lista">' +
        '<a class="menu-suspenso-item" href="#conferencia-geral" data-abrir-geral>Conferência geral</a><a class="menu-suspenso-item" href="/admin">Administrador</a>' +
        '<a class="menu-suspenso-item" href="/ajuda">Como usar</a></div></details><button id="nova">'));
      assert.ok(saida.includes('<div id="cg-rodape"><a href="/sair">Sair</a></div>'));
      assert.equal(saida.split('href="/sair"').length - 1, 1); // um só Sair
    }
    // o servidor diz ao app o perfil de quem abriu (para mostrar ou esconder telas)
    const perfil = (await abrir(sessao("gordilho", 2))).body.toString();
    assert.ok(perfil.includes('Municiamento.HOSPEDADO={"perfil":"admin","nome":"Gordilho"}'));
    assert.ok(perfil.includes('classList.add("hospedado","perfil-admin")'));
    assert.ok(perfil.indexOf("Municiamento.HOSPEDADO") < perfil.indexOf("<script>lib</script>")); // antes do código do app
    const doAluno = (await abrir(sessao("mike"))).body.toString();
    assert.ok(doAluno.includes('"perfil":"aluno"') && doAluno.includes("perfil-aluno"));
    // administrador que entrou como aluno: sem o botão
    saida = (await abrir(sessao("romeo"))).body.toString();
    assert.ok(!saida.includes('href="/admin"'));

    // sessão de quem não existe (ou foi excluído) é barrada
    const r3 = await abrir(sessao("fantasma"));
    assert.equal(r3.statusCode, 302);
    assert.ok(r3.body === undefined || !String(r3.body).includes("teste"));

    // sem </main>, o Sair vai para o fim da página (ainda sem ficar fixo)
    const sem = '<html><body><nav class="menu"></nav>conteudo</body></html>';
    const iv2 = crypto.randomBytes(12);
    const c2 = crypto.createCipheriv("aes-256-gcm", Buffer.from(chave, "hex"), iv2);
    const enc2 = Buffer.concat([c2.update(zlib.brotliCompressSync(sem)), c2.final()]);
    fs.writeFileSync(tmp, Buffer.concat([iv2, c2.getAuthTag(), enc2]));
    saida = (await abrir(sessao("mike"))).body.toString();
    assert.ok(saida.includes('<div id="cg-rodape"><a href="/sair">Sair</a></div><script>globalThis.Municiamento') && saida.endsWith("</body></html>") && !saida.includes("position:fixed"));
  } finally {
    fs.rmSync(tmp, { force: true });
    delete process.env.APP_ENC_PATH;
  }
});

test("registro: só ações permitidas, só com sessão", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const evento = require("../api/evento.js");
  const e1 = res();
  await evento({ method: "POST", headers: {}, body: { acao: "baixar_pdf" } }, e1);
  assert.equal(e1.statusCode, 403);
  const e2 = res();
  await evento({ method: "POST", headers: { cookie: sessao("romeo") }, body: { acao: "inventada" } }, e2);
  assert.equal(e2.statusCode, 204);
  assert.equal(db.l.length, 0);
  const e3 = res();
  await evento({ method: "POST", headers: { cookie: sessao("romeo") }, body: { acao: "baixar_pdf" } }, e3);
  assert.equal(db.l.length, 1);
});

test("/admin: só administrador que entrou como administrador; Sair ao final", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const admin = require("../api/admin.js");
  const abrir = async (cookie) => {
    const r = res();
    await admin({ headers: { cookie }, url: "/admin" }, r);
    return r;
  };
  let r = await abrir(sessao("mike")); // aluno
  assert.equal(r.statusCode, 403);
  r = await abrir(sessao("romeo")); // administrador, mas entrou como aluno
  assert.equal(r.statusCode, 403);
  assert.ok(String(r.body).includes("Saia e entre de novo"));
  r = await abrir("");
  assert.equal(r.statusCode, 302);
  r = await abrir(sessao("mike", 1)); // cookie diz administrador, mas o banco diz aluno
  assert.equal(r.statusCode, 403);

  r = await abrir(sessao("romeo", 1));
  assert.equal(r.statusCode, 200);
  const corpo = String(r.body);
  assert.ok(corpo.includes("Pessoas com acesso (5)") && corpo.includes("Administrador ranchef"));
  assert.ok(corpo.includes("<strong>Romeo</strong>") && corpo.includes('class="selo-papel admin">Administrador<')); // nome e papel, sem texto longo
  assert.ok(!corpo.includes("Horários de Brasília; IP parcial; eventos")); // descrição antiga saiu
  assert.ok(corpo.includes("Horários de Brasília. IP parcial."));
  assert.ok(corpo.includes('<div class="rodape-sair"><a class="botao sec" href="/sair">Sair</a></div>\n</body>')); // Sair no fim
  assert.ok(!corpo.includes('<a class="link-faixa" href="/sair">')); // e não no cabeçalho
  assert.ok(!corpo.includes("/api/admin-exportar")); // backup é só do ranchef
  r = await abrir(sessao("gordilho", 2));
  assert.ok(String(r.body).includes("/api/admin-exportar") && String(r.body).includes("Tornar administrador"));
  assert.ok(String(r.body).includes("<strong>Gordilho</strong>") && String(r.body).includes('class="selo-papel ranchef">Administrador ranchef<'));
});

test("papéis: ranchef manda nos administradores; máx. 2 administradores", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const acao = require("../api/admin-acao.js");
  const chamar = async (quem, papel, corpo) => {
    const r = res();
    await acao({ method: "POST", headers: { cookie: sessao(quem, papel) }, body: corpo }, r);
    return r;
  };
  const loc = (r) => r.headers.Location;

  // aluno comum (ou administrador que entrou como aluno) não faz nada
  assert.equal((await chamar("mike", 0, { acao: "promover", nome: "tango" })).statusCode, 403);
  assert.equal((await chamar("mike", 0, { acao: "cadastrar", nome: "Novo", codigo: "B1600" })).statusCode, 403);
  assert.equal((await chamar("gordilho", 0, { acao: "promover", nome: "tango" })).statusCode, 403); // ranchef em modo aluno
  assert.equal(db.h.size, 5);

  // administrador: cadastra e exclui aluno; NÃO promove nem rebaixa
  assert.match(loc(await chamar("romeo", 1, { acao: "cadastrar", nome: "Novo Fulano", codigo: "B1600" })), /m=cadastrar/);
  assert.deepEqual(await p.conferir("NOVO fulano", "b1600"), { nome: "novo fulano", papel: 0, admin: false });
  assert.match(loc(await chamar("romeo", 1, { acao: "cadastrar", nome: "romeo", codigo: "B1700" })), /e=ja_existe/);
  assert.match(loc(await chamar("romeo", 1, { acao: "cadastrar", nome: "X", codigo: "XX" })), /e=dados_invalidos/);
  assert.match(loc(await chamar("romeo", 1, { acao: "promover", nome: "tango" })), /e=sem_permissao/);
  assert.match(loc(await chamar("romeo", 1, { acao: "rebaixar", nome: "romeo" })), /e=sem_permissao/);
  assert.equal((await p.conferir("tango", "B1904")).papel, 0);
  assert.match(loc(await chamar("romeo", 1, { acao: "remover", nome: "novo fulano" })), /m=remover/);
  assert.equal(await p.removido("novo fulano"), true);

  // ranchef promove até 2 administradores no total (romeo já é um)
  assert.match(loc(await chamar("gordilho", 2, { acao: "promover", nome: "mike" })), /m=promover/);
  assert.match(loc(await chamar("gordilho", 2, { acao: "promover", nome: "tango" })), /e=limite_admins/);
  assert.equal((await p.estado()).admins.size, 2);
  assert.equal(await p.papelAtual("mike", { m: 1 }), 1);
  assert.match(loc(await chamar("mike", 1, { acao: "promover", nome: "tango" })), /e=sem_permissao/);

  // administrador e ranchef não são excluídos; ranchef não é rebaixado; ninguém age sobre si
  assert.match(loc(await chamar("romeo", 1, { acao: "remover", nome: "mike" })), /e=e_admin/);
  assert.match(loc(await chamar("romeo", 1, { acao: "remover", nome: "gordilho" })), /e=e_ranchef/);
  assert.match(loc(await chamar("gordilho", 2, { acao: "rebaixar", nome: "gordilho" })), /e=proprio/);
  assert.match(loc(await chamar("romeo", 1, { acao: "remover", nome: "romeo" })), /e=proprio/);

  // ranchef rebaixa administrador (vale na hora) e depois pode excluir
  assert.match(loc(await chamar("gordilho", 2, { acao: "rebaixar", nome: "romeo" })), /m=rebaixar/);
  assert.equal(await p.papelAtual("romeo", { m: 1 }), 0);
  assert.equal((await chamar("romeo", 1, { acao: "cadastrar", nome: "Outro", codigo: "B1800" })).statusCode, 403); // perdeu o poder
  assert.match(loc(await chamar("gordilho", 2, { acao: "remover", nome: "romeo" })), /m=remover/);
  assert.equal(await p.removido("romeo"), true);
  assert.equal(await p.conferir("romeo", "B1902"), null);
  assert.equal((await p.estado()).ranchef, "gordilho");
});

test("backup: só o ranchef baixa; exportar e restaurar em banco vazio", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const baixarModulo = require("../api/admin-baixar.js");
  const exportar = (req, res) => baixarModulo({ ...req, url: "/api/admin-baixar?o=backup" }, res);
  const baixar = async (cookie) => {
    const r = res();
    await exportar({ method: "GET", headers: { cookie } }, r);
    return r;
  };
  assert.equal((await baixar(sessao("romeo", 1))).statusCode, 403); // administrador comum
  assert.equal((await baixar(sessao("gordilho"))).statusCode, 403); // ranchef que entrou como aluno
  const r = await baixar(sessao("gordilho", 2));
  const backup = JSON.parse(String(r.body));
  assert.equal(backup.pessoas.length, 5);
  zerar();
  assert.deepEqual(await p.importar(backup), { novos: 5, existentes: 0 });
  assert.deepEqual(await p.conferir("gordilho", "B1901"), { nome: "gordilho", papel: 2, admin: true });
  assert.deepEqual(await p.conferir("romeo", "B1902"), { nome: "romeo", papel: 1, admin: true });
  await assert.rejects(p.importar({ versao: 9 }), /inválido/);
});

test("login não quebra com Origin: null (formulário com referrer restrito) e barra outro site", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const login = require("../api/login.js");
  process.env.ACCESS_CODE = "Unidade-2026";
  const corpo = { usuario: "mike", senha: "B1903", acesso: "Unidade-2026" };
  let r = res();
  await login({ method: "POST", headers: { origin: "null", "sec-fetch-site": "same-origin", host: "x.vercel.app" }, body: corpo }, r);
  assert.equal(r.headers.Location, "/app");
  r = res();
  await login({ method: "POST", headers: { origin: "null", host: "x.vercel.app" }, body: corpo }, r);
  assert.equal(r.statusCode, 403);
  r = res();
  await login({ method: "POST", headers: { origin: "https://malicioso.com", "sec-fetch-site": "cross-site", host: "x.vercel.app" }, body: corpo }, r);
  assert.equal(r.statusCode, 403);
  r = res();
  await login({ method: "POST", headers: { origin: "https://x.vercel.app", host: "x.vercel.app" }, body: corpo }, r);
  assert.equal(r.headers.Location, "/app");
});

test("busca por código: só alunos, hash confere, administradores não são revelados", async () => {
  zerar();
  await p.carregarLista(LISTA);
  assert.deepEqual(await p.acharPorCodigo("b1903"), [{ n: "mike", d: "Mike" }]);
  assert.deepEqual(await p.acharPorCodigo("B1902"), []); // administrador: fora da busca
  assert.deepEqual(await p.acharPorCodigo("B1901"), []); // ranchef: fora da busca
  assert.deepEqual(await p.acharPorCodigo("B9999"), []);
  assert.deepEqual(await p.acharPorCodigo("lixo"), []);
  // a versão assíncrona produz o mesmo hash que a usada no login
  const v = JSON.parse(db.h.get("mike"));
  assert.equal(await s.hashCodigoAsync("B1903", v.s), v.h);
});

test("registro: filtro por nome de guerra (sem acento) ou por código de aluno", async () => {
  zerar();
  await p.carregarLista(LISTA);
  await p.cadastrar("Ângelo", "B1900");
  const fake = { headers: { "user-agent": "iPhone", "x-forwarded-for": "200.1.2.3" } };
  for (const [quem, acao] of [["mike", "login_ok"], ["mike", "baixar_pdf"], ["tango", "login_ok"], ["angelo", "login_ok"]]) await reg.registrar(fake, quem, acao);
  await reg.registrar(fake, "gordilho", "admin_cadastrou", { alvo: "mike" });
  const admin = require("../api/admin.js");
  const abrir = async (consulta, quem = "romeo") => {
    const r = res();
    await admin({ headers: { cookie: sessao(quem, 1) }, url: "/admin?u=" + encodeURIComponent(consulta) }, r);
    const corpo = String(r.body);
    const registro = corpo.slice(corpo.indexOf("Registro de eventos"));
    return { corpo, registro, quem: (n) => registro.split(`data-rotulo="Quem">${n}<`).length - 1 };
  };
  // por nome (parte do nome, sem diferenciar maiúscula)
  let r = await abrir("MIK");
  assert.equal(r.quem("mike"), 2 + 0); // login_ok + baixar_pdf
  assert.equal(r.quem("tango"), 0);
  assert.ok(r.registro.includes("Baixou PDF"));
  // inclui ações feitas sobre a pessoa por um administrador
  assert.equal(r.quem("gordilho"), 1);
  // sem acento: "angelo" acha "Ângelo" e vice-versa
  assert.equal((await abrir("ângelo")).quem("angelo"), 1);
  assert.equal((await abrir("ANGELO")).quem("angelo"), 1);
  // por código de aluno: mostra de quem é e filtra os eventos dele
  r = await abrir("b1903");
  assert.ok(r.corpo.includes("Número interno B1903: Mike."));
  assert.equal(r.quem("mike"), 2);
  assert.equal(r.quem("tango"), 0);
  // código que não é de aluno comum (administrador) ou inexistente: sem resultado e sem revelar nada
  r = await abrir("B1902");
  assert.ok(r.corpo.includes("Nenhum aluno com esse número interno") && !r.corpo.includes("Número interno B1902"));
  assert.equal(r.quem("mike") + r.quem("tango"), 0);
  r = await abrir("B0000");
  assert.ok(r.corpo.includes("Nenhum aluno com esse número interno"));
  // sem filtro: todos
  r = await abrir("");
  assert.ok(r.quem("tango") >= 1 && r.quem("mike") >= 2);
  // limite de buscas por código (contra tentar todos os códigos)
  let barrado = false;
  for (let i = 0; i < 25 && !barrado; i++) barrado = (await abrir("B1" + String(100 + i).padStart(3, "0"), "gordilho")).corpo.includes("Muitas buscas por número interno");
  assert.ok(barrado);
});

test("lista dos liberados: baixar (.txt) e copiar; só administrador; sem códigos", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const baixarLista = require("../api/admin-baixar.js");
  const lista = (req, res) => baixarLista({ ...req, url: "/api/admin-baixar?o=lista" }, res);
  const admin = require("../api/admin.js");
  const baixar = async (cookie, metodo = "GET") => {
    const r = res();
    await lista({ method: metodo, headers: { cookie } }, r);
    return r;
  };
  assert.equal((await baixar(sessao("mike"))).statusCode, 403); // aluno
  assert.equal((await baixar(sessao("romeo"))).statusCode, 403); // administrador que entrou como aluno
  assert.equal((await baixar("")).statusCode, 403);
  assert.equal((await baixar(sessao("romeo", 1), "POST")).statusCode, 403);

  for (const [quem, papel] of [["romeo", 1], ["gordilho", 2]]) {
    const r = await baixar(sessao(quem, papel));
    assert.equal(r.statusCode ?? 200, 200);
    assert.match(r.headers["Content-Disposition"], /^attachment; filename="liberados-\d{4}-\d{2}-\d{2}\.txt"$/);
    assert.match(r.headers["Content-Type"], /^text\/plain; charset=utf-8/);
    const texto = String(r.body);
    assert.ok(texto.startsWith("\uFEFFConferência CIAGA - Pessoas liberadas"));
    const linhas = texto.split("\n");
    assert.ok(linhas.some((l) => l === "Total: 5"));
    assert.ok(texto.includes("1. Gordilho (Administrador ranchef)\n2. Romeo (Administrador)\n3. Ana Lima (Aluno)\n4. Mike (Aluno)\n5. Tango (Aluno)")); // papéis e ordem alfabética
    assert.ok(!/B\d{4}/.test(texto)); // nenhum código de aluno na lista
  }
  // a tela tem os botões de baixar e copiar, com o mesmo texto, e carrega só o script do próprio site
  const r = res();
  await admin({ headers: { cookie: sessao("romeo", 1) }, url: "/admin" }, r);
  const corpo = String(r.body);
  assert.ok(corpo.includes('href="/api/admin-lista"') && corpo.includes("data-copiar"));
  assert.ok(corpo.includes('data-texto="Conferência CIAGA - Pessoas liberadas'));
  assert.ok(corpo.includes("1. Gordilho (Administrador ranchef)"));
  assert.ok(corpo.includes('<script src="/painel.js"></script>'));
  assert.ok(!/<script>/.test(corpo) && !/ style="/.test(corpo)); // sem script nem estilo inline (CSP rígida)
});

// ---------------------------------------------------------------- cofre, planilha da semana e rascunho

const NOMES_DA_PLANILHA = ["ALVES", "ÂNGELO", "Beatriz Lima", "Davi Rocha", "B12.1", "B12.2"];
const planilhaPronta = () => ({
  v: 1, formato: "XLSX", sexta: "2026-10-23",
  turmas: [["B12.1", 2, "aba B12.1"], ["B12.2", 2, "aba B12.2"]],
  avisos: [["Beatriz Lima (B12.2): aluno sem marcações", 0]],
  alunos: [["ALVES", "B1037", "B12.1", 5], ["ÂNGELO", "B1074", "B12.1", 0], ["Beatriz Lima", "B1185", "B12.2", 134217727], ["Davi Rocha", "B1259", "B12.2", 12]],
});

test("cofre: cifra, só abre com a chave certa e no contexto certo", () => {
  const c = require("../api/_lib/cofre.js");
  const obj = { nome: "ALVES", marcas: [1, 2, 3] };
  const blob = c.cifrar(obj, "planilha");
  assert.ok(blob.startsWith("v1.") && !blob.includes("ALVES"));
  assert.deepEqual(c.abrir(blob, "planilha"), obj);
  assert.throws(() => c.abrir(blob, "rascunho:romeo")); // outro contexto: não abre (não dá para trocar blobs de lugar)
  const original = process.env.DATA_KEY;
  process.env.DATA_KEY = crypto.randomBytes(32).toString("hex");
  assert.throws(() => c.abrir(blob, "planilha")); // outra chave: não abre
  process.env.DATA_KEY = original;
  const adulterado = blob.slice(0, -6) + (blob.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA");
  assert.throws(() => c.abrir(adulterado, "planilha"));
  assert.equal(c.abrir(null, "planilha"), null);
  process.env.DATA_KEY = "curta";
  assert.throws(() => c.cifrar(obj, "planilha"), /DATA_KEY/);
  process.env.DATA_KEY = original;
  // o nome da pessoa não aparece na chave do banco
  assert.ok(!c.chaveRascunho("romeo").includes("romeo") && /^r:[0-9a-f]{32}$/.test(c.chaveRascunho("romeo")));
});

test("planilha da semana: só administrador publica; todos leem; nada legível no banco", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const api = require("../api/planilha.js");
  const chamar = async (cookie, metodo = "GET", body) => {
    const r = res();
    await api({ method: metodo, headers: { cookie, "sec-fetch-site": "same-origin" }, body }, r);
    return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
  };
  // sem sessão
  assert.equal((await chamar("")).status, 401);
  // ainda não há planilha
  assert.equal((await chamar(sessao("mike"))).status, 404);
  // aluno (e administrador que entrou como aluno) não publica
  assert.equal((await chamar(sessao("mike"), "POST", { dados: planilhaPronta() })).status, 403);
  assert.equal((await chamar(sessao("romeo"), "POST", { dados: planilhaPronta() })).status, 403);
  assert.equal((await chamar(sessao("mike", 1), "POST", { dados: planilhaPronta() })).status, 403); // cookie diz admin, banco diz aluno
  assert.equal(db.s.size, 0);
  // administrador em sessão de administrador publica
  let r = await chamar(sessao("romeo", 1), "POST", { dados: planilhaPronta() });
  assert.equal(r.status, 200);
  assert.ok(r.json.ok && r.json.id.length === 16 && r.json.por === "Romeo");
  // fica no banco cifrado, com validade de 14 dias
  assert.equal(db.s.size, 1);
  assert.equal(db.ttl.get("planilha"), 14 * 24 * 60 * 60);
  const tudoNoBanco = JSON.stringify([[...db.s], [...db.h], db.l]);
  for (const n of NOMES_DA_PLANILHA) assert.ok(!tudoNoBanco.includes(n), "legível no banco: " + n);
  assert.ok(!/B1037|B1074|B1185|B1259/.test(tudoNoBanco)); // códigos de aluno também não
  // todos os usuários logados leem a planilha publicada
  for (const quem of ["mike", "tango", "romeo"]) {
    r = await chamar(sessao(quem));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.dados, planilhaPronta());
    assert.equal(r.json.por, "Romeo");
  }
  // quem foi excluído perde o acesso à planilha
  assert.equal((await chamar(sessao("fantasma"))).status, 401);
  // dados inválidos ou grandes demais são recusados
  assert.equal((await chamar(sessao("romeo", 1), "POST", { dados: { v: 1 } })).status, 400);
  assert.equal((await chamar(sessao("romeo", 1), "POST", { dados: { ...planilhaPronta(), alunos: [["A", "B1", "B12.1", -1]] } })).status, 400);
  assert.equal((await chamar(sessao("romeo", 1), "POST", {})).status, 400);
  const enorme = { ...planilhaPronta(), avisos: Array.from({ length: 2000 }, () => ["x".repeat(590), 0]),
    alunos: Array.from({ length: 3000 }, (_, i) => ["Nome " + "y".repeat(100) + i, "B" + String(1000 + (i % 9000)), "B12.1", i]) };
  assert.equal((await chamar(sessao("romeo", 1), "POST", { dados: enorme })).status, 413);
  // origem de outro site é recusada
  const r2 = res();
  await api({ method: "POST", headers: { cookie: sessao("romeo", 1), "sec-fetch-site": "cross-site" }, body: { dados: planilhaPronta() } }, r2);
  assert.equal(r2.statusCode, 403);
  // só administrador remove a planilha publicada
  assert.equal((await chamar(sessao("mike"), "DELETE")).status, 403);
  assert.equal((await chamar(sessao("romeo", 1), "DELETE")).status, 200);
  assert.equal((await chamar(sessao("tango"))).status, 404);
  // o registro guarda só quem publicou, nada da planilha
  const log = db.l.join("|");
  assert.ok(log.includes("admin_publicou_planilha") && log.includes("admin_removeu_planilha"));
  for (const n of NOMES_DA_PLANILHA) assert.ok(!log.includes(n));
});

test("rascunho: individual, cifrado e temporário; um não lê o do outro", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const api = require("../api/rascunho.js");
  const cofre = require("../api/_lib/cofre.js");
  const chamar = async (cookie, metodo = "GET", body) => {
    const r = res();
    await api({ method: metodo, headers: { cookie, "sec-fetch-site": "same-origin" }, body }, r);
    return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
  };
  const rascunho = (planilha, marcados) => ({ v: 1, planilha, sexta: "2026-10-23", ativa: 1, proximoId: 2,
    listas: [{ id: 1, dia: "Sexta", refeicao: "Café", ano: "1", marcados, finalizada: false }] });
  assert.equal((await chamar("")).status, 401);
  assert.equal((await chamar(sessao("romeo"))).status, 404);
  // cada pessoa salva o seu
  assert.equal((await chamar(sessao("romeo"), "PUT", rascunho("p1", ["B12.1|B1037|ALVES"]))).status, 200);
  assert.equal((await chamar(sessao("mike"), "PUT", rascunho("p1", ["B12.2|B1185|Beatriz Lima"]))).status, 200);
  assert.equal(db.s.size, 2);
  assert.deepEqual((await chamar(sessao("romeo"))).json.dados.listas[0].marcados, ["B12.1|B1037|ALVES"]);
  assert.deepEqual((await chamar(sessao("mike"))).json.dados.listas[0].marcados, ["B12.2|B1185|Beatriz Lima"]);
  assert.equal((await chamar(sessao("tango"))).status, 404); // quem não salvou não vê o de ninguém
  // no banco: cifrado, sem nomes (nem de quem salvou), com validade de 7 dias
  const tudoNoBanco = JSON.stringify([[...db.s], db.l]);
  assert.ok(!tudoNoBanco.includes("ALVES") && !tudoNoBanco.includes("Beatriz") && !tudoNoBanco.includes("B1037"));
  assert.ok(![...db.s.keys()].some((k) => /romeo|mike/.test(k)));
  assert.ok([...db.ttl.values()].every((v) => v === 7 * 24 * 60 * 60));
  // o blob de uma pessoa, colocado no lugar da outra, não abre
  db.s.set(cofre.chaveRascunho("mike"), db.s.get(cofre.chaveRascunho("romeo")));
  assert.equal((await chamar(sessao("mike"))).status, 404); // adulterado: recomeça do zero, sem travar
  // inválido e grande demais
  assert.equal((await chamar(sessao("romeo"), "PUT", { v: 1 })).status, 400);
  assert.equal((await chamar(sessao("romeo"), "PUT", rascunho("p1", Array.from({ length: 20000 }, (_, i) => "B12.1|B" + i + "|Aluno Numero " + i)))).status, 413);
  // limpar apaga o rascunho
  assert.equal((await chamar(sessao("romeo"), "DELETE")).status, 200);
  assert.equal((await chamar(sessao("romeo"))).status, 404);
  // origem de outro site é recusada; excluído não salva
  const r = res();
  await api({ method: "PUT", headers: { cookie: sessao("romeo"), "sec-fetch-site": "cross-site" }, body: rascunho("p1", []) }, r);
  assert.equal(r.statusCode, 403);
  assert.equal((await chamar(sessao("fantasma"), "PUT", rascunho("p1", []))).status, 401);
  // não vai para o registro de eventos
  assert.ok(!db.l.join("|").includes("rascunho"));
});

test("painel: cartão da planilha publicada (quem e quando, sem nomes) e remover", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const planilha = require("../api/planilha.js");
  const admin = require("../api/admin.js");
  const acao = require("../api/admin-acao.js");
  const abrir = async () => {
    const r = res();
    await admin({ headers: { cookie: sessao("romeo", 1) }, url: "/admin" }, r);
    return String(r.body);
  };
  // sem planilha publicada
  assert.ok((await abrir()).includes("Nenhuma planilha publicada"));
  // publica
  const r1 = res();
  await planilha({ method: "POST", headers: { cookie: sessao("romeo", 1), "sec-fetch-site": "same-origin" }, body: { dados: planilhaPronta() } }, r1);
  assert.equal(r1.statusCode, 200);
  const corpo = await abrir();
  assert.ok(corpo.includes("Publicada por <strong>Romeo</strong>") && corpo.includes('value="limpar_planilha"'));
  for (const n of NOMES_DA_PLANILHA) assert.ok(!corpo.includes(n), "nome de aluno no painel: " + n); // o painel não mostra a planilha
  // aluno comum não remove; administrador remove
  const r2 = res();
  await acao({ method: "POST", headers: { cookie: sessao("mike"), "sec-fetch-site": "same-origin" }, body: { acao: "limpar_planilha" } }, r2);
  assert.equal(r2.statusCode, 403);
  assert.equal(db.s.size, 1);
  const r3 = res();
  await acao({ method: "POST", headers: { cookie: sessao("romeo", 1), "sec-fetch-site": "same-origin" }, body: { acao: "limpar_planilha" } }, r3);
  assert.match(r3.headers.Location, /m=limpar_planilha/);
  assert.equal(db.s.size, 0);
  assert.ok((await abrir()).includes("Nenhuma planilha publicada"));
});

// ---------------------------------------------------------------- troca dos códigos de acesso pelo painel

test("códigos de acesso no banco: valem no lugar da Vercel, só como hash, e precisam ser diferentes", async () => {
  zerar();
  const ac = require("../api/_lib/acessos.js");
  process.env.ACCESS_CODE = "Aluno-da-Vercel";
  process.env.ACCESS_CODE_ADMIN = "Admin-da-Vercel";
  // sem troca feita: vale a variável da Vercel
  assert.equal(await ac.conferir("Aluno-da-Vercel", false), true);
  assert.equal(await ac.conferir("Admin-da-Vercel", true), true);
  assert.equal(await ac.conferir("Admin-da-Vercel", false), false);
  assert.deepEqual(await ac.situacao(false), { origem: "vercel", configurado: true });
  // regras da troca
  assert.deepEqual(await ac.definir(false, "curto", "Romeo"), { erro: "codigo_curto" });
  assert.deepEqual(await ac.definir(false, "x".repeat(65), "Romeo"), { erro: "codigo_curto" });
  assert.deepEqual(await ac.definir(false, "Admin-da-Vercel", "Romeo"), { erro: "codigo_igual_outro" }); // já é o dos administradores
  assert.deepEqual(await ac.definir(false, "  Aluno-Novo-2027  ", "Romeo"), { ok: true }); // espaços nas pontas não contam
  // depois da troca: só vale o novo
  assert.equal(await ac.conferir("Aluno-Novo-2027", false), true);
  assert.equal(await ac.conferir("aluno-novo-2027", false), false); // diferencia maiúscula
  assert.equal(await ac.conferir("Aluno-da-Vercel", false), false); // o antigo deixa de valer
  assert.equal(await ac.conferir("Admin-da-Vercel", true), true); // o outro perfil não muda
  const sit = await ac.situacao(false);
  assert.equal(sit.origem, "painel");
  assert.equal(sit.por, "Romeo");
  // a mesma regra vale no outro sentido, também contra o código já trocado
  assert.deepEqual(await ac.definir(true, "Aluno-Novo-2027", "Gordilho"), { erro: "codigo_igual_outro" });
  assert.deepEqual(await ac.definir(true, "Admin-Novo-2027", "Gordilho"), { ok: true });
  assert.equal(await ac.conferir("Admin-Novo-2027", true), true);
  assert.equal(await ac.conferir("Admin-da-Vercel", true), false);
  // no banco só há hash: nenhum dos códigos aparece em texto
  const tudo = JSON.stringify([...db.s]);
  assert.ok(!/Aluno-Novo|Admin-Novo|aluno-novo/i.test(tudo));
  assert.ok(tudo.includes('\\"h\\"') && tudo.includes('\\"s\\"'));
  // o hash de um perfil não serve para o outro (o perfil entra no cálculo)
  const g = JSON.parse(db.s.get("acesso:aluno"));
  assert.notEqual(s.hashAcesso("admin", "Aluno-Novo-2027", g.s).split("$")[2], g.h);
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("login usa o código trocado no painel", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const ac = require("../api/_lib/acessos.js");
  const login = require("../api/login.js");
  process.env.ACCESS_CODE = "Aluno-da-Vercel";
  process.env.ACCESS_CODE_ADMIN = "Admin-da-Vercel";
  const entrar = async (usuario, senha, modo, acesso) => {
    const r = res();
    await login({ method: "POST", headers: { "sec-fetch-site": "same-origin", host: "x" }, body: { usuario, senha, acesso, modo } }, r);
    return r.headers.Location;
  };
  assert.equal(await entrar("mike", "B1903", "aluno", "Aluno-da-Vercel"), "/app");
  await ac.definir(false, "Aluno-Novo-2027", "Romeo");
  assert.equal(await entrar("mike", "B1903", "aluno", "Aluno-da-Vercel"), "/?erro=1"); // o antigo não entra mais
  assert.equal(await entrar("mike", "B1903", "aluno", "Aluno-Novo-2027"), "/app");
  assert.equal(await entrar("gordilho", "B1901", "admin", "Admin-da-Vercel"), "/app"); // o dos administradores segue o da Vercel
  assert.equal(await entrar("gordilho", "B1901", "admin", "Aluno-Novo-2027"), "/?erro=1");
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("painel: quem pode trocar qual código, com confirmação e limite de tentativas", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const acao = require("../api/admin-acao.js");
  const admin = require("../api/admin.js");
  const ac = require("../api/_lib/acessos.js");
  process.env.ACCESS_CODE = "Aluno-da-Vercel";
  process.env.ACCESS_CODE_ADMIN = "Admin-da-Vercel";
  const trocar = async (quem, papel, corpo) => {
    const r = res();
    await acao({ method: "POST", headers: { cookie: sessao(quem, papel), "sec-fetch-site": "same-origin" }, body: corpo }, r);
    return r;
  };
  const dados = (acaoNome, novo, repetir = novo, confirmar = "B1902") => ({ acao: acaoNome, novo, repetir, confirmar });
  const loc = (r) => r.headers.Location;

  // aluno comum ou administrador em modo aluno: nada
  assert.equal((await trocar("mike", 0, dados("codigo_aluno", "Aluno-Novo-2027", undefined, "B1903"))).statusCode, 403);
  assert.equal((await trocar("romeo", 0, dados("codigo_aluno", "Aluno-Novo-2027"))).statusCode, 403);
  assert.equal(db.s.size, 0);
  // administrador troca o código dos alunos, mas não o dos administradores
  assert.match(loc(await trocar("romeo", 1, dados("codigo_admin", "Admin-Novo-2027"))), /e=sem_permissao/);
  assert.equal(await ac.conferir("Admin-da-Vercel", true), true);
  // confirmação com o código de aluno de quem troca
  assert.match(loc(await trocar("romeo", 1, dados("codigo_aluno", "Aluno-Novo-2027", undefined, "B9999"))), /e=confirmacao/);
  assert.match(loc(await trocar("romeo", 1, dados("codigo_aluno", "Aluno-Novo-2027", "Outro-Diferente-1"))), /e=codigo_diferente/);
  assert.match(loc(await trocar("romeo", 1, dados("codigo_aluno", "curto"))), /e=codigo_curto/);
  assert.match(loc(await trocar("romeo", 1, dados("codigo_aluno", "Admin-da-Vercel"))), /e=codigo_igual_outro/);
  assert.equal(db.s.size, 0); // nada mudou até aqui
  assert.match(loc(await trocar("romeo", 1, dados("codigo_aluno", "Aluno-Novo-2027"))), /m=codigo_aluno/);
  assert.equal(await ac.conferir("Aluno-Novo-2027", false), true);
  // o ranchef troca o dos administradores
  assert.match(loc(await trocar("gordilho", 2, dados("codigo_admin", "Admin-Novo-2027", undefined, "B1901"))), /m=codigo_admin/);
  assert.equal(await ac.conferir("Admin-Novo-2027", true), true);
  // o painel mostra quem trocou e quando, nunca o código; o administrador comum não vê o formulário do outro código
  const ver = async (quem, papel) => {
    const r = res();
    await admin({ headers: { cookie: sessao(quem, papel) }, url: "/admin" }, r);
    return String(r.body);
  };
  const doRanchef = await ver("gordilho", 2);
  assert.ok(doRanchef.includes("Senha dos alunos") && doRanchef.includes('value="codigo_admin"') && doRanchef.includes("Trocada por"));
  assert.ok(!/Aluno-Novo|Admin-Novo|Aluno-da-Vercel|Admin-da-Vercel/.test(doRanchef));
  const doAdmin = await ver("romeo", 1);
  assert.ok(doAdmin.includes('value="codigo_aluno"') && !doAdmin.includes('value="codigo_admin"') && doAdmin.includes("Só o administrador ranchef troca esta senha"));
  // o registro guarda só o evento (sem o código)
  const log = db.l.join("|");
  assert.ok(log.includes("admin_mudou_codigo_aluno") && log.includes("admin_mudou_codigo_admin") && !/Novo-2027/.test(log));
  // limite de tentativas (errar a confirmação várias vezes trava por um tempo)
  // (o romeo já fez 5 tentativas acima: a sexta, mesmo com tudo certo, é barrada; o limite é por pessoa)
  assert.match(loc(await trocar("romeo", 1, dados("codigo_aluno", "Mais-Uma-Troca-1"))), /e=limite/);
  assert.equal(await ac.conferir("Mais-Uma-Troca-1", false), false);
  assert.match(loc(await trocar("gordilho", 2, dados("codigo_aluno", "Outra-Troca-2027", undefined, "B1901"))), /m=codigo_aluno/);
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("app: a página vai comprimida (brotli ou gzip) quando o navegador aceita, e igual sem compressão", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const html = "<html><body><header class=\"faixa\"><nav class=\"menu\"></nav></header><main id=\"conteudo\">" + "texto do app ".repeat(3000) + "</main></body></html>";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(chave, "hex"), iv);
  const enc = Buffer.concat([c.update(zlib.brotliCompressSync(html)), c.final()]);
  const tmp = require("path").join(require("os").tmpdir(), "teste-zip-" + process.pid + ".enc");
  fs.writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), enc]));
  process.env.APP_ENC_PATH = tmp;
  try {
    const app = require("../api/app.js");
    const abrir = async (aceita) => {
      const r = res();
      await app({ headers: { cookie: sessao("mike"), ...(aceita ? { "accept-encoding": aceita } : {}) } }, r);
      return r;
    };
    const puro = await abrir();
    const texto = puro.body.toString("utf8");
    assert.ok(texto.includes("texto do app") && !puro.headers["Content-Encoding"]);
    assert.equal(puro.headers["Content-Length"], puro.body.length);
    const br = await abrir("gzip, deflate, br");
    assert.equal(br.headers["Content-Encoding"], "br");
    assert.equal(zlib.brotliDecompressSync(br.body).toString("utf8"), texto);
    assert.ok(br.body.length < puro.body.length / 3); // bem menor
    const gz = await abrir("gzip, deflate");
    assert.equal(gz.headers["Content-Encoding"], "gzip");
    assert.equal(zlib.gunzipSync(gz.body).toString("utf8"), texto);
    assert.equal(br.headers.Vary, "Accept-Encoding");
  } finally {
    fs.rmSync(tmp, { force: true });
    delete process.env.APP_ENC_PATH;
  }
});

test("sem código de acesso definido, ninguém entra; o painel avisa (ex.: variável com o nome errado)", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const login = require("../api/login.js");
  const admin = require("../api/admin.js");
  delete process.env.ACCESS_CODE;
  process.env.ACESS_CODE = "nome-errado-na-vercel"; // o erro de digitação que apareceu na Vercel
  process.env.ACCESS_CODE_ADMIN = "Admin-2026";
  const entrar = async (usuario, senha, modo, acesso) => {
    const r = res();
    await login({ method: "POST", headers: { "sec-fetch-site": "same-origin", host: "x", "x-forwarded-for": "9.9.9.9" }, body: { usuario, senha, acesso, modo } }, r);
    return r.headers.Location;
  };
  assert.equal(await entrar("mike", "B1903", "aluno", ""), "/?erro=1");
  assert.equal(await entrar("mike", "B1903", "aluno", "nome-errado-na-vercel"), "/?erro=1");
  assert.equal(await entrar("gordilho", "B1901", "admin", "Admin-2026"), "/app"); // administrador entra e pode corrigir
  const r = res();
  await admin({ headers: { cookie: sessao("gordilho", 2) }, url: "/admin" }, r);
  assert.ok(String(r.body).includes("ATENÇÃO: não há senha definida"));
  // definido pelo painel, o aluno passa a entrar
  const ac = require("../api/_lib/acessos.js");
  assert.deepEqual(await ac.definir(false, "Aluno-Novo-2027", "Gordilho"), { ok: true });
  assert.equal(await entrar("mike", "B1903", "aluno", "Aluno-Novo-2027"), "/app");
  delete process.env.ACESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("Como usar: página dentro do site, só para quem entrou; parte de administrador só para administradores", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const ajuda = require("../api/ajuda.js");
  const abrir = async (cookie) => {
    const r = res();
    await ajuda({ headers: { cookie } }, r);
    return r;
  };
  // sem sessão ou excluído: volta para o login
  assert.equal((await abrir("")).statusCode, 302);
  assert.equal((await abrir(sessao("fantasma"))).statusCode, 302);
  // aluno: guia completo de uso, sem a parte de administrador
  let r = await abrir(sessao("mike"));
  assert.equal(r.statusCode, 200);
  let corpo = String(r.body);
  for (const t of ["Entrar no sistema", "A planilha da semana", "Montar uma lista", "Marcar quem veio", "Lista para marcar no papel", "Finalizar e gerar a rela", "Salvamento automático e limpeza", "Deu algum problema"]) {
    assert.ok(corpo.includes(t), "falta a seção: " + t);
  }
  assert.ok(corpo.includes("<strong>NÃO Municiados</strong>") && !corpo.includes("Só NÃO") && corpo.includes("Limpar marcações e dados"));
  assert.ok(!corpo.includes("Publicar para os alunos") && !corpo.includes("Senhas de acesso") && !corpo.includes("guia-admin"));
  assert.ok(corpo.includes("Você é administrador? Entre como"));
  assert.ok(corpo.includes('<div class="rodape-sair">')); // Sair no fim da página
  assert.ok(corpo.includes("/tema.css") && !/<script>/.test(corpo) && !/ style="/.test(corpo)); // mesmo tema; sem script nem estilo embutido
  assert.equal(r.headers["Content-Security-Policy"].includes("script-src 'self'"), true);
  // administrador que entrou como aluno: também só o guia comum
  corpo = String((await abrir(sessao("romeo"))).body);
  assert.ok(!corpo.includes("guia-admin"));
  // administrador em sessão de administrador: guia comum + parte de administrador
  corpo = String((await abrir(sessao("romeo", 1))).body);
  for (const t of ["Administradores: entrar e publicar a planilha", "Administradores: o painel", "Administradores: senhas de acesso", "Administradores: papéis", "Publicar para os alunos"]) {
    assert.ok(corpo.includes(t), "falta a seção de administrador: " + t);
  }
  assert.ok(corpo.includes('href="#admin-painel"') && corpo.includes('href="/admin"') && !corpo.includes("Você é administrador? Entre como"));
  // cada link do índice aponta para uma seção que existe
  for (const [, id] of corpo.matchAll(/href="#([a-z-]+)"/g)) assert.ok(corpo.includes(`id="${id}"`), "índice quebrado: " + id);
});

test("Como usar muda de página (não abre aba nova) a partir do app e do painel", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const admin = require("../api/admin.js");
  const r = res();
  await admin({ headers: { cookie: sessao("romeo", 1) }, url: "/admin" }, r);
  assert.ok(String(r.body).includes('<a class="menu-suspenso-item" href="/app">Voltar ao app</a><a class="menu-suspenso-item" href="/ajuda">Como usar</a>'));
  assert.ok(String(r.body).includes('<details class="menu-suspenso"><summary class="link-faixa">Menu</summary>'));
});

test("ranchef transfere o cargo a outra pessoa e vira administrador; sempre um só ranchef", async () => {
  zerar();
  await p.carregarLista(LISTA); // gordilho = ranchef; romeo = administrador
  const acao = require("../api/admin-acao.js");
  const admin = require("../api/admin.js");
  const chamar = async (quem, papel, corpo) => {
    const r = res();
    await acao({ method: "POST", headers: { cookie: sessao(quem, papel), "sec-fetch-site": "same-origin" }, body: corpo }, r);
    return r;
  };
  const loc = (r) => r.headers.Location;
  const transferir = (quem, papel, nome, confirmar) => chamar(quem, papel, { acao: "transferir_ranchef", nome, confirmar });
  const cargos = async () => {
    const st = await p.estado();
    return { ranchef: st.ranchef, admins: [...st.admins].sort() };
  };

  assert.deepEqual(await cargos(), { ranchef: "gordilho", admins: ["romeo"] });
  // quem não é ranchef não transfere (administrador comum, aluno, ou ranchef que entrou como aluno)
  assert.match(loc(await transferir("romeo", 1, "mike", "B1902")), /e=sem_permissao/);
  assert.equal((await transferir("mike", 0, "tango", "B1903")).statusCode, 403);
  assert.equal((await transferir("gordilho", 0, "romeo", "B1901")).statusCode, 403);
  assert.deepEqual(await cargos(), { ranchef: "gordilho", admins: ["romeo"] });
  // confirmação com o código de aluno de quem transfere; não a si mesmo; pessoa que existe
  assert.match(loc(await transferir("gordilho", 2, "romeo", "B9999")), /e=confirmacao/);
  assert.match(loc(await transferir("gordilho", 2, "gordilho", "B1901")), /e=proprio/);
  assert.match(loc(await transferir("gordilho", 2, "ninguem", "B1901")), /e=nao_encontrado/);
  assert.deepEqual(await cargos(), { ranchef: "gordilho", admins: ["romeo"] });

  // o painel só oferece a transferência ao ranchef
  const ver = async (quem, papel) => {
    const r = res();
    await admin({ headers: { cookie: sessao(quem, papel) }, url: "/admin" }, r);
    return String(r.body);
  };
  let painel = await ver("gordilho", 2);
  assert.ok(painel.includes('value="transferir_ranchef"') && painel.includes("Transferir o cargo de ranchef"));
  assert.ok(painel.includes('<option value="romeo">Romeo (Administrador)</option>') && !painel.includes('<option value="gordilho">')); // não oferece a si mesmo
  assert.ok(!(await ver("romeo", 1)).includes('value="transferir_ranchef"'));

  // transfere para um administrador: troca de lugar, o total de administradores não muda
  assert.match(loc(await transferir("gordilho", 2, "romeo", "B1901")), /m=transferir_ranchef/);
  assert.deepEqual(await cargos(), { ranchef: "romeo", admins: ["gordilho"] });
  assert.equal(await p.papelAtual("gordilho", { m: 1 }), 1); // quem transferiu agora é administrador
  assert.equal(await p.papelAtual("romeo", { m: 1 }), 2);
  // o ex-ranchef perde o poder sobre administradores e a transferência; o novo ranchef passa a tê-los
  assert.match(loc(await chamar("gordilho", 1, { acao: "promover", nome: "mike" })), /e=sem_permissao/);
  assert.match(loc(await transferir("gordilho", 1, "mike", "B1901")), /e=sem_permissao/);
  assert.match(loc(await chamar("romeo", 2, { acao: "promover", nome: "mike" })), /m=promover/);
  assert.deepEqual(await cargos(), { ranchef: "romeo", admins: ["gordilho", "mike"] });
  // e agora o painel do ex-ranchef não tem mais o cartão, e o do novo ranchef tem
  assert.ok(!(await ver("gordilho", 1)).includes('value="transferir_ranchef"'));
  painel = await ver("romeo", 2);
  assert.ok(painel.includes('value="transferir_ranchef"') && !painel.includes('<option value="romeo">'));

  // para um aluno: só se couber mais um administrador (limite de 2, além do ranchef)
  assert.match(loc(await transferir("romeo", 2, "tango", "B1902")), /e=limite_admins_transferir/);
  assert.deepEqual(await cargos(), { ranchef: "romeo", admins: ["gordilho", "mike"] });
  assert.match(loc(await chamar("romeo", 2, { acao: "rebaixar", nome: "mike" })), /m=rebaixar/);
  assert.match(loc(await transferir("romeo", 2, "tango", "B1902")), /m=transferir_ranchef/);
  assert.deepEqual(await cargos(), { ranchef: "tango", admins: ["gordilho", "romeo"] });
  assert.equal((await p.conferir("tango", "B1904")).papel, 2);
  // sempre exatamente um ranchef, e os códigos de aluno de ninguém mudaram
  const st = await p.estado();
  assert.equal([...st.pessoas.values()].filter((v) => v.adm === 2).length, 1);
  assert.equal((await p.conferir("gordilho", "B1901")).papel, 1);
  // o registro guarda quem transferiu para quem (sem códigos)
  const log = db.l.join("|");
  assert.ok(log.includes("admin_transferiu_ranchef") && !/B1901|B1902|B1904/.test(log));
});

test("ex-ranchef que virou administrador continua entrando e pode ser rebaixado pelo novo ranchef", async () => {
  zerar();
  await p.carregarLista(LISTA);
  assert.deepEqual(await p.transferirRanchef("romeo", "gordilho"), { ok: true, nome: "romeo" });
  assert.deepEqual(await p.conferir("gordilho", "B1901"), { nome: "gordilho", papel: 1, admin: true });
  assert.deepEqual(await p.rebaixar("gordilho", "romeo"), { ok: true, nome: "gordilho" });
  assert.equal((await p.conferir("gordilho", "B1901")).papel, 0);
  // só o ranchef atual pode chamar a função
  assert.deepEqual(await p.transferirRanchef("mike", "mike"), { erro: "proprio" });
  assert.deepEqual(await p.transferirRanchef("gordilho", "tango"), { erro: "sem_permissao" });
});

test("sem ranchef: um administrador assume o cargo (só nesse caso); o painel não cita a Vercel", async () => {
  zerar();
  // lista carregada só com administradores (sem ranchef), como pode ter acontecido na primeira carga
  await p.carregarLista([
    { nome: "Gordilho", codigo: "B1901", papel: "admin" },
    { nome: "Romeo", codigo: "B1902", papel: "admin" },
    { nome: "Mike", codigo: "B1903" },
  ]);
  assert.equal((await p.estado()).ranchef, null);
  const acao = require("../api/admin-acao.js");
  const admin = require("../api/admin.js");
  process.env.ACCESS_CODE = "Aluno-Qualquer-1";
  process.env.ACCESS_CODE_ADMIN = "Admin-Qualquer-1";
  const chamar = async (quem, papel, corpo) => {
    const r = res();
    await acao({ method: "POST", headers: { cookie: sessao(quem, papel), "sec-fetch-site": "same-origin" }, body: corpo }, r);
    return r;
  };
  const loc = (r) => r.headers.Location;
  const ver = async (quem, papel) => {
    const r = res();
    await admin({ headers: { cookie: sessao(quem, papel) }, url: "/admin" }, r);
    return String(r.body);
  };

  // o cartão aparece para administrador (e só enquanto não há ranchef); aluno não vê nem consegue
  let painel = await ver("gordilho", 1);
  assert.ok(painel.includes("Não há administrador ranchef") && painel.includes('value="assumir_ranchef"'));
  assert.ok(!/Vercel|variável|DATA_KEY|ACCESS_CODE/.test(painel)); // nenhum texto técnico de infraestrutura
  assert.equal((await chamar("mike", 0, { acao: "assumir_ranchef", confirmar: "B1903" })).statusCode, 403);
  assert.equal((await p.estado()).ranchef, null);
  // confirmação com o código de aluno de quem assume
  assert.match(loc(await chamar("gordilho", 1, { acao: "assumir_ranchef", confirmar: "B9999" })), /e=confirmacao/);
  assert.equal((await p.estado()).ranchef, null);
  // assume: vira ranchef e deixa de ser administrador comum
  assert.match(loc(await chamar("gordilho", 1, { acao: "assumir_ranchef", confirmar: "B1901" })), /m=assumir_ranchef/);
  let st = await p.estado();
  assert.equal(st.ranchef, "gordilho");
  assert.deepEqual([...st.admins], ["romeo"]);
  assert.equal((await p.conferir("gordilho", "B1901")).papel, 2);
  // depois disso, ninguém mais assume (só a transferência do ranchef); o cartão some
  assert.match(loc(await chamar("romeo", 1, { acao: "assumir_ranchef", confirmar: "B1902" })), /e=ja_tem_ranchef/);
  assert.ok(!(await ver("romeo", 1)).includes('value="assumir_ranchef"'));
  assert.ok((await ver("gordilho", 2)).includes('value="transferir_ranchef"'));
  // e a transferência continua valendo: o ranchef passa o cargo e vira administrador
  assert.match(loc(await chamar("gordilho", 2, { acao: "transferir_ranchef", nome: "romeo", confirmar: "B1901" })), /m=transferir_ranchef/);
  st = await p.estado();
  assert.equal(st.ranchef, "romeo");
  assert.deepEqual([...st.admins], ["gordilho"]);
  // o registro guarda o evento
  assert.ok(db.l.join("|").includes("admin_assumiu_ranchef"));
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("textos do cartão de códigos de acesso: sem Vercel", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const admin = require("../api/admin.js");
  const ac = require("../api/_lib/acessos.js");
  process.env.ACCESS_CODE = "Aluno-Qualquer-1";
  process.env.ACCESS_CODE_ADMIN = "Admin-Qualquer-1";
  const ver = async (quem, papel) => {
    const r = res();
    await admin({ headers: { cookie: sessao(quem, papel) }, url: "/admin" }, r);
    return String(r.body);
  };
  let painel = await ver("gordilho", 2);
  assert.ok(painel.includes("Ainda não foi trocada pelo painel."));
  assert.ok(!/Vercel/.test(painel));
  assert.deepEqual(await ac.definir(false, "Aluno-Novo-2027", "Gordilho"), { ok: true });
  painel = await ver("romeo", 1);
  assert.ok(painel.includes("Trocada por Gordilho em") && painel.includes("Só o administrador ranchef troca esta senha."));
  assert.ok(painel.includes("Troque de novo em até 30 dias"));
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
  painel = await ver("gordilho", 2);
  assert.ok(painel.includes("ATENÇÃO: não há senha definida") && !/Vercel|variável/.test(painel));
});

test("Gordilho vira ranchef sozinho no login quando o banco está sem ranchef (e só então)", async () => {
  const login = require("../api/login.js");
  process.env.ACCESS_CODE = "Aluno-Qualquer-1";
  process.env.ACCESS_CODE_ADMIN = "Admin-Qualquer-1";
  let n = 0;
  const entrar = async (usuario, senha, modo) => {
    const r = res();
    await login({ method: "POST", headers: { "sec-fetch-site": "same-origin", host: "x", "x-forwarded-for": "7.7.7." + ++n },
      body: { usuario, senha, acesso: modo === "admin" ? "Admin-Qualquer-1" : "Aluno-Qualquer-1", modo } }, r);
    return r;
  };
  const cargos = async () => {
    const st = await p.estado();
    return { ranchef: st.ranchef, admins: [...st.admins].sort() };
  };

  // 1) o banco foi carregado só com administradores (sem ranchef): o Gordilho assume ao entrar
  zerar();
  await p.carregarLista([{ nome: "Gordilho", codigo: "B1901", papel: "admin" }, { nome: "Romeo", codigo: "B1902", papel: "admin" }, { nome: "Mike", codigo: "B1903" }]);
  assert.deepEqual(await cargos(), { ranchef: null, admins: ["gordilho", "romeo"] });
  assert.equal((await entrar("romeo", "B1902", "admin")).headers.Location, "/app"); // outro administrador entrando não vira ranchef
  assert.equal((await cargos()).ranchef, null);
  let r = await entrar("gordilho", "B1901", "admin");
  assert.equal(r.headers.Location, "/app");
  assert.deepEqual(await cargos(), { ranchef: "gordilho", admins: ["romeo"] });
  assert.equal(dadosCookie(r.headers["Set-Cookie"]).r, "ranchef"); // já entra com os poderes de ranchef

  // 2) o Gordilho cadastrado como aluno também vira ranchef (nada muda no total de administradores)
  zerar();
  await p.carregarLista([{ nome: "Gordilho", codigo: "B1901" }, { nome: "Romeo", codigo: "B1902", papel: "admin" }]);
  await entrar("gordilho", "B1901", "aluno");
  assert.deepEqual(await cargos(), { ranchef: "gordilho", admins: ["romeo"] });

  // 3) já existindo ranchef (outra pessoa, por transferência), o Gordilho NÃO toma o cargo de volta
  zerar();
  await p.carregarLista(LISTA); // gordilho ranchef, romeo administrador
  assert.deepEqual(await p.transferirRanchef("romeo", "gordilho"), { ok: true, nome: "romeo" });
  r = await entrar("gordilho", "B1901", "admin");
  assert.equal(r.headers.Location, "/app");
  assert.deepEqual(await cargos(), { ranchef: "romeo", admins: ["gordilho"] });

  // 4) pode ser outra pessoa pela variável RANCHEF_INICIAL
  zerar();
  await p.carregarLista([{ nome: "Gordilho", codigo: "B1901", papel: "admin" }, { nome: "Romeo", codigo: "B1902", papel: "admin" }]);
  process.env.RANCHEF_INICIAL = "Romeo";
  await entrar("gordilho", "B1901", "aluno");
  assert.equal((await cargos()).ranchef, null); // o padrão agora é o Romeo, não o Gordilho
  await entrar("romeo", "B1902", "admin");
  assert.equal((await cargos()).ranchef, "romeo");
  delete process.env.RANCHEF_INICIAL;
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_ADMIN;
});

test("painel mostra o número interno de todos, ao lado do nome, para ranchef e administradores; o banco não guarda o código legível", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const admin = require("../api/admin.js");
  const ver = async (quem, papel) => {
    const r = res();
    await admin({ headers: { cookie: sessao(quem, papel) }, url: "/admin" }, r);
    return String(r.body);
  };
  let painel = await ver("gordilho", 2);
  assert.match(painel, /codigo-aluno">B1901</);
  assert.match(painel, /codigo-aluno">B1902</); // ranchef vê o código do administrador
  painel = await ver("romeo", 1);
  assert.match(painel, /codigo-aluno">B1902</); // o próprio
  assert.match(painel, /codigo-aluno">B1901</); // e o da ranchef (todos os administradores conferem todos os números)
  assert.match(painel, /codigo-aluno">B1903</); // e o dos alunos
  assert.ok(!db.l.join("|").includes("B1901") && !JSON.stringify([...db.h || []]).includes("B1901"));
});

test("visualizador da planilha publicada: só administrador, mostra a tabela, sem botão de baixar", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const cofre = require("../api/_lib/cofre.js");
  const ver = require("../api/planilha-ver.js");
  const abrir = async (quem, papel, url) => {
    const r = res();
    await ver({ headers: { cookie: sessao(quem, papel) }, url: url || "/admin/planilha", method: "GET" }, r);
    return r;
  };
  assert.equal((await abrir("mike", 0)).statusCode, 403);
  assert.match(String((await abrir("romeo", 1)).body), /Nenhuma planilha publicada/);
  await cofre.gravarPlanilha({ por: "Romeo", em: Date.now(), dados: { v: 1, formato: "PDF", sexta: "2026-10-23", turmas: [["B12.1", 2, ""], ["N24.1", 1, ""]],
    avisos: [["Aviso de teste", 1]], alunos: [["ALVES", "B1001", "B12.1", 1 + 8], ["ARAUJO", "B1002", "B12.1", 0], ["CORREA", "N2005", "N24.1", 2]] } });
  let r = await abrir("romeo", 1);
  let h = String(r.body);
  assert.equal(r.statusCode, 200);
  assert.ok(h.includes("convertida em tabela") && h.includes("ALVES") && h.includes("B1001") && h.includes("Aviso de teste"));
  assert.ok(!h.includes("CORREA")); // outra turma
  assert.ok(String((await abrir("romeo", 1, "/admin/planilha?turma=N24.1")).body).includes("CORREA"));
  assert.ok(!/download|\/api\/planilha/.test(h)); // nada para baixar
  assert.ok(db.l.join("|").includes("admin_viu_planilha"));
});

test("registro: filtro 'só tentativas recusadas'", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const reg = require("../api/_lib/registro.js");
  const admin = require("../api/admin.js");
  const req = { headers: { "x-forwarded-for": "9.9.9.9", "user-agent": "Mozilla" }, socket: {} };
  await reg.registrar(req, "intruso", "login_falha");
  await reg.registrar(req, "romeo", "login_ok");
  const ver = async (url) => {
    const r = res();
    await admin({ headers: { cookie: sessao("gordilho", 2) }, url }, r);
    return String(r.body);
  };
  let h = await ver("/admin");
  assert.ok(h.includes("Tentativa recusada") && h.includes("Entrou"));
  h = await ver("/admin?f=falhas");
  assert.ok(h.includes("Tentativa recusada") && !h.includes("<td data-rotulo=\"O que fez\">Entrou</td>") && h.includes("checked"));
});

test("limite de tentativas erradas: 8 erros por dia por IP; no 8º bloqueia 15 min e zera o contador", () => {
  const seg = require("../api/_lib/seguranca.js");
  const ip = "8.8.8.8";
  for (let i = 0; i < 7; i++) seg.falhou(ip);
  assert.equal(seg.bloqueado(ip), false);
  seg.falhou(ip); // 8º erro
  assert.equal(seg.bloqueado(ip), true);
  assert.equal(seg.bloqueado("8.8.8.9"), false); // outro IP não é afetado
  const real = Date.now;
  try {
    Date.now = () => real() + 16 * 60 * 1000; // passados os 15 minutos, volta a poder tentar
    assert.equal(seg.bloqueado(ip), false);
    for (let i = 0; i < 7; i++) seg.falhou(ip); // contador zerado: mais 7 erros ainda não bloqueiam
    assert.equal(seg.bloqueado(ip), false);
    seg.falhou(ip);
    assert.equal(seg.bloqueado(ip), true);
  } finally { Date.now = real; }
});

test("número interno exibido: login completa quem não tem e conserta o que não abre (chave errada na carga)", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const reg = require("../api/_lib/registro.js");
  const login = require("../api/login.js");
  const admin = require("../api/admin.js");
  process.env.ACCESS_CODE = "Aluno-Qualquer-1"; process.env.ACCESS_CODE_ADMIN = "Admin-Qualquer-1";
  let n = 0;
  const entrar = async (modo) => {
    const r = res();
    await login({ method: "POST", headers: { "sec-fetch-site": "same-origin", host: "x", "x-forwarded-for": "5.5.5." + ++n },
      body: { usuario: "gordilho", senha: "B1901", acesso: modo === "admin" ? "Admin-Qualquer-1" : "Aluno-Qualquer-1", modo } }, r);
    return r.headers.Location;
  };
  const painel = async () => { const r = res(); await admin({ headers: { cookie: sessao("gordilho", 2) }, url: "/admin" }, r); return String(r.body); };
  const gravar = async (k) => {
    const v = { ...(await p.estado()).pessoas.get("gordilho") };
    if (k === undefined) delete v.k; else v.k = k;
    await reg.chamar([["HSET", "usuarios", "gordilho", JSON.stringify(v)]]);
  };
  for (const [rotulo, k] of [["sem código guardado", undefined], ["código cifrado com outra chave", "v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]]) {
    await gravar(k);
    assert.ok(!(await painel()).includes(">B1901<"), rotulo);
    assert.equal(await entrar("admin"), "/app", rotulo);
    assert.ok((await painel()).includes(">B1901<"), rotulo + ": o painel passa a mostrar o número");
  }
  await gravar(undefined);
  assert.equal(await entrar("aluno"), "/app"); // entrando como aluno também completa
  assert.ok((await painel()).includes(">B1901<"));
  delete process.env.ACCESS_CODE; delete process.env.ACCESS_CODE_ADMIN;
});

test("conferência geral: qualquer pessoa autenticada; une as marcações de todas as conferentes do mesmo dia e refeição", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const api = require("../api/conferencia-geral.js");
  const relogio = Date.now;
  const comoSe = (iso) => { Date.now = () => new Date(iso).getTime(); };
  comoSe("2026-10-23T12:00:00-03:00"); // o dia da sexta da planilha
  const rasc = require("../api/rascunho.js");
  const cofre = require("../api/_lib/cofre.js");
  await cofre.gravarPlanilha({ id: "p1", por: "Romeo", em: Date.now(), dados: { v: 1, formato: "XLSX", sexta: "2026-10-23", turmas: [], avisos: [], alunos: [] } });
  const salvar = async (quem, listas) => {
    const r = res();
    await rasc({ method: "PUT", headers: { cookie: sessao(quem), "sec-fetch-site": "same-origin" }, body: { v: 1, planilha: "p1", sexta: "2026-10-23", ativa: 1, proximoId: 3, listas } }, r);
    assert.equal(r.statusCode, 200);
  };
  const lista = (id, dia, refeicao, ano, marcados, finalizada) => ({ id, dia, refeicao, ano, marcados, finalizada: !!finalizada });
  await salvar("mike", [lista(1, "Sexta", "Janta", "1", ["B12.1|B1037|ALVES", "B12.1|B1038|BRAGA"], true), lista(2, "Segunda", "Café", "1", ["B12.1|B1037|ALVES"])]);
  await salvar("tango", [lista(1, "Sexta", "Janta", "2", ["N24.1|N2005|CORREA", "B12.1|B1037|ALVES"]), lista(2, "Sexta", "Almoço", "1", [])]);
  await cofre.gravarRascunho("ana lima", { v: 1, planilha: "antiga", listas: [lista(1, "Sexta", "Janta", "1", ["B12.1|B9999|FANTASMA"])] }); // outra planilha: ignorada
  const chamar = async (quem, papel, url) => {
    const r = res();
    await api({ method: "GET", headers: { cookie: quem ? sessao(quem, papel) : "" }, url }, r);
    return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
  };
  assert.equal((await chamar("", 0, "/api/conferencia-geral")).status, 401); // sem sessão
  assert.equal((await chamar("mike", 0, "/api/conferencia-geral")).status, 200); // aluno (modo aluno) também vê
  assert.equal((await chamar("romeo", 1, "/api/conferencia-geral")).status, 200);
  // combinações disponíveis (só as com marcações, com o número de conferentes)
  let r = (await chamar("romeo", 1, "/api/conferencia-geral")).json;
  assert.deepEqual(r.opcoes, [{ dia: "Sexta", refeicao: "Janta", conferentes: 2 }]); // a de Segunda só valeria na segunda
  // união: ALVES (marcado pelas duas) aparece uma vez
  r = (await chamar("romeo", 1, "/api/conferencia-geral?dia=Sexta&refeicao=Janta")).json;
  assert.deepEqual([...r.marcados].sort(), ["B12.1|B1037|ALVES", "B12.1|B1038|BRAGA", "N24.1|N2005|CORREA"]);
  assert.deepEqual(r.conferentes.map((c) => [c.nome, c.marcados, c.finalizadas]), [["Mike", 2, 1], ["Tango", 2, 0]]);
  assert.ok(r.conferentes.every((c) => c.em > 0) && !JSON.stringify(r).includes("FANTASMA"));
  assert.equal((await chamar("romeo", 1, "/api/conferencia-geral?dia=Xis&refeicao=Janta")).status, 400);
  assert.ok(db.l.join("|").includes("viu_conferencia_geral"));
  // no dia seguinte a listagem de sexta some (e o endereço dela deixa de responder)
  comoSe("2026-10-24T09:00:00-03:00");
  assert.deepEqual((await chamar("romeo", 1, "/api/conferencia-geral")).json.opcoes, []);
  const velha = await chamar("romeo", 1, "/api/conferencia-geral?dia=Sexta&refeicao=Janta");
  assert.equal(velha.status, 404);
  assert.equal(velha.json.expirada, true);
  // na segunda (26/10) vale a de segunda
  comoSe("2026-10-26T20:00:00-03:00");
  assert.deepEqual((await chamar("romeo", 1, "/api/conferencia-geral")).json.opcoes, [{ dia: "Segunda", refeicao: "Café", conferentes: 1 }]);
  // virada do dia no horário de Brasília (23h59 ainda é sexta; 00h01 de sábado já não)
  comoSe("2026-10-23T23:59:00-03:00");
  assert.equal((await chamar("romeo", 1, "/api/conferencia-geral")).json.opcoes.length, 1);
  comoSe("2026-10-24T00:01:00-03:00");
  assert.equal((await chamar("romeo", 1, "/api/conferencia-geral")).json.opcoes.length, 0);
  Date.now = relogio;
  // sem planilha publicada
  db.s.delete("planilha");
  assert.equal((await chamar("romeo", 1, "/api/conferencia-geral")).status, 404);
});

test("o plano gratuito da hospedagem aceita no máximo 12 funções: api/ não pode ter mais de 12 arquivos de rota", () => {
  const rotas = fs.readdirSync(new URL("../api/", import.meta.url)).filter((n) => n.endsWith(".js"));
  assert.ok(rotas.length <= 12, "são " + rotas.length + " rotas: junte duas antes de publicar");
  // os endereços antigos de download continuam valendo por rewrite
  const conf = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const origens = conf.rewrites.map((r) => r.source);
  assert.ok(origens.includes("/api/admin-lista") && origens.includes("/api/admin-exportar"));
});

test("menu.css é a única fonte do menu suspenso: páginas do servidor e app o carregam; não há cópia do CSS no HTML", async () => {
  zerar();
  await p.carregarLista(LISTA);
  const css = fs.readFileSync(new URL("../public/menu.css", import.meta.url), "utf8");
  assert.ok(css.includes(".menu-suspenso-lista") && css.includes("#cg-rodape") && css.includes(".faixa-interna"));
  assert.ok(/@media \(max-width: 640px\)[^}]*\.menu \{ width: 100%/.test(css) && css.includes("left: clamp(1rem, 4vw, 2.5rem)")); // no celular a lista abre na largura da tela
  // sem cópias nos outros arquivos de estilo
  for (const f of ["../public/tema.css", "../fonte-app/web/estilo.css"]) {
    assert.ok(!fs.readFileSync(new URL(f, import.meta.url), "utf8").includes(".menu-suspenso"), f);
  }
  const admin = require("../api/admin.js");
  const r = res();
  await admin({ headers: { cookie: sessao("romeo", 1) }, url: "/admin" }, r);
  assert.ok(String(r.body).includes('<link rel="stylesheet" href="/menu.css">'));
  assert.ok(String(r.body).indexOf("/menu.css") < String(r.body).indexOf("<body>")); // no <head>
});
