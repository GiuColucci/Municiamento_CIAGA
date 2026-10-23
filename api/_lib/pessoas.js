// Todas as pessoas com acesso ficam no Redis, no hash "usuarios":
//   campo = nome normalizado (único)   valor = {d: nome como exibido, s: sal, h: hash do código, k: código cifrado (só para o painel mostrar), adm: 0|1|2}
// Papéis (adm): 2 = administrador ranchef (um só; tem poder sobre os administradores),
//               1 = administrador (no máximo 2), 0 = aluno. Total de administradores: 3.
// Regras: ranchef e administradores cadastram e excluem alunos; só o ranchef promove, rebaixa e baixa o backup.
// O ranchef não é alterado pelo site (só pelo script no computador). Nome é único.
const crypto = require("crypto");
const s = require("./seguranca");
const reg = require("./registro");
const cofre = require("./cofre");

const MAX_ADMINS = 2; // administradores além do ranchef
const MAX_RANCHEF = 1;
const MAX_PESSOAS = 500;
const CODIGO = /^[BMN]\d{4}$/;
const SAL_FALSO = Buffer.alloc(16).toString("base64");
const HASH_FALSO = Buffer.alloc(64).toString("base64");
const ROTULO_PAPEL = { 0: "Aluno", 1: "Administrador", 2: "Administrador ranchef" };

const lerJson = (v) => { try { return JSON.parse(v); } catch { return null; } };
const nivel = (v) => (v && (v.adm === 2 || v.adm === 1) ? v.adm : 0);
const nivelDe = (papel) => (papel === "ranchef" ? 2 : papel === "admin" || papel === true ? 1 : 0);

async function listar() {
  const m = new Map();
  const r = await reg.chamar([["HGETALL", "usuarios"]]);
  const flat = (r && r[0].result) || [];
  for (let i = 0; i < flat.length; i += 2) {
    const v = lerJson(flat[i + 1]);
    if (v) m.set(flat[i], v);
  }
  return m;
}

async function obter(n) {
  const r = await reg.chamar([["HGET", "usuarios", n]]);
  return lerJson(r && r[0].result);
}

function contar(pessoas) {
  let ranchef = null;
  const admins = new Set();
  for (const [n, v] of pessoas) {
    if (v.adm === 2) ranchef = n;
    else if (v.adm === 1) admins.add(n);
  }
  return { ranchef, admins };
}

async function estado() {
  if (!reg.config()) throw new Error("banco não configurado");
  const pessoas = await listar();
  return { pessoas, ...contar(pessoas) };
}

// Papel ao vivo (rebaixar vale na hora): 0 aluno, 1 administrador, 2 ranchef. Só vale se a sessão foi aberta
// em modo administrador (escolha no login).
// Se o banco falhar, usa o papel do cookie assinado.
async function papelAtual(nome, sess) {
  if (!sess || sess.m !== 1) return 0; // entrou como aluno: sem poderes de administrador nesta sessão
  const doCookie = () => (sess && sess.r === "ranchef" ? 2 : sess && sess.r === "admin" ? 1 : 0);
  try {
    if (!reg.config()) return doCookie();
    return nivel(await obter(nome));
  } catch {
    return doCookie();
  }
}

// Nome como foi cadastrado (com maiúsculas e acentos), só para exibir.
async function nomeExibido(n) {
  try {
    const v = reg.config() ? await obter(n) : null;
    return (v && v.d) || n;
  } catch {
    return n;
  }
}

const ehAdmin = async (nome, sess) => (await papelAtual(nome, sess)) >= 1;

// Quem foi excluído perde a sessão aberta na hora. Se o banco falhar, não derruba ninguém.
async function removido(nome) {
  if (!reg.config()) return false;
  try {
    if (await obter(nome)) return false;
    let conta = false;
    try { conta = Object.prototype.hasOwnProperty.call(JSON.parse(process.env.USERS || "{}"), nome); } catch { /* sem USERS */ }
    return !conta;
  } catch {
    return false;
  }
}

async function conferir(nome, codigo) {
  const n = s.normalizarNome(nome);
  const v = reg.config() ? await obter(n) : null;
  const alvo = v || { s: SAL_FALSO, h: HASH_FALSO }; // mesmo custo para nome inexistente
  const calc = Buffer.from(s.hashCodigo(codigo, alvo.s).split("$")[2], "base64");
  const ok = crypto.timingSafeEqual(calc, Buffer.from(alvo.h, "base64"));
  if (ok && v && !v.k) {
    const k = selarCodigo(String(codigo).trim().toUpperCase());
    if (k) { try { await reg.chamar([["HSET", "usuarios", n, JSON.stringify({ ...v, k })]]); } catch { /* tenta no próximo login */ } }
  }
  return ok && v ? { nome: n, papel: nivel(v), admin: nivel(v) >= 1 } : null;
}

// Quem tem esse código (só alunos; administradores ficam de fora para um administrador não descobrir o código
// de outro). Confere o hash de cada aluno; o código em si nunca é guardado.
async function acharPorCodigo(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  if (!CODIGO.test(c)) return [];
  const st = await estado();
  const alvos = [...st.pessoas].filter(([, v]) => nivel(v) === 0);
  const achados = [];
  for (let i = 0; i < alvos.length; i += 8) {
    await Promise.all(
      alvos.slice(i, i + 8).map(async ([n, v]) => {
        const calc = Buffer.from(await s.hashCodigoAsync(c, v.s), "base64");
        if (calc.length === 64 && crypto.timingSafeEqual(calc, Buffer.from(v.h, "base64"))) achados.push({ n, d: v.d || n });
      })
    );
  }
  return achados;
}

// "Rela" das pessoas liberadas, em texto: ranchef, administradores e alunos, em ordem alfabética dentro de cada papel.
function textoLista(st, quem) {
  const ordem = (v) => (v.adm === 2 ? 0 : v.adm === 1 ? 1 : 2);
  const itens = [...st.pessoas].sort(([an, a], [bn, b]) => ordem(a) - ordem(b) || (a.d || an).localeCompare(b.d || bn, "pt-BR"));
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return [
    "Conferência CIAGA - Pessoas liberadas",
    `Gerado em ${quando} por ${quem}`,
    `Total: ${itens.length}`,
    "",
    ...itens.map(([n, v], i) => `${i + 1}. ${v.d || n} (${ROTULO_PAPEL[nivel(v)]})`),
  ].join("\n");
}

// O código também fica guardado cifrado (AES-GCM com a DATA_KEY) para o painel mostrá-lo ao lado do nome.
function selarCodigo(codigo) {
  try { return cofre.cifrar(codigo, "codigo"); } catch { return undefined; }
}

function lerCodigo(v) {
  try { return v && v.k ? cofre.abrir(v.k, "codigo") : null; } catch { return null; }
}

function novoRegistro(nome, codigo, adm) {
  const [, sal, h] = s.hashCodigo(codigo).split("$");
  return { d: reg.limpar(nome, 40), s: sal, h, k: selarCodigo(codigo), adm };
}

async function cadastrar(nome, codigo) {
  if (!reg.config()) return { erro: "sem_banco" };
  const n = s.normalizarNome(reg.limpar(nome, 40));
  const c = String(codigo || "").trim().toUpperCase();
  if (!n || !CODIGO.test(c)) return { erro: "dados_invalidos" };
  const st = await estado();
  if (st.pessoas.has(n)) return { erro: "ja_existe" };
  if (st.pessoas.size >= MAX_PESSOAS) return { erro: "limite_pessoas" };
  await reg.chamar([["HSET", "usuarios", n, JSON.stringify(novoRegistro(nome, c, 0))]]);
  return { ok: true, nome: n };
}

async function mudarPapel(n, adm) {
  const v = await obter(n);
  await reg.chamar([["HSET", "usuarios", n, JSON.stringify({ ...v, adm })]]);
}

// Só o ranchef chama (a checagem de quem pode fica em admin-acao). Promove aluno a administrador.
async function promover(nome) {
  if (!reg.config()) return { erro: "sem_banco" };
  const n = s.normalizarNome(nome);
  const st = await estado();
  const v = st.pessoas.get(n);
  if (!v) return { erro: "nao_encontrado" };
  if (nivel(v) >= 1) return { ok: true, nome: n };
  if (st.admins.size >= MAX_ADMINS) return { erro: "limite_admins" };
  await mudarPapel(n, 1);
  // Dois cliques simultâneos: confere de novo e desfaz o excedente.
  if ((await estado()).admins.size > MAX_ADMINS) {
    await mudarPapel(n, 0);
    return { erro: "limite_admins" };
  }
  return { ok: true, nome: n };
}

async function rebaixar(nome, quem) {
  if (!reg.config()) return { erro: "sem_banco" };
  const n = s.normalizarNome(nome);
  if (n === quem) return { erro: "proprio" };
  const v = await obter(n);
  if (!v) return { erro: "nao_encontrado" };
  if (v.adm === 2) return { erro: "e_ranchef" };
  if (v.adm === 1) await mudarPapel(n, 0);
  return { ok: true, nome: n };
}

// Excluir: só aluno. Administrador primeiro é rebaixado pelo ranchef (um não derruba os outros de uma vez).
async function remover(nome, quem) {
  if (!reg.config()) return { erro: "sem_banco" };
  const n = s.normalizarNome(nome);
  if (n === quem) return { erro: "proprio" };
  const v = await obter(n);
  if (!v) return { erro: "nao_encontrado" };
  if (nivel(v) >= 1) return { erro: v.adm === 2 ? "e_ranchef" : "e_admin" };
  await reg.chamar([["HDEL", "usuarios", n]]);
  return { ok: true, nome: n };
}

// Ranchef de origem do sistema: o Gordilho (pode ser mudado pela variável RANCHEF_INICIAL). Se o banco estiver sem ranchef,
// ele vira ranchef no próximo login dele, sem ninguém precisar rodar nada. Depois que existe um ranchef (inclusive por
// transferência), isto não faz nada.
const ranchefPadrao = () => s.normalizarNome(process.env.RANCHEF_INICIAL || "gordilho");

async function garantirRanchef(nome) {
  if (!reg.config() || s.normalizarNome(nome) !== ranchefPadrao()) return { erro: "nao_e_o_padrao" };
  const st = await estado();
  if (st.ranchef) return { erro: "ja_tem_ranchef" };
  const n = s.normalizarNome(nome);
  if (!st.pessoas.has(n)) return { erro: "nao_encontrado" };
  await mudarPapel(n, 2);
  return { ok: true, nome: n };
}

// Só quando NÃO existe ranchef (por exemplo, a lista foi carregada só com administradores): um administrador assume o cargo.
async function assumirRanchef(quem) {
  if (!reg.config()) return { erro: "sem_banco" };
  const st = await estado();
  if (st.ranchef) return { erro: "ja_tem_ranchef" };
  const eu = st.pessoas.get(quem);
  if (!eu || eu.adm !== 1) return { erro: "sem_permissao" };
  await mudarPapel(quem, 2);
  return { ok: true, nome: quem };
}

// Passa o cargo de ranchef a outra pessoa; quem transfere vira administrador. Só o ranchef atual transfere.
// O total de administradores (fora o ranchef) continua dentro do limite: se a pessoa escolhida é aluno, sobe um.
async function transferirRanchef(nome, quem) {
  if (!reg.config()) return { erro: "sem_banco" };
  const n = s.normalizarNome(nome);
  if (n === quem) return { erro: "proprio" };
  const st = await estado();
  const atual = st.pessoas.get(quem);
  if (!atual || atual.adm !== 2) return { erro: "sem_permissao" };
  const alvo = st.pessoas.get(n);
  if (!alvo) return { erro: "nao_encontrado" };
  if (st.admins.size + (alvo.adm === 1 ? 0 : 1) > MAX_ADMINS) return { erro: "limite_admins_transferir" };
  // numa só chamada: nunca fica sem ranchef nem com dois
  await reg.chamar([
    ["HSET", "usuarios", quem, JSON.stringify({ ...atual, adm: 1 })],
    ["HSET", "usuarios", n, JSON.stringify({ ...alvo, adm: 2 })],
  ]);
  return { ok: true, nome: n };
}

function conferirLimites(ranchefs, admins, total) {
  if (ranchefs > MAX_RANCHEF) throw new Error(`Só pode haver ${MAX_RANCHEF} administrador ranchef (${ranchefs}).`);
  if (admins > MAX_ADMINS) throw new Error(`Só pode haver ${MAX_ADMINS} administradores além do ranchef (${admins}).`);
  if (total > MAX_PESSOAS) throw new Error("Passaria do limite de pessoas.");
}

// Carga inicial (script no computador): itens = [{nome, codigo, papel: "ranchef"|"admin"|undefined}].
// Não altera quem já existe, exceto: se ainda não há ranchef, a pessoa marcada como ranchef vira ranchef.
async function carregarLista(itens) {
  const st = await estado();
  const atual = contar(st.pessoas);
  let ranchefs = atual.ranchef ? 1 : 0;
  let admins = atual.admins.size;
  const vistos = new Set();
  const gravar = [];
  let novos = 0;
  for (const it of itens) {
    const n = s.normalizarNome(it.nome);
    const c = String(it.codigo || "").trim().toUpperCase();
    if (!n || !CODIGO.test(c)) throw new Error(`Linha inválida: ${it.nome};${it.codigo}`);
    if (vistos.has(n)) throw new Error(`Nome repetido na lista: ${it.nome} (use nomes únicos, ex.: acrescente o sobrenome)`);
    vistos.add(n);
    const alvo = nivelDe(it.papel !== undefined ? it.papel : it.admin);
    const existente = st.pessoas.get(n);
    if (!existente) {
      gravar.push([n, novoRegistro(it.nome, c, alvo)]);
      novos++;
      if (alvo === 2) ranchefs++;
      else if (alvo === 1) admins++;
    } else if (alvo === 2 && existente.adm !== 2 && ranchefs === 0) {
      gravar.push([n, { ...existente, k: existente.k || selarCodigo(c), adm: 2 }]);
      ranchefs++;
      if (existente.adm === 1) admins--;
    } else if (!existente.k) {
      const calc = Buffer.from(s.hashCodigo(c, existente.s).split("$")[2], "base64");
      if (calc.length === 64 && crypto.timingSafeEqual(calc, Buffer.from(existente.h, "base64"))) gravar.push([n, { ...existente, k: selarCodigo(c) }]);
    }
  }
  conferirLimites(ranchefs, admins, st.pessoas.size + novos);
  if (gravar.length) await reg.chamar(gravar.map(([n, v]) => ["HSET", "usuarios", n, JSON.stringify(v)]));
  return { novos, existentes: itens.length - novos, atualizados: gravar.length - novos };
}

// Backup: só nomes, sais e hashes (os hashes dependem da PEPPER; sem ela não servem para nada).
async function exportar() {
  const st = await estado();
  return { versao: 1, exportado_em: new Date().toISOString(), pessoas: [...st.pessoas].map(([n, v]) => ({ n, ...v })) };
}

async function importar(obj) {
  if (!obj || obj.versao !== 1 || !Array.isArray(obj.pessoas)) throw new Error("Arquivo de backup inválido.");
  const st = await estado();
  const novos = obj.pessoas.filter((p) => p && p.n && p.s && p.h && !st.pessoas.has(p.n));
  const atual = contar(st.pessoas);
  const ranchefs = (atual.ranchef ? 1 : 0) + novos.filter((p) => p.adm === 2).length;
  const admins = atual.admins.size + novos.filter((p) => p.adm === 1).length;
  conferirLimites(ranchefs, admins, st.pessoas.size + novos.length);
  if (novos.length) {
    await reg.chamar(novos.map((p) => ["HSET", "usuarios", p.n, JSON.stringify({ d: reg.limpar(p.d, 40), s: p.s, h: p.h, k: p.k, adm: nivel(p) })]));
  }
  return { novos: novos.length, existentes: obj.pessoas.length - novos.length };
}

module.exports = {
  MAX_ADMINS, ROTULO_PAPEL, estado, papelAtual, nomeExibido, ehAdmin, removido, conferir, cadastrar,
  promover, rebaixar, remover, transferirRanchef, assumirRanchef, garantirRanchef, acharPorCodigo, lerCodigo, textoLista, carregarLista, exportar, importar,
};
