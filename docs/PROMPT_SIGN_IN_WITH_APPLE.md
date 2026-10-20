# Prompt — Sign in with Apple (Fase 1, backend + web)

Leia `AGENTS.md` antes de mexer. O plano completo do iOS está em
`docs/PLANO_IOS.md`; **não é preciso lê-lo inteiro** — tudo que esta tarefa
exige está aqui.

---

## Objetivo

Implementar login com a Apple **no backend e na web**, mais a revogação
obrigatória do token na exclusão de conta.

## Por quê

A Apple **exige** que todo app com login social de terceiros ofereça também
Sign in with Apple. O Axon tem login com Google. Sem isso, a revisão rejeita.

Junto vem uma segunda exigência que costuma ser esquecida (diretriz 5.1.1(v)):
**excluir a conta tem que revogar o token na Apple.** Também é rejeição.

## Escopo — e o que fica de fora

**Dentro:** backend (`/auth/apple/*`), botão na web, Migration 37, revogação na
exclusão de conta.

**Fora, de propósito:** o fluxo **nativo iOS** (`@capacitor-community/apple-sign-in`).
O projeto iOS ainda não existe no repositório — só existe `axonweb/android/`.
Código nativo escrito agora não compila, não roda e não dá para testar, e o
`AGENTS.md` §18 exige exercitar o caminho real. Ele entra junto com a Fase 2,
quando houver projeto iOS.

**No app Android, esconda o botão da Apple.** O plugin não existe no Android e a
Apple só exige o botão no app iOS. A web continua mostrando. (Decisão registrada
no `PLANO_IOS.md` §1.3.)

---

## O que já está pronto (Fase 0, concluída em 20/10/2026)

```
Team ID:       AR8WL2CU44
Bundle ID:     tech.axonapp.app        (client ID do nativo)
Services ID:   tech.axonapp.web        (client ID da web)
Return URL:    https://api.axonapp.tech/auth/apple/callback
```

A chave `.p8` e o Key ID estão com o Bernardo. **Peça a ele** — não existem no
repositório e não devem existir.

### Variáveis de ambiente novas

Em `backend/.env`, e também na lista do `CLAUDE.md`:

```
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY        conteúdo da .p8
APPLE_SERVICES_ID        tech.axonapp.web
APPLE_BUNDLE_ID          tech.axonapp.app
```

> **O `.env` do VPS não viaja no `deploy.sh`.** Avise o Bernardo que essas cinco
> precisam ser copiadas à mão na produção **antes** do deploy do backend — a voz
> quebrou exatamente assim em 02/10/2026.

### Configuração no Supabase — o Bernardo faz, avise-o

Authentication → Providers → Apple. **Client IDs: os dois, separados por
vírgula** — `tech.axonapp.web` e `tech.axonapp.app`. O `aud` do `id_token` é
diferente em cada fluxo; com só um cadastrado, o outro é recusado.

Sem isso o backend não valida o token e nada funciona.

---

## Migration 37

A última em `migrations.sql` é a **36** (`api_usage_events`) — confira com
`grep -n "^-- Migration" backend/migrations.sql | tail -1` antes de escrever.

Acrescente em `profiles`:

- `apple_refresh_token text` — é ele que permite revogar na exclusão de conta.
- **a coluna que guarda qual client ID emitiu o token** (web ou nativo). A
  revogação exige o **mesmo** `client_id` que emitiu; sem guardar, não dá para
  revogar corretamente quando o nativo existir.

Com comentário explicando o porquê, como as outras. **O Bernardo aplica à mão**
no SQL Editor antes de reiniciar o backend — avise quando estiver pronta.

---

## Backend

`backend/routers/apple_auth.py` (prefixo `/auth/apple`), registrado em
`main.py` junto dos outros. A lógica que não é HTTP vai para
`backend/services/apple_service.py`.

O núcleo é o mesmo do Google:

```python
supabase_session = supabase_auth.auth.sign_in_with_id_token({
    "provider": "apple",
    "token": id_token,
    "nonce": raw_nonce,
})
```

### Cinco diferenças concretas em relação ao Google

**1. O callback é POST, não GET.** Pedindo `name email` no `scope`, a Apple
exige `response_mode=form_post`: ela faz um POST de formulário com `code`,
`id_token`, `state` e — só na primeira vez — `user`. A rota é `@router.post`
lendo `Form(...)`. O `python-multipart` já está no `requirements.txt`.

Depois de processar, responda com o mesmo redirect + `session_code` de uso único
que o Google usa. **Reaproveite** `google_service.store_session` e
`/auth/google/session`, ou extraia para um módulo comum — não duplique.

**2. `state` guardado no servidor**, como em
`google_service.generate_and_store_state`. Nunca confie em dado que volta só na
URL.

**3. Nonce contra replay.** Gere um nonce aleatório ao iniciar o login, guarde o
valor **cru** no servidor junto do `state`, mande o **SHA-256** para a Apple e
repasse o **cru** ao `sign_in_with_id_token`.

**4. Client secret é um JWT ES256 assinado com a `.p8`.**

```
iss = APPLE_TEAM_ID
sub = client ID      (Services ID na web; tech.axonapp.app no nativo)
aud = https://appleid.apple.com
kid = APPLE_KEY_ID   (no header)
```

Gere **sob demanda, com validade curta**. Não guarde um fixo: o máximo que a
Apple aceita são 6 meses e ele vence em silêncio.

> **Use `python-jose`, não `PyJWT`.** O `python-jose[cryptography]` está
> declarado no `requirements.txt` e assina ES256 com `kid` no header (testado na
> 3.5.0 instalada). O `PyJWT` também está no ambiente (2.13.0), mas **não está
> no `requirements.txt`** — é transitivo e some num install limpo. **Não
> adicione dependência nova.**

**5. Troque o `code` pelo refresh token** em
`https://appleid.apple.com/auth/token` e **guarde-o** (Migration 37), junto do
client ID que o emitiu.

### Três diferenças de dados que quebram quem assume simetria

**a) O nome vem UMA VEZ SÓ e NÃO vem no `id_token`.** Na web ele chega no campo
de formulário `user` (JSON com `name.firstName`/`name.lastName`), só na primeira
autorização. Não existe endpoint para buscá-lo depois: se não gravar naquele
momento, perde-se para sempre.

> ### ⚠️ A armadilha que você vai copiar sem querer
>
> `google_auth.py:229` faz `supabase.table("profiles").upsert(update)` e regrava
> `name` em **todo** login. Copiado para a Apple, isso **apagaria o nome a
> partir do segundo login**, quando `user` vem vazio.
>
> Inclua `name` no upsert **só quando vier preenchido.**

O nome vem do cliente e **não é assinado pela Apple** — serve como nome de
exibição, nunca para decisão de acesso. Limite o tamanho.

**b) O e-mail pode ser um relay** (`...@privaterelay.appleid.com`) se o usuário
escolher "Ocultar meu e-mail". Trate como e-mail normal — não detecte, não
bloqueie. Saiba que recuperação de senha e relatórios por e-mail dependem dele,
e que ele para de funcionar se o usuário revogar o acesso.

**c) Contas não se fundem pelo relay.** Quem já tem conta Google e entra pela
Apple ocultando o e-mail vira conta separada. É o esperado; não tente unificar.

### Segurança, não negociável

Valide o `id_token` **antes** de confiar em qualquer campo. Quem valida é o
Supabase, via `sign_in_with_id_token`. Nunca leia o payload do JWT e confie nele
sem validação — o `_is_recovery_token` em `auth.py` lê claims **depois** de o
`get_user` ter validado a assinatura. Siga esse padrão.

Toda função nova em `services/` recebe `user_id` e filtra por ele (AGENTS.md §10).

---

## Revogar na exclusão de conta — obrigatório

Hoje `delete_account` (`backend/services/account_service.py`) grava em
`deleted_accounts` e apaga o usuário do Supabase. **Não fala com a Apple.**

1. **Antes** do `admin.delete_user`, leia `apple_refresh_token` do perfil
   (filtrando por `user_id`). Se existir, chame
   `https://appleid.apple.com/auth/revoke` com `client_id` (o mesmo que emitiu),
   `client_secret` (o JWT acima, com o `sub` correspondente), `token` e
   `token_type_hint=refresh_token`.
2. **Falha na revogação NÃO impede a exclusão.** O usuário pediu para apagar os
   dados; a exclusão acontece e a falha é registrada **sem dado pessoal no log**,
   com comentário explicando o porquê — como as outras integrações secundárias
   (AGENTS.md §14).
3. O `admin.delete_user` continua no cliente de **dados** (`supabase`), nunca no
   `supabase_auth` — ver `supabase-auth-admin-header-contaminado`.

O botão "Excluir conta" já existe em `Settings.tsx`. O frontend não muda.

---

## Frontend web

Botão "Entrar com a Apple" no Login e no Signup, ao lado do do Google.

**Crie `components/auth/AppleAuthButton.tsx` como irmão do
`GoogleAuthButton.tsx` que já existe ali** — não altere o do Google e não
escreva o botão solto dentro das páginas (AGENTS.md §5: componente de auth
compartilhado vive em `components/auth/`, não copiado por página).

> **Arquivos que NÃO devem ser tocados nesta tarefa.** Uma segunda pessoa está
> editando, sem commit, `Chat.tsx`, `ChatConversation.tsx`, `Dashboard.tsx`,
> `Focus.tsx`, `Insights.tsx`, `Planning.tsx`, `Profile.tsx` e
> `components/layout/BottomNav.tsx`. Nada da Fase 1 precisa deles. Se você
> achar que precisa, **pare e pergunte ao Bernardo** antes de editar.

**Siga as diretrizes visuais da Apple** ("Sign in with Apple button
guidelines"): há regras de altura, raio, logo, texto e contraste, e ela rejeita
botão fora do padrão. A proeminência precisa ser **equivalente** à do Google —
a Apple verifica isso.

O fluxo é um redirect para a Apple, que volta por **POST** ao backend; o backend
redireciona ao frontend com o `session_code`, e daí em diante é igual ao Google
(`/auth/callback`).

Esconda o botão no app Android (ver Escopo).

Toda chamada HTTP passa por `axonweb/src/lib/api.ts`, com o tipo da resposta ao
lado da função. Nunca `fetch` direto numa página (AGENTS.md §8).

---

## Verificação

Com contas Apple reais:

1. Conta nova pela web: autoriza → entra → perfil com nome e e-mail corretos.
2. **Segunda entrada** com a mesma conta: entra normal e **o nome continua lá**
   (prova que foi gravado na primeira vez e não apagado pelo upsert).
3. Conta com "Ocultar meu e-mail": entra, perfil com o endereço de relay.
4. `profiles` tem `apple_refresh_token` e o client ID preenchidos.
5. **Excluir conta** de um usuário Apple: some do Supabase **e** o Axon some de
   "Apps que usam o ID Apple" nos Ajustes da conta Apple. Entrar de novo pede
   autorização como conta nova, e o nome volta a ser enviado.
6. Excluir conta **sem** Apple (e-mail/senha ou Google) continua funcionando,
   sem chamada à Apple.
7. Botão do Google sem regressão; e-mail/senha sem regressão; recuperação de
   senha sem regressão.
8. Mobile ~400px: os dois botões sociais cabem e ficam legíveis.
9. App Android: o botão da Apple **não** aparece.

> **Apague os dados de teste ao terminar** — perfis, stats e notificações
> criados nas contas reais, e confirme a revogação (AGENTS.md e
> `feedback-apagar-dados-de-teste`).

## Definition of Done

```bash
cd axonweb && npm run lint
cd axonweb && npx tsc --noEmit -p tsconfig.json
cd axonweb && npm run build
cd backend  && python3 -c "import main"
```

Mais: Migration 37 escrita e **avisada ao Bernardo** para aplicar; as cinco
variáveis novas avisadas para copiar à mão no VPS; o Supabase configurado com os
**dois** client IDs; console sem erro novo; nenhum segredo em log, doc ou commit.

**Não commite — o Bernardo faz os commits.**
