// Baixa a "rela" das pessoas liberadas (texto simples). Ranchef e administradores, em sessão de administrador.
// A lista tem só nomes e papéis: código de aluno nunca sai daqui (ele nem é guardado, só o hash).
const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (req.method !== "GET" || !sess || (await pessoas.papelAtual(sess.u, sess)) < 1) {
    if (sess) await reg.registrar(req, sess.u, "admin_negado");
    res.statusCode = 403;
    return res.end("Acesso negado.");
  }
  try {
    const st = await pessoas.estado();
    const texto = pessoas.textoLista(st, await pessoas.nomeExibido(sess.u));
    await reg.registrar(req, sess.u, "admin_baixou_lista");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="liberados-${new Date().toISOString().slice(0, 10)}.txt"`);
    res.setHeader("Cache-Control", "no-store");
    res.end("﻿" + texto + "\n"); // BOM: o bloco de notas do Windows abre os acentos certos
  } catch (e) {
    console.error("falha ao gerar a lista:", e.message);
    res.statusCode = 500;
    res.end("Erro interno.");
  }
};
