# IMPLEMENTAÇÕES

Lista de funcionalidades planejadas e em andamento. Cada item traz o objetivo, as regras, as decisões já tomadas e o que ainda está em aberto.

---

## 1. Conferência Geral

**Estado:** implementada (ver "Como ficou" abaixo).

### Objetivo
Hoje cada pessoa que confere uma refeição (a "conferente") usa o app e marca quem veio na **sua** lista. Cada marcação fica num rascunho individual e cifrado; ninguém vê o que o outro marcou. A **Conferência Geral** junta o trabalho de **todas as conferentes** de uma mesma refeição, num mesmo dia, em **uma única listagem** para consulta e cópia.

### Regras
1. **Fonte dos dados:** os registros (rascunhos) de cada pessoa que usou o app para conferir **aquele dia e aquela refeição**, na planilha da semana publicada.
2. **Cruzamento (união):** um aluno aparece na listagem geral se **qualquer** conferente o marcou como presente. Alunos marcados por mais de uma conferente aparecem **uma só vez**.
3. **Separação:** a listagem geral é dividida em **Municiados** e **NÃO municiados**, usando a planilha da semana (a mesma regra da rela individual: quem foi marcado e estava municiado naquele dia e refeição entra em "Municiados"; quem foi marcado e não estava municiado entra em "NÃO municiados").
4. **Formato fixo e um só filtro.** A listagem sai sempre **por antiguidade** e **separada por turma** (um bloco por turma, todas as turmas). A única escolha da pessoa é o filtro **Mostrar**: **Todos** · só **Municiados** · só **NÃO municiados**. Sem Ordem, sem Agrupar, sem escolha de turmas e sem "Separar em duas listas". Continuam **Copiar** e **Baixar PDF**.
5. **Quem pode usar:** **qualquer pessoa autenticada** (aluno ou administrador), pelo item "Conferência geral" do menu. A tela mostra **quem conferiu** (nome, quantos marcou e quando salvou), para todos saberem de onde vêm os dados.
6. **Validade de um dia:** a listagem de um dia **só existe naquele dia** (horário de Brasília). Em 23/10 só aparece o que é de 23/10; a partir de 00h de 24/10 ela some da Conferência Geral (o endereço dela deixa de responder). A data de cada dia vem da sexta-feira da planilha. Sem essa data, nada é escondido.
7. **Escolha da refeição:** a tela lista só as combinações (dia × refeição) **de hoje** em que **há pelo menos um conferente com marcações**, com o número de conferentes. A tabela com todos eles chama-se **Todos os conferentes**.
8. **Atualização:** o botão **Atualizar** busca de novo os registros; nada é recalculado sozinho.

### Decisões tomadas
| Ponto | Decisão |
|---|---|
| Como cruzar quando duas conferentes divergem | **União**: basta uma ter marcado para o aluno constar como presente |
| Listas ainda em andamento entram? | **Sim**: entram todas as listas com pelo menos uma marcação (finalizadas ou não); a tela mostra quantas estão finalizadas |
| Planilha | Só entram registros feitos **na planilha da semana atualmente publicada** (registros de uma planilha antiga são ignorados) |
| Quem vê | **Todos os usuários autenticados**, inclusive alunos (decisão da operação: quem confere precisa ver o que os outros marcaram) |
| Segurança dos dados | Os rascunhos continuam **cifrados** no banco; a decifragem acontece **só no servidor**, para uma pessoa autenticada, a cada consulta; o resultado não é guardado. Cada pessoa só vê o resultado agregado, nunca o rascunho bruto de outra |
| Registro de auditoria | Cada consulta à Conferência Geral fica registrada ("Abriu a conferência geral") |

### Em aberto (pode ser ajustado depois)
- Restringir a Conferência Geral a quem **conferiu** aquele dia e refeição (hoje, qualquer pessoa autenticada vê qualquer combinação).
- Marcar por conferente de **qual ano/curso** cada uma conferiu, para destacar lacunas (alunos de um ano sem nenhuma conferente).
- Opção de considerar **só listas finalizadas**.

### Como ficou (resumo técnico)
- **Servidor:** `GET /api/conferencia-geral` (qualquer pessoa autenticada). Sem parâmetros devolve as combinações disponíveis; com `dia` e `refeicao` devolve as conferentes e a união das marcações.
- **App:** nova tela "Conferência geral" (aberta pelo menu), reaproveitando a mesma rela da conferência individual.
- Detalhes: [docs/ARQUITETURA_E_FLUXO.md](docs/ARQUITETURA_E_FLUXO.md#15-conferência-geral) e [docs/SEGURANCA.md](docs/SEGURANCA.md).

---

## 2. Menu suspenso no cabeçalho

**Estado:** implementada.

### Objetivo
Com a Conferência Geral, o cabeçalho passou a ter botões demais. Os links ficam agrupados num **menu suspenso** ("Menu"), nas áreas de **aluno** (app) e **administrador** (painel e demais páginas do servidor). O botão de tema e "Nova planilha" continuam fora do menu.

### Regras
- **Aluno:** Conferência geral, Como usar.
- **Administrador:** Conferência geral, Administrador (painel), Como usar.
- **Voltar ao app:** aparece como primeiro item do menu **só dentro da Conferência Geral** e leva de volta às listas, sem recarregar a página. Nessa tela o item "Conferência geral" some do menu (a pessoa já está nela).
- No painel e nas páginas do servidor: Voltar ao app, Como usar (e os demais links da página).
- Abre e fecha com clique ou teclado (`Esc` fecha); clicar fora fecha; funciona no celular e sem scripts adicionais.

---

## 3. Rancho Corrido

**Estado:** implementada.

### Objetivo
Ler os arquivos de quem está de rancho corrido num dia e **avisar na marcação** que o aluno está de rancho corrido, dizendo o **motivo** que vem no arquivo.

### Os dois modelos de arquivo (PDF, XLSX, CSV ou **foto** JPEG/PNG; um por vez ou os dois juntos)
| Modelo | O que traz | O que vira |
|---|---|---|
| **Autorização para rancho corrido** (lista) | Data, **Refeição**, **Motivo** e, por ano (3º, 2º, 1º), os alunos: Nº Interno, Nome de Guerra e Pelotão/CIA | O motivo é o escrito no arquivo; vale **só para a(s) refeição(ões)** indicada(s) (sem refeição escrita, vale para todas) |
| **Detalhe de serviço do Corpo de Alunos** (tabela) | "SERVIÇO: 24 OUT 2026" e, por função (Chefe de dia, Polícia, Retém, Pav...), número, letra do curso e nome de quem está de serviço, com o turno de cada coluna | O motivo é **"Serviço: <função> (<turno>)"**; vale para **qualquer refeição** do dia |

### Regras
1. **Por dia:** o rancho corrido vale **só no dia do arquivo** (a data vem do arquivo; se não vier, a pessoa escolhe o dia). A publicação de um dia fica guardada por pouco tempo e some sozinha.
2. **Qualquer pessoa autenticada pode publicar** (aluno ou administrador), pelo **Menu → Rancho corrido**. Antes de publicar, a tela **mostra o que foi lido** (tipo, dia, refeição, motivo e cada aluno, com a turma quando ele está na planilha da semana) para conferir.
3. **Publicar só acrescenta:** duas pessoas publicando o mesmo dia (por exemplo, a autorização e o detalhe de serviço) ficam **somadas**; nenhuma apaga a outra. Cada publicação guarda **quem enviou e quando**.
4. **Aviso na marcação (tudo em laranja):** na lista (dia × refeição) o aluno aparece com o selo **RANCHO CORRIDO**; **tocar no selo mostra o motivo** embaixo do nome. Um aviso no alto diz quantos da lista estão nessa situação. Ao **marcar** o aluno, aparece um **aviso laranja** ("Atenção: NOME (turma) está de RANCHO CORRIDO") e **tocar no aviso mostra o motivo**. O aviso vermelho continua sendo só para quem NÃO está municiado (os dois podem aparecer juntos).
5. **Quem é o aluno:** o número interno do arquivo é casado com o da planilha da semana (com a letra do curso, quando o arquivo traz; sem a letra, os quatro dígitos, e o nome desempata).
6. **Administração:** o painel mostra o rancho corrido publicado em cada dia da semana (quem publicou e quantos alunos) e permite **remover um dia** errado.
7. **Segurança e privacidade:** tudo é lido no navegador; só o resultado é enviado ao publicar. No servidor fica **cifrado** (AES-256-GCM), por dia, e expira sozinho (4 dias). Limites: 300 alunos por publicação, 40 publicações por dia, 20 publicações por pessoa por hora. Uma pessoa mal-intencionada poderia publicar um aviso falso: por isso cada publicação mostra **quem enviou**, e a administração pode remover o dia.

### Decisões
| Ponto | Decisão |
|---|---|
| Funções do servidor | **Nenhuma nova** (12 de 12): o rancho corrido usa a rota `/api/planilha` (parâmetro `?rancho=`) e a `/api/admin-acao` |
| Leitura do PDF | Pela **posição dos textos** (pdf.js), agrupados em linhas e células; XLSX e CSV pela planilha |
| Leitura de **foto** | **OCR no navegador** (Tesseract.js, português), com os arquivos hospedados no próprio site (`public/ocr/`, ~9,5 MB, baixados só quando alguém lê uma foto). A foto é reduzida (lado maior 2.200 px), lida palavra por palavra com a posição, e vira linhas e células como no PDF; nada da foto sai do aparelho |
| Tabela de serviço em foto | A foto é **ampliada** (texto pequeno só é lido bem com letras grandes), as **linhas da tabela são apagadas** e a leitura é por linhas. Em cada linha o sistema procura **4 dígitos + letra do curso (N, B ou M) + nome de guerra**, tolerando ruído de borda, letra do curso mal lida (vale o número) e número com letra no lugar de algarismo. A **data** ("SERVIÇO: 24 OUT 2026") também é lida da foto, em várias formas |
| Número lido errado | Se o número interno não existe na planilha e o nome de guerra existe **uma única vez**, o sistema usa o aluno pelo nome e publica o número da planilha |
| Arquivo não reconhecido ou sem alunos | Aviso claro, sem publicar; nunca bloqueia o resto |
| Sem a data da sexta na planilha da semana | Não há como saber o dia de cada lista: os avisos não aparecem |

### Em aberto
- Mostrar o rancho corrido também na **rela** impressa/PDF (hoje só na marcação).
- Registrar a **refeição** de cada função do serviço, se o detalhe de serviço passar a trazê-la.
- Ajustar a leitura aos formulários reais **preenchidos** (os modelos recebidos estavam em branco ou como imagem): se algum arquivo não for lido direito, a prévia mostra o que foi entendido e a regra pode ser refinada.
- A leitura de **foto** foi validada com imagens de teste limpas; fotos reais (inclinadas, com sombra ou desfocadas) podem exigir ajustes (pré-processamento) ou ser enviadas como PDF.
