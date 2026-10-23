"""Gera a documentação técnica em PDF: fluxo, tecnologias e cada parte do código.

    python docs/gerar_tecnico.py <saida.pdf>

Usa as mesmas cores, fontes (Times New Roman) e o mesmo brasão de fundo do guia de uso.
"""
import sys

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (CondPageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

import gerar_guia as G
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def fonte_mono():
    """Courier New do Windows (com chaves e acentos certos); sem ela, a Courier padrão do PDF."""
    caminho = G.Path(G.os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "cour.ttf"
    if not caminho.exists():
        return "Courier"
    pdfmetrics.registerFont(TTFont("Mono", str(caminho)))
    return "Mono"


MONO = fonte_mono()

F, E = G.F, G.E
MARINHO, DOURADO, TEXTO, SUAVE, BORDA = G.MARINHO, G.DOURADO, G.TEXTO, G.SUAVE, G.BORDA
CLARO = HexColor("#EEF2F7")
L, A = G.L, G.A
LARG = 17 * cm  # largura útil (margens de 2 cm)

S = {
    "capa": ParagraphStyle("capa", fontName=F["TNR-B"], fontSize=30, leading=34, textColor=MARINHO, spaceAfter=8),
    "capa_sub": ParagraphStyle("capa_sub", fontName=F["TNR"], fontSize=14, leading=19, textColor=SUAVE, spaceAfter=18),
    "h1": ParagraphStyle("h1", fontName=F["TNR-B"], fontSize=18, leading=22, textColor=MARINHO, spaceBefore=6, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName=F["TNR-B"], fontSize=13.5, leading=17, textColor=MARINHO, spaceBefore=9, spaceAfter=3),
    "p": ParagraphStyle("p", fontName=F["TNR"], fontSize=11, leading=14.6, textColor=TEXTO, spaceAfter=5),
    "item": ParagraphStyle("item", fontName=F["TNR"], fontSize=11, leading=14.6, textColor=TEXTO, leftIndent=12,
                           bulletIndent=2, bulletFontName=F["TNR"], spaceAfter=2),
    "cel": ParagraphStyle("cel", fontName=F["TNR"], fontSize=9.8, leading=12.4, textColor=TEXTO, alignment=TA_LEFT),
    "cel_b": ParagraphStyle("cel_b", fontName=F["TNR-B"], fontSize=9.8, leading=12.4, textColor=MARINHO),
    "cod": ParagraphStyle("cod", fontName=MONO, fontSize=8.6, leading=10.8, textColor=TEXTO),
    "sumario": ParagraphStyle("sumario", fontName=F["TNR"], fontSize=11.5, leading=17, textColor=TEXTO),
}
FUNDO = None


def pagina(c, doc):
    c.saveState()
    alto = 15 * cm
    lado = alto * 166 / 267  # brasão do CIAGA: mais alto que largo
    c.drawImage(FUNDO, (L - lado) / 2, (A - alto) / 2 - 1 * cm, lado, alto)
    c.setFillColor(MARINHO)
    c.rect(0, A - 1.6 * cm, L, 1.6 * cm, stroke=0, fill=1)
    c.setFillColor(DOURADO)
    c.rect(0, A - 1.6 * cm - 3, L, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont(F["TNR-B"], 15)
    c.drawString(2 * cm, A - 1.05 * cm, "Municiamento Ciaga")
    c.setFont(F["TNR"], 9)
    c.drawRightString(L - 2 * cm, A - 1.0 * cm, "Documentação técnica")
    c.setFillColor(SUAVE)
    c.setFont(F["TNR"], 8)
    c.drawString(2 * cm, 1.2 * cm, "Centro de Instrução Almirante Graça Aranha")
    c.drawRightString(L - 2 * cm, 1.2 * cm, f"página {doc.page}")
    c.restoreState()


# ---------------------------------------------------------------- blocos

h = []


def h1(t):
    h.append(CondPageBreak(5 * cm))
    h.append(Paragraph(t, S["h1"]))


def h2(t):
    h.append(CondPageBreak(3 * cm))
    h.append(Paragraph(t, S["h2"]))


def p(t):
    h.append(Paragraph(t, S["p"]))


def itens(lista):
    for t in lista:
        h.append(Paragraph(t, S["item"], bulletText="•"))
    h.append(Spacer(1, 3))


def tabela(cab, linhas, larguras, fonte="cel"):
    dados = [[Paragraph(c, S["cel_b"]) for c in cab]]
    dados += [[Paragraph(c, S[fonte] if i == 0 and fonte == "cod" else S["cel"]) for i, c in enumerate(l)] for l in linhas]
    t = Table(dados, colWidths=[w * cm for w in larguras], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, BORDA), ("BACKGROUND", (0, 0), (-1, 0), CLARO),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    h.append(t)
    h.append(Spacer(1, 6))


def funcoes(linhas):
    """Tabela 'função | o que faz' de um módulo."""
    tabela(["Função", "O que faz"], linhas, [4.6, 12.4], fonte="cod")


def nota(t):
    h.append(G.caixa(t))
    h.append(Spacer(1, 6))


def codigo(t):
    linhas = t.strip("\n").split("\n")
    x = "<br/>".join(l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;") for l in linhas)
    tb = Table([[Paragraph(x, S["cod"])]], colWidths=[LARG])
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor("#F3F5F9")), ("BOX", (0, 0), (-1, -1), 0.5, BORDA),
                            ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    h.append(tb)
    h.append(Spacer(1, 6))


def fluxograma():
    """Caixas do fluxo, em duas colunas, com setas."""
    etapas = [
        ("1. Abrir o HTML", "dois cliques; abertura do navio (~3 s)"),
        ("2. Escolher a planilha", "XLSX, CSV (vários) ou PDF; data opcional"),
        ("3. Ler os bytes", "File.arrayBuffer() → Uint8Array, na memória"),
        ("4. Detectar e validar", "entradas.js: assinatura dos bytes, limites"),
        ("5. Virar grades", "XLSX (SheetJS), CSV (leitor próprio), PDF (pdf.js)"),
        ("6. Ler os alunos", "parser.js: blocos de turma, marcações, avisos"),
        ("7. Definir a data", "informada, ou lida da aba QUANTITATIVO"),
        ("8. Montar as listas", "report.js: dia × refeição × grupo × situação"),
        ("9. Conferir e filtrar", "app.js: resumo, avisos, filtros, prévia"),
        ("10. Gerar DOCX / PDF", "documentos.js: mesma paginação nos dois"),
        ("11. Baixar", "Blob + link temporário; nada vai para a rede"),
        ("12. Nova planilha", "estado = null: os dados saem da memória"),
    ]
    larg, alt, gx, gy = 8.1 * cm, 1.25 * cm, 0.8 * cm, 0.45 * cm
    n = 6
    d = Drawing(LARG, n * alt + (n - 1) * gy + 4)
    for i, (tit, sub) in enumerate(etapas):
        col, lin = divmod(i, n)
        x = col * (larg + gx)
        y = d.height - 2 - (lin + 1) * alt - lin * gy
        d.add(Rect(x, y, larg, alt, rx=5, ry=5, fillColor=white, strokeColor=MARINHO, strokeWidth=0.8))
        d.add(Rect(x, y, 4, alt, fillColor=DOURADO, strokeColor=None))
        d.add(String(x + 10, y + alt - 15, tit, fontName=F["TNR-B"], fontSize=10.5, fillColor=MARINHO))
        d.add(String(x + 10, y + 8, sub, fontName=F["TNR"], fontSize=9, fillColor=TEXTO))
        if lin < n - 1:  # seta para baixo
            cx = x + larg / 2
            d.add(Line(cx, y, cx, y - gy + 3, strokeColor=DOURADO, strokeWidth=1.2))
            d.add(Polygon([cx - 3, y - gy + 4, cx + 3, y - gy + 4, cx, y - gy], fillColor=DOURADO, strokeColor=None))
    # da coluna 1 (fim) para a coluna 2 (início)
    x1 = larg
    y_fim = d.height - 2 - n * alt - (n - 1) * gy + alt / 2
    y_ini = d.height - 2 - alt / 2
    meio = larg + gx / 2
    for a, b in (((x1, y_fim), (meio, y_fim)), ((meio, y_fim), (meio, y_ini)), ((meio, y_ini), (larg + gx - 3, y_ini))):
        d.add(Line(a[0], a[1], b[0], b[1], strokeColor=DOURADO, strokeWidth=1.2))
    d.add(Polygon([larg + gx - 4, y_ini + 3, larg + gx - 4, y_ini - 3, larg + gx, y_ini], fillColor=DOURADO, strokeColor=None))
    h.append(d)
    h.append(Spacer(1, 8))


# ---------------------------------------------------------------- conteúdo

def conteudo():
    h.append(Paragraph("Documentação técnica", S["capa"]))
    h.append(Paragraph("Como o Municiamento Ciaga funciona por dentro: o fluxo, as tecnologias e cada parte do código. "
                       "Para quem vai manter ou evoluir o sistema.", S["capa_sub"]))
    sumario = ["1. Visão geral", "2. O fluxo, passo a passo", "3. Tecnologias", "4. Organização das pastas",
               "5. Montagem do arquivo único (build)", "6. Segurança e proteção de dados", "7. Os módulos, um a um",
               "8. Estruturas de dados", "9. Regras de negócio", "10. Documentos DOCX e PDF", "11. Testes",
               "12. Como manter e evoluir"]
    t = Table([[Paragraph(a, S["sumario"]), Paragraph(b, S["sumario"])] for a, b in zip(sumario[:6], sumario[6:])],
              colWidths=[8.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([("LINEBEFORE", (0, 0), (0, -1), 3, DOURADO), ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    h.append(t)
    h.append(Spacer(1, 12))

    # 1
    h1("1. Visão geral")
    p("O sistema lê a planilha semanal do municiamento (quem se municiou em cada dia e refeição), separa os alunos por "
      "<b>dia</b>, <b>refeição</b> e <b>grupo</b> (curso + ano), põe em <b>ordem alfabética</b> e gera as listas de "
      "conferência para imprimir, em <b>DOCX</b> (Word) e <b>PDF</b>, com o mesmo visual e as mesmas páginas.")
    p("Tudo é <b>um único arquivo HTML</b> que abre no navegador com dois cliques e funciona <b>sem internet</b>. Não há "
      "servidor, instalação, banco de dados nem login: o código, as bibliotecas, os estilos e as imagens vão dentro do "
      "próprio arquivo. A planilha é lida na memória do navegador e nunca sai do computador.")
    tabela(["Arquivo", "Regra", "Listas (5 grupos, 7 dias)"], [
        ["<b>conferencia_impressa.html</b>", "Municiados e NÃO municiados em todo dia e toda refeição, incluindo a "
         "ceia. Sempre gera os 7 dias; dia, refeição e grupo são filtrados por caixas de seleção.", "7 × 4 × 5 × 2 = <b>280</b>"],
        ["municiamento_ciaga.html (oficial)", "Dias úteis: café com os municiados, almoço e janta com os NÃO municiados. "
         "Sábado e domingo: os municiados. Ceia fora. Dias escolhidos antes de gerar.", "7 × 3 × 5 = <b>105</b>"],
        ["<b>conferencia_digital.html</b>", "Escolhe dia, refeição e ano; a lista traz todos os alunos do ano (todos os "
         "cursos), em ordem alfabética, começando desmarcada. A pessoa marca quem veio (com pesquisa por nome de guerra ou "
         "código); a rela traz só os marcados, separados pela planilha em municiados e NÃO municiados. Várias listas em abas.",
         "quantas a pessoa criar"],
    ], [5.2, 8.8, 3])
    p("As três versões saem do <b>mesmo código</b> de leitura da planilha: muda o valor de "
      "<font face='" + MONO + "'>Municiamento.REGRA</font>, que o build grava em cada arquivo (\"completa\", \"padrao\" ou "
      "\"rela\"), e a rela usa uma página e uma interface próprias (<font face='" + MONO + "'>pagina_rela.html</font> e "
      "<font face='" + MONO + "'>rela.js</font>).")
    p("Existe também uma versão em <b>Python</b> (Flask) na pasta <font face='" + MONO + "'>services/</font>, de onde o "
      "sistema nasceu. Ela não é distribuída: serve de <b>referência</b> para os testes (a versão HTML precisa dar "
      "exatamente o mesmo resultado que ela).")

    # 2
    h1("2. O fluxo, passo a passo")
    fluxograma()
    itens([
        "<b>Abrir:</b> o navegador carrega o HTML. Um script no <font face='" + MONO + "'>&lt;head&gt;</font> aplica o tema claro "
        "ou escuro antes de pintar a tela; a abertura (navio) segue o mesmo tema e some em ~3 s, com um clique ou tecla.",
        "<b>Escolher a planilha:</b> o campo de arquivo aceita um XLSX, um PDF ou vários CSVs (um por turma). A data da "
        "sexta-feira é opcional nesta tela.",
        "<b>Ler os bytes:</b> <font face='" + MONO + "'>app.js</font> lê cada arquivo com <font face='" + MONO + "'>arrayBuffer()</font>. "
        "Nada é gravado em disco nem enviado.",
        "<b>Detectar e validar:</b> <font face='" + MONO + "'>entradas.js</font> descobre o tipo pelos primeiros bytes (não pela "
        "extensão), recusa .xls, .xlsm, macros, arquivos grandes demais e conteúdo que não bate com a extensão.",
        "<b>Virar grades:</b> cada formato vira uma <b>grade</b> (lista de linhas de texto). XLSX: uma grade por aba de "
        "turma. CSV: uma por arquivo. PDF: uma por página com tabela de turma.",
        "<b>Ler os alunos:</b> <font face='" + MONO + "'>parser.js</font> acha os blocos de turma, mapeia as colunas (dia × "
        "refeição), lê nome, código e marcações, confere com os totais da planilha e junta os avisos.",
        "<b>Definir a data:</b> vale a data informada; senão, a lida da aba QUANTITATIVO (XLSX) ou do texto "
        "<i>SEXTA (dd/mm)</i> do PDF. Sem data, a tela seguinte pede.",
        "<b>Montar as listas:</b> <font face='" + MONO + "'>report.js</font> cria uma lista por combinação, em ordem "
        "cronológica → refeição → grupo, com os nomes em ordem alfabética.",
        "<b>Conferir e filtrar:</b> a tela de resultado mostra o resumo, a conferência por turma, os avisos, os filtros e "
        "a prévia de cada lista (os nomes só são montados quando a lista é aberta).",
        "<b>Gerar e baixar:</b> <font face='" + MONO + "'>documentos.js</font> pagina as listas e desenha o DOCX e o PDF. O "
        "arquivo vira um <font face='" + MONO + "'>Blob</font>, baixado por um link temporário que é revogado depois.",
        "<b>Nova planilha:</b> zera o estado; os dados da planilha anterior deixam de existir na página.",
    ])

    # 3
    h1("3. Tecnologias")
    tabela(["Tecnologia", "Versão", "Licença", "Para quê"], [
        ["HTML, CSS e JavaScript", "—", "—", "Interface e toda a lógica, no navegador. JavaScript sem framework, em "
         "módulos IIFE que penduram funções no objeto global <font face='" + MONO + "'>Municiamento</font>."],
        ["SheetJS (xlsx)", "0.18.5", "Apache-2.0", "Ler o XLSX (abas, células, valores em cache das fórmulas, datas)."],
        ["JSZip", "3.10.1", "MIT", "Abrir o XLSX para validar (macros, tamanho) e montar o DOCX, que é um ZIP de XMLs."],
        ["jsPDF", "2.5.2", "MIT", "Desenhar o PDF das listas e medir a largura dos textos em Times."],
        ["pdf.js (Mozilla)", "3.11.174", "Apache-2.0", "Ler a planilha em PDF: textos com posição e os traços da tabela. "
         "Roda na própria página, sem worker."],
        ["Node.js", "testado no 24", "—", "Montar o HTML (<font face='" + MONO + "'>web/build.mjs</font>) e rodar os testes "
         "(<font face='" + MONO + "'>node --test</font>)."],
        ["Python 3", "testado no 3.14", "—", "Versão de referência: Flask, openpyxl, pdfplumber, python-docx, reportlab, pytest. "
         "Também gera o guia e esta documentação (reportlab)."],
        ["Git", "—", "—", "Histórico de versões, só local (sem GitHub)."],
    ], [3.6, 1.8, 2, 9.6])
    p("As bibliotecas ficam em <font face='" + MONO + "'>web/vendor/</font>, copiadas do npm sem alteração "
      "(<font face='" + MONO + "'>LICENCAS.md</font> registra versão e licença).")

    # 4
    h1("4. Organização das pastas")
    tabela(["Caminho", "Conteúdo"], [
        ["web/src/", "O código do sistema: texto.js, entradas.js, pdf.js, parser.js, report.js, documentos.js, app.js e "
         "rela.js (a interface da versão rela)."],
        ["web/pagina.html", "O esqueleto da página, com marcadores que o build substitui."],
        ["web/abertura.html", "A animação de abertura (HTML, CSS e um script pequeno)."],
        ["web/estilo.css", "Todo o visual: tema Marinha Mercante, claro e escuro, por variáveis CSS."],
        ["web/vendor/", "As bibliotecas de terceiros (minificadas)."],
        ["web/build.mjs", "Junta tudo em um HTML por versão."],
        ["web/testes/", "Testes da versão HTML, com dados fictícios."],
        ["assets/", "Brasão do CIAGA (site) e marca d'água (documentos)."],
        ["services/, app.py, templates/, static/", "Versão Python (referência)."],
        ["tests/", "Testes Python e as planilhas fictícias (tests/fixtures/), usadas também pelos testes JS."],
        ["docs/", "Geradores do guia de uso e desta documentação."],
        ["../amostras/", "Planilhas reais. Fora do repositório (LGPD): nunca vão para o Git."],
    ], [5, 12])

    # 5
    h1("5. Montagem do arquivo único (build)")
    p("O comando <font face='" + MONO + "'>node web/build.mjs</font> gera as três versões (ou só uma: "
      "<font face='" + MONO + "'>node web/build.mjs rela</font>). Ele lê a página da versão (<font face='" + MONO + "'>"
      "pagina.html</font> ou <font face='" + MONO + "'>pagina_rela.html</font>) e troca "
      "quatro marcadores:")
    tabela(["Marcador", "Vira"], [
        ["/*ESTILO*/", "O <font face='" + MONO + "'>estilo.css</font>, com o brasão convertido em base64 (data URI)."],
        ["&lt;body&gt;", "&lt;body&gt; + a abertura (<font face='" + MONO + "'>abertura.html</font>)."],
        ["&lt;!--BIBLIOTECAS--&gt;", "Um &lt;script&gt; para cada biblioteca de <font face='" + MONO + "'>web/vendor/</font>."],
        ["&lt;!--CODIGO--&gt;", "A marca d'água em base64, <font face='" + MONO + "'>Municiamento.REGRA</font>, os arquivos "
         "de <font face='" + MONO + "'>web/src/</font> em ordem (com app.js ou rela.js) e a chamada <font face='" + MONO + "'>Municiamento.iniciar()</font>."],
    ], [4, 13], fonte="cod")
    p("A função <font face='" + MONO + "'>seguroParaScript</font> recusa código que contenha <font face='" + MONO + "'>&lt;/script</font> "
      "(fecharia o bloco antes da hora) e neutraliza <font face='" + MONO + "'>&lt;!--</font>. Ao terminar, o build mostra o "
      "tamanho (~3,4 MB) e o início do SHA-256 de cada arquivo, para conferir qual versão foi distribuída.")
    codigo('''
const VERSOES = {
  abertura: { arquivo: "municiamento_ciaga.html",          regra: "padrao" },
  completa: { arquivo: "conferencia_impressa.html", regra: "completa" },
};''')

    # 6
    h1("6. Segurança e proteção de dados")
    p("A primeira linha de defesa é a <b>política de segurança de conteúdo</b> (CSP), declarada no "
      "<font face='" + MONO + "'>&lt;head&gt;</font>. Ela diz ao navegador o que a página pode fazer; o que não está liberado "
      "é bloqueado, mesmo que algum código tente:")
    tabela(["Diretiva", "Efeito"], [
        ["default-src 'none'", "Nada é carregado de fora, a não ser o que for liberado abaixo."],
        ["connect-src 'none'", "<b>Proíbe qualquer conexão</b> (fetch, XHR, WebSocket, beacon): nenhum dado sai."],
        ["script-src / style-src 'unsafe-inline'", "Só roda o código que está dentro do próprio arquivo."],
        ["img-src data: blob:", "Imagens só embutidas (base64) ou geradas na hora."],
        ["form-action, frame-src, object-src, base-uri 'none'", "Sem envio de formulário, sem molduras, sem plugins."],
        ["worker-src 'none'", "Sem workers; por isso o pdf.js roda na própria página."],
    ], [6, 11], fonte="cod")
    itens([
        "<b>Nada é guardado</b>: o único item em <font face='" + MONO + "'>localStorage</font> é a escolha do tema "
        "(<font face='" + MONO + "'>municiamento-tema</font>). Os dados ficam numa variável (<font face='" + MONO + "'>estado</font>) "
        "que some ao fechar a página ou clicar em Nova planilha.",
        "<b>Validação dos arquivos</b> pelos bytes: PDF começa com <font face='" + MONO + "'>%PDF-</font>; XLSX com "
        "<font face='" + MONO + "'>PK</font> e precisa ter <font face='" + MONO + "'>xl/workbook.xml</font>; .xls antigo e "
        "<font face='" + MONO + "'>vbaProject.bin</font> (macros) são recusados.",
        "<b>Limites</b>: 10 MB por arquivo; XLSX até 80 MB descompactado e 3.000 partes (proteção contra \"zip bomb\"); "
        "PDF até 60 páginas; CSV até 5.000 linhas e 60 colunas; até 40 arquivos; por aba, só 150 linhas e 30 colunas.",
        "<b>Texto puro</b>: nomes entram na tela por <font face='" + MONO + "'>textContent</font> (nunca como HTML), e nos "
        "documentos passam por <font face='" + MONO + "'>M.limpar</font> (tira caracteres de controle) e, no DOCX, por "
        "<font face='" + MONO + "'>esc</font> (escapa &amp;, &lt;, &gt;, aspas).",
        "<b>pdf.js</b> é aberto sem <font face='" + MONO + "'>eval</font>, sem fontes do sistema e sem buscar nada na rede.",
        "<b>LGPD</b>: os dados pessoais existem fora do sistema (a planilha, os DOCX/PDF baixados, os impressos); esses "
        "precisam de cuidado da equipe. O repositório Git nunca recebe planilhas reais, listas geradas ou "
        "<font face='" + MONO + "'>atividade.db</font>, e os testes usam só dados fictícios.",
    ])

    # 7
    h1("7. Os módulos, um a um")
    p("Cada arquivo de <font face='" + MONO + "'>web/src/</font> é uma função que se executa na hora e recebe o objeto "
      "<font face='" + MONO + "'>Municiamento</font> (apelidado de <font face='" + MONO + "'>M</font>). O que é público vira "
      "<font face='" + MONO + "'>M.algumaCoisa</font>; o resto fica privado dentro da função. A ordem de carga importa: "
      "texto → entradas → pdf → parser → report → documentos → app.")
    codigo('''
(function (M) {
  "use strict";
  function privada() { ... }
  M.publica = function () { ... };
})(globalThis.Municiamento = globalThis.Municiamento || {});''')

    h2("7.1 texto.js: textos e datas")
    p("Funções pequenas usadas por todos. As datas são sempre texto <font face='" + MONO + "'>AAAA-MM-DD</font>, calculadas "
      "em UTC, para que fuso horário e horário de verão nunca mudem o dia.")
    funcoes([
        ["TURMA_RE", "Expressão da turma, tolerante a espaços: <font face='" + MONO + "'>([BMN])\\s?(\\d)(\\d)\\s?\\.\\s?(\\d)</font>."],
        ["acharTurma(texto)", "'M 24.1' → 'M24.1'; null se não houver turma."],
        ["codigos(texto)", "Todos os códigos de aluno (letra + 4 dígitos) achados no texto."],
        ["semAcento, normalizar", "Tiram acentos (Unicode NFD); normalizar também põe em minúsculas e tira espaços das pontas."],
        ["comparar(a, b)", "Ordem por ponto de código, igual ao Python, independente do idioma do navegador."],
        ["limpar(s, maximo)", "Tira caracteres de controle, junta espaços repetidos."],
        ["ehSexta, somarDias, formatarData", "Testa se a data é sexta, soma dias, mostra dd/mm/aaaa ou dd/mm."],
        ["dataDoExcel(serie, 1904)", "Converte o número de data do Excel (sistemas 1900 e 1904) em AAAA-MM-DD."],
    ])

    h2("7.2 entradas.js: arquivo → grades")
    p("Recebe os arquivos escolhidos e devolve <font face='" + MONO + "'>{formato, grades, sextaSugerida, avisos}</font>. "
      "Cada <b>grade</b> é uma lista de linhas de texto, já sem espaços nas pontas; célula vazia é \"\". Assim o "
      "parser não precisa saber de onde a grade veio.")
    funcoes([
        ["detectar(nome, bytes)", "Descobre o tipo pelos primeiros bytes e valida (ver seção 6). Erros viram "
         "<font face='" + MONO + "'>ArquivoInvalido</font>, com mensagem em português pronta para a tela."],
        ["carregarGrades(arquivos)", "Detecta cada arquivo; vários arquivos só se forem todos CSV; chama o leitor do formato."],
        ["lerXlsx(bytes)", "Abre com SheetJS limitado a 150 linhas por aba. Aba com nome de turma vira grade (o nome da "
         "aba manda); QUANTITATIVO dá a data; aba vazia é ignorada; aba estranha vira aviso."],
        ["linhasDaAba(ws, ...)", "Lê só as primeiras colunas e para depois de 15 linhas vazias seguidas: nunca percorre as "
         "1.000 linhas formatadas que algumas abas têm."],
        ["sextaDoResumo(linhas)", "Na QUANTITATIVO: a data cuja coluna tem o rótulo SEXTA; senão qualquer data que caia "
         "numa sexta; senão o texto SEXTA (dd/mm)."],
        ["sextaDoTexto(txt, ano)", "Lê 'SEXTA (23/10)' e escolhe o ano em que esse dia é sexta, o mais perto de hoje."],
        ["decodificar(bytes)", "CSV em UTF-8 (com ou sem BOM) ou, se falhar, Windows-1252."],
        ["separador(txt)", "Testa ; , e tab e fica com o que dá o mesmo número de colunas na maioria das linhas."],
        ["lerLinhasCsv(txt, sep)", "Leitor de CSV próprio: aspas, aspas duplicadas, quebras \\r\\n, \\n ou \\r."],
        ["lerCsv(nome, bytes)", "Monta a grade; a turma pode vir do nome do arquivo (B12.1.csv) se a célula A1 estiver vazia."],
    ])

    h2("7.3 pdf.js: PDF → grades")
    p("O texto de um PDF não tem colunas: são pedaços de texto soltos com posição. Por isso a grade é reconstruída pela "
      "<b>geometria</b>, usando os traços que desenham a tabela.")
    itens([
        "<b>segmentos()</b> percorre a lista de operações de desenho da página (com a matriz de transformação) e guarda "
        "os traços retos verticais e horizontais efetivamente desenhados (stroke).",
        "<b>Colunas</b> = a <b>união</b> das posições de todos os traços verticais da tabela, agrupadas com tolerância de "
        "1,2 pt (<font face='" + MONO + "'>agrupar</font>). Assim, quando o PDF deixa de desenhar o traço entre duas células "
        "numa linha, elas não se fundem; esse era o defeito que fazia a versão antiga perder marcações.",
        "<b>Linhas</b> = faixas entre traços horizontais; cada texto vai para a faixa e para a coluna onde começa.",
        "<b>Marcações juntas</b> ('x x x' num texto só) são separadas letra a letra, cada uma na coluna do seu centro; "
        "<font face='" + MONO + "'>separar()</font> desfaz também 'N3015 X' (código colado na marcação).",
        "A linha dos <b>dias</b> é posta no início de cada grupo de 4 colunas; a linha das refeições é recriada. A "
        "<b>tabela de totais</b> é lida pela ordem dos textos. Páginas sem tabela de turma (resumo geral) não viram "
        "grade, mas podem dar a data (SEXTA (dd/mm)).",
    ])
    funcoes([
        ["lerPdf(bytes)", "Abre com pdf.js (sem eval, sem rede), lê até 60 páginas e monta as grades."],
        ["gradeDaPagina(itens, segs)", "Uma página → linhas da grade, ou [] se não houver tabela de turma confiável."],
        ["linhasDeTexto(itens)", "Agrupa os textos por linha de base, de cima para baixo."],
    ])

    h2("7.4 parser.js: grades → alunos")
    p("Lê todas as grades e devolve um <font face='" + MONO + "'>Resultado</font>: <font face='" + MONO + "'>alunos</font>, "
      "<font face='" + MONO + "'>turmas</font> (com a contagem de cada uma) e <font face='" + MONO + "'>avisos</font> "
      "(<font face='" + MONO + "'>{texto, grave}</font>). Nada é global: cada leitura começa do zero.")
    funcoes([
        ["cabecalhos(linhas)", "Acha os blocos: uma linha com 3 ou mais dias seguida (em até 2 linhas) de uma com 8 ou mais "
         "refeições. Uma aba ou um CSV pode ter vários blocos empilhados."],
        ["mapaColunas(linhaDias)", "Cada célula de dia abre um grupo de 4 colunas; a <b>posição</b> no grupo dá a refeição "
         "(0 Café, 1 Almoço, 2 Janta, 3 Ceia). Não depende do texto das refeições, que tem erros ('Jant', 'Almoç')."],
        ["escolherTurma(...)", "Nome da aba > célula do cabeçalho > nome do arquivo CSV > a próxima da sequência (com aviso "
         "grave, como a turma ilegível 'N24.4' do PDF real)."],
        ["lerBloco(...)", "Linha a linha: para nos totais; lê nome e código; qualquer texto na célula é marcação "
         "('x' ou 'X'; outro texto conta e gera aviso); célula só com espaços não é marcação."],
        ["codigo(nome, cod, turma)", "Código junto do nome; nome longo que invade a célula do código (só os 4 dígitos "
         "ficam legíveis: o prefixo vem da letra da turma)."],
        ["lerTotais, conferir", "Lê a tabela de totais da planilha e compara com a contagem: diferença vira aviso "
         "('contei 24, a planilha informa 23 (+1)'), nunca bloqueio."],
        ["duplicados(res)", "Código repetido em alunos diferentes vira aviso; os dois são mantidos."],
    ])

    h2("7.5 report.js: as listas")
    funcoes([
        ["REGRA", "\"padrao\" ou \"completa\", gravada pelo build."],
        ["REFEICOES", "Getter: Café, Almoço, Janta (padrão) ou também a Ceia (completa)."],
        ["grupoDe, rotuloGrupo", "'N24.1' → 'N2' → '2° Ano – Náutica'."],
        ["datasDaSemana(sexta)", "Sexta + 0, Sábado + 1, Domingo + 2, Segunda + 3 … Quinta + 6."],
        ["situacoes(dia, ref)", "Quais listas saem: [true, false] na completa; na padrão, municiados no café e no fim de "
         "semana e NÃO municiados no almoço e na janta dos dias úteis."],
        ["montarListas(alunos, sexta, dias)", "Uma <font face='" + MONO + "'>Lista</font> por dia × refeição × grupo × situação, "
         "em ordem cronológica, Café → Ceia, B1 → N3; nomes em ordem alfabética sem acento, empate pelo código."],
        ["filtrar(listas, f)", "Cada critério pode ser um valor ('Janta') ou vários (['Almoço', 'Janta']); vazio = sem "
         "filtro; lista vazia = nenhuma."],
    ])

    h2("7.6 documentos.js: DOCX e PDF")
    p("Explicado em detalhe na seção 10. Funções públicas: <font face='" + MONO + "'>paginar</font>, "
      "<font face='" + MONO + "'>gerarDocx</font>, <font face='" + MONO + "'>gerarPdf</font>, <font face='" + MONO + "'>ajustarRotulo</font>, "
      "<font face='" + MONO + "'>nomeArquivo</font> (ex.: <font face='" + MONO + "'>municiamento_2026-10-23_almoco-janta_b1-n3.pdf</font>).")

    h2("7.7 app.js: a interface")
    p("Liga a página às funções acima. Guarda tudo em uma variável, <font face='" + MONO + "'>estado</font> "
      "(<font face='" + MONO + "'>{leitura, res, sexta, dias, listas}</font>).")
    funcoes([
        ["iniciar()", "Tema, caixas, eventos (arrastar e soltar, enviar, filtros, baixar) e o que aparece em cada versão "
         "(VARIOS = versão completa: filtros por caixas e sem escolha de dias na geração)."],
        ["gerar(ev)", "Lê os arquivos, carrega as grades, faz o parse, confere a data informada (é sexta? bate com a da "
         "planilha?) e vai para a tela de resultado."],
        ["recalcular()", "Monta as listas com a data e os dias atuais."],
        ["desenharResultado()", "Resumo, conferência por turma, avisos (os graves primeiro, o quadro abre sozinho se houver)."],
        ["preencherFiltros, filtroAtual", "Monta menus ou caixas; nas caixas, todas marcadas = sem filtro (null)."],
        ["desenharListas()", "Mostra as listas filtradas; os nomes só são montados quando a lista é aberta (rápido mesmo "
         "com 280 listas)."],
        ["ajustar(ev)", "Troca a data (e, na oficial, os dias) e refaz as listas."],
        ["baixar(ev)", "Gera DOCX ou PDF (todas ou só o filtro atual) e baixa por um link temporário."],
        ["novaPlanilha()", "Zera o estado e volta para a primeira tela."],
        ["tema()", "Botão claro/escuro; guarda a escolha em localStorage."],
    ])

    h2("7.8 rela.js: a interface da versão rela")
    p("Substitui o <font face='" + MONO + "'>app.js</font> na versão rela. O <font face='" + MONO + "'>estado</font> guarda as "
      "listas abertas; cada uma tem dia, refeição, ano, os alunos do ano e o conjunto <font face='" + MONO + "'>marcados</font> "
      "(chaves de aluno). Nada é gravado: ao fechar a página, as marcações se perdem (o navegador pergunta antes).")
    funcoes([
        ["ler(ev)", "Lê a planilha como a outra versão; a data é opcional."],
        ["criarLista(ev)", "Cria uma aba com <font face='" + MONO + "'>M.alunosDoAno</font> e nenhuma marcação."],
        ["desenharAbas, desenharPainel", "Abas com a contagem marcados/total; painel com pesquisa, botões e a lista de "
         "caixas (nome, turma, código)."],
        ["Turmas (marcação)", "Antes de marcar, escolhe quais turmas aparecem na lista (escolhaTurmas com o campo "
         "turmasMarcacao)."],
        ["Separar por turma", "Na marcação, mostra um bloco por turma (gruposDaMarcacao); a lista para marcar baixada sai igual."],
        ["Alerta", "Ao marcar alguém que a planilha não dá como municiado naquele dia e refeição, aparece um aviso em "
         "vermelho e a linha ganha a etiqueta NÃO municiado; a marcação continua valendo."],
        ["filtrar / Enter", "Pesquisa por nome de guerra ou código; com um só resultado, Enter marca e limpa a pesquisa."],
        ["Lista para marcar", "Baixa (PDF ou DOCX) a lista inteira com [   ] ao lado de cada nome, para marcar no papel."],
        ["Finalizar marcação", "Troca o painel para a rela, com Ordem (alfabética ou antiguidade), Agrupar (ano inteiro "
         "ou por turma, escolhendo quais turmas entram) e Separar em duas listas (municiados e NÃO municiados); Voltar a marcar reabre sem perder nada."],
        ["folhaNaTela", "Cada folha da rela com cara de documento e os botões Copiar, PDF e DOCX."],
        ["copiar()", "Área de transferência do navegador, com plano B (selecionar e copiar)."],
        ["baixar()", "Gera o PDF ou o DOCX da rela (M.gerarRelaPdf / M.gerarRelaDocx, em documentos.js): uma folha por "
         "página, nomes em 2 colunas, turma longa continuando na página seguinte, brasão de fundo em todas as páginas."],
    ])
    p("No <font face='" + MONO + "'>report.js</font>, a rela usa <font face='" + MONO + "'>anosPresentes</font>, "
      "<font face='" + MONO + "'>alunosDoAno</font>, <font face='" + MONO + "'>chaveAluno</font>, "
      "<font face='" + MONO + "'>ordenarAlunos</font> (alfabética ou antiguidade: no código CXNNN, X maior primeiro e, "
      "com o mesmo X, NNN menor primeiro), <font face='" + MONO + "'>relaEstruturada</font> (folhas, seções e grupos por "
      "turma), <font face='" + MONO + "'>textoFolha</font> e <font face='" + MONO + "'>textoRela</font>. No "
      "<font face='" + MONO + "'>parser.js</font>, a conferência dos totais vale também na rela (com a ceia). A regra da "
      "rela: entram só os alunos marcados na tela, e cada um vai para municiados ou NÃO municiados conforme a marcação "
      "da planilha naquele dia e refeição.")

    h2("7.9 pagina.html, estilo.css e abertura.html")
    itens([
        "<b>pagina.html</b>: as duas telas (Gerar listas e Listas prontas) como seções; a que não está em uso tem a "
        "classe <font face='" + MONO + "'>oculto</font>. Inclui link 'Pular para o conteúdo', rótulos e "
        "<font face='" + MONO + "'>aria-*</font> para leitores de tela.",
        "<b>estilo.css</b>: toda cor vem de variáveis em <font face='" + MONO + "'>:root</font>, redefinidas em "
        "<font face='" + MONO + "'>[data-tema=\"escuro\"]</font>. O brasão de fundo é um "
        "<font face='" + MONO + "'>body::before</font> fixo e translúcido que não recebe cliques; os cartões são "
        "semitransparentes. Layout em grade que vira uma coluna no celular; na impressão some o que não é conteúdo. "
        "Fonte: Times New Roman em tudo.",
        "<b>abertura.html</b>: cena em SVG (céu, astro, navio, ondas em camadas, espuma, esteira, reflexo) animada só com "
        "CSS; noite no tema escuro e dia no claro. Fecha com clique, tecla, no fim da animação ou, por garantia, em 4 s. "
        "Quem pediu ao sistema para reduzir animações não vê a abertura.",
    ])

    # 8
    h1("8. Estruturas de dados")
    codigo('''
Grade      { linhas: [["B12.1", ""], ["", "", "Sexta", ...], ...],
             origem: "aba B12.1", turmaAba: "B12.1", turmaArquivo: null }

Aluno      { nome: "SILVA", codigo: "B1003", turma: "B12.1",
             marcas: { "Sexta|Café": true, "Sexta|Almoço": false, ... } }  // 28 chaves

Resultado  { alunos: [Aluno], turmas: [{codigo, alunos, origem}],
             avisos: [{texto: "N24.3, Segunda/Almoço: contei 24, ...", grave: false}] }

Lista      { data: "2026-10-23", dia: "Sexta", refeicao: "Café", grupo: "B1",
             municiados: true, alunos: [[nome, turma, codigo], ...], totalGrupo: 42,
             diaExtenso: "Sexta-feira", refeicaoRotulo: "Café da manhã",
             grupoRotulo: "1° Ano – Básico", tipo: "Municiados" }

Filtro     { dia: ["Sexta", "Segunda"] | "Sexta" | null,
             refeicao: [...] | "" , grupo: [...] | "", situacao: "municiados" | "nao" | "" }''')
    p("Nomes e códigos acima são exemplos fictícios.")

    # 9
    h1("9. Regras de negócio")
    tabela(["Regra", "Como o código trata"], [
        ["Turma", "<font face='" + MONO + "'>[curso][ano][semestre].[turma]</font>, ex. B12.6. Grupo = curso + ano (B1, M2, N2, "
         "M3, N3), sempre nessa ordem."],
        ["Código do aluno", "Letra do curso + 4 dígitos (B1001). Não é chave única (há códigos repetidos na planilha real)."],
        ["Municiado", "Célula do dia/refeição com qualquer texto. Vazia ou só com espaços = não municiado."],
        ["Semana", "Começa na sexta (primeira coluna) e vai até a quinta; a data das outras colunas é calculada."],
        ["Ordem", "Alfabética pelo nome escrito na planilha, sem acento e sem diferenciar maiúsculas; empate pelo código."],
        ["Aluno sem marcação", "É válido: entra nas listas de NÃO municiados."],
        ["Totais que não batem", "Só aviso. Muitas vezes o erro é da própria planilha (fórmula com intervalo digitado à mão)."],
        ["Lista vazia", "Continua existindo, com 'Nenhum aluno nesta lista.'"],
    ], [3.6, 13.4])

    # 10
    h1("10. Documentos DOCX e PDF")
    p("O desafio é o DOCX e o PDF ficarem <b>idênticos</b>, página por página. A solução é decidir a paginação no "
      "código (<font face='" + MONO + "'>paginar</font>) e fazer os dois formatos desenharem as mesmas páginas, com medidas "
      "exatas em pontos:")
    itens([
        "A4 retrato; margens laterais de 48 pt e de 18 pt em cima e embaixo (o máximo de nomes por página).",
        "Tabela de 2 colunas preenchida <b>em colunas</b> (desce a esquerda, depois a direita); linhas de 15 pt de altura "
        "fixa; até <b>46 linhas por coluna</b> na primeira página (92 nomes) e <b>50</b> nas de continuação (100 nomes).",
        "No DOCX, as linhas têm altura exata (<font face='" + MONO + "'>hRule=\"exact\"</font>), os parágrafos espaçamento exato "
        "e cada página começa com quebra explícita: o Word não tem como repaginar. Modo de compatibilidade do Word 2010.",
        "Nome longo: <font face='" + MONO + "'>ajustarRotulo</font> diminui a fonte de 11 até 8,5 pt e, se ainda não couber, "
        "corta com reticências, usando a medida de largura do jsPDF em Times; o mesmo vale para os dois formatos.",
        "Cabeçalho: título 'Municiamento', a linha do dia, a refeição, o grupo e 'Municiados' ou '<u><b>NÃO</b></u> "
        "Municiados'. Continuação: versão curta numa linha. No fim: 'Total: N alunos'. Sem assinaturas e sem rodapé.",
        "<b>Marca d'água</b>: o brasão do CIAGA clareado, centralizado em todas as páginas. No DOCX, é uma imagem ancorada "
        "atrás do texto no cabeçalho da seção (<font face='" + MONO + "'>behindDoc=\"1\"</font>); no PDF, desenhada primeiro em "
        "cada página.",
        "O DOCX é escrito à mão em OOXML (document.xml, styles.xml, settings.xml, header1.xml, relações e a imagem) e "
        "zipado com JSZip. O PDF é desenhado com jsPDF, calculando a linha de base como o Word faz.",
    ])

    # 11
    h1("11. Testes")
    p("Todos os testes usam <b>dados fictícios</b> (<font face='" + MONO + "'>tests/fixtures/</font>: um XLSX, um PDF, seis CSVs "
      "e um CSV com os problemas reais reproduzidos). O resultado esperado (<font face='" + MONO + "'>esperado.json</font>) é "
      "gerado pela versão Python; a versão HTML precisa bater com ele.")
    codigo('''
node --test web/testes/municiamento.test.cjs     # 18 testes da versão HTML
python -m pytest                                 # testes da versão Python
python tests/conferir_real.py                    # só no computador com ../amostras (dados reais)''')
    tabela(["O que os testes JS conferem", ""], [
        ["Leitura", "XLSX igual ao Python; vários CSVs = XLSX; CSV com os problemas reais; CSV em ; , tab, UTF-8 e "
         "Windows-1252; PDF fictício = XLSX; página sem tabela não vira grade."],
        ["Regras", "Padrão: 105 listas e a regra de cada dia; completa: 280, com a ceia, municiados + NÃO municiados = "
         "turma inteira; filtros de situação e de vários valores."],
        ["Validação", "Recusa .xls, .xlsm, macros, texto renomeado para .pdf, arquivo grande demais."],
        ["Documentos", "Ordem alfabética; paginação em colunas com continuação; nome longo cabe; DOCX com a marca d'água "
         "atrás do texto, sem rodapé e sem assinaturas; PDF com as mesmas páginas do DOCX; nome do arquivo."],
    ], [3.2, 13.8])
    p("<font face='" + MONO + "'>web/testes/ambiente.cjs</font> carrega no Node as mesmas bibliotecas e os mesmos arquivos "
      "que o navegador, na mesma ordem. Com a planilha real, <font face='" + MONO + "'>conferir_real.py</font> compara HTML e "
      "Python e imprime só contagens e códigos, nunca nomes.")

    # 12
    h1("12. Como manter e evoluir")
    tabela(["Para…", "Faça"], [
        ["Mudar o código", "Edite <font face='" + MONO + "'>web/src/</font>, rode os testes e "
         "<font face='" + MONO + "'>node web/build.mjs</font>. Nunca edite o HTML gerado: ele é sobrescrito."],
        ["Mudar uma regra", "<font face='" + MONO + "'>report.js</font> (<font face='" + MONO + "'>situacoes</font>, "
         "<font face='" + MONO + "'>REFEICOES</font>) e o teste da regra; se valer para a versão Python, também "
         "<font face='" + MONO + "'>services/report.py</font>."],
        ["Mudar o visual", "<font face='" + MONO + "'>estilo.css</font> (variáveis de cor) e "
         "<font face='" + MONO + "'>pagina.html</font>."],
        ["Mudar os documentos", "Constantes no topo de <font face='" + MONO + "'>documentos.js</font>; confira se o DOCX aberto "
         "no Word e o PDF continuam com as mesmas páginas."],
        ["Trocar o brasão", "Substitua <font face='" + MONO + "'>assets/brasao_ciaga.png</font> (site) e "
         "<font face='" + MONO + "'>assets/marca_dagua_ciaga.png</font> (documentos) e gere de novo."],
        ["Atualizar uma biblioteca", "Baixe a versão nova do npm, copie para <font face='" + MONO + "'>web/vendor/</font>, "
         "atualize LICENCAS.md, rode os testes e o build."],
        ["Distribuir", "Envie só o HTML gerado. Quem recebe apaga a versão antiga e usa a nova."],
        ["Gerar os PDFs de apoio", "<font face='" + MONO + "'>python docs/gerar_guia.py …</font> (guia, com capturas feitas com a "
         "planilha fictícia) e <font face='" + MONO + "'>python docs/gerar_tecnico.py saida.pdf</font> (este documento)."],
        ["Fazer commit", "Confira <font face='" + MONO + "'>git status</font> e o que está no stage: nada de planilhas reais, "
         "listas geradas, .db ou .env."],
    ], [3.8, 13.2])


def gerar(saida):
    global FUNDO
    FUNDO = G.brasao_claro(0.07)
    doc = SimpleDocTemplate(str(saida), pagesize=G.A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2.35 * cm,
                            bottomMargin=1.8 * cm, title="Municiamento Ciaga – Documentação técnica",
                            author="Municiamento Ciaga")
    conteudo()
    doc.build(h, onFirstPage=pagina, onLaterPages=pagina)


if __name__ == "__main__":
    gerar(sys.argv[1])
