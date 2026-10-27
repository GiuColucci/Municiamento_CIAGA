/* Regra de negócio: monta as listas (dia x refeição x grupo).

   M.REGRA = "padrao" (o build define):
     segunda a sexta: café com os municiados; almoço e janta com os NÃO municiados;
     sábado e domingo: café, almoço e janta com os municiados.
     A ceia fica de fora. 7 dias x 3 refeições x 5 grupos = 105 listas.
   M.REGRA = "completa": todo dia e toda refeição, incluindo a ceia, têm duas listas,
     municiados e NÃO municiados: 7 x 4 x 5 x 2 = 280 listas. */
(function (M) {
  "use strict";

  var OFFSET_DIAS = { "Sexta": 0, "Sábado": 1, "Domingo": 2, "Segunda": 3, "Terça": 4, "Quarta": 5, "Quinta": 6 };
  var DIA_EXTENSO = { "Sexta": "Sexta-feira", "Sábado": "Sábado", "Domingo": "Domingo", "Segunda": "Segunda-feira",
    "Terça": "Terça-feira", "Quarta": "Quarta-feira", "Quinta": "Quinta-feira" };
  var FIM_DE_SEMANA = ["Sábado", "Domingo"];
  var REFEICOES_PADRAO = ["Café", "Almoço", "Janta"];
  var REFEICOES_COMPLETA = ["Café", "Almoço", "Janta", "Ceia"];
  var ROTULO_REFEICAO = { "Café": "Café da manhã", "Almoço": "Almoço", "Janta": "Janta", "Ceia": "Ceia" };
  var CURSOS = { B: "Básico", M: "Máquinas", N: "Náutica" };
  var ORDEM_GRUPOS = ["B1", "M2", "N2", "M3", "N3"];
  // as refeições que viram lista dependem da regra (a completa inclui a ceia)
  Object.defineProperty(M, "REFEICOES", {
    get: function () { return M.REGRA === "completa" ? REFEICOES_COMPLETA : REFEICOES_PADRAO; },
    configurable: true,
  });
  M.ORDEM_GRUPOS = ORDEM_GRUPOS;
  M.REGRA = M.REGRA || "padrao";
  M.DIAS_LISTA = M.DIAS; // a ordem da planilha: Sexta, Sábado, Domingo, Segunda ... Quinta

  /** Nome sem acento, empate pelo código: a ordem de todas as listas. */
  function ordemAlfabetica(a, b) {
    return M.comparar(M.chaveAlfabetica(a.nome), M.chaveAlfabetica(b.nome)) || M.comparar(a.codigo, b.codigo);
  }

  M.grupoDe = function (turma) { return turma.slice(0, 2); }; // curso + ano (N24.1 -> N2)
  M.rotuloGrupo = function (g) { return g.charAt(1) + "° Ano – " + (CURSOS[g.charAt(0)] || g.charAt(0)); };

  function Lista(data, dia, refeicao, grupo, municiados, alunos, totalGrupo) {
    this.data = data;             // 'AAAA-MM-DD'
    this.dia = dia;               // "Sexta"
    this.refeicao = refeicao;     // "Café"
    this.grupo = grupo;           // "B1"
    this.municiados = municiados; // lista de municiados (true) ou de NÃO municiados (false)
    this.alunos = alunos;         // [[nome, turma, codigo]] em ordem alfabética
    this.totalGrupo = totalGrupo;
    this.diaExtenso = DIA_EXTENSO[dia] || dia;
    this.refeicaoRotulo = ROTULO_REFEICAO[refeicao];
    this.grupoRotulo = M.rotuloGrupo(grupo);
    this.tipo = municiados ? "Municiados" : "NÃO Municiados";
  }
  M.Lista = Lista;

  M.datasDaSemana = function (sexta) {
    var datas = {};
    Object.keys(OFFSET_DIAS).forEach(function (d) { datas[d] = M.somarDias(sexta, OFFSET_DIAS[d]); });
    return datas;
  };

  /** Quais listas saem para um dia e uma refeição: [true] = municiados, [false] = NÃO municiados. */
  M.situacoes = function (dia, ref) {
    if (M.REGRA === "completa") return [true, false];
    return [ref === "Café" || FIM_DE_SEMANA.indexOf(dia) >= 0];
  };

  /** Listas em ordem cronológica, depois Café, Almoço, Janta, depois B1, M2, N2, M3, N3
      (e, na regra completa, municiados antes dos NÃO municiados). */
  M.montarListas = function (alunos, sexta, dias) {
    var escolhidos = M.DIAS_LISTA.filter(function (d) { return !dias || dias.indexOf(d) >= 0; });
    var datas = M.datasDaSemana(sexta);
    var porGrupo = {};
    alunos.forEach(function (a) { (porGrupo[M.grupoDe(a.turma)] = porGrupo[M.grupoDe(a.turma)] || []).push(a); });
    var grupos = ORDEM_GRUPOS.filter(function (g) { return porGrupo[g]; });
    Object.keys(porGrupo).filter(function (g) { return ORDEM_GRUPOS.indexOf(g) < 0; }).sort(M.comparar)
      .forEach(function (g) { grupos.push(g); }); // grupo inesperado: não some
    var listas = [];
    escolhidos.forEach(function (d) {
      M.REFEICOES.forEach(function (ref) {
        var chave = M.chaveMarca(d, ref);
        grupos.forEach(function (g) {
          M.situacoes(d, ref).forEach(function (municiados) {
            var sel = porGrupo[g].filter(function (a) { return !!a.marcas[chave] === municiados; });
            sel.sort(ordemAlfabetica);
            listas.push(new Lista(datas[d], d, ref, g, municiados,
              sel.map(function (a) { return [a.nome, a.turma, a.codigo]; }), porGrupo[g].length));
          });
        });
      });
    });
    return listas;
  };

  // cada critério pode ser um valor só ("Janta") ou vários (["Almoço", "Janta"]); vazio = sem filtro
  function casa(criterio, valor) {
    if (Array.isArray(criterio)) return criterio.indexOf(valor) >= 0;
    return !criterio || criterio === valor;
  }
  M.filtrar = function (listas, f) {
    f = f || {};
    return listas.filter(function (l) {
      return casa(f.dia, l.dia) && casa(f.refeicao, l.refeicao) && casa(f.grupo, l.grupo) &&
        (!f.situacao || l.municiados === (f.situacao === "municiados"));
    });
  };

  // ---------------------------------------------------------------- versão "rela"
  /* Uma lista por ano escolar (todos os cursos juntos), para a pessoa marcar quem veio na hora.
     Na rela entra só quem foi marcado, separado pela planilha: municiado (a planilha tem a marcação daquele
     dia e refeição) ou NÃO municiado (não tem). */

  M.anoDe = function (turma) { return turma.charAt(1); }; // M36.1 -> "3"
  M.rotuloAno = function (ano) { return ano + "° Ano"; };

  /** Anos que existem na planilha, em ordem: ["1", "2", "3"]. */
  M.anosPresentes = function (alunos) {
    var anos = {};
    alunos.forEach(function (a) { anos[M.anoDe(a.turma)] = true; });
    return Object.keys(anos).sort(M.comparar);
  };

  /** Todos os alunos do ano, em ordem alfabética (o curso não importa). */
  M.alunosDoAno = function (alunos, ano) {
    return alunos.filter(function (a) { return M.anoDe(a.turma) === ano; }).sort(ordemAlfabetica);
  };

  /** Linha do cabeçalho da lista para marcar (a que vai impressa): diz quem a lista traz. filtro: "todos" | "municiados" | "nao". */
  M.rotuloListaParaMarcar = function (filtro) {
    var abrangencia = filtro === "municiados" ? "Municiados" : filtro === "nao" ? "NÃO Municiados" : "Todos os alunos";
    return "Lista para marcar · " + abrangencia;
  };

  /** Pedaço do nome do arquivo da lista para marcar quando ela não traz todos ("" para todos). */
  M.sufixoListaParaMarcar = function (filtro) {
    return filtro === "municiados" ? "municiados" : filtro === "nao" ? "nao-municiados" : "";
  };

  /** Chave única de um aluno: o código sozinho não serve, porque há códigos repetidos. */
  M.chaveAluno = function (a) { return a.turma + "|" + a.codigo + "|" + a.nome; };

  /** "Sexta-feira, 23/10/2026 · Janta · 3° Ano" (sem a data, se ela não for conhecida). */
  M.tituloRela = function (cfg, sexta) {
    var dia = DIA_EXTENSO[cfg.dia] || cfg.dia;
    if (sexta) dia += ", " + M.formatarData(M.datasDaSemana(sexta)[cfg.dia]);
    return dia + " · " + ROTULO_REFEICAO[cfg.refeicao] + " · " + (cfg.rotuloAno || M.rotuloAno(cfg.ano));
  };

  M.linhaRela = function (a) { return (a.codigo || "s/ código") + " – " + a.nome + " – " + a.turma; };

  /** Antiguidade pelo código CXNNN: C (curso) não conta; X maior é mais antigo (3 > 2 > 1); com o mesmo X,
      NNN menor é mais antigo (001 antes de 200). Sem código válido vai para o fim; empate pelo nome. */
  var CODIGO_ANTIGUIDADE = /^[A-Z](\d)(\d{3})$/;
  function ordemAntiguidade(a, b) {
    var ma = CODIGO_ANTIGUIDADE.exec(a.codigo || ""), mb = CODIGO_ANTIGUIDADE.exec(b.codigo || "");
    if (!ma || !mb) return (!ma) - (!mb) || ordemAlfabetica(a, b);
    return (Number(mb[1]) - Number(ma[1])) || (Number(ma[2]) - Number(mb[2])) || ordemAlfabetica(a, b);
  }
  /** Cópia dos alunos na ordem pedida: "alfabetica" (padrão) ou "antiguidade". */
  M.ordenarAlunos = function (alunos, criterio) {
    return alunos.slice().sort(criterio === "antiguidade" ? ordemAntiguidade : ordemAlfabetica);
  };

  /** Turmas que aparecem na lista, em ordem: ["M36.1", "N36.1"]. */
  M.turmasDaLista = function (cfg) {
    var turmas = {};
    cfg.alunos.forEach(function (a) { turmas[a.turma] = true; });
    return Object.keys(turmas).sort(M.comparar);
  };

  /** A rela pronta para mostrar, copiar ou imprimir, como uma lista de folhas.
      opcoes: {criterio: "alfabetica"|"antiguidade", agrupar: "ano"|"turma", separar: true|false,
               turmas: ["M36.1", ...] ou null (todas), mostrar: "todos"|"municiados"|"nao"}.
      Entram só os marcados, separados pela planilha. Juntas: uma folha com as seções MUNICIADOS e NÃO MUNICIADOS.
      Separadas: uma folha para cada.
      Por turma: dentro de cada seção, um grupo por turma (turmas em ordem), cada um na ordem pedida.
      Com turmas escolhidas, só elas entram, e o título diz quais são. */
  M.relaEstruturada = function (cfg, marcados, sexta, opcoes) {
    opcoes = opcoes || {};
    var titulo = M.tituloRela(cfg, sexta), sim = [], nao = [], alunos = cfg.alunos;
    if (opcoes.turmas) {
      alunos = alunos.filter(function (a) { return opcoes.turmas.indexOf(a.turma) >= 0; });
      titulo += " · " + (opcoes.turmas.length === 1 ? "Turma " : "Turmas ") + opcoes.turmas.slice().sort(M.comparar).join(", ");
    }
    // só quem foi marcado (veio); a planilha (ou o serviço) diz se estava municiado naquele dia e refeição
    var chave = M.chaveMarca(cfg.dia, cfg.refeicao);
    M.ordenarAlunos(alunos, opcoes.criterio).forEach(function (a) {
      // municiado = a planilha diz que sim ou é municiado automático (quem está de serviço): opcoes.automatico, o mesmo conjunto da tela de marcar
      if (marcados.has(M.chaveAluno(a))) (a.marcas[chave] || (opcoes.automatico && M.noConjunto(opcoes.automatico, a)) ? sim : nao).push(a);
    });
    function secao(nome, alunos) {
      var grupos = [{ turma: null, alunos: alunos }];
      if (opcoes.agrupar === "turma") {
        var porTurma = {};
        alunos.forEach(function (a) { (porTurma[a.turma] = porTurma[a.turma] || []).push(a); });
        grupos = Object.keys(porTurma).sort(M.comparar).map(function (t) { return { turma: t, alunos: porTurma[t] }; });
      }
      return { nome: nome, total: alunos.length, grupos: grupos };
    }
    var secoes = [secao("MUNICIADOS", sim), secao("NÃO MUNICIADOS", nao)];
    // mostrar só uma situação: uma folha só, com a situação no título
    if (opcoes.mostrar === "municiados" || opcoes.mostrar === "nao") {
      var s = secoes[opcoes.mostrar === "municiados" ? 0 : 1];
      return [{ titulo: titulo, situacao: s.nome, secoes: [s] }];
    }
    if (!opcoes.separar) return [{ titulo: titulo, situacao: null, secoes: secoes }];
    return secoes.map(function (s) { return { titulo: titulo, situacao: s.nome, secoes: [s] }; });
  };

  /** Uma folha em texto, pronta para copiar. */
  M.textoFolha = function (folha) {
    var linhas = ["Conferência – " + folha.titulo + (folha.situacao ? " – " + folha.situacao : "")];
    folha.secoes.forEach(function (s) {
      linhas.push("", s.nome + " (" + s.total + ")");
      if (!s.total) { linhas.push("(nenhum)"); return; }
      s.grupos.forEach(function (g, i) {
        if (g.turma) linhas.push.apply(linhas, (i ? [""] : []).concat(["Turma " + g.turma + " (" + g.alunos.length + ")"]));
        linhas.push.apply(linhas, g.alunos.map(M.linhaRela));
      });
    });
    return linhas.join("\n");
  };

  /** A rela inteira em texto (as folhas separadas por duas linhas em branco). */
  M.textoRela = function (cfg, marcados, sexta, opcoes) {
    return M.relaEstruturada(cfg, marcados, sexta, opcoes).map(M.textoFolha).join("\n\n\n");
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
