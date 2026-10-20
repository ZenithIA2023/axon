# Resposta à verificação OAuth — 20/10/2026

> ## ✅ ENVIADO em 20/10/2026.
>
> **As credenciais de teste foram REMOVIDAS deste arquivo antes do commit.**
> O e-mail e a senha reais foram enviados ao Google no corpo do e-mail; aqui
> ficam só os marcadores. Senha em arquivo versionado fica no histórico do Git
> para sempre, mesmo depois de apagada. As credenciais vivas estão na página
> privada do Notion, junto das chaves da Apple.
>
> O e-mail abaixo foi enviado como resposta ao e-mail do Google de 25/09/2026.
> A análise estava **parada 25 dias** aguardando esta resposta, não na fila.
>
> **A partir de agora, congelado:** não mudar estado de publicação, tipo de
> usuário, escopos nem a justificativa até a análise terminar. O limite de 100
> usuários vale até a aprovação. Prazo que o Google indica: 4 a 6 semanas, com
> o primeiro retorno do time de Trust and Safety em 3 a 5 dias.

Registro do que foi respondido ao Google, para não contradizer nada depois.

- **Responder para:** `api-oauth-dev-verification-reply+2e6yjtt8y3gqp1d@google.com`
- **Responder o próprio e-mail de 25/09/2026** (não abrir thread nova — o
  endereço tem um identificador do caso embutido no `+`).
- **Projeto:** `zenith2-143f3` · Project Number `382304471034` · cliente `Axon_WebApp`
- **Escopo em análise:** `https://www.googleapis.com/auth/calendar.events` (sensitive)

> **Por que ficou parado 25 dias.** O e-mail de 25/09 diz: *"You must reply to
> this email or update your Cloud Console verification request with changes in
> order to proceed with the review."* A análise estava aguardando resposta, não
> na fila.

## Antes de enviar

1. [x] Política de privacidade atualizada e **no ar** —
       verificado em 20/10/2026 em `https://axonapp.tech/legal/privacidade.html`
2. [x] **Credenciais de teste** preenchidas e **testadas em produção** em
       20/10/2026: `POST /auth/login` devolveu HTTP 200, `has_chronotype: true`
       (o revisor cai direto no app, não no onboarding) e a conta tem 7 tarefas.
3. [x] **Vídeo conferido** em 20/10/2026 pela transcrição completa. Tela
       dividida, AXON à esquerda e Google Agenda à direita; mostra criar,
       editar e excluir refletindo na agenda do usuário em tempo real, mais o
       consentimento incremental (escopo do calendário recusado no login e
       concedido depois em Configurações). **Passa no Source Account Impact —
       não precisa regravar.**
4. [~] A dúvida sobre o vídeo (se a metade do AXON mostra "Trabalho",
       "Academia", "Aula faculdade") **não precisou ser resolvida antes de
       enviar**: o item 6 do e-mail afirma que qualquer item visível na
       interface do Axon é tarefa criada dentro do Axon, nunca evento
       importado — o que é verdade pelo código em qualquer cenário. Se o
       revisor perguntar, a resposta já está dada.
5. [x] Link do vídeo mantido: o mesmo enviado em 24/09, registrado no Cloud
       Console na solicitação de verificação.

> ⚠️ **A narração do vídeo erra.** Aos ~8s ela diz que o app precisa de
> permissão para "criar, **ler** e editar" eventos. É falso e contradiz a
> justificativa e a política. A demonstração visual, porém, só mostra escritas.
> Por isso o e-mail traz um item 6 que corrige isso de frente, em vez de deixar
> o revisor achar. Era a quinta aparição da mesma afirmação falsa (política,
> ficha da loja, rascunho em Markdown, roteiro do vídeo, narração).

## Assunto

Manter o assunto original do e-mail de 25/09 (responder, não criar novo).

## Corpo do e-mail

```text
Hello,

Thank you for the detailed checklist. We have completed the requested updates
and are replying to confirm them, item by item.

Project: zenith2-143f3 (Project Number 382304471034)
OAuth client: Axon_WebApp
Scope under review: https://www.googleapis.com/auth/calendar.events
App: Axon — https://axonapp.tech

---

1) PRIVACY POLICY DISCLOSURES

Our privacy policy has been updated and is published at:

    https://axonapp.tech/legal/privacidade.html

The policy is written in Portuguese, as our users are Brazilian. The Limited Use
statement is provided in both Portuguese and English. The five required
disclosures are grouped together under the section titled "Google Agenda e login
com o Google" ("Google Calendar and Google sign-in"), in this order:

  - Data Access ("O que acessamos") — lists the exact scopes requested
    (openid, userinfo.email, userinfo.profile, calendar.events) and the data
    received from each.

  - Data Use ("Como usamos") — states that calendar access is used to create,
    update and delete events in the user's Google Calendar corresponding to
    tasks the user schedules inside Axon.

  - Data Transfer ("Com quem compartilhamos") — states that data received from
    Google APIs is not shared with any third party, including our AI providers,
    with the single exception of the user's first name, which is included in the
    assistant's context so it can address the user by name. The user's email
    address, profile photo and calendar content are never sent to those
    providers.

  - Data Protection ("Proteção") — Google access tokens are stored server-side
    only, reachable solely by our backend, and transmitted exclusively over
    HTTPS.

  - Data Retention and Deletion ("Retenção e exclusão") — tokens are kept only
    while the connection exists; the user can disconnect in the app settings
    (which deletes the tokens immediately) or revoke access at
    myaccount.google.com/permissions. Deleting the Axon account also deletes the
    tokens. A dedicated account-deletion page is available without installing
    the app at https://axonapp.tech/legal/excluir-conta.html

2) LIMITED USE COMPLIANCE STATEMENT

The statement is hosted in the policy under the section "Uso limitado dos dados
do Google", and reads:

    "Axon's use and transfer to any other app of information received from
    Google APIs will adhere to the Google API Services User Data Policy,
    including the Limited Use requirements. Axon does not use Google Workspace
    APIs data to develop, improve, or train generalized artificial intelligence
    or machine learning models, nor does it transfer such data to third parties
    for those purposes."

To be explicit about this, since our app does use AI: Axon uses third-party AI
APIs (Anthropic, and OpenAI/ElevenLabs for voice features) to generate task
suggestions and to power its assistant. No data obtained from Google Workspace
APIs is sent to those providers, and none of it is used to develop, improve or
train any AI or ML model, generalized or otherwise. All of these providers are contracted
under their API terms, and for the routes we configure explicitly we require
no-retention and no-training options. Regardless of those terms, no Google
Workspace data reaches them at all.

3) ACTIVE TEST CREDENTIALS

Axon requires an account to use. Please use the following credentials:

    URL:      https://axonapp.tech
    Email:    [conta de teste do revisor]
    Password: [senha da conta de teste]

The chronotype questionnaire has already been completed on this account, and it
contains sample tasks, so the reviewer lands directly in the application.

Email-and-password sign-in is recommended for the review. Google sign-in is also
available but requires a real Google account.

To test the calendar integration, go to Settings and connect a Google account,
then schedule a task — the corresponding event is created in that account's
Google Calendar.

4) SCOPE JUSTIFICATION — UNCHANGED, AND NARROWER THAN THE SCOPE ALLOWS

Our justification is unchanged from the original submission. We want to
highlight one point, because it affects the least-privilege assessment:

Axon only WRITES to Google Calendar. It creates, updates and deletes events that
Axon itself created from the user's tasks. It does not read, list, import or
display the user's pre-existing calendar events anywhere in the product.

Our backend has exactly one Google Calendar endpoint constant, used only with
POST, PATCH and DELETE. There is no GET request against the Calendar API
anywhere in the codebase.

We request calendar.events because it is the narrowest scope Google offers for
writing events. It also grants read access, which we do not exercise. This is
now stated explicitly in the privacy policy, so the policy does not overstate
our access.

5) SOURCE ACCOUNT IMPACT

Our demonstration video uses a split screen: Axon on the left, the test
account's own Google Calendar on the right. It shows each of the three
operations the scope grants, taking effect inside the user's Google account in
real time:

  - Create: a task "Teste" scheduled in Axon appears as an event in the user's
    Google Calendar at the matching time (18:00-18:30), with the description
    "Sincronizado pelo Axon."
  - Update: changing the task's end time to 19:00 in Axon updates the same
    event in Google Calendar.
  - Delete: deleting the task in Axon removes the event from Google Calendar.

The video also shows our incremental consent flow: the calendar scope is
presented at sign-in and deliberately LEFT UNCHECKED, the user signs in with
basic profile scopes only, and the calendar scope is granted later and
separately, from Settings > Integrations. Calendar access is never required to
use Axon. The video ends by disconnecting the calendar from within the app,
which deletes the stored tokens.

6) ONE CORRECTION TO OUR OWN VIDEO NARRATION

We want to flag a discrepancy ourselves rather than have you find it.

In the opening sentence of the demonstration video, the narrator says Axon needs
permission to "create, READ and edit" calendar events. That statement is wrong,
and it contradicts both our written justification and our privacy policy.

Axon does not read the user's calendar. The narration misspoke. The demonstration
itself contains no read operation: every action shown is a write (create, update,
delete) originating from a task in Axon.

To be precise about our implementation: our backend defines a single Google
Calendar endpoint, and it is used only with POST, PATCH and DELETE. There is no
GET request against the Calendar API anywhere in our codebase, and no screen in
the product displays calendar events that Axon did not create. Any items visible
in the Axon interface during the video are tasks created inside Axon, not events
imported from Google Calendar.

Our written justification and our privacy policy both describe the behaviour
correctly: synchronization runs from Axon to Google Calendar, and only over
events that Axon itself created. Please treat those as authoritative over the
video narration. We are happy to re-record the video if you would prefer a
version without that error.

7) CASA

The only sensitive scope we request is calendar.events, which is classified as
sensitive rather than restricted. We understand a CASA assessment is therefore
not required. Please let us know if that is not correct.

---

No changes have been made to the project's publishing status, user type, or
requested scopes since the original submission.

Please let us know if anything else is needed — we will respond promptly.

Best regards,
Bernardo Zandoná Rupolo
Axon — https://axonapp.tech
equipe.zenith2023@gmail.com
```

## Depois de enviar

- [x] Enviado em 20/10/2026; memória `oauth-verificacao-enviada` atualizada.
- As regras de congelamento continuam valendo: **não** mudar estado de
  publicação, tipo de usuário, escopos nem a justificativa enquanto a análise
  não terminar.
- O limite de 100 usuários vale até a aprovação.
