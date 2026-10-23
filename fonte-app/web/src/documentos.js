/* Listas -> DOCX e PDF no estilo dos documentos da Marinha (sem assinaturas, sem rodapé).

   A paginação é decidida aqui (quantas linhas cabem por página) e os dois formatos
   desenham as mesmas páginas: o DOCX usa linhas de altura fixa e quebras de página
   explícitas, então o Word não repagina; o PDF é desenhado com as mesmas medidas.
   Imagem em M.IMAGENS.marca (base64): a marca d'água já clareada. Sem brasão no topo. */
(function (M) {
  "use strict";

  // medidas em pontos (A4 retrato)
  var PAG_L = 595.28, PAG_A = 841.89;
  // margens mínimas seguras para impressora (~6 mm em cima e embaixo): o máximo de nomes por página
  var MARGEM_LAT = 48, MARGEM_TOPO = 18, MARGEM_BASE = 18;
  var LARG_UTIL = PAG_L - 2 * MARGEM_LAT, LARG_COL = LARG_UTIL / 2;
  var PAD_CEL = 5, ALT_LINHA = 15, LINHA_TEXTO = 13;
  var MARCA_A = 470, MARCA_L = MARCA_A * 622 / 1000; // marca d'água: o brasão do CIAGA clarinho (622 x 1000 px)
  var CAIXA = "[   ]", FONTE_MAX = 11, FONTE_MIN = 8.5;
  // linhas por coluna (2 colunas por página), deixando folga para o Word não empurrar a última linha:
  // 1ª página: 18 + cabeçalho 88 + 46 x 15 + total 13 = 809 pt; continuação: 18 + 33,5 + 50 x 15 + 13 = 814,5 pt (limite 823,9)
  var LINHAS_PRIMEIRA = 46, LINHAS_CONTINUACAO = 50;
  // blocos de texto: [tamanho da fonte, altura exata da linha, espaço depois]
  // cabeçalho: brasão e o título "Municiamento" (sem as linhas da Marinha, do CIAGA e da EFOMM)
  var CAB_TITULO = [16, 18, 6], CAB_INFO = [12, 15, 0], CAB_TIPO = [12, 15, 4];
  var CONT_TITULO = [11, 13.5, 2], CONT_INFO = [11, 14, 4], TOTAL = [9, 11, 0], TOTAL_ANTES = 2;
  // título das listas impressas (o build define por versão: "Conferência" na impressa)
  function tituloDoc() { return M.TITULO_DOC || "Municiamento"; }
  M.MEDIDAS = { MARCA_L: MARCA_L, MARCA_A: MARCA_A, LINHAS_PRIMEIRA: LINHAS_PRIMEIRA, LINHAS_CONTINUACAO: LINHAS_CONTINUACAO };

  /** Cada lista começa em página nova. Em cada página a tabela é preenchida em
      colunas: desce a da esquerda, depois a da direita. */
  M.paginar = function (listas) {
    var paginas = [];
    listas.forEach(function (lista) {
      var itens = lista.alunos.map(function (a, i) { return [i + 1, a[0], a[1]]; });
      var pos = 0, primeira = true;
      for (;;) {
        var cap = primeira ? LINHAS_PRIMEIRA : LINHAS_CONTINUACAO;
        var parte = itens.slice(pos, pos + 2 * cap);
        pos += parte.length;
        var linhas = Math.ceil(parte.length / 2), ultima = pos >= itens.length;
        paginas.push({ lista: lista, primeira: primeira, ultima: ultima, linhas: linhas,
          colunas: [parte.slice(0, linhas), parte.slice(linhas)] });
        primeira = false;
        if (ultima) break;
      }
    });
    return paginas;
  };

  M.linhaInfo = function (l) { return "Dia " + M.formatarData(l.data) + " (" + l.diaExtenso + ")"; };
  M.textoTotal = function (l) { var n = l.alunos.length; return "Total: " + n + " aluno" + (n !== 1 ? "s" : ""); };

  M.nomeArquivo = function (sexta, ext, f) {
    f = f || {};
    var situacao = f.situacao === "municiados" ? "municiados" : f.situacao === "nao" ? "nao-municiados" : "";
    var partes = [M.semAcento(tituloDoc()).toLowerCase() + "_" + sexta].concat([f.dia, f.refeicao, f.grupo, situacao].map(function (v) {
      return Array.isArray(v) ? v.join("-") : v;
    }).filter(Boolean));
    return M.semAcento(partes.join("_")).toLowerCase().replace(/ /g, "-") + "." + ext;
  };

  // ---------------------------------------------------------------- medidas de texto (Times)

  var medidor = null;
  function largura(texto, tam, negrito) {
    if (!medidor) medidor = new jspdf.jsPDF({ unit: "pt", format: "a4" });
    medidor.setFont("times", negrito ? "bold" : "normal");
    medidor.setFontSize(tam);
    return medidor.getTextWidth(texto);
  }
  M.largura = largura;

  /** Cabe em uma linha da célula, ao lado da caixa (ou sem ela, com semCaixa): diminui a fonte até 8,5 pt e,
      se ainda não couber, corta com reticências. Igual no DOCX e no PDF. */
  M.ajustarRotulo = function (texto, semCaixa) {
    var disponivel = LARG_COL - 2 * PAD_CEL - (semCaixa ? 0 : largura(CAIXA, FONTE_MAX) + 6);
    var tam = FONTE_MAX;
    while (tam > FONTE_MIN && largura(texto, tam) > disponivel) tam -= 0.5;
    while (largura(texto, tam) > disponivel && texto.length > 4) texto = texto.slice(0, -2).replace(/\s+$/, "") + "…";
    return [texto, tam];
  };

  M.rotuloItem = function (numero, nome, turma) { return numero + ". " + M.limpar(nome) + " - " + turma; };

  // ---------------------------------------------------------------- DOCX (OOXML escrito à mão)

  var NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  var NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  var NS_WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  var NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  var NS_PIC = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var EMU = 12700;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function tw(pt) { return Math.round(pt * 20); }

  function run(texto, tam, opcoes) {
    opcoes = opcoes || {};
    // ordem exigida pelo Word: b, sz, u
    return "<w:r><w:rPr>" + (opcoes.negrito ? "<w:b/>" : "") + '<w:sz w:val="' + Math.round(tam * 2) + '"/>' +
      (opcoes.sublinhado ? '<w:u w:val="single"/>' : "") + "</w:rPr>" +
      (opcoes.tab ? "<w:tab/>" : "") + '<w:t xml:space="preserve">' + esc(texto) + "</w:t></w:r>";
  }

  function par(runs, fmt, opcoes) {
    opcoes = opcoes || {};
    return "<w:p><w:pPr>" + (opcoes.quebra ? "<w:pageBreakBefore/>" : "") + (opcoes.tabs || "") +
      '<w:spacing w:lineRule="exact" w:line="' + tw(fmt[1]) + '" w:before="' + tw(opcoes.antes || 0) +
      '" w:after="' + tw(fmt[2]) + '"/><w:jc w:val="' + (opcoes.alinh || "left") + '"/></w:pPr>' + runs + "</w:p>";
  }

  function tipoRuns(l, tam) {
    return l.municiados ? run("Municiados", tam)
      : run("NÃO", tam, { negrito: true, sublinhado: true }) + run(" Municiados", tam);
  }

  function imagem(id, nome, rid, l, a) {
    return "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic>" +
      '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + nome + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + l + '" cy="' + a + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
  }

  function tabela(pag) {
    return tabelaRotulos(pag.linhas, pag.colunas.map(function (col) {
      return col.map(function (item) { return M.rotuloItem(item[0], item[1], item[2]); });
    }), true);
  }

  /** Tabela de 2 colunas com linhas de altura exata; colunas = [[rótulo, ...], [rótulo, ...]]. */
  function tabelaRotulos(nLinhas, colunas, comCaixa) {
    // grade cinza só nas listas para marcar à mão (com a caixa); as outras saem sem linhas
    var borda = comCaixa ? 'w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"' : 'w:val="nil"';
    var x = "<w:tbl><w:tblPr>" +
      '<w:tblW w:w="' + tw(LARG_UTIL) + '" w:type="dxa"/>' +
      // o Word (modo 2010) puxa a tabela para fora pelo preenchimento; o recuo deixa a borda na margem
      '<w:tblInd w:w="' + tw(PAD_CEL) + '" w:type="dxa"/>' +
      "<w:tblBorders><w:top " + borda + "/><w:left " + borda + "/><w:bottom " + borda + "/><w:right " + borda +
      "/><w:insideH " + borda + "/><w:insideV " + borda + "/></w:tblBorders>" +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="' + tw(PAD_CEL) + '" w:type="dxa"/>' +
      '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="' + tw(PAD_CEL) + '" w:type="dxa"/></w:tblCellMar>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="' + tw(LARG_COL) + '"/><w:gridCol w:w="' + tw(LARG_COL) + '"/></w:tblGrid>';
    var tabs = '<w:tabs><w:tab w:val="right" w:pos="' + tw(LARG_COL - 2 * PAD_CEL) + '"/></w:tabs>';
    for (var i = 0; i < nLinhas; i++) {
      x += '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + tw(ALT_LINHA) + '" w:hRule="exact"/></w:trPr>';
      for (var c = 0; c < 2; c++) {
        x += '<w:tc><w:tcPr><w:tcW w:w="' + tw(LARG_COL) + '" w:type="dxa"/><w:noWrap/><w:vAlign w:val="center"/></w:tcPr>';
        var rotulo = colunas[c][i];
        if (rotulo) {
          var r = M.ajustarRotulo(rotulo, !comCaixa);
          x += par(run(r[0], r[1]) + (comCaixa ? run(CAIXA, FONTE_MAX, { tab: true }) : ""), [FONTE_MAX, LINHA_TEXTO, 0], { tabs: tabs });
        } else {
          x += par("", [FONTE_MAX, LINHA_TEXTO, 0]);
        }
        x += "</w:tc>";
      }
      x += "</w:tr>";
    }
    return x + "</w:tbl>";
  }

  function documentoXml(paginas) {
    var corpo = "";
    paginas.forEach(function (pag, n) {
      var l = pag.lista;
      if (pag.primeira) {
        corpo += par(run(tituloDoc(), CAB_TITULO[0], { negrito: true }), CAB_TITULO, { alinh: "center", quebra: n > 0 });
        corpo += par(run(M.linhaInfo(l), CAB_INFO[0]), CAB_INFO);
        corpo += par(run(l.refeicaoRotulo, CAB_INFO[0]), CAB_INFO);
        corpo += par(run(l.grupoRotulo, CAB_INFO[0]), CAB_INFO);
        corpo += par(tipoRuns(l, CAB_TIPO[0]), CAB_TIPO);
      } else {
        corpo += par(run(tituloDoc() + " (continuação)", CONT_TITULO[0], { negrito: true }), CONT_TITULO, { alinh: "center", quebra: true });
        corpo += par(run(M.linhaInfo(l) + " · " + l.refeicaoRotulo + " · " + l.grupoRotulo + " · ", CONT_INFO[0]) +
          tipoRuns(l, CONT_INFO[0]), CONT_INFO);
      }
      corpo += l.alunos.length ? tabela(pag) : par(run("Nenhum aluno nesta lista.", 12), [12, 15, 0]);
      if (pag.ultima) corpo += par(run(M.textoTotal(l), TOTAL[0]), TOTAL, { alinh: "right", antes: TOTAL_ANTES });
    });
    return corpoDocumento(corpo);
  }

  /** O documento completo: o corpo e a seção (página A4, margens e o cabeçalho com a marca d'água). */
  function corpoDocumento(corpo) {
    var sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdCabecalho"/>' +
      '<w:pgSz w:w="' + tw(PAG_L) + '" w:h="' + tw(PAG_A) + '"/>' +
      '<w:pgMar w:top="' + tw(MARGEM_TOPO) + '" w:right="' + tw(MARGEM_LAT) + '" w:bottom="' + tw(MARGEM_BASE) +
      '" w:left="' + tw(MARGEM_LAT) + '" w:header="160" w:footer="720" w:gutter="0"/></w:sectPr>';
    return XML + "<w:document " + [NS_W, NS_R, NS_WP, NS_A, NS_PIC].join(" ") + "><w:body>" + corpo + sect + "</w:body></w:document>";
  }

  function cabecalhoXml() {
    var cx = Math.round(MARCA_L * EMU), cy = Math.round(MARCA_A * EMU);
    // marca d'água: imagem ancorada atrás do texto, centralizada na página (vale para todas as páginas)
    return XML + "<w:hdr " + [NS_W, NS_R, NS_WP, NS_A, NS_PIC].join(" ") + ">" +
      '<w:p><w:pPr><w:spacing w:lineRule="exact" w:line="20" w:before="0" w:after="0"/></w:pPr>' +
      '<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:drawing>' +
      '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" ' +
      'locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH>' +
      '<wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
      '<wp:docPr id="1" name="Marca d\'água"/><wp:cNvGraphicFramePr/>' +
      imagem(1, "marca.png", "rIdMarca", cx, cy) + "</wp:anchor></w:drawing></w:r></w:p></w:hdr>";
  }

  var ESTILOS = XML + "<w:styles " + NS_W + "><w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TabelaNormal"><w:name w:val="Normal Table"/><w:tblPr>' +
    '<w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
    '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';

  var CONFIG = XML + "<w:settings " + NS_W + '><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14"/></w:compat></w:settings>';

  var TIPOS = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';

  var REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  function rels(lista) {
    return XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      lista.map(function (r) { return '<Relationship Id="' + r[0] + '" Type="' + r[1] + '" Target="' + r[2] + '"/>'; }).join("") +
      "</Relationships>";
  }

  /** Devolve os bytes (Uint8Array) do DOCX com todas as listas. */
  M.gerarDocx = function (listas) { return pacoteDocx(documentoXml(M.paginar(listas))); };

  /** Empacota o document.xml com estilos, configurações, cabeçalho e a marca d'água num DOCX (ZIP). */
  function pacoteDocx(documento) {
    var zip = new JSZip();
    zip.file("[Content_Types].xml", TIPOS);
    zip.file("_rels/.rels", rels([
      ["rId1", REL + "officeDocument", "word/document.xml"],
      ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
      ["rId3", REL + "extended-properties", "docProps/app.xml"]]));
    zip.file("docProps/core.xml", XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Municiamento</dc:title><dc:creator>Municiamento Ciaga</dc:creator></cp:coreProperties>');
    zip.file("docProps/app.xml", XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      "<Application>Municiamento Ciaga</Application></Properties>");
    zip.file("word/document.xml", documento);
    zip.file("word/styles.xml", ESTILOS);
    zip.file("word/settings.xml", CONFIG);
    zip.file("word/header1.xml", cabecalhoXml());
    zip.file("word/_rels/document.xml.rels", rels([
      ["rIdEstilos", REL + "styles", "styles.xml"],
      ["rIdConfig", REL + "settings", "settings.xml"],
      ["rIdCabecalho", REL + "header", "header1.xml"]]));
    zip.file("word/_rels/header1.xml.rels", rels([["rIdMarca", REL + "image", "media/marca.png"]]));
    zip.file("word/media/marca.png", M.IMAGENS.marca, { base64: true });
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  // ---------------------------------------------------------------- PDF

  /** Linha de base do texto centralizado verticalmente numa linha de altura fixa
      (como o Word faz com espaçamento exato), medida a partir do topo. */
  function linhaDeBase(topo, altura, tam) {
    return topo + (altura + (0.891 - 0.216) * tam) / 2;
  }

  function novoPdf() {
    var doc = new jspdf.jsPDF({ unit: "pt", format: [PAG_L, PAG_A], compress: true });
    doc.setProperties({ title: "Municiamento", author: "Municiamento Ciaga", creator: "Municiamento Ciaga" });
    return doc;
  }

  /** Marca d'água centralizada (desenhada primeiro, fica atrás do resto da página). */
  function marcaPdf(doc) {
    doc.addImage("data:image/png;base64," + M.IMAGENS.marca, "PNG", (PAG_L - MARCA_L) / 2, (PAG_A - MARCA_A) / 2,
      MARCA_L, MARCA_A, "marca", "FAST");
  }

  /** Um bloco de texto à esquerda, centralizado ou à direita; devolve onde começa o próximo bloco. */
  function textoPdf(doc, topo, fmt, conteudo, negrito, alinh) {
    doc.setFont("times", negrito ? "bold" : "normal");
    doc.setFontSize(fmt[0]);
    var base = linhaDeBase(topo, fmt[1], fmt[0]);
    if (alinh === "centro") doc.text(conteudo, PAG_L / 2, base, { align: "center" });
    else if (alinh === "dir") doc.text(conteudo, PAG_L - MARGEM_LAT, base, { align: "right" });
    else doc.text(conteudo, MARGEM_LAT, base);
    return topo + fmt[1] + fmt[2];
  }

  /** Tabela de 2 colunas com bordas cinza; colunas = [[rótulo, ...], [rótulo, ...]]. Devolve o fim da tabela. */
  function tabelaPdf(doc, topo, nLinhas, colunas, comCaixa) {
    var alto = nLinhas * ALT_LINHA;
    if (comCaixa) { // grade cinza só nas listas para marcar à mão
      doc.setDrawColor(166, 166, 166); doc.setLineWidth(0.5);
      for (var i = 0; i <= nLinhas; i++) doc.line(MARGEM_LAT, topo + i * ALT_LINHA, MARGEM_LAT + LARG_UTIL, topo + i * ALT_LINHA);
      for (var j = 0; j < 3; j++) doc.line(MARGEM_LAT + j * LARG_COL, topo, MARGEM_LAT + j * LARG_COL, topo + alto);
    }
    colunas.forEach(function (rotulos, col) {
      var x0 = MARGEM_LAT + col * LARG_COL;
      rotulos.forEach(function (rotulo, k) {
        var r = M.ajustarRotulo(rotulo, !comCaixa);
        var linhaTopo = topo + k * ALT_LINHA;
        doc.setFont("times", "normal");
        doc.setFontSize(r[1]);
        doc.text(r[0], x0 + PAD_CEL, linhaDeBase(linhaTopo, ALT_LINHA, r[1]));
        if (comCaixa) {
          doc.setFontSize(FONTE_MAX);
          doc.text(CAIXA, x0 + LARG_COL - PAD_CEL, linhaDeBase(linhaTopo, ALT_LINHA, FONTE_MAX), { align: "right" });
        }
      });
    });
    return topo + alto;
  }

  /** Devolve os bytes (Uint8Array) do PDF, com as mesmas páginas do DOCX. */
  M.gerarPdf = function (listas) {
    var doc = novoPdf();
    function texto(topo, fmt, conteudo, negrito, alinh) { return textoPdf(doc, topo, fmt, conteudo, negrito, alinh); }

    function tipo(topo, fmt, l, x) {
      var tam = fmt[0], base = linhaDeBase(topo, fmt[1], tam);
      if (l.municiados) {
        doc.setFont("times", "normal"); doc.setFontSize(tam);
        doc.text("Municiados", x, base);
      } else {
        doc.setFont("times", "bold"); doc.setFontSize(tam);
        doc.text("NÃO", x, base);
        var w = largura("NÃO", tam, true);
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(tam / 16);
        doc.line(x, base + tam * 0.12, x + w, base + tam * 0.12);
        doc.setFont("times", "normal");
        doc.text(" Municiados", x + w, base);
      }
      return topo + fmt[1] + fmt[2];
    }

    M.paginar(listas).forEach(function (pag, n) {
      if (n > 0) doc.addPage([PAG_L, PAG_A], "portrait");
      var l = pag.lista, topo = MARGEM_TOPO;
      marcaPdf(doc);
      if (pag.primeira) {
        topo = texto(topo, CAB_TITULO, tituloDoc(), true, "centro");
        topo = texto(topo, CAB_INFO, M.linhaInfo(l));
        topo = texto(topo, CAB_INFO, l.refeicaoRotulo);
        topo = texto(topo, CAB_INFO, l.grupoRotulo);
        topo = tipo(topo, CAB_TIPO, l, MARGEM_LAT);
      } else {
        topo = texto(topo, CONT_TITULO, tituloDoc() + " (continuação)", true, "centro");
        var prefixo = M.linhaInfo(l) + " · " + l.refeicaoRotulo + " · " + l.grupoRotulo + " · ";
        texto(topo, CONT_INFO, prefixo);
        topo = tipo(topo, CONT_INFO, l, MARGEM_LAT + largura(prefixo, CONT_INFO[0]));
      }
      if (!l.alunos.length) {
        topo = texto(topo, [12, 15, 0], "Nenhum aluno nesta lista.");
      } else {
        topo = tabelaPdf(doc, topo, pag.linhas, pag.colunas.map(function (col) {
          return col.map(function (item) { return M.rotuloItem(item[0], item[1], item[2]); });
        }), true);
      }
      if (pag.ultima) texto(topo + TOTAL_ANTES, TOTAL, M.textoTotal(l), false, "dir");
    });
    return new Uint8Array(doc.output("arraybuffer"));
  };

  // ---------------------------------------------------------------- rela (versão rela): DOCX e PDF
  /* Cada folha da rela começa numa página nova. As páginas são montadas aqui, com as mesmas medidas para os dois
     formatos: cabeçalho, títulos de seção e de turma e os nomes numerados em 2 colunas, preenchidas em colunas.
     Uma turma que não cabe continua na página seguinte, com o cabeçalho e a turma marcados "(continuação)". */
  var R_TITULO = [16, 18, 4], R_LINHA = [12, 15, 0], R_SITUACAO = [12, 15, 8];
  var R_CONT_TITULO = [11, 13.5, 2], R_CONT_LINHA = [11, 14, 6];
  var R_SECAO = [12, 16, 3], R_TURMA = [11, 14, 2], R_VAZIO = [12, 15, 0], R_FIM = [1, 1, 0];
  var R_ANTES_SECAO = 10, R_ANTES_TURMA = 6;
  var ALTURA_UTIL = PAG_A - MARGEM_TOPO - MARGEM_BASE - 14; // folga para o Word não empurrar a última linha

  /** Folhas (de M.relaEstruturada) -> páginas: [{elementos: [{tipo: "texto", ...} | {tipo: "tabela", ...}]}]. */
  M.paginarRela = function (folhas) {
    var paginas = [];
    folhas.forEach(function (f) {
      var pag = null, resta = 0;
      function texto(fmt, conteudo, negrito, alinh, antes) {
        antes = pag.elementos.length ? (antes || 0) : 0; // no topo da página, sem espaço antes
        pag.elementos.push({ tipo: "texto", fmt: fmt, texto: conteudo, negrito: !!negrito, alinh: alinh || "esq", antes: antes });
        resta -= antes + fmt[1] + fmt[2];
      }
      function nova(primeira) {
        pag = { elementos: [] };
        paginas.push(pag);
        resta = ALTURA_UTIL;
        if (primeira) {
          texto(R_TITULO, "Conferência", true, "centro");
          texto(R_LINHA, f.titulo, false, "centro");
          if (f.situacao) texto(R_SITUACAO, f.situacao, true, "centro");
        } else {
          texto(R_CONT_TITULO, "Conferência (continuação)", true, "centro");
          texto(R_CONT_LINHA, f.titulo + (f.situacao ? " · " + f.situacao : ""), false, "centro");
        }
      }
      // garante espaço para um título e pelo menos uma linha de nomes; senão, página nova
      function reservar(antes, fmt) {
        if (antes + fmt[1] + fmt[2] + ALT_LINHA > resta) nova(false);
      }
      nova(true);
      f.secoes.forEach(function (s) {
        if (f.secoes.length > 1) {
          reservar(R_ANTES_SECAO, R_SECAO);
          texto(R_SECAO, s.nome + " (" + s.total + ")", true, "esq", R_ANTES_SECAO);
        }
        if (!s.total) {
          if (R_VAZIO[1] > resta) nova(false);
          texto(R_VAZIO, "Nenhum aluno.");
          return;
        }
        s.grupos.forEach(function (g) {
          var rotulos = g.alunos.map(function (a, i) { return (i + 1) + ". " + M.linhaRela(a); });
          if (g.turma) {
            reservar(R_ANTES_TURMA, R_TURMA);
            texto(R_TURMA, "Turma " + g.turma + " (" + g.alunos.length + ")", true, "esq", R_ANTES_TURMA);
          }
          var pos = 0;
          while (pos < rotulos.length) {
            var cabem = Math.floor(resta / ALT_LINHA);
            if (cabem < 1) {
              nova(false);
              if (g.turma) texto(R_TURMA, "Turma " + g.turma + " (continuação)", true);
              continue;
            }
            var parte = rotulos.slice(pos, pos + 2 * cabem), n = Math.ceil(parte.length / 2);
            pag.elementos.push({ tipo: "tabela", linhas: n, colunas: [parte.slice(0, n), parte.slice(n)] });
            resta -= n * ALT_LINHA;
            pos += parte.length;
            if (pos < rotulos.length) resta = 0; // o resto vai para a próxima página
          }
        });
      });
    });
    return paginas;
  };

  /** DOCX da rela (comCaixas: a lista para marcar à mão, com [   ] ao lado de cada nome). */
  M.gerarRelaDocx = function (folhas, comCaixas) {
    var corpo = "";
    M.paginarRela(folhas).forEach(function (pag, n) {
      pag.elementos.forEach(function (e, k) {
        if (e.tipo === "tabela") { corpo += tabelaRotulos(e.linhas, e.colunas, comCaixas); return; }
        corpo += par(run(e.texto, e.fmt[0], { negrito: e.negrito }), e.fmt,
          { alinh: e.alinh === "centro" ? "center" : "left", quebra: n > 0 && k === 0, antes: e.antes });
      });
    });
    corpo += par("", R_FIM); // o Word exige um parágrafo depois da última tabela
    return pacoteDocx(corpoDocumento(corpo));
  };

  /** PDF da rela, com as mesmas páginas do DOCX. */
  M.gerarRelaPdf = function (folhas, comCaixas) {
    var doc = novoPdf();
    M.paginarRela(folhas).forEach(function (pag, n) {
      if (n > 0) doc.addPage([PAG_L, PAG_A], "portrait");
      marcaPdf(doc);
      var topo = MARGEM_TOPO;
      pag.elementos.forEach(function (e) {
        if (e.tipo === "tabela") topo = tabelaPdf(doc, topo, e.linhas, e.colunas, comCaixas);
        else topo = textoPdf(doc, topo + e.antes, e.fmt, e.texto, e.negrito, e.alinh);
      });
    });
    return new Uint8Array(doc.output("arraybuffer"));
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
