
# Data Safety — respostas para o formulário da Play Console

> Levantado do código em 2026-08-20, revisado em 2026-09-28 e **em 2026-11-12**.
> Declaração
> incorreta é motivo de rejeição e de suspensão posterior, então cada linha aqui
> tem origem verificável.
>
> **A revisão de 28/09 acrescentou o ÁUDIO.** A versão de agosto foi escrita
> antes de a página de voz existir e não declarava nada sobre gravação. Hoje o
> app tem a rota `/voz`, o `AndroidManifest.xml` pede `RECORD_AUDIO`, e o áudio
> sai para a OpenAI e a ElevenLabs. A Play Console cruza as permissões do
> manifesto com o formulário — declarar de menos aqui seria pego.
>
> **A revisão de 12/11 corrigiu duas linhas do formulário**, ambas por causa do
> onboarding novo (em produção desde 09/11/2026):
> 1. **Informações de saúde passaram a ser obrigatórias.** As telas
>    `t09_sono_util` e `t10_sono_livre` não podem ser puladas.
> 2. **Atividade no app → Interações com o app passou a ser declarada.** Existe
>    medição própria de uso (o funil do onboarding), e este documento dizia
>    "não há analytics".

## Resumo

| Pergunta da Play Console | Resposta |
|---|---|
| O app coleta ou compartilha dados? | **Sim** |
| Dados são criptografados em trânsito? | **Sim** (HTTPS em todas as chamadas) |
| Usuário pode pedir exclusão dos dados? | **Sim** (`DELETE /account`, dentro do app) |

## Dados coletados

### Informações pessoais
| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Nome | Sim | **Sim** | Sim | Funcionalidade, personalização, gerenciamento de conta |
| E-mail | Sim | Não | Sim | Funcionalidade do app, gerenciamento de conta |
| IDs de usuário | Sim | Não | Sim | Funcionalidade do app, gerenciamento de conta |

**O nome é compartilhado** (corrigido em 13/10/2026; as versões anteriores diziam
"Não"). Ele entra no prompt do sistema enviado ao Claude —
`prompts.py:351` monta a linha `- Nome: {nome}.` — pelo mesmo motivo que o
conteúdo do usuário é declarado como compartilhado. O **e-mail não** vai ao
Claude: `chat_context.py:82` seleciona apenas `name`, `chronotype`,
`qualidade_sono`, `schedule_type` e `timezone`.

O ID de usuário é o identificador da conta gerado pelo Supabase Auth, usado para
filtrar todo acesso a dados. Faltava nesta tabela até 13/10/2026.

### Fotos
| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Foto de perfil | Sim | Não | Não | Funcionalidade do app |

Origem: bucket `avatars` no Supabase Storage.

### Informações do app / conteúdo do usuário
| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Outro conteúdo gerado pelo usuário | Sim | **Sim** | Sim | Funcionalidade do app, personalização |

Cobre tarefas, rotinas, objetivos, registros diários, conversas com o assistente
e eventos de agenda. **Compartilhado** porque parte desse conteúdo é enviada à
API da Anthropic (Claude) para gerar respostas, sugestões e relatórios.

### Áudio
| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Gravações de voz | Sim | **Sim** | Não | Funcionalidade do app |

O usuário fala com o Axon na rota `/voz` — e **só** nela, desde 02/10/2026: o
chat é exclusivamente texto e seu botão de microfone navega para a `/voz` em vez
de gravar (`RECORD_AUDIO` no `AndroidManifest.xml`, linha 59). O áudio é enviado à
**OpenAI** para transcrição e volta como texto; o texto da resposta vai à
**ElevenLabs** para virar voz.

**Marque "processado temporariamente" e NÃO "coletado", se a Console oferecer
essa distinção** — o áudio não é gravado em nenhuma tabela nossa: atravessa o
backend e é descartado. Só a transcrição em texto é guardada, e ela já está
declarada como conteúdo do usuário. Confirme no código antes de responder, e
não marque "coletado" por precaução: declarar de mais também é errado.

### Saúde e atividade física

| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Informações de saúde | Sim | **Sim** | **Sim** | Funcionalidade do app, personalização |
| Informações de condicionamento físico | Sim | **Sim** | Não | Funcionalidade do app, personalização |

**Acrescentado em 13/10/2026.** As versões anteriores deste doc afirmavam que o
Axon não coletava dados de saúde. Era incorreto: o registro diário guarda
`hours_slept`, `sleep_time`, `wake_time`, `sleep_rating` (1–5) e `mood_rating`
(1–5) — sono e humor quantificados — além de `exercised` (booleano), que é
condicionamento físico.

**Compartilhado** porque esses campos são enviados ao Claude para gerar insights,
correlações e relatórios (ver `insights_service.py`, linha ~131, cujo comentário
registra que "o Claude recebe isto como JSON solto"). O `qualidade_sono` do
perfil também entra no contexto do chat (`chat_context.py:82`).

**Informações de saúde são OBRIGATÓRIAS desde 09/11/2026** (corrigido em
12/11; antes dizia "Não"). O onboarding novo pede o horário de dormir e de
acordar em dias de trabalho (`t09_sono_util`) e em dias livres
(`t10_sono_livre`), e não deixa avançar sem eles — a regra está em
`axonweb/src/lib/onboardingState.ts`, no `case "sleep_times"`, e o onboarding
não tem conceito de pular tela. Os quatro horários ficam em `profiles`
(`workday_sleep`, `workday_wake`, `freeday_sleep`, `freeday_wake`, Migration
38). Na Play, basta UMA coleta obrigatória do tipo para a resposta ser "Sim".

**Condicionamento físico continua opcional:** o único dado é `exercised`, do
registro diário, que é opcional.

### Atividade no app

| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Interações com o app | Sim | Não | Sim | Análise, funcionalidade do app |

**Acrescentado em 12/11/2026.** Três origens:

- **Funil do onboarding** (`onboarding_events`, Migration 38): cada tela vista,
  resposta, volta, pulo, conclusão e erro. Começa **antes de a conta existir**,
  sob um `anon_id` aleatório gerado no aparelho, e é vinculado ao `user_id` no
  cadastro. Finalidade: **Análise** — descobrir onde as pessoas desistem.
- **Uso por funcionalidade** (`api_usage_events`, Migration 36): qual recurso
  de IA foi usado e quanto custou. Finalidade: **funcionalidade do app**
  (controle de custo e, no futuro, cota por usuário).
- **Último uso** (`profiles.last_seen_at`, Migration 40): data da última
  requisição autenticada, gravada no máximo uma vez por dia. Finalidade:
  **funcionalidade do app** — contas sem uso há 21 dias deixam de gerar
  relatórios e análises com IA.

**Obrigatório** porque o usuário não tem como recusar: nada disso tem opção de
desligar. **Não compartilhado:** fica no Supabase, que processa em nosso nome —
e prestador de serviço que processa por nós não conta como compartilhamento na
definição da Play. O funil não vai aos provedores de IA (a política publicada
diz isso com essas palavras).

### Identificadores do dispositivo
| Tipo | Coletado | Compartilhado | Obrigatório | Finalidade |
|---|---|---|---|---|
| Token de push (FCM) | Sim | Não | Não | Envio de notificações |

Tabela `device_tokens`. Só existe se o usuário aceitar as notificações.

## O que NÃO é coletado

Declarar de menos é tão problemático quanto declarar de mais. O Axon **não**
coleta: localização, contatos, SMS, chamadas, arquivos do aparelho, dados
financeiros, histórico de navegação, nem qualquer identificador de
publicidade. **Saúde saiu desta lista em 13/10/2026** — ver a seção "Saúde e
atividade física" acima. *Installed apps* exigiria a permissão
`QUERY_ALL_PACKAGES`, que não está no manifesto.
**Não há SDK de analytics de terceiros** — o `firebase-analytics` foi
deliberadamente mantido fora do projeto. Até 12/11/2026 este documento dizia
"não há analytics", o que deixou de ser verdade em 09/11: a medição de uso é
**própria** e está declarada em "Atividade no app".

## Terceiros que recebem dados

| Serviço | O que recebe | Por quê |
|---|---|---|
| **Anthropic (Claude)** | primeiro nome e conteúdo das tarefas, rotinas, registros e conversas | conversar, sugerir e executar ações |
| **OpenRouter (via Microsoft Azure)** | trechos do conteúdo, incluindo sono, humor e exercício | redigir insights, correlações e relatórios (`llm_service`) |
| **Supabase** | todos os dados da conta | banco de dados e autenticação |
| **Google (OAuth + Calendar)** | e-mail, nome, eventos de agenda | login e sincronização da agenda |
| **Google (FCM)** | token do aparelho e texto da notificação | entregar push |
| **OpenAI** | áudio da fala do usuário; texto da resposta do Axon | transcrever voz e, conforme a voz escolhida, sintetizar |
| **ElevenLabs** | texto da resposta do Axon | gerar a voz falada |
| **Google Cloud Text-to-Speech** | texto da resposta do Axon | gerar a voz falada, conforme a voz escolhida |

A Play pergunta **se** há compartilhamento, não com quem — esta tabela é apoio
para a política de privacidade, que nomeia cada um.

## Exclusão de dados

`DELETE /account` (`backend/services/account_service.py`) remove o usuário do
Supabase Auth; o CASCADE das foreign keys apaga os dados de todas as tabelas.

**Dois pontos a declarar com honestidade:**

- O e-mail é retido em `deleted_accounts` por 60 dias, para bloquear recadastro
  imediato.
- Linhas do funil do onboarding feitas **antes** do cadastro e que nunca foram
  vinculadas a uma conta (`onboarding_events.user_id` nulo) não são apagadas
  pela exclusão — o CASCADE só alcança as vinculadas. Não têm nome, e-mail nem
  conteúdo, só um `anon_id` aleatório.

A política publicada (10/11/2026) diz as duas coisas. Até 12/11 este documento
afirmava que o e-mail era "o único dado que sobrevive à exclusão", o que deixou
de ser verdade com o funil.

A Play Console pede uma **URL de exclusão de conta** acessível sem instalar o
app. ✅ Resolvido: `https://axonapp.tech/legal/excluir-conta.html`.
