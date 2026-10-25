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

### Os dois modelos de arquivo (PDF, XLSX ou CSV; um por vez ou os dois juntos; **foto não é lida**)
| Modelo | O que traz | O que vira |
|---|---|---|
| **Autorização para rancho corrido** (lista) | Data, **Refeição**, **Motivo** e, por ano (3º, 2º, 1º), os alunos: Nº Interno, Nome de Guerra e Pelotão/CIA | O motivo é o escrito no arquivo; vale **só para a(s) refeição(ões)** indicada(s) (sem refeição escrita, vale para todas) |
| **Tabela de serviço** ("Detalhe de serviço do Corpo de Alunos") | "SERVIÇO: 24 OUT 2026" e, por função, **4 dígitos + letra do curso (N, B ou M) + nome de guerra** de quem está de serviço. Um arquivo pode trazer **mais de um dia** | O motivo é **"Serviço"**; vale para **qualquer refeição** do dia, e cada aluno entra no **dia do arquivo** |

### Regras
1. **Por dia, e só até o dia acabar:** cada aluno vale **só no dia do arquivo** (a data é lida do cabeçalho do arquivo; sem data, o arquivo não é publicado). O servidor **apaga** a publicação de um dia **à meia-noite de Brasília desse dia** (o próprio banco expira o registro), e dias que já passaram nem são aceitos nem devolvidos.
2. **Qualquer pessoa autenticada pode publicar** (aluno ou administrador), pelo **Menu → Rancho corrido**. Antes de publicar, a tela **mostra o que foi lido** (tipo, dia, refeição, motivo e cada aluno, com a turma quando ele está na planilha da semana) para conferir.
3. **Publicar só acrescenta:** duas pessoas publicando o mesmo dia (por exemplo, a autorização e o detalhe de serviço) ficam **somadas**; nenhuma apaga a outra. Cada publicação guarda **quem enviou e quando**.
4. **Aviso na marcação (tudo em laranja):** na lista (dia × refeição) o aluno aparece com o selo **RANCHO CORRIDO**; **tocar no selo mostra o motivo** embaixo do nome. Um aviso no alto diz quantos da lista estão nessa situação. Ao **marcar** o aluno, aparece um **aviso laranja** ("NOME (turma) está de RANCHO CORRIDO") e **tocar no aviso mostra o motivo**. O aviso vermelho continua sendo só para quem NÃO está municiado (os dois podem aparecer juntos).
5. **Quem é o aluno:** o número interno do arquivo é casado com o da planilha da semana (com a letra do curso, quando o arquivo traz; sem a letra, os quatro dígitos, e o nome desempata).
6. **Administração:** o painel mostra o rancho corrido publicado em cada dia da semana (quem publicou e quantos alunos) e permite **remover um dia** errado.
7. **Segurança e privacidade:** tudo é lido no navegador; só o resultado é enviado ao publicar. No servidor fica **cifrado** (AES-256-GCM), por dia, e é **apagado à meia-noite do próprio dia**. Limites: 300 alunos por publicação, 40 publicações por dia, 20 publicações por pessoa por hora. Uma pessoa mal-intencionada poderia publicar um aviso falso: por isso a administração vê **quem enviou** (no painel) e pode remover o dia.

### Decisões
| Ponto | Decisão |
|---|---|
| Funções do servidor | **Nenhuma nova** (12 de 12): o rancho corrido usa a rota `/api/planilha` (parâmetro `?rancho=`) e a `/api/admin-acao` |
| Leitura do PDF | Pela **posição dos textos** (pdf.js), agrupados em linhas e células; XLSX e CSV pela planilha |
| Leitura sem foto | A leitura de **foto** (OCR) foi **retirada**: não era confiável. Só PDF, XLSX e CSV. (Ela está no histórico do Git, pull requests 9 e 12, se algum dia voltar a valer a pena.) |
| Número lido errado | Se o número interno não existe na planilha e o nome de guerra existe **uma única vez**, o sistema usa o aluno pelo nome e publica o número da planilha |
| Arquivo não reconhecido ou sem alunos | Aviso claro, sem publicar; nunca bloqueia o resto |
| Sem a data da sexta na planilha da semana | Não há como saber o dia de cada lista: os avisos não aparecem |

### Em aberto
- Mostrar o rancho corrido também na **rela** impressa/PDF (hoje só na marcação).
- Registrar a **refeição** de cada função do serviço, se o detalhe de serviço passar a trazê-la.
- Ajustar a leitura aos formulários reais **preenchidos** (os modelos recebidos estavam em branco ou como imagem): se algum arquivo não for lido direito, a prévia mostra o que foi entendido e a regra pode ser refinada.


### Regra do aviso por refeição (tabela de serviço)

| Refeição | Quem é avisado |
|---|---|
| Café da manhã | só quem está no turno 0800-1200 e não é RETÉM |
| Almoço | todos os que estão de serviço naquele dia |
| Janta | só quem está no turno 1800-2100 (turno escrito igual; quem está de serviço diário, sem turno, só avisa no almoço) |
| Sábado e domingo | sem aviso de rancho corrido |

O aluno é ligado à coluna de turnos da sua linha; sem turno (serviço diário), só no almoço. A autorização continua valendo só para a refeição escrita nela.

---

## 4. Otimização do código

**Estado:** planejada.

### Objetivo
Deixar o código mais enxuto e rápido, sem mudar o comportamento que a operação já usa.

### Escopo previsto
- Remover código repetido e funções sem uso (app, servidor e geração dos documentos).
- Reduzir o peso do que o navegador baixa (CSS e JS menores, imagens e fontes só quando necessárias).
- Evitar consultas repetidas ao banco e decifragens desnecessárias no servidor.
- Manter o limite de **12 de 12 funções** do servidor e todas as regras de segurança e LGPD.

### Regra
Cada otimização deve ser conferida contra o resultado atual (mesmas listas, mesmos totais, mesmos DOCX/PDF) antes de ser publicada.

---

## 5. Entrada ao clicar no brasão

**Estado:** planejada.

### Objetivo
Ao clicar no **brasão do canto superior direito** do cabeçalho, a **tela de entrada** (login) volta a aparecer.

### Regras
- O brasão passa a ser um botão (foco visível, `aria-label` descrevendo a ação e acessível pelo teclado).
- Se a pessoa já está autenticada, o clique mostra a tela de entrada para **trocar de usuário**, sem apagar o rascunho que ainda não foi salvo (pedir confirmação antes de sair).
- Funciona nos dois temas e no celular.

### Em aberto
- Confirmar o que "entrada" significa: **tela de login** (trocar de usuário) ou **tela inicial** (início, com a escolha de dia e refeição).

Quem está na função **RETÉM** não conta como serviço corrido: avisa **só no almoço**, nunca no café nem na janta.


### Digitar na tela (autorização escrita à mão)

A foto manuscrita não é lida (o leitor só lê texto impresso, e a leitura de foto foi retirada). No lugar, o cartão **Digitar na tela** pede **dia, refeição, motivo** e, para cada aluno, **nome de guerra + número interno** (botão **+ Adicionar aluno** abre outra linha); a turma vem da planilha da semana. Só com o nome vale se ele for único na planilha. Na prévia há o botão **Não publicar**, que descarta tudo. Vira uma autorização como as de arquivo (mesma prévia, mesma publicação, apagada à meia-noite do dia). Número que não existe na planilha entra como "Fora da planilha" e é marcado em vermelho na prévia.
