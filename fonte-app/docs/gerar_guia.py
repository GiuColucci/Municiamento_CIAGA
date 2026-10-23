"""Gera o guia de uso em PDF (para quem vai usar o sistema, sem conhecimento técnico).

    python docs/gerar_guia.py <tela1.png> <tela2.png> Guia_Conferencia_Impressa.pdf

As capturas de tela devem ser feitas com a planilha FICTÍCIA (tests/fixtures).
"""
import io
import os
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image as Figura, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

RAIZ = Path(__file__).resolve().parent.parent
MARINHO, MARINHO_MEDIO, DOURADO, TEXTO, SUAVE = (HexColor(c) for c in ("#0B1F3A", "#17345F", "#C8A24A", "#1B2433", "#4B5870"))
AVISO_FUNDO, BORDA = HexColor("#FFF4DB"), HexColor("#CBD5E3")
L, A = A4


def brasao_claro(opacidade=0.10):
    """Brasão da Marinha Mercante bem clarinho sobre o branco do papel."""
    img = Image.open(RAIZ / "assets" / "brasao_ciaga.png").convert("RGBA")  # o mesmo brasão do sistema
    alfa = img.getchannel("A").point(lambda a: round(a * opacidade))
    img.putalpha(alfa)
    fundo = Image.new("RGBA", img.size, (255, 255, 255, 255))
    buf = io.BytesIO()
    Image.alpha_composite(fundo, img).convert("RGB").save(buf, "PNG")
    buf.seek(0)
    return ImageReader(buf)


FUNDO = None


def pagina(c, doc):
    c.saveState()
    lado = 15 * cm
    c.drawImage(FUNDO, (L - lado) / 2, (A - lado) / 2 - 1 * cm, lado, lado)
    # faixa azul-marinho com filete dourado, como no sistema
    c.setFillColor(MARINHO)
    c.rect(0, A - 1.6 * cm, L, 1.6 * cm, stroke=0, fill=1)
    c.setFillColor(DOURADO)
    c.rect(0, A - 1.6 * cm - 3, L, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont(F["TNR-B"], 15)
    c.drawString(2 * cm, A - 1.05 * cm, "Conferência CIAGA")
    c.setFont(F["TNR"], 9)
    c.drawRightString(L - 2 * cm, A - 1.0 * cm, "Guia rápido de uso")
    c.setFillColor(SUAVE)
    c.setFont(F["TNR"], 8)
    c.drawString(2 * cm, 1.2 * cm, "Centro de Instrução Almirante Graça Aranha")
    c.drawRightString(L - 2 * cm, 1.2 * cm, f"página {doc.page}")
    c.restoreState()


def fonte_times():
    pasta = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    arquivos = {"TNR": "times.ttf", "TNR-B": "timesbd.ttf", "TNR-I": "timesi.ttf", "TNR-BI": "timesbi.ttf"}
    if not all((pasta / a).exists() for a in arquivos.values()):
        return {"TNR": "Times-Roman", "TNR-B": F["TNR-B"], "TNR-I": "Times-Italic", "TNR-BI": "Times-BoldItalic"}
    for nome, arq in arquivos.items():
        pdfmetrics.registerFont(TTFont(nome, str(pasta / arq)))
    pdfmetrics.registerFontFamily("TNR", normal="TNR", bold="TNR-B", italic="TNR-I", boldItalic="TNR-BI")
    return {n: n for n in arquivos}


F = fonte_times()

E = {
    "titulo": ParagraphStyle("titulo", fontName=F["TNR-B"], fontSize=26, leading=30, textColor=MARINHO, spaceAfter=6),
    "lead": ParagraphStyle("lead", fontName=F["TNR"], fontSize=12, leading=15, textColor=SUAVE, spaceAfter=8),
    "secao": ParagraphStyle("secao", fontName=F["TNR-B"], fontSize=16, leading=20, textColor=MARINHO, spaceBefore=8, spaceAfter=4),
    "texto": ParagraphStyle("texto", fontName=F["TNR"], fontSize=11, leading=14.2, textColor=TEXTO, spaceAfter=4),
    "passo": ParagraphStyle("passo", fontName=F["TNR"], fontSize=11, leading=14.2, textColor=TEXTO, leftIndent=0),
    "nota": ParagraphStyle("nota", fontName=F["TNR"], fontSize=10.5, leading=14, textColor=TEXTO),
    "legenda": ParagraphStyle("legenda", fontName=F["TNR-I"], fontSize=9.5, leading=11.5, textColor=SUAVE, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6),
    "celula": ParagraphStyle("celula", fontName=F["TNR"], fontSize=10.5, leading=13.5, textColor=TEXTO),
    "celula_b": ParagraphStyle("celula_b", fontName=F["TNR-B"], fontSize=10.5, leading=13.5, textColor=MARINHO),
    "link": ParagraphStyle("link", fontName=F["TNR-B"], fontSize=10.5, leading=15, textColor=MARINHO_MEDIO, alignment=TA_CENTER),
}


def passos(itens, largura=15.2 * cm):
    """Lista numerada com o número num círculo dourado."""
    linhas = []
    for i, txt in enumerate(itens, 1):
        num = Paragraph(f'<font color="#FFFFFF"><b>{i}</b></font>', ParagraphStyle("n", fontName=F["TNR-B"], fontSize=10, alignment=TA_CENTER, leading=12))
        linhas.append([num, Paragraph(txt, E["passo"])])
    t = Table(linhas, colWidths=[0.75 * cm, largura])
    estilo = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (1, 0), (1, -1), 8),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 2)]
    for i in range(len(linhas)):
        estilo += [("BACKGROUND", (0, i), (0, i), DOURADO), ("ROUNDEDCORNERS", [3, 3, 3, 3])]
    t.setStyle(TableStyle(estilo))
    return t


def caixa(conteudo, fundo=AVISO_FUNDO, borda=DOURADO):
    t = Table([[Paragraph(conteudo, E["nota"])]], colWidths=[16 * cm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), fundo), ("LINEBEFORE", (0, 0), (0, -1), 3, borda),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return t


def figura(caminho, legenda, largura=16 * cm):
    img = Image.open(caminho)
    alto = largura * img.height / img.width
    f = Figura(str(caminho), width=largura, height=alto)
    moldura = Table([[f]], colWidths=[largura])
    moldura.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, BORDA), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([moldura, Paragraph(legenda, E["legenda"])])


def lado_a_lado(caminho, legenda, largura, itens):
    """Captura à esquerda e passos à direita, para não sobrar espaço em branco."""
    fig = figura(caminho, legenda, largura)._content  # KeepTogether não cabe dentro de célula
    texto = passos(itens, 16 * cm - largura - 1.15 * cm)
    t = Table([[fig, texto]], colWidths=[largura, 16 * cm - largura])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (0, 0), 10), ("RIGHTPADDING", (1, 0), (1, 0), 0)]))
    return t


def gerar(tela1, tela2, saida):
    global FUNDO
    FUNDO = brasao_claro()
    doc = SimpleDocTemplate(str(saida), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2.35 * cm, bottomMargin=1.7 * cm, title="Conferência CIAGA – Guia rápido",
                            author="Municiamento Ciaga")
    h = []
    h.append(Paragraph("Guia rápido", E["titulo"]))
    h.append(Paragraph("A <b>Conferência CIAGA</b> monta as listas de conferência do municiamento a partir da planilha "
                       "da semana, em ordem alfabética, prontas para imprimir em Word (DOCX) ou PDF. Saem <b>todas</b> as "
                       "listas: os 7 dias, de sexta a quinta, as 4 refeições (café, almoço, janta e ceia) e cada ano, sempre "
                       "em duas listas, <b>municiados</b> e <b>não municiados</b>. Depois você filtra só o que vai imprimir.",
                       E["lead"]))

    h.append(Paragraph("1. Guardar o arquivo", E["secao"]))
    h.append(passos([
        "O sistema é <b>um único arquivo</b>, <b>conferencia_impressa.html</b>, que veio junto com este guia. "
        "Salve-o no computador, de preferência na <b>Área de Trabalho</b>.",
        "No WhatsApp, o arquivo chega como <b>documento</b>: toque nele e escolha salvar ou baixar.",
        "Se ele chegar compactado (<b>.zip</b>), clique com o botão direito e escolha <b>Extrair tudo</b>.",
    ]))
    h.append(Spacer(1, 4))
    h.append(caixa("<b>Quando houver versão nova</b>, você vai receber outro arquivo: apague o antigo e use só o novo."))

    h.append(Paragraph("2. Como abrir", E["secao"]))
    h.append(passos([
        "Dê <b>dois cliques</b> no arquivo. Ele abre no navegador (Microsoft Edge ou Google Chrome), com uma abertura "
        "curta de um navio mercante (para pular, clique em <b>Pular</b>). <b>Não precisa instalar nada e funciona sem internet.</b>",
        "Se abrir em outro programa (por exemplo, o Bloco de Notas), feche-o, clique no arquivo com o "
        "<b>botão direito</b> do mouse, escolha <b>Abrir com</b> e depois <b>Microsoft Edge</b>. "
        "Se perguntarem se o arquivo é confiável, pode abrir: ele não acessa a internet.",
    ]))

    h.append(Paragraph("3. Gerar as listas", E["secao"]))
    h.append(lado_a_lado(tela1, "Tela inicial (exemplo com dados fictícios)", 6.6 * cm, [
        "<b>Escolha a planilha:</b> arraste o arquivo para a área tracejada ou clique nela. "
        "Aceita <b>XLSX</b> (o melhor), <b>CSV</b> ou <b>PDF</b>. "
        "<i>Obs.: no CSV, escolha vários arquivos de uma vez (um por turma).</i>",
        "<b>Sexta-feira da planilha:</b> com <b>XLSX</b>, deixe em branco (veja o quadro abaixo). "
        "Com <b>CSV</b> ou <b>PDF</b>, informe a data da sexta-feira que abre a semana da planilha.",
        "Clique em <b>Gerar listas</b>.",
    ]))

    h.append(Spacer(1, 6))
    h.append(caixa(
        "<b>Por que pedir a data?</b> A planilha só traz o nome do dia (Sexta, Sábado, Domingo…), sem a data, e cada "
        "lista impressa leva a data no topo, por exemplo <b>Dia 23/10/2026 (Sexta-feira)</b>. Informe só a "
        "<b>sexta-feira da primeira coluna</b>, que abre a semana; o sistema calcula os outros dias. "
        "Exemplo: semana de sexta 23/10 a quinta 29/10 → <b>23/10/2026</b>.<br/>"
        "No <b>XLSX</b> a data vem preenchida sozinha (da aba QUANTITATIVO): só confira. No <b>CSV</b> e no <b>PDF</b>, "
        "se você não informar, o sistema pede na tela seguinte. Data errada? Corrija no quadro <b>Data</b> e clique em "
        "<b>Atualizar listas</b>."))

    h.append(Paragraph("4. Conferir e filtrar", E["secao"]))
    h.append(lado_a_lado(tela2, "Filtro: Sexta e Segunda, só a Janta (dados fictícios)", 7.4 * cm, [
        "No alto: quantas listas, alunos e turmas foram lidos.",
        "<b>Conferência da planilha:</b> mostra quantos alunos foram lidos em cada turma e os avisos "
        "(por exemplo, um total que não bate). Se houver aviso importante, ela já abre sozinha: leia antes de imprimir.",
        "<b>Data:</b> confira a sexta-feira (é ela que vai no topo das listas). Para mudar, corrija e clique em "
        "<b>Atualizar listas</b>.",
        "<b>Filtro:</b> em <b>Dias</b>, <b>Refeições</b> e <b>Grupos</b>, tudo vem marcado; desmarque o que não quer "
        "(dá para deixar vários marcados). Em <b>Situação</b>, escolha municiados ou não municiados. "
        "<b>Limpar</b> marca tudo de novo. Clique numa lista para ver os nomes.",
    ]))

    h.append(Paragraph("5. Baixar e imprimir", E["secao"]))
    h.append(passos([
        "Clique em <b>Baixar DOCX</b> (Word) ou <b>Baixar PDF</b>. Sai um arquivo com todas as listas, uma por página.",
        "Com um filtro (por exemplo, só a Janta de Sexta e de Segunda, ou só os municiados), aparecem botões para baixar "
        "<b>só o filtro atual</b>.",
        "Para usar outra planilha, clique em <b>Nova planilha</b>, no alto da tela.",
    ]))

    h.append(Paragraph("6. Privacidade", E["secao"]))
    h.append(Paragraph("Tudo acontece <b>no próprio computador</b>: a planilha não é enviada para lugar nenhum e nada fica "
                       "guardado no sistema. Os arquivos baixados (DOCX e PDF) <b>têm nomes de alunos</b>: apague depois de "
                       "imprimir e não deixe em pastas compartilhadas sem necessidade.", E["texto"]))

    h.append(Paragraph("7. Se algo der errado", E["secao"]))
    problemas = [
        ("“Não encontrei turmas nessa planilha”", "Confira se escolheu a planilha do municiamento da semana."),
        ("“Esse é um arquivo .xls (Excel antigo)”", "Abra no Excel e use Salvar como &gt; Pasta de Trabalho do Excel (.xlsx)."),
        ("“Planilhas com macros não são aceitas”", "No Excel, use Salvar como &gt; Pasta de Trabalho do Excel (.xlsx)."),
        ("A tela abriu cheia de texto estranho", "O arquivo abriu no programa errado: botão direito &gt; Abrir com &gt; Microsoft Edge."),
        ("Avisos de total que não bate", "São da própria planilha (soma digitada à mão). Confira a turma indicada antes de imprimir."),
    ]
    t = Table([[Paragraph("Mensagem ou situação", E["celula_b"]), Paragraph("O que fazer", E["celula_b"])]] +
              [[Paragraph(a, E["celula"]), Paragraph(b, E["celula"])] for a, b in problemas],
              colWidths=[6.4 * cm, 9.6 * cm], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, BORDA), ("BACKGROUND", (0, 0), (-1, 0), HexColor("#EEF2F7")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    h.append(t)
    # título de seção nunca fica sozinho no pé da página: vai junto com o bloco seguinte
    final, i = [], 0
    while i < len(h):
        if isinstance(h[i], Paragraph) and h[i].style.name == "secao" and i + 1 < len(h):
            final.append(KeepTogether([h[i], h[i + 1]]))
            i += 2
        else:
            final.append(h[i])
            i += 1
    doc.build(final, onFirstPage=pagina, onLaterPages=pagina)


if __name__ == "__main__":
    gerar(*sys.argv[1:4])
