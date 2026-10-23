"""Gera o PDF do código comentado: cada arquivo do sistema, trecho a trecho, com a explicação.

    cd docs && python gerar_comentado.py ../Codigo_Comentado_Municiamento_Ciaga.pdf

As explicações ficam em comentarios.py. Antes de gerar, confere se os trechos ainda batem com
o código (toda linha com conteúdo precisa estar em um trecho); se não baterem, para e avisa.
"""
import re
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import CondPageBreak, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import gerar_guia as G
from comentarios import ARQUIVOS

F = G.F
MARINHO, DOURADO, TEXTO, SUAVE, BORDA = G.MARINHO, G.DOURADO, G.TEXTO, G.SUAVE, G.BORDA
L, A = G.L, G.A
LARG = 17 * cm


def fonte_mono():
    caminho = G.Path(G.os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "cour.ttf"
    if not caminho.exists():
        return "Courier"
    pdfmetrics.registerFont(TTFont("Mono", str(caminho)))
    return "Mono"


MONO = fonte_mono()
S = {
    "capa": ParagraphStyle("capa", fontName=F["TNR-B"], fontSize=30, leading=34, textColor=MARINHO, spaceAfter=8),
    "capa_sub": ParagraphStyle("capa_sub", fontName=F["TNR"], fontSize=14, leading=19, textColor=SUAVE, spaceAfter=14),
    "h1": ParagraphStyle("h1", fontName=F["TNR-B"], fontSize=18, leading=22, textColor=MARINHO, spaceAfter=3),
    "h2": ParagraphStyle("h2", fontName=F["TNR-B"], fontSize=13.5, leading=17, textColor=MARINHO, spaceBefore=8, spaceAfter=3),
    "resumo": ParagraphStyle("resumo", fontName=F["TNR-I"], fontSize=11, leading=14, textColor=SUAVE, spaceAfter=8),
    "p": ParagraphStyle("p", fontName=F["TNR"], fontSize=11, leading=14.6, textColor=TEXTO, spaceAfter=5),
    "item": ParagraphStyle("item", fontName=F["TNR"], fontSize=11, leading=14.6, textColor=TEXTO, leftIndent=14,
                           bulletIndent=2, bulletFontName=F["TNR-B"], spaceAfter=3),
    "num": ParagraphStyle("num", fontName=MONO, fontSize=7, leading=9.2, textColor=SUAVE, alignment=2),
    "cod": ParagraphStyle("cod", fontName=MONO, fontSize=7.6, leading=9.2, textColor=TEXTO),
    "exp": ParagraphStyle("exp", fontName=F["TNR"], fontSize=10.5, leading=13.6, textColor=TEXTO),
}
FUNDO = None


def pagina(c, doc):
    c.saveState()
    alto = 15 * cm
    lado = alto * 166 / 267
    c.drawImage(FUNDO, (L - lado) / 2, (A - alto) / 2 - 1 * cm, lado, alto)
    c.setFillColor(MARINHO)
    c.rect(0, A - 1.6 * cm, L, 1.6 * cm, stroke=0, fill=1)
    c.setFillColor(DOURADO)
    c.rect(0, A - 1.6 * cm - 3, L, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont(F["TNR-B"], 15)
    c.drawString(2 * cm, A - 1.05 * cm, "Municiamento Ciaga")
    c.setFont(F["TNR"], 9)
    c.drawRightString(L - 2 * cm, A - 1.0 * cm, "Código comentado")
    c.setFillColor(SUAVE)
    c.setFont(F["TNR"], 8)
    c.drawString(2 * cm, 1.2 * cm, "Centro de Instrução Almirante Graça Aranha")
    c.drawRightString(L - 2 * cm, 1.2 * cm, f"página {doc.page}")
    c.restoreState()


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def marcar(t):
    """`código` -> monoespaçado; **texto** -> negrito."""
    t = esc(t)
    t = re.sub(r"`([^`]+)`", lambda m: f"<font face='{MONO}' size='9.5'>{m.group(1)}</font>", t)
    return re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)


def linha_de_codigo(s):
    """Escapa e preserva o recuo e os espaços repetidos, mas deixa quebrar linhas longas."""
    s = esc(s.rstrip("\n").replace("\t", "    "))
    recuo = len(s) - len(s.lstrip(" "))
    corpo = re.sub(r" {2,}", lambda m: "&nbsp;" * (len(m.group(0)) - 1) + " ", s[recuo:])
    return "&nbsp;" * recuo + corpo if corpo else "&nbsp;"


def conferir(arq, linhas):
    """Os trechos estão em ordem, dentro do arquivo, e cobrem toda linha com conteúdo."""
    cobertas, ultimo = set(), 0
    for ini, fim, _ in arq["trechos"]:
        if not (ultimo < ini <= fim <= len(linhas)):
            raise SystemExit(f"{arq['caminho']}: trecho {ini}-{fim} fora de ordem ou além do fim ({len(linhas)} linhas)")
        cobertas.update(range(ini, fim + 1))
        ultimo = fim
    faltam = [i for i, l in enumerate(linhas, 1) if l.strip() and i not in cobertas]
    if faltam:
        raise SystemExit(f"{arq['caminho']}: linhas sem explicação: {faltam[:20]} (o código mudou? ajuste comentarios.py)")


def bloco(linhas, ini, fim, texto):
    dados = [[Paragraph(str(i), S["num"]), Paragraph(linha_de_codigo(linhas[i - 1]), S["cod"])] for i in range(ini, fim + 1)]
    cod = Table(dados, colWidths=[0.95 * cm, LARG - 0.95 * cm], repeatRows=0)
    cod.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor("#F3F5F9")),
                             ("LINEBEFORE", (1, 0), (1, -1), 0.5, BORDA), ("BOX", (0, 0), (-1, -1), 0.5, BORDA),
                             ("TOPPADDING", (0, 0), (-1, -1), 0.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.6),
                             ("LEFTPADDING", (0, 0), (0, -1), 2), ("RIGHTPADDING", (0, 0), (0, -1), 4),
                             ("LEFTPADDING", (1, 0), (1, -1), 5), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    exp = Table([[Paragraph(marcar(texto), S["exp"])]], colWidths=[LARG])
    exp.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), G.AVISO_FUNDO), ("LINEBEFORE", (0, 0), (0, -1), 3, DOURADO),
                             ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                             ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    partes = [cod, exp, Spacer(1, 9)]
    return [KeepTogether(partes)] if fim - ini < 28 else partes


def introducao(h):
    h.append(Paragraph("Código comentado", S["capa"]))
    h.append(Paragraph("Cada arquivo do Municiamento Ciaga, na ordem em que é carregado, com todas as linhas numeradas e a "
                       "explicação de cada trecho logo abaixo. Para entender o sistema a fundo e conseguir reproduzi-lo.",
                       S["capa_sub"]))
    h.append(Paragraph("Como ler", S["h2"]))
    for t in [
        "O código aparece em caixas cinza, com o número da linha à esquerda; a explicação vem logo depois, no quadro "
        "amarelo. As linhas em branco foram omitidas (por isso a numeração pode pular).",
        "Os números são os do arquivo real, então dá para abrir o arquivo ao lado e acompanhar.",
        "As bibliotecas de terceiros (pasta `web/vendor/`) não são explicadas: são usadas como vieram.",
    ]:
        h.append(Paragraph(marcar(t), S["item"], bulletText="•"))
    h.append(Paragraph("Como reproduzir do zero", S["h2"]))
    passos = [
        "Instale o **Node.js** (para montar o HTML e rodar os testes). O Python só é necessário para gerar os PDFs de "
        "documentação e para a versão de referência.",
        "Crie as pastas `web/src/`, `web/vendor/`, `web/testes/` e `assets/`.",
        "Baixe as bibliotecas do npm, exatamente nestas versões, e copie para `web/vendor/`: `xlsx@0.18.5` "
        "(arquivo `dist/xlsx.full.min.js`), `jszip@3.10.1` (`dist/jszip.min.js`), `jspdf@2.5.2` "
        "(`dist/jspdf.umd.min.js`) e `pdfjs-dist@3.11.174` (`build/pdf.min.js` e `build/pdf.worker.min.js`). "
        "Exemplo: `npm pack jszip@3.10.1` baixa o pacote; depois extraia e copie o arquivo.",
        "Ponha em `assets/` o brasão do site (`brasao_ciaga.png`, com fundo transparente) e a marca d'água dos documentos "
        "(`marca_dagua_ciaga.png`, já clareada sobre branco, 622 × 1000 px).",
        "Escreva os arquivos na ordem deste documento: `texto.js`, `entradas.js`, `pdf.js`, `parser.js`, `report.js`, "
        "`documentos.js`, `app.js` (e `rela.js`, para a versão rela), depois `build.mjs`, `pagina.html` (e "
        "`pagina_rela.html`), `estilo.css` e `abertura.html`.",
        "Monte o HTML com `node web/build.mjs` e abra o arquivo gerado no navegador.",
        "Para conferir, escreva os testes (o `ambiente.cjs` está no fim) e rode `node --test web/testes/municiamento.test.cjs`.",
    ]
    for i, t in enumerate(passos, 1):
        h.append(Paragraph(marcar(t), S["item"], bulletText=f"{i}."))
    h.append(Paragraph("Arquivos", S["h2"]))
    tab = [[Paragraph("<b>Arquivo</b>", S["p"]), Paragraph("<b>Linhas</b>", S["p"]), Paragraph("<b>Papel</b>", S["p"])]]
    for arq in ARQUIVOS:
        n = len(open(G.RAIZ / arq["caminho"], encoding="utf-8").read().splitlines())
        tab.append([Paragraph(f"<font face='{MONO}' size='9'>{arq['caminho']}</font>", S["p"]),
                    Paragraph(str(n), S["p"]), Paragraph(marcar(arq["resumo"]), S["p"])])
    t = Table(tab, colWidths=[5.2 * cm, 1.8 * cm, 10 * cm], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, BORDA), ("BACKGROUND", (0, 0), (-1, 0), HexColor("#EEF2F7")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    h.append(t)


def gerar(saida):
    global FUNDO
    FUNDO = G.brasao_claro(0.05)
    h = []
    introducao(h)
    for n, arq in enumerate(ARQUIVOS, 1):
        linhas = open(G.RAIZ / arq["caminho"], encoding="utf-8").read().splitlines()
        conferir(arq, linhas)
        h.append(CondPageBreak(9 * cm))
        h.append(Spacer(1, 10))
        h.append(Paragraph(f"{n}. {esc(arq['titulo'])}", S["h1"]))
        h.append(Paragraph(f"<font face='{MONO}' size='9.5'>{arq['caminho']}</font> · {len(linhas)} linhas — "
                           f"{marcar(arq['resumo'])}", S["resumo"]))
        for ini, fim, texto in arq["trechos"]:
            h.append(CondPageBreak(2.2 * cm))
            h.extend(bloco(linhas, ini, fim, texto))
    doc = SimpleDocTemplate(str(saida), pagesize=G.A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2.35 * cm,
                            bottomMargin=1.8 * cm, title="Municiamento Ciaga – Código comentado", author="Municiamento Ciaga")
    doc.build(h, onFirstPage=pagina, onLaterPages=pagina)


if __name__ == "__main__":
    gerar(sys.argv[1])
