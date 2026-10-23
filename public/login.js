(function () {
  var e = new URLSearchParams(location.search).get("erro");
  var msg = {
    "1": "Nome, número interno ou senha incorretos.",
    limite: "Muitas tentativas erradas. Aguarde 15 minutos.",
    nao_admin: "Seus dados estão certos, mas você não tem a função de administrador. Entre como Aluno.",
    falha: "Erro no servidor. Tente de novo em instantes."
  }[e];
  if (msg) {
    var d = document.getElementById("erro");
    d.textContent = msg;
    d.classList.remove("oculto");
  }
})();

// A senha é diferente para quem entra como aluno e como administrador.
(function () {
  var rotulo = document.querySelector('label[for="a"]');
  var campo = document.getElementById("a");
  function atualizar() {
    var admin = document.querySelector('input[name="modo"]:checked');
    var ehAdmin = !!admin && admin.value === "admin";
    if (rotulo) rotulo.textContent = ehAdmin ? "Senha de administrador" : "Senha";
    if (campo) campo.value = "";
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="modo"]'), function (r) {
    r.addEventListener("change", atualizar);
  });
})();
