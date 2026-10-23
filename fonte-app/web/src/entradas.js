/* Arquivo escolhido (XLSX, CSV ou PDF) -> grades de células.

   Tudo acontece no navegador: nada é enviado nem gravado. O tipo do arquivo é
   descoberto pelos primeiros bytes, não pela extensão. Cada grade é uma lista de
   linhas de texto (sem espaços nas pontas; célula vazia = ""), que o parser
   entende igual, venha de onde vier. */
(function (M) {
  "use strict";

  var LIMITE_BYTES = 10 * 1024 * 1024;
  var LIMITE_XLSX_DESCOMPACTADO = 80 * 1024 * 1024; // proteção contra "zip bomb"
  var LIMITE_ARQUIVOS_ZIP = 3000;
  var LIMITE_LINHAS_CSV = 5000;
  var LIMITE_COLUNAS = 60;
  var LIMITE_ARQUIVOS = 40;
  var LINHAS_POR_ABA = 150;   // alunos (até ~36) + totais; nunca a aba inteira
  var COLUNAS_POR_ABA = 30;   // Nome, Número e 7 dias x 4 refeições
  var LINHAS_VAZIAS_PARA_PARAR = 15;
  M.LIMITES = { bytes: LIMITE_BYTES, descompactado: LIMITE_XLSX_DESCOMPACTADO };

  /** Erro com mensagem em português, pronta para mostrar na tela. */
  function ArquivoInvalido(mensagem) {
    this.name = "ArquivoInvalido";
    this.message = mensagem;
  }
  ArquivoInvalido.prototype = Object.create(Error.prototype);
  M.ArquivoInvalido = ArquivoInvalido;

  function Grade(linhas, origem, opcoes) {
    opcoes = opcoes || {};
    this.linhas = linhas;
    this.origem = origem;                       // "aba B12.1", "arquivo B12.1.csv"
    this.turmaAba = opcoes.turmaAba || null;    // nome da aba do XLSX: vale mais que a célula A1
    this.turmaArquivo = opcoes.turmaArquivo || null; // nome do arquivo CSV: só se A1 vier vazia
  }
  Grade.prototype.local = function (k) { return "linha " + (k + 1); };
  M.Grade = Grade;

  function texto(v) {
    if (v == null) return "";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).trim();
  }

  function extensao(nome) {
    var i = (nome || "").lastIndexOf(".");
    return i >= 0 ? nome.slice(i).toLowerCase() : "";
  }

  function comeca(bytes, assinatura) {
    if (bytes.length < assinatura.length) return false;
    for (var i = 0; i < assinatura.length; i++) if (bytes[i] !== assinatura[i]) return false;
    return true;
  }

  /** Devolve 'xlsx' ou 'csv', ou lança ArquivoInvalido. */
  M.detectar = async function (nome, bytes) {
    var ext = extensao(nome);
    if (!bytes || !bytes.length) throw new ArquivoInvalido(("O arquivo " + (nome || "") + " está vazio.").replace("  ", " "));
    if (bytes.length > LIMITE_BYTES) throw new ArquivoInvalido("O arquivo passa de 10 MB. Escolha só a planilha do municiamento.");
    if (comeca(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
    if (comeca(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
      throw new ArquivoInvalido("Esse é um arquivo .xls (Excel antigo). Abra no Excel e use “Salvar como” > " +
        "“Pasta de Trabalho do Excel (.xlsx)”.");
    }
    if (comeca(bytes, [0x50, 0x4b, 0x03, 0x04])) {
      await validarZip(bytes, ext);
      return "xlsx";
    }
    if ([".pdf", ".xlsx", ".xlsm", ".xls"].indexOf(ext) >= 0) {
      throw new ArquivoInvalido("O arquivo tem a extensão " + ext + ", mas o conteúdo não é desse tipo. Exporte a planilha de novo.");
    }
    if ([".csv", ".txt", ".tsv", ""].indexOf(ext) >= 0 && bytes.subarray(0, 4096).indexOf(0) < 0) return "csv";
    throw new ArquivoInvalido("Formato não aceito. Escolha a planilha em XLSX (recomendado), CSV ou PDF.");
  };

  async function validarZip(bytes, ext) {
    var zip;
    try {
      zip = await JSZip.loadAsync(bytes, { checkCRC32: false });
    } catch (e) {
      throw new ArquivoInvalido("Não consegui abrir esse arquivo. Ele parece estar corrompido.");
    }
    var nomes = Object.keys(zip.files);
    if (ext === ".xlsm" || nomes.some(function (n) { return /vbaproject\.bin$/i.test(n); })) {
      throw new ArquivoInvalido("Planilhas com macros (.xlsm) não são aceitas. No Excel, use “Salvar como” > " +
        "“Pasta de Trabalho do Excel (.xlsx)”.");
    }
    if (nomes.indexOf("xl/workbook.xml") < 0) {
      throw new ArquivoInvalido("Esse arquivo não é uma planilha do Excel (.xlsx). Escolha XLSX ou CSV.");
    }
    var total = 0;
    nomes.forEach(function (n) {
      var d = zip.files[n]._data;
      total += (d && d.uncompressedSize) || 0;
    });
    if (nomes.length > LIMITE_ARQUIVOS_ZIP || total > LIMITE_XLSX_DESCOMPACTADO) {
      throw new ArquivoInvalido("Essa planilha é grande demais para ser a do municiamento.");
    }
  }

  /** arquivos: [{nome, bytes: Uint8Array}]. Vários arquivos só em CSV (um por turma). */
  M.carregarGrades = async function (arquivos) {
    arquivos = arquivos.filter(function (a) { return (a.bytes && a.bytes.length) || a.nome; });
    if (!arquivos.length) throw new ArquivoInvalido("Escolha o arquivo da planilha antes de continuar.");
    if (arquivos.length > LIMITE_ARQUIVOS) throw new ArquivoInvalido("Escolha no máximo " + LIMITE_ARQUIVOS + " arquivos de uma vez.");
    var tipos = [];
    for (var i = 0; i < arquivos.length; i++) tipos.push(await M.detectar(arquivos[i].nome, arquivos[i].bytes));
    if (arquivos.length > 1 && tipos.some(function (t) { return t !== "csv"; })) {
      throw new ArquivoInvalido("Para escolher vários arquivos de uma vez, use CSV (um por turma). " +
        "XLSX e PDF vão sozinhos, porque já trazem todas as turmas.");
    }
    if (tipos[0] === "xlsx") return lerXlsx(arquivos[0].bytes);
    if (tipos[0] === "pdf") return M.lerPdf(arquivos[0].bytes);
    var leitura = { formato: "CSV", grades: [], sextaSugerida: null, avisos: [] };
    arquivos.forEach(function (a) { leitura.grades.push(lerCsv(a.nome, a.bytes)); });
    return leitura;
  };

  // ---------------------------------------------------------------- XLSX

  function linhasDaAba(ws, maxLinhas, maxColunas, bruto) {
    var linhas = [];
    if (!ws || !ws["!ref"]) return linhas;
    var fim = XLSX.utils.decode_range(ws["!ref"]).e.r;
    var vazias = 0;
    for (var r = 0; r <= Math.min(fim, maxLinhas - 1); r++) {
      var cel = [];
      for (var c = 0; c < maxColunas; c++) {
        var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        cel.push(bruto ? (cell || null) : texto(cell ? cell.v : null));
      }
      linhas.push(cel);
      var temAlgo = cel.some(function (v) { return bruto ? v && v.v != null && v.v !== "" : v !== ""; });
      if (temAlgo) vazias = 0;
      else if (++vazias >= LINHAS_VAZIAS_PARA_PARAR && linhas.length > 20) break;
    }
    return linhas;
  }

  function lerXlsx(bytes) {
    var wb;
    try {
      wb = XLSX.read(bytes, { type: "array", cellNF: true, cellDates: false, sheetRows: LINHAS_POR_ABA, cellHTML: false, cellFormula: false });
    } catch (e) {
      throw new ArquivoInvalido("Não consegui ler essa planilha XLSX. Confira se ela abre no Excel.");
    }
    var sistema1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    var leitura = { formato: "XLSX", grades: [], sextaSugerida: null, avisos: [] };
    wb.SheetNames.forEach(function (nome) {
      var ws = wb.Sheets[nome];
      var titulo = nome.trim();
      if (M.normalizar(titulo).indexOf("quantitativo") >= 0) {
        leitura.sextaSugerida = sextaDoResumo(linhasDaAba(ws, 60, 40, true), sistema1904);
        return;
      }
      var turma = M.acharTurma(titulo);
      var linhas = linhasDaAba(ws, LINHAS_POR_ABA, COLUNAS_POR_ABA, false);
      if (turma) {
        leitura.grades.push(new Grade(linhas, "aba " + titulo, { turmaAba: turma }));
      } else if (!linhas.some(function (l) { return l.some(function (c) { return c; }); })) {
        // aba vazia (ex.: "Página42")
      } else if (M.cabecalhos(linhas).length) {
        leitura.grades.push(new Grade(linhas, "aba " + titulo));
      } else {
        leitura.avisos.push("A aba “" + titulo + "” não parece ser de uma turma e foi ignorada.");
      }
    });
    return leitura;
  }

  /** Data da sexta da aba QUANTITATIVO: célula de data numa coluna com o rótulo
      SEXTA; senão qualquer data que caia numa sexta; senão o texto 'SEXTA (dd/mm)'. */
  function sextaDoResumo(linhas, sistema1904) {
    var rotulos = {}, datas = [], textos = [];
    linhas.forEach(function (linha) {
      linha.forEach(function (cell, j) {
        if (!cell || cell.v == null) return;
        if (cell.t === "d" && cell.v instanceof Date) {
          datas.push([j, cell.v.toISOString().slice(0, 10)]);
        } else if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
          datas.push([j, M.dataDoExcel(cell.v, sistema1904)]);
        } else if (typeof cell.v === "string" && cell.v.trim()) {
          (rotulos[j] = rotulos[j] || []).push(M.normalizar(cell.v));
          textos.push(cell.v);
        }
      });
    });
    var sextas = datas.filter(function (d) { return M.ehSexta(d[1]); });
    var comRotulo = sextas.filter(function (d) {
      return (rotulos[d[0]] || []).some(function (r) { return r.indexOf("sexta") === 0; });
    });
    if (comRotulo.length) return comRotulo[0][1];
    if (sextas.length) return sextas[0][1];
    var ano = datas.length ? Number(datas[0][1].slice(0, 4)) : null;
    return M.sextaDoTexto(textos.join(" "), ano);
  }
  M.sextaDoResumo = sextaDoResumo;

  M.sextaDoTexto = function (txt, ano) {
    var m = /sexta\s*\(\s*(\d{1,2})\s*\/\s*(\d{1,2})/.exec(M.normalizar(txt));
    if (!m) return null;
    var dia = Number(m[1]), mes = Number(m[2]);
    var hoje = M.hojeISO(), anoHoje = Number(hoje.slice(0, 4));
    var anos = ano ? [ano] : [anoHoje, anoHoje + 1, anoHoje - 1];
    var candidatas = anos.map(function (a) { return M.dataISO(a, mes, dia); })
      .filter(function (d) { return d && M.ehSexta(d); });
    if (!candidatas.length) return null;
    var dist = function (d) { return Math.abs(Date.parse(d) - Date.parse(hoje)); };
    return candidatas.sort(function (a, b) { return dist(a) - dist(b); })[0];
  };

  // ---------------------------------------------------------------- CSV

  function decodificar(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes); // tira o BOM sozinho
    } catch (e) {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }

  /** Lê CSV com aspas ("a;b";c), aspas duplicadas e quebras \r\n, \n ou \r. */
  function lerLinhasCsv(txt, sep) {
    var linhas = [], linha = [], campo = "", aspas = false, i = 0, n = txt.length, inicioCampo = true;
    function fechaCampo() { linha.push(campo); campo = ""; inicioCampo = true; }
    function fechaLinha() {
      if (!(linha.length === 0 && campo === "" && inicioCampo)) fechaCampo();
      linhas.push(linha);
      linha = [];
    }
    while (i < n) {
      var ch = txt[i];
      if (aspas) {
        if (ch === '"') {
          if (txt[i + 1] === '"') { campo += '"'; i += 2; continue; }
          aspas = false; i++; continue;
        }
        campo += ch; i++; continue;
      }
      if (ch === '"' && inicioCampo) { aspas = true; inicioCampo = false; i++; continue; }
      if (ch === sep) { fechaCampo(); i++; continue; }
      if (ch === "\r" || ch === "\n") {
        fechaLinha();
        i += (ch === "\r" && txt[i + 1] === "\n") ? 2 : 1;
        continue;
      }
      campo += ch; inicioCampo = false; i++;
    }
    if (campo !== "" || linha.length || !inicioCampo) fechaLinha();
    return linhas;
  }
  M.lerLinhasCsv = lerLinhasCsv;

  /** O separador que deixa as linhas com o mesmo número de colunas (e o maior). */
  function separador(txt) {
    var amostra = txt.split(/\r\n|\n|\r/).slice(0, 100);
    var melhor = ",", notaMelhor = [-1, 0, 0];
    [";", ",", "\t"].forEach(function (sep) {
      var tamanhos = [];
      amostra.forEach(function (l) {
        var r = lerLinhasCsv(l, sep)[0] || [];
        if (r.some(function (c) { return c.trim(); })) tamanhos.push(r.length);
      });
      if (!tamanhos.length) return;
      var cont = {}, moda = null, vezes = 0;
      tamanhos.forEach(function (t) {
        cont[t] = (cont[t] || 0) + 1;
        if (cont[t] > vezes) { vezes = cont[t]; moda = t; }
      });
      var nota = [moda > 1 ? 1 : 0, vezes / tamanhos.length, moda];
      for (var k = 0; k < 3; k++) {
        if (nota[k] > notaMelhor[k]) { melhor = sep; notaMelhor = nota; break; }
        if (nota[k] < notaMelhor[k]) break;
      }
    });
    return melhor;
  }

  function lerCsv(nome, bytes) {
    var txt = decodificar(bytes);
    if (txt.indexOf("\x00") >= 0) throw new ArquivoInvalido("O arquivo " + nome + " não parece ser um CSV.");
    if ((txt.match(/\n/g) || []).length > LIMITE_LINHAS_CSV) {
      throw new ArquivoInvalido("O arquivo " + nome + " tem linhas demais para ser a planilha do municiamento.");
    }
    var sep = separador(txt);
    var linhas = lerLinhasCsv(txt, sep).map(function (r) {
      return r.slice(0, LIMITE_COLUNAS).map(function (c) { return c.trim(); });
    });
    var base = nome.split(/[\\/]/).pop();
    var semExt = base.lastIndexOf(".") >= 0 ? base.slice(0, base.lastIndexOf(".")) : base;
    return new Grade(linhas, "arquivo " + base, { turmaArquivo: M.acharTurma(semExt) });
  }
})(globalThis.Municiamento = globalThis.Municiamento || {});
