/* Interface da versão "rela": ler a planilha, montar listas (dia, refeição, ano) em abas,
   marcar quem veio, pesquisar por nome de guerra ou código, finalizar a marcação e gerar a rela
   (ordem alfabética ou por antiguidade, por ano ou por turma, junta ou separada) para copiar ou baixar em PDF.
   Aberto no computador, tudo fica na memória da página; nada é guardado. Na versão hospedada (Municiamento.HOSPEDADO,
   definido pelo servidor), a planilha da semana carrega sozinha, só administradores a publicam e as marcações de
   cada pessoa são salvas sozinhas (cifradas) como rascunho. */
(function (M) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  // {leitura, res, sexta, listas: [lista], ativa, relaTodas}
  // lista: {id, dia, refeicao, ano, alunos, marcados: Set, finalizada, criterio, agrupar, separar}
  var estado = null, proximoId = 1;
  var rascunhoTimer = null, rascunhoPronto = false; // rascunho automático (só na versão hospedada)
  var geral = null; // conferência geral (versão hospedada): {aberta, opcoes, dia, refeicao, dados, lista}

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function botao(classe, texto, acao) {
    var b = el("button", "botao " + classe, texto);
    b.type = "button";
    b.addEventListener("click", acao);
    return b;
  }
  function mostrar(e, sim) { e.classList.toggle("oculto", !sim); }
  function plural(n, palavra) { return n + " " + palavra + (n === 1 ? "" : "s"); }

  function erro(msg) {
    var e = $("erro");
    e.textContent = msg || "";
    mostrar(e, !!msg);
    if (msg) e.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function ocupado(b, sim, texto) {
    if (sim) { b.dataset.texto = b.textContent; b.textContent = texto; }
    else if (b.dataset.texto) { b.textContent = b.dataset.texto; }
    b.disabled = sim;
  }
  function deixarPintar() { return new Promise(function (ok) { setTimeout(ok, 30); }); }

  function temMarcacoes() {
    return !!estado && estado.listas.some(function (l) { return l.marcados.size > 0; });
  }
  function listaAtiva() {
    return estado.listas.filter(function (l) { return l.id === estado.ativa; })[0] || null;
  }
  // a escolha de turmas só vale no agrupamento por turma
  function opcoesDe(l) {
    return { criterio: l.criterio, agrupar: l.agrupar, separar: l.separar, turmas: l.agrupar === "turma" ? l.turmas : null,
      mostrar: l.mostrar };
  }

  /** Redesenha o painel que está na tela: o da lista ativa ou o da conferência geral. */
  function refazer() { if (geral && geral.aberta) desenharGeral(); else desenharPainel(); }

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

  async function ler(ev) {
    ev.preventDefault();
    erro("");
    var arquivos = $("planilha").files;
    if (!arquivos.length) return erro("Escolha o arquivo da planilha.");
    var b = $("botao-ler");
    ocupado(b, true, "Lendo a planilha…");
    await deixarPintar();
    try {
      await M.garantirBibliotecas(); // as bibliotecas de leitura só rodam quando precisam
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
      estado = { leitura: leitura, res: res, sexta: informada || leitura.sextaSugerida, listas: [], ativa: null, relaTodas: false,
        origem: "arquivo", planilhaId: null, meta: null };
      rascunhoPronto = false;
      telaListas();
    } catch (e) {
      if (e instanceof M.ArquivoInvalido) erro(e.message);
      else { console.error(e); erro("Não consegui ler esse arquivo. Confira se é a planilha do municiamento."); }
    } finally {
      ocupado(b, false);
    }
  }

  function novaPlanilha() {
    if (temMarcacoes() && !window.confirm("Trocar de planilha? As listas abertas e as marcações serão perdidas.")) return;
    estado = null; // solta os dados da memória
    $("form-envio").reset();
    mostrarArquivos();
    erro("");
    mostrar($("tela-listas"), false);
    mostrar($("tela-envio"), true);
    mostrar($("botao-nova"), false);
    $("conteudo").focus();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- tela 2

  function opcoes(select, valores) {
    select.textContent = "";
    valores.forEach(function (v) { var o = el("option", null, v[1]); o.value = v[0]; select.appendChild(o); });
  }

  function preencherConfig() {
    var datas = estado.sexta ? M.datasDaSemana(estado.sexta) : null, atual = $("cfg-dia").value;
    opcoes($("cfg-dia"), M.DIAS_LISTA.map(function (d) {
      return [d, d + (datas ? " (" + M.formatarData(datas[d], true) + ")" : "")];
    }));
    if (atual) $("cfg-dia").value = atual;
    if (!$("cfg-refeicao").options.length) {
      var rotulos = { "Café": "Café da manhã", "Almoço": "Almoço", "Janta": "Janta", "Ceia": "Ceia" };
      opcoes($("cfg-refeicao"), M.REFEICOES_TODAS.map(function (r) { return [r, rotulos[r]]; }));
    }
    opcoes($("cfg-ano"), M.anosPresentes(estado.res.alunos).map(function (a) {
      return [a, M.rotuloAno(a) + " (" + plural(M.alunosDoAno(estado.res.alunos, a).length, "aluno") + ")"];
    }));
  }

  function telaListas() {
    mostrar($("tela-envio"), false);
    mostrar($("tela-listas"), true);
    mostrar($("botao-nova"), true);
    var res = estado.res, n = res.avisos.length;
    $("formato").textContent = estado.leitura.formato;
    $("resumo").textContent = plural(res.alunos.length, "aluno") + " · " + plural(res.turmas.length, "turma") + " · " +
      plural(n, "aviso");
    mostrar($("aviso-pdf"), estado.leitura.formato === "PDF");
    $("cfg-dia").textContent = "";
    $("cfg-refeicao").textContent = "";
    preencherConfig();
    desenharData();
    desenharConferencia();
    atualizarPublicacao();
    fecharRelaTodas();
    desenharAbas();
    $("conteudo").focus();
    window.scrollTo(0, 0);
  }

  function desenharData() {
    $("sexta-ajuste").value = estado.sexta || "";
    mostrar($("data-lida"), !!estado.sexta && estado.sexta === estado.leitura.sextaSugerida);
    mostrar($("sem-data"), !estado.sexta);
  }

  function desenharConferencia() {
    var res = estado.res, n = res.avisos.length;
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
  }

  function criarLista(ev) {
    ev.preventDefault();
    var l = { id: proximoId++, dia: $("cfg-dia").value, refeicao: $("cfg-refeicao").value, ano: $("cfg-ano").value,
      marcados: new Set(), finalizada: false, criterio: "alfabetica", agrupar: "ano", separar: false, turmas: null,
      mostrar: "todos", turmasMarcacao: null, marcacaoPorTurma: false, filtroMarcacao: "todos" };
    l.alunos = M.alunosDoAno(estado.res.alunos, l.ano);
    estado.listas.push(l);
    estado.ativa = l.id;
    desenharAbas();
    // alguém pode ter publicado o rancho corrido depois que o app abriu: busca de novo e refaz o painel só se mudou
    var antes = JSON.stringify(estado.rancho || {});
    carregarRancho().then(function () { if (JSON.stringify(estado.rancho || {}) !== antes && estado.ativa === l.id && !l.finalizada) desenharPainel(); });
    var busca = $("busca-aluno");
    if (busca) busca.focus();
  }

  function rotuloAba(l) {
    return l.dia + " · " + l.refeicao + " · " + M.rotuloAno(l.ano);
  }

  function desenharAbas() {
    var abas = $("abas"), tem = estado.listas.length > 0;
    mostrar($("sem-listas"), !tem);
    mostrar(abas, tem);
    mostrar($("painel"), tem);
    mostrar($("cartao-todas"), estado.listas.length > 1);
    mostrar($("barra-rascunho"), tem);
    abas.textContent = "";
    estado.listas.forEach(function (l) {
      var ativa = l.id === estado.ativa;
      var aba = el("div", "aba" + (ativa ? " ativa" : ""));
      var b = el("button", "aba-nome");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", ativa ? "true" : "false");
      b.setAttribute("aria-controls", "painel");
      b.appendChild(document.createTextNode(rotuloAba(l) + " "));
      b.appendChild(el("span", "aba-qtd", l.marcados.size + "/" + l.alunos.length + (l.finalizada ? " ✓" : "")));
      b.addEventListener("click", function () { estado.ativa = l.id; desenharAbas(); });
      var x = el("button", "aba-fechar", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Fechar a lista " + rotuloAba(l));
      x.addEventListener("click", function () { fecharLista(l); });
      aba.appendChild(b);
      aba.appendChild(x);
      abas.appendChild(aba);
    });
    desenharPainel();
    atualizarRelaTodas();
    agendarRascunho();
  }

  function fecharLista(l) {
    if (l.marcados.size && !window.confirm("Fechar a lista " + rotuloAba(l) + "? As marcações dela serão perdidas.")) return;
    var i = estado.listas.indexOf(l);
    estado.listas.splice(i, 1);
    if (estado.ativa === l.id) {
      var vizinha = estado.listas[Math.min(i, estado.listas.length - 1)];
      estado.ativa = vizinha ? vizinha.id : null;
    }
    if (estado.listas.length < 2) fecharRelaTodas();
    desenharAbas();
  }

  /** Atualiza só os números (sem redesenhar a lista, para não perder a pesquisa nem a rolagem). */
  function atualizarContagens(l) {
    var qtd = document.querySelector(".aba.ativa .aba-qtd");
    if (qtd) qtd.textContent = l.marcados.size + "/" + l.alunos.length + (l.finalizada ? " ✓" : "");
    var c = $("painel-contagem");
    if (c) c.textContent = plural(l.marcados.size, "marcado") + " de " + plural(l.alunos.length, "aluno") +
      (l.finalizada ? " · na rela, só os marcados, separados pela planilha" : "");
    atualizarRelaTodas();
    agendarRascunho();
  }

  /** Escolha entre opções, em formato de pílulas (botões de rádio). */
  function escolha(titulo, nome, valores, atual, aoMudar) {
    var grupo = el("fieldset", "escolha");
    grupo.appendChild(el("legend", null, titulo));
    var caixas = el("div", "dias");
    valores.forEach(function (v) {
      var rotulo = el("label", "opcao");
      var r = el("input");
      r.type = "radio"; r.name = nome; r.value = v[0]; r.checked = v[0] === atual;
      r.addEventListener("change", function () { if (r.checked) aoMudar(v[0]); });
      rotulo.appendChild(r);
      rotulo.appendChild(document.createTextNode(" " + v[1]));
      caixas.appendChild(rotulo);
    });
    grupo.appendChild(caixas);
    return grupo;
  }

  function desenharPainel() {
    var painel = $("painel"), l = listaAtiva();
    painel.textContent = "";
    if (!l) return;
    painel.appendChild(el("h2", "painel-titulo", M.tituloRela(l, estado.sexta)));
    painel.appendChild(el("p", "dica", "")).id = "painel-contagem";
    var opcoesTopo = el("div", "painel-opcoes");
    opcoesTopo.appendChild(escolha("Ordem", "ordem-" + l.id, [["alfabetica", "Alfabética"], ["antiguidade", "Antiguidade"]],
      l.criterio, function (v) { l.criterio = v; desenharPainel(); }));
    painel.appendChild(opcoesTopo);
    if (l.finalizada) desenharResultado(painel, l, opcoesTopo);
    else desenharMarcacao(painel, l);
    atualizarContagens(l);
  }

  // ---------------------------------------------------------------- fase 1: marcar quem veio

  function desenharMarcacao(painel, l) {
    // filtro de turmas antes de marcar: a lista mostra só as turmas escolhidas
    painel.appendChild(escolhaTurmas(l, "turmasMarcacao"));
    var chaveRefeicao = M.chaveMarca(l.dia, l.refeicao);
    var rotuloRefeicao = l.refeicao + " de " + l.dia;
    // filtro de situação: mostrar só municiados ou só NÃO municiados (conforme a planilha, naquele dia e refeição)
    var baseFiltro = l.alunos.filter(function (a) { return !l.turmasMarcacao || l.turmasMarcacao.indexOf(a.turma) >= 0; });
    var nMunic = baseFiltro.filter(function (a) { return !!a.marcas[chaveRefeicao]; }).length;
    painel.appendChild(escolha("Mostrar", "filtro-" + l.id, [
      ["todos", "Todos (" + baseFiltro.length + ")"],
      ["municiados", "Municiados (" + nMunic + ")"],
      ["nao", "NÃO municiados (" + (baseFiltro.length - nMunic) + ")"]
    ], l.filtroMarcacao || "todos", function (v) { l.filtroMarcacao = v; desenharPainel(); }));
    // alerta: quem é marcado sem estar municiado na planilha naquele dia e refeição
    var alerta = el("p", "alerta-marcacao oculto");
    alerta.setAttribute("role", "alert");
    var idxRancho = ranchoDaLista(l); // quem está de rancho corrido neste dia e nesta refeição (publicado por qualquer pessoa)
    function piscar(e) { mostrar(e, true); e.classList.remove("piscar"); void e.offsetWidth; e.classList.add("piscar"); } // reinicia a animação a cada alerta
    // aviso laranja do rancho corrido: toque nele para ver o motivo
    var alertaRancho = el("button", "alerta-rancho oculto");
    alertaRancho.type = "button";
    alertaRancho.setAttribute("role", "alert");
    var ranchoMostrado = null;
    function textoRancho(a, rancho, aberto) {
      alertaRancho.textContent = "";
      alertaRancho.appendChild(document.createTextNode("Atenção: " + a.nome + " (" + a.turma + ") está de RANCHO CORRIDO." + (aberto ? " Motivo: " + rancho.motivo + "." : "")));
      if (!aberto) alertaRancho.appendChild(el("span", "dica-toque", "Toque aqui para ver o motivo"));
    }
    alertaRancho.addEventListener("click", function () { if (ranchoMostrado) textoRancho(ranchoMostrado.a, ranchoMostrado.r, true); });
    function avisar(a, municiado, rancho) {
      if (!municiado) {
        alerta.textContent = "Atenção: " + a.nome + " (" + a.turma + ") NÃO está municiado na " + rotuloRefeicao + ".";
        piscar(alerta);
      }
      if (rancho) {
        ranchoMostrado = { a: a, r: rancho };
        textoRancho(a, rancho, false);
        piscar(alertaRancho);
      } else {
        mostrar(alertaRancho, false);
      }
    }
    var busca = el("div", "busca");
    var rotulo = el("label", null, "Pesquisar");
    rotulo.htmlFor = "busca-aluno";
    var campo = el("input");
    campo.type = "search";
    campo.id = "busca-aluno";
    campo.placeholder = "Nome de guerra ou código (ex.: SILVA ou B1003)";
    campo.autocomplete = "off";
    busca.appendChild(rotulo);
    busca.appendChild(campo);
    painel.appendChild(busca);
    painel.appendChild(alerta);
    painel.appendChild(alertaRancho);
    var nRancho = l.alunos.filter(function (a) { return M.ranchoDoAluno(idxRancho, a); }).length;
    if (nRancho) {
      painel.appendChild(el("p", "aviso-rancho", plural(nRancho, "aluno") + (nRancho === 1 ? " desta lista está" : " desta lista estão") +
        " de RANCHO CORRIDO neste dia (aparece o selo e o motivo ao lado do nome)."));
    }
    var status = el("p", "dica busca-status");
    status.setAttribute("aria-live", "polite");
    painel.appendChild(status);

    function listaParaMarcar() {
      var alunos = M.ordenarAlunos(l.alunos, l.criterio).filter(function (a) {
        return (!l.turmasMarcacao || l.turmasMarcacao.indexOf(a.turma) >= 0) && passaFiltro(a);
      });
      return [{ titulo: M.tituloRela(l, estado.sexta), situacao: M.rotuloListaParaMarcar(l.filtroMarcacao),
        secoes: [{ nome: null, total: alunos.length, grupos: gruposDaMarcacao(alunos) }] }];
    }
    function passaFiltro(a) {
      var f = l.filtroMarcacao || "todos";
      return f === "todos" || (f === "municiados") === !!a.marcas[chaveRefeicao];
    }
    var acoes = el("div", "painel-acoes");
    acoes.appendChild(botao("principal", "Finalizar marcação", function () {
      l.finalizada = true;
      desenharAbas();
      $("painel").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    acoes.appendChild(menuBaixar("Baixar lista", "secundario", function (formato, resumo) {
      baixar(resumo, listaParaMarcar(), true, nomeArquivo(l, "lista-para-marcar", M.sufixoListaParaMarcar(l.filtroMarcacao)), formato);
    }));
    painel.appendChild(acoes);
    var extras = el("div", "painel-extras");
    extras.appendChild(botao("link", l.marcacaoPorTurma ? "Juntar as turmas" : "Separar por turma", function () {
      l.marcacaoPorTurma = !l.marcacaoPorTurma;
      desenharPainel();
    }));
    extras.appendChild(botao("link", "Desmarcar todos", function () {
      if (!l.marcados.size || !window.confirm("Desmarcar todos os alunos desta lista?")) return;
      l.marcados.clear();
      Array.prototype.forEach.call(painel.querySelectorAll(".aluno input"), function (c) { c.checked = false; });
      atualizarContagens(l);
    }));
    painel.appendChild(extras);

    function gruposDaMarcacao(alunos) {
      if (!l.marcacaoPorTurma) return [{ turma: null, alunos: alunos }];
      var porTurma = {};
      alunos.forEach(function (a) { (porTurma[a.turma] = porTurma[a.turma] || []).push(a); });
      return Object.keys(porTurma).sort(M.comparar).map(function (t) { return { turma: t, alunos: porTurma[t] }; });
    }
    var blocos = [], itens = [];
    gruposDaMarcacao(M.ordenarAlunos(l.alunos, l.criterio)).forEach(function (g) {
      var bloco = el("section", "bloco-turma");
      if (g.turma) bloco.appendChild(el("h4", "folha-turma", "Turma " + g.turma + " · " + plural(g.alunos.length, "aluno")));
      var ol = el("ol", "alunos");
      bloco.appendChild(ol);
      painel.appendChild(bloco);
      var doBloco = g.alunos.map(function (a) { return criarItem(a, ol); });
      blocos.push({ el: bloco, itens: doBloco });
      itens = itens.concat(doBloco);
    });

    function criarItem(a, ol) {
      var chave = M.chaveAluno(a), municiado = !!a.marcas[chaveRefeicao], rancho = M.ranchoDoAluno(idxRancho, a);
      var li = el("li", "aluno" + (rancho ? " rancho-corrido" : ""));
      var lab = el("label");
      var caixa = el("input");
      caixa.type = "checkbox";
      caixa.checked = l.marcados.has(chave);
      li.classList.toggle("nao-municiado", caixa.checked && !municiado);
      caixa.addEventListener("change", function () {
        if (caixa.checked) l.marcados.add(chave); else l.marcados.delete(chave);
        li.classList.toggle("nao-municiado", caixa.checked && !municiado);
        if (caixa.checked) avisar(a, municiado, rancho);
        atualizarContagens(l);
      });
      lab.appendChild(caixa);
      lab.appendChild(el("span", "aluno-nome", a.nome));
      lab.appendChild(el("span", "turma", a.turma));
      lab.appendChild(el("span", "aluno-codigo", a.codigo || "s/ código"));
      lab.appendChild(el("span", "selo-nao-municiado", "NÃO municiado"));
      var motivo = null;
      if (rancho) {
        // o selo é um botão: toque para ver o motivo embaixo do nome (e de novo para esconder)
        var selo = el("button", "selo-rancho", "RANCHO CORRIDO");
        selo.type = "button";
        selo.setAttribute("aria-expanded", "false");
        selo.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var abrir = motivo.classList.contains("oculto");
          mostrar(motivo, abrir);
          selo.setAttribute("aria-expanded", abrir ? "true" : "false");
        });
        lab.appendChild(selo);
      }
      li.appendChild(lab);
      if (rancho) {
        motivo = el("p", "rancho-motivo oculto", "Motivo do rancho corrido: " + rancho.motivo + " (publicado por " + rancho.por + ")");
        li.appendChild(motivo);
      }
      ol.appendChild(li);
      return { li: li, caixa: caixa, aluno: a, municiado: municiado, rancho: rancho, busca: M.normalizar(a.nome + " " + a.codigo) };
    }

    function filtrar() {
      var termo = M.normalizar(campo.value), visiveis = [];
      itens.forEach(function (it) {
        var ok = (!l.turmasMarcacao || l.turmasMarcacao.indexOf(it.aluno.turma) >= 0) && passaFiltro(it.aluno) &&
          (!termo || it.busca.indexOf(termo) >= 0);
        it.li.classList.toggle("oculto", !ok);
        if (ok) visiveis.push(it);
      });
      // turma sem ninguém visível some inteira (com o título)
      blocos.forEach(function (b) { b.el.classList.toggle("oculto", !b.itens.some(function (it) { return !it.li.classList.contains("oculto"); })); });
      status.textContent = !termo ? "" : !visiveis.length ? "Ninguém encontrado." :
        visiveis.length === 1 ? "Aperte Enter para marcar." : plural(visiveis.length, "aluno") + " encontrados.";
      return visiveis;
    }
    campo.addEventListener("input", filtrar);
    filtrar();
    // Enter com um só resultado marca o aluno e limpa a pesquisa: dá para conferir a fila só digitando
    campo.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var v = filtrar();
      if (v.length !== 1) return;
      var it = v[0], a = it.aluno, ja = it.caixa.checked;
      if (!ja) {
        it.caixa.checked = true;
        l.marcados.add(M.chaveAluno(a));
        it.li.classList.toggle("nao-municiado", !it.municiado);
        atualizarContagens(l);
      }
      campo.value = "";
      filtrar();
      status.textContent = a.nome + " (" + a.turma + ") " + (ja ? "já estava marcado." : "marcado.");
      if (!ja) avisar(a, it.municiado, it.rancho);
    });
  }

  // ---------------------------------------------------------------- fase 2: a rela

  function desenharResultado(painel, l, opcoesTopo) {
    if (!l.geral) opcoesTopo.appendChild(escolha("Agrupar", "agrupar-" + l.id, [["ano", "Ano inteiro"], ["turma", "Por turma"]],
      l.agrupar, function (v) { l.agrupar = v; refazer(); }));
    opcoesTopo.appendChild(escolha("Mostrar", "mostrar-" + l.id,
      [["todos", "Todos"], ["municiados", "Municiados"], ["nao", "NÃO municiados"]],
      l.mostrar, function (v) { l.mostrar = v; refazer(); }));
    if (l.agrupar === "turma" && !l.geral) painel.appendChild(escolhaTurmas(l)); // a conferência geral agrupa por turma, mas não filtra turmas

    var acoes = el("div", "painel-acoes");
    var todos = l.mostrar === "todos"; // separar só faz sentido mostrando as duas situações
    // com uma folha só, o Baixar dela já basta; o de cima só aparece quando há duas listas separadas
    if (M.relaEstruturada(l, l.marcados, estado.sexta, opcoesDe(l)).length > 1) {
      acoes.appendChild(menuBaixar("Baixar as duas listas", "principal", function (formato, resumo) {
        baixar(resumo, M.relaEstruturada(l, l.marcados, estado.sexta, opcoesDe(l)), false, nomeArquivo(l, "rela"), formato);
      }));
      painel.appendChild(acoes);
    }
    var extras = el("div", "painel-extras");
    if (todos && !l.geral) extras.appendChild(botao("link", l.separar ? "Juntar numa lista só" : "Separar em duas listas", function () {
      l.separar = !l.separar;
      refazer();
    }));
    if (!l.geral) extras.appendChild(botao("link", "Voltar a marcar", function () {
      l.finalizada = false;
      desenharAbas();
    }));
    if (extras.children.length) painel.appendChild(extras);

    var folhas = el("div", "folhas");
    M.relaEstruturada(l, l.marcados, estado.sexta, opcoesDe(l)).forEach(function (f) {
      folhas.appendChild(folhaNaTela(f, nomeArquivo(l, "rela", f.situacao)));
    });
    painel.appendChild(folhas);
  }

  /** Caixas com as turmas da lista: só as marcadas entram na rela (todas marcadas = null, sem filtro). */
  function escolhaTurmas(l, campo) {
    campo = campo || "turmas"; // "turmas" (agrupamento da rela) ou "turmasMarcacao" (filtro da marcação)
    var todas = M.turmasDaLista(l), grupo = el("fieldset", "escolha escolha-turmas");
    grupo.appendChild(el("legend", null, "Turmas"));
    var caixas = el("div", "dias");
    todas.forEach(function (t) {
      var rotulo = el("label", "opcao");
      var c = el("input");
      c.type = "checkbox"; c.value = t; c.checked = !l[campo] || l[campo].indexOf(t) >= 0;
      rotulo.appendChild(c);
      rotulo.appendChild(document.createTextNode(" " + t));
      caixas.appendChild(rotulo);
    });
    caixas.addEventListener("change", function () {
      var marcadas = Array.prototype.filter.call(caixas.querySelectorAll("input"), function (c) { return c.checked; })
        .map(function (c) { return c.value; });
      l[campo] = marcadas.length === todas.length ? null : marcadas;
      refazer();
    });
    grupo.appendChild(caixas);
    var atalhos = el("div", "atalhos-turmas");
    atalhos.appendChild(botao("link", "Marcar todas", function () { l[campo] = null; refazer(); }));
    atalhos.appendChild(botao("link", "Desmarcar todas", function () { l[campo] = []; refazer(); }));
    grupo.appendChild(atalhos);
    if (l[campo] && !l[campo].length) grupo.appendChild(el("p", "dica", "Marque pelo menos uma turma."));
    return grupo;
  }

  function rotuloSituacao(s) { return s === "MUNICIADOS" ? "Municiados" : "NÃO municiados"; }

  /** Uma folha da rela na tela, com cara de documento: cabeçalho (nome, contagem, data e botões) e os nomes
      numerados em colunas, com o subtítulo de cada turma. O Copiar copia o mesmo texto de M.textoFolha. */
  function folhaNaTela(f, nome) {
    var caixa = el("article", "folha");
    var topo = el("header", "folha-topo");
    var titulo = el("div", "folha-titulo");
    var h = el("h3", null, f.situacao ? rotuloSituacao(f.situacao) : "Rela");
    if (f.situacao) h.appendChild(el("span", "folha-qtd", String(f.secoes[0].total)));
    titulo.appendChild(h);
    titulo.appendChild(el("p", "folha-sub", f.titulo));
    topo.appendChild(titulo);
    var acoes = el("div", "folha-acoes");
    var status = el("span", "folha-status");
    status.setAttribute("aria-live", "polite");
    acoes.appendChild(status);
    acoes.appendChild(botao("principal pequeno", "Copiar", function () { copiarTexto(M.textoFolha(f), status); }));
    acoes.appendChild(menuBaixar("Baixar", "secundario pequeno", function (formato, resumo) {
      baixar(resumo, [f], false, nome, formato);
    }));
    topo.appendChild(acoes);
    caixa.appendChild(topo);
    f.secoes.forEach(function (s) {
      var sec = el("section", "folha-secao");
      if (!f.situacao) {
        var hs = el("h4", "folha-secao-titulo", rotuloSituacao(s.nome));
        hs.appendChild(el("span", "folha-qtd", String(s.total)));
        sec.appendChild(hs);
      }
      if (!s.total) sec.appendChild(el("p", "vazio", "Nenhum aluno."));
      else s.grupos.forEach(function (g) {
        if (g.turma) sec.appendChild(el("h5", "folha-turma", "Turma " + g.turma + " · " + plural(g.alunos.length, "aluno")));
        var ol = el("ol", "folha-nomes");
        g.alunos.forEach(function (a) {
          var li = el("li");
          li.appendChild(el("span", "fn-codigo", a.codigo || "s/ código"));
          li.appendChild(el("span", "fn-nome", a.nome));
          li.appendChild(el("span", "fn-turma", a.turma));
          ol.appendChild(li);
        });
        sec.appendChild(ol);
      });
      caixa.appendChild(sec);
    });
    return caixa;
  }

  /** Botão "Baixar PDF" (o app gera só PDF). aoEscolher recebe o formato e o próprio botão. */
  function menuBaixar(rotulo, classe, aoEscolher) {
    var b = el("button", "botao " + classe, rotulo === "Baixar" ? "Baixar PDF" : rotulo + " (PDF)");
    b.type = "button";
    b.setAttribute("data-baixar", "pdf");
    b.addEventListener("click", function () { aoEscolher("pdf", b); });
    return b;
  }
  function fecharMenus(ev) {
    Array.prototype.forEach.call(document.querySelectorAll("details.menu-suspenso[open]"), function (m) {
      if (!ev || !m.contains(ev.target)) m.open = false;
    });
  }

  // ---------------------------------------------------------------- rela de todas as listas

  function folhasDeTodas() {
    return estado.listas.reduce(function (todas, l) {
      return todas.concat(M.relaEstruturada(l, l.marcados, estado.sexta, opcoesDe(l)));
    }, []);
  }

  function abrirRelaTodas() {
    estado.relaTodas = true;
    mostrar($("rela"), true);
    $("rela-status").textContent = "";
    atualizarRelaTodas();
    $("rela").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function atualizarRelaTodas() {
    if (!estado || !estado.relaTodas) return;
    var destino = $("rela-folhas");
    destino.textContent = "";
    estado.listas.forEach(function (l) {
      M.relaEstruturada(l, l.marcados, estado.sexta, opcoesDe(l)).forEach(function (f) {
        destino.appendChild(folhaNaTela(f, nomeArquivo(l, "rela", f.situacao)));
      });
    });
  }

  function fecharRelaTodas() {
    if (estado) estado.relaTodas = false;
    mostrar($("rela"), false);
  }

  /** Copia o texto para a área de transferência; se o navegador não deixar, tenta o jeito antigo com uma caixa de
      texto escondida. Mostra o resultado em `status`. */
  function copiarTexto(texto, status) {
    function ok() { status.textContent = "Copiado!"; }
    function manual() {
      var area = el("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      var feito = false;
      try { feito = document.execCommand("copy"); } catch (e) { /* navegador antigo */ }
      area.remove();
      status.textContent = feito ? "Copiado!" : "Não deu para copiar.";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, manual);
    else manual();
  }

  /** Nome do arquivo baixado: rela_2026-10-23_janta_3ano[_municiados].pdf (sem data, o nome do dia). */
  function nomeArquivo(l, tipo, situacao) {
    var dia = estado.sexta ? M.datasDaSemana(estado.sexta)[l.dia] : l.dia;
    var partes = [tipo, dia, l.refeicao, l.geral ? "geral" : l.ano + "ano"];
    if (situacao) partes.push(situacao);
    return M.semAcento(partes.join("_")).toLowerCase().replace(/\s+/g, "-");
  }

  /** Gera o PDF das folhas (cada folha numa página nova, com o brasão de fundo) e baixa o arquivo.
      comCaixas: a lista para marcar à mão, com [   ] ao lado de cada nome. */
  async function baixar(b, folhas, comCaixas, nome, formato) {
    erro("");
    ocupado(b, true, "Gerando…");
    await deixarPintar();
    try {
      await M.garantirBibliotecas();
      var bytes = M.gerarRelaPdf(folhas, comCaixas);
      var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      var a = el("a");
      a.href = url;
      a.download = nome + "." + formato;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) {
      console.error(e);
      erro("Não consegui gerar o arquivo. Tente de novo; se continuar, avise quem cuida do sistema.");
    } finally {
      ocupado(b, false);
    }
  }

  // ---------------------------------------------------------------- versão hospedada

  function ehAdmin() { return !!M.HOSPEDADO && M.HOSPEDADO.perfil === "admin"; }

  function dataHora(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  /** Quem publicou a planilha e se ela já está publicada; o cartão de publicar é só do administrador. */
  function atualizarPublicacao() {
    var info = $("info-semana"), publicada = estado.origem === "publicada";
    if (!M.HOSPEDADO) { mostrar(info, false); mostrar($("cartao-publicar"), false); return; }
    var texto = "";
    if (publicada && estado.meta) {
      texto = "Planilha da semana publicada por " + estado.meta.por + " em " + dataHora(estado.meta.em) + ". " +
        "Suas marcações são salvas sozinhas, cifradas, e só você as vê.";
    } else if (ehAdmin()) {
      texto = "Esta planilha ainda não foi publicada para os alunos.";
    }
    info.textContent = texto;
    mostrar(info, !!texto);
    mostrar($("cartao-publicar"), ehAdmin() && !publicada);
  }

  /** Ao abrir o app: busca a planilha publicada e as marcações salvas da pessoa. */
  async function carregarSemana() {
    erro("");
    mostrar($("tela-envio"), false);
    mostrar($("sem-semana"), false);
    mostrar($("tela-listas"), false);
    mostrar($("tela-carregando"), true);
    var r = await M.api("GET", "/api/planilha"); // o download começa já; só o desenho espera a abertura acabar
    await M.aberturaTerminou();
    mostrar($("tela-carregando"), false);
    if (r.status === 401) { window.location.href = "/"; return; }
    if (r.status === 200 && r.json && r.json.dados) {
      try {
        var p = M.desempacotarPlanilha(r.json.dados);
        estado = { leitura: { formato: p.formato, avisos: [], sextaSugerida: p.sexta }, res: p.res, sexta: p.sexta, listas: [],
          ativa: null, relaTodas: false, origem: "publicada", planilhaId: r.json.id, meta: { por: r.json.por, em: r.json.em } };
        proximoId = 1;
        rascunhoPronto = false;
        telaListas();
        await restaurarRascunho();
        await carregarRancho();
        if (estado.listas.length) desenharAbas(); // os avisos de rancho corrido entram nas listas já abertas
        rascunhoPronto = true;
        return;
      } catch (e) {
        console.error(e);
        erro("Não consegui abrir a planilha da semana.");
      }
    } else if (r.status !== 404) {
      erro("Não consegui carregar a planilha da semana. Confira a conexão e tente de novo.");
    }
    mostrar(ehAdmin() ? $("tela-envio") : $("sem-semana"), true);
  }

  async function restaurarRascunho() {
    var r = await M.api("GET", "/api/rascunho");
    if (r.status === 200 && r.json && r.json.dados) {
      var prox = M.aplicarRascunho(estado, r.json.dados);
      if (prox) {
        proximoId = prox;
        preencherConfig();
        desenharData();
        desenharAbas();
        statusRascunho("Rascunho restaurado.");
      }
    }
  }

  function statusRascunho(texto) { var e = $("rascunho-status"); if (e) e.textContent = texto || ""; }
  function hora() { return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

  /** Salva o rascunho um instante depois da última mudança (várias marcações seguidas viram um só envio). */
  function agendarRascunho() {
    if (!M.HOSPEDADO || !rascunhoPronto || !estado || estado.origem !== "publicada") return;
    clearTimeout(rascunhoTimer);
    statusRascunho("Salvando…");
    rascunhoTimer = setTimeout(function () { salvarRascunho(false); }, 800);
  }

  async function salvarRascunho(mantem) {
    clearTimeout(rascunhoTimer);
    rascunhoTimer = null;
    if (!M.HOSPEDADO || !estado || estado.origem !== "publicada") return;
    var tem = estado.listas.length > 0;
    var r = tem ? await M.api("PUT", "/api/rascunho", M.empacotarRascunho(estado, proximoId), mantem)
      : await M.api("DELETE", "/api/rascunho", undefined, mantem);
    statusRascunho(r.status === 200 ? (tem ? "Rascunho salvo às " + hora() + "." : "")
      : r.status === 401 ? "Sua sessão acabou. Entre de novo para continuar salvando."
      : r.status === 0 ? "Sem conexão: as marcações ainda não foram salvas." : "Não consegui salvar o rascunho.");
  }

  /** Apaga as listas, as marcações e o rascunho salvo (para usar depois de finalizar). A planilha continua aberta. */
  async function limparTudo() {
    if (!estado) return;
    var extra = M.HOSPEDADO ? ", inclusive o rascunho salvo no servidor" : "";
    if (!window.confirm("Apagar todas as listas e marcações" + extra + "? Isso não pode ser desfeito.")) return;
    estado.listas = [];
    estado.ativa = null;
    proximoId = 1;
    fecharRelaTodas();
    desenharAbas();
    if (M.HOSPEDADO && estado.origem === "publicada") {
      await salvarRascunho(false);
      statusRascunho("Marcações e dados apagados.");
    }
  }

  /** Administrador: guarda a planilha lida no servidor (cifrada) para os alunos abrirem sozinha. */
  async function publicar() {
    var b = $("botao-publicar"), st = $("publicar-status");
    st.textContent = "";
    ocupado(b, true, "Publicando…");
    try {
      var r = await M.api("POST", "/api/planilha", { dados: M.empacotarPlanilha(estado.res, estado.sexta, estado.leitura.formato) });
      if (r.status === 200 && r.json && r.json.ok) {
        estado.origem = "publicada";
        estado.planilhaId = r.json.id;
        estado.meta = { por: r.json.por, em: r.json.em };
        rascunhoPronto = true;
        atualizarPublicacao();
        agendarRascunho();
      } else {
        st.textContent = (r.json && r.json.erro) || "Não consegui publicar. Tente de novo.";
      }
    } finally {
      ocupado(b, false);
    }
  }

  function iniciarHospedado() {
    var p = document.querySelector(".privacidade");
    if (p) {
      p.textContent = "A planilha que você publicar fica guardada cifrada no servidor por até 14 dias; os alunos a abrem sozinha. " +
        "As marcações de cada pessoa são salvas sozinhas, cifradas, só para ela, por até 7 dias.";
    }
    carregarSemana();
  }


  // ---------------------------------------------------------------- conferência geral (todos os usuários)

  function horaDe(ms) {
    return ms ? new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  }

  /** nome: "listas" (o app), "geral" ou "rancho". O menu esconde o item da tela em que a pessoa já está e mostra "Voltar ao app" nas outras. */
  function irParaTela(nome) {
    mostrar($("tela-geral"), nome === "geral");
    mostrar($("tela-rancho"), nome === "rancho");
    mostrar($("tela-listas"), nome === "listas" && !!estado);
    if (geral) geral.aberta = nome === "geral";
    Array.prototype.forEach.call(document.querySelectorAll("[data-voltar-app]"), function (a) { a.hidden = nome === "listas"; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-abrir-geral]"), function (a) { a.hidden = nome === "geral"; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-abrir-rancho]"), function (a) { a.hidden = nome === "rancho"; });
  }
  function mostrarTelaGeral(sim) { irParaTela(sim ? "geral" : "listas"); }

  /** Abre a tela: busca no servidor quais dias e refeições têm quem conferiu. */
  async function abrirGeral() {
    erro("");
    if (!M.HOSPEDADO || !estado || estado.origem !== "publicada") {
      return erro("A conferência geral usa a planilha da semana publicada. Quando ela estiver publicada, abra de novo.");
    }
    geral = { aberta: true, opcoes: [], dia: null, refeicao: null, dados: null, lista: null };
    mostrar($("tela-envio"), false);
    mostrarTelaGeral(true);
    $("geral-opcoes").textContent = "";
    mostrar($("geral-conferentes"), false);
    mostrar($("geral-painel"), false);
    window.scrollTo(0, 0);
    await carregarOpcoesGeral();
  }

  async function carregarOpcoesGeral() {
    var st = $("geral-status"), ops = $("geral-opcoes");
    st.textContent = "Buscando quem conferiu…";
    var r = await M.api("GET", "/api/conferencia-geral");
    if (r.status === 401) { window.location.href = "/"; return; }
    if (r.status !== 200 || !r.json) {
      st.textContent = r.status === 404 ? "Não há planilha publicada." : "Não consegui buscar agora. Tente de novo.";
      return;
    }
    if (r.json.planilha !== estado.planilhaId) {
      st.textContent = "A planilha publicada mudou. Recarregue a página para abrir a nova.";
      return;
    }
    geral.opcoes = r.json.opcoes;
    ops.textContent = "";
    if (!geral.opcoes.length) { st.textContent = "Ninguém marcou presença hoje ainda. As listagens só valem no próprio dia e somem no dia seguinte."; return; }
    st.textContent = "Escolha a refeição para juntar o que todos os conferentes marcaram. As listagens só valem no próprio dia.";
    geral.opcoes.forEach(function (o) {
      var b = el("button", "chip-geral" + (geral.dia === o.dia && geral.refeicao === o.refeicao ? " ativa" : ""));
      b.type = "button";
      b.appendChild(document.createTextNode(M.tituloRela({ dia: o.dia, refeicao: o.refeicao, rotuloAno: "geral" }, estado.sexta).replace(/ · geral$/, "") + " "));
      b.appendChild(el("span", "chip-qtd", plural(o.conferentes, "conferente")));
      b.addEventListener("click", function () { escolherGeral(o.dia, o.refeicao); });
      ops.appendChild(b);
    });
    if (geral.dia) await escolherGeral(geral.dia, geral.refeicao);
  }

  async function escolherGeral(dia, refeicao) {
    var st = $("geral-status");
    st.textContent = "Juntando as marcações…";
    var r = await M.api("GET", "/api/conferencia-geral?dia=" + encodeURIComponent(dia) + "&refeicao=" + encodeURIComponent(refeicao));
    if (r.status === 404 && r.json && r.json.expirada) { st.textContent = "Essa listagem é de outro dia e não está mais disponível."; return carregarOpcoesGeral(); }
    if (r.status !== 200 || !r.json) { st.textContent = "Não consegui juntar agora. Tente de novo."; return; }
    var anterior = geral.lista;
    geral.dia = dia; geral.refeicao = refeicao; geral.dados = r.json;
    var validos = new Set(estado.res.alunos.map(M.chaveAluno));
    var marcados = new Set(r.json.marcados.filter(function (k) { return validos.has(k); }));
    // mantém as escolhas de ordem, agrupamento e filtro ao atualizar ou trocar de refeição
    geral.lista = {
      geral: true, id: "geral", dia: dia, refeicao: refeicao, ano: "geral", rotuloAno: "Conferência geral", alunos: estado.res.alunos,
      // sempre por antiguidade e agrupada por turma; a única escolha da pessoa é o filtro Mostrar (guardado ao trocar de refeição)
      marcados: marcados, finalizada: true, criterio: "antiguidade", agrupar: "turma", separar: false, turmas: null,
      mostrar: anterior ? anterior.mostrar : "todos"
    };
    st.textContent = "";
    Array.prototype.forEach.call($("geral-opcoes").children, function (b, i) {
      var o = geral.opcoes[i];
      b.classList.toggle("ativa", !!o && o.dia === dia && o.refeicao === refeicao);
    });
    desenharGeral();
  }

  function desenharGeral() {
    var l = geral && geral.lista, d = geral && geral.dados;
    if (!l || !d) return;
    // quem conferiu
    var c = $("geral-conferentes");
    c.textContent = "";
    var h = el("h2", null, "Todos os conferentes");
    h.id = "t-geral-conf";
    c.appendChild(h);
    var t = el("table", "tabela-geral");
    var cab = el("tr");
    ["Conferente", "Listas", "Marcados", "Salvo em"].forEach(function (x) { cab.appendChild(el("th", null, x)); });
    t.appendChild(el("thead")).appendChild(cab);
    var corpo = el("tbody");
    d.conferentes.forEach(function (x) {
      var linha = el("tr");
      // data-rotulo: no celular cada linha vira um cartão com o nome da coluna ao lado do valor
      [["Conferente", x.nome], ["Listas", x.listas + (x.finalizadas ? " (" + x.finalizadas + " finalizada" + (x.finalizadas === 1 ? "" : "s") + ")" : "")],
        ["Marcados", String(x.marcados)], ["Salvo em", horaDe(x.em)]].forEach(function (c) {
        var td = el("td", null, c[1]);
        td.setAttribute("data-rotulo", c[0]);
        linha.appendChild(td);
      });
      corpo.appendChild(linha);
    });
    t.appendChild(corpo);
    var rolar = el("div", "rolar");
    rolar.appendChild(t);
    c.appendChild(rolar);
    mostrar(c, true);
    // a listagem geral, com as mesmas opções da rela
    var painel = $("geral-painel");
    painel.textContent = "";
    painel.appendChild(el("h2", "painel-titulo", M.tituloRela(l, estado.sexta)));
    var opcoesTopo = el("div", "painel-opcoes");
    painel.appendChild(opcoesTopo);
    desenharResultado(painel, l, opcoesTopo); // acrescenta o filtro Mostrar: Todos, Municiados ou NÃO municiados
    mostrar(painel, true);
  }

  function iniciarGeral() {
    iniciarRancho();
    var voltar = $("geral-voltar"), atualizar = $("geral-atualizar");
    if (!voltar || !atualizar) return;
    voltar.addEventListener("click", function () { mostrarTelaGeral(false); window.scrollTo(0, 0); });
    atualizar.addEventListener("click", function () { if (geral && geral.aberta) carregarOpcoesGeral(); else abrirGeral(); });
    // os itens "Conferência geral" e "Voltar ao app" do menu suspenso (colocados pelo servidor)
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest && ev.target.closest("[data-abrir-geral], [data-voltar-app], [data-abrir-rancho]");
      if (!a) return;
      ev.preventDefault();
      var m = a.closest("details");
      if (m) m.open = false;
      if (a.hasAttribute("data-voltar-app")) { irParaTela("listas"); window.scrollTo(0, 0); }
      else if (a.hasAttribute("data-abrir-rancho")) abrirRancho();
      else abrirGeral();
    });
  }


  // ---------------------------------------------------------------- rancho corrido (qualquer pessoa lê os arquivos e publica)

  var rancho = { leituras: [] };

  var NOME_TIPO = { autorizacao: "Autorização para rancho corrido", servico: "Tabela de serviço" };
  var dataBr = function (iso) { return iso.split("-").reverse().join("/"); };
  var hojeIso = function () { return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); }; // hoje em Brasília

  /** Busca no servidor quem está de rancho corrido nos dias da semana da planilha. */
  async function carregarRancho() {
    if (!M.HOSPEDADO || !estado || !estado.sexta) return;
    var datas = Object.keys(M.datasDaSemana(estado.sexta)).map(function (d) { return M.datasDaSemana(estado.sexta)[d]; });
    var r = await M.api("GET", "/api/planilha?rancho=" + datas.join(","));
    if (r.status === 200 && r.json && r.json.dias) estado.rancho = r.json.dias;
  }

  /** O índice (por número interno) de quem está de rancho corrido no dia e na refeição da lista. */
  function ranchoDaLista(l) {
    var dia = estado && estado.sexta ? M.datasDaSemana(estado.sexta)[l.dia] : null;
    if (M.fimDeSemana(dia)) return {}; // sábado e domingo: sem aviso de rancho corrido
    return M.indiceRancho(dia && estado.rancho ? estado.rancho[dia] : [], l.refeicao);
  }

  async function abrirRancho() {
    erro("");
    if (!M.HOSPEDADO || !estado || estado.origem !== "publicada") {
      return erro("O rancho corrido usa a planilha da semana publicada. Quando ela estiver publicada, abra de novo.");
    }
    mostrar($("tela-envio"), false);
    irParaTela("rancho");
    if (!$("rancho-data").value) $("rancho-data").value = hojeIso();
    window.scrollTo(0, 0);
    await carregarRancho();
    desenharPublicadosRancho();
  }

  function statusRancho(texto) { $("rancho-status").textContent = texto || ""; }

  /** Igual ao envio da planilha: mostra o que foi escolhido (e some quando não há nada). */
  function mostrarArquivosRancho() {
    var f = $("rancho-arquivos").files, nomes = [];
    for (var i = 0; i < f.length; i++) {
      var kb = f[i].size / 1024;
      nomes.push(f[i].name + " (" + (kb < 1024 ? Math.max(1, Math.round(kb)) + " KB" : (kb / 1024).toFixed(1).replace(".", ",") + " MB") + ")");
    }
    $("rancho-escolhidos").textContent = nomes.length ? "Escolhido: " + nomes.join(", ") : "";
    $("area-rancho").classList.toggle("com-arquivo", nomes.length > 0);
  }

  async function lerArquivosRancho() {
    var escolhidos = Array.prototype.slice.call($("rancho-arquivos").files || []);
    rancho.leituras = [];
    mostrar($("rancho-previa"), false);
    if (!escolhidos.length) return statusRancho("Escolha o arquivo do rancho corrido.");
    var b = $("rancho-ler");
    ocupado(b, true, "Lendo…");
    statusRancho("");
    try {
      await M.garantirBibliotecas();
      for (var i = 0; i < escolhidos.length && i < 6; i++) {
        var f = escolhidos[i];
        try {
          var bytes = new Uint8Array(await f.arrayBuffer());
          rancho.leituras.push(await M.lerRanchoArquivo({ nome: f.name, bytes: bytes }));
        } catch (e) {
          rancho.leituras.push({ nome: f.name, tipo: null, itens: [], data: null, avisos: [e && e.message ? e.message : "Não consegui ler esse arquivo."] });
        }
      }
      desenharPreviaRancho();
    } finally {
      ocupado(b, false);
    }
  }

  /** Dia de uma leitura: o do arquivo ou, se faltar, o escolhido na tela. */
  function diaDaLeitura(r) { return r.data || $("rancho-data").value || null; }
  /** Dia de um aluno: o do próprio item (tabela de serviço com mais de um dia) ou o da leitura. */
  function diaDoItem(i, r) { return i.d || diaDaLeitura(r); }

  function desenharPreviaRancho() {
    var c = $("rancho-previa");
    c.textContent = "";
    var h = el("h2", null, "Conferir antes de publicar");
    h.id = "t-rancho-previa";
    c.appendChild(h);
    var alunos = estado.res.alunos;
    var publicaveis = 0;
    rancho.leituras.forEach(function (r) {
      var caixa = el("div", "rancho-arquivo");
      caixa.appendChild(el("h3", null, r.nome));
      var dia = diaDaLeitura(r);
      var resumo = [r.tipo ? NOME_TIPO[r.tipo] : "Arquivo não reconhecido"];
      if (r.tipo) resumo.push(r.dias && r.dias.length > 1 ? "dias " + r.dias.map(dataBr).join(", ") : dia ? "dia " + dataBr(dia) : "sem data");
      if (r.refeicoes) resumo.push("refeição: " + r.refeicoes.join(" e "));
      if (r.motivo) resumo.push("motivo: " + r.motivo);
      resumo.push(plural(r.itens.length, "aluno"));
      caixa.appendChild(el("p", null, resumo.join(" · ")));
      (r.avisos || []).forEach(function (a) { caixa.appendChild(el("p", "aviso-rancho", a)); });
      if (r.itens.length) {
        var casados = M.casarRancho(r.itens, alunos), porDia = {};
        casados.forEach(function (x) { var d = diaDoItem(x.item, r) || "sem-data"; (porDia[d] = porDia[d] || []).push(x); });
        var dias = Object.keys(porDia).sort();
        dias.forEach(function (d) {
          var passou = d !== "sem-data" && d < hojeIso();
          var sec = el("details", "rancho-dia-previa");
          sec.open = dias.length === 1;
          sec.appendChild(el("summary", null, (d === "sem-data" ? "Sem data" : dataBr(d) + (d === hojeIso() ? " (hoje)" : "")) + " · " + plural(porDia[d].length, "aluno") +
            (passou ? " · já passou: não será publicado" : "")));
          var ol = el("ol", "rancho-alunos");
          porDia[d].forEach(function (x) {
            var li = el("li", x.aluno ? null : "fora");
            li.textContent = x.item.c + " · " + x.item.n + " — " + x.item.m + (x.aluno ? " (" + x.aluno.turma + (x.porNome ? "; número lido " + x.item.c + ", será usado o da planilha: " + x.aluno.codigo : "") + ")" : " (não está na planilha da semana)");
            ol.appendChild(li);
          });
          sec.appendChild(ol);
          caixa.appendChild(sec);
        });
        if (casados.some(function (x) { return !x.aluno; })) {
          caixa.appendChild(el("p", "dica", "Quem não está na planilha da semana também é publicado, mas só aparece o aviso se o número interno existir nela. Confira os números."));
        }
      }
      if (r.tipo && r.itens.some(function (i) { var d = diaDoItem(i, r); return d && d >= hojeIso(); })) publicaveis++;
      c.appendChild(caixa);
    });
    var b = botao("principal", publicaveis ? "Publicar rancho corrido" : "Nada para publicar", publicarRancho);
    b.disabled = !publicaveis;
    c.appendChild(b);
    mostrar(c, true);
    statusRancho(publicaveis ? "Confira os alunos e o dia; depois publique." : "Nenhum arquivo estava pronto para publicar. Veja os avisos acima.");
  }

  async function publicarRancho() {
    var porDia = {}, passados = {};
    rancho.leituras.forEach(function (r) {
      if (!r.tipo || !r.itens.length) return;
      M.casarRancho(r.itens, estado.res.alunos).forEach(function (x) {
        var dia = diaDoItem(x.item, r);
        if (!dia) return;
        if (dia < hojeIso()) { passados[dia] = true; return; } // o rancho corrido só vale no próprio dia: dia que passou não entra
        var d = porDia[dia] = porDia[dia] || { itens: [], origens: {} };
        d.origens[r.tipo === "servico" ? "s" : "a"] = true;
        d.itens.push({ c: x.aluno ? x.aluno.codigo : x.item.c, n: x.item.n, m: x.item.m, r: x.item.r, p: x.item.p || "" }); // com o número da planilha quando o do arquivo veio errado
      });
    });
    var dias = Object.keys(porDia).sort();
    if (!dias.length) return statusRancho("Esses dias já passaram: o rancho corrido só vale no próprio dia.");
    var b = $("rancho-previa").querySelector("button");
    ocupado(b, true, "Publicando…");
    var ok = [], falhas = [];
    for (var i = 0; i < dias.length; i++) {
      var d = porDia[dias[i]], origem = d.origens.a && d.origens.s ? "x" : d.origens.s ? "s" : "a";
      var r = await M.api("POST", "/api/planilha?rancho=" + dias[i], { origem: origem, itens: d.itens });
      if (r.status === 200 && r.json && r.json.ok) ok.push(dataBr(dias[i]) + " (" + plural(r.json.qtd, "aluno") + ")");
      else falhas.push(dataBr(dias[i]) + ": " + ((r.json && r.json.erro) || (r.status === 0 ? "sem conexão" : "não consegui publicar")));
    }
    ocupado(b, false);
    if (ok.length) {
      rancho.leituras = [];
      mostrar($("rancho-previa"), false);
      $("rancho-arquivos").value = "";
      mostrarArquivosRancho();
      await carregarRancho();
      if (estado.listas.length) desenharAbas(); // as listas abertas já mostram os avisos
      desenharPublicadosRancho();
    }
    var ignorados = Object.keys(passados).sort().map(dataBr);
    statusRancho((ok.length ? "Publicado: " + ok.join("; ") + ". " : "") + (ignorados.length ? "Dias que já passaram, não publicados: " + ignorados.join(", ") + ". " : "") +
      (falhas.length ? "Não deu certo: " + falhas.join("; ") + "." : ""));
  }

  /** O que já está publicado para os dias da semana da planilha. */
  function desenharPublicadosRancho() {
    var c = $("rancho-publicados");
    c.textContent = "";
    var h = el("h2", null, "Já publicado nesta semana");
    h.id = "t-rancho-publicados";
    c.appendChild(h);
    var dias = estado.rancho || {}, datas = Object.keys(dias).filter(function (d) { return dias[d] && dias[d].length; }).sort();
    if (!datas.length) {
      c.appendChild(el("p", "dica", "Ninguém publicou rancho corrido para os dias desta semana ainda."));
    } else {
      datas.forEach(function (d) {
        var caixa = el("div", "rancho-dia");
        var total = {};
        dias[d].forEach(function (p) { p.itens.forEach(function (i) { total[i.c] = true; }); });
        caixa.appendChild(el("p", null, dataBr(d) + " · " + plural(Object.keys(total).length, "aluno") + (d === hojeIso() ? " · hoje" : "")));
        c.appendChild(caixa);
      });
      c.appendChild(el("p", "dica", "Cada dia some sozinho à meia-noite do próprio dia. Se algo estiver errado, um administrador pode remover o dia pelo painel."));
    }
    mostrar(c, true);
  }

  function iniciarRancho() {
    var ler = $("rancho-ler");
    if (!ler) return;
    ler.addEventListener("click", lerArquivosRancho);
    $("rancho-arquivos").addEventListener("change", mostrarArquivosRancho);
    var area = $("area-rancho");
    ["dragenter", "dragover"].forEach(function (t) { area.addEventListener(t, function () { area.classList.add("arrastando"); }); });
    ["dragleave", "drop"].forEach(function (t) { area.addEventListener(t, function () { area.classList.remove("arrastando"); }); });
    $("rancho-data").addEventListener("change", function () { if (rancho.leituras.length) desenharPreviaRancho(); });
  }

  // ---------------------------------------------------------------- início

  function tema() {
    var raiz = document.documentElement, b = $("botao-tema");
    function marcar() { b.setAttribute("aria-pressed", raiz.getAttribute("data-tema") === "escuro" ? "true" : "false"); }
    marcar();
    b.addEventListener("click", function () {
      var novo = raiz.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
      raiz.setAttribute("data-tema", novo);
      try { localStorage.setItem("municiamento-tema", novo); } catch (e) { /* sem armazenamento */ }
      marcar();
    });
  }

  M.iniciar = function () {
    tema();
    $("planilha").addEventListener("change", mostrarArquivos);
    Array.prototype.forEach.call(document.querySelectorAll(".botao-info"), function (b) {
      b.addEventListener("click", function () { b.parentNode.classList.toggle("aberta"); });
      b.addEventListener("blur", function () { b.parentNode.classList.remove("aberta"); });
    });
    var area = $("area-envio");
    ["dragenter", "dragover"].forEach(function (t) { area.addEventListener(t, function () { area.classList.add("arrastando"); }); });
    ["dragleave", "drop"].forEach(function (t) { area.addEventListener(t, function () { area.classList.remove("arrastando"); }); });
    $("form-envio").addEventListener("submit", ler);
    $("form-lista").addEventListener("submit", criarLista);
    $("form-data").addEventListener("submit", function (ev) {
      ev.preventDefault();
      erro("");
      var sexta = $("sexta-ajuste").value || null;
      if (sexta && !M.ehSexta(sexta)) return erro("Informe uma data que seja sexta-feira (a primeira coluna da planilha).");
      estado.sexta = sexta;
      preencherConfig();
      desenharData();
      desenharAbas();
    });
    $("botao-nova").addEventListener("click", novaPlanilha);
    $("rela-todas").addEventListener("click", abrirRelaTodas);
    $("rela-copiar").addEventListener("click", function () {
      copiarTexto(folhasDeTodas().map(M.textoFolha).join("\n\n\n"), $("rela-status"));
    });
    $("rela-baixar").addEventListener("click", function () {
      var nome = "rela_todas-as-listas" + (estado.sexta ? "_" + estado.sexta : "");
      baixar($("rela-baixar"), folhasDeTodas(), false, nome, "pdf");
    });
    document.addEventListener("click", fecharMenus);
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fecharMenus(null); });
    $("botao-limpar").addEventListener("click", limparTudo);
    $("botao-publicar").addEventListener("click", publicar);
    $("botao-tentar").addEventListener("click", carregarSemana);
    $("rela-fechar").addEventListener("click", fecharRelaTodas);
    // fechar a aba sem querer apagaria as marcações: o navegador pergunta antes
    // (na versão hospedada as marcações já ficam salvas, então o aviso não é preciso)
    window.addEventListener("beforeunload", function (ev) {
      if (!M.HOSPEDADO && temMarcacoes()) { ev.preventDefault(); ev.returnValue = ""; }
    });
    // ao fechar ou esconder a página, o que ainda não foi salvo vai agora
    function descarregar() { if (rascunhoTimer) salvarRascunho(true); }
    window.addEventListener("pagehide", descarregar);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") descarregar(); });
    mostrarArquivos();
    M.carregarBibliotecasEmSegundoPlano();
    if (M.HOSPEDADO) { iniciarHospedado(); iniciarGeral(); }
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
