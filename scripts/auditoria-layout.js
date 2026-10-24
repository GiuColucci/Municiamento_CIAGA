/* Auditoria de layout (só para desenvolvimento): procura, na tela aberta, o que costuma quebrar no celular e no computador.
   Servida pelo servidor local em /_auditoria.js (npm run local). Uso, no console da página:
     window.auditarLayout()  ->  lista de problemas (vazia = tudo certo)
   O que confere:
   - rolagem horizontal (a página mais larga que a tela) e elementos que passam da borda direita;
   - caixas coladas: dois irmãos com borda ou fundo a menos de 6 px um do outro;
   - texto sobre texto: duas linhas de texto de elementos diferentes que se sobrepõem;
   - texto que escapa do botão, selo ou caixa que o contém;
   - texto cortado (overflow escondido com conteúdo maior que a caixa);
   - alvos de toque pequenos (botões e links com menos de 36 px de altura) em tela estreita;
   - texto muito pequeno (menos de 11 px). */
(function () {
  "use strict";

  function visivel(e) {
    if (!e || e.closest("script, style, template, noscript, [hidden], #abertura, .oculto")) return false;
    // conteúdo de um <details> fechado não aparece (o navegador ainda devolve medidas para ele)
    for (var d = e.closest("details:not([open])"); d; d = d.parentElement && d.parentElement.closest("details:not([open])")) {
      var resumo = d.querySelector(":scope > summary");
      if (!(resumo && resumo.contains(e))) return false;
    }
    var s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function rotulo(e) {
    if (!e || !e.tagName) return "?";
    return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  }
  /** Caixa de verdade (cartão): arredondada e com borda ou fundo. Linhas de divisão dentro de um cartão não contam. */
  function temCaixa(e) {
    var s = getComputedStyle(e);
    if (!(parseFloat(s.borderTopLeftRadius) > 0)) return false;
    return (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none") || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent");
  }

  /** Retângulos de texto (uma linha de cada vez) de todos os textos visíveis da página. */
  function textos() {
    var out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      var pai = n.parentElement;
      if (!visivel(pai) || pai.closest(".menu-suspenso-lista, .balao")) continue; // lista do menu e balão são camadas por cima: sobrepor o resto é o esperado
      var r = document.createRange();
      r.selectNodeContents(n);
      Array.prototype.forEach.call(r.getClientRects(), function (c) {
        if (c.width > 2 && c.height > 2) out.push({ r: c, el: pai, t: n.nodeValue.trim().slice(0, 28) });
      });
    }
    return out;
  }

  window.auditarLayout = function (opcoes) {
    opcoes = opcoes || {};
    var L = innerWidth, problemas = [], achados = {};
    function achar(tipo, texto) { var k = tipo + texto; if (achados[k] || problemas.length > 60) return; achados[k] = 1; problemas.push(tipo + ": " + texto); }

    // 1. rolagem horizontal
    if (document.documentElement.scrollWidth > L + 1) {
      achar("rolagem-horizontal", document.documentElement.scrollWidth + " px numa tela de " + L);
      var n = 0;
      document.querySelectorAll("body *").forEach(function (e) {
        if (n < 5 && visivel(e) && e.getBoundingClientRect().right > L + 1 && !e.closest(".menu-suspenso-lista")) { n++; achar("passa-da-borda", rotulo(e) + " termina em " + Math.round(e.getBoundingClientRect().right)); }
      });
    }

    // 2. caixas coladas
    document.querySelectorAll("body *").forEach(function (p) {
      if (!visivel(p) && p !== document.body) return;
      var f = Array.prototype.filter.call(p.children, function (e) { return visivel(e) && !["SCRIPT", "STYLE", "LINK"].includes(e.tagName) && getComputedStyle(e).position !== "absolute"; });
      for (var i = 1; i < f.length; i++) {
        var a = f[i - 1].getBoundingClientRect(), b = f[i].getBoundingClientRect(), gap = b.top - a.bottom;
        if (gap < 6 && gap > -1 && a.width > 100 && b.width > 100 && (temCaixa(f[i - 1]) || temCaixa(f[i])) && Math.abs(a.left - b.left) < 40) {
          achar("caixas-coladas", rotulo(p) + ": " + rotulo(f[i - 1]) + " → " + rotulo(f[i]) + " (espaço " + Math.round(gap) + " px)");
        }
      }
    });

    // 3. texto sobre texto
    var ts = textos();
    ts.sort(function (a, b) { return a.r.top - b.r.top; });
    for (var i = 0; i < ts.length; i++) {
      for (var j = i + 1; j < ts.length && ts[j].r.top < ts[i].r.bottom; j++) {
        var A = ts[i], B = ts[j];
        if (A.el === B.el || A.el.contains(B.el) && A.r.top === B.r.top && false) continue;
        var x = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), y = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (x > 3 && y > 3 && (x * y) > 0.25 * Math.min(A.r.width * A.r.height, B.r.width * B.r.height)) {
          achar("texto-sobre-texto", "“" + A.t + "” (" + rotulo(A.el) + ") e “" + B.t + "” (" + rotulo(B.el) + ")");
        }
      }
    }

    // 4. texto que escapa da caixa e texto cortado
    document.querySelectorAll("button, .botao, .chip-geral, [class*=selo], label, summary, .aba, .opcao, a.link-faixa").forEach(function (e) {
      if (!visivel(e)) return;
      var r = e.getBoundingClientRect(), s = getComputedStyle(e);
      var range = document.createRange();
      range.selectNodeContents(e);
      Array.prototype.forEach.call(range.getClientRects(), function (c) {
        if (c.width > 2 && (c.right > r.right + 1.5 || c.left < r.left - 1.5) && s.display !== "inline") achar("texto-escapa", rotulo(e) + " (“" + (e.textContent || "").trim().slice(0, 24) + "”)");
      });
    });
    document.querySelectorAll("body *").forEach(function (e) {
      if (!visivel(e)) return;
      var s = getComputedStyle(e);
      if ((s.overflowX === "hidden" || s.overflowX === "clip") && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && e.children.length === 0 && (e.textContent || "").trim()) {
        achar("texto-cortado", rotulo(e) + " (“" + e.textContent.trim().slice(0, 24) + "”)");
      }
    });

    // 5. alvos de toque pequenos e letras pequenas (celular)
    if (L <= 520 && !opcoes.semToque) {
      document.querySelectorAll("button, a.botao, a.link-faixa, .menu-suspenso-item, summary, input[type=checkbox], input[type=radio], select, input[type=text], input[type=search], input[type=date], input[type=file]").forEach(function (e) {
        if (!visivel(e) || e.closest(".aluno") && e.tagName === "INPUT") return;
        var r = e.getBoundingClientRect();
        if (r.height < 34 && !e.closest("p, li, .dica, .folha-acoes") && !(e.type === "radio" || e.type === "checkbox")) achar("alvo-pequeno", rotulo(e) + " tem " + Math.round(r.height) + " px de altura");
      });
    }
    document.querySelectorAll("body *").forEach(function (e) {
      if (!visivel(e) || e.children.length) return;
      var t = (e.textContent || "").trim();
      if (t && parseFloat(getComputedStyle(e).fontSize) < 11) achar("letra-pequena", rotulo(e) + " (" + getComputedStyle(e).fontSize + ")");
    });
    return problemas;
  };

  /** Roda a auditoria nos dois temas e devolve {claro: [...], escuro: [...]} (volta ao tema que estava). */
  window.auditarNosDoisTemas = async function (opcoes) {
    var raiz = document.documentElement, antes = raiz.getAttribute("data-tema"), out = {};
    for (var tema of ["claro", "escuro"]) {
      raiz.setAttribute("data-tema", tema);
      await new Promise(function (r) { setTimeout(r, 120); });
      out[tema] = window.auditarLayout(opcoes);
    }
    raiz.setAttribute("data-tema", antes || "escuro");
    return out;
  };

  /** Percorre as telas do app (como administrador, no servidor local de teste) e audita cada uma nos dois temas.
      Cria o que precisar com os dados FICTÍCIOS do servidor local: planilha de exemplo, rancho corrido e conferentes. */
  window.percorrerApp = async function () {
    var $ = function (id) { return document.getElementById(id); }, esperar = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var resultado = {};
    async function auditar(nome) { resultado[nome] = await window.auditarNosDoisTemas(); }
    async function arquivos(campo, nomes) {
      var dt = new DataTransfer();
      for (var n of nomes) { var b = await (await fetch("/" + n)).arrayBuffer(); dt.items.add(new File([b], n.replace(/^_/, ""), { type: n.endsWith(".pdf") ? "application/pdf" : "" })); }
      $(campo).files = dt.files;
    }
    var tela = function (id) { return $(id) && !$(id).classList.contains("oculto"); };
    if (tela("tela-envio")) {
      await arquivos("planilha", ["_exemplo.xlsx"]);
      $("planilha").dispatchEvent(new Event("change", { bubbles: true }));
      await auditar("1-envio");
      $("form-envio").requestSubmit();
      for (var k = 0; k < 40 && !tela("tela-listas"); k++) await esperar(500); // a primeira leitura carrega as bibliotecas
      var pub = $("botao-publicar"); if (pub) pub.click();
      for (var k2 = 0; k2 < 20 && $("cartao-publicar") && tela("cartao-publicar"); k2++) await esperar(500);
      await esperar(500);
    }
    await fetch("/_demo");
    await auditar("2-listas-sem-lista");
    // lista de hoje (sábado) no almoço, 1º ano
    $("cfg-dia").value = "Sábado"; $("cfg-refeicao").value = "Almoço"; $("cfg-ano").value = "1";
    $("form-lista").requestSubmit();
    await esperar(1500);
    await auditar("3-marcacao-vazia");
    Array.prototype.slice.call(document.querySelectorAll("#painel .aluno input")).slice(0, 4).forEach(function (c) { c.click(); });
    await auditar("4-marcacao-com-alerta");
    var sel = document.querySelector(".selo-rancho"); if (sel) sel.click();
    await auditar("5-marcacao-motivo-aberto");
    var sep = Array.prototype.find.call(document.querySelectorAll("#painel .painel-extras button"), function (b) { return /Separar por turma/.test(b.textContent); });
    if (sep) { sep.click(); await esperar(300); await auditar("6-marcacao-por-turma"); sep = Array.prototype.find.call(document.querySelectorAll("#painel .painel-extras button"), function (b) { return /Juntar/.test(b.textContent); }); if (sep) sep.click(); }
    var fin = Array.prototype.find.call(document.querySelectorAll("#painel .painel-acoes button"), function (b) { return /Finalizar/.test(b.textContent); });
    if (fin) { fin.click(); await esperar(500); await auditar("7-rela"); }
    // menu aberto
    document.querySelector("details.menu-suspenso > summary").click();
    await esperar(200);
    await auditar("8-menu-aberto");
    document.querySelector("[data-abrir-geral]").click();
    await esperar(1500);
    var chip = document.querySelector(".chip-geral"); if (chip) { chip.click(); await esperar(1500); }
    await auditar("9-conferencia-geral");
    document.querySelector("details.menu-suspenso > summary").click();
    document.querySelector("[data-abrir-rancho]").click();
    await esperar(1000);
    await auditar("10-rancho-vazio");
    await arquivos("rancho-arquivos", ["_exemplo-autorizacao.pdf", "_exemplo-servico.pdf"]);
    $("rancho-ler").click();
    await esperar(4000);
    await auditar("11-rancho-previa");
    var bt = $("rancho-previa").querySelector("button"); if (bt && !bt.disabled) { bt.click(); await esperar(2000); }
    await auditar("12-rancho-publicado");
    document.querySelector("details.menu-suspenso > summary").click();
    document.querySelector("[data-voltar-app]").click();
    await esperar(300);
    return resultado;
  };
})();
