/* Modo hospedado (versão no servidor): empacotar a planilha lida para publicar, restaurar a planilha publicada,
   rascunho automático das marcações e a chamada ao servidor. Sem o servidor (arquivo aberto no computador) nada
   daqui é usado. As funções de empacotar são puras, para testar sem navegador. */
(function (M) {
  "use strict";

  var DIAS = M.DIAS, REFEICOES = M.REFEICOES_TODAS;

  // As 28 marcações (7 dias x 4 refeições) de um aluno cabem num número inteiro, um bit para cada.
  function bitsDe(marcas) {
    var n = 0;
    DIAS.forEach(function (d, i) {
      REFEICOES.forEach(function (r, j) { if (marcas[M.chaveMarca(d, r)]) n += Math.pow(2, i * 4 + j); });
    });
    return n;
  }
  function marcasDe(n) {
    var m = {};
    DIAS.forEach(function (d, i) {
      REFEICOES.forEach(function (r, j) { m[M.chaveMarca(d, r)] = Math.floor(n / Math.pow(2, i * 4 + j)) % 2 === 1; });
    });
    return m;
  }

  /** Planilha lida -> objeto pequeno para guardar (o servidor cifra antes de gravar). */
  M.empacotarPlanilha = function (res, sexta, formato) {
    return {
      v: 1,
      formato: formato || "XLSX",
      sexta: sexta || null,
      turmas: res.turmas.map(function (t) { return [t.codigo, t.alunos, t.origem || ""]; }),
      avisos: res.avisos.map(function (a) { return [a.texto, a.grave ? 1 : 0]; }),
      alunos: res.alunos.map(function (a) { return [a.nome, a.codigo, a.turma, bitsDe(a.marcas)]; })
    };
  };

  /** O inverso: devolve {res, sexta, formato}, com o mesmo formato do que a leitura da planilha produz. */
  M.desempacotarPlanilha = function (d) {
    if (!d || d.v !== 1 || !Array.isArray(d.alunos) || !Array.isArray(d.turmas) || !Array.isArray(d.avisos)) {
      throw new Error("planilha publicada inválida");
    }
    var res = new M.Resultado();
    res.alunos = d.alunos.map(function (a) { return { nome: a[0], codigo: a[1], turma: a[2], marcas: marcasDe(a[3]) }; });
    res.turmas = d.turmas.map(function (t) { return { codigo: t[0], alunos: t[1], origem: t[2] || "" }; });
    res.avisos = d.avisos.map(function (a) { return { texto: a[0], grave: !!a[1] }; });
    return { res: res, sexta: d.sexta || null, formato: d.formato || "XLSX" };
  };

  var CAMPOS_LISTA = ["id", "dia", "refeicao", "ano", "finalizada", "criterio", "agrupar", "separar", "turmas", "mostrar",
    "turmasMarcacao", "marcacaoPorTurma", "filtroMarcacao"];

  /** Estado das listas e das marcações -> objeto para guardar como rascunho (só o que é preciso para voltar). */
  M.empacotarRascunho = function (estado, proximoId) {
    return {
      v: 1,
      planilha: estado.planilhaId || "",
      sexta: estado.sexta || null,
      ativa: estado.ativa,
      proximoId: proximoId,
      listas: estado.listas.map(function (l) {
        var o = {};
        CAMPOS_LISTA.forEach(function (c) { o[c] = l[c]; });
        o.marcados = Array.from(l.marcados);
        return o;
      })
    };
  };

  /** Recoloca o rascunho no estado. Só vale se for da mesma planilha; devolve o próximo id de lista, ou null se não serviu. */
  M.aplicarRascunho = function (estado, d) {
    if (!d || d.v !== 1 || d.planilha !== estado.planilhaId || !Array.isArray(d.listas)) return null;
    var validos = new Set(estado.res.alunos.map(M.chaveAluno));
    var anos = M.anosPresentes(estado.res.alunos);
    var listas = [], maior = 0;
    d.listas.forEach(function (o) {
      if (!o || M.DIAS_LISTA.indexOf(o.dia) < 0 || REFEICOES.indexOf(o.refeicao) < 0 || anos.indexOf(o.ano) < 0) return;
      var l = {
        id: Number(o.id) || listas.length + 1,
        dia: o.dia, refeicao: o.refeicao, ano: o.ano,
        finalizada: !!o.finalizada,
        criterio: o.criterio === "antiguidade" ? "antiguidade" : "alfabetica",
        agrupar: o.agrupar === "turma" ? "turma" : "ano",
        separar: !!o.separar,
        turmas: Array.isArray(o.turmas) ? o.turmas : null,
        mostrar: ["todos", "municiados", "nao"].indexOf(o.mostrar) >= 0 ? o.mostrar : "todos",
        turmasMarcacao: Array.isArray(o.turmasMarcacao) ? o.turmasMarcacao : null,
        marcacaoPorTurma: !!o.marcacaoPorTurma,
        filtroMarcacao: ["todos", "municiados", "nao"].indexOf(o.filtroMarcacao) >= 0 ? o.filtroMarcacao : "todos",
        marcados: new Set((Array.isArray(o.marcados) ? o.marcados : []).filter(function (k) { return validos.has(k); }))
      };
      l.alunos = M.alunosDoAno(estado.res.alunos, l.ano);
      maior = Math.max(maior, l.id);
      listas.push(l);
    });
    estado.listas = listas;
    estado.ativa = listas.some(function (l) { return l.id === d.ativa; }) ? d.ativa : (listas[0] ? listas[0].id : null);
    if (d.sexta) estado.sexta = d.sexta;
    return Math.max(maior + 1, Number(d.proximoId) || 1);
  };

  /** Conversa com o servidor (mesmo endereço do app). Devolve {status, json}; status 0 = sem conexão. */
  M.api = function (metodo, caminho, corpo, mantem) {
    var opcoes = { method: metodo, credentials: "same-origin", headers: {} };
    if (corpo !== undefined) {
      opcoes.headers["Content-Type"] = "application/json";
      opcoes.body = JSON.stringify(corpo);
    }
    if (mantem) opcoes.keepalive = true; // termina o envio mesmo se a página estiver fechando
    return fetch(caminho, opcoes).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, json: j }; }, function () { return { status: r.status, json: null }; });
    }, function () { return { status: 0, json: null }; });
  };
})(globalThis.Municiamento = globalThis.Municiamento || {});
