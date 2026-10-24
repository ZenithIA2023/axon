# Prompt — Mensagens de erro do login e seção "Sobre"

Duas tarefas, encontradas nos testes de 23/10/2026. Leia o `AGENTS.md` antes
de mexer em qualquer coisa.

A Tarefa 1 é a que o usuário sente: hoje **errar a senha mostra "Sessão
expirada"**. A Tarefa 2 dá um lugar definitivo ao carimbo de build, que na
leva anterior ficou escondido atrás de `import.meta.env.DEV`.

---

## Tarefa 1 — Todo erro de login vira "Sessão expirada"

**Sintoma:** na tela de login, qualquer falha que não seja "backend
inacessível" mostra `Sessão expirada` — inclusive senha errada.

**Causa (verificada):** `axonweb/src/lib/api.ts`, helper `request()`. O bloco
de `401` (linhas ~151-172) existe para os endpoints **autenticados**: token
velho → renova com o refresh token → se não der, apaga a sessão, manda para
`/login` e lança `Sessão expirada`.

O problema é que `/auth/login` é o **único endpoint público que responde 401
como resultado legítimo de negócio**. O backend já manda a mensagem certa —
`backend/routers/auth.py:63` e `:66`, `detail="E-mail ou senha incorretos"` —
mas ela nunca chega na tela: o `request()` intercepta o 401 antes de ler o
corpo da resposta, e ainda apaga a sessão e dispara um redirecionamento de
quem nem estava logado.

### As quatro situações reais da tela

Confirmei cada linha no código e nas libs instaladas:

| Situação | HTTP | Tela mostra **hoje** | Deveria mostrar |
|---|---|---|---|
| Senha errada, e-mail não cadastrado, **ou conta criada com Google/Apple** | 401 | `Sessão expirada` | "E-mail ou senha incorretos. Se você criou sua conta com Google ou Apple, entre por aquele botão — ou use 'Esqueci minha senha' para definir uma senha." |
| Sem rede / backend fora do ar | — (fetch falha) | dev: dica da porta 8000 · produção: "Não foi possível conectar ao servidor." | **manter como está** |
| Mais de 10 tentativas no mesmo minuto (`@limiter.limit("10/minute")`) | 429 | `Erro na requisição` | "Muitas tentativas de login. Espere um minuto e tente de novo." |
| E-mail que o navegador aceita e o backend recusa (ex.: `teste@gmail`) | 422 | `[object Object]` | "Digite um e-mail válido." |

Por que os dois últimos saem errados:

- **429:** o handler do slowapi (`_rate_limit_exceeded_handler`, registrado em
  `backend/main.py:25`) responde `{"error": "Rate limit exceeded: ..."}` — a
  chave é `error`, **não** `detail`. O `request()` lê `error.detail`, não acha
  nada e cai no fallback `"Erro na requisição"`. E o texto do slowapi é em
  inglês: não mostre ele ao usuário nem se existisse em `detail`.
- **422:** o FastAPI responde `detail` como **lista de objetos**. `new
  Error(lista)` produz a string `[object Object]`, que é o que vai para a tela.
  O `required` dos campos impede o envio vazio, mas `type="email"` do navegador
  aceita `teste@gmail`, que o Pydantic (`EmailStr`) recusa — testado.

### Como corrigir

**1a. Deixar o `login` pedir que o 401 não seja tratado como logout.**
O `request()` precisa de uma forma de desligar o bloco de 401 para **uma**
chamada. Resolva como ficar mais natural no arquivo (um parâmetro de opção, um
caminho na lista de exceções, o que você julgar melhor) — mas com um nome em
português, como o resto do arquivo, e com comentário dizendo **por que** existe.

Quem usa isso é **só** `api.login()` (`api.ts:207`). Não generalize:

- `/auth/refresh` **continua** como está — o 401 dele é sessão expirada de verdade.
- Todo endpoint autenticado **continua** deslogando em 401. Essa é a defesa
  que leva o usuário de volta ao login quando o token morre; mexer nela
  reabre um bug que já foi caro.

**1b. Ensinar o leitor de erro a entender os três formatos.**
Hoje `api.ts:174-176` só sabe ler `{detail: "texto"}`. Faça ele cobrir:

- `detail` string → usa o texto (é o caso que já funciona);
- `detail` lista (422) → **uma** mensagem genérica nossa. Não imprima o
  caminho do campo nem a mensagem do Pydantic: é detalhe interno, e o
  `AGENTS.md §10` proíbe;
- corpo com `error` (429) → mensagem nossa, nunca o texto do slowapi;
- status 429, mesmo que o corpo venha em outro formato.

Isso é **central**: vale para toda tela do app, não só o login. Então confira
que nenhuma mensagem que já funcionava piorou — em especial o 400 do cadastro
(`"Este e-mail poderá ser utilizado novamente apenas após N dias"`) e o 400 do
link de recuperação (`auth.py:192`).

**1c. O texto do 401 do login.**
A mensagem é **a mesma para toda falha**, de propósito. Um texto que
distinguisse "e-mail não existe" de "senha errada" transformaria a tela de
login num verificador de quem tem conta no AXON — é a mesma razão pela qual
`forgot-password` responde igual exista ou não a conta.

A menção a Google/Apple é segura **justamente porque aparece sempre**: ela não
revela nada sobre aquele e-mail específico, e resolve o caso real de quem
criou a conta pelo botão social e depois tentou entrar pelo formulário. Esse
usuário tem um caminho que funciona — "Esqueci minha senha" define uma senha
para a conta que já existe (já testado pelo Bernardo).

O texto pode ficar no backend (onde já está) ou na tela; prefira o backend e
só deixe ele passar. Se a frase ficar longa demais para a caixa de erro da
tela (`Login.tsx:131-136`, duas linhas no mobile), ajuste o layout da caixa —
não corte a informação.

**1d. Mensagens das telas vizinhas.**
`Signup.tsx:161`, `ForgotPassword.tsx` e `ResetPassword.tsx` usam o mesmo
`request()` e ganham o 1b de graça. Dê uma passada nelas e diga no relatório
se alguma mensagem mudou.

---

## Tarefa 2 — Seção "Sobre" nas configurações, com versão e commit

**Decisão do Bernardo (23/10/2026):** o carimbo do build sai da tela de login
e passa a morar nas configurações, junto da versão do app.

**Onde:** `axonweb/src/pages/Settings.tsx`. O array `SETTINGS_SECTIONS`
(linhas 43-53) tem hoje quatro seções — `organization`, `appearance`, `voice`,
`integrations`. Acrescente a quinta, `about`, com título "Sobre", e siga o
padrão que as outras já usam: lista com `MobileExpandableRow` no mobile e
`SettingsCard` dentro do `hidden ... lg:grid` no desktop. Ícone do
lucide-react, como as demais.

**O que a seção mostra:**

1. **Versão e número de build da loja**, lidos com `App.getInfo()` do
   `@capacitor/app` — já instalado (`package.json:16`) e já usado em
   `src/lib/nativeBack.ts`. Devolve `{ version, build }`, que no Android são o
   `versionName`/`versionCode` de `android/app/build.gradle:13-14` (hoje `1.2`
   e `4`) e no iOS o `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` do projeto
   Xcode (hoje `1.0` e `2`).

   **Não escreva a versão à mão em nenhum lugar e não leia do
   `axonweb/package.json`** — ele está em `0.0.0` e não tem relação com a
   versão publicada. Dois lugares com a mesma versão viram, na primeira
   atualização, uma tela mentindo sobre o que está instalado.

2. **O commit**, de `BUILD_COMMIT` em `src/lib/buildInfo.ts`.

3. **Na web não existe `getInfo()`** — é plugin nativo, a chamada falha.
   Proteja com `Capacitor.isNativePlatform()` e, fora do app, mostre só o
   commit. A seção não deve sumir nem quebrar no site.

**Apresentação:** texto secundário, discreto — é informação de diagnóstico,
não funcionalidade. Rotule de forma que o usuário não confunda o commit com um
código que ele precisa usar para algo. Nada de `any` para o retorno do plugin:
o `@capacitor/app` já vem tipado.

**E então tire o carimbo da tela de login:** `Login.tsx:142-147`, o `<span>`
com `BUILD_COMMIT` e o comentário acima dele. O comentário diz que "o lugar
dele em produção ainda vai ser decidido" — foi decidido, é esta seção. Leve a
explicação do *porquê* para o novo lugar, em vez de apagá-la.

---

## O que NÃO tocar

- **`backend/routers/auth.py`:** as mensagens de lá já estão certas; o bug é
  no cliente. A única mudança aceitável é o texto do 401 do login (1c).
- **O anti-enumeração do `forgot-password`** (`auth.py:172-182`): responde a
  mesma coisa exista ou não a conta, de propósito. Não "melhore".
- **O logout em 401 dos endpoints autenticados** e o `/auth/refresh`.
- **As versões em si** (`build.gradle`, `project.pbxproj`, `package.json`):
  esta rodada só **lê**. Subir versão é parte da próxima build.
- O `relative z-10` das páginas e o `PagePortal` — nada aqui precisa deles.

## Como testar

Login (com `npm run dev:front`, apontando para o backend de verdade):

1. Senha errada numa conta que existe → mensagem de credencial, **não**
   "Sessão expirada". Confira também que a tela **não** recarrega nem redireciona.
2. E-mail que não existe → **a mesma** mensagem do item 1, palavra por palavra.
3. `teste@gmail` no campo de e-mail → "Digite um e-mail válido", não
   `[object Object]`.
4. Onze tentativas seguidas em menos de um minuto → mensagem de "muitas
   tentativas" em português, não "Erro na requisição".
5. Login correto → entra normalmente, e o `has_chronotype` continua mandando
   para `/app-loading` ou `/questionnaire-intro` como antes.
6. Já logado, com token expirado, abrindo uma tela qualquer → **continua**
   caindo no login com "Sessão expirada". Esse comportamento não pode ter se
   perdido.

Sobre:

7. No navegador: a seção aparece, mostra o commit e não dá erro no console.
8. No app (Android, `npm run android:sync`): versão `1.2`, build `4` e o commit.
9. A tela de login não tem mais o hash ao lado do botão, em dev nem em produção.

## Definition of Done (`AGENTS.md §18`)

- [ ] `cd axonweb && npm run lint`
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json`
- [ ] `cd axonweb && npm run build` sem aviso novo de chunk
- [ ] `cd backend && python3 -c "import main"`
- [ ] Os 9 testes acima, com o resultado de cada um no relatório
- [ ] Console do navegador sem erro novo
- [ ] Nenhum segredo, nenhum `any`, comentários em português

**Não commite.** O Bernardo faz os commits.
