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
4. **Mesmo padrão de filtragem da rela individual**, para escolher o que copiar ou baixar:
   - **Mostrar:** Todos · só **Municiados** · só **NÃO municiados**;
   - **Agrupar:** Ano inteiro (toda a lista junta) · **Por turma**, com escolha das turmas;
   - **Ordem:** **Alfabética** ou **Antiguidade** (a "continuidade" do pedido original é a ordem de antiguidade do app);
   - **Separar em duas listas** (Municiados e NÃO municiados em folhas separadas), **Copiar** e **Baixar** (PDF ou DOCX).
5. **Quem pode usar:** administradores (ranchef e administradores), em modo Administrador. A tela mostra **quem conferiu** (nome, quantos marcou e quando salvou) para a administração saber de onde vêm os dados.
6. **Escolha do dia e da refeição:** a tela lista só as combinações (dia × refeição) em que **há pelo menos uma conferente com marcações**; para cada uma mostra quantas conferentes.
7. **Atualização:** o botão **Atualizar** busca de novo os registros; nada é recalculado sozinho.

### Decisões tomadas
| Ponto | Decisão |
|---|---|
| Como cruzar quando duas conferentes divergem | **União**: basta uma ter marcado para o aluno constar como presente |
| Listas ainda em andamento entram? | **Sim**: entram todas as listas com pelo menos uma marcação (finalizadas ou não); a tela mostra quantas estão finalizadas |
| Planilha | Só entram registros feitos **na planilha da semana atualmente publicada** (registros de uma planilha antiga são ignorados) |
| Quem vê | Somente administradores; nenhum aluno vê o trabalho das outras conferentes |
| Segurança dos dados | Os rascunhos continuam **cifrados** no banco; a decifragem acontece **só no servidor** e **só** para um administrador autenticado, a cada consulta; o resultado não é guardado |
| Registro de auditoria | Cada consulta à Conferência Geral fica registrada ("Abriu a conferência geral") |

### Em aberto (pode ser ajustado depois)
- Liberar a Conferência Geral também para **alunos**/conferentes (hoje, só administradores).
- Marcar por conferente de **qual ano/curso** cada uma conferiu, para destacar lacunas (alunos de um ano sem nenhuma conferente).
- Opção de considerar **só listas finalizadas**.

### Como ficou (resumo técnico)
- **Servidor:** `GET /api/conferencia-geral` (somente administrador). Sem parâmetros devolve as combinações disponíveis; com `dia` e `refeicao` devolve as conferentes e a união das marcações.
- **App:** nova tela "Conferência geral" (aberta pelo menu), reaproveitando a mesma rela da conferência individual.
- Detalhes: [docs/ARQUITETURA_E_FLUXO.md](docs/ARQUITETURA_E_FLUXO.md#15-conferência-geral) e [docs/SEGURANCA.md](docs/SEGURANCA.md).

---

## 2. Menu suspenso no cabeçalho

**Estado:** implementada.

### Objetivo
Com a Conferência Geral, o cabeçalho passou a ter botões demais. Os links ficam agrupados num **menu suspenso** ("Menu"), nas áreas de **aluno** (app) e **administrador** (painel e demais páginas do servidor). O botão de tema e "Nova planilha" continuam fora do menu.

### Regras
- **Aluno:** Como usar.
- **Administrador:** Conferência geral, Administrador (painel), Como usar.
- No painel e nas páginas do servidor: Voltar ao app, Como usar (e os demais links da página).
- Abre e fecha com clique ou teclado (`Esc` fecha); clicar fora fecha; funciona no celular e sem scripts adicionais.

---

## 3. Sistema Rancho Corrido

**Estado:** a definir. (Descreva aqui o objetivo e as regras para planejarmos a implementação.)
