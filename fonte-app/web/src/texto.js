/* Funções de texto e de datas usadas por todo o sistema. */
(function (M) {
  "use strict";

  M.TURMA_RE = /([BMN])\s?(\d)(\d)\s?\.\s?(\d)/;
  M.CODIGO_FULL = /^[BMN]\d{4}$/;
  var CONTROLE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

  M.codigos = function (texto) {
    return String(texto || "").match(/[BMN]\d{4}/g) || [];
  };

  M.semAcento = function (s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/\p{Mn}/gu, "");
  };

  /** Para comparar rótulos com sujeira: '  Segunda-Feira ' -> 'segunda-feira'. */
  M.normalizar = function (s) {
    return M.semAcento(s).toLowerCase().trim();
  };

  M.chaveAlfabetica = M.normalizar;

  /** Comparação por ponto de código, como no Python (não depende do idioma do navegador). */
  M.comparar = function (a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  };

  /** Tira caracteres de controle e espaços das pontas (nomes vão como texto puro). */
  M.limpar = function (s, maximo) {
    var t = String(s == null ? "" : s).replace(CONTROLE, "").replace(/[\t\n\r]/g, " ");
    t = t.replace(/\s{2,}/g, " ").trim();
    return maximo ? t.slice(0, maximo) : t;
  };

  /** 'M 24.1' -> 'M24.1'. Devolve null se não houver código de turma. */
  M.acharTurma = function (texto) {
    var m = M.TURMA_RE.exec(String(texto || ""));
    return m ? m[1] + m[2] + m[3] + "." + m[4] : null;
  };

  // ---------------------------------------------------------------- datas (texto 'AAAA-MM-DD', sem fuso)

  function doisDigitos(n) { return (n < 10 ? "0" : "") + n; }

  M.dataISO = function (ano, mes, dia) {
    var d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
    return ano + "-" + doisDigitos(mes) + "-" + doisDigitos(dia);
  };

  function utc(iso) {
    var p = iso.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  /** 0 = segunda ... 4 = sexta ... 6 = domingo (como o weekday() do Python). */
  M.diaDaSemana = function (iso) {
    return (utc(iso).getUTCDay() + 6) % 7;
  };

  M.ehSexta = function (iso) { return !!iso && M.diaDaSemana(iso) === 4; };

  M.somarDias = function (iso, n) {
    var d = utc(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  /** 'AAAA-MM-DD' -> 'DD/MM/AAAA' (ou 'DD/MM' com curta). */
  M.formatarData = function (iso, curta) {
    var p = iso.split("-");
    return curta ? p[2] + "/" + p[1] : p[2] + "/" + p[1] + "/" + p[0];
  };

  /** Número de série do Excel -> 'AAAA-MM-DD'. */
  M.dataDoExcel = function (serie, sistema1904) {
    var base = Date.UTC(1899, 11, 30) + (sistema1904 ? 1462 : 0) * 86400000;
    return new Date(base + Math.floor(serie) * 86400000).toISOString().slice(0, 10);
  };

  M.hojeISO = function () {
    var d = new Date();
    return M.dataISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
