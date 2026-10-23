"""Explicação, trecho a trecho, de cada arquivo do sistema (usada por gerar_comentado.py).

Cada arquivo tem uma lista de (primeira linha, última linha, explicação). Linhas em branco
podem ficar de fora. Na explicação: `código` vira fonte monoespaçada e **texto** vira negrito.
Se o código mudar, o gerador confere se cada trecho ainda cobre todas as linhas com conteúdo.
"""

ARQUIVOS = []


def arquivo(caminho, titulo, resumo, trechos):
    ARQUIVOS.append({"caminho": caminho, "titulo": titulo, "resumo": resumo, "trechos": trechos})


# ====================================================================== texto.js
arquivo("web/src/texto.js", "texto.js: funções de texto e de datas",
        "Funções pequenas usadas por todos os outros arquivos. É o primeiro a ser carregado.", [
(1, 3, "Comentário do arquivo e abertura do módulo. Todo arquivo de `web/src/` tem esta forma: uma função que é "
       "executada na hora (IIFE) e recebe `M`, que é o objeto global `Municiamento`. O que for posto em `M.algo` fica "
       "visível para os outros arquivos; o resto fica escondido dentro da função. `\"use strict\"` liga o modo estrito do "
       "JavaScript, que transforma erros silenciosos (como usar uma variável não declarada) em erros de verdade."),
(5, 7, "Três expressões regulares (padrões de texto). `TURMA_RE` reconhece uma turma: uma letra B, M ou N, um espaço "
       "opcional (`\\s?`), dois dígitos, ponto e mais um dígito; os parênteses guardam cada parte para montar o código "
       "limpo depois. `CODIGO_FULL` confere se um texto é exatamente um código de aluno (`^` e `$` = do começo ao fim). "
       "`CONTROLE` acha caracteres de controle invisíveis (tabulação vertical, nulos etc.), que serão removidos dos nomes; "
       "o `g` no fim significa \"todas as ocorrências\"."),
(9, 11, "`M.codigos` devolve todos os códigos de aluno (letra + 4 dígitos) que aparecem num texto. `String(texto || \"\")` "
        "garante que funciona mesmo se vier `null`; `.match(...)` devolve a lista de achados ou `null`, e o `|| []` troca "
        "`null` por lista vazia."),
(13, 15, "`M.semAcento` tira os acentos: `normalize(\"NFD\")` separa cada letra do seu acento (á vira a + ´) e o "
         "`replace(/\\p{Mn}/gu, \"\")` apaga as marcas de acento (categoria Unicode Mn). O `u` liga o modo Unicode da "
         "expressão."),
(17, 20, "`M.normalizar` deixa um texto pronto para comparação: sem acento, em minúsculas e sem espaços nas pontas. É o "
         "que permite reconhecer `'  Segunda-Feira '` como segunda-feira."),
(22, 22, "A chave da ordem alfabética é o próprio nome normalizado: `ÂNGELO` e `angelo` ordenam juntos."),
(24, 27, "`M.comparar` compara dois textos pelo código de cada caractere, devolvendo -1, 0 ou 1, que é o formato que o "
         "`sort` do JavaScript espera. Foi escolhido em vez de `localeCompare` para dar sempre a mesma ordem, em qualquer "
         "navegador e idioma (igual à versão Python)."),
(29, 34, "`M.limpar` prepara um texto vindo da planilha: tira os caracteres de controle, troca tabulação e quebras de linha "
         "por espaço, junta espaços repetidos (`\\s{2,}`) e corta as pontas. Se `maximo` vier, corta o texto nesse tamanho."),
(36, 40, "`M.acharTurma` procura uma turma no texto com `TURMA_RE.exec`. Se achar, junta as partes guardadas sem os espaços "
         "(`m[1] + m[2] + m[3] + \".\" + m[4]`), então `'M 24.1'` vira `'M24.1'`. Se não achar, devolve `null`."),
(42, 44, "Início da parte de datas. Todas as datas circulam como texto `AAAA-MM-DD`. `doisDigitos` põe zero à esquerda "
         "(7 vira \"07\")."),
(46, 50, "`M.dataISO` monta uma data a partir de ano, mês e dia e **confere se ela existe**: cria a data em UTC (o mês do "
         "JavaScript começa em 0, por isso `mes - 1`) e verifica se ano, mês e dia continuam os mesmos. 31/02 viraria 03/03, "
         "então a conferência falha e a função devolve `null`."),
(52, 55, "`utc` converte o texto `AAAA-MM-DD` num objeto `Date` em UTC. Usar UTC evita que o fuso horário ou o horário de "
         "verão do computador mude o dia."),
(57, 60, "`M.diaDaSemana` devolve 0 para segunda até 6 para domingo, como no Python. O `getUTCDay()` do JavaScript começa "
         "no domingo (0), por isso a conta `(dia + 6) % 7`."),
(62, 62, "`M.ehSexta`: verdadeiro se a data existe e cai numa sexta (4). O `!!iso` converte para verdadeiro/falso."),
(64, 68, "`M.somarDias` soma `n` dias: muda o dia do mês (o `Date` ajusta mês e ano sozinho) e devolve de novo como texto "
         "com `toISOString().slice(0, 10)`."),
(70, 74, "`M.formatarData` mostra a data no formato brasileiro: `DD/MM/AAAA`, ou só `DD/MM` quando `curta` é verdadeiro."),
(76, 80, "`M.dataDoExcel` converte o número de série que o Excel usa para datas (dias desde 30/12/1899). Planilhas no "
         "sistema 1904 (comum em Mac) começam 1462 dias depois. 86400000 é o número de milissegundos de um dia."),
(82, 86, "`M.hojeISO` dá a data de hoje (no fuso do computador) como texto. Fecha o módulo: a última linha chama a função "
         "passando o objeto `Municiamento`, criado aqui se ainda não existir."),
])

# ====================================================================== entradas.js
arquivo("web/src/entradas.js", "entradas.js: do arquivo às grades",
        "Recebe os arquivos escolhidos (XLSX, CSV ou PDF), valida e transforma cada um em grades de células.", [
(1, 8, "Comentário que explica a ideia: qualquer formato vira uma **grade** (lista de linhas, cada linha uma lista de "
       "textos), e o resto do sistema só trabalha com grades. Abertura do módulo."),
(10, 19, "Os limites de segurança, num lugar só: 10 MB por arquivo; 80 MB descompactado para o XLSX (um XLSX é um ZIP, e "
         "um ZIP malicioso pode \"explodir\" ao abrir); no máximo 3.000 partes dentro do ZIP; 5.000 linhas de CSV; 60 colunas; "
         "40 arquivos por vez. Por aba, só 150 linhas e 30 colunas são lidas, e a leitura para depois de 15 linhas vazias "
         "seguidas. `M.LIMITES` deixa alguns visíveis para os testes."),
(21, 27, "`ArquivoInvalido` é um tipo de erro próprio. Quando algo está errado com o arquivo, o código lança esse erro com "
         "uma mensagem em português; a interface reconhece o tipo e mostra a mensagem como está. `Object.create(Error.prototype)` "
         "faz ele se comportar como um erro comum."),
(29, 37, "`Grade` guarda as linhas e de onde vieram (`origem`, usada nos avisos: \"aba B12.1\"). `turmaAba` é o nome da "
         "aba do XLSX, que vale mais que o texto da célula A1; `turmaArquivo` é a turma tirada do nome do CSV, usada só se A1 "
         "estiver vazia. `local(k)` diz como citar a linha k num aviso (\"linha 12\")."),
(39, 44, "`texto` converte o valor de uma célula em texto: vazio vira \"\", número vira texto, data vira `AAAA-MM-DD`, e "
         "texto perde os espaços das pontas."),
(46, 49, "`extensao` pega a extensão do nome do arquivo, em minúsculas (\".xlsx\"), ou \"\" se não houver."),
(51, 55, "`comeca` confere se os primeiros bytes do arquivo são iguais a uma assinatura. É assim que se descobre o tipo "
         "real do arquivo, sem confiar na extensão."),
(57, 62, "`M.detectar` (assíncrona, por isso `async`): recusa arquivo vazio e acima de 10 MB; se começar com os bytes de "
         "`%PDF-` (0x25 0x50 0x44 0x46 0x2D), é PDF."),
(63, 66, "Os bytes D0 CF 11 E0 são do formato antigo do Office (.xls): é recusado com a instrução de salvar como .xlsx."),
(67, 70, "Os bytes `PK` 03 04 indicam um ZIP. Como o XLSX é um ZIP, ele passa por `validarZip` antes de ser aceito. "
         "`await` espera a validação terminar."),
(71, 76, "Se a extensão diz PDF ou Excel mas o conteúdo não bate, o arquivo foi renomeado: é recusado. Se a extensão é de "
         "texto (ou não há) e não há bytes nulos no começo (arquivos binários costumam ter), é tratado como CSV. Qualquer "
         "outra coisa é recusada."),
(78, 84, "`validarZip` abre o ZIP com o JSZip (sem conferir CRC, para ser rápido). Se nem abrir, o arquivo está corrompido."),
(85, 92, "Lista os arquivos de dentro do ZIP. Extensão .xlsm ou um `vbaProject.bin` dentro significam **macros**: recusado. "
         "Sem `xl/workbook.xml`, não é uma planilha do Excel."),
(93, 101, "Soma o tamanho descompactado de todas as partes. Partes demais ou tamanho total grande demais = recusado "
          "(proteção contra zip bomb)."),
(103, 107, "`M.carregarGrades` recebe a lista de arquivos (`{nome, bytes}`), descarta entradas vazias e confere a quantidade."),
(108, 113, "Detecta o tipo de cada arquivo. Vários arquivos só são aceitos se forem todos CSV, porque XLSX e PDF já trazem "
           "todas as turmas."),
(114, 119, "Chama o leitor certo. No CSV, cada arquivo vira uma grade. Todos devolvem o mesmo formato: "
           "`{formato, grades, sextaSugerida, avisos}`."),
(121, 127, "`linhasDaAba` lê uma aba do XLSX célula por célula. `!ref` é o intervalo usado da aba; `decode_range(...).e.r` é a "
           "última linha. Com `bruto`, devolve as células completas (para ler datas e formatos); sem, só o texto."),
(128, 140, "Percorre as linhas até o limite e as colunas até o máximo, montando a lista. `encode_cell({r, c})` gera o endereço "
           "(\"C4\"). Conta as linhas vazias seguidas e para depois de 15 (quando já leu mais de 20): por isso nunca percorre "
           "as 1.000 linhas formatadas e vazias de algumas abas."),
(142, 150, "`lerXlsx` abre a planilha com o SheetJS: `sheetRows` limita as linhas lidas, `cellFormula: false` ignora as "
           "fórmulas (usa o valor já calculado), `cellNF: true` guarda o formato da célula (necessário para saber se um "
           "número é uma data). `date1904` diz se a planilha usa o sistema de datas de 1904."),
(151, 157, "Para cada aba: tira os espaços do nome; se o nome contiver \"quantitativo\", é a aba de resumo, usada só para "
           "achar a data da sexta (`return` pula para a próxima aba)."),
(158, 171, "Se o nome da aba é uma turma, a aba vira uma grade com `turmaAba`. Uma aba sem nada (como \"Página42\") é "
           "ignorada em silêncio. Uma aba com outro nome, mas com cabeçalho de dias e refeições, também é lida; qualquer "
           "outra vira aviso."),
(173, 189, "`sextaDoResumo` olha as células da aba QUANTITATIVO e separa três coisas: datas (células do tipo data, ou números "
           "com formato de data, convertidos com `dataDoExcel`), textos de cada coluna (normalizados) e todos os textos."),
(190, 199, "Escolhe a data: primeiro uma sexta cuja coluna tenha um rótulo começando por \"sexta\"; senão, qualquer data que "
           "caia numa sexta; senão, procura o texto `SEXTA (dd/mm)`. A exigência de cair numa sexta importa porque a "
           "primeira data da aba é uma quinta (22/10), não a sexta."),
(201, 212, "`M.sextaDoTexto` acha `sexta (23/10)` no texto. Como falta o ano, testa o ano dado ou este ano, o próximo e o "
           "anterior, fica só com os anos em que esse dia é sexta e escolhe o mais próximo de hoje."),
(214, 222, "`decodificar` transforma os bytes do CSV em texto: tenta UTF-8 em modo estrito (que também remove o BOM); se houver "
           "byte inválido, usa Windows-1252, a codificação do Excel brasileiro antigo."),
(224, 232, "`lerLinhasCsv` é um leitor de CSV escrito à mão, caractere por caractere. Variáveis: a lista de linhas, a linha "
           "atual, o campo atual, se está dentro de aspas e se está no início de um campo. `fechaCampo` e `fechaLinha` guardam "
           "o que foi lido."),
(233, 241, "Dentro de aspas, tudo vale como texto (inclusive o separador e quebras de linha). Duas aspas seguidas (`\"\"`) "
           "representam uma aspa dentro do texto; uma aspa sozinha fecha o trecho entre aspas."),
(242, 254, "Fora das aspas: aspas no início do campo abrem um trecho; o separador fecha o campo; `\\r\\n`, `\\n` ou `\\r` "
           "fecham a linha; qualquer outro caractere entra no campo. No fim, fecha a última linha se sobrou algo. A função "
           "fica visível em `M` para os testes."),
(256, 266, "`separador` descobre se o CSV usa ponto e vírgula, vírgula ou tab. Para cada um, lê as primeiras 100 linhas e anota "
           "quantas colunas cada linha teria."),
(267, 279, "Calcula a **moda** (o número de colunas mais comum) e uma nota em três critérios, nesta ordem: ter mais de uma "
           "coluna, a proporção de linhas com o número de colunas da moda, e o número de colunas. Vence o separador com a "
           "melhor nota, comparando critério por critério."),
(281, 290, "`lerCsv`: decodifica, recusa arquivo com bytes nulos ou com linhas demais, descobre o separador, lê as linhas e "
           "corta cada uma em 60 colunas, sem espaços nas pontas."),
(291, 295, "Pega o nome do arquivo sem pasta e sem extensão e procura uma turma nele (\"B12.1.csv\" → B12.1). Devolve a "
           "grade. Fecha o módulo."),
])

# ====================================================================== pdf.js
arquivo("web/src/pdf.js", "pdf.js: do PDF às grades",
        "Lê a planilha exportada em PDF reconstruindo a tabela pela posição dos textos e pelos traços desenhados.", [
(1, 11, "Comentário que explica a estratégia. O texto de um PDF não sabe o que é coluna: são pedaços de texto com posição "
        "(x, y). As colunas são reconstruídas pelos traços verticais da tabela, as linhas pelos horizontais."),
(12, 16, "Abertura do módulo, o limite de 60 páginas e os nomes das refeições na ordem das colunas."),
(18, 22, "Matemática de transformação do PDF. Cada posição desenhada passa por uma matriz 2×3 (escala, rotação, "
         "deslocamento). `mult` combina duas matrizes; `aplicar` leva um ponto (x, y) para a posição real na página."),
(24, 30, "`segmentos` vai juntar os traços retos da página. `ctm` é a matriz atual; `pilha` guarda matrizes salvas. "
         "`guardar` classifica um segmento: quase vertical (x igual, altura maior que 2) ou quase horizontal; guarda a "
         "posição e as pontas."),
(31, 35, "Percorre a lista de operações de desenho da página (`fnArray` = qual operação, `argsArray` = argumentos). "
         "`save`/`restore` empilham e desempilham a matriz; `transform` a multiplica."),
(36, 50, "`constructPath` descreve um caminho: `moveTo` (ir até), `lineTo` (linha até), `rectangle` (vira 4 lados), "
         "`closePath` (fecha voltando ao início). Curvas são puladas (não são traços de tabela). Cada ponto passa por "
         "`aplicar`. Os segmentos ficam em `caminho` até sabermos se o caminho será traçado."),
(51, 60, "Se o caminho for **traçado** (stroke e variantes), os segmentos são guardados; se for só preenchido ou descartado, "
         "são jogados fora (fundos coloridos não são linhas da tabela). Devolve as listas de verticais e horizontais."),
(62, 70, "`agrupar` junta valores próximos: ordena, e cada valor que estiver a até `tol` do anterior entra no mesmo grupo. "
         "Devolve a média de cada grupo. É o que transforma dezenas de traços em uma posição por borda de coluna."),
(72, 78, "Testes de texto: `ehDia` (começa com o nome de um dia), `ehRotuloRefeicao` (é exatamente uma refeição) e "
         "`soRefeicoes` (o texto só tem nomes de refeição, inclusive cortados como \"Almoç\", que aparecem na linha de "
         "cabeçalho)."),
(80, 89, "`linhasDeTexto` ordena os textos de cima para baixo (no PDF, y cresce para cima, por isso `b.y - a.y`) e junta "
         "na mesma linha os que estão a até 2,5 pt de altura; dentro de cada linha, ordena da esquerda para a direita."),
(91, 101, "`separar`: às vezes o pdf.js entrega o código e as marcações vizinhas num texto só (\"N3015 X\"). A expressão "
          "reconhece esse caso, estima a largura de cada caractere (largura total ÷ número de caracteres) e cria um item "
          "para o código e um para cada X, cada um na sua posição."),
(103, 108, "`coluna` diz em que coluna cai uma posição x, dadas as bordas (com uma folga de 0,3 pt). `juntar` concatena "
           "textos com espaço."),
(110, 117, "`gradeDaPagina`: monta as linhas de texto e procura a linha dos dias (com 3 ou mais nomes de dia). Sem ela, a "
           "página não tem tabela de turma."),
(118, 125, "Confere se logo abaixo há a linha das refeições (8 ou mais palavras de refeição). Isso separa a tabela de uma "
           "turma das páginas de resumo geral, que também têm dias."),
(126, 131, "Procura uma segunda linha de dias, que é o começo da tabela de totais. `yTopo` e `yFim` delimitam, na vertical, "
           "a tabela principal."),
(133, 137, "Pega só os traços verticais dentro da tabela e agrupa suas posições: são as **bordas das colunas**. Menos de 6 "
           "bordas = não dá para confiar, a página é descartada. Faz o mesmo com os traços horizontais longos, que dão as "
           "faixas (linhas da tabela), de cima para baixo."),
(139, 143, "`ncol` é o número de colunas; as marcações começam na coluna 2 (0 = Nome, 1 = Número). A primeira linha da grade "
           "recebe todo o texto acima da linha dos dias: é o título da turma."),
(145, 155, "Linha dos dias: cada nome de dia está centralizado sobre suas 4 colunas, então é posto na primeira coluna do seu "
           "grupo de 4 (conta com `Math.floor`). A linha das refeições é recriada certinha (Café, Almoço, Janta, Ceia "
           "repetidos), em vez de usar o texto do PDF, que tem erros."),
(157, 166, "Junta os textos do corpo (entre o cabeçalho e os totais), deixando de fora os pedaços da linha de refeições e "
           "os rótulos \"Nome\" e \"Número\"."),
(167, 182, "Põe cada texto na faixa (linha da tabela) em que está, olhando entre quais traços horizontais ele cai; sem "
           "traços, agrupa pela altura. Depois ordena as faixas de cima para baixo."),
(183, 202, "Monta cada linha da grade: textos só de X com mais de uma letra são separados letra por letra, cada uma na "
           "coluna do seu centro (é aqui que nenhuma marcação se perde); os outros textos vão para a coluna onde começam. "
           "Linhas vazias não entram."),
(204, 217, "Tabela de totais: a linha dos dias e, abaixo, as linhas que começam com o nome de uma refeição seguidas dos "
           "números, pela ordem em que aparecem. Se o rótulo e os números vierem em linhas separadas, são juntados."),
(219, 232, "`M.lerPdf` abre o PDF com o pdf.js em modo seguro: sem `eval`, sem fontes do sistema, sem buscar nada. "
           "`bytes.slice()` passa uma cópia, porque o pdf.js consome o buffer. PDF com mais de 60 páginas é recusado."),
(233, 252, "Para cada página: pega os textos com posição (`transform[4]` e `[5]` são x e y) e a lista de operações de "
           "desenho, e monta a grade. Página com tabela vira `Grade`; página sem tabela pode trazer a data "
           "(`SEXTA (dd/mm)`). `cleanup` libera a memória da página."),
(253, 258, "`finally` garante que o documento é destruído (memória liberada) mesmo se houver erro. Fecha o módulo."),
])

# ====================================================================== parser.js
arquivo("web/src/parser.js", "parser.js: das grades aos alunos",
        "Entende a estrutura da planilha: blocos de turma, colunas de dia e refeição, alunos, marcações e totais.", [
(1, 8, "Comentário com a estrutura de um bloco de turma e a regra mais importante: a refeição de cada coluna é decidida "
       "pela **posição** dentro do grupo de 4 colunas do dia, não pelo texto (que tem erros de digitação)."),
(10, 18, "Constantes: os 7 dias na ordem da planilha (começa na sexta), os dias úteis, as 4 refeições, os dias já "
         "normalizados para comparação, os prefixos de 3 letras de cada refeição e os rótulos exatos aceitos na tabela de "
         "totais. Algumas ficam visíveis em `M`."),
(20, 20, "`chaveMarca` monta a chave de uma marcação: \"Sexta|Café\". Cada aluno tem um objeto com 28 dessas chaves."),
(22, 27, "`dia` reconhece um dia: normaliza, exige pelo menos 5 letras e vê se o texto começa com o nome de algum dia "
         "(\"segunda-feira\" começa com \"segunda\")."),
(29, 32, "`refeicao` é tolerante: basta as 3 primeiras letras (\"jan\" de \"Jant\"). Serve só para contar a linha de "
         "refeições."),
(34, 38, "`rotuloRefeicao` é exigente: o texto precisa ser exatamente um rótulo da lista. Assim um sobrenome como "
         "\"ALMEIDA\" (que começa com \"alm\") não é confundido com Almoço na hora de achar a tabela de totais."),
(40, 42, "Auxiliares: `cel` lê uma célula sem quebrar se a linha for curta; `qtdDias` e `qtdRefeicoes` contam quantas "
         "células de uma linha são dias ou refeições."),
(44, 55, "`M.cabecalhos` acha o começo de cada bloco: uma linha com 3 ou mais dias seguida, em até 2 linhas, de uma com 8 "
         "ou mais refeições. Devolve os pares [linha dos dias, linha das refeições]."),
(57, 65, "`mapaColunas` cria o mapa coluna → [dia, refeição]: cada célula de dia abre um grupo; as 4 colunas a partir dela "
         "recebem Café, Almoço, Janta e Ceia, pela distância até o início do grupo. Funciona com 29, 30, 31 ou 32 colunas."),
(67, 73, "`turmaNaLinha` procura um código de turma nas 3 primeiras células (a planilha real já trouxe a turma na segunda "
         "coluna)."),
(75, 80, "`numero` aceita só números inteiros e não negativos escritos como texto (aceita vírgula decimal e notação "
         "científica, mas devolve `null` se não for inteiro)."),
(82, 87, "`lerTotais` recebe a linha k, que tem os dias da tabela de totais, e anota em que coluna está cada dia."),
(88, 103, "Nas linhas seguintes (até 8), procura o rótulo da refeição nas duas primeiras células; uma linha com conteúdo sem "
          "rótulo encerra a tabela. Para cada dia, lê o número embaixo dele (ou na coluna ao lado, se a célula estiver "
          "deslocada) e guarda em `totais` com a chave \"Dia|Refeição\"."),
(105, 109, "`codigo` devolve [nome, código, observação]. Caso simples: a célula do código, sem espaços, já é um código válido."),
(110, 114, "Célula do código vazia: procura o código dentro do nome (\"FULANO N2005\"); se achar um só, tira do nome."),
(115, 123, "Célula com texto embaralhado (nome longo que invadiu a célula): procura um código dentro dela; se não houver, "
           "mas houver exatamente 4 dígitos, monta o código com a letra do curso da turma. Nos dois casos devolve uma "
           "observação, que vira aviso para conferência."),
(125, 128, "`repr` põe um texto entre aspas para aparecer nos avisos, imitando o Python (para os avisos serem idênticos aos da "
           "versão de referência)."),
(130, 136, "`proximaTurma`: se o nome de uma turma estiver ilegível, supõe a seguinte da sequência (N24.3 → N24.4). Sem "
           "turma anterior, usa \"?n\"."),
(138, 144, "`Resultado` guarda alunos, avisos e turmas lidas. `avisar` acrescenta um aviso; `grave` marca os importantes "
           "(aparecem primeiro e abrem a conferência sozinha)."),
(146, 159, "`M.parseGrade` percorre as grades e os blocos de cada uma. Para cada bloco, calcula onde ele termina (no próximo "
           "bloco ou no fim) e procura a turma nas linhas logo acima dos dias, sem invadir o bloco anterior."),
(160, 174, "Decide a turma, avisa se a mesma turma aparece duas vezes (mesmo arquivo escolhido duas vezes?), lê os alunos do "
           "bloco e guarda a contagem da turma. No fim, procura códigos repetidos."),
(176, 188, "`escolherTurma`, em ordem de confiança: nome da aba do XLSX (avisa se a célula A1 disser outra coisa); turma "
           "escrita no cabeçalho; nome do arquivo CSV; e, por último, a próxima da sequência, com aviso grave."),
(190, 197, "`lerBloco` cria o mapa de colunas e avisa (grave) se faltar algum dia no cabeçalho, porque as listas desse dia "
           "ficariam erradas para a turma."),
(198, 204, "Percorre as linhas depois das refeições. Para quando encontra: a linha de dias da tabela de totais (e lê os "
           "totais), um rótulo de refeição sem código de aluno junto, ou o cabeçalho de outra turma."),
(205, 213, "Lê nome (coluna 0) e código (coluna 1), limpos, e o texto de cada coluna de marcação. Linha sem nome e sem código "
           "é pulada (com aviso se tiver marcações)."),
(214, 229, "Interpreta o código com `codigo()`. Sem código válido e sem marcações: linha ignorada. Sem código mas com "
           "marcações: entra assim mesmo, com aviso. Código de outro curso (N numa turma B): aviso. Sem nome: usa o código "
           "como nome, com aviso."),
(230, 241, "Monta as 28 marcações, todas falsas, e liga as das células com texto. Qualquer texto conta como marcação; se não "
           "for \"x\", gera aviso (\"valor inesperado\"). Guarda o aluno."),
(242, 245, "Turma sem nenhum aluno gera aviso grave. Confere com os totais e devolve os alunos."),
(247, 264, "`conferir` compara, para cada dia e refeição que vira lista (a ceia em todas, menos na padrão), quantas marcações "
           "foram contadas com o total que a planilha informa. Diferença vira aviso com o sinal (+1, -2), nunca bloqueio."),
(266, 280, "`duplicados` agrupa os alunos por código; códigos com mais de um aluno viram aviso, e os dois são mantidos. "
           "Fecha o módulo."),
])

# ====================================================================== report.js
arquivo("web/src/report.js", "report.js: as listas (regra de negócio)",
        "Decide quais listas existem e quem entra em cada uma; na versão rela, monta a lista do ano e o texto da rela.", [
(1, 11, "Comentário com as duas regras (padrão e completa) e a conta de quantas listas cada uma gera. Abertura do módulo."),
(12, 20, "Tabelas de apoio: quantos dias depois da sexta é cada dia, o nome por extenso, os dias do fim de semana, as "
         "refeições de cada regra, o rótulo impresso de cada refeição (\"Café da manhã\"), o nome dos cursos e a ordem fixa "
         "dos grupos."),
(21, 29, "`M.REFEICOES` é um *getter*: cada vez que é lido, olha a regra atual e devolve as refeições certas (por isso os "
         "testes podem trocar a regra). `M.REGRA` fica \"padrao\" se o build não tiver definido outra. `DIAS_LISTA` é a ordem "
         "da planilha."),
(30, 34, "`ordemAlfabetica` é a regra de ordenação de todas as listas: nome sem acento e, no empate, o código. Fica numa "
         "função só para as listas impressas e as da rela usarem exatamente a mesma ordem."),
(35, 37, "`grupoDe` pega as duas primeiras letras da turma (N24.1 → N2). `rotuloGrupo` escreve \"2° Ano – Náutica\"."),
(38, 52, "`Lista` é o molde de uma lista: data, dia, refeição, grupo, se é de municiados, os alunos (nome, turma, código) e o "
         "total do grupo, mais os rótulos prontos para imprimir."),
(53, 58, "`datasDaSemana` calcula a data de cada dia somando os dias à sexta."),
(59, 64, "`situacoes` decide quais listas saem para um dia e uma refeição. Na completa: as duas (municiados e NÃO). Na "
         "padrão: só uma; municiados se for café ou fim de semana, NÃO municiados nos outros casos."),
(65, 75, "`montarListas`: filtra os dias pedidos (sem pedido, todos), calcula as datas, separa os alunos por grupo e põe os "
         "grupos na ordem fixa; um grupo inesperado vai para o fim em vez de sumir."),
(76, 91, "Quatro laços aninhados: dia → refeição → grupo → situação. Para cada combinação, seleciona os alunos cuja marcação "
         "(`!!` converte para verdadeiro/falso) bate com a situação, ordena com `ordemAlfabetica` e cria a lista."),
(92, 96, "`casa` testa um critério de filtro: se for uma lista, o valor precisa estar nela; se for texto, precisa ser igual; "
         "vazio aceita tudo."),
(97, 104, "`M.filtrar` mantém as listas que passam em todos os critérios (dia, refeição, grupo e situação)."),
(105, 109, "Início da parte da **versão rela**: uma lista por ano escolar (todos os cursos juntos), para marcar quem veio. "
           "Na rela entra só quem foi marcado, separado pela planilha em municiado (a planilha tem a marcação daquele dia e "
           "refeição) ou NÃO municiado."),
(110, 112, "`anoDe` pega o ano escolar, o segundo caractere da turma (M36.1 → \"3\"). `rotuloAno` escreve \"3° Ano\"."),
(113, 119, "`anosPresentes` junta os anos que aparecem nas turmas lidas (um objeto usado como conjunto) e devolve em ordem."),
(120, 124, "`alunosDoAno` pega todos os alunos daquele ano, de Máquinas, Náutica e Básico juntos, em ordem alfabética."),
(125, 127, "`chaveAluno` identifica um aluno juntando turma, código e nome. O código sozinho não basta: a planilha real tem "
           "códigos repetidos em turmas diferentes, e as marcações de um não podem valer para o outro."),
(128, 134, "`tituloRela` escreve \"Sexta-feira, 23/10/2026 · Janta · 3° Ano\". A data só entra se a sexta for conhecida."),
(135, 136, "`linhaRela` é uma linha da rela: código (o número interno), nome e turma, separados por travessão."),
(137, 144, "`ordemAntiguidade` compara dois alunos pela antiguidade, lida do código CXNNN (ex.: M3221): a letra do curso não "
           "conta; o dígito X maior vem primeiro (3, depois 2, depois 1); com o mesmo X, o NNN menor vem primeiro (001 antes "
           "de 200). Sem código válido vai para o fim; empate fica pela ordem alfabética."),
(145, 149, "`ordenarAlunos` devolve uma cópia da lista na ordem escolhida."),
(150, 156, "`turmasDaLista` junta as turmas dos alunos da lista, em ordem (para a escolha de turmas)."),
(157, 170, "`relaEstruturada` monta a rela como dados, para a tela, a cópia e os arquivos usarem a mesma coisa. Com turmas "
           "escolhidas, só os alunos delas entram e o título ganha \"· Turmas M36.1, N36.1\"."),
(171, 175, "A regra da rela: percorre os alunos na ordem escolhida e pega **só os marcados** (os que vieram). Cada um é "
           "conferido na planilha, na marcação daquele dia e refeição (`chaveMarca`): com a marcação, vai para municiados; "
           "sem, para NÃO municiados."),
(176, 184, "`secao` monta uma seção: sem agrupamento, um grupo só; por turma, um grupo para cada turma, em ordem."),
(185, 194, "Com **Mostrar** só municiados ou só NÃO municiados, sai uma folha só, com aquela seção. Senão: juntas, uma folha com "
           "as duas seções; separadas, uma folha para cada seção, com a situação no título."),
(195, 208, "`textoFolha` escreve uma folha em texto: \"Conferência – \" e o título, cada seção com a contagem, a linha \"Turma X (n)\" antes de "
           "cada grupo e as linhas código – nome – turma."),
(209, 213, "`textoRela` junta as folhas em um texto só, separadas por duas linhas em branco. Fecha o módulo."),
])

# ====================================================================== documentos.js
arquivo("web/src/documentos.js", "documentos.js: DOCX e PDF",
        "Pagina e desenha os documentos com as mesmas medidas nos dois formatos, para saírem idênticos: as listas das "
        "versões oficial e completa e, na versão rela, a lista para marcar e a rela.", [
(1, 9, "Comentário com a ideia central: a paginação é decidida aqui, e o DOCX usa alturas exatas e quebras explícitas para "
       "o Word não repaginar. Abertura do módulo."),
(10, 17, "Medidas em pontos (1 pt = 1/72 de polegada). A4 = 595,28 × 841,89 pt. Margens: 48 pt nas laterais e 18 pt em cima "
         "e embaixo. Cada coluna da tabela tem metade da largura útil; linhas de 15 pt; a marca d'água tem 470 pt de altura "
         "e a largura na proporção da imagem (622 × 1000). A caixa de marcar é o texto `[   ]`; a fonte dos nomes vai de 11 "
         "a 8,5 pt."),
(18, 20, "Quantas linhas cabem por coluna nas listas: 46 na primeira página (que tem o cabeçalho completo) e 50 nas de "
         "continuação, com folga para o Word não empurrar a última linha para outra página."),
(21, 28, "Cada bloco de texto é [tamanho da fonte, altura exata da linha, espaço depois]: título, linhas de informação, tipo "
         "(Municiados), cabeçalho da continuação e total. `M.MEDIDAS` fica visível para os testes."),
(29, 49, "`M.paginar` corta cada lista em páginas: numera os alunos, pega até 2 × capacidade por página e divide ao meio "
         "(metade na coluna da esquerda, metade na da direita: preenchimento **em colunas**). Cada lista começa em página nova."),
(50, 52, "Textos prontos: \"Dia 23/10/2026 (Sexta-feira)\" e \"Total: 33 alunos\"."),
(53, 61, "`M.nomeArquivo` monta o nome do arquivo baixado (começa pelo título da versão, ex.: `conferencia_`) com o filtro (dia, refeição, grupo e situação), sem acento, em "
         "minúsculas e sem espaços."),
(62, 72, "`largura` mede quanto um texto ocupa em Times, usando o jsPDF (criado uma vez só). É a mesma medida para os dois "
         "formatos."),
(73, 82, "`M.ajustarRotulo` garante que o rótulo caiba numa linha da célula (ao lado da caixa, ou sem ela com `semCaixa`): "
         "diminui a fonte de meio em meio ponto até 8,5 e, se ainda não couber, corta o fim e põe reticências."),
(83, 84, "`M.rotuloItem` escreve \"12. NOME - B12.1\" (listas das outras versões)."),
(85, 94, "Início do DOCX. Um DOCX é um ZIP com arquivos XML no formato OOXML. Estes são os *namespaces* que o Word exige, o "
         "cabeçalho XML e a unidade EMU (12.700 por ponto) usada para imagens."),
(95, 99, "`esc` troca &, <, > e aspas pelos códigos do XML, para nenhum nome quebrar o arquivo. `tw` converte pontos em "
         "*twips* (vigésimos de ponto), a unidade do Word."),
(100, 107, "`run` gera um trecho de texto (`w:r`) com negrito, tamanho (em meios pontos) e sublinhado; com `tab`, antes do "
          "texto vai uma tabulação."),
(108, 114, "`par` gera um parágrafo com quebra de página opcional, tabulações, espaçamento **exato** (a linha tem sempre a "
           "mesma altura), espaço antes/depois e alinhamento."),
(115, 119, "`tipoRuns` escreve \"Municiados\" ou \"NÃO Municiados\" com o NÃO em negrito e sublinhado."),
(120, 127, "`imagem` gera o XML de uma imagem: qual arquivo (`r:embed`), o tamanho em EMU e a forma retangular."),
(128, 133, "`tabela` (listas das outras versões) transforma os itens da página em rótulos e chama `tabelaRotulos`, sempre "
           "com a caixa."),
(134, 147, "`tabelaRotulos`, parte 1: propriedades da tabela: largura total, recuo (o Word 2010 desloca a tabela pelo "
           "preenchimento da célula; o recuo compensa), bordas cinza de 0,5 pt em volta e por dentro só nas listas para marcar (com a caixa); nas outras, sem linhas (`nil`), layout fixo, margens das "
           "células e as duas colunas."),
(148, 166, "Parte 2: uma tabulação à direita (onde vai a caixa). Cada linha tem altura exata e não pode se partir entre "
           "páginas; cada célula recebe o rótulo ajustado e, se houver caixa, a tabulação e `[   ]`. Células vazias recebem um "
           "parágrafo vazio."),
(167, 187, "`documentoXml` monta o corpo das listas: na primeira página de cada lista, o título (com quebra de página antes, "
           "a partir da segunda lista) e as linhas de informação; na continuação, o título curto; depois a tabela (ou "
           "\"Nenhum aluno nesta lista.\") e, na última página, o total."),
(188, 196, "`corpoDocumento` fecha o documento com a seção: o cabeçalho que tem a marca d'água, o tamanho da página e as "
           "margens. É usado pelas listas e pela rela."),
(197, 211, "`cabecalhoXml`: o cabeçalho da seção contém só a marca d'água, ancorada **atrás do texto** (`behindDoc=\"1\"`), "
           "centralizada e sem empurrar o texto. Como o cabeçalho se repete, a marca aparece em todas as páginas."),
(212, 220, "`ESTILOS`: fonte padrão Times New Roman 12 pt, português do Brasil, e o estilo padrão de tabela."),
(221, 223, "`CONFIG`: tabulação padrão e modo de compatibilidade 14 (Word 2010), para qualquer Word desenhar igual."),
(224, 233, "`TIPOS` (`[Content_Types].xml`): diz ao Word o tipo de cada parte do pacote."),
(234, 240, "`rels` gera um arquivo de relações (quem aponta para quem dentro do pacote)."),
(241, 243, "`M.gerarDocx` (listas): pagina, monta o documento e empacota."),
(244, 268, "`pacoteDocx` cria o ZIP com tipos, relações, propriedades (título e autor), o documento recebido, estilos, "
           "configurações, cabeçalho e a imagem da marca d'água (vinda em base64). Compacta e devolve os bytes."),
(269, 276, "Início do PDF. `linhaDeBase` calcula onde fica a linha de base do texto numa linha de altura fixa, como o Word faz "
           "(0,891 e 0,216 são a altura acima e abaixo da linha de base da Times, em proporção da fonte)."),
(277, 288, "`novoPdf` cria o documento jsPDF em pontos, A4, com compressão. `marcaPdf` desenha a marca d'água centralizada; "
           "como é desenhada primeiro, fica atrás do resto."),
(289, 299, "`textoPdf` escreve um bloco de texto à esquerda, centralizado ou à direita e devolve onde começa o próximo."),
(300, 324, "`tabelaPdf` desenha a tabela: a grade cinza de 0,5 pt só nas listas para marcar (com a caixa); em cada célula, o "
           "rótulo ajustado e, se houver, a caixa à direita; a grade cinza só aparece nas listas para marcar. Devolve onde a tabela termina."),
(325, 346, "`M.gerarPdf` (listas): `texto` usa `textoPdf`; `tipo` escreve \"Municiados\" ou \"NÃO Municiados\" com um traço "
           "embaixo do NÃO desenhado à mão (o jsPDF não sublinha)."),
(347, 374, "Para cada página: nova página, a marca d'água, o cabeçalho completo ou o de continuação, a tabela (com "
           "`tabelaPdf`) e, na última página da lista, o total. Devolve os bytes."),
(375, 384, "Parte da **rela**. Cada folha começa numa página nova; títulos, seções e turmas têm tamanhos próprios "
           "([fonte, altura, espaço depois]) e espaço antes. `ALTURA_UTIL` é a altura da área de texto com uma folga, para o "
           "Word não empurrar a última linha."),
(385, 394, "`M.paginarRela` transforma as folhas em páginas, cada uma com uma lista de elementos (texto ou tabela). `texto` "
           "acrescenta um bloco e desconta a altura (sem espaço antes no topo da página)."),
(395, 407, "`nova` abre uma página: na primeira da folha, \"Conferência\", o título e a situação; nas seguintes, "
           "\"Conferência (continuação)\" e uma linha com o título e a situação."),
(408, 422, "`reservar` garante espaço para um título e pelo menos uma linha de nomes (senão, página nova). Para cada seção: "
           "o título da seção (quando a folha tem duas) e, sem alunos, \"Nenhum aluno.\"."),
(423, 428, "Para cada grupo: os rótulos numerados (\"1. M3001 – NOME – M36.1\") e, no agrupamento por turma, o título "
           "da turma com a contagem."),
(429, 448, "Distribui os nomes: quantas linhas ainda cabem; põe até o dobro (2 colunas) numa tabela, preenchida em colunas; "
           "se sobrar, o resto vai para a página seguinte, que começa com \"Turma X (continuação)\". Devolve as páginas."),
(449, 462, "`M.gerarRelaDocx`: percorre as páginas; texto vira parágrafo (com quebra de página no primeiro de cada página), "
           "tabela vira `tabelaRotulos` (com caixa só na lista para marcar). No fim, um parágrafo mínimo, porque o Word "
           "exige um parágrafo depois da última tabela. Empacota com `pacoteDocx`."),
(463, 477, "`M.gerarRelaPdf`: as mesmas páginas, desenhadas com `marcaPdf`, `textoPdf` e `tabelaPdf`. Fecha o módulo."),
])

# ====================================================================== app.js
arquivo("web/src/app.js", "app.js: a interface",
        "Liga a página às funções dos outros módulos: telas, botões, filtros e downloads.", [
(1, 6, "Abertura do módulo. `$` é um atalho para pegar um elemento pelo `id`. `estado` guarda tudo da planilha atual "
       "(leitura, resultado, data, dias e listas); quando vale `null`, não há dados na página."),
(8, 15, "Auxiliares: `el` cria um elemento com classe e texto (sempre `textContent`, nunca HTML, para um nome não virar "
        "código); `mostrar` liga/desliga a classe `oculto`; `plural` escreve \"1 lista\" ou \"2 listas\"."),
(17, 22, "`erro` mostra (ou esconde) a mensagem de erro e rola a tela até ela."),
(24, 37, "`caixas` cria caixas de seleção (checkbox) dentro de um `label` cada; aceita valores simples ou pares [valor, "
         "rótulo]. `caixasDias` usa os 7 dias."),
(38, 41, "`diasMarcados` devolve os valores das caixas marcadas (ou das desmarcadas, com o segundo argumento)."),
(43, 48, "`ocupado` troca o texto do botão (\"Gerando…\") e o desativa enquanto trabalha. `deixarPintar` espera 30 ms para "
         "o navegador mostrar essa mudança antes do trabalho pesado começar."),
(50, 60, "`mostrarArquivos` escreve na área de envio o nome e o tamanho (KB ou MB) dos arquivos escolhidos."),
(62, 70, "`gerar` (ao enviar o formulário): `preventDefault` impede o navegador de recarregar a página; confere se há "
         "arquivo e dias marcados e põe o botão em \"Lendo a planilha…\"."),
(71, 81, "Lê cada arquivo inteiro na memória (`arrayBuffer`), carrega as grades e faz o parse. Sem turmas ou sem alunos, "
         "mostra a mensagem de arquivo não entendido. Os avisos da leitura entram junto com os do parse."),
(82, 93, "A data: se a informada não for sexta, é descartada com aviso grave; se for diferente da que a planilha indica, "
         "aviso. Vale a informada ou, se não houver, a da planilha. Cria o `estado`, monta as listas e vai para a tela 2."),
(94, 100, "Erros de arquivo mostram a mensagem própria; qualquer outro erro mostra uma mensagem genérica (e o detalhe vai "
          "para o console). `finally` devolve o botão ao normal."),
(102, 104, "`recalcular` monta as listas, se houver data."),
(106, 117, "`novaPlanilha` apaga o estado (os dados saem da memória), limpa o formulário e volta para a tela 1."),
(119, 129, "`telaResultado` troca as telas, limpa os filtros e desenha o resultado."),
(131, 146, "`desenharResultado`, parte 1: título, formato lido e resumo (listas · alunos · turmas · avisos); aviso de PDF; "
           "o que aparece com ou sem data; o campo de data e o botão Atualizar."),
(148, 155, "A grade de turmas com a contagem de alunos de cada uma."),
(157, 167, "Os avisos: conta os graves, escreve o resumo da conferência, lista os avisos com os graves primeiro e abre a "
           "conferência sozinha se houver aviso grave."),
(169, 171, "Preenche os filtros e desenha as listas."),
(173, 178, "`opcoes` refaz as opções de um menu (`select`), mantendo a primeira (\"Todos\") e a escolha atual se ela ainda "
           "existir."),
(180, 182, "`VARIOS` é verdadeiro na versão completa: os filtros viram caixas e os 7 dias sempre são gerados."),
(184, 190, "`opcoesVarias` recria as caixas de um filtro; as que o usuário tinha desmarcado continuam desmarcadas."),
(192, 196, "`escolhidos`: todas marcadas = sem filtro (`null`); senão, a lista das marcadas (pode ser vazia)."),
(198, 201, "`limparFiltros` volta os menus para \"Todos\" e marca todas as caixas."),
(203, 217, "`preencherFiltros` monta as opções de dia, refeição e grupo (só os grupos que existem nas listas), como menus ou "
           "como caixas, conforme a versão."),
(219, 224, "`filtroAtual` lê o filtro da tela no formato que `M.filtrar` entende."),
(226, 239, "`desenharListas`, parte 1: aplica o filtro, escreve a contagem (ou o aviso de que nada está marcado), mostra os "
           "botões \"só o filtro atual\" quando há filtro e ajusta o texto e o estilo dos botões de baixar."),
(241, 254, "Para cada lista, cria um `details` (bloco que abre e fecha) com o título \"23/10 · Café · 1° Ano – Básico · "
           "Municiados\" e a quantidade."),
(255, 269, "Os nomes só são criados na primeira vez que a lista é aberta (`dataset.pronta` marca isso): com 280 listas, "
           "criar tudo de uma vez deixaria a tela lenta."),
(271, 281, "`ajustar` (botão Atualizar listas): confere se a data é sexta e se há dias, guarda e refaz as listas."),
(283, 290, "`baixar`: descobre o formato e se é \"só o filtro\" pelos atributos `data-` do botão, filtra as listas e põe o "
           "botão em \"Gerando…\"."),
(291, 301, "Gera os bytes, embrulha num `Blob` com o tipo certo, cria um endereço temporário na memória "
           "(`createObjectURL`), cria um link com o nome do arquivo, clica nele e o remove. Depois de 1 minuto o endereço é "
           "liberado."),
(302, 308, "Erro ao gerar mostra mensagem; o botão volta ao normal."),
(310, 322, "`tema`: o botão claro/escuro troca `data-tema` no `<html>` (o CSS faz o resto), guarda a escolha no "
           "`localStorage` (dentro de `try`, porque o navegador pode bloquear) e atualiza `aria-pressed` para leitores de tela."),
(324, 335, "`M.iniciar`, chamado no fim do HTML: liga o tema, cria as caixas de dias e os eventos: escolher arquivo, tocar "
           "no ícone de informação (no celular não há \"passar o mouse\"), arrastar sobre a área de envio."),
(336, 341, "Liga os formulários, o botão Nova planilha e os filtros (nas caixas, o evento `change` sobe da caixa até o "
           "grupo, então um ouvinte por grupo basta)."),
(342, 353, "Mostra ou esconde as partes de cada versão: escolha de dias, menus ou caixas de filtro e o quadro de regras."),
(354, 362, "Impede o formulário de filtros de recarregar a página, liga o Limpar e os botões de baixar. Fecha o módulo."),
])

# ====================================================================== rela.js
arquivo("web/src/rela.js", "rela.js: a interface da versão rela",
        "Substitui o `app.js` na versão rela: listas por dia, refeição e ano em abas, marcação com pesquisa, impressão da "
        "lista, finalização e a rela (ordem, agrupamento e separação).", [
(1, 7, "Comentário com o fluxo da versão e abertura do módulo."),
(8, 12, "`$` pega um elemento pelo `id`. `estado` guarda a leitura, o resultado, a data, as listas abertas, a aba ativa e "
        "se a rela de todas está aberta. Cada lista tem dia, refeição, ano, alunos, o conjunto `marcados`, se foi "
        "finalizada e as opções da rela (critério, agrupamento, separação). `proximoId` numera as listas."),
(13, 41, "Auxiliares: criar elemento com texto puro, criar botão com a ação, mostrar/esconder, plural, mensagem de erro, "
         "botão ocupado e a pausa para a tela se atualizar."),
(42, 53, "`temMarcacoes` diz se alguma lista tem alguém marcado (para pedir confirmação antes de perder o trabalho); "
         "`listaAtiva` devolve a lista da aba selecionada; `opcoesDe` junta as opções da rela de uma lista. A escolha de "
         "turmas só é enviada no agrupamento por turma."),
(54, 65, "Tela 1: `mostrarArquivos` escreve o nome e o tamanho dos arquivos escolhidos."),
(66, 83, "`ler`: lê os arquivos na memória, carrega as grades e faz o parse. Sem turmas, mostra a mensagem de arquivo "
         "não entendido."),
(84, 103, "A data é opcional: se a informada não for sexta, é descartada com aviso; se divergir da planilha, aviso. Cria o "
         "`estado` sem nenhuma lista e vai para a tela 2."),
(104, 116, "`novaPlanilha`: se houver marcações, pede confirmação; depois apaga o estado e volta para a tela 1."),
(117, 123, "Tela 2: `opcoes` preenche um menu com pares [valor, rótulo]."),
(124, 138, "`preencherConfig` monta os menus de Nova lista: os 7 dias (com a data, se conhecida), as 4 refeições e os anos que "
           "existem na planilha, com a quantidade de alunos de cada um."),
(139, 158, "`telaListas` mostra a tela 2: resumo, aviso de PDF, menus, data, conferência e as abas."),
(159, 164, "`desenharData` mostra a data e se ela foi lida da planilha ou está faltando."),
(165, 187, "`desenharConferencia`: alunos lidos por turma e os avisos, como na outra versão."),
(188, 200, "`criarLista` (botão Criar lista): pega todos os alunos do ano, começa sem ninguém marcado, ainda não "
           "finalizada, em ordem alfabética, sem agrupar, sem separar e com todas as turmas; abre a aba e põe o cursor na pesquisa."),
(201, 204, "`rotuloAba` escreve \"Sexta · Janta · 3° Ano\"."),
(205, 234, "`desenharAbas` refaz a barra de abas: nome, contagem marcados/total (com ✓ quando finalizada) e o botão × de "
           "fechar. `role=\"tab\"` e `aria-selected` fazem os leitores de tela entenderem as abas. Depois desenha o painel "
           "da aba ativa e atualiza a rela de todas, se estiver aberta."),
(235, 246, "`fecharLista`: pede confirmação se houver marcações, tira a lista e ativa a vizinha."),
(247, 256, "`atualizarContagens` mostra quantos foram marcados (\"7 marcados de 14 alunos\") e muda só os números (na aba e no painel), sem redesenhar a lista: assim a pesquisa e a "
           "rolagem não se perdem a cada marcação."),
(257, 274, "`escolha` cria um grupo de opções exclusivas (botões de rádio) com o visual de pílulas; ao trocar, chama "
           "`aoMudar` com o valor escolhido. É usado para Ordem e Agrupar."),
(275, 289, "`desenharPainel`: título, contagem e a escolha da **Ordem** (alfabética ou antiguidade), que vale nas duas fases. "
           "Depois mostra a fase de marcação ou, se a lista foi finalizada, o resultado."),
(290, 296, "Fase 1, marcar quem veio. Começa pelo **filtro de turmas** (a mesma escolha de caixas da rela, mas guardada em "
           "`turmasMarcacao`): a lista mostra só as turmas marcadas. Guarda a chave da refeição (\"Sexta|Janta\") e o "
           "texto \"Janta de Sexta\", usados no alerta."),
(297, 306, "O **alerta**: um aviso em vermelho (`role=\"alert\"`, que o leitor de tela anuncia). `avisar` escreve "
           "\"Atenção: NOME (TURMA) NÃO está municiado na Janta de Sexta.\" e reinicia a animação de piscar a cada vez."),
(307, 321, "O campo de pesquisa, o alerta logo abaixo e a linha de situação da pesquisa."),
(323, 332, "Botões: **Separar por turma** / **Juntar as turmas** (alterna e redesenha) e **Finalizar marcação**."),
(333, 344, "**Lista para marcar (PDF / DOCX)**: só as turmas do filtro, na ordem escolhida e, se a marcação estiver "
           "separada, dividida por turma; baixa com `[   ]` ao lado de cada nome."),
(345, 351, "**Desmarcar todos** (pede confirmação)."),
(353, 358, "`gruposDaMarcacao`: sem separação, um grupo só; separada, um grupo por turma, com as turmas em ordem."),
(359, 369, "Monta a lista: um bloco por grupo (com o título \"Turma X · n alunos\" quando separada), cada um com sua lista "
           "numerada. Guarda os blocos e os itens para o filtro."),
(371, 393, "`criarItem`: a caixa, o nome, a turma, o código e a etiqueta \"NÃO municiado\" (só aparece quando a linha "
           "ganha a classe `nao-municiado`). `municiado` vem da planilha, na marcação daquele dia e refeição. Ao marcar alguém "
           "que não estava municiado, a linha fica vermelha e o alerta aparece; ao desmarcar, volta ao normal."),
(395, 410, "`filtrar` mostra só quem está nas turmas do filtro e contém o texto pesquisado (nome de guerra ou código); "
           "uma turma sem ninguém visível some inteira, com o título. É chamado logo ao desenhar, para aplicar o filtro."),
(411, 429, "Enter na pesquisa: se só um aluno aparece, ele é marcado, a pesquisa é limpa e a situação mostra quem foi "
           "marcado; se ele não estava municiado, aparece também o alerta."),
(431, 439, "Fase 2, a rela: acrescenta as escolhas **Agrupar** (ano inteiro ou por turma) e **Mostrar** (todos, só "
           "municiados ou só NÃO municiados) ao lado da Ordem e, no agrupamento por turma, a escolha das **Turmas** da rela."),
(441, 456, "Botões: **Separar em duas listas** / **Juntar numa lista só** (só aparece mostrando todos), **Baixar PDF** e "
           "**Baixar DOCX** (todas as folhas da lista) e **Voltar a marcar**, que reabre a marcação sem perder nada."),
(458, 463, "Monta as folhas com `relaEstruturada` e mostra cada uma, uma embaixo da outra, com o nome de arquivo de cada folha."),
(465, 492, "`escolhaTurmas(l, campo)`: uma caixa para cada turma da lista. Serve a dois filtros: o da marcação "
           "(`turmasMarcacao`) e o do agrupamento por turma da rela (`turmas`). Sem escolha, todas; ao mudar, guarda as "
           "marcadas (todas marcadas volta a ser \"sem filtro\") e redesenha. Atalhos Marcar todas e Desmarcar todas; sem "
           "nenhuma marcada, aparece um aviso."),
(494, 542, "`rotuloSituacao` escreve \"Municiados\" ou \"NÃO municiados\". `folhaNaTela` mostra uma folha com cara de "
           "documento: cabeçalho com o nome, a contagem numa etiqueta, a data e os botões Copiar, PDF e DOCX; depois as seções, "
           "o subtítulo de cada turma e os nomes numerados em colunas. O Copiar copia o mesmo texto de `M.textoFolha`."),
(544, 550, "Rela de todas as listas: `folhasDeTodas` junta as folhas de cada lista, cada uma com as suas opções."),
(552, 574, "Abrir, atualizar (a cada marcação, enquanto estiver aberta) e fechar o quadro da rela de todas."),
(576, 595, "`copiarTexto` usa a área de transferência do navegador; se não der, cria uma caixa de texto escondida, "
           "seleciona e tenta o jeito antigo (`execCommand`). Mostra \"Copiado!\" ao lado dos botões."),
(597, 603, "`nomeArquivo` monta o nome do arquivo baixado: tipo, data do dia (ou o nome do dia), refeição, ano e, se "
           "houver, a situação (ex.: `rela_2026-10-23_janta_3ano_municiados`)."),
(605, 628, "`baixar` gera o arquivo (`gerarRelaDocx` ou `gerarRelaPdf`, com o brasão de fundo em todas as páginas), "
           "embrulha num `Blob`, clica num link temporário com o nome do arquivo e o libera depois de 1 minuto."),
(630, 642, "`tema`: o botão claro/escuro, igual ao da outra versão."),
(644, 684, "`M.iniciar`: liga o tema, a escolha de arquivo, o balão de informação, o arrastar e soltar, os formulários de "
           "leitura, de nova lista e de data, e os botões da rela de todas (copiar, baixar, fechar). Se houver marcações, o "
           "navegador pergunta antes de fechar a página (`beforeunload`). Fecha o módulo."),
])

# ====================================================================== build.mjs
arquivo("web/build.mjs", "build.mjs: montagem do arquivo único",
        "Script Node que junta tudo em um HTML por versão. Roda com `node web/build.mjs`.", [
(1, 13, "Comentário com o uso: sem argumento gera as três versões; com `abertura`, `completa` ou `rela`, só uma."),
(14, 23, "Importa as funções do Node: hash, leitura e escrita de arquivo, caminhos. `WEB` é a pasta deste script e `RAIZ` a "
         "do projeto. `ler` lê um arquivo como texto; `base64` lê como bytes e converte para base64 (para embutir imagens)."),
(24, 29, "`seguroParaScript`: dentro de um `<script>`, o texto `</script` encerraria o bloco antes da hora; se aparecer, o "
         "build para com erro. `<!--` é trocado por `<\\!--`, que tem o mesmo efeito no JavaScript e não confunde o HTML."),
(30, 34, "Lê o CSS e troca os marcadores das imagens pelo brasão em base64."),
(35, 38, "Cada biblioteca vira um bloco `<script>` com um comentário com o nome do arquivo."),
(39, 42, "A marca d'água dos documentos em base64, dentro de `Municiamento.IMAGENS`."),
(43, 49, "`codigoDe(regra, app)`: imagens + a regra da versão + os arquivos de `src/` na ordem + o arquivo de interface "
         "da versão (`app.js` ou `rela.js`) + a chamada `Municiamento.iniciar()`."),
(50, 56, "As versões: nome do arquivo, regra, página, interface, o nome do sistema (abertura e cabeçalho: \"Conferência CIAGA\"), o título da aba do navegador (\"… – Digital\" ou \"… – Impressa\") e o título das listas (\"Conferência\"). A rela usa a página `pagina_rela.html` e a "
         "interface `rela.js`; a leitura da planilha é a mesma das outras."),
(57, 60, "Gera as versões pedidas na linha de comando, ou todas."),
(61, 67, "Troca os quatro marcadores da página (e o título da abertura, `{{TITULO_ABERTURA}}`; sem título próprio, \"Municiamento Ciaga\"). As funções `() => ...` no `replace` evitam que caracteres especiais "
         "como `$&` dentro do código sejam interpretados."),
(68, 71, "Grava o HTML na raiz e mostra o tamanho e o início do SHA-256 (impressão digital do arquivo)."),
])

# ====================================================================== pagina.html
arquivo("web/pagina.html", "pagina.html: a estrutura da página",
        "O esqueleto HTML das duas telas, com os marcadores que o build substitui.", [
(1, 10, "Documento HTML5 em português. A meta `Content-Security-Policy` é a proteção principal: bloqueia qualquer conexão "
        "e qualquer recurso de fora. `viewport` ajusta ao celular, `color-scheme` avisa que há tema claro e escuro, "
        "`no-referrer` não envia endereço de origem. Título da aba."),
(11, 19, "Script do tema, executado antes de a página aparecer: usa a escolha salva ou, sem ela, o tema do sistema, e grava "
         "em `data-tema`. Assim a página não \"pisca\" no tema errado."),
(20, 23, "O marcador `/*ESTILO*/` vira o CSS inteiro."),
(24, 25, "Link escondido \"Pular para o conteúdo\", que aparece ao navegar pelo teclado (acessibilidade)."),
(26, 44, "Cabeçalho: selo com o brasão, nome e subtítulo; botão Nova planilha (escondido na tela 1) e botão de tema com os "
         "ícones de sol e lua em SVG."),
(45, 47, "Área principal (pode receber foco ao trocar de tela) e o quadro de erro (`role=\"alert\"` faz o leitor de tela "
         "anunciar)."),
(48, 53, "Tela 1: título e frase de apresentação."),
(54, 64, "Formulário de envio. O `input type=\"file\"` (aceita vários e os tipos .xlsx, .csv, .pdf) cobre toda a área "
         "tracejada, invisível, então clicar ou arrastar em qualquer ponto funciona. `aria-live` anuncia o arquivo escolhido."),
(65, 75, "Campo da sexta-feira (tipo data) com o ícone de informação e o balão de explicação."),
(76, 83, "As caixas dos dias (criadas pelo JavaScript; escondidas na versão completa) e o botão Gerar listas."),
(84, 92, "Quadro \"Como funciona\" com os 3 passos e a observação do CSV."),
(93, 113, "\"O que vem em cada lista\": um bloco para cada versão (o JavaScript mostra o certo) e a frase de privacidade."),
(114, 116, "Fim da tela 1."),
(117, 123, "Tela 2 (começa escondida): título, selo do formato (XLSX/CSV/PDF) e resumo."),
(124, 141, "Coluna lateral: cartão Baixar, com os botões do filtro atual (aparecem quando há filtro) e os de todas as listas. "
           "Os atributos `data-baixar` e `data-filtro` dizem ao JavaScript o que cada botão faz."),
(142, 160, "Cartão Data (e dias, na versão oficial), com os avisos de data e o botão Atualizar listas."),
(161, 162, "Coluna principal e o aviso de leitura por PDF."),
(163, 176, "Conferência da planilha num `details`: alunos por turma e avisos."),
(177, 190, "Filtros: os menus (versão oficial) e os grupos de caixas (versão completa), Situação e Limpar; a contagem e o "
           "lugar das listas."),
(191, 199, "Fechamentos. `<!--BIBLIOTECAS-->` e `<!--CODIGO-->` viram os scripts no build; ficam no fim para a página já "
           "existir quando o código rodar."),
])

# ====================================================================== pagina_rela.html
arquivo("web/pagina_rela.html", "pagina_rela.html: a estrutura da versão rela",
        "O esqueleto da versão rela. O cabeçalho, a proteção e o estilo são os mesmos da `pagina.html`.", [
(1, 23, "Igual à `pagina.html`: proteção que bloqueia qualquer conexão, ajuste ao celular, tema antes de pintar e o "
        "marcador do CSS. Muda só o título da aba."),
(24, 43, "Link de acessibilidade e o mesmo cabeçalho, com Nova planilha e o botão de tema."),
(45, 53, "Área principal, quadro de erro e o título da tela 1."),
(54, 63, "A área de envio, igual à da outra versão."),
(65, 74, "A data da sexta, aqui **opcional**: sem ela, a rela sai só com o nome do dia."),
(76, 77, "O botão Ler planilha (não há escolha de dias nesta tela)."),
(79, 95, "\"Como funciona\" com os 4 passos desta versão (incluindo baixar a lista para marcar e finalizar a marcação) e o quadro \"Bom saber\", que avisa que as listas começam "
         "desmarcadas, que a rela traz só os marcados (separados pela planilha) e que as marcações se perdem ao fechar a página."),
(96, 97, "Fim da tela 1."),
(99, 104, "Tela 2: título e resumo."),
(106, 116, "Cartão Nova lista: menus de dia, refeição e ano (preenchidos pelo JavaScript) e o botão Criar lista."),
(118, 129, "Cartão Data, para corrigir ou informar a sexta depois."),
(131, 135, "Cartão Todas as listas, que aparece quando há mais de uma aba."),
(137, 151, "Coluna principal: aviso de PDF e a conferência da planilha."),
(153, 155, "A mensagem inicial, a barra de abas e o painel da lista ativa (preenchidos pelo `rela.js`)."),
(157, 169, "O quadro da rela de todas as listas: título, botões Copiar, Baixar PDF, Baixar DOCX e Fechar, a linha de situação e o "
           "lugar onde as folhas são desenhadas."),
(170, 178, "Fechamentos e os marcadores das bibliotecas e do código."),
])

# ====================================================================== estilo.css
arquivo("web/estilo.css", "estilo.css: o visual",
        "Todo o visual. As cores ficam em variáveis; cada componente só usa as variáveis.", [
(1, 3, "Comentário com a regra principal: nenhuma cor fixa nos componentes."),
(5, 41, "Variáveis do **tema claro** em `:root`: fundo, cartões, textos, bordas, faixa, botões, destaque dourado, avisos, o "
        "brasão (os marcadores `{{BRASAO_...}}` viram base64 no build) e sua opacidade, as fontes (Times New Roman), o "
        "arredondamento, a largura máxima e a margem, que cresce com a tela (`clamp`)."),
(43, 71, "As mesmas variáveis no **tema escuro**, quando `data-tema=\"escuro\"`. Os botões passam a dourados e o brasão fica "
         "um pouco mais opaco para aparecer no escuro."),
(73, 85, "Se o JavaScript não rodou (sem `data-tema`), segue o tema do sistema."),
(87, 96, "Base: tamanho das caixas inclui a borda (`border-box`), fundo e fonte da página."),
(98, 107, "O brasão de fundo: uma camada fixa (`body::before`) do tamanho da tela, atrás de tudo (`z-index: -1`), "
          "translúcida e que não recebe cliques. O tamanho é pela altura, porque o brasão é mais alto que largo."),
(109, 115, "Títulos em serifa, tamanhos (o `clamp` faz o título crescer com a tela) e o foco visível em dourado para quem "
           "navega pelo teclado."),
(117, 121, "O link \"Pular para o conteúdo\" fica fora da tela e aparece quando recebe foco."),
(123, 151, "Cabeçalho: faixa azul-marinho com filete dourado de 3 px, selo redondo com o brasão, nome, botão Nova planilha e "
           "botão de tema (mostra o sol no claro e a lua no escuro)."),
(153, 170, "Página centralizada, cartões semitransparentes (`--vidro`, deixa ver o brasão), dicas e alertas de erro e aviso."),
(172, 179, "Tela de envio: uma coluna; a partir de 900 px, duas (formulário maior e o quadro \"Como funciona\")."),
(181, 200, "Formulários: campos, menus, as caixas de seleção em formato de pílula (`border-radius: 999px`); `:has(input:checked)` "
           "destaca a pílula marcada."),
(202, 215, "Área de envio tracejada; o `input` de arquivo ocupa toda a área, invisível. Muda de cor ao passar o mouse, ao "
           "arrastar e quando já tem arquivo."),
(217, 229, "Botões: principal (cheio), secundário (contorno), grande e largo, e a grade de botões."),
(231, 242, "Tela de resultado: resumo, selo do formato e o layout em duas colunas a partir de 1000 px, com a coluna lateral "
           "fixa ao rolar (`sticky`)."),
(244, 253, "Blocos que abrem e fecham, avisos graves e a grade das turmas."),
(255, 263, "Filtros em grade; na versão completa, os grupos de caixas ocupam a linha inteira (`grid-column: 1 / -1`) e ficam "
           "abaixo dos menus (`order`)."),
(265, 280, "Cada lista com a borda dourada à esquerda, a quantidade numa pílula, o NÃO sublinhado e os nomes em colunas."),
(282, 288, "Estilos de tabela (restos da versão Python, que tinha histórico)."),
(290, 298, "Celular (até 640 px): brasão, nome e botões menores; o subtítulo some."),
(300, 302, "Transições suaves, só para quem não pediu ao sistema para reduzir animações."),
(304, 321, "Impressão da tela (Ctrl+P): página A4; o brasão de fundo continua aparecendo, em todas as páginas (a camada "
           "fixa se repete em cada página impressa e `print-color-adjust: exact` faz o navegador imprimir a imagem mesmo sem "
           "\"gráficos de fundo\" ligado); somem o cabeçalho, os botões, os filtros e as opções; os cartões ficam "
           "transparentes para o brasão aparecer; só as listas abertas são impressas."),
(323, 328, "`oculto` esconde qualquer elemento (`!important` vence qualquer outra regra); botão desativado; detalhes."),
(330, 339, "A caixa de conferência (turmas e avisos)."),
(341, 357, "O ícone de informação e o balão, que aparece ao passar o mouse, ao focar pelo teclado ou ao tocar (classe "
           "`aberta`, posta pelo JavaScript)."),
(359, 365, "O quadro \"Como funciona\": subtítulo, lista de regras com marcadores dourados e travessão nas sub-regras, e a "
           "observação do CSV em itálico."),
(367, 435, "Só a versão rela usa estas regras. Abas das listas (a ativa com o filete dourado embaixo, o × para fechar e a "
           "contagem marcados/total), o painel, as opções em pílulas (Ordem, Agrupar e Turmas, com os atalhos em forma de link), o campo de pesquisa, a lista de "
           "alunos em colunas (o nome fica em negrito quando a caixa está marcada, com `:has(input:checked)`), o quadro da "
           "rela e as folhas com cara de documento: um cartão por folha (uma embaixo da outra), cabeçalho com a contagem "
           "numa etiqueta e os nomes numerados em colunas."),
(437, 453, "Conferência digital, fase de marcação: o **alerta** em vermelho (cores de erro do tema, que funcionam no "
           "claro e no escuro), que pisca duas vezes ao aparecer (só para quem não pediu menos animação); a linha do aluno "
           "marcado sem estar municiado fica com fundo vermelho e mostra a etiqueta \"NÃO municiado\"; e os blocos da "
           "marcação separada por turma, com um traço entre as turmas."),
])

# ====================================================================== abertura.html
arquivo("web/abertura.html", "abertura.html: a animação do navio",
        "A cena de abertura, inserida logo depois do `<body>` pelo build. Só CSS e SVG, e um script de 10 linhas.", [
(1, 3, "Comentário: a abertura segue o tema, dura cerca de 3 segundos e não aparece para quem reduz animações."),
(4, 19, "A camada da abertura cobre a tela inteira (`position: fixed; inset: 0`), acima de tudo (`z-index: 100`), com as "
        "cores da cena em variáveis: noite por padrão e dia quando o tema é claro. A animação `abertura-sai` começa em 2,7 s "
        "e dura 0,6 s."),
(20, 41, "A cena tem no máximo 820 px; título e subtítulo surgem com atraso (1,1 s e 1,35 s); o filete dourado cresce; o "
         "botão Pular fica no canto."),
(43, 53, "Céu: mostra estrelas e lua de noite, sol e nuvens de dia; o halo pulsa, as estrelas piscam em tempos diferentes "
         "(`nth-child`), as nuvens andam."),
(55, 67, "Mar: gradiente de fundo, três camadas de ondas andando em velocidades e direções diferentes (dá profundidade), "
         "espuma nas cristas, o reflexo do astro cintilando, a esteira da popa e a onda da proa."),
(69, 73, "Navio: entra pela esquerda (`abertura-navega`), balança e solta fumaça."),
(75, 86, "Os `@keyframes`: o que cada animação muda do começo ao fim (posição, rotação, opacidade, escala)."),
(87, 89, "Reduzir animações ou imprimir: a abertura nem aparece."),
(90, 97, "O elemento da abertura (escondido dos leitores de tela) e o desenho SVG com `viewBox` 640 × 270, que escala com a "
         "tela. O gradiente do mar usa as variáveis do tema."),
(98, 116, "Desenho do céu: estrelas, halo, lua (um círculo da cor do céu por cima faz o crescente) e, de dia, sol e nuvens "
          "feitas de elipses."),
(118, 127, "O mar ao fundo, o reflexo (retângulos finos) e a primeira camada de ondas (curvas `Q` e `T` repetidas)."),
(129, 136, "Navio, parte 1: a fumaça, a chaminé com faixa dourada e a ponte de comando com janelas."),
(137, 149, "Os contêineres coloridos em três camadas."),
(150, 159, "Casco azul-marinho com faixa dourada, a parte de baixo em vermelho, o nome CIAGA, o mastro, a esteira e a onda "
           "da proa."),
(161, 169, "As ondas da frente, que cobrem o pé do casco (o navio parece estar na água)."),
(170, 176, "Fim do SVG, título, subtítulo, filete e o botão Pular."),
(177, 187, "O script: fecha a abertura (remove o elemento) com clique, tecla, no fim da animação de saída ou, por garantia, em "
           "4 segundos, para nunca prender a tela."),
])

# ====================================================================== ambiente.cjs
arquivo("web/testes/ambiente.cjs", "testes/ambiente.cjs: o sistema dentro do Node",
        "Carrega o sistema fora do navegador, para os testes. Não vai no HTML.", [
(1, 3, "Comentário e módulos do Node para ler arquivos e montar caminhos."),
(5, 7, "As pastas e os arquivos do sistema que não dependem da tela (o `app.js` fica de fora)."),
(9, 14, "Põe as bibliotecas no objeto global, com os mesmos nomes que elas usam no navegador, e carrega os arquivos de "
        "`src/` na mesma ordem do build. O `pdf.worker` é carregado antes do `pdf.js` para ele rodar sem worker."),
(16, 19, "Pega o objeto `Municiamento` e põe a marca d'água, como o build faz."),
(21, 25, "`fixture` lê uma planilha fictícia de `tests/fixtures/`. Exporta o que os testes usam."),
])
