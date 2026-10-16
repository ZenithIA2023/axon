
# Data Safety — respostas para o formulário da Play Console

> Levantado do código em 2026-08-20, **revisado em 2026-09-28**. Declaração
> incorreta é motivo de rejeição e de suspensão posterior, então cada linha aqui
> tem origem verificável.
>
> **A revisão de 28/09 acrescentou o ÁUDIO.** A versão de agosto foi escrita
> antes de a página de voz existir e não declarava nada sobre gravação. Hoje o
> app tem a rota `/voz`, o `AndroidManifest.xml` pede `RECORD_AUDIO`, e o áudio
> sai para a OpenAI e a ElevenLabs. A Play Console cruza as permissões do
> manifesto com o formulário — declarar de menos aqui seria pego.

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
| Informações de saúde | Sim | **Sim** | Não | Funcionalidade do app, personalização |
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

Nenhum dos dois é obrigatório: o registro diário é opcional e o app funciona sem
ele.

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
**Não há analytics** — o `firebase-analytics` foi deliberadamente
mantido fora do projeto.

## Terceiros que recebem dados

| Serviço | O que recebe | Por quê |
|---|---|---|
| **Anthropic (Claude)** | conteúdo das tarefas, rotinas, registros e conversas | gerar respostas e sugestões |
| **Supabase** | todos os dados da conta | banco de dados e autenticação |
| **Google (OAuth + Calendar)** | e-mail, nome, eventos de agenda | login e sincronização da agenda |
| **Google (FCM)** | token do aparelho e texto da notificação | entregar push |
| **OpenAI** | áudio da fala do usuário | transcrever voz em texto |
| **ElevenLabs** | texto da resposta do Axon | gerar a voz falada |

## Exclusão de dados

`DELETE /account` (`backend/services/account_service.py`) remove o usuário do
Supabase Auth; o CASCADE das foreign keys apaga os dados de todas as tabelas.

**Um ponto a declarar com honestidade:** o e-mail é retido em `deleted_accounts`
por 60 dias, para bloquear recadastro imediato. É o único dado que sobrevive à
exclusão, e a política de privacidade precisa dizer isso.

A Play Console pede uma **URL de exclusão de conta** acessível sem instalar o
app. ✅ Resolvido: `https://axonapp.tech/legal/excluir-conta.html`.
