"""Gera o guia de uso da versão rela (conferencia_digital.html), no mesmo estilo do guia da versão completa.

    cd docs && python gerar_guia_rela.py <envio.png> <marcar.png> <rela.png> ../Guia_Conferencia_Digital.pdf

As capturas de tela devem ser feitas com a planilha FICTÍCIA (tests/fixtures).
"""
import sys

from reportlab.lib.colors import HexColor
from reportlab.lib.units import cm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import gerar_guia as G

E, F = G.E, G.F
ARQUIVO = "conferencia_digital.html"


def pagina(c, doc):
    G.pagina(c, doc)
    # o cabeçalho do guia diz de qual versão é
    c.saveState()
    c.setFillColor(G.MARINHO)
    c.rect(0, G.A - 1.6 * cm, G.L, 1.6 * cm, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont(F["TNR-B"], 15)
    c.drawString(2 * cm, G.A - 1.05 * cm, "Conferência CIAGA")
    c.setFont(F["TNR"], 9)
    c.drawRightString(G.L - 2 * cm, G.A - 1.0 * cm, "Guia rápido de uso")
    c.restoreState()


def gerar(envio, marcar, rela, saida):
    G.FUNDO = G.brasao_claro()
    doc = SimpleDocTemplate(str(saida), pagesize=G.A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2.35 * cm, bottomMargin=1.7 * cm, title="Conferência CIAGA – Guia rápido",
                            author="Municiamento Ciaga")
    h = []
    h.append(Paragraph("Guia rápido", E["titulo"]))
    h.append(Paragraph("A <b>Conferência CIAGA</b> serve para conferir quem vem na hora da refeição: você escolhe "
                       "o dia, a refeição e o ano, marca quem veio e gera a <b>rela</b>: só quem você marcou, separado pela "
                       "planilha em <b>municiados</b> e <b>não</b> municiados, pronta para copiar ou baixar em PDF ou DOCX.", E["lead"]))

    h.append(Paragraph("1. Guardar e abrir", E["secao"]))
    h.append(G.passos([
        f"O sistema é <b>um único arquivo</b>, <b>{ARQUIVO}</b>. Salve-o no computador, de preferência na "
        "<b>Área de Trabalho</b> (no WhatsApp, ele chega como documento; se vier em .zip, use <b>Extrair tudo</b>).",
        "Dê <b>dois cliques</b> no arquivo. Ele abre no navegador (Edge ou Chrome), com uma abertura curta de um navio "
        "(para pular, clique em <b>Pular</b>). <b>Não precisa instalar nada e funciona sem internet.</b>",
        "Se abrir em outro programa, clique com o <b>botão direito</b>, escolha <b>Abrir com</b> e depois "
        "<b>Microsoft Edge</b>.",
    ]))

    h.append(Paragraph("2. Ler a planilha", E["secao"]))
    h.append(G.lado_a_lado(envio, "Tela inicial (dados fictícios)", 6.6 * cm, [
        "<b>Escolha a planilha:</b> arraste o arquivo para a área tracejada ou clique nela. Aceita <b>XLSX</b> (o "
        "melhor), <b>CSV</b> ou <b>PDF</b>. <i>Obs.: no CSV, escolha todos os arquivos de uma vez (um por turma).</i>",
        "<b>Sexta-feira da planilha</b> (opcional): com XLSX, deixe em branco, porque a data é lida sozinha. Ela só "
        "serve para a rela sair com a data do dia; sem ela, sai só o nome do dia (\"Sexta-feira\").",
        "Clique em <b>Ler planilha</b>.",
    ]))

    h.append(Paragraph("3. Montar a lista", E["secao"]))
    h.append(G.passos([
        "No cartão <b>Nova lista</b>, escolha o <b>Dia</b>, a <b>Refeição</b> e o <b>Ano</b> (1°, 2° ou 3°) e clique em "
        "<b>Criar lista</b>.",
        "A lista traz <b>todos os alunos do ano</b> (todos os cursos juntos), em ordem alfabética, com a turma e o código "
        "ao lado. Ela <b>começa desmarcada</b>: você marca quem veio.",
        "Dá para criar <b>várias listas</b> (ex.: a Janta do 3° ano e o Almoço do 1° ano). Cada uma fica numa "
        "<b>aba</b>, com as suas marcações; a aba mostra quantos foram marcados (ex.: <b>3/14</b>). O <b>×</b> fecha a aba.",
    ]))

    h.append(Paragraph("4. Marcar quem veio", E["secao"]))
    h.append(G.lado_a_lado(marcar, "Marcação com pesquisa (dados fictícios)", 7.6 * cm, [
        "<b>Turmas:</b> escolha quais turmas aparecem na lista (todas vêm marcadas). <b>Separar por turma</b> mostra "
        "cada turma no seu bloco (o botão vira <b>Juntar as turmas</b>); a lista para marcar baixada sai do mesmo jeito.",
        "Clique na caixa ao lado do nome de quem veio (clicar de novo desmarca). Se a pessoa <b>não estiver "
        "municiada</b> na planilha naquela refeição, aparece um <b>alerta em vermelho</b> e o nome fica marcado como "
        "<b>NÃO municiado</b>.",
        "<b>Pesquisar:</b> digite o <b>nome de guerra</b> ou o <b>código</b> (ex.: FERRAZ ou N3517). Quando sobrar um "
        "aluno só, aperte <b>Enter</b>: ele é marcado e a pesquisa fica limpa para o próximo. Dá para conferir a fila só "
        "digitando.",
        "<b>Ordem:</b> alfabética ou por antiguidade (ver o quadro abaixo).",
        "<b>Lista para marcar (PDF ou DOCX):</b> baixa a lista inteira com <b>[   ]</b> ao lado de cada nome, para "
        "marcar no papel.",
    ]))
    h.append(Spacer(1, 4))
    h.append(G.caixa("<b>Antiguidade</b> é lida do código do aluno (ex.: <b>M3221</b>): a letra do curso não conta; o "
                     "primeiro número maior vem antes (<b>3° ano antes do 2°, antes do 1°</b>); com o mesmo número, os três "
                     "últimos menores vêm antes (<b>001 antes de 200</b>). Se empatar, vale a ordem alfabética."))

    h.append(Paragraph("5. Finalizar e montar a rela", E["secao"]))
    h.append(G.lado_a_lado(rela, "Rela por turma, em ordem de antiguidade (dados fictícios)", 7.6 * cm, [
        "Clique em <b>Finalizar marcação</b>. A aba ganha o sinal de concluída e aparece a rela, só com quem você "
        "<b>marcou</b> (veja o quadro abaixo).",
        "<b>Agrupar:</b> o <b>ano inteiro</b> numa lista só ou <b>por turma</b>. Por turma, escolha em <b>Turmas</b> "
        "quais entram (todas vêm marcadas).",
        "<b>Mostrar:</b> todos, só os <b>municiados</b> ou só os <b>NÃO municiados</b>.",
        "<b>Separar em duas listas:</b> uma só de municiados e outra só de NÃO municiados (o botão vira <b>Juntar numa "
        "lista só</b>).",
        "<b>Voltar a marcar</b> reabre a lista sem perder nada.",
    ]))

    h.append(Spacer(1, 4))
    h.append(G.caixa("<b>Como a rela separa:</b> quem você <b>não marcou</b> não aparece. Cada aluno marcado é conferido na "
                     "planilha, naquele dia e refeição: se a planilha tem a marcação dele, vai para <b>Municiados</b>; se não "
                     "tem, vai para <b>NÃO municiados</b> (veio, mas não estava municiado)."))

    h.append(Paragraph("6. Copiar e baixar", E["secao"]))
    h.append(G.passos([
        "<b>Copiar</b> copia a rela como texto (ex.: <b>M3221 – ALVES – M36.1</b>), para colar no WhatsApp, e-mail ou "
        "Word com Ctrl+V.",
        "<b>Baixar PDF</b> ou <b>Baixar DOCX</b> gera o arquivo com todas as folhas da lista; os botões <b>PDF</b> e "
        "<b>DOCX</b> de cada folha baixam só aquela (ex.: só os municiados). Todos saem com o brasão de fundo.",
        "Com mais de uma aba aberta, <b>Rela de todas as listas</b> (à esquerda) junta tudo para copiar ou baixar.",
    ]))

    h.append(Paragraph("7. Privacidade", E["secao"]))
    h.append(Paragraph("Tudo acontece <b>no próprio computador</b>: a planilha não é enviada para lugar nenhum e nada fica "
                       "guardado. Por isso, <b>as marcações se perdem ao fechar a página</b> (o navegador avisa antes). "
                       "Baixe a rela antes de fechar. Os arquivos baixados <b>têm nomes de alunos</b>: apague depois de usar.",
                       E["texto"]))

    h.append(Paragraph("8. Se algo der errado", E["secao"]))
    problemas = [
        ("“Não encontrei turmas nessa planilha”", "Confira se escolheu a planilha do municiamento da semana."),
        ("“Esse é um arquivo .xls” ou “Planilhas com macros…”", "No Excel, use Salvar como &gt; Pasta de Trabalho do Excel (.xlsx)."),
        ("A rela saiu sem a data", "Informe a sexta-feira da planilha no cartão Data e clique em Atualizar data."),
        ("Enter não marcou ninguém", "A pesquisa achou mais de um aluno: digite mais letras ou o código."),
        ("A tela abriu cheia de texto estranho", "Botão direito no arquivo &gt; Abrir com &gt; Microsoft Edge."),
    ]
    t = Table([[Paragraph("Mensagem ou situação", E["celula_b"]), Paragraph("O que fazer", E["celula_b"])]] +
              [[Paragraph(a, E["celula"]), Paragraph(b, E["celula"])] for a, b in problemas],
              colWidths=[6.4 * cm, 9.6 * cm], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, G.BORDA), ("BACKGROUND", (0, 0), (-1, 0), HexColor("#EEF2F7")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    h.append(t)
    # título de seção nunca fica sozinho no pé da página
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
    gerar(*sys.argv[1:5])
