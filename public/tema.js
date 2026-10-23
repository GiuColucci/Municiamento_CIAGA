/* Tema claro/escuro: o mesmo do app (mesma chave de armazenamento, então a escolha vale nas duas telas).
   Carregado no <head>, antes de pintar, para não "piscar". */
(function () {
  var CHAVE = "municiamento-tema";
  var salvo = null;
  try { salvo = localStorage.getItem(CHAVE); } catch (e) { /* sem armazenamento */ }
  var escuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-tema", salvo === "claro" || salvo === "escuro" ? salvo : (escuro ? "escuro" : "claro"));

  document.addEventListener("DOMContentLoaded", function () {
    var botao = document.getElementById("botao-tema");
    if (!botao) return;
    botao.addEventListener("click", function () {
      var novo = document.documentElement.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
      document.documentElement.setAttribute("data-tema", novo);
      try { localStorage.setItem(CHAVE, novo); } catch (e) { /* sem armazenamento */ }
    });
  });
})();
