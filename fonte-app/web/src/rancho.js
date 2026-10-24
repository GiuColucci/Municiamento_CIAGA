/* Rancho corrido: lê os arquivos de quem está de rancho corrido num dia e avisa na marcação.

   Dois modelos de arquivo (PDF, XLSX, CSV ou FOTO em JPEG/PNG), reconhecidos pelo conteúdo:
   - "Autorização para rancho corrido" (lista): Data, Refeição, Motivo e, por ano, os alunos
     (Nº Interno, Nome de Guerra, Pelotão/CIA, dois por linha);
   - "Detalhe de serviço do Corpo de Alunos" (tabela de serviço): "SERVIÇO: 24 OUT 2026" e, por função
     (Chefe de dia, Polícia, Retém...), o número, a letra do curso e o nome de quem está de serviço.
     O motivo é a função (e o turno, quando a tabela traz).

   Tudo é lido no próprio aparelho (nada é enviado ao ler). Cada aluno do arquivo vira
   {c: número interno (com a letra do curso, se vier), n: nome, m: motivo, r: refeições ou null = todas, p: pelotão/CIA}.
   A leitura nunca bloqueia: o que não for entendido vira aviso, e a pessoa confere antes de publicar. */
(function (M) {
  "use strict";

  var REFEICOES = ["Café", "Almoço", "Janta", "Ceia"];
  var MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  var LIMITE_PAGINAS = 10;
  var LIMITE_ITENS = 300;

  function limpar(s) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
  /** Tira os traços do formulário em branco ("Motivo: ______") e sobra só o que foi escrito. */
  function escrito(s) { return limpar(String(s).replace(/_+/g, " ")); }
  function iso(a, m, d) {
    if (a < 100) a += 2000;
    var dt = new Date(Date.UTC(a, m - 1, d));
    return isNaN(dt) || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d ? null : dt.toISOString().slice(0, 10);
  }
  M.refeicoesDoTexto = function (txt) {
    var n = M.normalizar(txt), r = [];
    if (/caf[e]/.test(n)) r.push("Café");
    if (/almoc/.test(n)) r.push("Almoço");
    if (/jant/.test(n)) r.push("Janta");
    if (/ceia/.test(n)) r.push("Ceia");
    return r.length ? r : null;
  };

  // ---------------------------------------------------------------- interpretação (grade de células -> alunos)

  function tipoDe(linhas) {
    var n = M.normalizar(linhas.map(function (l) { return l.join(" "); }).join("\n"));
    if (/detalhe de servico|servico do corpo de alunos|servico:\s*\d{1,2}\s+[a-z]{3}\s+\d{4}/.test(n)) return "servico";
    if (/autorizacao para rancho corrido|rancho corrido/.test(n)) return "autorizacao";
    return null;
  }

  function interpretarAutorizacao(linhas, avisos) {
    var data = null, refeicoes = null, motivo = "", itens = [], m;
    linhas.forEach(function (cel) {
      var txt = cel.join(" ");
      if (!data && (m = /data\s*:?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/i.exec(txt))) data = iso(+m[3], +m[2], +m[1]);
      if (!refeicoes && (m = /refei[cç][aã]o\s*:?\s*(.*)$/i.exec(txt))) refeicoes = M.refeicoesDoTexto(escrito(m[1]));
      if (!motivo && (m = /motivo\s*:?\s*(.*)$/i.exec(txt))) motivo = escrito(m[1]);
    });
    // alunos: cada número interno abre um aluno; vêm depois o nome e (se houver) o pelotão/CIA
    linhas.forEach(function (cel) {
      var c = cel.map(limpar).filter(Boolean);
      for (var i = 0; i < c.length; i++) {
        var cod = /^([BMN])?\s*(\d{4})$/i.exec(c[i]);
        if (!cod) continue;
        var seguintes = [];
        for (var j = i + 1; j < c.length && seguintes.length < 2 && !/^([BMN])?\s*\d{4}$/i.test(c[j]); j++) seguintes.push(c[j]);
        if (!seguintes.length || !/[A-Za-zÀ-ÿ]/.test(seguintes[0])) continue;
        itens.push({ c: (cod[1] ? cod[1].toUpperCase() : "") + cod[2], n: seguintes[0], m: motivo, r: refeicoes, p: seguintes[1] || "" });
        i += seguintes.length;
      }
    });
    if (!data) data = dataDoTexto(linhas.map(function (c) { return c.join(" "); }).join(" ")); // sem "Data:" legível: a primeira data do arquivo
    if (!motivo) avisos.push("A autorização não traz o motivo escrito: o aviso vai dizer só “Rancho corrido autorizado”.");
    itens.forEach(function (i) { if (!i.m) i.m = "Rancho corrido autorizado"; });
    return { data: data, refeicoes: refeicoes, motivo: motivo, itens: itens };
  }

  /** Corrige letras que a leitura de foto troca por número dentro de um número interno (3O25 -> 3025). */
  function corrigirDigitos(s) {
    s = String(s).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (/^1\d{4}$/.test(s) && /^[123]/.test(s.slice(1))) return s.slice(1); // a borda da tabela colada antes do número ("13048" = "|" + 3048)
    if (!/^[0-9OoIl|SsBZ]{4}$/.test(s) || (s.match(/\d/g) || []).length < 2) return s;
    return s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/[Ss]/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
  }
  /** A letra do curso, mesmo com a leitura de foto errando (NU, NO, ND -> N; rn, MM -> M): "" se não der para saber. */
  function letraDoCurso(tok) {
    var u = String(tok || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^(N|NU|NO|ND|NI|NN|N0|NL|NJ|MN)$/.test(u)) return u === "MN" ? "M" : "N";
    if (/^(M|MM|RN|MI|M0|ML|IM)$/.test(u)) return "M";
    if (/^(B|BI|B1|BB|8|BL)$/.test(u)) return "B";
    return "";
  }
  function mesDe(tok) { var k = M.normalizar(tok).replace(/0/g, "o").replace(/[1|]/g, "l").slice(0, 3); return MESES[k] || null; }
  /** "SERVIÇO: 24 OUT 2026" (ou só "24 OUT 2026", ou 24/10/2026), mesmo com a leitura de foto trocando letras. */
  function dataDoTexto(tudo) {
    var m = /servi\S{1,3}\s*[:;.,]?\s*(\d{1,2})\s*([a-zç0]{3})[a-zç]*\.?\s*(?:de\s*)?(\d{4})/i.exec(tudo) || /\b(\d{1,2})\s*(?:de\s*)?([a-zç0]{3})[a-zç]*\.?\s*(?:de\s*)?(20\d{2})\b/i.exec(tudo);
    if (m && mesDe(m[2])) return iso(+m[3], mesDe(m[2]), +m[1]);
    m = /\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})\b/.exec(tudo);
    return m ? iso(+m[3], +m[2], +m[1]) : null;
  }
  var JANELAS = /\d{4}\s*-\s*\d{4}\s*P?(?:\s*\/\s*\d{4}\s*-\s*\d{4}\s*P?)*/gi;

  /** Tabela de serviço. Em cada linha: [função] e, para cada aluno, 4 dígitos + letra do curso (N, B ou M) + nome de guerra.
      Lê a linha inteira por palavras (não depende de onde a leitura separou as células) e ignora o ruído de bordas da foto. */
  function interpretarServico(linhas, avisos) {
    var data = null, itens = [], janelas = [], m, todo = [];
    linhas.forEach(function (cel) {
      var txt = cel.map(limpar).filter(Boolean).join(" ");
      if (!data) data = dataDoTexto(txt);
      todo.push(txt);
      if (/servi[cç]o\s+(di[aá]rio|de\s+quarto)/i.test(txt)) { janelas = []; return; }
      var js = txt.match(JANELAS);
      if (js && !/\b\d{4}\s+[A-Za-z]?\s*[A-Za-zÀ-ÿ]{3,}/.test(txt.replace(JANELAS, " "))) { janelas = js.map(function (x) { return x.replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").replace(/\s*\/\s*/g, " / ").trim(); }); return; }
      var t = txt.replace(/[|¦\[\]{}_~—–"“”]+/g, " ").split(/\s+/).filter(function (x) { return x && !/^[^A-Za-zÀ-ÿ0-9]$/.test(x); });
      var funcao = [], k = 0;
      for (var i = 0; i < t.length; i++) {
        var dig = corrigirDigitos(t[i]);
        if (!/^\d{4}$/.test(dig)) { if (!k) funcao.push(t[i]); continue; }
        var j = i + 1, letra = "";
        if (t[j] && /^[A-Za-z0-9]{1,2}$/.test(t[j]) && !/^(TR|SE)$/i.test(t[j]) && !/^\d{4}$/.test(corrigirDigitos(t[j]))) { letra = letraDoCurso(t[j]); j++; } // a letra do curso (se a leitura errar a letra, vale o número)
        var nome = [];
        while (j < t.length && !/^(TR|SE)$/i.test(t[j]) && !/^\d{4}$/.test(corrigirDigitos(t[j])) && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*$/.test(t[j])) nome.push(t[j++]);
        if (!nome.length) continue; // número solto (horário, total...)
        var quando = janelas.length ? janelas[Math.min(k, janelas.length - 1)] : "";
        // função: só palavras em MAIÚSCULAS (a leitura de foto deixa letras soltas minúsculas no lugar de um rótulo apagado)
        var funcaoTxt = funcao.filter(function (w) { return /^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9'’.-]*$/.test(w) && (w.length >= 2 || /\d/.test(w)); }).join(" ");
        itens.push({ c: letra + dig, n: nome.join(" "), m: "Serviço" + (funcaoTxt ? ": " + funcaoTxt : "") + (quando ? " (" + quando + ")" : ""), r: null, p: "" });
        k++;
        i = j - 1;
      }
    });
    if (!data) data = dataDoTexto(todo.join(" ")); // a data pode ter sido lida em pedaços (foto)
    return { data: data, refeicoes: null, motivo: "", itens: itens };
  }

  /** Um aluno que aparece mais de uma vez no arquivo vira um só, com os motivos juntos. */
  function consolidar(itens) {
    var por = {}, ordem = [];
    itens.forEach(function (i) {
      var k = i.c;
      if (!por[k]) { por[k] = { c: i.c, n: i.n, m: i.m, r: i.r, p: i.p }; ordem.push(k); return; }
      var a = por[k];
      if (i.m && a.m.split("; ").indexOf(i.m) < 0) a.m += "; " + i.m;
      a.r = a.r && i.r ? a.r.concat(i.r.filter(function (x) { return a.r.indexOf(x) < 0; })) : null;
    });
    return ordem.map(function (k) { return por[k]; });
  }

  /** linhas: lista de linhas, cada uma uma lista de células (texto). */
  M.interpretarRancho = function (linhas) {
    var avisos = [], tipo = tipoDe(linhas), r;
    if (!tipo) return { tipo: null, data: null, refeicoes: null, motivo: "", itens: [], avisos: ["Não reconheci esse arquivo: não parece uma autorização de rancho corrido nem um detalhe de serviço."] };
    r = tipo === "servico" ? interpretarServico(linhas, avisos) : interpretarAutorizacao(linhas, avisos);
    r.itens = consolidar(r.itens);
    if (!r.itens.length) avisos.push("Não encontrei nenhum aluno nesse arquivo. Confira se ele está preenchido.");
    if (r.itens.length > LIMITE_ITENS) { avisos.push("O arquivo tem alunos demais (mais de " + LIMITE_ITENS + "): só os primeiros entram."); r.itens = r.itens.slice(0, LIMITE_ITENS); }
    if (!r.data) avisos.push("O arquivo não traz a data: escolha o dia abaixo.");
    r.tipo = tipo;
    r.avisos = avisos;
    return r;
  };

  // ---------------------------------------------------------------- arquivos -> grade de células

  /** Textos do PDF (com posição) -> linhas de células: junta os textos colados e separa os que têm espaço grande entre si. */
  M.linhasDeItensPdf = function (itens, opcoes) {
    opcoes = opcoes || {};
    var tolY = opcoes.tolY || 3.5, gap = opcoes.gap || 2.5; // PDF: em pontos; foto: proporcional à altura das letras
    var ordenados = itens.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; }), linhas = [];
    ordenados.forEach(function (it) {
      var l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - it.y) <= tolY) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    });
    return linhas.map(function (l) {
      l.itens.sort(function (a, b) { return a.x - b.x; });
      var cel = [], atual = null, fim = 0;
      l.itens.forEach(function (it) {
        if (atual !== null && it.x - fim < gap) atual += (opcoes.espaco || it.x - fim > gap / 3 ? " " : "") + it.str;
        else { if (atual !== null) cel.push(limpar(atual)); atual = it.str; }
        fim = it.x + (it.w || 0);
      });
      if (atual !== null) cel.push(limpar(atual));
      return cel.filter(Boolean);
    }).filter(function (c) { return c.length; });
  };

  async function linhasDoPdf(bytes) {
    var lib = globalThis.pdfjsLib, doc;
    try {
      doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false,
        stopAtErrors: false, verbosity: 0 }).promise;
    } catch (e) { throw new M.ArquivoInvalido("Não consegui abrir esse PDF."); }
    try {
      if (doc.numPages > LIMITE_PAGINAS) throw new M.ArquivoInvalido("O PDF tem mais de " + LIMITE_PAGINAS + " páginas; não parece ser do rancho corrido.");
      var linhas = [];
      for (var n = 1; n <= doc.numPages; n++) {
        var pagina = await doc.getPage(n), conteudo = await pagina.getTextContent(), itens = [];
        conteudo.items.forEach(function (it) { if (it.str && it.str.trim()) itens.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }); });
        linhas = linhas.concat(M.linhasDeItensPdf(itens));
        pagina.cleanup();
      }
      return linhas;
    } finally { doc.destroy(); }
  }

  function linhasDaPlanilha(bytes) {
    var wb = globalThis.XLSX.read(bytes, { type: "array", cellDates: false });
    var linhas = [];
    wb.SheetNames.slice(0, 5).forEach(function (nome) {
      var rows = globalThis.XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: "", blankrows: false });
      rows.slice(0, 400).forEach(function (r) { linhas.push(r.slice(0, 40).map(limpar)); });
    });
    return linhas;
  }

  // ---------------------------------------------------------------- foto (JPEG/PNG) -> OCR no navegador

  var LIMITE_BYTES_FOTO = 10 * 1024 * 1024;
  var LADO_ALVO_FOTO = 3200; // texto pequeno de tabela só é lido bem com letras grandes: fotos pequenas são AUMENTADAS (até 3x) e as enormes reduzidas
  var CAMINHO_OCR = "/ocr/"; // Tesseract.js, o motor e o idioma português ficam no próprio site (a regra de segurança não deixa sair)

  /** 'png', 'jpeg' ou null, pelos primeiros bytes (nunca pela extensão). */
  M.tipoDeImagem = function (b) {
    if (b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b && b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    return null;
  };

  function carregarScript(url) {
    return new Promise(function (ok, falha) {
      if (globalThis.Tesseract) return ok();
      var s = document.createElement("script");
      s.src = url;
      s.onload = function () { ok(); };
      s.onerror = function () { falha(new M.ArquivoInvalido("Não consegui carregar o leitor de fotos. Confira a conexão e tente de novo.")); };
      document.head.appendChild(s);
    });
  }

  /** Foto -> tela (canvas) reduzida e com a orientação certa (o celular grava fotos "de lado" com um aviso no arquivo). */
  async function fotoParaCanvas(bytes, tipo) {
    var blob = new Blob([bytes], { type: tipo === "png" ? "image/png" : "image/jpeg" }), bmp;
    try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
    catch (e) { throw new M.ArquivoInvalido("Não consegui abrir essa foto. Tire de novo ou escolha outro arquivo."); }
    var escala = Math.min(3, LADO_ALVO_FOTO / Math.max(bmp.width, bmp.height));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * escala));
    c.height = Math.max(1, Math.round(bmp.height * escala));
    var g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height); // PNG com fundo transparente vira fundo branco
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    try { apagarLinhasDaTabela(c, g); } catch (e) { /* sem a limpeza, a leitura segue com a foto como está */ }
    return c;
  }

  /** As linhas da tabela (finas, escuras, compridas, com branco dos dois lados) atrapalham a leitura: viram "|", "]" e números colados.
      Apaga só o que é linha comprida e fina; letras (curtas) e as caixas cinza dos títulos (largas) ficam. */
  function apagarLinhasDaTabela(c, g) {
    var w = c.width, h = c.height, img = g.getImageData(0, 0, w, h), d = img.data, n = w * h, Y = new Uint8Array(n), i, x, y;
    for (i = 0; i < n; i++) Y[i] = (d[4 * i] * 299 + d[4 * i + 1] * 587 + d[4 * i + 2] * 114) / 1000;
    var ESCURO = 150, CLARO = 175, LADO = Math.max(4, Math.round(w / 640)), MIN = Math.max(40, Math.round(w / 55)); // espessura e comprimento em proporção ao tamanho
    var marca = new Uint8Array(n);
    function varrer(horizontal) {
      var fora = horizontal ? h : w, dentro = horizontal ? w : h;
      for (var a = LADO; a < fora - LADO; a++) {
        var corrida = 0;
        for (var b = 0; b <= dentro; b++) {
          var ok = false;
          if (b < dentro) {
            var p = horizontal ? a * w + b : b * w + a, s1 = horizontal ? p - LADO * w : p - LADO, s2 = horizontal ? p + LADO * w : p + LADO;
            ok = Y[p] < ESCURO && Y[s1] > CLARO && Y[s2] > CLARO;
          }
          if (ok) corrida++;
          else { if (corrida >= MIN) for (var k = b - corrida; k < b; k++) marca[horizontal ? a * w + k : k * w + a] = 1; corrida = 0; }
        }
      }
    }
    varrer(true);
    varrer(false);
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      if (marca[i] || marca[i - 1] || marca[i + 1] || marca[i - w] || marca[i + w]) { if (marca[i] || Y[i] < ESCURO + 40) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = 255; } }
    }
    g.putImageData(img, 0, 0);
  }

  /** Palavras reconhecidas, com a caixa de cada uma. A forma da resposta mudou entre versões do Tesseract.js: aceita as duas. */
  function palavrasDoOcr(dados) {
    var ps = dados.words;
    if (!ps && dados.blocks) {
      ps = [];
      dados.blocks.forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (w) { ps.push(w); }); }); }); });
    }
    return (ps || []).filter(function (w) { return w.text && w.text.trim() && w.bbox; });
  }

  /** Linhas de células a partir das palavras da foto: o espaço entre colunas é bem maior que o entre palavras de um mesmo nome. */
  M.linhasDePalavrasOcr = function (palavras) {
    var alturas = palavras.map(function (w) { return w.bbox.y1 - w.bbox.y0; }).sort(function (a, b) { return a - b; });
    var h = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 12;
    var itens = palavras.map(function (w) {
      return { str: w.text, x: w.bbox.x0, y: -(w.bbox.y0 + w.bbox.y1) / 2, w: w.bbox.x1 - w.bbox.x0 };
    });
    return M.linhasDeItensPdf(itens, { tolY: h * 0.6, gap: h * 1.1, espaco: true }); // cada item já é uma palavra: sempre com espaço entre elas
  };

  async function linhasDaFoto(bytes, tipo, aoProgresso) {
    if (bytes.length > LIMITE_BYTES_FOTO) throw new M.ArquivoInvalido("A foto passa de 10 MB. Tire de novo em resolução menor.");
    var canvas = await fotoParaCanvas(bytes, tipo);
    await carregarScript(CAMINHO_OCR + "tesseract.min.js");
    var worker;
    try {
      worker = await globalThis.Tesseract.createWorker("por", 1, {
        workerPath: CAMINHO_OCR + "worker.min.js", corePath: CAMINHO_OCR, langPath: CAMINHO_OCR,
        workerBlobURL: false, cacheMethod: "none", gzip: true,
        logger: function (m) { if (aoProgresso && m && typeof m.progress === "number") aoProgresso(m.status, m.progress); }
      });
    } catch (e) { throw new M.ArquivoInvalido("Não consegui iniciar o leitor de fotos neste aparelho. Tente enviar o PDF."); }
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }); // bloco de texto em linhas: o que melhor lê tabelas e formulários
      var res = await worker.recognize(canvas, {}, { blocks: true, text: true });
      return M.linhasDePalavrasOcr(palavrasDoOcr(res.data).filter(function (w) { return w.confidence == null || w.confidence >= 25; }));
    } finally {
      try { await worker.terminate(); } catch (e) { /* já encerrado */ }
    }
  }

  M.linhasDaFoto = linhasDaFoto; // também para diagnóstico: mostra o que o OCR enxergou, linha a linha

  /** arquivo: {nome, bytes}. Devolve a leitura do arquivo (ver interpretarRancho) com o nome.
      aoProgresso(etapa, 0..1): só a foto demora (a leitura por OCR). */
  M.lerRanchoArquivo = async function (arquivo, aoProgresso) {
    var foto = M.tipoDeImagem(arquivo.bytes), tipo = foto ? "foto" : await M.detectar(arquivo.nome, arquivo.bytes); // valida tamanho e formato (nunca confia só na extensão)
    var linhas = tipo === "foto" ? await linhasDaFoto(arquivo.bytes, foto, aoProgresso) : tipo === "pdf" ? await linhasDoPdf(arquivo.bytes) : linhasDaPlanilha(arquivo.bytes);
    var r = M.interpretarRancho(linhas);
    if (tipo === "foto") {
      r.origemFoto = true;
      r.avisos.unshift("Lido de uma foto: confira com atenção os números e os nomes. Foto reta, bem iluminada e de perto lê melhor.");
    }
    r.nome = arquivo.nome;
    return r;
  };

  // ---------------------------------------------------------------- cruzamento com a planilha e aviso na marcação

  var soDigitos = function (c) { return String(c || "").replace(/\D/g, ""); };

  /** Para cada item do arquivo, o aluno da planilha com o mesmo número interno (ou null). */
  M.casarRancho = function (itens, alunos) {
    var porDigitos = {};
    alunos.forEach(function (a) { (porDigitos[soDigitos(a.codigo)] = porDigitos[soDigitos(a.codigo)] || []).push(a); });
    return itens.map(function (i) {
      var cands = (porDigitos[soDigitos(i.c)] || []).filter(function (a) { return !/^[BMN]/.test(i.c) || a.codigo === i.c; });
      var nome = M.normalizar(i.n);
      var a = cands.length > 1 ? (cands.filter(function (x) { var n = M.normalizar(x.nome); return n.indexOf(nome) >= 0 || nome.indexOf(n) >= 0; })[0] || cands[0]) : cands[0];
      // número que não existe na planilha (erro de digitação ou de leitura da foto): o nome de guerra, se for único, resolve
      if (!a && nome.length >= 4) {
        var porNome = alunos.filter(function (x) { return M.normalizar(x.nome) === nome; });
        if (porNome.length === 1) a = porNome[0];
      }
      return { item: i, aluno: a || null, porNome: !!a && cands.length === 0 };
    });
  };

  /** publicacoes: o que o servidor guarda para um dia ([{por, em, itens}]). refeicao: "Almoço"... Devolve {chave: {motivo, por}}. */
  M.indiceRancho = function (publicacoes, refeicao) {
    var idx = {};
    (publicacoes || []).forEach(function (p) {
      (p.itens || []).forEach(function (i) {
        if (i.r && refeicao && i.r.indexOf(refeicao) < 0) return; // vale só para as refeições da autorização
        var k = i.c, a = idx[k];
        if (!a) idx[k] = { motivo: i.m || "Rancho corrido", por: p.por };
        else if (a.motivo.split("; ").indexOf(i.m) < 0) a.motivo += "; " + i.m;
      });
    });
    return idx;
  };

  /** O aluno (da planilha) está no índice? Devolve {motivo, por} ou null. */
  M.ranchoDoAluno = function (indice, aluno) {
    return indice[aluno.codigo] || indice[soDigitos(aluno.codigo)] || null;
  };

  M.REFEICOES_RANCHO = REFEICOES;
})(globalThis.Municiamento = globalThis.Municiamento || {});
