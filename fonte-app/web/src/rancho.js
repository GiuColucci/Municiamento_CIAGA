/* Rancho corrido: lê os arquivos de quem está de rancho corrido num dia e avisa na marcação.

   Dois modelos de arquivo (PDF, XLSX ou CSV), reconhecidos pelo conteúdo:
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
  var JANELA = /^\d{4}\s*-\s*\d{4}\s*P?(\s*\/\s*\d{4}\s*-\s*\d{4}\s*P?)*$/i; // 0800-1200P / 2000-0000P / 0800-1200
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
    if (!motivo) avisos.push("A autorização não traz o motivo escrito: o aviso vai dizer só “Rancho corrido autorizado”.");
    itens.forEach(function (i) { if (!i.m) i.m = "Rancho corrido autorizado"; });
    return { data: data, refeicoes: refeicoes, motivo: motivo, itens: itens };
  }

  function interpretarServico(linhas, avisos) {
    var data = null, itens = [], janelas = [], m;
    linhas.forEach(function (cel) {
      var c = cel.map(limpar).filter(Boolean), txt = c.join(" ");
      if (!data && (m = /servi[cç]o\s*:\s*(\d{1,2})\s+([a-zç]{3})[a-zç]*\.?\s+(\d{4})/i.exec(txt)) && MESES[M.normalizar(m[2])]) data = iso(+m[3], MESES[M.normalizar(m[2])], +m[1]);
      if (c.some(function (x) { return /^servi[cç]o\s+(di[aá]rio|de quarto)$/i.test(x); })) { janelas = []; return; }
      var js = c.filter(function (x) { return JANELA.test(x); });
      if (js.length) { janelas = js; return; }
      var funcao = [], k = 0;
      for (var i = 0; i < c.length; i++) {
        var junto = /^(\d{4})\s+([BMN])\s+(.+)$/i.exec(c[i]), nome = null, cod = null;
        if (junto) { cod = junto[2].toUpperCase() + junto[1]; nome = junto[3]; }
        else if (/^\d{4}$/.test(c[i]) && c[i + 1] && /^[BMN]$/i.test(c[i + 1])) { cod = c[i + 1].toUpperCase() + c[i]; nome = c[i + 2]; i += 2; }
        else { if (!k) funcao.push(c[i]); continue; }
        while (c[i + 1] && /^(TR|SE)$/i.test(c[i + 1])) i++; // marcas do quadro (não são nome)
        if (!nome || /^\d{4}$/.test(nome) || !/[A-Za-zÀ-ÿ]/.test(nome)) continue;
        var quando = janelas.length ? janelas[Math.min(k, janelas.length - 1)] : "";
        itens.push({ c: cod, n: nome, m: "Serviço: " + (funcao.join(" ") || "de serviço") + (quando ? " (" + quando + ")" : ""), r: null, p: "" });
        k++;
      }
    });
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
  M.linhasDeItensPdf = function (itens) {
    var ordenados = itens.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; }), linhas = [];
    ordenados.forEach(function (it) {
      var l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - it.y) <= 3.5) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    });
    return linhas.map(function (l) {
      l.itens.sort(function (a, b) { return a.x - b.x; });
      var cel = [], atual = null, fim = 0;
      l.itens.forEach(function (it) {
        if (atual !== null && it.x - fim < 2.5) atual += (it.x - fim > 0.8 ? " " : "") + it.str;
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

  /** arquivo: {nome, bytes}. Devolve a leitura do arquivo (ver interpretarRancho) com o nome. */
  M.lerRanchoArquivo = async function (arquivo) {
    var tipo = await M.detectar(arquivo.nome, arquivo.bytes); // valida tamanho e formato (nunca confia só na extensão)
    var linhas = tipo === "pdf" ? await linhasDoPdf(arquivo.bytes) : linhasDaPlanilha(arquivo.bytes);
    var r = M.interpretarRancho(linhas);
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
      return { item: i, aluno: a || null };
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
