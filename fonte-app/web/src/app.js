/* Interface: escolher a planilha, conferir e baixar. Tudo no navegador. */
(function (M) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var estado = null; // {leitura, res, sexta, dias, listas}

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function mostrar(e, sim) { e.classList.toggle("oculto", !sim); }
  function plural(n, palavra) { return n + " " + palavra + (n === 1 ? "" : "s"); }

  function erro(msg) {
    var e = $("erro");
    e.textContent = msg || "";
    mostrar(e, !!msg);
    if (msg) e.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // valores: [valor, rótulo] ou só o valor, quando o rótulo é o próprio valor
  function caixas(destino, valores, marcados) {
    destino.textContent = "";
    valores.forEach(function (v) {
      var valor = Array.isArray(v) ? v[0] : v, texto = Array.isArray(v) ? v[1] : v;
      var rotulo = el("label", "opcao");
      var caixa = el("input");
      caixa.type = "checkbox"; caixa.value = valor; caixa.checked = marcados.indexOf(valor) >= 0;
      rotulo.appendChild(caixa);
      rotulo.appendChild(document.createTextNode(" " + texto));
      destino.appendChild(rotulo);
    });
  }
  function caixasDias(destino, marcados) { caixas(destino, M.DIAS_LISTA, marcados); }
  function diasMarcados(destino, desmarcados) {
    return Array.prototype.filter.call(destino.querySelectorAll("input"), function (c) { return c.checked !== !!desmarcados; })
      .map(function (c) { return c.value; });
  }

  function ocupado(botao, sim, texto) {
    if (sim) { botao.dataset.texto = botao.textContent; botao.textContent = texto; }
    else if (botao.dataset.texto) { botao.textContent = botao.dataset.texto; }
    botao.disabled = sim;
  }
  function deixarPintar() { return new Promise(function (ok) { setTimeout(ok, 30); }); }

  // ---------------------------------------------------------------- tela 1

  function mostrarArquivos() {
    var f = $("planilha").files, nomes = [];
    for (var i = 0; i < f.length; i++) {
      var kb = f[i].size / 1024;
      nomes.push(f[i].name + " (" + (kb < 1024 ? Math.max(1, Math.round(kb)) + " KB" : (kb / 1024).toFixed(1).replace(".", ",") + " MB") + ")");
    }
    $("arquivos-escolhidos").textContent = nomes.length ? "Escolhido: " + nomes.join(", ") : "";
    $("area-envio").classList.toggle("com-arquivo", nomes.length > 0);
  }

  async function gerar(ev) {
    ev.preventDefault();
    erro("");
    var arquivos = $("planilha").files, dias = diasMarcados($("dias-envio"));
    if (!arquivos.length) return erro("Escolha o arquivo da planilha.");
    if (!dias.length) return erro("Marque pelo menos um dia.");
    var botao = $("botao-gerar");
    ocupado(botao, true, "Lendo a planilha…");
    await deixarPintar();
    try {
      var lista = [];
      for (var i = 0; i < arquivos.length; i++) {
        lista.push({ nome: arquivos[i].name, bytes: new Uint8Array(await arquivos[i].arrayBuffer()) });
      }
      var leitura = await M.carregarGrades(lista);
      var res = M.parseGrade(leitura.grades);
      if (!res.turmas.length || !res.alunos.length) {
        return erro("Não encontrei turmas nessa planilha. Confira se é o arquivo do municiamento.");
      }
      leitura.avisos.forEach(function (t) { res.avisar(t); });
      var informada = $("sexta").value || null;
      if (informada && !M.ehSexta(informada)) {
        res.avisar("A data informada (" + M.formatarData(informada) + ") não é uma sexta-feira. Confira ao lado.", true);
        informada = null;
      }
      if (informada && leitura.sextaSugerida && informada !== leitura.sextaSugerida) {
        res.avisar("Você informou a sexta " + M.formatarData(informada) + ", mas a planilha indica " +
          M.formatarData(leitura.sextaSugerida) + ". Confira a data.", true);
      }
      estado = { leitura: leitura, res: res, sexta: informada || leitura.sextaSugerida, dias: dias, listas: [] };
      recalcular();
      telaResultado();
    } catch (e) {
      if (e instanceof M.ArquivoInvalido) erro(e.message);
      else { console.error(e); erro("Não consegui ler esse arquivo. Confira se é a planilha do municiamento."); }
    } finally {
      ocupado(botao, false);
    }
  }

  function recalcular() {
    estado.listas = estado.sexta ? M.montarListas(estado.res.alunos, estado.sexta, estado.dias) : [];
  }

  function novaPlanilha() {
    estado = null; // solta os dados da memória
    $("form-envio").reset();
    caixasDias($("dias-envio"), M.DIAS_LISTA);
    mostrarArquivos();
    erro("");
    mostrar($("tela-resultado"), false);
    mostrar($("tela-envio"), true);
    mostrar($("botao-nova"), false);
    $("conteudo").focus();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- tela 2

  function telaResultado() {
    mostrar($("tela-envio"), false);
    mostrar($("tela-resultado"), true);
    mostrar($("botao-nova"), true);
    limparFiltros();
    desenharResultado();
    $("conteudo").focus();
    window.scrollTo(0, 0);
  }

  function desenharResultado() {
    var res = estado.res, temListas = estado.listas.length > 0, n = res.avisos.length;
    $("titulo-resultado").textContent = temListas ? "Listas prontas" : "Falta a data da sexta-feira";
    $("formato").textContent = estado.leitura.formato;
    $("resumo").textContent = plural(estado.listas.length, "lista") + " · " + plural(res.alunos.length, "aluno") + " · " +
      plural(res.turmas.length, "turma") + " · " + plural(n, "aviso");

    mostrar($("aviso-pdf"), estado.leitura.formato === "PDF");
    mostrar($("cartao-baixar"), temListas);
    mostrar($("area-listas"), temListas);
    mostrar($("sem-data"), !estado.sexta);
    mostrar($("data-lida"), !!estado.sexta && estado.sexta === estado.leitura.sextaSugerida);
    $("sexta-ajuste").value = estado.sexta || "";
    caixasDias($("dias-ajuste"), estado.dias);
    $("botao-ajustar").textContent = temListas ? "Atualizar listas" : "Gerar listas";
    $("botao-ajustar").className = "botao largo " + (temListas ? "secundario" : "principal");

    var turmas = $("lista-turmas");
    turmas.textContent = "";
    res.turmas.forEach(function (t) {
      var li = el("li");
      li.appendChild(el("strong", null, t.codigo));
      li.appendChild(document.createTextNode(" " + plural(t.alunos, "aluno")));
      turmas.appendChild(li);
    });

    var graves = res.avisos.filter(function (a) { return a.grave; }).length, lista = $("avisos-lista");
    $("conf-resumo").textContent = plural(res.turmas.length, "turma") + " · " +
      (n ? plural(n, "aviso") + (graves ? " (" + graves + " importante" + (graves > 1 ? "s" : "") + ")" : "") : "nenhum aviso");
    $("conf-resumo").classList.toggle("tem-grave", graves > 0);
    mostrar($("avisos-secao"), n > 0);
    $("avisos-titulo").textContent = n === 1 ? "Aviso" : "Avisos";
    lista.textContent = "";
    res.avisos.slice().sort(function (a, b) { return b.grave - a.grave; }).forEach(function (a) {
      lista.appendChild(el("li", a.grave ? "grave" : null, a.texto));
    });
    $("conferencia").open = graves > 0;

    preencherFiltros();
    desenharListas();
  }

  function opcoes(select, valores) {
    var atual = select.value;
    while (select.options.length > 1) select.remove(1);
    valores.forEach(function (v) { var o = el("option", null, v[1]); o.value = v[0]; select.appendChild(o); });
    select.value = valores.some(function (v) { return v[0] === atual; }) ? atual : "";
  }

  // Na versão completa, as listas saem sempre com os 7 dias, e dia, refeição e grupo
  // são caixas no filtro: dá para marcar vários.
  var VARIOS = M.REGRA === "completa";

  // caixas novas vêm marcadas; as que já existiam guardam a escolha
  function opcoesVarias(destino, valores) {
    var desmarcados = diasMarcados(destino, true);
    caixas(destino, valores, valores.map(function (v) { return v[0]; }).filter(function (v) {
      return desmarcados.indexOf(v) < 0;
    }));
  }

  // todas marcadas = sem filtro (null); senão, a lista do que está marcado (pode ser vazia)
  function escolhidos(destino) {
    var marcadas = diasMarcados(destino);
    return marcadas.length === destino.querySelectorAll("input").length ? null : marcadas;
  }

  function limparFiltros() {
    ["filtro-dia", "filtro-ref", "filtro-grupo", "filtro-sit"].forEach(function (id) { $(id).value = ""; });
    Array.prototype.forEach.call(document.querySelectorAll(".filtro-varios input"), function (c) { c.checked = true; });
  }

  function preencherFiltros() {
    opcoes($("filtro-dia"), estado.dias.map(function (d) { return [d, d]; }));
    var refeicoes = M.REFEICOES.map(function (r) { return [r, r]; });
    var presentes = {};
    estado.listas.forEach(function (l) { presentes[l.grupo] = l.grupoRotulo; });
    var grupos = Object.keys(presentes).map(function (g) { return [g, presentes[g]]; });
    if (VARIOS) {
      opcoesVarias($("caixas-dia"), estado.dias.map(function (d) { return [d, d]; }));
      opcoesVarias($("caixas-ref"), refeicoes);
      opcoesVarias($("caixas-grupo"), grupos);
    } else {
      opcoes($("filtro-ref"), refeicoes);
      opcoes($("filtro-grupo"), grupos);
    }
  }

  function filtroAtual() {
    return { dia: VARIOS ? escolhidos($("caixas-dia")) : $("filtro-dia").value,
      refeicao: VARIOS ? escolhidos($("caixas-ref")) : $("filtro-ref").value,
      grupo: VARIOS ? escolhidos($("caixas-grupo")) : $("filtro-grupo").value,
      situacao: $("filtro-sit").value };
  }

  function desenharListas() {
    var f = filtroAtual(), filtrando = !!(f.dia || f.refeicao || f.grupo || f.situacao);
    var listas = M.filtrar(estado.listas, f);
    $("contagem").textContent = listas.length || !filtrando ? plural(listas.length, "lista")
      : "Nenhuma lista: marque pelo menos um dia, uma refeição e um grupo.";
    mostrar($("limpar-filtro"), filtrando);
    mostrar($("baixar-filtro"), filtrando);
    $("texto-filtro").textContent = "Só o filtro atual (" + plural(listas.length, "lista") + "):";
    $("texto-todas").textContent = "Todas as " + estado.listas.length + " listas:";
    ["baixar-docx", "baixar-pdf"].forEach(function (id) {
      var b = $(id);
      b.textContent = filtrando ? (id === "baixar-docx" ? "DOCX" : "PDF") : (id === "baixar-docx" ? "Baixar DOCX" : "Baixar PDF");
      b.className = "botao " + (filtrando ? "secundario" : "principal");
    });

    var destino = $("listas");
    destino.textContent = "";
    listas.forEach(function (l) {
      var det = el("details", "lista"), sum = el("summary");
      var titulo = el("span", "lista-titulo");
      titulo.appendChild(document.createTextNode(M.formatarData(l.data, true) + " · " + l.refeicao + " · " + l.grupoRotulo + " · "));
      if (!l.municiados) {
        titulo.appendChild(el("strong", "nao", "NÃO"));
        titulo.appendChild(document.createTextNode(" "));
      }
      titulo.appendChild(document.createTextNode("Municiados"));
      sum.appendChild(titulo);
      sum.appendChild(el("span", "lista-qtd", String(l.alunos.length)));
      det.appendChild(sum);
      det.addEventListener("toggle", function () {
        if (!det.open || det.dataset.pronta) return;
        det.dataset.pronta = "1"; // só monta os nomes quando abre
        if (!l.alunos.length) { det.appendChild(el("p", "vazio", "Nenhum aluno nesta lista.")); return; }
        var ol = el("ol", "nomes");
        l.alunos.forEach(function (a) {
          var li = el("li", null, a[0] + " ");
          li.appendChild(el("span", "turma", a[1]));
          ol.appendChild(li);
        });
        det.appendChild(ol);
      });
      destino.appendChild(det);
    });
  }

  function ajustar(ev) {
    ev.preventDefault();
    erro("");
    var sexta = $("sexta-ajuste").value, dias = diasMarcados($("dias-ajuste"));
    if (!sexta || !M.ehSexta(sexta)) return erro("Informe uma data que seja sexta-feira (a primeira coluna da planilha).");
    if (!dias.length) return erro("Marque pelo menos um dia.");
    estado.sexta = sexta;
    estado.dias = dias;
    recalcular();
    desenharResultado();
  }

  async function baixar(ev) {
    var botao = ev.currentTarget, formato = botao.dataset.baixar;
    var f = botao.dataset.filtro ? filtroAtual() : {};
    var listas = M.filtrar(estado.listas, f);
    if (!listas.length) return;
    erro("");
    ocupado(botao, true, "Gerando…");
    await deixarPintar();
    try {
      var bytes = formato === "docx" ? await M.gerarDocx(listas) : M.gerarPdf(listas);
      var tipo = formato === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
      var url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
      var a = el("a");
      a.href = url;
      a.download = M.nomeArquivo(estado.sexta, formato, f);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) {
      console.error(e);
      erro("Não consegui gerar o arquivo. Tente de novo; se continuar, avise quem cuida do sistema.");
    } finally {
      ocupado(botao, false);
    }
  }

  // ---------------------------------------------------------------- início

  function tema() {
    var raiz = document.documentElement, botao = $("botao-tema");
    function marcar() { botao.setAttribute("aria-pressed", raiz.getAttribute("data-tema") === "escuro" ? "true" : "false"); }
    marcar();
    botao.addEventListener("click", function () {
      var novo = raiz.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
      raiz.setAttribute("data-tema", novo);
      try { localStorage.setItem("municiamento-tema", novo); } catch (e) { /* sem armazenamento */ }
      marcar();
    });
  }

  M.iniciar = function () {
    tema();
    caixasDias($("dias-envio"), M.DIAS_LISTA);
    $("planilha").addEventListener("change", mostrarArquivos);
    // no celular não há "passar o mouse": tocar no ícone abre e fecha o balão
    Array.prototype.forEach.call(document.querySelectorAll(".botao-info"), function (b) {
      b.addEventListener("click", function () { b.parentNode.classList.toggle("aberta"); });
      b.addEventListener("blur", function () { b.parentNode.classList.remove("aberta"); });
    });
    var area = $("area-envio");
    ["dragenter", "dragover"].forEach(function (t) { area.addEventListener(t, function () { area.classList.add("arrastando"); }); });
    ["dragleave", "drop"].forEach(function (t) { area.addEventListener(t, function () { area.classList.remove("arrastando"); }); });
    $("form-envio").addEventListener("submit", gerar);
    $("form-ajustar").addEventListener("submit", ajustar);
    $("botao-nova").addEventListener("click", novaPlanilha);
    ["filtro-dia", "filtro-ref", "filtro-grupo", "filtro-sit", "caixas-dia", "caixas-ref", "caixas-grupo"].forEach(function (id) {
      $(id).addEventListener("change", desenharListas); // nas caixas, o "change" sobe até o grupo
    });
    // as caixas de dias da geração continuam no formulário, todas marcadas, só escondidas
    mostrar($("campo-dias-envio"), !VARIOS);
    mostrar($("campo-dias-ajuste"), !VARIOS);
    if (VARIOS) $("t-data").textContent = "Data";
    mostrar($("rotulo-filtro-dia"), !VARIOS);
    mostrar($("varios-dia"), VARIOS);
    mostrar($("rotulo-filtro-ref"), !VARIOS);
    mostrar($("rotulo-filtro-grupo"), !VARIOS);
    mostrar($("varios-ref"), VARIOS);
    mostrar($("varios-grupo"), VARIOS);
    mostrar($("regras-padrao"), M.REGRA !== "completa"); // o quadro "O que vem em cada lista" segue a versão
    mostrar($("regras-completa"), M.REGRA === "completa");
    $("filtros").addEventListener("submit", function (ev) { ev.preventDefault(); });
    $("limpar-filtro").addEventListener("click", function () {
      limparFiltros();
      desenharListas();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-baixar]"), function (b) { b.addEventListener("click", baixar); });
    mostrarArquivos();
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
