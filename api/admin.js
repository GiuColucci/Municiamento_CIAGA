const s = require("./_lib/seguranca");
const reg = require("./_lib/registro");
const pessoas = require("./_lib/pessoas");
const cofre = require("./_lib/cofre");
const acessos = require("./_lib/acessos");
const { esc, pagina, CSP_PAGINA } = require("./_lib/layout");

const ROTULO = {
  login_ok: "Entrou",
  login_falha: "Tentativa recusada",
  app_aberto: "Abriu o app",
  planilha_carregada: "Carregou planilha",
  baixar_pdf: "Baixou PDF",
  baixar_docx: "Baixou DOCX",
  sair: "Saiu",
  login_admin: "Entrou como administrador",
  admin_cadastrou: "Liberou acesso",
  admin_promoveu: "Promoveu a administrador",
  admin_rebaixou: "Removeu de administrador",
  admin_removeu: "Excluiu acesso",
  admin_exportou: "Baixou o backup da lista",
  admin_baixou_lista: "Baixou a lista de liberados",
  admin_publicou_planilha: "Publicou a planilha da semana",
  admin_removeu_planilha: "Removeu a planilha publicada",
  admin_viu_planilha: "Abriu a planilha publicada",
  viu_conferencia_geral: "Abriu a conferência geral",
  admin_mudou_codigo_aluno: "Trocou a senha dos alunos",
  admin_transferiu_ranchef: "Transferiu o cargo de ranchef",
  admin_assumiu_ranchef: "Assumiu o cargo de ranchef",
  admin_mudou_codigo_admin: "Trocou a senha dos administradores",
  admin_negado: "Tentou ação sem permissão",
};

const MSG = {
  m: {
    cadastrar: "Acesso liberado.",
    promover: "Agora é administrador.",
    rebaixar: "Deixou de ser administrador.",
    remover: "Acesso excluído.",
    limpar_planilha: "Planilha publicada removida.",
    assumir_ranchef: "Você agora é o administrador ranchef.",
    transferir_ranchef: "Cargo de ranchef transferido. Você agora é administrador; o poder sobre os administradores passou para a outra pessoa.",
    codigo_aluno: "Senha dos alunos trocada. Passe a nova senha aos alunos; vale a partir do próximo login.",
    codigo_admin: "Senha dos administradores trocada. Passe a nova senha aos outros administradores.",
  },
  e: {
    dados_invalidos: "Nome ou número interno inválido (o número tem o formato B1234).",
    limite_pessoas: "Limite de pessoas cadastradas atingido.",
    ja_existe: "Já existe alguém com esse nome. Use um nome diferente (acrescente o sobrenome).",
    nao_encontrado: "Pessoa não encontrada.",
    limite_admins: "Já existem 2 administradores além do ranchef. Remova um da função antes de promover outro.",
    proprio: "Você não pode fazer isso com você mesmo.",
    e_admin: "Administrador não pode ser excluído. O administrador ranchef precisa removê-lo da função antes.",
    e_ranchef: "O administrador ranchef não pode ser alterado pelo site.",
    sem_permissao: "Só o administrador ranchef pode promover ou remover administradores.",
    sem_banco: "Banco de registro não configurado.",
    codigo_curto: "A senha precisa ter de 8 a 64 caracteres.",
    codigo_diferente: "Os dois campos da senha nova não são iguais.",
    codigo_igual_outro: "Alunos e administradores precisam de senhas diferentes. Escolha outro.",
    confirmacao: "Seu número interno não confere. A troca não foi feita.",
    limite: "Muitas tentativas. Aguarde alguns minutos.",
    ja_tem_ranchef: "Já existe um administrador ranchef.",
    limite_admins_transferir: "Já existem 2 administradores. Para passar o cargo a um aluno, remova antes um administrador da função (você vira administrador ao transferir).",
    falha: "Não consegui concluir. Tente de novo.",
  },
};

const quando = (t) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });

function aparelho(ua) {
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "?";
  const nav = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
  return so + (nav ? " · " + nav : "");
}

const aviso = (q) =>
  MSG.m[q.get("m")] ? `<p class="alerta ok" role="status">${esc(MSG.m[q.get("m")])}</p>`
  : MSG.e[q.get("e")] ? `<p class="alerta erro" role="alert">${esc(MSG.e[q.get("e")])}</p>` : "";

function enviar(res, status, html, extraHeaders) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", CSP_PAGINA);
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(extraHeaders || {})) res.setHeader(k, v);
  res.end(html);
}

function quemTrocou(sit) {
  if (!sit) return "";
  if (sit.origem === "painel") {
    const dias = Math.floor((Date.now() - sit.em) / 86400000);
    const prazo = dias >= 30 ? ` <strong>Faz ${dias} dias: troque agora (o recomendado é a cada 30 dias).</strong>` : ` Troque de novo em até ${30 - dias} dias (recomendado: a cada 30 dias).`;
    return `Trocada por ${esc(sit.por)} em ${esc(quando(sit.em))}.${prazo}`;
  }
  return sit.configurado ? "Ainda não foi trocada pelo painel. <strong>Troque agora e depois a cada 30 dias.</strong>"
    : "ATENÇÃO: não há senha definida, então ninguém consegue entrar neste perfil. Defina um abaixo.";
}

function cartaoAssumir() {
  return `<section class="cartao">
<h2>Não há administrador ranchef</h2>
<p class="dica">O sistema está sem ranchef, e só o ranchef promove administradores, troca a senha dos administradores e baixa o backup. Como administrador, você pode assumir o cargo agora. Depois, o ranchef pode passá-lo a outra pessoa quando quiser.</p>
<form class="form-codigo" method="post" action="/api/admin-acao" autocomplete="off">
<input type="hidden" name="acao" value="assumir_ranchef">
<div class="campo"><label for="as-c">Seu número interno (para confirmar)</label><input id="as-c" name="confirmar" type="password" autocomplete="off" required></div>
<button class="botao secundario" type="submit">Assumir o cargo de ranchef</button>
</form>
</section>`;
}

function cartaoTransferir(st, eu) {
  const opcoes = [...st.pessoas]
    .filter(([n]) => n !== eu)
    .sort(([an, a], [bn, b]) => (a.d || an).localeCompare(b.d || bn, "pt-BR"))
    .map(([n, v]) => `<option value="${esc(n)}">${esc(v.d || n)} (${esc(pessoas.ROTULO_PAPEL[v.adm] || "Aluno")})</option>`)
    .join("");
  return `<section class="cartao">
<h2>Transferir o cargo de ranchef</h2>
<p class="dica">Escolha quem passa a ser o <strong>administrador ranchef</strong>. A partir daí, você vira <strong>administrador</strong> comum e a pessoa escolhida passa a ter o poder sobre os administradores. Só existe um ranchef por vez. Se a pessoa for aluno, o total de administradores sobe em um (o limite é 2, além do ranchef).</p>
<form class="form-codigo" method="post" action="/api/admin-acao" autocomplete="off">
<input type="hidden" name="acao" value="transferir_ranchef">
<div class="campo"><label for="tr-n">Nova pessoa ranchef</label><select id="tr-n" name="nome" required><option value="">Escolha uma pessoa</option>${opcoes}</select></div>
<div class="campo"><label for="tr-c">Seu número interno (para confirmar)</label><input id="tr-c" name="confirmar" type="password" autocomplete="off" required></div>
<button class="botao perigo" type="submit">Transferir o cargo</button>
</form>
</section>`;
}

function formCodigo(acao, titulo, sit) {
  return `<form class="form-codigo" method="post" action="/api/admin-acao" autocomplete="off">
<h3>${esc(titulo)}</h3>
<p class="dica">${quemTrocou(sit)}</p>
<input type="hidden" name="acao" value="${acao}">
<div class="campo"><label for="${acao}-n">Senha nova (8 a 64 caracteres)</label><input id="${acao}-n" name="novo" type="password" autocomplete="new-password" minlength="8" maxlength="64" required></div>
<div class="campo"><label for="${acao}-r">Repita a senha nova</label><input id="${acao}-r" name="repetir" type="password" autocomplete="new-password" minlength="8" maxlength="64" required></div>
<div class="campo"><label for="${acao}-c">Seu número interno (para confirmar)</label><input id="${acao}-c" name="confirmar" type="password" autocomplete="off" required></div>
<button class="botao secundario" type="submit">Trocar senha</button>
</form>`;
}

function cartaoCodigos(papel, sit) {
  const alunos = formCodigo("codigo_aluno", "Senha dos alunos", sit.aluno);
  const admins = papel === 2 ? formCodigo("codigo_admin", "Senha dos administradores", sit.admin)
    : `<div class="form-codigo"><h3>Senha dos administradores</h3><p class="dica">${quemTrocou(sit.admin)} Só o administrador ranchef troca esta senha.</p></div>`;
  return `<p class="dica">É a senha pedida no login, além do nome e do número interno. A troca vale para os próximos logins; quem já está dentro continua até a sessão acabar. As duas senhas precisam ser diferentes.</p>
<div class="grade-codigos">${alunos}${admins}</div>`;
}

const botao = (acao, nome, rotulo, classe, extra) =>
  `<form method="post" action="/api/admin-acao"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="nome" value="${esc(nome)}"><button class="botao ${classe} pequeno" ${extra || ""}>${rotulo}</button></form>`;

module.exports = async (req, res) => {
  const sess = s.lerSessao(req);
  if (!sess) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  const papel = await pessoas.papelAtual(sess.u, sess);
  if (papel < 1) {
    await reg.registrar(req, sess.u, "admin_negado");
    return enviar(res, 403, pagina({ titulo: "Acesso negado", centro: true, links: [{ href: "/app", texto: "Voltar ao app" }], sair: true,
      corpo: `<section class="cartao estreito"><h1>Acesso negado</h1><p class="dica">Este painel só abre para administradores que escolheram “Administrador” ao entrar. Saia e entre de novo nessa opção.</p></section>` }));
  }
  const q = new URL(req.url, "http://x").searchParams;

  await reg.registrar(req, sess.u, "admin_consulta");
  // Filtro do registro: nome de guerra (sem diferenciar acento/maiúscula) ou número interno.
  const consulta = String(q.get("u") || "").trim();
  const soFalhas = q.get("f") === "falhas"; // só tentativas recusadas (senha errada, sem permissão)
  const nomeBuscado = s.normalizarNome(consulta);
  let nomesDoCodigo = null; // nomes (normalizados) de quem tem o código buscado
  let notaBusca = "";
  if (/^[BMN]\d{4}$/i.test(consulta)) {
    if (s.limitar("busca:" + sess.u, 20, 15 * 60 * 1000)) {
      nomesDoCodigo = [];
      notaBusca = "Muitas buscas por número interno. Aguarde alguns minutos.";
    } else {
      try {
        const achados = await pessoas.acharPorCodigo(consulta);
        nomesDoCodigo = achados.map((a) => a.n);
        notaBusca = achados.length
          ? `Número interno ${consulta.toUpperCase()}: ${achados.map((a) => a.d).join(", ")}.`
          : "Nenhum aluno com esse número interno (a busca por número interno vale só para alunos).";
      } catch {
        nomesDoCodigo = [];
        notaBusca = "Não consegui buscar por número interno agora.";
      }
    }
  }
  const combina = (e) => {
    if (!consulta) return true;
    const quem = s.normalizarNome(e.u);
    const alvo = s.normalizarNome(e.alvo || "");
    return nomesDoCodigo ? nomesDoCodigo.includes(quem) || nomesDoCodigo.includes(alvo) : quem.includes(nomeBuscado) || alvo.includes(nomeBuscado);
  };
  const meuNome = await pessoas.nomeExibido(sess.u);
  const situacaoCodigo = {};
  try { situacaoCodigo.aluno = await acessos.situacao(false); situacaoCodigo.admin = await acessos.situacao(true); } catch { /* o cartão mostra só o formulário */ }
  let publicada = null;
  try { const pl = await cofre.lerPlanilha(); publicada = pl ? { por: pl.por, em: pl.em } : null; } catch { publicada = undefined; }
  let st = null;
  try { st = await pessoas.estado(); } catch { /* painel de pessoas some se não der para ler */ }
  let eventos = null;
  let erro = "";
  try {
    eventos = await reg.ler(1000);
  } catch (e) {
    erro = "Não consegui ler o registro.";
  }
  if (eventos === null && !erro) erro = "O registro de eventos não está disponível no momento.";
  const corte = Date.now() - reg.DIAS_GUARDA * 86400000;
  eventos = (eventos || []).filter((e) => e.t >= corte && e.a !== "admin_consulta" && (!soFalhas || e.a === "login_falha" || e.a === "admin_negado") && combina(e));

  const ultimos = new Map();
  for (const e of eventos) if (e.a === "login_ok" && !ultimos.has(e.u)) ultimos.set(e.u, e);
  const linhas = eventos
    .slice(0, 300)
    .map(
      (e) =>
        `<tr class="${e.a === "login_falha" || e.a === "admin_negado" ? "falha" : ""}"><td data-rotulo="Quando">${esc(quando(e.t))}</td><td data-rotulo="Quem">${esc(e.u)}</td><td data-rotulo="O que fez">${esc((ROTULO[e.a] || e.a) + (e.alvo ? ": " + e.alvo : ""))}</td><td data-rotulo="IP">${esc(e.ip)}</td><td data-rotulo="Aparelho">${esc(aparelho(e.ua || ""))}</td></tr>`
    )
    .join("");
  const resumo = [...ultimos.values()]
    .map((e) => `<tr><td data-rotulo="Quem">${esc(e.u)}</td><td data-rotulo="Quando">${esc(quando(e.t))}</td><td data-rotulo="IP">${esc(e.ip)}</td></tr>`)
    .join("");

  let pessoasHtml = `<section class="cartao"><p class="alerta aviso">Não consegui ler a lista de pessoas (banco indisponível).</p></section>`;
  if (st) {
    const ordem = (n) => (st.pessoas.get(n).adm === 2 ? 0 : st.pessoas.get(n).adm === 1 ? 1 : 2);
    const nomes = [...st.pessoas.keys()].sort((a, b) => ordem(a) - ordem(b) || a.localeCompare(b, "pt-BR"));
    const cheio = st.admins.size >= pessoas.MAX_ADMINS;
    const linhasP = nomes
      .map((n) => {
        const v = st.pessoas.get(n);
        const acoes = [];
        if (n !== sess.u) {
          if (v.adm === 0) {
            if (papel === 2) acoes.push(botao("promover", n, "Tornar administrador", "sec", cheio ? "disabled" : ""));
            acoes.push(botao("remover", n, "Excluir acesso", "perigo"));
          } else if (v.adm === 1 && papel === 2) {
            acoes.push(botao("rebaixar", n, "Remover de administrador", "sec"));
          }
        }
        const classe = v.adm === 2 ? "ranchef" : v.adm === 1 ? "admin" : "";
        // todos os administradores (e o ranchef) conferem o número interno de todas as pessoas cadastradas
        const cod = pessoas.lerCodigo(v);
        return `<tr><td data-rotulo="Nome">${esc(v.d || n)}${cod ? ` <span class="codigo-aluno">${esc(cod)}</span>` : ""}</td><td data-rotulo="Papel"><span class="selo-papel ${classe}">${esc(pessoas.ROTULO_PAPEL[v.adm] || "Aluno")}</span></td><td data-rotulo="Ações" class="sem-rotulo"><div class="acoes">${acoes.join("") || '<span class="dica">—</span>'}</div></td></tr>`;
      })
      .join("");
    const ranchef = st.ranchef ? esc(st.pessoas.get(st.ranchef).d || st.ranchef) : "não definido";
    pessoasHtml = `<div class="grade-painel duas">
<section class="cartao">
<h2>Liberar novo acesso</h2>
<form method="post" action="/api/admin-acao" autocomplete="off">
<input type="hidden" name="acao" value="cadastrar">
<div class="linha-form">
<div class="campo"><label for="nn">Nome de guerra</label><input id="nn" name="nome" type="text" maxlength="40" required></div>
<div class="campo"><label for="nc">Número interno</label><input id="nc" name="codigo" type="text" maxlength="5" placeholder="B1234" autocapitalize="characters" required></div>
<button class="botao" type="submit">Liberar acesso</button>
</div></form>
<p class="dica">A pessoa entra com esse nome e esse número interno, mais a senha.</p>
</section>
<section class="cartao">
<h2>Administradores</h2>
<p>Ranchef: <strong>${ranchef}</strong></p>
<p>Administradores: <strong>${st.admins.size} de ${pessoas.MAX_ADMINS}</strong></p>
<p class="dica">Ranchef e administradores liberam e excluem alunos. Só o administrador ranchef promove ou remove administradores${papel === 2 ? ' e baixa o <a href="/api/admin-exportar">backup da lista</a>' : ""}.</p>
</section></div>
<section class="cartao">
<h2>Senhas de acesso</h2>
${cartaoCodigos(papel, situacaoCodigo)}
</section>
${papel === 2 && st ? cartaoTransferir(st, sess.u) : ""}
${papel === 1 && st && !st.ranchef ? cartaoAssumir() : ""}
<section class="cartao">
<h2>Planilha da semana</h2>
${
  publicada === undefined ? '<p class="dica">Não consegui ler a planilha publicada agora.</p>'
  : publicada ? `<p>Publicada por <strong>${esc(publicada.por)}</strong> em ${esc(quando(publicada.em))}. Fica cifrada e some sozinha em 14 dias.</p>
<div class="acoes-cartao"><a class="botao sec pequeno" href="/admin/planilha">Ver a planilha</a>
<form method="post" action="/api/admin-acao"><input type="hidden" name="acao" value="limpar_planilha"><button class="botao perigo pequeno" type="submit">Remover planilha publicada</button></form></div>`
  : '<p class="dica">Nenhuma planilha publicada. No app, leia a planilha e use Publicar para os alunos.</p>'
}
</section>
<section class="cartao">
<h2>Pessoas com acesso (${st.pessoas.size})</h2>
<div class="acoes-cartao">
<a class="botao sec pequeno" href="/api/admin-lista">Baixar lista (.txt)</a>
<button type="button" class="botao sec pequeno" data-copiar data-rotulo="Copiar lista" data-texto="${esc(pessoas.textoLista(st, meuNome))}">Copiar lista</button>
<span id="aviso-copia" class="dica" role="status" aria-live="polite"></span>
</div>
<div class="rolar"><table class="resp"><thead><tr><th>Nome</th><th>Papel</th><th>Ações</th></tr></thead><tbody>${linhasP}</tbody></table></div>
</section>`;
  }

  const classePapel = papel === 2 ? "ranchef" : "admin";
  const corpo = `<div class="titulo-pagina"><h1>Painel do administrador</h1>
<p><strong>${esc(meuNome)}</strong> <span class="selo-papel ${classePapel}">${esc(pessoas.ROTULO_PAPEL[papel])}</span></p></div>
${aviso(q)}${erro ? `<p class="alerta aviso">${esc(erro)}</p>` : ""}
${pessoasHtml}
<section class="cartao">
<h2>Último acesso de cada pessoa</h2>
<div class="rolar"><table class="resp"><thead><tr><th>Quem</th><th>Quando</th><th>IP</th></tr></thead><tbody>${resumo || '<tr><td colspan="3">Nenhum acesso ainda.</td></tr>'}</tbody></table></div>
</section>
<section class="cartao">
<h2>Registro de eventos (${Math.min(eventos.length, 300)})</h2>
<p class="dica">Horários de Brasília. IP parcial. Eventos apagados após 30 dias.</p>
<form method="get" class="linha-form"><div class="campo"><label for="f">Filtrar por nome de guerra ou número interno</label><input id="f" name="u" type="text" value="${esc(consulta)}" placeholder="Ex.: Alves ou B1037" autocapitalize="none" autocomplete="off"></div><label class="filtro-falhas"><input type="checkbox" name="f" value="falhas"${soFalhas ? " checked" : ""}><span class="marca" aria-hidden="true"></span>Só tentativas recusadas</label><button class="botao sec" type="submit">Filtrar</button>${consulta || soFalhas ? '<a class="botao sec" href="/admin">Limpar</a>' : ""}</form>
${notaBusca ? `<p class="alerta aviso" role="status">${esc(notaBusca)}</p>` : ""}
<div class="rolar"><table class="resp"><thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th><th>IP</th><th>Aparelho</th></tr></thead><tbody>${linhas || '<tr><td colspan="5">Nada registrado.</td></tr>'}</tbody></table></div>
</section>`;

  enviar(res, 200, pagina({ titulo: "Painel do administrador", links: [{ href: "/app", texto: "Voltar ao app" }, { href: "/ajuda", texto: "Como usar" }], sair: true, scripts: ["/painel.js"], corpo }));
};
