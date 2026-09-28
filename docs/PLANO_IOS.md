# AXON na App Store — plano completo para execução

**Para o agente que vai executar este plano:** você provavelmente não acompanhou
as decisões que levaram até aqui. Este documento é autossuficiente — leia-o
inteiro antes de tocar em qualquer arquivo, e leia também o `AGENTS.md` da raiz,
que é o manual de arquitetura, segurança e Definition of Done do projeto.

Escrito em 28/09/2026. Revisado no mesmo dia: dependências da Fase 1 (teste depende
da conta Apple, callback por POST, nonce, nome só na primeira vez, revogação na
exclusão de conta, Migration 36).

---

## Como trabalhar com o Bernardo

Regras do projeto que valem para você, registradas em conversas anteriores:

1. **Não commite.** O Bernardo faz todos os commits. "Deixar pronto" não inclui
   `git commit` nem `git push`.
2. **Teste o caminho real.** `tsc --noEmit` e `python3 -c "import main"` não pegam
   erro de chamada nem de regra de negócio. Exercite a tela ou o endpoint de
   verdade. Já houve caso neste projeto de teste isolado passar e a feature estar
   quebrada.
3. **Dados de teste criados em conta real são apagados ao terminar**, inclusive o
   rastro derivado (stats, insights, notificações).
4. **Não rode um segundo backend contra o Supabase de produção.** O
   `planning_scheduler` roda dentro do processo e duplicaria notificações e push
   para usuários reais.
5. **Pergunte quando a decisão for do produto, não do código.** O Bernardo prefere
   ser consultado a descobrir uma decisão tomada por você.
6. **Migration nova é aplicada à mão no SQL Editor do Supabase**, por ele, antes
   de reiniciar o backend. Avise quando houver uma pendente.

---

## Estado do projeto hoje

**Android:** publicação em andamento. Conta da Play Console criada
(`equipe.zenith2023@gmail.com`), verificação de identidade em análise. Keystore
já existe. Falta: screenshots, feature graphic, ficha e o AAB.

**Verificação do OAuth do Google:** enviada em 24/09/2026, em análise. Enquanto
não sair, todo login com Google mostra aviso de "app não verificado" e conta no
limite de 100 usuários. **Não mexa em nada da configuração OAuth no Google Cloud**
— mudar estado de publicação, tipo de usuário ou escopos pode reiniciar o
processo.

**iOS:** nenhum código existe ainda. É o que este plano cobre. A **conta Apple
Developer já foi solicitada** (entrada em 28/09/2026) e está em análise; a
modalidade (pessoa física ou organização) define o prazo — confirme com o
Bernardo se ainda não souber.

### O que já está pronto e se reaproveita

| | Onde |
|---|---|
| Frontend React que roda em WebView | o mesmo bundle do Android |
| Backend, banco, API | não muda nada |
| `HashRouter` em nativo, `BrowserRouter` na web | decidido em runtime no `App.tsx` |
| Safe areas aplicadas ao `<main>` via classe `is-native` | feito na fase 4 do Android |
| OAuth pelo navegador do sistema, nunca em WebView | `axonweb/src/lib/nativeAuth.ts` |
| Plataforma guardada no servidor, não no `state` do OAuth | `backend/services/google_service.py` |
| Push via FCM, envio não-bloqueante | backend pronto, serve iOS também |
| Termos de Uso publicados | `https://axonapp.tech/legal/termos.html` |
| Recuperação de senha funcionando | implementada em 25/09/2026 |

---

## Contexto técnico que você precisa ter

### Identificadores

```
Bundle ID / App ID:  com.axon.app      (imutável, o mesmo do Android)
Deep link scheme:    com.axon.app      (backend: MOBILE_SCHEME em google_auth.py:16)
Site:                https://axonapp.tech
API:                 https://api.axonapp.tech
Repositório:         github.com/ZenithIA2023/AxonWeb  (privado)
```

### Como o OAuth nativo funciona hoje

Isto importa porque o Sign in with Apple **não** segue o mesmo caminho.

O Google recusa OAuth dentro de WebView embutido (`disallowed_useragent`), porque
o app hospedeiro poderia ler a senha. Por isso `nativeAuth.ts` abre o navegador do
sistema (`Browser.open`) e o backend redireciona de volta por deep link:

```
app → Browser.open(url + "?platform=mobile")
    → Google autentica no navegador de verdade
    → backend redireciona para com.axon.app:///#/rota
    → deepLinkToRoute() converte em rota do HashRouter
```

O `"/#"` no retorno existe porque o app roda em HashRouter. Sem ele o app abre na
raiz e a rota de callback nunca monta.

**O Sign in with Apple no iOS é diferente:** usa a folha nativa do sistema, que
devolve o resultado direto ao app. Não há deep link, não há navegador. Não force
o fluxo da Apple pelo caminho do Google.

### Autenticação no backend

O login com Google usa `supabase_auth.auth.sign_in_with_id_token({"provider":
"google", "token": id_token})` em `backend/routers/google_auth.py:215`. O Supabase
suporta `"apple"` no mesmo método — é o molde a seguir.

### Armadilha registrada: `auth.admin` pelo cliente errado

Descoberta em 25/09/2026 e documentada no código: a cada login, a lib troca o
header `Authorization` do cliente que logou pelo JWT do usuário, e o `admin`
herda esse header. Por isso operações de admin usam o cliente de **dados**
(`supabase`), não o `supabase_auth` — senão o Supabase responde
`403 User not allowed` depois do primeiro login no processo.

Veja `backend/routers/auth.py`, função `reset_password`, que tem o comentário
completo.

### Armadilha registrada: plugin nativo e live reload

Plugin nativo novo **não chega por live reload**. Depois de adicionar
`@capacitor-community/apple-sign-in` ou qualquer outro, é preciso desinstalar o
app do aparelho e instalar de novo — senão o plugin falha em silêncio. Já custou
tempo na fase 3 do Android.

---

## As três exigências que só o iOS tem

### 1. Um Mac para compilar

Xcode só roda em macOS. **O Codespace é Linux e não compila iOS** — restrição da
Apple, não do Capacitor. Não perca tempo tentando.

A solução deste plano é **GitHub Actions com runner macOS**: um robô que roda um
script e devolve o `.ipa`. Não é um Codespace; é um workflow.

**Orçamento de minutos:** o repositório é privado, então Actions consome cota.
Runner macOS gasta **10× por minuto real**. A cota disponível equivale a cerca de
**200 minutos reais de macOS por mês**, o que dá 10 a 15 builds. Há folga, mas não
configure build automático a cada push — o gatilho é manual.

> Se o repositório for tornado público algum dia, Actions passa a ser ilimitado e
> gratuito, inclusive macOS.

### 2. Sign in with Apple — obrigatório

A Apple **exige** que todo app com login social de terceiros ofereça também Sign
in with Apple. O AXON tem login com Google. Sem isso, rejeição certa.

É a maior parte do trabalho de código. O **código** pode ser escrito sem a conta
Apple; o **teste** não — nem na web (ver Fase 1).

Junto com ele vem uma segunda exigência que costuma ser esquecida: **ao excluir a
conta, o app precisa revogar o token do Sign in with Apple** (ver 1.5). Sem isso,
rejeição na revisão.

### 3. Conta Apple Developer — US$ 99/ano

Pessoa física aprova em dias; organização exige **D-U-N-S**, que leva de 2 a 4
semanas. O Bernardo ainda não tem CNPJ, então a decisão provável é pessoa física,
com transferência futura — o mesmo caminho adotado na Play Console.

---

## Fase 0 — Conta e identificadores (Bernardo faz, fora do código)

1. ~~Criar a conta Apple Developer com a conta Apple da Zenith, não a pessoal.~~
   **Solicitada em 28/09/2026, em análise.** Os itens abaixo esperam a aprovação.
2. Registrar o App ID `com.axon.app` no portal, habilitando as capabilities:
   **Sign in with Apple**, **Push Notifications**, **Associated Domains**.
3. Criar um **Services ID** (necessário para o Sign in with Apple na web).
   No Services ID, em "Sign in with Apple → Configure", cadastrar:
   - **Domínio:** `api.axonapp.tech`
   - **Return URL:** `https://api.axonapp.tech/auth/apple/callback`

   A Apple **não aceita `localhost`** nem HTTP. Para testar a partir do Codespace,
   uma URL `*.app.github.dev` fixa também pode ser cadastrada, mas ela muda se o
   Codespace for recriado.
4. Criar o app no App Store Connect com esse bundle ID.
5. Gerar a **chave de API do App Store Connect** (`.p8`) para o CI publicar sem
   senha. **Só dá para baixar uma vez** — guarde no cofre imediatamente.
6. Gerar a **chave APNs** (`.p8`) para push.
7. Gerar uma **chave com Sign in with Apple habilitado** (`.p8`), anotando o
   **Key ID** e o **Team ID**. O backend usa essa chave para trocar o código da
   Apple por um refresh token e para **revogar** o acesso na exclusão de conta
   (1.5). Também só baixa uma vez.

> O bundle ID é imutável depois da primeira publicação. `com.axon.app` mantém as
> duas lojas coerentes.

---

## Fase 1 — Sign in with Apple ← COMECE POR AQUI

**Esta é a primeira fase a executar, antes de gerar o projeto iOS e antes de
mexer no CI.** Razões:

1. É o **maior trabalho de código** do plano inteiro.
2. O **código** não depende da conta Apple nem gasta minutos de Actions.

Começar pela infraestrutura (projeto iOS, CI, certificados) deixaria você parado
esperando a conta aprovar, com a parte mais longa ainda por fazer.

**Mas o teste depende da conta Apple — inclusive na web.** O fluxo web só roda
com um Services ID que tenha domínio e Return URL cadastrados no portal da Apple
(Fase 0, item 3), e a Apple recusa `localhost`. Então: escreva o código agora; o
teste de ponta a ponta espera a conta aprovada, os itens 3 e 7 da Fase 0 e a
configuração do Supabase (1.1).

### 1.1 Configuração no Supabase (Bernardo faz)

Painel do Supabase → Authentication → Providers → Apple.

- **Client IDs:** os **dois** identificadores, separados por vírgula — o
  **Services ID** (tokens emitidos na web) e **`com.axon.app`** (tokens emitidos
  pela folha nativa do iOS). O `aud` do `id_token` é diferente em cada caso; com
  só um cadastrado, o outro fluxo é recusado.
- Team ID, Key ID e chave `.p8`: saem da Fase 0 (item 7).

**Avise o Bernardo quando chegar aqui** — sem isso o backend não valida o token.

### 1.2 Backend

Crie `backend/routers/apple_auth.py` (prefixo `/auth/apple`) e registre em
`main.py` junto dos outros. A lógica que não é HTTP vai para
`backend/services/apple_service.py`.

O núcleo da autenticação é o mesmo do Google:

```python
supabase_session = supabase_auth.auth.sign_in_with_id_token({
    "provider": "apple",
    "token": id_token,
    "nonce": raw_nonce,
})
```

**O fluxo web NÃO é um espelho do Google.** Diferenças concretas:

- **Callback é POST, não GET.** Ao pedir `name email` no `scope`, a Apple exige
  `response_mode=form_post`: ela faz um POST de formulário para
  `/auth/apple/callback` com `code`, `id_token`, `state` e, só na primeira vez,
  `user`. A rota precisa ser `@router.post` lendo `Form(...)`
  (`python-multipart` já está no `requirements.txt`). Depois de processar,
  responda com o mesmo redirect + `session_code` de uso único que o Google usa
  (reaproveite `google_service.store_session` / `/auth/google/session`, ou
  extraia para um módulo comum — não duplique).
- **`state` guardado no servidor**, como em `google_service.generate_and_store_state`.
  Nunca confie em dado que volta só na URL.
- **Nonce contra replay.** Gere um nonce aleatório ao iniciar o login, guarde o
  valor cru no servidor junto do `state`, mande o **SHA-256** dele para a Apple e
  repasse o valor **cru** ao `sign_in_with_id_token`. No nativo, o frontend gera o
  nonce, passa o hash ao plugin e o cru ao backend.
- **Troca do `code` pelo refresh token da Apple.** O `code` recebido é trocado em
  `https://appleid.apple.com/auth/token` por um `refresh_token`, que precisa ser
  **guardado** — é ele que permite revogar o acesso na exclusão de conta (1.5).
  A troca exige um *client secret*: um JWT ES256 assinado com a `.p8` da Fase 0
  (item 7), com `iss` = Team ID, `sub` = client ID (Services ID na web,
  `com.axon.app` no nativo), `aud` = `https://appleid.apple.com`. Gere-o sob
  demanda com validade curta, em vez de guardar um fixo (o máximo aceito pela
  Apple são 6 meses, e um fixo vence em silêncio). Verifique se `PyJWT` com
  `cryptography` já está no ambiente antes de adicionar dependência.
- **Migration 36** (a última aplicada é a 35): coluna para o refresh token da
  Apple em `profiles` (ex.: `apple_refresh_token text`), com comentário do porquê.
  Aplicada à mão pelo Bernardo antes de reiniciar o backend.

**Diferenças de dados que quebram quem assume simetria com o Google:**

**a) O nome vem UMA VEZ SÓ, e NÃO vem no `id_token`.** Na web ele chega no campo
de formulário `user` (JSON com `name.firstName`/`name.lastName`), só na primeira
autorização. No nativo, o plugin devolve `givenName`/`familyName` à parte. Não
existe endpoint para buscá-lo depois: se não for gravado naquele momento, perde-se
para sempre.

**Atenção à armadilha:** o `google_callback` regrava `name` em **todo** login
(`google_auth.py`, o `upsert` por volta da linha 228). Copiado para a Apple, isso
**apagaria o nome** a partir do segundo login, quando `user` vem vazio. Inclua
`name` no upsert **só quando vier preenchido**. O nome vem do cliente e não é
assinado pela Apple — serve só como nome de exibição, nunca para decisão de
acesso; limite o tamanho.

**b) O e-mail pode ser um relay.** O usuário pode escolher "Ocultar meu e-mail" e
você recebe algo como `abc123@privaterelay.appleid.com`. Esse endereço funciona
para envio, mas deixa de funcionar se o usuário revogar o acesso ao app.

Trate como e-mail normal — não tente detectar nem bloquear. Mas saiba que a
recuperação de senha e os relatórios por e-mail dependem dele.

**c) Contas não se fundem pelo relay.** Se o usuário já tem conta Google e entra
pela Apple com "Ocultar meu e-mail", vira uma conta separada (o e-mail é outro).
É o comportamento esperado; não tente unificar.

**Segurança, não negociável:** valide o `id_token` antes de confiar em qualquer
campo. Quem valida é o Supabase, via `sign_in_with_id_token`. Nunca leia o payload
do JWT e confie nele sem validação — o `_is_recovery_token` em `auth.py` lê claims
**depois** de o `get_user` ter validado a assinatura; siga esse padrão.

Toda função nova em `services/` recebe `user_id` e filtra por ele (AGENTS.md §10).

### 1.3 Frontend — web

Botão "Entrar com a Apple" no Login e no Signup, ao lado do botão do Google.

**Siga as diretrizes visuais da Apple.** Ela rejeita botão fora do padrão: há
regras de altura, raio, logo, texto e contraste. Procure "Sign in with Apple
button guidelines" na documentação oficial antes de desenhar.

O botão precisa ter proeminência equivalente ao do Google — a Apple verifica isso.

Na web o fluxo é um redirect para a Apple, que volta por **POST** ao backend
(1.2); o backend então redireciona ao frontend com o `session_code`, e daí em
diante é igual ao Google (`/auth/callback`).

**Android — decisão pendente do Bernardo.** O plugin
`@capacitor-community/apple-sign-in` só funciona no iOS e na web; no app Android
ele não existe. A Apple só exige o botão no app iOS. Opções:

- **Esconder o botão da Apple no app Android** (recomendado para agora): menos
  código, nenhuma exigência descumprida. A web continua mostrando.
- Fazer no Android o fluxo pelo navegador + deep link, como o do Google: mais
  trabalho, e o retorno por POST exige uma página intermediária no backend.

Até a decisão, trate como "esconder no Android".

**Tipos e HTTP:** toda chamada passa por `axonweb/src/lib/api.ts`, com o tipo da
resposta ao lado da função. Nunca `fetch` direto numa página (AGENTS.md §8).

### 1.4 Frontend — nativo

Use `@capacitor-community/apple-sign-in`. No iOS, a Apple espera ver a **folha
nativa**, não um navegador.

Não reaproveite `openAuthUrl` nem `deepLinkToRoute` do `nativeAuth.ts` — eles
existem para o fluxo por deep link do Google. O plugin da Apple devolve o
resultado direto.

O plugin devolve `identityToken`, `authorizationCode` e, só na primeira vez,
`givenName`/`familyName` e `email`. Envie os três ao backend num endpoint próprio
(ex.: `POST /auth/apple/native`) — o backend valida o token pelo Supabase, troca
o `authorizationCode` pelo refresh token (com `sub` = `com.axon.app` no client
secret) e grava o nome só se veio preenchido, exatamente como na web. O nonce é
gerado no frontend (hash para o plugin, cru para o backend).

Lembre-se: **plugin nativo não chega por live reload.** Depois de instalar,
desinstale o app do aparelho e instale de novo.

Verifique a compatibilidade da versão do plugin com o Capacitor 8 antes de
instalar.

### 1.5 Exclusão de conta revoga o acesso na Apple — obrigatório

A Apple exige (diretriz 5.1.1(v)) que apps com Sign in with Apple **revoguem o
token** quando o usuário exclui a conta. Hoje `DELETE /account`
(`backend/services/account_service.py`, `delete_account`) grava em
`deleted_accounts` e apaga o usuário do Supabase — **não fala com a Apple**.

O que acrescentar:

1. Antes do `admin.delete_user`, ler `apple_refresh_token` do perfil (filtrando
   por `user_id`). Se existir, chamar `https://appleid.apple.com/auth/revoke` com
   `client_id`, `client_secret` (o mesmo JWT de 1.2, com o `sub` do fluxo que
   emitiu o token), `token` e `token_type_hint=refresh_token`.
2. Guarde junto do refresh token **qual client ID o emitiu** (web ou nativo) —
   a revogação precisa do mesmo `client_id`. Isso entra na Migration 36.
3. **Falha na revogação não impede a exclusão.** O usuário pediu para apagar os
   dados; a exclusão acontece e a falha é registrada (sem dado pessoal no log),
   com comentário explicando o porquê, como as outras integrações secundárias
   (AGENTS.md §14).
4. O `admin.delete_user` continua no cliente de **dados** (`supabase`) — ver a
   armadilha do `auth.admin` acima.

O botão "Excluir conta" já existe em `Settings.tsx`; o frontend não muda.

### Variáveis de ambiente novas (backend)

Em `backend/.env` (nunca no Git, nunca em docs com valor real). Ao implementar,
acrescente-as também à lista do `CLAUDE.md`:

```
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY        conteúdo da .p8 (item 7 da Fase 0)
APPLE_SERVICES_ID        client ID da web
APPLE_BUNDLE_ID          com.axon.app, client ID do nativo
```

No VPS, o `.env` de produção também precisa delas antes do deploy do backend.

### 1.6 Verificação desta fase

1. Web, conta nova: botão da Apple → autoriza → entra no app → o perfil tem nome
   e e-mail corretos.
2. Web, **segunda entrada** com a mesma conta Apple: entra normalmente, e o nome
   **continua** no perfil (prova que foi gravado na primeira vez).
3. Web, conta que escolheu "Ocultar meu e-mail": entra, e o perfil tem o endereço
   de relay.
4. O botão do Google continua funcionando, sem regressão.
5. Login por e-mail e senha continua funcionando.
6. Recuperação de senha continua funcionando.
7. Mobile ~400px: os dois botões sociais cabem e ficam legíveis.
8. Depois do primeiro login pela Apple, `profiles` tem `apple_refresh_token`
   preenchido para aquele usuário.
9. **Excluir conta** de um usuário Apple: a conta some do Supabase **e** o app
   some de "Apps que usam o ID Apple" nos Ajustes da conta Apple (prova da
   revogação). Entrar de novo pela Apple pede autorização como conta nova — e
   o nome volta a ser enviado.
10. Excluir conta de um usuário **sem** Apple (e-mail/senha ou Google) continua
    funcionando, sem chamada à Apple.
11. App Android (se a decisão for esconder): o botão da Apple não aparece.

Os testes 1 a 3 e 8 a 9 usam contas Apple reais: apague ao terminar tudo o que
foi criado (perfil, stats, notificações) e confirme a revogação.

---

## Fase 2 — Gerar o projeto iOS

```bash
cd axonweb
npm i @capacitor/ios
npx cap add ios
```

**O `pod install` no fim vai falhar no Codespace** — CocoaPods depende de
ferramentas da Apple. Isso é esperado e não é problema: os arquivos do projeto são
gerados e entram no Git; o `pod install` acontece no runner macOS.

### Ajustes

**`axonweb/capacitor.config.ts`** — o bloco `android` ganha um irmão `ios`.
**Mantenha o `server.url` condicional ao `CAP_SERVER_URL` exatamente como está.**
Esse condicional é a proteção que impede um build de release apontar para o
servidor de desenvolvimento — falha de segurança grave. Não simplifique.

**`.gitignore`** — acrescente `ios/App/Pods/` e `ios/App/App/public/` (saída do
build), no mesmo espírito do que já existe para `android/`.

**Assets** — o iOS não usa os arquivos do Android. Precisa de:
- Ícone **1024×1024**, sem transparência e **sem cantos arredondados** (a Apple
  arredonda sozinha; cantos já arredondados ficam com borda dupla)
- Splash em `Assets.xcassets`

As fontes estão em `axonweb/assets/` (`icon.png`, `splash.png`, `splash-dark.png`).

**`Info.plist`** — as strings de permissão, em português claro:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>O Axon usa o microfone para você conversar com o assistente por voz.</string>
```

A Apple rejeita descrição genérica. O app pede microfone porque tem a rota `/voz`
e o botão de voz do chat.

---

## Fase 3 — CI de build no GitHub Actions

Crie `.github/workflows/ios.yml`. **Não existe workflow nenhum no repositório
hoje** — este é o primeiro.

### Gatilho manual, obrigatoriamente

```yaml
on:
  workflow_dispatch:
```

**Nunca `on: push`.** Cada build gasta ~15 minutos reais de uma cota de ~200 por
mês. Build automático queimaria tudo em uma tarde.

### O que o workflow faz

```yaml
jobs:
  build:
    runs-on: macos-latest
```

Em ordem:

1. Checkout
2. Node + `npm ci`
3. `VITE_API_URL=https://api.axonapp.tech npm run build`
4. `npx cap sync ios`
5. Instalar certificado e provisioning profile a partir dos secrets
6. `xcodebuild archive` e `xcodebuild -exportArchive` → `.ipa`
7. Upload para o TestFlight com a chave `.p8`

### Secrets (Settings → Secrets and variables → Actions)

Nunca no código, nunca em docs:

```
APPLE_CERTIFICATE_P12         certificado de distribuição, em base64
APPLE_CERTIFICATE_PASSWORD
APPLE_PROVISIONING_PROFILE    em base64
APPSTORE_API_KEY_ID
APPSTORE_API_ISSUER_ID
APPSTORE_API_PRIVATE_KEY      o .p8, em base64
```

### As proteções do build, copiadas do Android

`scripts/build-release.sh` recusa a build em quatro situações, e as quatro foram
testadas. **Replique a mesma lógica no workflow:**

| Situação | Resultado esperado |
|---|---|
| `CAP_SERVER_URL` definida | ❌ recusa — evitaria app publicado apontando para dev |
| `VITE_API_URL` de dev (localhost, github.dev) | ❌ recusa |
| `VITE_API_URL` ausente | ❌ recusa |
| Certificado ausente | ❌ recusa |

Leia `scripts/build-release.sh` antes de escrever o workflow; ele é o modelo.

### Estratégia para não desperdiçar minutos

**Primeira execução: um workflow mínimo de ~2 minutos** que faz só o `pod install`
e para. Confirma que o projeto gerado no Linux é válido e que os certificados
foram instalados. Se algo estiver errado, você descobre gastando 2 minutos em vez
de 15.

**Só depois** rode o build completo.

---

## Fase 4 — Push no iOS

O backend já envia por FCM e **não muda**. Falta a ponte APNs:

1. Subir a chave APNs `.p8` no console do Firebase (Bernardo faz)
2. Habilitar Push Notifications e Background Modes no projeto Xcode
3. `@capacitor/push-notifications` já está instalado; o código do frontend serve

**Diferença de comportamento que afeta o produto:** no iOS a permissão de
notificação é pedida explicitamente e, **uma vez negada, não pode ser pedida de
novo** pelo app — o usuário precisa ir nos Ajustes do sistema.

Escolha bem o momento de pedir. Pedir na abertura do app queima a chance com quem
ainda não entendeu o valor. **Isto é decisão de produto — pergunte ao Bernardo.**

---

## Fase 5 — Ficha e revisão

Os textos vêm de `docs/play-store/FICHA_LOJA.md`. Diferenças do Android:

**Screenshots por tamanho de tela** (6,7" e 6,5" no mínimo). Os do Android não
servem — proporção diferente.

**Privacy Nutrition Labels** — o equivalente ao Data Safety. Use
`docs/play-store/DATA_SAFETY.md`, que foi revisado em 28/09/2026 e **inclui a
seção de Áudio**. A Apple cruza isso com as permissões do `Info.plist`; declarar
microfone sem declarar áudio é inconsistência detectável.

**Idade mínima: 13 anos**, com autorização dos pais entre 13 e 17. Decisão de
25/09/2026, já refletida em `termos.html`, `privacidade.html` e no público-alvo da
Play Store. Mantenha coerente na App Store.

**Conta de teste** no campo de revisão — a mesma usada na Play Store, com o
questionário de cronotipo já respondido.

**EULA:** `https://axonapp.tech/legal/termos.html`.

### O que a Apple rejeita e o Google não

- App que parece incompleto ou em testes
- Login social sem Sign in with Apple (Fase 1)
- Exclusão de conta que não revoga o token da Apple (1.5)
- Funcionalidade que não funciona de verdade
- Permissão pedida sem explicação clara no `Info.plist`
- Conteúdo gerado por IA sem moderação declarada

Revisão leva de 1 a 7 dias. Rejeição custa outro ciclo.

---

## Ordem de execução

| | Fase | Depende de | Pode começar? |
|---|---|---|---|
| 1 | **Fase 1 — código: backend, Migration 36, botão web, revogação** | nada | ✅ **hoje** |
| 2 | Fase 0 — conta Apple | solicitada em 28/09/2026 | Bernardo, em análise |
| 3 | Fase 0 itens 2–7 + Supabase (1.1) + Migration 36 aplicada | conta aprovada | Bernardo |
| 4 | Fase 1 — **teste** web e exclusão de conta | item 3 | depois |
| 5 | Fase 1.4 — parte nativa | conta + aparelho | depois |
| 6 | Fase 2 — projeto iOS | conta criada | depois |
| 7 | Fase 3 — CI | certificados | depois |
| 8 | Fase 4 — push | conta e CI | depois |
| 9 | Fase 5 — ficha e envio | tudo acima | por último |

**Decisões pendentes do Bernardo:** botão da Apple no app Android (1.3) e
momento de pedir permissão de notificação no iOS (Fase 4).

---

## Definition of Done (de cada fase)

Checklist da seção 18 do `AGENTS.md`, integralmente:

```bash
cd axonweb && npm run lint
cd axonweb && npx tsc --noEmit -p tsconfig.json
cd axonweb && npm run build
cd backend && python3 -c "import main"
```

Mais:

- Fluxo testado no navegador; no aparelho se tocou em nativo
- Mobile revisado em ~400px
- Console do navegador sem erro novo
- Aba Network sem request novo em laço
- Toda query nova filtrando `user_id`; nenhum endpoint novo sem auth
- **Nenhum secret novo em código, log ou docs** — nem da Apple, nem do Supabase
- Migration aplicada no Supabase antes do deploy, se houver

---

## Ambiente do Codespace novo

O `.env` do backend **não está no Git**, corretamente. Sem ele o backend não sobe:

```bash
cd backend && python3 -c "import main"   # falha sem .env
```

O Bernardo tem uma cópia. Peça a ele se o arquivo não existir.

Variáveis obrigatórias: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`ANTHROPIC_API_KEY`. As de Google, voz e push estão listadas no `CLAUDE.md`.

Para rodar tudo:

```bash
npm run dev          # frontend :5173 + backend :8000
```

> **Cuidado:** se o `.env` apontar para o Supabase de produção, o
> `planning_scheduler` deste backend local enviará notificações e push reais.
> Confirme com o Bernardo antes de deixar rodando.
