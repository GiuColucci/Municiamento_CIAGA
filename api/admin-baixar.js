// Downloads do painel numa só função (o plano gratuito da hospedagem limita o número de funções):
//   ?o=lista   a "rela" das pessoas liberadas (texto simples). Ranchef e administradores, em sessão de administrador.
//              Tem só nomes e papéis: o número interno nunca sai daqui.
//   ?o=backup  backup da lista de acessos (nomes, sais e hashes dependentes da PEPPER). Só o administrador ranchef.
// Os endereços antigos /api/admin-lista e /api/admin-exportar continuam valendo (vercel.json).
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");

const hoje = () => new Date().toISOString().slice(0, 10);

async function lista(req, res, sess) {
  const st = await pessoas.estado();
  const texto = pessoas.textoLista(st, await pessoas.nomeExibido(sess.u));
  await reg.registrar(req, sess.u, "admin_baixou_lista");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="liberados-${hoje()}.txt"`);
  res.setHeader("Cache-Control", "no-store");
  res.end("﻿" + texto + "\n"); // BOM: o bloco de notas do Windows abre os acentos certos
}

async function backup(req, res, sess) {
  const dados = await pessoas.exportar();
  await reg.registrar(req, sess.u, "admin_exportou");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="lista-acessos-${hoje()}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(dados, null, 1));
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  const o = new URL(req.url || "/", "http://x").searchParams.get("o");
  const papel = req.method === "GET" && sess ? await pessoas.papelAtual(sess.u, sess) : 0;
  const permitido = o === "lista" ? papel >= 1 : o === "backup" ? papel === 2 : false;
  if (!permitido) {
    if (sess) await reg.registrar(req, sess.u, "admin_negado");
    res.statusCode = 403;
    return res.end("Acesso negado.");
  }
  try {
    await (o === "lista" ? lista : backup)(req, res, sess);
  } catch (e) {
    console.error("falha no download do painel:", e.message);
    res.statusCode = 500;
    res.end("Erro interno.");
  }
};
