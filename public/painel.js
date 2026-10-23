/* Painel do administrador: botão "Copiar" (copia o texto guardado em data-texto). */
(function () {
  function copiarAntigo(texto) {
    var campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    campo.setSelectionRange(0, texto.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(campo);
    return ok;
  }

  document.addEventListener("click", function (e) {
    var botao = e.target.closest ? e.target.closest("[data-copiar]") : null;
    if (!botao) return;
    var texto = botao.getAttribute("data-texto") || "";
    var rotulo = botao.getAttribute("data-rotulo") || botao.textContent;
    var aviso = document.getElementById("aviso-copia");
    function pronto(ok) {
      botao.textContent = ok ? "Copiado!" : "Não consegui copiar";
      if (aviso) aviso.textContent = ok ? "Lista copiada." : "Não foi possível copiar; use Baixar.";
      setTimeout(function () { botao.textContent = rotulo; }, 2200);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(function () { pronto(true); }, function () { pronto(copiarAntigo(texto)); });
    } else {
      pronto(copiarAntigo(texto));
    }
  });
})();
