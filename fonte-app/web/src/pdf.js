/* PDF exportado do Google Sheets -> grades de células (com o pdf.js, no navegador).

   O texto simples do PDF perde as colunas, então a grade é montada pela geometria:
   - as colunas vêm da UNIÃO de todos os traços verticais da tabela da página. Em
     algumas linhas o PDF não desenha o traço entre duas células; como os limites
     vêm da tabela inteira, essas células não se fundem (era o defeito da versão
     que perdia marcações);
   - as linhas da tabela vêm dos traços horizontais;
   - cada texto vai para a célula onde começa; as marcações ("x", "x x") vão,
     letra por letra, para a coluna onde está o centro de cada letra.
   A tabela de totais (mais abaixo) é lida pela ordem dos textos. */
(function (M) {
  "use strict";

  var LIMITE_PAGINAS = 60;
  var REFEICOES = ["Café", "Almoço", "Janta", "Ceia"];

  function mult(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function aplicar(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  /** Segmentos retos dos caminhos traçados (stroke) da página, no espaço do PDF. */
  function segmentos(ol, OPS) {
    var ctm = [1, 0, 0, 1, 0, 0], pilha = [], caminho = [], verticais = [], horizontais = [];
    function guardar(a, b) {
      if (Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) > 2) verticais.push([(a[0] + b[0]) / 2, Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
      else if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 2) horizontais.push([(a[1] + b[1]) / 2, Math.min(a[0], b[0]), Math.max(a[0], b[0])]);
    }
    for (var i = 0; i < ol.fnArray.length; i++) {
      var f = ol.fnArray[i], a = ol.argsArray[i];
      if (f === OPS.save) pilha.push(ctm);
      else if (f === OPS.restore) ctm = pilha.pop() || ctm;
      else if (f === OPS.transform) ctm = mult(ctm, a);
      else if (f === OPS.constructPath) {
        var ops = a[0], c = a[1], k = 0, atual = null, inicio = null;
        for (var j = 0; j < ops.length; j++) {
          var op = ops[j];
          if (op === OPS.moveTo) { atual = inicio = aplicar(ctm, c[k], c[k + 1]); k += 2; }
          else if (op === OPS.lineTo) { var p = aplicar(ctm, c[k], c[k + 1]); k += 2; if (atual) caminho.push([atual, p]); atual = p; }
          else if (op === OPS.rectangle) {
            var x = c[k], y = c[k + 1], w = c[k + 2], h = c[k + 3]; k += 4;
            var q = [aplicar(ctm, x, y), aplicar(ctm, x + w, y), aplicar(ctm, x + w, y + h), aplicar(ctm, x, y + h)];
            caminho.push([q[0], q[1]], [q[1], q[2]], [q[2], q[3]], [q[3], q[0]]);
            atual = inicio = q[0];
          } else if (op === OPS.closePath) { if (atual && inicio) caminho.push([atual, inicio]); atual = inicio; }
          else if (op === OPS.curveTo) { k += 6; atual = null; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { k += 4; atual = null; }
        }
      } else if (f === OPS.stroke || f === OPS.closeStroke || f === OPS.fillStroke || f === OPS.eoFillStroke ||
                 f === OPS.closeFillStroke || f === OPS.closeEOFillStroke) {
        caminho.forEach(function (s) { guardar(s[0], s[1]); });
        caminho = [];
      } else if (f === OPS.fill || f === OPS.eoFill || f === OPS.endPath || f === OPS.clip || f === OPS.eoClip) {
        if (f !== OPS.clip && f !== OPS.eoClip) caminho = [];
      }
    }
    return { verticais: verticais, horizontais: horizontais };
  }

  /** Agrupa valores próximos (diferença <= tol) e devolve a média de cada grupo, em ordem. */
  function agrupar(valores, tol) {
    var v = valores.slice().sort(function (a, b) { return a - b; }), grupos = [];
    v.forEach(function (x) {
      var g = grupos[grupos.length - 1];
      if (g && x - g[g.length - 1] <= tol) g.push(x); else grupos.push([x]);
    });
    return grupos.map(function (g) { return g.reduce(function (s, x) { return s + x; }, 0) / g.length; });
  }

  function ehDia(t) {
    var n = M.normalizar(t);
    return n.length >= 5 && /^(sexta|sabado|domingo|segunda|terca|quarta|quinta)/.test(n);
  }
  function ehRotuloRefeicao(t) { return /^(cafe|almoco|janta|ceia)$/.test(M.normalizar(t)); }
  /** Pedaços da linha de refeições: 'Café Almoço Janta Ceia Café ...', 'Janta Ceia', 'Almoç'. */
  function soRefeicoes(t) { return /^(\s*(cafe|caf|almoco|almoc|alm|janta|jant|ceia)\s*)+$/.test(M.normalizar(t)); }

  /** Linhas de texto (por linha de base), de cima para baixo. */
  function linhasDeTexto(itens) {
    var ordenados = itens.slice().sort(function (a, b) { return b.y - a.y; }), linhas = [];
    ordenados.forEach(function (it) {
      var l = linhas[linhas.length - 1];
      if (l && l.y - it.y <= 2.5) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    });
    linhas.forEach(function (l) { l.itens.sort(function (a, b) { return a.x - b.x; }); });
    return linhas;
  }

  /** O pdf.js às vezes junta o código e as marcações vizinhas num texto só ('N3015 X'):
      separa as partes, estimando a posição de cada uma pela proporção dos caracteres. */
  function separar(it, saida) {
    var m = /^(\s*[BMN]\d{4})(\s+[xX](\s+[xX])*\s*)$/.exec(it.str);
    if (!m) { saida.push(it); return; }
    var passo = it.w / it.str.length;
    saida.push({ str: m[1].trim(), x: it.x, y: it.y, w: passo * m[1].length });
    for (var i = m[1].length; i < it.str.length; i++) {
      if (/[xX]/.test(it.str[i])) saida.push({ str: it.str[i], x: it.x + passo * i, y: it.y, w: passo });
    }
  }

  function coluna(bordas, x) {
    for (var i = 0; i + 1 < bordas.length; i++) if (x >= bordas[i] - 0.3 && x < bordas[i + 1] - 0.3) return i;
    return -1;
  }

  function juntar(atual, texto) { return atual ? atual + " " + texto : texto; }

  /** Uma página -> linhas da grade (ou [] se não houver tabela de turma). */
  function gradeDaPagina(itens, segs) {
    var linhas = linhasDeTexto(itens);
    var iDias = -1;
    for (var i = 0; i < linhas.length; i++) {
      if (linhas[i].itens.filter(function (it) { return ehDia(it.str); }).length >= 3) { iDias = i; break; }
    }
    if (iDias < 0) return [];
    // a linha de refeições (logo abaixo dos dias) separa a tabela da turma do resumo geral
    var palavrasRefeicao = 0;
    linhas.slice(iDias + 1, iDias + 3).forEach(function (l) {
      l.itens.forEach(function (it) {
        M.normalizar(it.str).split(/\s+/).forEach(function (p) { if (/^(caf|alm|jan|cei)/.test(p)) palavrasRefeicao++; });
      });
    });
    if (palavrasRefeicao < 8) return [];
    // fim da tabela principal: a linha de dias da tabela de totais (ou o fim da página)
    var iTotais = -1;
    for (var t = iDias + 1; t < linhas.length; t++) {
      if (linhas[t].itens.filter(function (it) { return ehDia(it.str); }).length >= 3) { iTotais = t; break; }
    }
    var yTopo = linhas[iDias].y + 12, yFim = iTotais >= 0 ? linhas[iTotais].y + 8 : -Infinity;

    var vert = segs.verticais.filter(function (s) { return s[2] > yFim && s[1] < yTopo; });
    var bordas = agrupar(vert.map(function (s) { return s[0]; }), 1.2);
    if (bordas.length < 6) return []; // sem a grade da tabela, não dá para confiar nas colunas
    var horiz = segs.horizontais.filter(function (s) { return s[0] > yFim - 1 && s[0] < yTopo + 20 && s[2] - s[1] > 40; });
    var faixas = agrupar(horiz.map(function (s) { return s[0]; }), 1.2).sort(function (a, b) { return b - a; });

    var ncol = bordas.length - 1, primeiraMarca = 2;
    var grade = [], linhaTurma = [""];
    // título da turma: o que estiver acima da linha dos dias
    for (var k = 0; k < iDias; k++) linhaTurma[0] = juntar(linhaTurma[0], linhas[k].itens.map(function (it) { return it.str; }).join(" "));
    grade.push(linhaTurma);

    var linhaDias = new Array(ncol).fill("");
    linhas[iDias].itens.forEach(function (it) {
      if (!ehDia(it.str)) return;
      var c = coluna(bordas, it.x + it.w / 2); // dia centralizado sobre as 4 colunas do grupo
      if (c < primeiraMarca) return;
      linhaDias[primeiraMarca + 4 * Math.floor((c - primeiraMarca) / 4)] = it.str;
    });
    grade.push(linhaDias);
    var linhaRef = new Array(ncol).fill("");
    for (var g = primeiraMarca; g + 3 < ncol; g += 4) for (var r = 0; r < 4; r++) linhaRef[g + r] = REFEICOES[r];
    grade.push(linhaRef);

    // linhas de alunos: cada texto entre a linha de refeições e os totais, posto na faixa (linha da tabela) certa
    var corpo = [];
    var limiteCorpo = iTotais >= 0 ? iTotais : linhas.length;
    var yRef = linhas[iDias].y - 4;
    for (var m = iDias + 1; m < limiteCorpo; m++) {
      linhas[m].itens.forEach(function (it) {
        if (soRefeicoes(it.str) || (it.y > yRef - 8 && /^(nome|numero)$/.test(M.normalizar(it.str)))) return;
        corpo.push(it);
      });
    }
    // faixa de cada texto: entre dois traços horizontais; sem traços, agrupa pela linha de base
    var porFaixa = new Map();
    corpo.forEach(function (it) {
      var chave = null;
      for (var f = 0; f + 1 < faixas.length; f++) {
        if (it.y + 1 <= faixas[f] && it.y + 1 > faixas[f + 1]) { chave = f; break; }
      }
      if (chave === null) chave = "y" + Math.round(it.y / 3);
      if (!porFaixa.has(chave)) porFaixa.set(chave, []);
      porFaixa.get(chave).push(it);
    });
    var chaves = Array.from(porFaixa.keys()).sort(function (a, b) {
      var ya = Math.max.apply(null, porFaixa.get(a).map(function (i) { return i.y; }));
      var yb = Math.max.apply(null, porFaixa.get(b).map(function (i) { return i.y; }));
      return yb - ya;
    });
    chaves.forEach(function (chave) {
      var linha = new Array(ncol).fill("");
      porFaixa.get(chave).sort(function (a, b) { return a.x - b.x; }).forEach(function (it) {
        var s = it.str;
        if (/^[xX](\s*[xX])*$/.test(s.trim()) && s.trim().length > 1) {
          // várias marcações num texto só: cada letra vai para a coluna do seu centro
          var passo = it.w / s.length;
          for (var p = 0; p < s.length; p++) {
            if (!/[xX]/.test(s[p])) continue;
            var cx = coluna(bordas, it.x + passo * (p + 0.5));
            if (cx >= 0) linha[cx] = juntar(linha[cx], s[p]);
          }
          return;
        }
        var c = coluna(bordas, it.x + Math.min(1, it.w / 2));
        if (c < 0) c = it.x < bordas[0] ? 0 : ncol - 1;
        linha[c] = juntar(linha[c], s.trim());
      });
      if (linha.some(function (x) { return x; })) grade.push(linha);
    });

    // tabela de totais: pela ordem dos textos
    if (iTotais >= 0) {
      grade.push([""].concat(linhas[iTotais].itens.filter(function (it) { return ehDia(it.str); }).map(function (it) { return it.str; })));
      for (var n = iTotais + 1; n < linhas.length; n++) {
        var its = linhas[n].itens.map(function (it) { return it.str.trim(); }).filter(Boolean);
        if (!its.length) continue;
        if (ehRotuloRefeicao(its[0])) grade.push(its);
        else if (/^\d+$/.test(its[0]) && grade.length && ehRotuloRefeicao(grade[grade.length - 1][0]) &&
                 grade[grade.length - 1].length === 1) grade[grade.length - 1] = grade[grade.length - 1].concat(its);
        else break;
      }
    }
    return grade;
  }

  /** bytes do PDF -> {formato, grades, sextaSugerida, avisos}. */
  M.lerPdf = async function (bytes) {
    var lib = globalThis.pdfjsLib;
    var doc;
    try {
      doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true,
        useSystemFonts: false, useWorkerFetch: false, stopAtErrors: false, verbosity: 0 }).promise;
    } catch (e) {
      throw new M.ArquivoInvalido("Não consegui abrir esse PDF. Exporte a planilha de novo.");
    }
    try {
      if (doc.numPages > LIMITE_PAGINAS) {
        throw new M.ArquivoInvalido("O PDF tem mais de " + LIMITE_PAGINAS + " páginas; não parece ser o do municiamento.");
      }
      var leitura = { formato: "PDF", grades: [], sextaSugerida: null, avisos: [] };
      for (var n = 1; n <= doc.numPages; n++) {
        var pagina = await doc.getPage(n);
        var conteudo = await pagina.getTextContent();
        var itens = [];
        conteudo.items.forEach(function (it) {
          if (it.str && it.str.trim()) separar({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }, itens);
        });
        var ol = await pagina.getOperatorList();
        var linhas = gradeDaPagina(itens, segmentos(ol, lib.OPS));
        if (linhas.length) {
          var g = new M.Grade(linhas, "página " + n);
          g.local = function () { return this.origem; };
          leitura.grades.push(g);
        } else if (!leitura.sextaSugerida) {
          var texto = itens.map(function (it) { return it.str; }).join(" ");
          if (/sexta\s*\(/i.test(M.normalizar(texto))) leitura.sextaSugerida = M.sextaDoTexto(texto);
        }
        pagina.cleanup();
      }
      return leitura;
    } finally {
      doc.destroy();
    }
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
