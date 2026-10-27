/* Testes da versão HTML (node --test web/testes). Só dados fictícios.
   O resultado esperado vem da versão Python já testada (tests/gerar_fixtures.py). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { M, RAIZ, fixture } = require("./ambiente.cjs");

const ESPERADO = JSON.parse(fs.readFileSync(path.join(RAIZ, "tests", "fixtures", "esperado.json"), "utf-8"));
const TURMAS = ["B12.1", "B12.2", "M24.1", "N24.1", "M36.1", "N36.1"];
const SEXTA = "2026-10-23";

async function ler(arquivos) {
  const leitura = await M.carregarGrades(arquivos.map(([nome, bytes]) => ({ nome, bytes })));
  return { leitura, res: M.parseGrade(leitura.grades) };
}

function resumo(res) {
  return {
    alunos: res.alunos.map((a) => [a.turma, a.codigo, a.nome, Object.keys(a.marcas).filter((k) => a.marcas[k]).sort()]),
    turmas: res.turmas.map((t) => [t.codigo, t.alunos]),
    avisos: res.avisos.map((a) => [a.texto, a.grave]),
    listas: M.montarListas(res.alunos, SEXTA).map((l) => [l.dia, l.refeicao, l.grupo, l.alunos.map((a) => a[2])]),
  };
}

// Python ordena as marcações por ponto de código; aqui também
function ordenarMarcas(r) {
  r.alunos.forEach((a) => a[3].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  return r;
}

test("XLSX fictício: igual à versão Python (alunos, avisos, listas e data)", async () => {
  const { leitura, res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const { sexta, ...esperado } = ESPERADO.xlsx;
  assert.equal(leitura.formato, "XLSX");
  assert.equal(leitura.sextaSugerida, sexta);
  assert.deepEqual(ordenarMarcas(resumo(res)), ordenarMarcas(esperado));
});

test("vários CSVs formam o mesmo resultado que o XLSX", async () => {
  const csvs = TURMAS.map((t) => [t + ".csv", fixture(t + ".csv")]);
  const a = resumo((await ler(csvs)).res);
  const b = resumo((await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]])).res);
  assert.deepEqual(a, b);
});

test("CSV com os problemas reais: mesmos avisos, turmas e listas que o Python", async () => {
  const { res } = await ler([["problematico.csv", fixture("problematico.csv")]]);
  assert.deepEqual(ordenarMarcas(resumo(res)), ordenarMarcas(ESPERADO.problematico));
});

test("regra padrão: 105 listas, dias úteis como antes e sábado/domingo com os municiados", async () => {
  M.REGRA = "padrao";
  const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const listas = M.montarListas(res.alunos, SEXTA);
  assert.equal(listas.length, 105);
  const ordem = [];
  for (const d of ["Sexta", "Sábado", "Domingo", "Segunda", "Terça", "Quarta", "Quinta"])
    for (const r of ["Café", "Almoço", "Janta"])
      for (const g of ["B1", "M2", "N2", "M3", "N3"]) ordem.push([d, r, g].join());
  assert.deepEqual(listas.map((l) => [l.dia, l.refeicao, l.grupo].join()), ordem);
  const porChave = new Map(res.alunos.map((a) => [a.turma + a.codigo, a]));
  for (const l of listas) {
    assert.equal(l.municiados, l.refeicao === "Café" || l.dia === "Sábado" || l.dia === "Domingo");
    for (const [, turma, cod] of l.alunos) assert.equal(porChave.get(turma + cod).marcas[l.dia + "|" + l.refeicao], l.municiados);
  }
  assert.deepEqual(M.datasDaSemana(SEXTA).Quinta, "2026-10-29");
  assert.equal(listas[0].refeicaoRotulo + " / " + listas[0].grupoRotulo, "Café da manhã / 1° Ano – Básico");
});

test("regra padrão: filtro de situação separa municiados e NÃO municiados", async () => {
  M.REGRA = "padrao";
  const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const listas = M.montarListas(res.alunos, SEXTA);
  const mun = M.filtrar(listas, { situacao: "municiados" }), nao = M.filtrar(listas, { situacao: "nao" });
  assert.equal(mun.length, 55); // café dos 5 dias úteis + as 3 refeições de sábado e domingo
  assert.equal(nao.length, 50); // almoço e janta dos 5 dias úteis
  assert.ok(mun.every((l) => l.municiados) && nao.every((l) => !l.municiados));
  assert.equal(M.filtrar(listas, { situacao: "nao", dia: "Sábado" }).length, 0);
});

test("ordem alfabética sem acento, empate pelo código", () => {
  const marcas = { "Sexta|Café": true };
  const alunos = [["ARAUJO", "B1003"], ["ÂNGELO", "B1002"], ["alves", "B1009"], ["Bruno", "B1020"], ["Bruno", "B1010"]]
    .map(([nome, codigo]) => ({ nome, codigo, turma: "B12.1", marcas }));
  const l = M.filtrar(M.montarListas(alunos, SEXTA), { dia: "Sexta", refeicao: "Café" })[0];
  assert.deepEqual(l.alunos.map((a) => a[2]), ["B1009", "B1002", "B1003", "B1010", "B1020"]);
});

test("arquivos recusados com mensagem clara", async () => {
  const zipCom = async (nomes) => {
    const z = new JSZip();
    nomes.forEach((n) => z.file(n, "<x/>"));
    return z.generateAsync({ type: "uint8array" });
  };
  const casos = [
    ["planilha.xlsm", await zipCom(["xl/workbook.xml"]), /macros/],
    ["planilha.xlsx", await zipCom(["xl/workbook.xml", "xl/vbaProject.bin"]), /macros/],
    ["doc.docx", await zipCom(["word/document.xml"]), /não é uma planilha/],
    ["velha.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]), /\.xls/],
    ["lista.pdf", new TextEncoder().encode("%PDF-1.4 qualquer"), /Não consegui abrir esse PDF/],
    ["texto.xlsx", new TextEncoder().encode("oi"), /extensão \.xlsx/],
    ["vazio.csv", new Uint8Array(), /vazio/],
    ["foto.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]), /Formato não aceito/],
    ["grande.csv", new Uint8Array(10 * 1024 * 1024 + 1), /10 MB/],
  ];
  for (const [nome, bytes, erro] of casos) {
    await assert.rejects(M.carregarGrades([{ nome, bytes }]), (e) => e instanceof M.ArquivoInvalido && erro.test(e.message), nome);
  }
  await assert.rejects(M.carregarGrades([{ nome: "a.xlsx", bytes: fixture("ficticio.xlsx") }, { nome: "B12.1.csv", bytes: fixture("B12.1.csv") }]), /use CSV/);
});

test("CSV em ; , e tab, em UTF-8 e em Windows-1252", async () => {
  const original = new TextDecoder().decode(fixture("B12.1.csv"));
  const base = resumo((await ler([["B12.1.csv", fixture("B12.1.csv")]])).res);
  for (const sep of [",", "\t"]) {
    const txt = original.replace(/;/g, sep);
    assert.deepEqual(resumo((await ler([["B12.1.csv", new TextEncoder().encode(txt)]])).res), base, sep);
  }
  const latin = Uint8Array.from(original.replace(/^﻿/, ""), (c) => c.charCodeAt(0) & 0xff);
  assert.deepEqual(resumo((await ler([["B12.1.csv", latin]])).res), base);
});

test("paginação em colunas, com continuação", () => {
  const alunos = Array.from({ length: 150 }, (_, i) => ["ALUNO " + i, "B12.1", "B1" + String(i).padStart(3, "0")]);
  const l = new M.Lista(SEXTA, "Sexta", "Almoço", "B1", false, alunos, 150);
  const p = M.paginar([l]);
  assert.equal(p.length, 2); // 92 na primeira página + 58 na continuação
  assert.deepEqual(p[0].colunas[0].map((i) => i[0]), Array.from({ length: 46 }, (_, i) => i + 1));
  assert.equal(p[0].colunas[1][0][0], 47);
  assert.equal(p[1].linhas, 29);
  assert.deepEqual(p.flatMap((x) => x.colunas.flat().map((i) => i[0])), Array.from({ length: 150 }, (_, i) => i + 1));
  const pequena = M.paginar([new M.Lista(SEXTA, "Sexta", "Café", "B1", true, alunos.slice(0, 33), 33)])[0];
  assert.equal(pequena.linhas, 17);
});

test("nome longo cabe na célula", () => {
  assert.deepEqual(M.ajustarRotulo("1. ALVES - B12.1"), ["1. ALVES - B12.1", 11]);
  assert.ok(M.ajustarRotulo("120. FULANA DE TAL FONSECA DE ALBUQUERQUE CAVALCANTI - B12.1")[1] < 11);
  const [t, tam] = M.ajustarRotulo("120. " + "NOME MUITO GRANDE ".repeat(6) + "- B12.1");
  assert.equal(tam, 8.5);
  assert.ok(t.endsWith("…"));
});

test("DOCX: estrutura, marca d'água atrás do texto, sem rodapé nem assinaturas", async () => {
  const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const listas = M.montarListas(res.alunos, SEXTA);
  const z = await JSZip.loadAsync(await M.gerarDocx(listas));
  const doc = await z.file("word/document.xml").async("string");
  const cab = await z.file("word/header1.xml").async("string");
  assert.match(cab, /behindDoc="1"/);
  assert.ok(!z.file("word/footer1.xml"));
  assert.ok(!z.file("word/media/brasao.png") && !/<wp:inline/.test(doc)); // sem brasão no topo
  const quebras = (doc.match(/<w:pageBreakBefore\/>/g) || []).length;
  assert.equal(quebras + 1, M.paginar(listas).length);
  assert.equal((doc.match(/>Municiamento</g) || []).length, 105); // o título de cada lista
  assert.ok(!/Marinha do Brasil|Escola de Formação|Centro de Instrução/.test(doc));
  assert.ok((doc.match(/<w:tbl>/g) || []).length > 0);
  assert.ok(!/assinatura|comandante|gerado em/i.test(doc));
  assert.match(doc, /<w:b\/><w:sz w:val="24"\/><w:u w:val="single"\/><\/w:rPr><w:t xml:space="preserve">NÃO</);
  assert.match(doc, /A6A6A6/);
});

test("PDF: mesmas páginas do DOCX, marca d'água em todas", async () => {
  const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const listas = M.montarListas(res.alunos, SEXTA);
  const pdf = Buffer.from(M.gerarPdf(listas)).toString("latin1");
  const paginas = (pdf.match(/\/Type \/Page[^s]/g) || []).length;
  assert.equal(paginas, M.paginar(listas).length);
  // só a marca d'água (sem brasão no topo): entra uma vez e é reaproveitada em todas as páginas
  assert.equal((pdf.match(/\/Subtype \/Image/g) || []).length, 1);
});

test("nome do arquivo", () => {
  assert.equal(M.nomeArquivo(SEXTA, "docx"), "municiamento_2026-10-23.docx");
  assert.equal(M.nomeArquivo(SEXTA, "pdf", { dia: "Terça", refeicao: "Almoço", grupo: "N2" }), "municiamento_2026-10-23_terca_almoco_n2.pdf");
  assert.equal(M.nomeArquivo(SEXTA, "pdf", { dia: "Sábado", situacao: "nao" }), "municiamento_2026-10-23_sabado_nao-municiados.pdf");
});

test("data da sexta pelo texto do resumo", () => {
  assert.equal(M.sextaDoTexto("QUINTA (22/10) SEXTA (23/10)", 2026), "2026-10-23");
  assert.equal(M.sextaDoTexto("SEXTA (24/10)", 2026), null);
  assert.equal(M.diaDaSemana("2026-10-23"), 4);
});

test("PDF fictício: mesmos alunos, marcações e turmas que o XLSX", async () => {
  const { leitura, res } = await ler([["ficticio.pdf", fixture("ficticio.pdf")]]);
  assert.equal(leitura.formato, "PDF");
  const { sexta, avisos, ...esperado } = ESPERADO.xlsx;
  const r = ordenarMarcas(resumo(res));
  delete r.avisos;
  assert.deepEqual(r, ordenarMarcas(esperado));
  assert.deepEqual(res.avisos, []);
});

test("PDF: só a tabela da turma vira grade; uma página sem tabela não", async () => {
  const doc = new jspdf.jsPDF({ unit: "pt" });
  doc.text("SEXTA SÁBADO DOMINGO SEGUNDA", 40, 60);
  doc.text("CAFÉ 10 20 30", 40, 80);
  const { leitura, res } = await ler([["resumo.pdf", new Uint8Array(doc.output("arraybuffer"))]]);
  assert.equal(leitura.grades.length, 0);
  assert.equal(res.turmas.length, 0);
});

test("regra completa: municiados e NÃO municiados em todo dia e refeição, com a ceia", async () => {
  M.REGRA = "completa";
  try {
    const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
    const listas = M.montarListas(res.alunos, SEXTA);
    assert.equal(listas.length, 280); // 7 dias x 4 refeições x 5 grupos x 2 situações
    assert.deepEqual([...new Set(listas.map((l) => l.refeicao))], ["Café", "Almoço", "Janta", "Ceia"]);
    // cada par (municiados, NÃO municiados) cobre o grupo inteiro, sem repetir ninguém
    const porChave = new Map(res.alunos.map((a) => [a.turma + a.codigo, a]));
    for (let i = 0; i < listas.length; i += 2) {
      const [a, b] = [listas[i], listas[i + 1]];
      assert.equal(a.municiados, true); assert.equal(b.municiados, false);
      assert.deepEqual([a.dia, a.refeicao, a.grupo], [b.dia, b.refeicao, b.grupo]);
      assert.equal(a.alunos.length + b.alunos.length, a.totalGrupo);
      const codigos = new Set(a.alunos.concat(b.alunos).map((x) => x[1] + x[2]));
      assert.equal(codigos.size, a.totalGrupo);
      for (const [, t, c] of a.alunos) assert.equal(porChave.get(t + c).marcas[a.dia + "|" + a.refeicao], true);
    }
    const ceia = M.filtrar(listas, { dia: "Terça", refeicao: "Ceia" });
    assert.equal(ceia.length, 10);
    assert.equal(ceia[0].refeicaoRotulo, "Ceia");
    assert.equal(M.filtrar(listas, { situacao: "municiados" }).length, 140);
    assert.equal(M.filtrar(listas, { situacao: "nao", dia: "Domingo" }).length, 20);
    // filtro com várias refeições e vários grupos ao mesmo tempo
    const varios = M.filtrar(listas, { refeicao: ["Almoço", "Janta"], grupo: ["B1", "N3"] });
    assert.equal(varios.length, 7 * 2 * 2 * 2);
    assert.ok(varios.every((l) => ["Almoço", "Janta"].includes(l.refeicao) && ["B1", "N3"].includes(l.grupo)));
    assert.equal(M.filtrar(listas, { refeicao: [] }).length, 0);
    assert.equal(M.nomeArquivo(SEXTA, "pdf", { refeicao: ["Almoço", "Janta"], grupo: ["B1", "N3"] }),
      "municiamento_2026-10-23_almoco-janta_b1-n3.pdf");
    assert.equal(M.montarListas(res.alunos, SEXTA, ["Sábado"]).length, 40);
    // os totais da ceia na planilha também são conferidos (o XLSX fictício bate com eles)
    assert.deepEqual(M.parseGrade((await M.carregarGrades([{ nome: "f.xlsx", bytes: fixture("ficticio.xlsx") }])).grades).avisos, []);
  } finally {
    M.REGRA = "padrao";
  }
  assert.ok(!M.REFEICOES.includes("Ceia")); // a versão padrão continua sem a ceia
});

test("documentos: cabeçalho só com o brasão e o título Municiamento, também no PDF", async () => {
  const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const listas = M.filtrar(M.montarListas(res.alunos, SEXTA), { dia: "Sábado", refeicao: "Almoço" });
  assert.ok(listas.every((l) => l.municiados && l.diaExtenso === "Sábado"));
  const pdf = M.gerarPdf(listas);
  const lib = globalThis.pdfjsLib;
  const doc = await lib.getDocument({ data: pdf, isEvalSupported: false }).promise;
  const texto = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
  assert.match(texto, /Municiamento/);
  assert.match(texto, /Dia 24\/10\/2026 \(Sábado\)/);
  assert.ok(!/Marinha do Brasil|Escola de Formação/.test(texto));
  await doc.destroy();
});

test("rela: lista do ano com todos os cursos e, na rela, só os marcados, separados pela planilha", async () => {
  M.REGRA = "rela";
  try {
    const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
    // a planilha fictícia bate com os totais (a conferência também vale na rela)
    assert.ok(!res.avisos.some((a) => /contei/.test(a.texto)));
    assert.deepEqual(M.anosPresentes(res.alunos), ["1", "2", "3"]);
    const terceiro = M.alunosDoAno(res.alunos, "3");
    assert.equal(terceiro.length, res.alunos.filter((a) => a.turma.charAt(1) === "3").length);
    assert.ok(new Set(terceiro.map((a) => a.turma.charAt(0))).size > 1); // Máquinas e Náutica juntos
    const chaves = terceiro.map((a) => M.chaveAlfabetica(a.nome));
    assert.deepEqual(chaves, chaves.slice().sort(M.comparar));

    const cfg = { dia: "Sexta", refeicao: "Janta", ano: "3", alunos: terceiro };
    // marca 6 alunos (em ordem invertida): a rela traz só eles, separados pela marcação da planilha na Sexta/Janta
    const vieram = terceiro.slice(0, 6);
    const marcados = new Set(vieram.slice().reverse().map(M.chaveAluno));
    const sim = vieram.filter((a) => a.marcas["Sexta|Janta"]), nao = vieram.filter((a) => !a.marcas["Sexta|Janta"]);
    assert.ok(sim.length && nao.length); // a planilha fictícia tem dos dois
    const [folha] = M.relaEstruturada(cfg, marcados, SEXTA);
    assert.deepEqual(folha.secoes[0].grupos[0].alunos, sim); // em ordem alfabética, não na ordem em que foi marcado
    assert.deepEqual(folha.secoes[1].grupos[0].alunos, nao);
    const texto = M.textoRela(cfg, marcados, SEXTA);
    assert.match(texto, /^Conferência – Sexta-feira, 23\/10\/2026 · Janta · 3° Ano\n/);
    assert.ok(texto.includes("MUNICIADOS (" + sim.length + ")\n" + sim.map(M.linhaRela).join("\n")));
    assert.ok(texto.includes("NÃO MUNICIADOS (" + nao.length + ")"));
    assert.ok(!texto.includes(M.linhaRela(terceiro[6]))); // quem não foi marcado não aparece
    assert.equal(M.linhaRela(terceiro[0]), terceiro[0].codigo + " – " + terceiro[0].nome + " – " + terceiro[0].turma);
    // sem data, só o nome do dia; sem marcações, "(nenhum)"
    assert.match(M.textoRela({ dia: "Domingo", refeicao: "Café", ano: "1", alunos: [] }, new Set(), null),
      /^Conferência – Domingo · Café da manhã · 1° Ano\n\nMUNICIADOS \(0\)\n\(nenhum\)/);
  } finally {
    M.REGRA = "padrao";
  }
});

test("rela: antiguidade pelo código CXNNN, agrupamento por turma e lista separada em duas", () => {
  // municiado = a planilha tem a marcação de Sexta/Janta
  const a = (nome, codigo, turma, municiado) => ({ nome, codigo, turma, marcas: { "Sexta|Janta": !!municiado } });
  const alunos = [a("BRUNO", "N2200", "N24.1"), a("ALVES", "M3221", "M36.1", true), a("CARLA", "N3005", "N36.1"),
    a("DIEGO", "M3005", "M36.1", true), a("EVA", "", "N36.1"), a("FABIO", "B1001", "B12.1"), a("GIL", "M3001", "M36.1", true)];
  // X maior primeiro (3 > 2 > 1); com o mesmo X, NNN crescente; o curso (C) não conta; empate pelo nome; sem código no fim
  assert.deepEqual(M.ordenarAlunos(alunos, "antiguidade").map((x) => x.nome), ["GIL", "CARLA", "DIEGO", "ALVES", "BRUNO", "FABIO", "EVA"]);
  assert.deepEqual(M.ordenarAlunos(alunos, "alfabetica").map((x) => x.nome), ["ALVES", "BRUNO", "CARLA", "DIEGO", "EVA", "FABIO", "GIL"]);

  const cfg = { dia: "Sexta", refeicao: "Janta", ano: "3", alunos: alunos.filter((x) => x.turma.charAt(1) === "3") };
  // vieram ALVES, CARLA, DIEGO e EVA; GIL não foi marcado e não entra, mesmo municiado na planilha
  const marcados = new Set(cfg.alunos.filter((x) => x.nome !== "GIL").map(M.chaveAluno));
  const juntas = M.relaEstruturada(cfg, marcados, SEXTA, { criterio: "antiguidade", agrupar: "turma" });
  assert.equal(juntas.length, 1);
  assert.deepEqual(juntas[0].secoes.map((s) => [s.nome, s.total]), [["MUNICIADOS", 2], ["NÃO MUNICIADOS", 2]]);
  assert.deepEqual(juntas[0].secoes[0].grupos.map((g) => [g.turma, g.alunos.map((x) => x.nome)]), [["M36.1", ["DIEGO", "ALVES"]]]);
  assert.deepEqual(juntas[0].secoes[1].grupos.map((g) => [g.turma, g.alunos.map((x) => x.nome)]), [["N36.1", ["CARLA", "EVA"]]]);
  assert.equal(M.textoFolha(juntas[0]), [
    "Conferência – Sexta-feira, 23/10/2026 · Janta · 3° Ano", "",
    "MUNICIADOS (2)", "Turma M36.1 (2)", "M3005 – DIEGO – M36.1", "M3221 – ALVES – M36.1", "",
    "NÃO MUNICIADOS (2)", "Turma N36.1 (2)", "N3005 – CARLA – N36.1", "s/ código – EVA – N36.1"].join("\n"));

  const separadas = M.relaEstruturada(cfg, marcados, SEXTA, { separar: true });
  assert.deepEqual(separadas.map((f) => [f.situacao, f.secoes.length, f.secoes[0].total]),
    [["MUNICIADOS", 1, 2], ["NÃO MUNICIADOS", 1, 2]]);
  assert.match(M.textoFolha(separadas[1]), /^Conferência – Sexta-feira, 23\/10\/2026 · Janta · 3° Ano – NÃO MUNICIADOS\n\nNÃO MUNICIADOS \(2\)\nN3005 – CARLA/);
  assert.equal(M.textoRela(cfg, marcados, SEXTA, { separar: true }), separadas.map(M.textoFolha).join("\n\n\n"));
});

test("rela: escolher as turmas que entram no agrupamento por turma", () => {
  const a = (nome, codigo, turma, municiado) => ({ nome, codigo, turma, marcas: { "Sexta|Janta": !!municiado } });
  const alunos = [a("ALVES", "M3221", "M36.1"), a("BRUNO", "N3100", "N36.1", true), a("CARLA", "M3300", "M36.2"), a("DIEGO", "N3005", "N36.1")];
  const cfg = { dia: "Sexta", refeicao: "Janta", ano: "3", alunos };
  assert.deepEqual(M.turmasDaLista(cfg), ["M36.1", "M36.2", "N36.1"]);
  const marcados = new Set(alunos.map(M.chaveAluno)); // todos vieram; só BRUNO estava municiado
  const folhas = M.relaEstruturada(cfg, marcados, SEXTA, { agrupar: "turma", turmas: ["N36.1", "M36.1"] });
  assert.equal(folhas[0].titulo, "Sexta-feira, 23/10/2026 · Janta · 3° Ano · Turmas M36.1, N36.1");
  assert.deepEqual(folhas[0].secoes.map((s) => [s.nome, s.total, s.grupos.map((g) => g.turma)]),
    [["MUNICIADOS", 1, ["N36.1"]], ["NÃO MUNICIADOS", 2, ["M36.1", "N36.1"]]]); // M36.2 (CARLA) ficou de fora
  const uma = M.relaEstruturada(cfg, marcados, SEXTA, { agrupar: "turma", turmas: ["M36.2"], separar: true });
  assert.deepEqual(uma.map((f) => [f.titulo.endsWith("· Turma M36.2"), f.secoes[0].total]), [[true, 0], [true, 1]]);
  // sem escolha (null), todas as turmas e o título sem a lista de turmas
  assert.equal(M.relaEstruturada(cfg, marcados, SEXTA, { agrupar: "turma", turmas: null })[0].secoes[1].total, 3);
});

test("rela: DOCX e PDF com as mesmas páginas, folha nova por situação e turma longa continuando", async () => {
  // 130 alunos fictícios em 2 turmas: a turma grande não cabe numa página
  const alunos = [];
  for (let i = 1; i <= 130; i++) {
    const turma = i <= 110 ? "M36.1" : "N36.1";
    alunos.push({ nome: "ALUNO " + String(i).padStart(3, "0"), codigo: turma.charAt(0) + (3000 + i), turma,
      marcas: { "Sexta|Janta": i <= 4 } });
  }
  const cfg = { dia: "Sexta", refeicao: "Janta", ano: "3", alunos };
  const marcados = new Set(alunos.map(M.chaveAluno)); // todos vieram; 4 municiados na planilha
  const folhas = M.relaEstruturada(cfg, marcados, SEXTA, { agrupar: "turma", separar: true });
  const paginas = M.paginarRela(folhas);
  // MUNICIADOS: 1 página; NÃO MUNICIADOS (126): a turma M36.1 (106) passa da primeira página
  const textos = paginas.map((p) => p.elementos.filter((e) => e.tipo === "texto").map((e) => e.texto));
  assert.ok(paginas.length >= 3);
  assert.equal(textos[0][0], "Conferência");
  assert.equal(textos[1][2], "NÃO MUNICIADOS"); // a segunda folha começa em página nova
  assert.ok(textos.slice(2).some((t) => t.includes("Turma M36.1 (continuação)") || t[0] === "Conferência (continuação)"));
  const nomes = paginas.flatMap((p) => p.elementos.filter((e) => e.tipo === "tabela").flatMap((e) => e.colunas.flat()));
  assert.equal(nomes.length, 130); // ninguém some nem repete
  assert.equal(nomes[0], "1. M3001 – ALUNO 001 – M36.1");

  const pdf = M.gerarRelaPdf(folhas, false);
  const doc = await globalThis.pdfjsLib.getDocument({ data: pdf, isEvalSupported: false }).promise;
  assert.equal(doc.numPages, paginas.length);
  const texto1 = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
  assert.match(texto1, /Sexta-feira, 23\/10\/2026 · Janta · 3° Ano/);
  await doc.destroy();

  const docx = await M.gerarRelaDocx(folhas, true);
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml").async("string");
  assert.equal((xml.match(/<w:pageBreakBefore\/>/g) || []).length, paginas.length - 1);
  assert.ok(xml.includes("ALUNO 130") && xml.includes("[   ]"));
  assert.ok(zip.file("word/media/marca.png")); // brasão de fundo
  assert.match(xml, /<\/w:tbl><w:p>.*<\/w:p><w:sectPr>/); // termina com parágrafo depois da tabela
});

test("rela: mostrar todos, só municiados ou só NÃO municiados", () => {
  const a = (nome, municiado) => ({ nome, codigo: "M30" + nome.length + "1", turma: "M36.1", marcas: { "Sexta|Janta": municiado } });
  const alunos = [a("ALVES", true), a("BRUNO", false), a("CARLA", true)];
  const cfg = { dia: "Sexta", refeicao: "Janta", ano: "3", alunos };
  const marcados = new Set(alunos.map(M.chaveAluno));
  assert.equal(M.relaEstruturada(cfg, marcados, SEXTA, { mostrar: "todos" })[0].secoes.length, 2);
  const sim = M.relaEstruturada(cfg, marcados, SEXTA, { mostrar: "municiados", separar: true });
  assert.deepEqual(sim.map((f) => [f.situacao, f.secoes[0].grupos[0].alunos.map((x) => x.nome)]), [["MUNICIADOS", ["ALVES", "CARLA"]]]);
  const nao = M.relaEstruturada(cfg, marcados, SEXTA, { mostrar: "nao" });
  assert.deepEqual(nao.map((f) => [f.situacao, f.secoes[0].total]), [["NÃO MUNICIADOS", 1]]);
  assert.match(M.textoFolha(nao[0]), /– NÃO MUNICIADOS\n\nNÃO MUNICIADOS \(1\)\nM3051 – BRUNO – M36\.1$/);
});

// ---------------------------------------------------------------- versão hospedada

test("planilha empacotada para publicar volta igual (alunos, marcas, turmas, avisos, data)", async () => {
  const { leitura, res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const pacote = M.empacotarPlanilha(res, leitura.sextaSugerida, leitura.formato);
  const volta = M.desempacotarPlanilha(JSON.parse(JSON.stringify(pacote)));
  assert.equal(volta.formato, "XLSX");
  assert.equal(volta.sexta, leitura.sextaSugerida);
  assert.deepEqual(volta.res.alunos, res.alunos);
  assert.deepEqual(volta.res.turmas.map((t) => [t.codigo, t.alunos]), res.turmas.map((t) => [t.codigo, t.alunos]));
  assert.deepEqual(volta.res.avisos, res.avisos);
  // as listas que saem dela são as mesmas
  assert.deepEqual(M.montarListas(volta.res.alunos, SEXTA).map((l) => l.alunos.length),
    M.montarListas(res.alunos, SEXTA).map((l) => l.alunos.length));
  // pequeno: cabe folgado no servidor mesmo com centenas de alunos
  assert.ok(JSON.stringify(pacote).length < 20000);
  assert.throws(() => M.desempacotarPlanilha({ v: 9 }), /inválida/);
});

test("rascunho: guarda e restaura listas e marcações; só vale para a mesma planilha", async () => {
  const { leitura, res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const ano = M.anosPresentes(res.alunos)[0];
  const alunos = M.alunosDoAno(res.alunos, ano);
  const marcados = new Set([M.chaveAluno(alunos[0]), M.chaveAluno(alunos[2])]);
  const lista = { id: 3, dia: "Segunda", refeicao: "Janta", ano, alunos, marcados, finalizada: true, criterio: "antiguidade",
    agrupar: "turma", separar: true, turmas: ["B12.1"], mostrar: "nao", turmasMarcacao: ["B12.2"], marcacaoPorTurma: true,
    filtroMarcacao: "municiados" };
  const origem = { res, sexta: SEXTA, planilhaId: "abc123", listas: [lista], ativa: 3 };
  const rascunho = JSON.parse(JSON.stringify(M.empacotarRascunho(origem, 4)));

  const novo = { res, sexta: null, planilhaId: "abc123", listas: [], ativa: null };
  assert.equal(M.aplicarRascunho(novo, rascunho), 4);
  assert.equal(novo.sexta, SEXTA);
  assert.equal(novo.ativa, 3);
  const l = novo.listas[0];
  assert.deepEqual([...l.marcados].sort(), [...marcados].sort());
  assert.equal(l.alunos.length, alunos.length);
  assert.deepEqual([l.dia, l.refeicao, l.ano, l.finalizada, l.criterio, l.agrupar, l.separar, l.mostrar, l.marcacaoPorTurma, l.filtroMarcacao],
    ["Segunda", "Janta", ano, true, "antiguidade", "turma", true, "nao", true, "municiados"]);
  assert.deepEqual(l.turmas, ["B12.1"]);
  assert.deepEqual(l.turmasMarcacao, ["B12.2"]);

  // outra planilha publicada: o rascunho antigo é ignorado
  const outra = { res, sexta: null, planilhaId: "zzz999", listas: [], ativa: null };
  assert.equal(M.aplicarRascunho(outra, rascunho), null);
  assert.equal(outra.listas.length, 0);

  // marcação de quem não está mais na planilha e listas inválidas são descartadas, sem quebrar
  rascunho.listas[0].marcados.push("X|Z0000|Fulano");
  rascunho.listas.push({ id: 9, dia: "Domingo-inexistente", refeicao: "Café", ano, marcados: [] }, null);
  const limpo = { res, sexta: null, planilhaId: "abc123", listas: [], ativa: null };
  M.aplicarRascunho(limpo, rascunho);
  assert.equal(limpo.listas.length, 1);
  assert.ok(![...limpo.listas[0].marcados].includes("X|Z0000|Fulano"));
});

test("lista para marcar: o cabeçalho diz se traz todos, só municiados ou só NÃO municiados (tela, PDF e DOCX)", async () => {
  const { res } = await ler([["ficticio.xlsx", fixture("ficticio.xlsx")]]);
  const alunos = M.alunosDoAno(res.alunos, "1");
  const casos = [["todos", "Lista para marcar · Todos os alunos", ""], ["municiados", "Lista para marcar · Municiados", "municiados"],
    ["nao", "Lista para marcar · NÃO Municiados", "nao-municiados"], [undefined, "Lista para marcar · Todos os alunos", ""]];
  for (const [filtro, esperado, sufixo] of casos) {
    assert.equal(M.rotuloListaParaMarcar(filtro), esperado);
    assert.equal(M.sufixoListaParaMarcar(filtro), sufixo);
    const folhas = [{ titulo: "Sexta-feira, 23/10/2026 · Café da manhã · 1° Ano", situacao: M.rotuloListaParaMarcar(filtro),
      secoes: [{ nome: null, total: alunos.length, grupos: [{ turma: null, alunos }] }] }];
    // na primeira página, em negrito e centralizado, logo abaixo do título da lista
    const topo = M.paginarRela(folhas)[0].elementos.filter((e) => e.tipo === "texto").slice(0, 3);
    assert.deepEqual(topo.map((e) => e.texto), ["Conferência", folhas[0].titulo, esperado]);
    assert.ok(topo[2].negrito && topo[2].alinh === "centro");
    // no DOCX gerado (e o PDF usa as mesmas páginas)
    const zip = await JSZip.loadAsync(await M.gerarRelaDocx(folhas, true));
    const xml = await zip.file("word/document.xml").async("string");
    assert.ok(xml.includes(esperado), "DOCX sem a linha: " + esperado);
    assert.ok(M.gerarRelaPdf(folhas, true).length > 1000);
  }
});

test("bibliotecas preguiçosas: sem etiquetas (Node e outros builds) resolvem na hora", async () => {
  await M.garantirBibliotecas();
  await M.aberturaTerminou();
  assert.equal(M.carregarBibliotecasEmSegundoPlano(), undefined);
});

test("rela geral: união das marcações de várias conferentes, de todos os anos, separada pela planilha", () => {
  const a = (nome, codigo, turma, municiado) => ({ nome, codigo, turma, marcas: { "Sexta|Janta": !!municiado } });
  const alunos = [a("ALVES", "B1037", "B12.1", true), a("BRAGA", "B1038", "B12.1"), a("CORREA", "N2005", "N24.1", true),
    a("DIAS", "M3001", "M36.1"), a("EVA", "N3005", "N36.1", true)];
  // duas conferentes: ALVES foi marcado pelas duas; a união tem 4 alunos (DIAS ninguém marcou)
  const conferente1 = ["B12.1|B1037|ALVES", "B12.1|B1038|BRAGA"], conferente2 = ["N24.1|N2005|CORREA", "B12.1|B1037|ALVES", "N36.1|N3005|EVA"];
  const uniao = new Set(conferente1.concat(conferente2));
  assert.equal(uniao.size, 4);
  const cfg = { dia: "Sexta", refeicao: "Janta", ano: "geral", rotuloAno: "Conferência geral", alunos };
  const [folha] = M.relaEstruturada(cfg, uniao, SEXTA);
  assert.equal(folha.titulo, "Sexta-feira, 23/10/2026 · Janta · Conferência geral");
  assert.deepEqual(folha.secoes[0].grupos[0].alunos.map((x) => x.nome), ["ALVES", "CORREA", "EVA"]); // municiados, A–Z, sem repetir
  assert.deepEqual(folha.secoes[1].grupos[0].alunos.map((x) => x.nome), ["BRAGA"]); // NÃO municiados
  // mesmos filtros da rela: só NÃO municiados, por turma e antiguidade
  const [so] = M.relaEstruturada(cfg, uniao, SEXTA, { mostrar: "nao" });
  assert.equal(so.situacao, "NÃO MUNICIADOS");
  const [porTurma] = M.relaEstruturada(cfg, uniao, SEXTA, { agrupar: "turma", turmas: ["B12.1", "N24.1"], criterio: "antiguidade" });
  assert.deepEqual(porTurma.secoes[0].grupos.map((g) => g.turma), ["B12.1", "N24.1"]);
  assert.match(porTurma.titulo, /Turmas B12\.1, N24\.1$/);
});

// ---------------------------------------------------------------- rancho corrido (dados FICTÍCIOS)

test("rancho: autorização preenchida (lista) vira alunos com data, refeição e motivo", () => {
  const linhas = [
    ["MARINHA DO BRASIL"], ["AUTORIZAÇÃO PARA RANCHO CORRIDO"],
    ["Data: 24/10/2026"], ["Refeição: Almoço"], ["Motivo: Prova de recuperação"], ["Total de alunos: 3"],
    ["3º ANO"], ["Nº Interno", "Nome de Guerra", "Pelotão/", "Nº Interno", "Nome de Guerra", "Pelotão/"], ["CIA", "CIA"],
    ["3025", "TANGO", "1º PEL", "N3042", "ROMEO", ""],
    ["Total de alunos do 3º ano:", "2"],
    ["1º ANO"], ["1037", "ALVES", "A", "", "", ""],
  ];
  const r = M.interpretarRancho(linhas);
  assert.equal(r.tipo, "autorizacao");
  assert.equal(r.data, "2026-10-24");
  assert.deepEqual(r.refeicoes, ["Almoço"]);
  assert.equal(r.motivo, "Prova de recuperação");
  assert.deepEqual(r.itens.map((i) => [i.c, i.n, i.p, i.m, i.r]), [
    ["3025", "TANGO", "1º PEL", "Prova de recuperação", ["Almoço"]],
    ["N3042", "ROMEO", "", "Prova de recuperação", ["Almoço"]],
    ["1037", "ALVES", "A", "Prova de recuperação", ["Almoço"]]]);
  assert.deepEqual(r.avisos, []);
});

test("rancho: formulário em branco não gera alunos nem lixo; sem motivo e sem data avisa", () => {
  const branco = M.interpretarRancho([["AUTORIZAÇÃO PARA RANCHO CORRIDO"], ["Data: ____/____/_____"], ["Refeição: ______"], ["Motivo: ______"], ["3º ANO"], ["Nº Interno", "Nome de Guerra"]]);
  assert.equal(branco.itens.length, 0);
  assert.equal(branco.data, null);
  assert.equal(branco.refeicoes, null);
  assert.ok(branco.avisos.some((a) => /nenhum aluno/.test(a)) && branco.avisos.some((a) => /data/.test(a)));
  const semMotivo = M.interpretarRancho([["Autorização para rancho corrido"], ["Data: 01/11/2026"], ["Motivo: ____"], ["2154", "BRITO", "B"]]);
  assert.equal(semMotivo.itens[0].m, "Rancho corrido autorizado");
  assert.ok(semMotivo.avisos.some((a) => /motivo/.test(a)));
});

const doServico = (itens) => itens.filter((i) => i.m.split("; ").includes("Serviço")); // sem os itens "Serviço do dia anterior" (café municiado automático do dia seguinte)

test("rancho: tabela de serviço vira alunos com o motivo \"Serviço\"", () => {
  const linhas = [
    ["CENTRO DE INSTRUÇÃO ALMIRANTE GRAÇA ARANHA"], ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"],
    ["ROTINA DE DOMINGO"], ["DETALHE DE SÁBADO"], ["SERVIÇO: 24 OUT 2026"],
    ["3° ANO"], ["SERVIÇO DIÁRIO"],
    ["AJOSCA", "3025", "N", "TANGO", ""], ["RETÉM", "3042", "N", "ROMEO"],
    ["SERVIÇO DE QUARTO"],
    ["0800-1200P / 2000-0000P / 0800-1200", "1200-1600P / 0000-0400P", "1600-2000P / 0400-0800P"],
    ["CHEFE DE DIA", "3048", "N", "MIKE", "TR", "3145", "M", "RIBEIRO", "TR", "3134", "M", "D'ALMEIDA"],
    ["2° ANO"], ["SERVIÇO DE QUARTO"], ["0800-1200P / 2000-0000P / 0800-1200"],
    ["POLÍCIA", "2166", "M", "DIEGO", "SE"],
    ["1° ANO"], ["PAV 3A", "1011", "B", "CARLOS"],
  ];
  const r = M.interpretarRancho(linhas);
  assert.equal(r.tipo, "servico");
  assert.equal(r.data, "2026-10-24");
  const por = Object.fromEntries(doServico(r.itens).map((i) => [i.c, i]));
  assert.equal(por.N3025.m, "Serviço");
  assert.equal(por.N3048.m, "Serviço");
  assert.equal(por.M3145.m, "Serviço");
  assert.equal(por.M3134.n, "D'ALMEIDA");
  assert.equal(por.M3134.m, "Serviço");
  assert.equal(por.M2166.m, "Serviço");
  assert.equal(por.B1011.m, "Serviço");
  assert.ok(doServico(r.itens).every((i) => /^[BMN]\d{4}$/.test(i.c)));
  assert.equal(doServico(r.itens).length, 7);
});

test("rancho: arquivo que não é de rancho corrido avisa sem quebrar; mesmo aluno em duas funções vira um só", () => {
  const r = M.interpretarRancho([["Outra coisa qualquer"], ["1037", "ALVES"]]);
  assert.equal(r.tipo, null);
  assert.equal(r.itens.length, 0);
  assert.match(r.avisos[0], /Não reconheci/);
  const dois = M.interpretarRancho([["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 24 OUT 2026"], ["RETÉM", "3042", "N", "ROMEO"], ["POLÍCIA", "3042", "N", "ROMEO"]]);
  assert.equal(doServico(dois.itens).length, 1);
  assert.equal(doServico(dois.itens)[0].m, "Serviço"); // o mesmo aluno em duas funções é um só
});

test("rancho: PDF de verdade (gerado aqui) é lido pela posição dos textos nos dois modelos", async () => {
  const { jsPDF } = globalThis.jspdf;
  const pdf = (fn) => { const d = new jsPDF({ unit: "pt", format: "a4" }); d.setFontSize(10); fn((x, y, t) => d.text(t, x, 842 - y)); return new Uint8Array(d.output("arraybuffer")); };
  // autorização: mesma posição das colunas do formulário da unidade
  const aut = pdf((t) => {
    t(207, 721, "AUTORIZAÇÃO PARA RANCHO CORRIDO"); t(57, 694, "Data: 24/10/2026"); t(57, 667, "Refeição: Janta"); t(57, 640, "Motivo: Visita técnica");
    t(281, 569, "3º ANO"); t(62, 550, "Nº Interno"); t(139, 550, "Nome de Guerra"); t(242, 550, "Pelotão/"); t(298, 550, "Nº Interno"); t(385, 550, "Nome de Guerra");
    t(62, 536, "3025"); t(139, 536, "TANGO"); t(242, 536, "1º PEL"); t(298, 536, "N3042"); t(385, 536, "ROMEO"); t(493, 536, "2º PEL");
    t(62, 522, "1037"); t(139, 522, "ALVES"); t(242, 522, "A");
  });
  const a = await M.lerRanchoArquivo({ nome: "autorizacao.pdf", bytes: aut });
  assert.equal(a.tipo, "autorizacao");
  assert.equal(a.data, "2026-10-24");
  assert.deepEqual(a.refeicoes, ["Janta"]);
  assert.equal(a.motivo, "Visita técnica");
  assert.deepEqual(a.itens.map((i) => [i.c, i.n, i.p]), [["3025", "TANGO", "1º PEL"], ["N3042", "ROMEO", "2º PEL"], ["1037", "ALVES", "A"]]);
  // tabela de serviço
  const srv = pdf((t) => {
    t(200, 800, "DETALHE DE SERVIÇO DO CORPO DE ALUNOS"); t(60, 760, "SERVIÇO: 24 OUT 2026");
    t(250, 700, "SERVIÇO DE QUARTO"); t(240, 688, "0800-1200P / 2000-0000P"); t(470, 688, "1200-1600P / 0000-0400P");
    t(60, 672, "CHEFE DE DIA"); t(190, 672, "3048"); t(225, 672, "N"); t(260, 672, "MIKE"); t(470, 672, "3145"); t(505, 672, "M"); t(540, 672, "RIBEIRO");
  });
  const s = await M.lerRanchoArquivo({ nome: "servico.pdf", bytes: srv });
  assert.equal(s.tipo, "servico");
  assert.equal(s.data, "2026-10-24");
  assert.deepEqual(doServico(s.itens).map((i) => [i.c, i.n, i.m]), [["N3048", "MIKE", "Serviço"], ["M3145", "RIBEIRO", "Serviço"]]);
});

test("rancho: casa o número interno com a planilha e o aviso respeita a refeição", () => {
  const alunos = [
    { nome: "TANGO", codigo: "N3025", turma: "N36.1" }, { nome: "ALVES", codigo: "B1037", turma: "B12.1" },
    { nome: "OUTRO", codigo: "M3025", turma: "M36.1" }, { nome: "MIKE", codigo: "N3048", turma: "N36.1" }];
  const itens = [{ c: "3025", n: "TANGO", m: "Prova", r: ["Almoço"], p: "" }, { c: "N3048", n: "MIKE", m: "Serviço: Retém", r: null, p: "" }, { c: "9999", n: "NINGUEM", m: "x", r: null, p: "" }];
  const casados = M.casarRancho(itens, alunos);
  assert.equal(casados[0].aluno.codigo, "N3025"); // dois com 3025: o nome desempata
  assert.equal(casados[1].aluno.codigo, "N3048");
  assert.equal(casados[2].aluno, null);
  const almoco = M.indiceRancho([{ por: "Mike", itens }], "Almoço");
  assert.equal(M.ranchoDoAluno(almoco, alunos[0]).motivo, "Prova");
  assert.equal(M.ranchoDoAluno(almoco, alunos[3]).motivo, "Serviço: Retém");
  const janta = M.indiceRancho([{ por: "Mike", itens }], "Janta"); // a autorização vale só para o almoço
  assert.equal(M.ranchoDoAluno(janta, alunos[0]), null);
  assert.equal(M.ranchoDoAluno(janta, alunos[3]).motivo, "Serviço: Retém"); // serviço vale para qualquer refeição
  assert.equal(M.ranchoDoAluno(almoco, alunos[1]), null);
});

test("rancho: número que veio errado da foto é resolvido pelo nome de guerra (se único)", () => {
  const alunos = [{ nome: "ALVES", codigo: "B1037", turma: "B12.1" }, { nome: "ARAUJO", codigo: "B1111", turma: "B12.1" }, { nome: "SILVA", codigo: "B1200", turma: "B12.2" }, { nome: "SILVA", codigo: "B1201", turma: "B12.2" }];
  const itens = [{ c: "1O37", n: "ALVES", m: "x" }, { c: "9999", n: "SILVA", m: "x" }, { c: "9998", n: "INEXISTENTE", m: "x" }];
  const c = M.casarRancho(itens.map((i) => ({ ...i, c: i.c.replace("O", "0").length === 4 ? "7777" : i.c })), alunos);
  assert.equal(c[0].aluno.codigo, "B1037"); // número errado (7777), nome único: casa pelo nome
  assert.equal(c[0].porNome, true);
  assert.equal(c[1].aluno, null); // dois SILVA: não adivinha
  assert.equal(c[2].aluno, null);
});

test("rancho: tabela de serviço lida de foto — 4 dígitos + letra do curso + nome, mesmo com ruído de borda e letras trocadas", () => {
  // linhas como o OCR devolve (dados FICTÍCIOS): bordas viram | e ], letra do curso lida errado, número com a borda colada
  const linhas = [
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["ROTINA DE DOMINGO"], ["DETALHE DE SÁBADO"], ["SERVICO 24 0UT 2026"],
    ["3° ANO"], ["SERVIÇO DE QUARTO"],
    ["0800-1200P / 2000-0000P / 0800-1200", "1200-1600P / 0000-0400P", "1600-2000? / 0400-0800P"],
    ["CHEFE DE DIA", "13048", "NU", "TANGO", "TR", "[3145]", "rn", "MIKE", "TR", "3134", "M", "D'ALMEIDA"],
    ["RETÉM", "3157 |", "M", "ROMEO SOUSA", "|", "3094", "|", "ALFA"],
    ["ay", "|", "1155 |", "B", "SIERRA LIMA", "1r", "LIMA"],
    ["PAV 3A", "1O11", "6 |", "CHARLIE", "|", "1010", "8", "DELTA", "SE"],
    ["junk", "1100-1400P", "1600-1930P"],
  ];
  const r = M.interpretarRancho(linhas);
  assert.equal(r.tipo, "servico");
  assert.equal(r.data, "2026-10-24");
  const por = Object.fromEntries(doServico(r.itens).map((i) => [i.c, i]));
  assert.ok(por.N3048 && por.N3048.n === "TANGO"); // "13048" = borda + 3048; "NU" = N
  assert.ok(por.M3145 && por.M3145.n === "MIKE"); // "[3145]" e "rn" = M
  assert.ok(por.M3134 && por.M3134.n === "D'ALMEIDA");
  assert.ok(por.M3157 && por.M3157.n === "ROMEO SOUSA");
  assert.ok(por["3094"] && por["3094"].n === "ALFA"); // sem letra legível: vale o número
  assert.ok(por.B1155 && por.B1155.n === "SIERRA LIMA"); // rótulo da função apagado ("ay"): o motivo é só "Serviço" (com o turno)
  assert.equal(por.B1155.m, "Serviço");
  assert.ok(por["1011"] && por["1011"].n === "CHARLIE"); // "1O11" = 1011
  assert.ok(por.B1010 && por.B1010.n === "DELTA"); // "8" = B
  assert.equal(por.N3048.m, "Serviço");
  assert.ok(!r.itens.some((i) => /^1100|^1600/.test(i.c))); // horários não viram aluno
});

test("rancho: data em várias formas (com e sem 'SERVIÇO:', mês lido com zero) e data só na autorização numérica", () => {
  const dia = (txt) => M.interpretarRancho([["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], [txt], ["RETÉM", "3042", "N", "ROMEO"]]).data;
  assert.equal(dia("SERVIÇO: 24 OUT 2026"), "2026-10-24");
  assert.equal(dia("SERVICO; 24 0UT 2026"), "2026-10-24");
  assert.equal(dia("24 NOV 2026"), "2026-11-24");
  assert.equal(dia("Serviço: 5 de dezembro de 2026"), "2026-12-05");
  assert.equal(dia("SERVIÇO 24/10/2026"), "2026-10-24");
  const aut = M.interpretarRancho([["AUTORIZAÇÃO PARA RANCHO CORRIDO"], ["Data ____"], ["Emitida em 24/10/2026"], ["1037", "ALVES", "A"]]);
  assert.equal(aut.data, "2026-10-24");
});

test("rancho: tabela de serviço com mais de um dia separa cada aluno no seu dia", () => {
  const r = M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 24 OUT 2026"], ["RETÉM", "3042", "N", "ROMEO"], ["POLÍCIA", "2166", "M", "DIEGO"],
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 25 OUT 2026"], ["RETÉM", "3042", "N", "ROMEO"], ["COPA", "2130", "M", "ZOMER"],
  ]);
  assert.deepEqual(r.dias, ["2026-10-24", "2026-10-25", "2026-10-26"]); // 26/10 vem do café municiado automático de quem esteve de serviço no domingo
  const doDia = doServico(r.itens); // (os itens "do dia anterior" são o café municiado automático do dia seguinte)
  assert.deepEqual(doDia.map((i) => [i.d, i.c]), [["2026-10-24", "N3042"], ["2026-10-24", "M2166"], ["2026-10-25", "N3042"], ["2026-10-25", "M2130"]]); // ROMEO aparece nos dois dias
});

test("rancho: foto não é lida (JPEG ou PNG recebem um aviso claro)", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  for (const bytes of [jpeg, png]) {
    await assert.rejects(M.lerRanchoArquivo({ nome: "tabela.jpg", bytes }), /foto.*(PDF, XLSX ou CSV)/);
  }
});

test("rancho: escala semanal com mais de 300 alunos não é cortada (cada dia fica inteiro)", () => {
  const linhas = [["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"]];
  for (let d = 23; d <= 29; d++) {
    linhas.push(["SERVIÇO: " + d + " OUT 2026"]);
    for (let k = 0; k < 60; k++) linhas.push(["PAV", String(1000 + (d - 23) * 100 + k), "N", "ALUNO" + String.fromCharCode(65 + (d - 23)) + String.fromCharCode(65 + Math.floor(k / 26)) + String.fromCharCode(65 + k % 26)]);
  }
  const r = M.interpretarRancho(linhas);
  assert.equal(r.itens.filter((i) => i.m === "Serviço").length, 420);
  assert.ok(!r.avisos.some((a) => /demais/.test(a)));
  assert.equal(new Set(r.itens.filter((i) => i.m === "Serviço").map((i) => i.d)).size, 7);
});

test("rancho: serviço vira aviso por refeição (almoço todos, janta 1800-2100, café do dia seguinte para 0800-1200) e fim de semana não avisa", () => {
  const r = M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 26 OUT 2026"], ["SERVIÇO DE QUARTO"],
    ["0800-1200P / 2000-0000P", "1200-1600P / 0000-0400P", "1600-2000P / 0400-0800P"],
    ["PAV", "1001", "N", "ALFA", "1002", "N", "BRAVO", "1003", "N", "CHARLIE"],
  ]);
  const por = Object.fromEntries(r.itens.filter((i) => i.d === "2026-10-26").map((i) => [i.n, i.r]));
  assert.deepEqual(por.ALFA, ["Almoço"]); // 0800-1200 (2000-0000 não é o turno 1800-2100): o café dele é do dia seguinte
  assert.deepEqual(por.BRAVO, ["Almoço"]); // 1200-1600 e 0000-0400
  assert.deepEqual(por.CHARLIE, ["Almoço"]); // 0400-0800 e 1600-2000 não contam
  const cafe = r.itens.filter((i) => i.r.includes("Café")); // quem fez 0800-1200 tem o café no dia seguinte (terça 27/10), além do almoço de todos
  assert.deepEqual(cafe.map((i) => [i.d, i.n, i.r]), [["2026-10-27", "ALFA", ["Café", "Almoço"]]]);
  assert.equal(M.fimDeSemana("2026-10-24"), true); // sábado
  assert.equal(M.fimDeSemana("2026-10-25"), true); // domingo
  assert.equal(M.fimDeSemana("2026-10-26"), false);
});

test("rancho: o almoço do dia seguinte avisa TODA a tabela do dia anterior (RETÉM incluso), sem municiar; fim de semana não avisa", () => {
  const dia = (d) => M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: " + d + " OUT 2026"], ["SERVIÇO DE QUARTO"], ["1200-1600P", "1800-2100P"],
    ["RETÉM", "3001", "N", "ALFA"], ["PAV", "3002", "N", "BRAVO", "3003", "N", "CHARLIE"],
  ]).itens.filter((i) => i.m === "Serviço do dia anterior");
  const qui = dia(22); // quinta -> almoço de sexta 23/10
  assert.deepEqual(qui.map((i) => [i.d, i.n, i.r]), [["2026-10-23", "ALFA", ["Almoço"]], ["2026-10-23", "BRAVO", ["Almoço"]], ["2026-10-23", "CHARLIE", ["Almoço"]]]);
  const idx = M.indiceRancho([{ por: "X", itens: qui }], "Almoço"); // aviso no almoço, inclusive o RETÉM
  assert.ok(idx.N3001 && idx.N3002 && idx.N3003);
  assert.deepEqual(Object.keys(M.indiceRancho([{ por: "X", itens: qui }], "Janta")), []); // e só no almoço
  assert.equal(M.automaticosDoDia([{ por: "X", itens: qui }]).servico.N3001, undefined); // sem municiar no almoço
  assert.ok(M.automaticosDoDia([{ por: "X", itens: qui }]).cafe.N3001); // o café do dia seguinte municia
  for (const d of [23, 24]) for (const i of dia(d)) assert.deepEqual(i.r, [], "sábado e domingo só municiam, sem aviso"); // sexta -> sábado, sábado -> domingo
});

test("rancho: janta é só o turno 1800-2100 e serviço diário (sem turno) avisa só no almoço", () => {
  const r = M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 26 OUT 2026"], ["SERVIÇO DIÁRIO"], ["AJOSCA", "3001", "N", "DIARIO"],
    ["SERVIÇO DE QUARTO"], ["1500-1800P / 0200-0400P", "1800-2100P / 0400-0800P"],
    ["PAV", "1001", "N", "UM", "1002", "N", "DOIS"],
  ]);
  const por = Object.fromEntries(r.itens.filter((i) => i.m === "Serviço").map((i) => [i.n, i.r]));
  assert.deepEqual(por.DIARIO, ["Almoço"]);
  assert.deepEqual(por.UM, ["Almoço"]);
  assert.deepEqual(por.DOIS, ["Almoço", "Janta"]); // 1800-2100 é janta
});

test("rancho: autorização com o traço do formulário e a data escrita no cabeçalho (Data: ____/____/_____26/10/2026)", () => {
  const r = M.interpretarRancho([["AUTORIZAÇÃO PARA RANCHO CORRIDO"], ["Data: ____/____/_____26/10/2026"], ["Refeição: ____ Almoço"], ["N3001", "ALFA", "N36.1"]]);
  assert.equal(r.data, "2026-10-26");
  assert.ok(!r.avisos.some((a) => /data/i.test(a)));
});

test("rancho: quem está na função RETÉM só avisa no almoço (não vale como serviço corrido no café nem na janta)", () => {
  const r = M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 26 OUT 2026"], ["SERVIÇO DE QUARTO"],
    ["0800-1200P / 1800-2100P"],
    ["RETÉM", "3001", "N", "ALFA"], ["PAV", "3002", "N", "BRAVO"],
  ]);
  const por = Object.fromEntries(r.itens.filter((i) => i.d === "2026-10-26").map((i) => [i.n, i.r]));
  assert.deepEqual(por.ALFA, ["Almoço"]);
  assert.deepEqual(por.BRAVO, ["Almoço", "Janta"]);
  assert.deepEqual(r.itens.filter((i) => i.r.includes("Café")).map((i) => [i.d, i.n]), [["2026-10-27", "BRAVO"]]); // RETÉM não tem café no dia seguinte
});

test("rancho: quem está de serviço é marcado como serviço no índice (municiado automático); autorização não", () => {
  const pubs = [{ por: "X", itens: [{ c: "N3001", n: "ALFA", m: "Serviço", r: ["Almoço"] }, { c: "N3002", n: "BRAVO", m: "Prova de recuperação", r: ["Almoço"] }] }];
  const idx = M.indiceRancho(pubs, "Almoço");
  assert.equal(idx.N3001.servico, true);
  assert.equal(idx.N3002.servico, false);
  assert.equal(M.indiceRancho(pubs, "Café").N3001, undefined); // Alfa não está de serviço no café
});

test("rancho: leitura sem o número interno de alguns alunos acha o aluno pelo nome de guerra (só se único na planilha)", () => {
  const linhas = [
    ["AUTORIZAÇÃO PARA RANCHO CORRIDO"], ["Data: 26/10/2026"], ["Refeição: Almoço"], ["Motivo: Faina"],
    ["3º ANO"], ["Nº Interno", "Nome de Guerra", "Pelotão/"],
    ["N3001", "ALANA REIS", "N36.1", "XXXX", "| BORGES"],
    ["Total de alunos do 3º ano: 2"],
  ];
  const r = M.interpretarRancho(linhas);
  assert.deepEqual(r.itens.map((i) => i.c), ["N3001"]);
  assert.ok(r.nomesSoltos.includes("BORGES"));
  const alunos = [{ codigo: "N3001", nome: "ALANA REIS", turma: "N36.1" }, { codigo: "N3004", nome: "JULIA BORGES", turma: "N36.1" }, { codigo: "M2001", nome: "ANA BORGES", turma: "M24.1" }];
  M.completarPorNome(r, alunos);
  assert.equal(r.itens.length, 1); // BORGES não é único: não chuta
  alunos.pop();
  M.completarPorNome(r, alunos);
  assert.deepEqual(r.itens.map((i) => i.c), ["N3001", "N3004"]);
  assert.ok(r.avisos.some((a) => /pelo nome de guerra/.test(a)));
});

test("rancho: café da manhã vale para quem fez o serviço 0800-1200 do dia anterior; sexta, sábado e domingo não geram café no fim de semana", () => {
  const dia = (d) => M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: " + d + " OUT 2026"], ["SERVIÇO DE QUARTO"], ["0800-1200P"], ["PAV", "3002", "N", "BRAVO"],
  ]).itens;
  assert.deepEqual(dia(25).filter((i) => i.r.includes("Café")).map((i) => i.d), ["2026-10-26"]); // domingo -> café de segunda
  assert.deepEqual(dia(23).filter((i) => i.r.includes("Café")), []); // sexta -> sábado: sem aviso de rancho corrido
  assert.deepEqual(dia(23).filter((i) => i.m === "Serviço do dia anterior").map((i) => i.d), ["2026-10-24"]); // mas o sábado gera o municiado automático
  assert.deepEqual(dia(24).filter((i) => i.m === "Serviço do dia anterior").map((i) => i.d), ["2026-10-25"]); // sábado -> domingo também
  assert.deepEqual(dia(29).filter((i) => i.r.includes("Café")).map((i) => i.d), ["2026-10-30"]); // quinta -> café de sexta
});

test("rancho: municiado automático — almoço, janta e ceia do dia do serviço e café do dia seguinte (não o café do próprio dia)", () => {
  const r = M.interpretarRancho([
    ["DETALHE DE SERVIÇO DO CORPO DE ALUNOS"], ["SERVIÇO: 26 OUT 2026"], ["SERVIÇO DE QUARTO"], ["1200-1500P", "1800-2100P"],
    ["RETÉM", "3001", "N", "ALFA"], ["PAV", "3002", "N", "BRAVO", "3003", "N", "CHARLIE"],
  ]);
  const pubs = (dia) => [{ por: "X", itens: r.itens.filter((i) => i.d === dia) }];
  const seg = M.automaticosDoDia(pubs("2026-10-26")), ter = M.automaticosDoDia(pubs("2026-10-27"));
  for (const c of ["N3001", "N3002", "N3003"]) { // todos que estão de serviço, inclusive RETÉM
    assert.ok(seg.servico[c], c + " é municiado no almoço/janta/ceia de 26/10");
    assert.ok(ter.cafe[c], c + " é municiado no café de 27/10");
    assert.ok(!seg.cafe[c], c + " não é municiado automático no café de 26/10");
  }
  assert.ok(!ter.servico.N3001); // no dia 27 ele não está de serviço
  assert.deepEqual(r.itens.filter((i) => i.d === "2026-10-27" && i.r.includes("Café")).map((i) => i.n), []); // sem turno 0800-1200: sem aviso de rancho no café
  const aluno = { codigo: "N3002" };
  assert.ok(M.noConjunto(seg.servico, aluno));
});

test("rela: quem é municiado automático (de serviço) sai em MUNICIADOS mesmo sem marca na planilha — igual à tela de marcar", () => {
  const a = (nome, codigo, turma, municiado) => ({ nome, codigo, turma, marcas: { "Segunda|Janta": !!municiado } });
  const alunos = [a("ALFA", "N3001", "N36.1"), a("BRAVO", "N3002", "N36.1", true), a("CHARLIE", "N3003", "N36.1")];
  const cfg = { dia: "Segunda", refeicao: "Janta", ano: "3", alunos };
  const marcados = new Set(alunos.map(M.chaveAluno));
  const nomes = (folhas, i) => folhas[0].secoes[i].grupos[0].alunos.map((x) => x.nome);
  const sem = M.relaEstruturada(cfg, marcados, SEXTA); // sem o conjunto automático: só a planilha
  assert.deepEqual([nomes(sem, 0), nomes(sem, 1)], [["BRAVO"], ["ALFA", "CHARLIE"]]);
  // ALFA está de serviço na segunda (janta): o mesmo conjunto que a tela de marcar usa (M.automaticosDoDia)
  const servico = M.automaticosDoDia([{ por: "X", itens: [{ d: "2026-10-26", c: "N3001", n: "ALFA", m: "Serviço", r: ["Almoço"], p: "" }] }]).servico;
  const com = M.relaEstruturada(cfg, marcados, SEXTA, { automatico: servico });
  assert.deepEqual([nomes(com, 0), nomes(com, 1)], [["ALFA", "BRAVO"], ["CHARLIE"]]);
  assert.equal(M.textoRela(cfg, marcados, SEXTA, { automatico: servico }).includes("MUNICIADOS (2)"), true); // Copiar e PDF usam a mesma montagem
  const so = M.relaEstruturada(cfg, marcados, SEXTA, { automatico: servico, mostrar: "nao" });
  assert.deepEqual(so[0].secoes[0].grupos[0].alunos.map((x) => x.nome), ["CHARLIE"]); // o filtro "NÃO municiados" também respeita
});
