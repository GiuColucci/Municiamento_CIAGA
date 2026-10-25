// "Como usar": guia dentro do site, na mesma identidade visual. Só para quem está logado.
// A parte de administrador só aparece para quem entrou como administrador (papel conferido ao vivo).
const s = require("./_lib/seguranca");
const pessoas = require("./_lib/pessoas");
const { pagina, CSP_PAGINA } = require("./_lib/layout");

// Cada seção: id (âncora), título, html. `admin: true` só para administradores.
const SECOES = [
  {
    id: "entrar", titulo: "1. Entrar no sistema",
    html: `<p>Abra o endereço do site (no iPhone, use o Safari; dá para tocar em Compartilhar e <strong>Adicionar à Tela de Início</strong> para ter um ícone).</p>
<ol class="passos">
<li>Digite seu <strong>nome de guerra</strong> e seu <strong>número interno</strong> (por exemplo, B1037).</li>
<li>Digite a <strong>senha</strong>. Ela é passada pelos administradores e é diferente para alunos e para administradores.</li>
<li>Em <strong>Entrar como</strong>, deixe <strong>Aluno</strong>. Quem é administrador e quer usar o painel escolhe <strong>Administrador</strong>.</li>
<li>Toque em <strong>Entrar</strong>.</li>
</ol>
<p class="dica">Se aparecer "Nome, número interno ou senha incorretos", confira os três campos: o sistema não diz qual deles está errado, de propósito. Depois de 8 tentativas erradas no mesmo dia, o acesso daquela rede fica bloqueado por 15 minutos. A sessão de aluno dura 12 horas; a de administrador, 2 horas.</p>`,
  },
  {
    id: "planilha", titulo: "2. A planilha da semana",
    html: `<p>Você <strong>não precisa subir nem baixar planilha</strong>. A planilha da semana é publicada por um administrador e abre sozinha quando você entra, logo depois da abertura do navio.</p>
<ul class="lista">
<li>Se aparecer <strong>"Ainda não há planilha da semana"</strong>, um administrador ainda não publicou. Toque em <strong>Verificar de novo</strong> mais tarde.</li>
<li>No alto você vê o resumo (quantos alunos e turmas) e quem publicou a planilha e quando.</li>
<li>O cartão <strong>Conferência da planilha</strong> mostra quantos alunos foram lidos por turma e eventuais avisos. É só para conferir.</li>
</ul>`,
  },
  {
    id: "lista", titulo: "3. Montar uma lista",
    html: `<ol class="passos">
<li>No cartão <strong>Nova lista</strong>, escolha o <strong>Dia</strong>, a <strong>Refeição</strong> e o <strong>Ano</strong> (1°, 2° ou 3°).</li>
<li>Toque em <strong>Criar lista</strong>. A lista traz <strong>todos os alunos do ano</strong>, em ordem alfabética, com a turma e o número interno ao lado.</li>
</ol>
<p>Dá para abrir <strong>várias listas</strong> (por exemplo, almoço e janta): cada uma fica numa aba. Para fechar uma, toque no × da aba.</p>
<p class="dica">O cartão <strong>Data</strong> serve para informar a sexta-feira da primeira coluna da planilha, para a rela sair com a data do dia. Normalmente já vem preenchida; confira.</p>`,
  },
  {
    id: "marcar", titulo: "4. Marcar quem veio",
    html: `<ul class="lista">
<li><strong>Pesquisar:</strong> digite o nome de guerra ou o número interno. Quando sobra um só aluno, aperte <strong>Enter</strong> (ou o botão de confirmar do teclado) para marcar e limpar a busca; dá para conferir uma fila só digitando.</li>
<li><strong>Marcar à mão:</strong> toque na caixinha ao lado do nome.</li>
<li><strong>Mostrar:</strong> <strong>Todos</strong>, só <strong>Municiados</strong> ou só <strong>NÃO municiados</strong> (conforme a planilha, naquele dia e refeição). Os números entre parênteses dizem quantos são.</li>
<li><strong>Turmas:</strong> desmarque as turmas que não quer ver; <strong>Marcar todas</strong> e <strong>Desmarcar todas</strong> ajudam.</li>
<li><strong>Ordem:</strong> alfabética ou por antiguidade.</li>
<li><strong>Separar por turma:</strong> divide a lista em blocos por turma. <strong>Desmarcar todos</strong> tira todas as marcações da lista.</li>
</ul>
<p>Se você marcar um aluno que <strong>não está municiado</strong> na planilha, aparece um aviso em destaque: confira se é isso mesmo.</p>`,
  },
  {
    id: "imprimir", titulo: "5. Lista para marcar no papel",
    html: `<p>Para imprimir e marcar à mão, toque em <strong>Baixar lista (PDF)</strong>.</p>
<ul class="lista">
<li>A lista sai com uma caixinha [ &nbsp; ] ao lado de cada nome.</li>
<li>O <strong>cabeçalho</strong> diz o que a lista traz: <strong>Todos os alunos</strong>, <strong>Municiados</strong> ou <strong>NÃO Municiados</strong>, de acordo com o filtro <strong>Mostrar</strong> que estava escolhido. O nome do arquivo também indica.</li>
<li>Entram só as turmas que estão visíveis, na ordem escolhida.</li>
</ul>`,
  },
  {
    id: "rela", titulo: "6. Finalizar e gerar a rela",
    html: `<ol class="passos">
<li>Quando terminar de marcar, toque em <strong>Finalizar marcação</strong>.</li>
<li>A <strong>rela</strong> traz só quem você marcou, separado pela planilha em <strong>municiados</strong> e <strong>NÃO municiados</strong>.</li>
<li>Ajuste como quiser: <strong>Ordem</strong>, <strong>Agrupar</strong> (ano inteiro ou por turma), <strong>Mostrar</strong> (todos, municiados ou NÃO municiados) e <strong>Separar em duas listas</strong>.</li>
<li>Toque em <strong>Copiar</strong> para colar o texto (por exemplo, no WhatsApp) ou em <strong>Baixar PDF</strong>.</li>
</ol>
<p>Errou algo? Toque em <strong>Voltar a marcar</strong>. Com várias listas abertas, o cartão <strong>Rela de todas as listas</strong> junta tudo num só lugar.</p>`,
  },
  {
    id: "geral", titulo: "7. Conferência geral",
    html: `<p>Junta, numa listagem só, o que <strong>todas as pessoas que conferiram</strong> o mesmo dia e a mesma refeição marcaram. Abra por <strong>Menu → Conferência geral</strong>; para sair dela, <strong>Menu → Voltar ao app</strong>.</p>
<ol class="passos">
<li>Escolha a refeição na lista de <strong>Dia e refeição</strong>. Cada opção mostra quantos conferentes marcaram alguém.</li>
<li>A tabela <strong>Todos os conferentes</strong> mostra quem conferiu, quantas listas, quantos marcou e quando salvou.</li>
<li>Embaixo está a listagem geral, <strong>sempre por antiguidade e separada por turma</strong>. Um aluno marcado por mais de uma pessoa aparece uma vez só.</li>
<li>Use <strong>Mostrar</strong> para ver <strong>Todos</strong>, só <strong>Municiados</strong> ou só <strong>NÃO municiados</strong>, e toque em <strong>Copiar</strong> ou <strong>Baixar PDF</strong>.</li>
</ol>
<p class="dica">A listagem de um dia <strong>só existe naquele dia</strong>: no dia seguinte ela some. Toque em <strong>Atualizar</strong> para buscar de novo o que os outros marcaram. Ela usa a planilha da semana publicada; se uma planilha nova for publicada, as marcações antigas deixam de valer.</p>`,
  },
  {
    id: "rancho", titulo: "8. Rancho corrido",
    html: `<p>Quem está de <strong>rancho corrido</strong> no dia aparece na marcação, com o <strong>motivo</strong>. Qualquer pessoa pode publicar o arquivo do dia: <strong>Menu → Rancho corrido</strong>.</p>
<ol class="passos">
<li>Escolha o arquivo: a <strong>tabela de serviço</strong> e/ou a <strong>autorização para rancho corrido</strong> (lista), em <strong>PDF, XLSX ou CSV</strong>, arrastando para a área ou tocando nela. Dá para escolher os dois de uma vez. <strong>Foto não é lida.</strong></li>
<li>Toque em <strong>Ler arquivos</strong>. Cada aluno entra no <strong>dia que está no arquivo</strong> (a data é lida do cabeçalho: "Data" na autorização e "SERVIÇO: dia mês ano" na tabela de serviço). Se o arquivo não tiver a data, ele não é publicado.</li>
<li>Veja o que foi lido: tipo, dia, refeição, motivo e cada aluno (<strong>nome de guerra e número interno</strong>). Quem não está na planilha da semana aparece em vermelho; se o número não existir, mas o nome de guerra existir uma só vez na planilha, o sistema usa o número certo.</li>
<li>Toque em <strong>Publicar rancho corrido</strong>. Quem publicou mais de um arquivo no mesmo dia não apaga o do outro: as publicações se somam.</li>
</ol>
<ul class="lista">
<li>Na lista da refeição, o aluno aparece em <strong>laranja</strong> com o selo <strong>RANCHO CORRIDO</strong>. Toque no selo para ver o <strong>motivo</strong> embaixo do nome.</li>
<li>Ao marcar o aluno, aparece um <strong>aviso laranja</strong> ("está de RANCHO CORRIDO"). <strong>Toque no aviso</strong> para ver o motivo. O aviso vermelho continua sendo só para quem NÃO está municiado.</li>
<li>O motivo da <strong>tabela de serviço</strong> é <strong>"Serviço"</strong> e o aviso segue o turno de cada um: <strong>Café da manhã</strong> avisa quem está nos turnos 0400-0800 e 0800-1200; <strong>Almoço</strong> avisa todos os que estão de serviço no dia; <strong>Janta</strong> avisa só quem está no turno 1800-2100 (serviço diário, sem turno, avisa só no almoço). <strong>Sábado e domingo não têm aviso.</strong> Quem está na função <strong>RETÉM</strong> é avisado só no almoço. A <strong>autorização</strong> traz o motivo escrito nela e vale só para a refeição indicada.</li>
<li>O rancho corrido <strong>vale só no dia</strong> do arquivo e é <strong>apagado à meia-noite</strong> desse dia. O cartão <strong>Já publicado nesta semana</strong> mostra, dia a dia, o que já foi enviado (a tabela de serviço e cada autorização, pelo motivo) e quantos alunos; o dia some da lista quando passa.</li>
<li>Se alguém publicar algo errado, um administrador remove o dia pelo painel.</li>
</ul>`,
  },
  {
    id: "salvar", titulo: "9. Salvamento automático e limpeza",
    html: `<ul class="lista">
<li>A cada marcação, o sistema <strong>salva sozinho</strong> o seu progresso (aparece "Rascunho salvo às ..."). Se você fechar a janela ou atualizar a página sem querer, abra o site de novo: as listas e as marcações voltam do jeito que estavam.</li>
<li>O rascunho é <strong>só seu</strong> (ninguém vê o de outra pessoa) e fica guardado <strong>cifrado</strong> por até 7 dias.</li>
<li>Quando terminar e já tiver a rela, toque em <strong>Limpar marcações e dados</strong>. Isso apaga as listas, as marcações e o rascunho salvo. A planilha da semana continua aberta.</li>
<li>Se aparecer "Sua sessão acabou", entre de novo para voltar a salvar.</li>
</ul>`,
  },
  {
    id: "extras", titulo: "10. Menu, tema e sair",
    html: `<ul class="lista">
<li>O botão <strong>Menu</strong> no alto reúne os atalhos: <strong>Conferência geral</strong>, <strong>Rancho corrido</strong>, <strong>Como usar</strong> (e <strong>Administrador</strong>, para quem é administrador). Dentro da Conferência Geral ou do Rancho corrido, o primeiro item vira <strong>Voltar ao app</strong>.</li>
<li>O botão de <strong>sol/lua</strong> no alto troca entre tema claro e escuro; o sistema lembra sua escolha.</li>
<li><strong>Como usar</strong> abre este guia. Para continuar de onde parou, toque em <strong>Voltar ao app</strong>: suas listas e marcações ficam salvas e voltam sozinhas.</li>
<li><strong>Sair</strong> fica no fim da página. Use sempre que terminar, principalmente em aparelho de outra pessoa.</li>
</ul>
<h3>O que fica guardado</h3>
<ul class="lista">
<li>A planilha da semana fica <strong>cifrada</strong> no servidor por até 14 dias; só quem entrou no sistema a vê.</li>
<li>Seu rascunho fica cifrado por até 7 dias.</li>
<li>O sistema registra quem entrou, quando e o que fez (abrir o app, baixar arquivos), com o endereço de rede parcial, por 30 dias. Nunca registra seu número interno.</li>
</ul>`,
  },
  {
    id: "problemas", titulo: "11. Deu algum problema?",
    html: `<ul class="lista">
<li><strong>"Nome, número interno ou senha incorretos":</strong> confira o nome de guerra (acentos e maiúsculas não importam), o número interno e a senha.</li>
<li><strong>"Muitas tentativas erradas":</strong> espere 15 minutos. O contador de erros também zera todo dia à meia-noite.</li>
<li><strong>Não aparece a planilha:</strong> ainda não foi publicada; peça a um administrador.</li>
<li><strong>O arquivo do rancho corrido não foi lido:</strong> veja os avisos da tela de conferência. Confira se é a tabela de serviço ou a autorização preenchidas (não o formulário em branco) e se o arquivo é PDF, XLSX ou CSV. Foto não é lida: envie o arquivo da tabela.</li>
<li><strong>A Conferência geral está vazia:</strong> ninguém marcou presença naquele dia ainda, ou a listagem é de ontem (ela só vale no próprio dia).</li>
<li><strong>Não baixa o arquivo no iPhone:</strong> toque em <strong>Baixar PDF</strong> de novo; o arquivo vai para o app Arquivos.</li>
<li><strong>A página pediu para entrar de novo:</strong> a sessão acabou. Entre; seu rascunho está salvo.</li>
</ul>`,
  },
  {
    id: "admin-entrar", titulo: "Administradores: entrar e publicar a planilha", admin: true,
    html: `<ol class="passos">
<li>No login, escolha <strong>Entrar como: Administrador</strong> e use a <strong>senha de administrador</strong> (é outra, diferente da dos alunos).</li>
<li>Se ainda não há planilha publicada, abre a tela de envio. Se já há, toque em <strong>Nova planilha</strong> (no alto).</li>
<li>Escolha o arquivo: <strong>XLSX</strong> (o melhor), <strong>CSV</strong> (um por turma, escolhidos de uma vez) ou <strong>PDF</strong>, até 10 MB. A data da sexta-feira é opcional (no XLSX é lida sozinha).</li>
<li>Toque em <strong>Ler planilha</strong> e confira o resumo e a <strong>Conferência da planilha</strong> (avisos de contagens que não batem, turmas assumidas etc.).</li>
<li>Se estiver tudo certo, toque em <strong>Publicar para os alunos</strong>. Pronto: eles abrem o site e a planilha já está lá.</li>
</ol>
<p class="dica">A planilha publicada fica cifrada e some sozinha em 14 dias (dá para removê-la antes pelo painel). Publicar uma planilha nova descarta os rascunhos antigos de todo mundo. A leitura do arquivo acontece no seu aparelho; só o resultado é enviado.</p>`,
  },
  {
    id: "admin-painel", titulo: "Administradores: o painel", admin: true,
    html: `<p>Toque em <strong>Menu → Administrador</strong> no alto do app para abrir o painel.</p>
<ul class="lista">
<li><strong>Liberar novo acesso:</strong> nome de guerra e número interno da pessoa. O nome precisa ser único (acrescente o sobrenome se repetir).</li>
<li><strong>Pessoas com acesso:</strong> lista de todos, com o papel e o <strong>número interno</strong> ao lado do nome (todos os administradores veem o de todos, para conferir). <strong>Excluir acesso</strong> vale na hora, até para quem está com o app aberto. Administrador não é excluído direto. O número de quem já estava cadastrado aparece depois do primeiro login da pessoa.</li>
<li><strong>Baixar lista (.txt)</strong> e <strong>Copiar lista</strong>: a rela de quem está liberado (nomes e papéis, sem números internos).</li>
<li><strong>Rancho corrido:</strong> mostra, dia a dia, quem publicou e quantos alunos. <strong>Remover o dia</strong> apaga o que estiver errado.</li>
<li><strong>Planilha da semana:</strong> mostra quem publicou e quando. <strong>Ver a planilha</strong> abre uma tabela, turma por turma, só para conferir o que foi lido (inclusive quando o arquivo era PDF), sem baixar. Também permite <strong>remover</strong> a planilha publicada.</li>
<li><strong>Último acesso de cada pessoa</strong> e <strong>Registro de eventos:</strong> quem entrou, tentativas recusadas, downloads. O filtro aceita <strong>nome de guerra</strong> ou <strong>número interno</strong> (a busca por número interno vale só para alunos) e tem a opção <strong>Só tentativas recusadas</strong>, para achar rápido quem errou a senha ou tentou algo sem permissão.</li>
</ul>`,
  },
  {
    id: "admin-codigos", titulo: "Administradores: senhas de acesso", admin: true,
    html: `<p>No cartão <strong>Senhas de acesso</strong> do painel:</p>
<ul class="lista">
<li>Ranchef e administradores trocam a <strong>senha dos alunos</strong>. Só o <strong>ranchef</strong> troca a <strong>senha dos administradores</strong>.</li>
<li>Digite a senha nova duas vezes (de 8 a 64 caracteres) e <strong>seu número interno</strong> para confirmar. As duas senhas precisam ser diferentes.</li>
<li>A troca vale para os <strong>próximos logins</strong>; quem já está dentro continua até a sessão acabar. Depois, passe a senha nova às pessoas.</li>
<li><strong>Troque a senha dos alunos a cada 30 dias.</strong> O painel mostra há quantos dias foi a última troca e avisa quando passa de 30.</li>
<li>Se um perfil estiver sem senha definida, o painel avisa e <strong>ninguém consegue entrar nele</strong> até alguém definir um.</li>
</ul>`,
  },
  {
    id: "admin-papeis", titulo: "Administradores: papéis", admin: true,
    html: `<ul class="lista">
<li><strong>Administrador ranchef</strong> (um só): tem poder sobre os outros administradores. Promove alunos a administrador, remove administradores da função, troca a senha dos administradores, baixa o backup da lista e pode <strong>transferir o cargo de ranchef</strong> a outra pessoa (cartão <strong>Transferir o cargo de ranchef</strong> do painel); ao transferir, quem passa o cargo vira administrador.</li>
<li><strong>Administradores</strong> (até 2): liberam e excluem alunos, publicam a planilha, trocam a senha dos alunos e veem o registro.</li>
<li><strong>Alunos:</strong> usam o app, marcam e geram a rela.</li>
</ul>
<p class="dica">Se o sistema ficar sem ranchef, um administrador vê no painel o cartão <strong>Assumir o cargo de ranchef</strong>. Ninguém altera a si mesmo, e o ranchef não é alterado pelo site. Quem é administrador mas entra como <strong>Aluno</strong> usa o app sem os poderes de administrador naquela sessão.</p>`,
  },
];

function html(admin) {
  const visiveis = SECOES.filter((x) => !x.admin || admin);
  const indice = visiveis.map((x) => `<a href="#${x.id}">${x.titulo}</a>`).join("");
  const cartoes = visiveis
    .map((x) => `<section class="cartao${x.admin ? " guia-admin" : ""}" id="${x.id}" aria-labelledby="t-${x.id}"><h2 id="t-${x.id}">${x.titulo}</h2>\n${x.html}</section>`)
    .join("\n");
  const rodape = admin ? "" : `<p class="dica">Você é administrador? Entre como <strong>Administrador</strong> para ver também as instruções do painel.</p>`;
  return `<div class="titulo-pagina"><h1>Como usar</h1>
<p>Guia rápido da Conferência CIAGA: da entrada no sistema até a rela pronta${admin ? ", com a parte de administrador no fim" : ""}.</p></div>
<nav class="cartao indice" aria-label="Índice do guia"><h2>Neste guia</h2><div class="indice-links">${indice}</div></nav>
${cartoes}
${rodape}`;
}

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess || (await pessoas.removido(sess.u))) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  const admin = (await pessoas.papelAtual(sess.u, sess)) >= 1;
  const links = [{ href: "/app", texto: "Voltar ao app" }];
  if (admin) links.push({ href: "/admin", texto: "Administrador" });
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", CSP_PAGINA);
  res.setHeader("Cache-Control", "no-store");
  res.end(pagina({ titulo: "Como usar", links, sair: true, corpo: html(admin) }));
};
