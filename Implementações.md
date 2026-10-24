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
4. **Mesmo padrão da rela individual** (exceto o filtro de turmas, que não existe aqui), para escolher o que copiar ou baixar:
   - **Mostrar:** Todos · só **Municiados** · só **NÃO municiados**;
   - **Agrupar:** Ano inteiro (toda a lista junta) · **Por turma** (um bloco por turma). **Sem** a escolha de quais turmas mostrar: a conferência geral traz todas;
   - **Ordem:** **Alfabética** ou **Antiguidade** (a "continuidade" do pedido original é a ordem de antiguidade do app);
   - **Separar em duas listas** (Municiados e NÃO municiados em folhas separadas), **Copiar** e **Baixar PDF**.
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
- No painel e nas páginas do servidor: Voltar ao app, Como usar (e os demais links da página).
- Abre e fecha com clique ou teclado (`Esc` fecha); clicar fora fecha; funciona no celular e sem scripts adicionais.

---

## 3. Sistema Rancho Corrido

**Estado:** a definir. (Descreva aqui o objetivo e as regras para planejarmos a implementação.)
