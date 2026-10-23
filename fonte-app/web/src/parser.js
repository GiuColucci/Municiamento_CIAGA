/* Grade de células -> alunos.

   Cada bloco de turma tem: linha da turma, linha dos dias, linha das refeições,
   os alunos e, por fim, uma tabela de totais. As colunas (dia x refeição) são
   descobertas pelo cabeçalho: cada dia abre um grupo de 4 colunas e a posição
   dentro do grupo define a refeição, porque o texto das refeições tem erros. */
(function (M) {
  "use strict";

  var DIAS = ["Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta", "Quinta"];
  var DIAS_UTEIS = ["Sexta", "Segunda", "Terça", "Quarta", "Quinta"];
  var REFEICOES = ["Café", "Almoço", "Janta", "Ceia"];
  var DIAS_NORM = DIAS.map(function (d) { return [M.normalizar(d), d]; });
  var PREFIXO_REFEICAO = { caf: "Café", alm: "Almoço", jan: "Janta", cei: "Ceia" };
  var ROTULOS_EXATOS = ["cafe", "cafe da manha", "almoco", "janta", "jantar", "ceia"];
  M.DIAS = DIAS;
  M.DIAS_UTEIS = DIAS_UTEIS;
  M.REFEICOES_TODAS = REFEICOES;

  M.chaveMarca = function (dia, ref) { return dia + "|" + ref; };

  function dia(texto) {
    var t = M.normalizar(texto);
    if (t.length < 5) return null;
    for (var i = 0; i < DIAS_NORM.length; i++) if (t.indexOf(DIAS_NORM[i][0]) === 0) return DIAS_NORM[i][1];
    return null;
  }

  /** Tolerante a erros ('Jant', 'Almoç'): só para contar a linha de refeições. */
  function refeicao(texto) {
    return PREFIXO_REFEICAO[M.normalizar(texto).slice(0, 3)] || null;
  }

  /** Rótulo de uma linha de totais. Exato, para 'ALMEIDA' não virar 'Almoço'. */
  function rotuloRefeicao(texto) {
    var t = M.normalizar(texto);
    return ROTULOS_EXATOS.indexOf(t) >= 0 ? PREFIXO_REFEICAO[t.slice(0, 3)] : null;
  }

  function cel(linha, j) { return j < linha.length ? linha[j] : ""; }
  function qtdDias(linha) { return linha.filter(function (c) { return dia(c); }).length; }
  function qtdRefeicoes(linha) { return linha.filter(function (c) { return refeicao(c); }).length; }

  /** Índices [linha dos dias, linha das refeições] de cada bloco de turma. */
  M.cabecalhos = function (linhas) {
    var achados = [];
    linhas.forEach(function (linha, i) {
      if (qtdDias(linha) >= 3) {
        for (var k = i + 1; k <= i + 2; k++) {
          if (k < linhas.length && qtdRefeicoes(linhas[k]) >= 8) { achados.push([i, k]); break; }
        }
      }
    });
    return achados;
  };

  function mapaColunas(linhaDias) {
    var mapa = new Map(), d = null, inicio = 0;
    linhaDias.forEach(function (c, j) {
      var achado = dia(c);
      if (achado) { d = achado; inicio = j; }
      if (d && j - inicio >= 0 && j - inicio < 4) mapa.set(j, [d, REFEICOES[j - inicio]]);
    });
    return mapa;
  }

  function turmaNaLinha(linha) {
    for (var j = 0; j < Math.min(3, linha.length); j++) {
      var t = M.acharTurma(linha[j]);
      if (t) return t;
    }
    return null;
  }

  function numero(texto) {
    var t = String(texto).replace(",", ".").trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
    var v = Number(t);
    return Number.isInteger(v) && v >= 0 ? v : null;
  }

  /** Linha k tem os dias; as seguintes trazem o rótulo da refeição nas duas
      primeiras colunas e os números embaixo de cada dia. */
  function lerTotais(linhas, k) {
    var colunas = [];
    linhas[k].forEach(function (c, j) { var d = dia(c); if (d) colunas.push([j, d]); });
    var totais = new Map();
    var fim = Math.min(linhas.length, k + 8);
    for (var i = k + 1; i < fim; i++) {
      var linha = linhas[i], ref = null;
      for (var j = 0; j < Math.min(2, linha.length); j++) { if (rotuloRefeicao(linha[j])) { ref = rotuloRefeicao(linha[j]); break; } }
      if (!ref) {
        if (linha.some(function (c) { return c; })) break;
        continue;
      }
      colunas.forEach(function (par) {
        var v = numero(cel(linha, par[0]));
        if (v === null) v = numero(cel(linha, par[0] + 1));
        if (v !== null) totais.set(M.chaveMarca(par[1], ref), v);
      });
    }
    return totais;
  }

  /** Devolve [nome, codigo, observação]. Trata código junto do nome e nome longo
      que invade a célula do código (os 4 dígitos continuam legíveis). */
  function codigo(nome, cod, turma) {
    var semEspaco = cod.replace(/ /g, "");
    if (M.CODIGO_FULL.test(semEspaco)) return [nome, semEspaco, null];
    if (!cod) {
      var noNome = M.codigos(nome);
      if (noNome.length === 1) return [M.limpar(nome.replace(noNome[0], "")), noNome[0], null];
      return [nome, "", null];
    }
    var achados = M.codigos(semEspaco);
    if (achados.length === 1) return [nome, achados[0], "código lido como " + achados[0] + " a partir de " + repr(cod)];
    var digitos = cod.replace(/\D/g, "");
    if (digitos.length === 4 && "BMN".indexOf(turma.charAt(0)) >= 0 && turma) {
      var c = turma.charAt(0) + digitos;
      return [nome, c, "código lido como " + c + " a partir de " + repr(cod)];
    }
    return [nome, "", null];
  }

  /** Como o repr() do Python para textos simples: entre aspas simples. */
  function repr(s) {
    return s.indexOf("'") >= 0 && s.indexOf('"') < 0 ? '"' + s + '"' : "'" + s.replace(/'/g, "\\'") + "'";
  }

  function proximaTurma(ultima, n) {
    if (ultima && ultima.indexOf(".") >= 0) {
      var i = ultima.lastIndexOf("."), num = ultima.slice(i + 1);
      if (/^\d+$/.test(num)) return ultima.slice(0, i) + "." + (Number(num) + 1);
    }
    return "?" + n;
  }

  function Resultado() {
    this.alunos = [];
    this.avisos = [];   // [{texto, grave}]
    this.turmas = [];   // [{codigo, alunos, origem}]
  }
  Resultado.prototype.avisar = function (texto, grave) { this.avisos.push({ texto: texto, grave: !!grave }); };
  M.Resultado = Resultado;

  /** Lê todas as grades e devolve alunos, turmas e avisos. */
  M.parseGrade = function (grades) {
    var res = new Resultado(), ultima = null, vistas = {};
    grades.forEach(function (g) {
      var linhas = g.linhas, cabs = M.cabecalhos(linhas);
      cabs.forEach(function (cab, nBloco) {
        var iDias = cab[0], iRef = cab[1];
        var fim = nBloco + 1 < cabs.length ? cabs[nBloco + 1][0] : linhas.length;
        var inicioBusca = nBloco ? cabs[nBloco - 1][1] + 1 : 0;
        var naCelula = null;
        for (var i = Math.max(inicioBusca, iDias - 3); i <= iRef; i++) {
          naCelula = turmaNaLinha(linhas[i]);
          if (naCelula) break;
        }
        var turma = escolherTurma(res, g, nBloco, naCelula, ultima, res.turmas.length + 1);
        ultima = turma;
        if (vistas[turma]) {
          res.avisar("A turma " + turma + " aparece duas vezes (" + vistas[turma] + " e " + g.origem + "). " +
            "Confira se o mesmo arquivo foi escolhido duas vezes.", true);
        }
        vistas[turma] = g.origem;
        var alunos = lerBloco(res, g, linhas, iDias, iRef, fim, turma);
        Array.prototype.push.apply(res.alunos, alunos);
        res.turmas.push({ codigo: turma, alunos: alunos.length, origem: g.origem });
      });
    });
    duplicados(res);
    return res;
  };

  function escolherTurma(res, g, nBloco, naCelula, ultima, n) {
    if (g.turmaAba && nBloco === 0) {
      if (naCelula && naCelula !== g.turmaAba) {
        res.avisar("A aba " + g.turmaAba + " tem " + naCelula + " escrito no cabeçalho. Usei " + g.turmaAba + " (o nome da aba).");
      }
      return g.turmaAba;
    }
    if (naCelula) return naCelula;
    if (g.turmaArquivo && nBloco === 0) return g.turmaArquivo;
    var turma = proximaTurma(ultima, n);
    res.avisar(g.origem + ": o nome da turma está ilegível ou ausente na planilha; assumi " + turma + ". Confira.", true);
    return turma;
  }

  function lerBloco(res, g, linhas, iDias, iRef, fim, turma) {
    var mapa = mapaColunas(linhas[iDias]);
    var achados = new Set(Array.from(mapa.values()).map(function (v) { return v[0]; }));
    var faltam = DIAS.filter(function (d) { return !achados.has(d); });
    if (faltam.length) {
      res.avisar(turma + ": não encontrei a coluna de " + faltam.join(", ") + " no cabeçalho. " +
        "As listas desses dias ficariam erradas para esta turma.", true);
    }
    var alunos = [], totais = new Map();
    for (var k = iRef + 1; k < fim; k++) {
      var linha = linhas[k];
      var doisPrimeiros = linha.slice(0, 2).join(" ");
      if (qtdDias(linha) >= 3) { totais = lerTotais(linhas, k); break; }
      if (linha.slice(0, 2).some(function (c) { return rotuloRefeicao(c); }) && !M.codigos(doisPrimeiros).length) break;
      if (turmaNaLinha(linha) && !M.codigos(doisPrimeiros).length) break;
      var nome = M.limpar(cel(linha, 0)), cod = M.limpar(cel(linha, 1));
      var marcadas = new Map();
      mapa.forEach(function (_, j) { marcadas.set(j, M.limpar(cel(linha, j))); });
      var temMarca = Array.from(marcadas.values()).some(function (v) { return v; });
      var onde = g.local(k);
      if (!nome && !cod) {
        if (temMarca) res.avisar(turma + ", " + onde + ": linha com marcações mas sem nome nem código; ignorei.");
        continue;
      }
      var r = codigo(nome, cod, turma), cod2 = r[1];
      nome = r[0];
      if (r[2]) res.avisar(turma + ", " + onde + ": " + r[2] + ". Confira.");
      if (!cod2) {
        if (!temMarca) {
          res.avisar(turma + ", " + onde + ": linha sem código de aluno e sem marcações (" + repr(nome || cod) + "); ignorei.");
          continue;
        }
        res.avisar(turma + ", " + onde + ": aluno sem código válido (" + repr(nome || cod) + "); incluí assim mesmo.");
      } else if (cod2.charAt(0) !== turma.charAt(0)) {
        res.avisar(turma + ", " + onde + ": o código " + cod2 + " não é do curso da turma. Confira.");
      }
      if (!nome) {
        res.avisar(turma + ", " + onde + ": aluno " + cod2 + " sem nome na planilha.");
        nome = cod2;
      }
      var marcas = {};
      DIAS.forEach(function (d) { REFEICOES.forEach(function (rf) { marcas[M.chaveMarca(d, rf)] = false; }); });
      marcadas.forEach(function (valor, j) {
        if (!valor) return;
        var dr = mapa.get(j);
        marcas[M.chaveMarca(dr[0], dr[1])] = true;
        if (M.normalizar(valor) !== "x") {
          res.avisar("Valor inesperado \"" + valor + "\" em " + turma + ", " + onde + " (" + dr[0] + "/" + dr[1] + "); contei como marcação.");
        }
      });
      alunos.push({ nome: nome, codigo: cod2, turma: turma, marcas: marcas });
    }
    if (!alunos.length) res.avisar(turma + ": nenhum aluno encontrado nesta turma.", true);
    conferir(res, turma, alunos, totais);
    return alunos;
  }

  /** Compara as marcações contadas com a linha de totais da própria planilha, nos
      dias e refeições que viram lista; divergência é aviso, nunca bloqueio. */
  function conferir(res, turma, alunos, totais) {
    DIAS.forEach(function (d) {
      // a ceia não vira lista na versão padrão; só nas outras os totais dela são conferidos
      (M.REGRA === "padrao" ? REFEICOES.slice(0, 3) : REFEICOES).forEach(function (rf) {
        var chave = M.chaveMarca(d, rf);
        if (!totais.has(chave)) return;
        var esperado = totais.get(chave);
        var obtido = alunos.filter(function (a) { return a.marcas[chave]; }).length;
        if (obtido !== esperado) {
          var dif = obtido - esperado;
          res.avisar(turma + ", " + d + "/" + rf + ": contei " + obtido + " marcações, a planilha informa " +
            esperado + " (" + (dif > 0 ? "+" : "") + dif + ").");
        }
      });
    });
  }

  function duplicados(res) {
    var vistos = new Map();
    res.alunos.forEach(function (a) {
      if (!a.codigo) return;
      if (!vistos.has(a.codigo)) vistos.set(a.codigo, []);
      vistos.get(a.codigo).push(a);
    });
    vistos.forEach(function (lst, cod) {
      if (lst.length > 1) {
        res.avisar("Código " + cod + " repetido: " + lst.map(function (a) { return a.nome + " (" + a.turma + ")"; }).join(", ") +
          ". Os dois foram mantidos.");
      }
    });
  }
})(globalThis.Municiamento = globalThis.Municiamento || {});
