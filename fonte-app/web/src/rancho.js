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
  var LIMITE_PAGINAS = 10;
  var LIMITE_ITENS = 2000; // uma escala semanal inteira (7 dias, ~60 alunos por dia) cabe com folga; o servidor limita cada dia a 300

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
  /** O aluno está num dos turnos pedidos? Vale o turno escrito igual ("1800-2100"), não um que só encosta no horário. */
  function temTurno(turnos, lista) {
    return turnos.some(function (t) {
      var m = /(\d{4})\s*-\s*(\d{4})/.exec(t);
      return !!m && lista.indexOf(m[1] + "-" + m[2]) >= 0;
    });
  }
  /** Rancho corrido de quem está de serviço: Café = turnos 0400-0800 e 0800-1200; Almoço = todos do dia; Janta = turno 1800-2100.
      Sem turno (serviço diário), só o almoço. */
  function refeicoesDoServico(turnos) {
    if (!turnos || !turnos.length) return ["Almoço"]; // serviço diário (sem turno): só o almoço
    var r = [];
    if (temTurno(turnos, ["0400-0800", "0800-1200"])) r.push("Café");
    r.push("Almoço");
    if (temTurno(turnos, ["1800-2100"])) r.push("Janta");
    return r;
  }

  function interpretarServico(linhas, avisos) {
    var data = null, itens = [], janelas = [], m, todo = [], diaAtual = null;
    linhas.forEach(function (cel) {
      var txt = cel.map(limpar).filter(Boolean).join(" ");
      var dia = dataDoTexto(txt);
      if (dia) { diaAtual = dia; if (!data) data = dia; janelas = []; } // cada "SERVIÇO: dd MMM aaaa" abre um dia (um arquivo pode trazer vários)
      todo.push(txt);
      if (/servi[cç]o\s+(di[aá]rio|de\s+quarto)/i.test(txt)) { janelas = []; return; }
      var js = txt.match(JANELAS);
      if (js && !/\b\d{4}\s+[A-Za-z]?\s*[A-Za-zÀ-ÿ]{3,}/.test(txt.replace(JANELAS, " "))) { janelas = js.map(function (x) { return x.replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").replace(/\s*\/\s*/g, " / ").trim(); }); return; }
      var t = txt.replace(/[|¦\[\]{}_~—–"“”]+/g, " ").split(/\s+/).filter(function (x) { return x && !/^[^A-Za-zÀ-ÿ0-9]$/.test(x); });
      var funcao = [], k = 0, col = 0;
      for (var i = 0; i < t.length; i++) {
        var dig = corrigirDigitos(t[i]);
        if (!/^\d{4}$/.test(dig)) { if (!k) funcao.push(t[i]); continue; }
        var j = i + 1, letra = "";
        if (t[j] && /^[A-Za-z0-9]{1,2}$/.test(t[j]) && !/^(TR|SE)$/i.test(t[j]) && !/^\d{4}$/.test(corrigirDigitos(t[j]))) { letra = letraDoCurso(t[j]); j++; } // a letra do curso (se a leitura errar a letra, vale o número)
        var nome = [];
        while (j < t.length && !/^(TR|SE)$/i.test(t[j]) && !/^\d{4}$/.test(corrigirDigitos(t[j])) && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*$/.test(t[j])) nome.push(t[j++]);
        if (!nome.length) continue; // número solto (horário, total...)
        var turnos = janelas[col] ? janelas[col].split(" / ") : (janelas.length === 1 ? janelas[0].split(" / ") : null); col++; // o k-ésimo aluno da linha é da k-ésima coluna de turnos
        itens.push({ d: diaAtual, c: letra + dig, n: nome.join(" "), m: "Serviço", r: refeicoesDoServico(turnos), p: "" }); // no motivo, o rancho corrido da tabela de serviço é "Serviço"
        k++;
        i = j - 1;
      }
    });
    if (!data) data = dataDoTexto(todo.join(" ")); // a data pode estar quebrada em mais de uma célula
    return { data: data, refeicoes: null, motivo: "", itens: itens };
  }

  /** Um aluno que aparece mais de uma vez no arquivo vira um só, com os motivos juntos. */
  function consolidar(itens) {
    var por = {}, ordem = [];
    itens.forEach(function (i) {
      var k = (i.d || "") + "|" + i.c;
      if (!por[k]) { por[k] = { d: i.d, c: i.c, n: i.n, m: i.m, r: i.r, p: i.p }; ordem.push(k); return; }
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
    r.dias = r.itens.map(function (i) { return i.d; }).filter(function (d, k, v) { return d && v.indexOf(d) === k; }).sort();
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
    var tolY = opcoes.tolY || 3.5, gap = opcoes.gap || 2.5; // em pontos do PDF
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

  /** 'png', 'jpeg' ou null, pelos primeiros bytes (nunca pela extensão): só para avisar que foto não é lida. */
  function ehFoto(b) {
    return !!b && ((b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff));
  }

  /** arquivo: {nome, bytes}. Devolve a leitura do arquivo (ver interpretarRancho) com o nome. Só PDF, XLSX e CSV: a leitura de foto
      não era confiável e foi retirada (o arquivo da tabela de serviço traz tudo certo). */
  M.lerRanchoArquivo = async function (arquivo) {
    if (ehFoto(arquivo.bytes)) {
      throw new M.ArquivoInvalido("Esse arquivo é uma foto, e o sistema não lê fotos. Envie o arquivo da tabela de serviço ou da autorização (PDF, XLSX ou CSV).");
    }
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
      // número que não existe na planilha (erro de digitação no arquivo): o nome de guerra, se for único, resolve
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
  /** Sábado e domingo não têm aviso de rancho corrido. data: "AAAA-MM-DD". */
  M.fimDeSemana = function (data) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data || "");
    if (!m) return false;
    var s = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return s === 0 || s === 6;
  };

  M.ranchoDoAluno = function (indice, aluno) {
    return indice[aluno.codigo] || indice[soDigitos(aluno.codigo)] || null;
  };

  M.REFEICOES_RANCHO = REFEICOES;
})(globalThis.Municiamento = globalThis.Municiamento || {});
