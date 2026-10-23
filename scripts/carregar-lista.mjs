// Carga inicial (ou restauração) da lista de acessos no banco. Roda no SEU computador; não grava nada em disco.
//
//   node scripts/carregar-lista.mjs ..\AUTORIZADOS.txt          (texto: nome;código[;ranchef|admin], um por linha)
//   node scripts/carregar-lista.mjs lista-acessos-2026-10-22.json (backup baixado do /admin)
//
// Variáveis necessárias na janela do terminal: KV_REST_API_URL, KV_REST_API_TOKEN (do Upstash) e PEPPER
// e DATA_KEY (as mesmas da Vercel; a DATA_KEY é usada para guardar o código cifrado, que o painel mostra ao lado do nome). Quem já existe no banco não é alterado.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pessoas = require("../api/_lib/pessoas.js");

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: node scripts/carregar-lista.mjs <AUTORIZADOS.txt | backup.json>");
  process.exit(1);
}
for (const v of ["PEPPER", "DATA_KEY"]) {
  if (!process.env[v]) {
    console.error(`Defina ${v} nesta janela do PowerShell antes de rodar.`);
    process.exit(1);
  }
}
if (!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)) {
  console.error("Defina KV_REST_API_URL e KV_REST_API_TOKEN (Upstash) nesta janela.");
  process.exit(1);
}

const texto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
try {
  let r;
  if (arquivo.toLowerCase().endsWith(".json")) {
    r = await pessoas.importar(JSON.parse(texto));
  } else {
    const itens = [];
    for (const linha of texto.split(/\r?\n/)) {
      const [nome, codigo, flag] = linha.split("#")[0].split(";").map((x) => x.trim());
      if (!nome && !codigo) continue;
      const papel = (flag || "").toLowerCase();
      if (papel && papel !== "admin" && papel !== "ranchef") throw new Error(`Terceiro campo deve ser 'ranchef' ou 'admin': ${linha}`);
      itens.push({ nome, codigo, papel: papel || undefined });
    }
    r = await pessoas.carregarLista(itens);
  }
  console.log(`${r.novos} pessoa(s) carregada(s); ${r.existentes} já existia(m) e não foram alteradas.` + (r.atualizados ? ` ${r.atualizados} promovida(s) a ranchef.` : ""));
} catch (e) {
  console.error("Erro:", e.message);
  process.exit(1);
}
