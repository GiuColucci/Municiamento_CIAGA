# Arquitetura e fluxos

Este documento descreve **como o sistema é composto e como cada fluxo funciona**, com diagramas. Os detalhes de segurança estão em [SEGURANCA.md](SEGURANCA.md) e os de criptografia em [CRIPTOGRAFIA.md](CRIPTOGRAFIA.md). Os diagramas usam [Mermaid](https://mermaid.js.org/), renderizado nativamente pelo GitHub.

## Sumário

1. [Componentes](#1-componentes)
2. [Modelo de dados no Redis](#2-modelo-de-dados-no-redis)
3. [Ciclo de vida de uma sessão](#3-ciclo-de-vida-de-uma-sessão)
4. [Fluxo de login](#4-fluxo-de-login)
5. [Entrega do app](#5-entrega-do-app)
6. [Pipeline do app no navegador](#6-pipeline-do-app-no-navegador)
7. [Publicar e carregar a planilha](#7-publicar-e-carregar-a-planilha)
8. [Rascunho automático](#8-rascunho-automático)
9. [Ações de administrador](#9-ações-de-administrador)
10. [Cargos: ranchef, administradores e transferência](#10-cargos-ranchef-administradores-e-transferência)
11. [Senhas de acesso (troca pelo painel)](#11-senhas-de-acesso-troca-pelo-painel)
12. [Registro de eventos](#12-registro-de-eventos)
13. [Pipeline de build e implantação](#13-pipeline-de-build-e-implantação)
14. [Tratamento de falhas](#14-tratamento-de-falhas)
15. [Conferência Geral](#15-conferência-geral)
16. [Menu suspenso do cabeçalho](#16-menu-suspenso-do-cabeçalho)

---

## 1. Componentes

```mermaid
flowchart TB
  subgraph Cliente["Cliente"]
    L["public/index.html<br/>login.js, tema.js, tema.css"]
    APP["App compilado (HTML único)<br/>fonte-app/web"]
    PAG["Páginas do servidor<br/>painel, ajuda, visualizador"]
  end

  subgraph Servidor["Funções serverless (api/)"]
    direction TB
    subgraph Rotas
      R1["login.js"]
      R2["app.js"]
      R3["planilha.js"]
      R4["rascunho.js"]
      R5["admin.js"]
      R6["admin-acao.js"]
      R7["planilha-ver.js"]
      R8["ajuda.js"]
      R9["evento.js"]
      R10["sair.js"]
      R11["admin-baixar.js (lista e backup)"]
    end
    subgraph Lib["_lib/"]
      S["seguranca.js<br/>hash, sessão, CSRF, limites"]
      C["cofre.js<br/>AES-256-GCM, HKDF"]
      P["pessoas.js<br/>lista e cargos"]
      A["acessos.js<br/>senhas por perfil"]
      G["registro.js<br/>Redis e eventos"]
      Y["layout.js<br/>HTML e CSP"]
    end
  end

  ENC[("dados/app.enc")]
  REDIS[("Redis REST")]

  L --> R1
  PAG --> R5 & R6 & R7 & R8
  APP --> R3 & R4 & R9
  R1 --> S & P & A & G
  R2 --> S & P & G
  R2 --> ENC
  R3 --> C & P & S & G
  R4 --> C & P & S
  R5 --> P & A & C & G & Y
  R6 --> P & A & C & G
  C --> G
  P --> G
  A --> G
  G --> REDIS
```

| Componente | Responsabilidade | Observação |
|---|---|---|
| `api/_lib/seguranca.js` | Hashes (scrypt + HMAC), cookie assinado, `lerSessao`, `mesmaOrigem` (CSRF), limitadores | Usa só `crypto` do Node |
| `api/_lib/cofre.js` | Cifra/decifra o que vai ao Redis (planilha, rascunho, código selado) | HKDF por contexto + AES-256-GCM + gzip |
| `api/_lib/pessoas.js` | CRUD da lista de pessoas, regras de cargos, ranchef, backup | Estado no hash Redis `usuarios` |
| `api/_lib/acessos.js` | Senha de acesso por perfil (hash no banco ou variável de ambiente) | Falha fechada |
| `api/_lib/registro.js` | Cliente REST do Redis, registro de eventos, máscara de IP | Retenção de 30 dias |
| `api/_lib/layout.js` | HTML das páginas do servidor e a CSP rígida delas | `default-src 'none'` |
| `fonte-app/web` | Leitura de XLSX/CSV/PDF, regras de lista, relatório, PDF, modo hospedado | Compilado em um único HTML |

---

## 2. Modelo de dados no Redis

```mermaid
erDiagram
  USUARIOS ||--o{ PESSOA : contem
  PESSOA {
    string campo "nome normalizado (sem acento, minúsculo)"
    string d "nome como exibido"
    string s "sal (base64, 16 bytes)"
    string h "hash do número interno (base64, 64 bytes)"
    string k "número interno cifrado (v1.base64)"
    int adm "0 aluno, 1 administrador, 2 ranchef"
  }
  ACESSO ||--|| PERFIL : "um por perfil"
  ACESSO {
    string chave "acesso:aluno ou acesso:admin"
    string s "sal"
    string h "hash da senha"
    string por "quem trocou"
    int em "epoch ms"
  }
  PLANILHA {
    string chave "planilha"
    string valor "v1.base64 (cifrado)"
    int ttl "14 dias"
  }
  RASCUNHO {
    string chave "r:hmac(nome)[0..32]"
    string valor "v1.base64 (cifrado)"
    int ttl "7 dias"
  }
  LOG {
    string chave "log (lista)"
    string evento "JSON: t, u, a, ip mascarado, ua, alvo"
  }
```

| Chave Redis | Tipo | Conteúdo | Expira |
|---|---|---|---|
| `usuarios` | hash | campo = nome normalizado; valor = JSON `{d, s, h, k, adm}` | não |
| `acesso:aluno`, `acesso:admin` | string | JSON `{s, h, por, em}` (hash da senha, sem o texto) | não |
| `planilha` | string | blob cifrado `v1.…` com a planilha empacotada | 14 dias |
| `r:<32 hex>` | string | blob cifrado `v1.…` com o rascunho da pessoa | 7 dias (renovado ao salvar) |
| `log` | lista | eventos JSON, do mais novo ao mais antigo (máx. 5.000) | itens com mais de 30 dias são removidos no login |

A planilha empacotada (antes de cifrar) é um objeto `v:1` com `formato`, `sexta`, `turmas`, `avisos` e `alunos` (`[nome, número interno, turma, máscara de 28 bits]`, um bit por dia × refeição).

---

## 3. Ciclo de vida de uma sessão

```mermaid
stateDiagram-v2
  [*] --> SemSessao
  SemSessao --> Autenticado: POST /api/login válido
  Autenticado --> Autenticado: cada requisição relê o cargo no banco
  Autenticado --> SemSessao: /sair
  Autenticado --> SemSessao: expira (12 h aluno, 2 h administrador)
  Autenticado --> SemSessao: pessoa excluída da lista
  Autenticado --> SemSessao: SESSION_SECRET trocado
  note right of Autenticado
    Cookie sessao = base64url(JSON {u, r, m, exp}) . HMAC
    HttpOnly, Secure, SameSite=Strict, Path=/
    m = 1 somente se escolheu Entrar como Administrador
  end note
```

O cookie guarda um **papel de reserva** (`r`), mas as decisões de autorização usam o **cargo atual do banco** (`papelAtual`). Se o banco estiver indisponível, o servidor recorre ao cargo do cookie assinado só para decisões de leitura; ações que gravam dependem do banco de qualquer modo.

---

## 4. Fluxo de login

```mermaid
sequenceDiagram
  autonumber
  actor U as Pessoa
  participant B as Navegador
  participant L as /api/login
  participant S as seguranca.js
  participant A as acessos.js
  participant P as pessoas.js
  participant R as Redis

  U->>B: nome, número interno, senha e modo (Aluno ou Administrador)
  B->>L: POST (formulário)
  L->>S: mesmaOrigem(req)
  alt origem inválida
    L-->>B: 403
  end
  L->>S: bloqueado(ip)
  alt bloqueado por erros
    L-->>B: 302 /?erro=limite
  end
  L->>A: conferir(senha, perfil)
  A->>R: GET acesso:aluno ou acesso:admin
  R-->>A: hash e sal (ou nada, usa variável de ambiente)
  A-->>L: ok ou não
  L->>P: conferir(nome, número interno)
  P->>R: HGET usuarios nome
  R-->>P: registro (ou nulo)
  P->>S: hashCodigo (HMAC PEPPER e scrypt) e timingSafeEqual
  P-->>L: pessoa ou nulo
  opt é a pessoa do ranchef de origem e não há ranchef
    L->>P: garantirRanchef(nome)
    P->>R: HSET usuarios nome (adm 2)
  end
  alt senha ou pessoa inválida
    L->>S: falhou(ip)
    L->>R: LPUSH log login_falha
    L-->>B: aguarda 0,8 s e responde 302 /?erro=1
  else modo Administrador sem ser administrador
    L->>R: LPUSH log admin_negado
    L-->>B: 302 /?erro=nao_admin
  else sucesso
    L->>R: LPUSH log login_ok ou login_admin
    L-->>B: Set-Cookie sessao e 302 /app
  end
```

Pontos de projeto:

- A mensagem de erro **não diz qual dos três campos** falhou.
- A conferência do número interno tem o **mesmo custo** (scrypt) mesmo quando o nome não existe (`SAL_FALSO`/`HASH_FALSO`), evitando enumeração de usuários por tempo de resposta.
- O IP completo é usado **só em memória** para o limite de tentativas; o que vai ao registro é o IP **mascarado**.
- O registro grava **apenas o nome digitado** (limpo de caracteres de controle), nunca a senha nem o número interno.

---

## 5. Entrega do app

```mermaid
flowchart TD
  A["GET /app"] --> B{"Cookie sessao<br/>assinatura e exp válidas?"}
  B -- não --> X["302 para /"]
  B -- sim --> C{"Pessoa ainda existe<br/>na lista?"}
  C -- não --> Y["apaga o cookie, 302 para /"]
  C -- sim --> D["lê dados/app.enc"]
  D --> E["decifra AES-256-GCM com APP_KEY<br/>descomprime brotli"]
  E --> F["ajusta a CSP do app:<br/>connect-src 'none' vira 'self'"]
  F --> G["injeta: link Como usar,<br/>link Administrador se for admin,<br/>rodapé Sair, perfil e monitor de eventos"]
  G --> H["registra app_aberto"]
  H --> I["cabeçalhos de segurança e compressão<br/>br ou gzip"]
  I --> J["200 HTML ~1,1 MB comprimido"]
```

- O app **nunca** é servido como arquivo estático: o `dados/app.enc` só é decifrado em memória, após a autenticação.
- O perfil injetado (`Municiamento.HOSPEDADO`) serve **apenas para mostrar ou esconder telas**; quem de fato pode publicar é conferido no servidor a cada requisição.
- A inserção em pontos do HTML usa **âncoras do próprio app** (o HTML embute bibliotecas com `</body>` e `</main>` dentro de texto de código).

---

## 6. Pipeline do app no navegador

```mermaid
flowchart LR
  F["Arquivo<br/>XLSX, CSV ou PDF"] --> E["entradas.js<br/>detecta tipo pelos bytes,<br/>valida tamanho"]
  E --> G["grade de células<br/>(lista de listas de texto)"]
  G --> P["parser.js<br/>turmas, dias, refeições,<br/>alunos, avisos, conferência de totais"]
  P --> RES["Resultado<br/>alunos, turmas, avisos"]
  RES --> R["report.js<br/>regras: café = municiados,<br/>almoço e janta = NÃO municiados"]
  R --> UI["rela.js<br/>telas, marcação, filtros,<br/>antiguidade, agrupar por turma"]
  UI --> D["documentos.js e pdf.js<br/>PDF no estilo da Marinha"]
  UI --> H["hospedado.js<br/>empacotar planilha e rascunho,<br/>chamadas à API"]
```

Princípios do app:

- **Um único parser de grade**: a lógica de negócio não depende do formato de entrada (CSV, XLSX ou PDF são convertidos para a mesma grade).
- **O mapa de colunas é por posição** (cada dia abre um grupo de 4 colunas: Café, Almoço, Janta, Ceia), porque os rótulos têm erros de digitação.
- **Divergências viram avisos**, nunca bloqueios (por exemplo, totais da planilha que não batem com a contagem).
- As bibliotecas pesadas (`pdf.js`, `xlsx`, `jspdf`, `jszip`) são carregadas **sob demanda**, depois da abertura, para o app abrir rápido no celular.
- O app é compilado por `fonte-app/web/build.mjs` num **único HTML** com CSP `default-src 'none'` (ajustada para `'self'` no servidor por causa do monitor de eventos).

---

## 7. Publicar e carregar a planilha

### Publicar (somente administrador)

```mermaid
sequenceDiagram
  autonumber
  actor ADM as Administrador
  participant APP as App no navegador
  participant API as /api/planilha
  participant PES as pessoas.js
  participant COF as cofre.js
  participant R as Redis

  ADM->>APP: carrega o arquivo da planilha
  APP->>APP: lê e valida, mostra avisos
  ADM->>APP: Publicar para os alunos
  APP->>APP: empacotarPlanilha (alunos, turmas, avisos, 28 bits por aluno)
  APP->>API: POST dados (JSON)
  API->>API: sessão válida, mesmaOrigem
  API->>PES: papelAtual (banco) maior ou igual a 1
  alt não é administrador
    API->>R: LPUSH log admin_negado
    API-->>APP: 403
  end
  API->>API: valida formato, limites (1,5 MB, 3.000 alunos)
  API->>COF: gravarPlanilha(dados) com TTL de 14 dias
  COF->>R: SET planilha v1.base64 EX 1209600
  API->>R: LPUSH log admin_publicou_planilha
  API-->>APP: 200 id, por, em
```

### Carregar (todo usuário autenticado)

```mermaid
sequenceDiagram
  autonumber
  participant APP as App no navegador
  participant API as /api/planilha
  participant COF as cofre.js
  participant R as Redis

  APP->>API: GET (cookie de sessão)
  API->>COF: lerPlanilha()
  COF->>R: GET planilha
  R-->>COF: blob cifrado
  COF->>COF: HKDF(DATA_KEY, "planilha") e AES-GCM com AAD "planilha"
  COF-->>API: objeto
  API-->>APP: 200 JSON
  APP->>APP: desempacotarPlanilha e desenha as listas
```

- O **arquivo original não é enviado nem guardado**: só o resultado da leitura, empacotado.
- Se a planilha original era **PDF**, o conteúdo publicado já é a versão convertida em tabela; o **visualizador** (`/admin/planilha`) mostra exatamente isso, em modo só leitura, para o administrador conferir.
- A planilha **expira sozinha em 14 dias** e pode ser removida a qualquer momento pelo painel.

---

## 8. Rascunho automático

```mermaid
flowchart TD
  A["Pessoa marca presenças<br/>e ajusta filtros"] --> B["hospedado.js empacota o estado<br/>(listas, marcações, filtros)"]
  B --> C["PUT /api/rascunho"]
  C --> D{"sessão válida e<br/>mesma origem?"}
  D -- não --> X["401 ou 403"]
  D -- sim --> E["valida formato e tamanho (máx. 400 KB)"]
  E --> F["cofre.gravarRascunho(nome)"]
  F --> G["chave r:HMAC(DATA_KEY, 'rascunho:' + nome)[0..32]<br/>contexto 'rascunho:' + nome"]
  G --> H[("Redis SET ... EX 7 dias")]
  I["Ao abrir o app"] --> J["GET /api/rascunho"]
  J --> K{"existe e confere o contexto?"}
  K -- sim --> L["restaura marcações<br/>(se for da mesma planilha)"]
  K -- não --> M["recomeça do zero"]
  N["Botão Limpar marcações e dados"] --> O["DELETE /api/rascunho"]
```

- O rascunho é **individual**: a chave do banco e o contexto de cifragem dependem do nome da pessoa; ninguém lê o rascunho de outra pessoa pela API.
- A **chave do banco não contém o nome** (é um HMAC dele): quem olha o Redis não sabe quem tem rascunho.
- Salvar o rascunho **não gera evento** no registro.
- Um rascunho adulterado ou de outra chave nunca trava a pessoa: o `GET` devolve "vazio".

---

## 9. Ações de administrador

Todas passam por `POST /api/admin-acao`.

```mermaid
flowchart TD
  A["POST /api/admin-acao"] --> B{"método POST, sessão válida,<br/>mesmaOrigem?"}
  B -- não --> X1["403"]
  B -- sim --> C["papelAtual(nome) no banco<br/>(só vale se sessão em modo administrador)"]
  C --> D{"papel maior ou igual a 1?"}
  D -- não --> X2["registra admin_negado, 403"]
  D -- sim --> E{"ação conhecida?"}
  E -- não --> X3["400"]
  E -- sim --> F{"ação só do ranchef<br/>e papel diferente de 2?"}
  F -- sim --> X4["registra admin_negado,<br/>volta com erro sem_permissao"]
  F -- não --> G["executa a ação"]
  G --> H{"resultado com erro?"}
  H -- sim --> X5["303 para /admin?e=codigo"]
  H -- não --> I["registra o evento (com o alvo)"]
  I --> J["303 para /admin?m=ação"]
```

| Ação | Quem | Regras principais |
|---|---|---|
| `cadastrar` | admin, ranchef | Nome único; número interno `[BMN]\d{4}`; limite de 500 pessoas |
| `remover` | admin, ranchef | Só aluno; administrador precisa ser rebaixado antes; ninguém se exclui |
| `promover` | ranchef | Máx. 2 administradores; reconferência para cliques simultâneos |
| `rebaixar` | ranchef | Não vale para o ranchef nem para si mesmo |
| `limpar_planilha` | admin, ranchef | Apaga a chave `planilha` |
| `codigo_aluno` | admin, ranchef | Senha nova 2×, 8–64 caracteres, confirma com o número interno de quem troca; 5 tentativas/15 min |
| `codigo_admin` | ranchef | Idem; precisa ser diferente da senha dos alunos |
| `transferir_ranchef` | ranchef | Troca atômica de cargos; confirma com o número interno |
| `assumir_ranchef` | administrador | Só quando **não há** ranchef |

---

## 10. Cargos: ranchef, administradores e transferência

```mermaid
stateDiagram-v2
  [*] --> Aluno
  Aluno --> Administrador: ranchef promove (máx. 2)
  Administrador --> Aluno: ranchef rebaixa
  Administrador --> Ranchef: assume (somente se não há ranchef)
  Aluno --> Ranchef: ranchef de origem entra e não há ranchef
  Administrador --> Ranchef: ranchef de origem entra e não há ranchef
  Ranchef --> Administrador: transfere o cargo a outra pessoa
  Aluno --> Ranchef: recebe o cargo por transferência
  Administrador --> Ranchef: recebe o cargo por transferência
```

```mermaid
sequenceDiagram
  autonumber
  actor RA as Ranchef atual
  participant API as /api/admin-acao
  participant PES as pessoas.js
  participant R as Redis

  RA->>API: transferir_ranchef (alvo, número interno para confirmar)
  API->>API: limite 5 tentativas em 15 min por pessoa
  API->>PES: conferir(quem, confirmar)
  API->>PES: transferirRanchef(alvo, quem)
  PES->>R: HGETALL usuarios
  PES->>PES: quem é ranchef, alvo existe, admins não passam de 2
  PES->>R: pipeline atômico HSET quem adm=1 e HSET alvo adm=2
  API->>R: LPUSH log admin_transferiu_ranchef
  API-->>RA: 303 /admin?m=transferir_ranchef
```

Invariantes: **exatamente um ranchef** (ou nenhum, antes da primeira atribuição), **no máximo dois administradores** além dele, e a troca de cargos é feita **num único pipeline** para nunca haver dois ranchefs nem nenhum no meio da operação.

**Ranchef de origem:** no login, se **não existe ranchef** e a pessoa que entrou é a designada (`RANCHEF_INICIAL`, padrão `Gordilho`), ela é promovida automaticamente. Depois que existe um ranchef, essa regra **não faz nada** (quem recebeu o cargo por transferência não o perde).

---

## 11. Senhas de acesso (troca pelo painel)

```mermaid
flowchart TD
  A["Login informa a senha"] --> B{"existe acesso:perfil<br/>no Redis?"}
  B -- sim --> C["hashAcesso(perfil, senha, sal)<br/>compara com o hash guardado"]
  B -- não --> D{"variável ACCESS_CODE ou<br/>ACCESS_CODE_ADMIN definida?"}
  D -- sim --> E["sha256 de cada lado e timingSafeEqual"]
  D -- não --> F["ninguém entra neste perfil"]
  C --> G["entra ou não"]
  E --> G
  H["Painel: trocar senha"] --> I["valida 8 a 64 caracteres, 2 digitações,<br/>diferente da senha do outro perfil"]
  I --> J["confirma com o número interno de quem troca"]
  J --> K["HMAC(PEPPER, 'acesso:perfil:senha') e scrypt<br/>SET acesso:perfil {s, h, por, em}"]
  K --> L["vale nos próximos logins<br/>sessões abertas continuam até expirar"]
```

O painel mostra **quando** a senha foi trocada e há quantos dias, e avisa para trocá-la **a cada 30 dias**.

---

## 12. Registro de eventos

```mermaid
flowchart LR
  subgraph Origem["Quem registra"]
    L["login: login_ok, login_admin, login_falha, admin_negado"]
    APP["app: app_aberto, sair"]
    EV["/api/evento: planilha_carregada, baixar_pdf"]
    ADM["admin-acao: admin_cadastrou, _removeu, _promoveu, _rebaixou,<br/>_mudou_codigo_*, _transferiu_ranchef, ..."]
    PV["planilha-ver: admin_viu_planilha"]
  end
  Origem --> REG["registro.registrar()<br/>t, u, a, ip mascarado, ua, alvo"]
  REG --> LOG[("Redis: lista log<br/>LPUSH")]
  LOG --> M["manter() no login_ok:<br/>LTRIM 5.000 e remove itens com mais de 30 dias"]
  LOG --> PAINEL["Painel: último acesso de cada pessoa<br/>e registro com filtros"]
```

- `/api/evento` só aceita **três ações** de uma lista fechada: o navegador **não consegue gravar texto livre** no registro.
- O painel filtra por **nome de guerra** (sem acento/maiúscula) ou **número interno** (traduzido para o nome apenas para alunos) e tem a opção **"Só tentativas recusadas"** (`login_falha` e `admin_negado`).
- As consultas ao painel (`admin_consulta`) **não** aparecem na lista.

---

## 13. Pipeline de build e implantação

```mermaid
flowchart LR
  SRC["fonte-app/web<br/>(src, estilo.css, vendor)"] -->|"npm run app:build"| HTML["conferencia_digital.html<br/>(não versionado)"]
  HTML -->|"APP_KEY=... node scripts/cifrar.mjs"| ENC["dados/app.enc<br/>(não versionado)"]
  ENC -->|"npx vercel --prod"| DEPLOY["Funções + estáticos<br/>(sem fonte-app)"]
  LISTA["AUTORIZADOS.txt<br/>(local, não versionado)"] -->|"node scripts/carregar-lista.mjs"| REDIS[("Redis")]
  GIT["GitHub (privado)<br/>só código e fixtures fictícias"] -.->|"pull request"| CI["Actions: teste:tudo e app:build"]
```

O que **entra** no deploy: `api/`, `public/`, `dados/app.enc`, `vercel.json`. O que **fica fora** (`.vercelignore`): `fonte-app/`, planilhas e documentos gerados.

---

## 14. Tratamento de falhas

| Falha | Comportamento |
|---|---|
| Redis indisponível no login | A conferência falha → o login é recusado (fail-closed); nada é concedido |
| Redis indisponível numa ação de administrador | A ação não é executada; o painel mostra mensagem de erro genérica |
| Redis indisponível ao registrar eventos | A falha é registrada no log do servidor e **não** impede o uso |
| `SESSION_SECRET` ausente | Qualquer cookie é tratado como "sem sessão" |
| `DATA_KEY` ausente ou inválida | Planilha e rascunhos não abrem (erro tratado: rascunho vira "vazio") |
| `APP_KEY` incorreta | `/app` responde 500 "Erro interno" (a autenticação do GCM falha) |
| Planilha adulterada no banco | O GCM rejeita (tag inválida): erro tratado, nada é exibido |
| Senha de um perfil não definida | Ninguém entra naquele perfil; o painel exibe um aviso em destaque |

---

## 15. Conferência Geral

Cruza o trabalho de **todas as pessoas que conferiram** o mesmo dia e a mesma refeição, produzindo **uma listagem única**. Qualquer pessoa autenticada usa (aluno ou administrador).

```mermaid
sequenceDiagram
  autonumber
  actor ADM as Administrador
  participant APP as App (tela Conferência geral)
  participant API as /api/conferencia-geral
  participant PES as pessoas.js
  participant COF as cofre.js
  participant R as Redis

  ADM->>APP: Menu, Conferência geral
  APP->>API: GET (sem parâmetros)
  API->>API: sessão válida e pessoa ainda existente na lista
  API->>COF: lerPlanilha() para obter o id da planilha publicada
  API->>PES: estado() lista de pessoas
  API->>COF: lerRascunhos(nomes)
  COF->>R: MGET r:id1 r:id2 ... (uma só chamada)
  R-->>COF: blobs cifrados
  COF->>COF: decifra cada um (contexto rascunho:nome), ignora os inválidos
  API->>API: descarta rascunhos de outra planilha, agrupa por dia e refeição
  API-->>APP: opcoes (dia, refeicao, conferentes)
  ADM->>APP: escolhe Sexta, Janta
  APP->>API: GET ?dia=Sexta e refeicao=Janta
  API->>API: união das marcações, lista de conferentes
  API->>R: LPUSH log viu_conferencia_geral
  API-->>APP: conferentes e marcados
  APP->>APP: monta a lista (relaEstruturada) com a planilha da semana
```

```mermaid
flowchart TD
  C1["Conferente A marcou<br/>ALVES, BRAGA"] --> U
  C2["Conferente B marcou<br/>CORREA, ALVES, EVA"] --> U
  U{{"União (sem repetir)<br/>ALVES, BRAGA, CORREA, EVA"}} --> P["Planilha da semana<br/>quem estava municiado naquele dia e refeição?"]
  P --> M["MUNICIADOS<br/>ALVES, CORREA, EVA"]
  P --> N["NÃO MUNICIADOS<br/>BRAGA"]
  M --> F["Filtros da rela: Todos, só Municiados, só NÃO municiados<br/>Ano inteiro ou Por turma (sem escolher turmas)<br/>Alfabética ou Antiguidade<br/>Copiar e Baixar PDF"]
  N --> F
```

**Regras**

| Ponto | Comportamento |
|---|---|
| Cruzamento | **União**: um aluno consta se **qualquer** conferente o marcou; marcado por vários aparece **uma vez** |
| Listas em andamento | Entram todas as listas com pelo menos uma marcação; a tela mostra quantas estão finalizadas |
| Planilha | Só rascunhos feitos **na planilha publicada agora** (o rascunho guarda o id da planilha) |
| Separação | Pela planilha, como na rela individual: marcado e municiado → Municiados; marcado e não municiado → NÃO municiados |
| Quem aparece como conferente | Nome, quantas listas, quantos marcados e **quando salvou** (`salvoEm`, gravado pelo servidor a cada salvamento) |
| Persistência | **Nada é guardado**: a união é calculada a cada consulta e devolvida; os rascunhos continuam cifrados e individuais |
| Acesso | Qualquer sessão válida (aluno ou administrador); consulta registrada como `viu_conferencia_geral` |

**Detalhe de segurança:** os rascunhos são decifrados **no servidor**, que tem a `DATA_KEY`; é a única parte do sistema que lê rascunhos de várias pessoas, e devolve só o resultado agregado (nunca o rascunho bruto), a uma pessoa autenticada. As chaves dos rascunhos continuam sendo HMAC dos nomes (o banco não revela quem salvou o quê). Ver [SEGURANCA.md](SEGURANCA.md).

---

## 16. Menu suspenso do cabeçalho

O cabeçalho agrupa os links num único menu (`<details class="menu-suspenso">`), igual nas páginas do servidor e no app:

| Contexto | Itens |
|---|---|
| App (aluno) | Conferência geral, Como usar |
| App (administrador) | Conferência geral, Administrador, Como usar |
| Painel e demais páginas do servidor | Voltar ao app (ou ao painel), Como usar |

**Uma só fonte de estilo:** `public/menu.css` (menu suspenso, cabeçalho em toda a largura e botão Sair). As páginas do servidor o carregam por `<link>` e o servidor o injeta no `<head>` do app, liberando `style-src 'self'` na regra do app; assim o menu fica certo mesmo com um `app.enc` mais antigo. O botão de tema e "Nova planilha" ficam fora do menu. O menu abre e fecha por clique ou teclado, fecha ao clicar fora ou com `Esc` e não aparece na impressão. O item "Conferência geral" tem `data-abrir-geral`: o app o intercepta e abre a tela **sem recarregar a página**.
