# Conferência CIAGA na Vercel (login + criptografia)

Fluxo: `/` (login) → `POST /api/login` → cookie assinado (HttpOnly, Secure, SameSite=Strict, 12 h) → `/app` entrega o app decifrado só para quem tem sessão e ainda tem acesso. `/sair` encerra. `/admin` é o painel dos administradores.

- O deploy contém só `dados/app.enc` (app cifrado com AES-256-GCM, chave `APP_KEY`).
- **Toda a lista de pessoas com acesso fica no banco (Upstash Redis)**: nome, sal e hash do código (HMAC com a `PEPPER` + scrypt), e o papel (aluno, administrador ou administrador ranchef). Entrada, saída e promoção de pessoas são feitas em `/admin`, **sem novo deploy**.
- A planilha dos alunos nunca é enviada ao servidor; o app a lê no próprio aparelho.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | O que é |
|---|---|
| `APP_KEY` | 64 hex; cifra/decifra o app (`dados/app.enc`) |
| `SESSION_SECRET` | assina os cookies de sessão; trocar derruba todas as sessões |
| `PEPPER` | segredo que protege os hashes dos códigos no banco. **Nunca troque**: invalida todos os códigos (aí é só recarregar a lista) |
| `ACCESS_CODE` | código de acesso de quem entra como **aluno** (terceiro campo do login). **Obrigatório**: sem ele (ou com o nome errado, como `ACESS_CODE`) ninguém entra como aluno. Pode ser trocado depois pelo painel |
| `ACCESS_CODE_ADMIN` | código de acesso de quem entra como **administrador**. **Obrigatório**: sem ele ninguém entra como administrador. Use uma chave diferente da `ACCESS_CODE` |
| `DATA_KEY` | 64 hex; cifra a planilha publicada e os rascunhos no banco. Só existe na Vercel. **Nunca troque** (a planilha e os rascunhos salvos deixam de abrir; é só publicar de novo) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | criadas sozinhas ao conectar o Upstash Redis ao projeto |
| `USERS` | opcional: contas extras da equipe (`scripts/hash-senha.mjs`) |

Gerar `APP_KEY`, `SESSION_SECRET`, `PEPPER` e `DATA_KEY` (4 valores diferentes; guarde-os num gerenciador de senhas):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Publicar (uma vez)

1. Vercel → Storage → Marketplace → **Upstash Redis** (plano gratuito) → conectar ao projeto.
2. Cadastrar as variáveis da tabela acima.
3. Cifrar o app (use a mesma `APP_KEY`; em PowerShell: `$env:APP_KEY="..."`):
   ```bash
   node scripts/cifrar.mjs "../Versão 3/1 - Conferência Digital/conferencia_digital.html"
   ```
4. `npx vercel --prod` dentro desta pasta.
5. Carregar a lista inicial no banco (no PowerShell, na pasta `vercel`; os valores do Upstash estão em Storage → seu banco → REST API; a `PEPPER` é a mesma da Vercel):
   ```powershell
   $env:KV_REST_API_URL="https://..."
   $env:KV_REST_API_TOKEN="..."
   $env:PEPPER="..."
   node scripts/carregar-lista.mjs ..\AUTORIZADOS.txt
   ```
   `AUTORIZADOS.txt` (fora do projeto): uma pessoa por linha, `nome;código`, `nome;código;admin` ou `nome;código;ranchef`; `#` comenta. Nomes devem ser únicos. No máximo 1 ranchef e 2 administradores. Quem já está no banco não é alterado (única exceção: se ainda não existe ranchef, a pessoa marcada como `ranchef` vira ranchef).
6. No iPhone (Safari): abrir o endereço, entrar e usar "Adicionar à Tela de Início".

## Dia a dia (tudo em `/admin`, sem deploy)
- **Papéis**: **administrador ranchef** (um só), **administradores** (no máximo 2) e alunos. São 3 administradores no total.
- **Ranchef e administradores**: liberam acesso (nome de guerra + código), excluem alunos (vale na hora, até para quem está com o app aberto) e veem o registro de acessos.
- **Só o ranchef** tem poder sobre os outros administradores: promove aluno a administrador, remove administrador da função e baixa o backup. O ranchef não é alterado pelo site (só pelo script no computador).
- **Entrar como administrador (escolha no login)**: a tela de login tem "Entrar como" **Aluno** ou **Administrador**. Só quem tem a função consegue escolher Administrador; quem escolhe Aluno entra sem poderes de administrador, mesmo sendo administrador. A sessão de administrador dura **2 horas** (a de aluno, 12 h). Para mudar de modo, é preciso sair e entrar de novo.
- Aluno comum não vê o painel; as ações dele são negadas e registradas. O papel é conferido ao vivo a cada ação (quem for rebaixado perde o poder na hora).
- Ninguém altera a si mesmo. Administrador não é excluído direto: o ranchef primeiro o remove da função.
- No app, o botão **Administrador** aparece no cabeçalho (só em sessão de administrador) e o botão **Sair** fica no **fim da página**, como um botão comum (não fixo na tela). No painel também: Sair ao final.
- **Registro de acessos**: quem entrou, tentativas recusadas, abriu o app, carregou planilha, baixou PDF/DOCX, ações de admin, com horário de Brasília e IP mascarado (`187.12.x.x`). Guarda até 5.000 eventos e apaga os de mais de 30 dias. Nunca grava código de aluno, senha nem planilha.
- **Backup**: "Baixar backup da lista" (em `/admin`) gera um JSON com nomes e hashes. Para restaurar num banco vazio: `node scripts/carregar-lista.mjs lista-acessos-AAAA-MM-DD.json` (com a mesma `PEPPER`). Faça backup de vez em quando.

## Manutenção rara (exige deploy)
- Nova versão do app: repita o passo 3 e `npx vercel --prod`.
- Troca de versão do Node ou outras exigências da Vercel; vazamento de chave (troque a variável e faça redeploy).
- Revogar todas as sessões: troque `SESSION_SECRET`.
- Testes: `npm run teste`.

## Limites e cuidados
- Planos gratuitos podem mudar limites ou arquivar bancos inativos: confira a política do Upstash/Vercel e mantenha o backup da lista.
- O limite de tentativas de login é por instância (somado a atraso de 0,8 s e ao custo do scrypt). Ative o rate limit do Vercel Firewall em `/api/login`.
- Código de aluno tem poucas combinações: por isso há o código da unidade e a `PEPPER`. Se alguém de fora souber o `ACCESS_CODE`, troque a variável e redeploye.
- Quem tem login recebe o app em claro no navegador; a criptografia protege o que está hospedado, não contra usuário autorizado.
- A CSP do app permite `unsafe-inline`/`unsafe-eval` porque o HTML único embute pdf.js/xlsx; ela bloqueia conexões a outros domínios.
- LGPD: avise os usuários que os acessos são registrados (IP parcial, horário, ações).
- Se o banco cair, ninguém consegue entrar (o login depende dele); o app em si continua cifrado e seguro.

## Filtro do registro e lista dos liberados (painel)
- **Filtro do registro**: aceita nome de guerra (parte do nome, sem diferenciar acento ou maiúscula) ou código de aluno (ex.: `B1037`). Pelo código, o painel mostra de quem é e filtra os eventos dessa pessoa. O código não é guardado em lugar nenhum: a busca confere o hash de cada aluno. Por segurança, **a busca por código só vale para alunos** (não revela código de administrador) e tem limite de 20 buscas a cada 15 minutos por administrador.
- **Rela dos liberados**: no cartão "Pessoas com acesso", **Baixar lista (.txt)** e **Copiar lista**. Traz nome e papel (ranchef, administradores e alunos), numerados, com total e data. **Não traz códigos de aluno** (eles não são guardados). O download fica registrado; a cópia não.

## Planilha da semana, rascunho e filtros (novo)
- **Quem publica**: só quem entra como **administrador** (administrador ou ranchef). Ele abre o app, lê o XLSX/CSV/PDF e clica em **Publicar para os alunos**. O servidor confere de novo, a cada envio, que a pessoa é administrador.
- **Segurança no banco**: a planilha publicada vai para o Upstash **cifrada** (AES-256-GCM, chave derivada da `DATA_KEY`, que só existe na Vercel). Quem roubar o banco inteiro vê só texto cifrado: nenhum nome, turma, código ou marcação da planilha. A chave do banco também não leva nomes. A planilha some sozinha em **14 dias** (e o administrador pode removê-la antes, no painel, em "Planilha da semana").
- **Alunos**: ao entrar em `/app`, a planilha da semana abre sozinha; não há tela de envio nem "Nova planilha". Sem planilha publicada, aparece "Ainda não há planilha da semana".
- **Rascunho automático**: a cada marcação o app salva, um instante depois, as listas e marcações da pessoa (individual, cifrado, só dela, por até **7 dias**). Se fechar ou atualizar a página, abre o `/app` de novo e tudo volta. Botão **Limpar marcações e dados** apaga as listas, as marcações e o rascunho salvo. Publicar uma planilha nova descarta os rascunhos antigos.
- **Códigos de acesso diferentes**: alunos usam `ACCESS_CODE`; administradores usam `ACCESS_CODE_ADMIN` (o rótulo do campo muda ao escolher o perfil).
- **Marcação**: filtro **Mostrar** (Todos, Municiados, NÃO municiados), com as contagens; vale também para a lista para marcar baixada. O botão **Baixar** abre a escolha entre PDF e DOCX.
- **Privacidade (LGPD)**: a planilha deixa de ficar só no aparelho. Avise os usuários de que ela é publicada pelo administrador, guardada cifrada no servidor por até 14 dias, e que as marcações de cada um ficam salvas cifradas por até 7 dias. O servidor consegue decifrar (a chave está nas variáveis da Vercel), então proteja o acesso à conta da Vercel e às variáveis.

## Trocar os códigos de acesso pelo painel (novo)
- Em `/admin`, cartão **Códigos de acesso**: o **ranchef e os administradores** trocam o código dos **alunos**; só o **ranchef** troca o código dos **administradores** (um administrador não tranca os outros).
- Para trocar: código novo (8 a 64 caracteres) duas vezes e o **seu código de aluno** para confirmar. Os dois códigos precisam ser diferentes. Há limite de 5 tentativas a cada 15 minutos por pessoa.
- O código em uso fica no banco **só como hash** (HMAC com a `PEPPER` + scrypt); o texto nunca é guardado nem aparece no painel ou no registro (só "trocou o código", por quem e quando).
- Depois da primeira troca, vale o do banco e a variável da Vercel (`ACCESS_CODE` / `ACCESS_CODE_ADMIN`) passa a ser só o valor inicial. A troca vale para os **próximos logins**; quem já está dentro continua até a sessão acabar (12 h para aluno, 2 h para administrador).
- Se esquecerem o código de administrador e ninguém conseguir entrar: apague a chave `acesso:admin` no Upstash (Data Browser) e o login volta a usar a variável `ACCESS_CODE_ADMIN` da Vercel.

## Abertura mais leve e página comprimida
- As bibliotecas pesadas (ler XLSX e PDF, gerar PDF e DOCX, mais de 2 MB de código) **não rodam mais na abertura**: o app as executa depois que a animação termina, uma por vez, ou na hora, se alguém as usar antes (ler uma planilha, baixar). Isso evita a travada no começo, principalmente no celular. O desenho da planilha da semana também espera a abertura acabar.
- O servidor manda a página **comprimida** (brotli ou gzip), de ~3,4 MB para ~1,1 MB.
- **Lista para marcar (PDF/DOCX)**: o cabeçalho diz se a lista traz *Todos os alunos*, *Municiados* ou *NÃO Municiados*, e o nome do arquivo também.
- **Código de acesso dos alunos** passou a ser obrigatório, como o dos administradores; o painel avisa em destaque quando algum perfil está sem código.

## Página "Como usar" e transferência do cargo de ranchef
- **Como usar**: o guia de uso fica **dentro do site**, em `/ajuda` (botão "Como usar" no cabeçalho do app e do painel; muda de página, e "Voltar ao app" retorna; as marcações ficam salvas pelo rascunho automático). Exige login. Alunos veem o guia comum; quem entrou como administrador vê também as seções de administrador (publicar, painel, códigos de acesso, papéis). O texto está em `api/ajuda.js`; quando uma regra do sistema mudar, atualize ali. O PDF antigo (`Guia_Conferencia_Digital.pdf`) é de antes do login e está desatualizado.
- **Transferir o cargo de ranchef**: no cartão "Transferir o cargo de ranchef" do painel (só o ranchef vê). Escolha a pessoa e confirme com o seu código de aluno. A pessoa escolhida vira ranchef e **quem transfere vira administrador**. Há sempre um só ranchef. Se a pessoa escolhida é aluno, o total de administradores sobe um; se já houver 2, remova um antes. Fica registrado ("Transferiu o cargo de ranchef").
- **Definir o ranchef inicial** (Gordilho): `AUTORIZADOS.txt` tem `Gordilho;B1234;ranchef`. Ao rodar `node scripts/carregar-lista.mjs ..\AUTORIZADOS.txt`, se **ainda não existir ranchef** no banco, o Gordilho vira ranchef (mesmo que já exista como administrador ou aluno). Se já houver outro ranchef, o script não troca; use a transferência do painel.

## Sem ranchef? Assumir o cargo pelo painel
- Se o banco ficar **sem ranchef** (por exemplo, a lista foi carregada só com `;admin`), qualquer **administrador** (em sessão de administrador) vê no painel o cartão **"Não há administrador ranchef"** e pode **Assumir o cargo de ranchef**, confirmando com o seu código de aluno. Ele vira ranchef e deixa de ser administrador comum. O cartão só existe enquanto não há ranchef; depois só vale a transferência feita pelo ranchef.
- Os textos do painel não citam mais a Vercel: o cartão dos códigos mostra "Ainda não foi trocado pelo painel" ou "Trocado por X em ...".

## Montar tudo do zero (repositório completo)
- `fonte-app/` é o código-fonte do app (a página que roda no navegador). `api/`, `public/` e `scripts/` são o site (login, painel, servidor).
- Gerar o app: `npm run app:build` (cria `fonte-app/conferencia_digital.html`, que não é versionado).
- Cifrar o app para o site: `APP_KEY=<64 hex> node scripts/cifrar.mjs fonte-app/conferencia_digital.html` (grava `dados/app.enc`, que também não é versionado). A chave `APP_KEY` é a mesma `DATA_KEY` usada na Vercel.
- Testar tudo: `npm run teste:tudo` (site + app, só dados fictícios). Um fluxo no GitHub roda isso a cada pull request.
- Publicar: `npx vercel --prod`. O que vai para a Vercel é o site; `fonte-app/` fica de fora (`.vercelignore`).
- Nunca versionar: planilhas reais, listas de autorizados, backups da lista, `.env`, `dados/app.enc`.
