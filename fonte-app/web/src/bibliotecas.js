/* Bibliotecas pesadas (ler XLSX e PDF, gerar PDF e DOCX) em modo "preguiçoso".
   Na versão que usa isto (build com lazy), elas vêm no HTML como texto (<script type="text/plain" data-lib>) e NÃO
   são executadas na abertura: executar mais de 2 MB de código logo no início trava a animação da abertura, principalmente
   no celular. Elas rodam depois que a abertura termina, uma por vez e com uma pausa entre elas, ou na hora, se alguém
   precisar delas antes (ler uma planilha, baixar um arquivo). Sem etiquetas desse tipo (outros builds, testes no
   Node), tudo resolve na hora e nada muda. */
(function (M) {
  "use strict";

  var promessa = null;

  function etiquetas() {
    return typeof document === "undefined" ? [] :
      Array.prototype.slice.call(document.querySelectorAll('script[type="text/plain"][data-lib]'));
  }

  // O texto é executado como script embutido novo (a regra de segurança da página já permite scripts embutidos).
  function executar(tag) {
    var s = document.createElement("script");
    s.textContent = tag.textContent;
    document.head.appendChild(s);
    document.head.removeChild(s);
    tag.textContent = ""; // solta a memória do texto
    tag.removeAttribute("data-lib");
  }

  /** Executa as bibliotecas que faltam, na ordem do HTML, deixando a tela respirar entre uma e outra. */
  M.garantirBibliotecas = function () {
    if (promessa) return promessa;
    var fila = etiquetas();
    if (!fila.length) return Promise.resolve();
    promessa = new Promise(function (ok, falha) {
      (function proxima() {
        var tag = fila.shift();
        if (!tag) return ok();
        try { executar(tag); } catch (e) { promessa = null; return falha(e); }
        setTimeout(proxima, 30);
      })();
    });
    return promessa;
  };

  /** Resolve quando a abertura já terminou (ou se ela nem aparece, como para quem reduz animações). */
  M.aberturaTerminou = function () {
    return new Promise(function (ok) {
      var a = typeof document === "undefined" ? null : document.getElementById("abertura");
      if (!a || !a.parentNode || getComputedStyle(a).display === "none") return ok();
      var o = new MutationObserver(function () {
        if (!document.getElementById("abertura")) { o.disconnect(); ok(); }
      });
      o.observe(a.parentNode, { childList: true });
    });
  };

  /** Começa a carregar as bibliotecas quando a abertura terminar, sem pressa (nos momentos livres do navegador). */
  M.carregarBibliotecasEmSegundoPlano = function () {
    if (!etiquetas().length) return;
    M.aberturaTerminou().then(function () {
      var livre = globalThis.requestIdleCallback || function (f) { setTimeout(f, 300); };
      livre(function () { M.garantirBibliotecas().catch(function () { /* quem precisar tenta de novo */ }); });
    });
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
