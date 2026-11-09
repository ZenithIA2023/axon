# Pedido de acesso à produção (Play Console)

Guia do formulário "Solicitar acesso à produção", escrito em 09/11/2026, quando
os 14 dias do teste fechado se completaram.

A estrutura abaixo vem da **página oficial do Google**
(`support.google.com/googleplay/android-developer/answer/14151465`). O texto
exato de cada pergunta **não é publicado** — ele aparece só no formulário ao
vivo. Vários guias de terceiros que "revelam" as perguntas vendem pacotes de
testadores; não copie respostas de lá.

**Os rascunhos deste arquivo são escritos para o revisor do Google**, não para
você: por isso são curtos, concretos e sem jargão interno do projeto.

> ⚠️ **Nada aqui pode ser inventado.** O revisor cruza o que você escreve com o
> que a Play Console registrou. As lacunas estão marcadas com `[PREENCHER]` —
> são fatos que só você tem.

---

## Antes de abrir o formulário

**1. O Painel diz que você está elegível?**
Abra **Painel → Solicitar acesso à produção**. O Painel é a única fonte que
vale: ele mostra inscritos × dias de verdade. "Faixa ativa" não significa nada.
A exigência é **12 testadores inscritos continuamente nos 14 dias anteriores ao
pedido** — se alguém saiu no meio, não conta, e se saiu e voltou, os 14 dias
precisam ser consecutivos.

**2. A conta de teste do revisor está na Play Console e funciona?**
O AXON exige login, e o Google é explícito: credenciais **válidas e
funcionando** cadastradas na Play Console. É um dos motivos mais comuns de
rejeição.

Teste agora, de verdade: entre com aquele e-mail e senha no app. A senha pode
ter sido invalidada — todas as sessões caem quando a senha troca, e nós mexemos
no fluxo de login em 24/10. Confirme também que a conta **já tem cronotipo e
3 ou 4 tarefas**, senão o revisor cai no onboarding e não consegue avaliar nada
(ver `PASSO_A_PASSO.md`, PASSO 5).

**3. O app da faixa fechada é o que você quer que seja revisado?**
O que está na faixa é a build de outubro (`versionCode 4`). **Não suba build
nova agora.** Uma build recém-feita, não testada pelos 12 testadores, troca um
app validado por 14 dias por um app que ninguém usou — e é justamente a
estabilidade que o revisor avalia.

> 🚫 **O onboarding novo NÃO pode entrar antes do pedido.** Conferi: ele está
> inteiro no diretório de trabalho, sem commit (28 arquivos, incluindo
> `backend/routers/profile.py` e a Migration 39). A boa notícia é que
> **produção está intacta** — nada disso foi deployado.
>
> E quando for deployar, **aplique a Migration 39 no Supabase ANTES de
> reiniciar o backend**. O `profile.py` novo seleciona `fixed_commitments`; sem
> a coluna, o `GET /profile` quebra e **todas as telas do app param**. Isso
> derrubaria o app no meio da revisão.

**4. Classificação de conteúdo e público-alvo estão preenchidos?**
São seções separadas da Play Console, não do formulário. Se faltar alguma, o
pedido trava.

**5. O app está estável?**
O Google pede "livre de funcionalidade quebrada, travamentos ou telas
faltando". Abra a build da faixa e passe por login, dashboard, calendário,
criar tarefa, rotinas, chat.

---

## Parte 1 — Sobre o seu teste fechado

> ⚠️ **Limite de 300 caracteres por resposta** (confirmado no formulário ao
> vivo em 09/11/2026). Não dá para desenvolver: cada resposta é uma frase densa.
> As versões abaixo estão medidas.

Redigidas a partir do texto do próprio Bernardo, corrigindo só o inglês e o que
faltava. **Mesmos fatos, nada acrescentado.**

### "Como você recrutou os testadores?" — 283/300

> I asked some friends and family members to test the app and tell me what they
> think about it. I also asked my business partners, and a friend's girlfriend
> who works testing apps — she used it as a normal user and sent me the problems
> she found. I did not use a paid testing provider.

A pergunta cita "paid testing provider" de propósito: fazendas de testadores
pagos são o que esta política combate. Não houve — a "especialista" é a
namorada de um amigo que por coincidência trabalha testando apps e usou o AXON
como usuária comum. Descrevê-la assim, e não como "a professional app tester",
é o que deixa claro que ela entrou pelo grupo de amigos.

### "Descreva o engajamento dos testadores" — 281/300

> Testers used the main flows: onboarding, dashboard, creating and completing
> tasks, routines, the focus page, notifications, the chat and Google Calendar —
> the last two worked with no problems. They opened the app along the day, like a
> real user. Only the voice mode got little use.

A pergunta é sobre **engajamento** (usaram todas as funcionalidades? o uso
pareceu uso real?), não sobre o feedback — esse é o trabalho da pergunta 3.

> **Correção de 09/11/2026, feita pelo Bernardo.** A primeira versão deste
> rascunho dizia que o chat e o Google Agenda tiveram pouco uso. Eu havia
> deduzido isso do fato de ninguém ter reclamado deles — e a dedução estava
> errada: **os dois foram usados e funcionaram sem problema**. Ausência de
> feedback não é ausência de uso; aqui era o contrário.
>
> Se a conversa por voz também tiver sido usada, a frase final sai e o começo
> passa a ser "Testers used the whole app:" (261 caracteres).

Admitir cobertura parcial, quando é verdade, **fortalece** o pedido: o revisor
desconfia de teste fechado que não achou nada e de afirmação redonda que o
histórico da conta não sustenta.

### "Resumo do feedback, incluindo como foi coletado" — 286/300

> Collected on WhatsApp and in person, watching them use it. Onboarding was good
> but could be clearer, and its screens scrolled with nothing to scroll. The
> focus page's purple was too bright. Notifications and routines logic could
> improve. The result should explain the chronotype better.

O enunciado pede **explicitamente** como o feedback foi coletado — a primeira
versão listava o feedback e parava aí. Trocando o canal, os tamanhos ficam:
`in person` 270 · `in person and by phone` 283 · `on WhatsApp and by phone` 285.

---

## Parte 2 — Sobre o seu app

Respostas do Bernardo, corrigidas em 09/11/2026. O Google diz que elas **não
são públicas** e **não afetam a elegibilidade** — mas o revisor as lê ao lado
das declarações da Console, e idade é a parte sensível, porque envolve menores.

> ⚠️ **Divergência encontrada e corrigida.** A primeira versão dizia "14 to 40
> years old". Mas o `PASSO_A_PASSO.md` (passo 7.4) registra que no **Público-alvo
> da Console** foram marcadas as faixas **13–15, 16–17 e 18+**, e os Termos
> (`public/legal/termos.html:42`) dizem "a partir de 13 anos". Ou seja: o mínimo
> declarado é **13**, não 14, e o `18+` **não tem teto** — uma pessoa de 45 anos
> é público do AXON. Manter "40" contradiz a caixa marcada sem ganhar nada.

### "Qual é o público-alvo do seu app?" — 253/300

> People from 13 years old, of any gender, who want to improve their
> productivity, get better results in their personal and professional life, and
> live aligned with their chronotype. This matches the 13-15, 16-17 and 18+
> audience declared in Play Console.

A última frase transforma a possível inconsistência numa demonstração de que as
respostas conversam entre si.

### "Descreva como seu app gera valor para o usuário" — 257/300

Reformulada pelo Bernardo em 09/11/2026 para incluir as **Rotinas** — mais fiel
ao produto do que a versão anterior, que citava uma funcionalidade e um
argumento; esta cita duas funcionalidades concretas.

> Axon helps the user find and understand their chronotype and use it to improve
> their productivity, doing the most difficult tasks and activities of the day at
> the best time for that person. Axon also helps users build routines aligned
> with their chronotype.

Único erro de lógica corrigido: `As the same` é decalque de "assim mesmo / da
mesma forma" e não existe nessa função em inglês — virou `Axon also`. Alternativa
fiel à estrutura original: `In the same way, Axon helps users create routines
aligned with it` (256). Plural em `routines` de propósito: o módulo é de rotinas
recorrentes.

### "Faixa estimada de instalações no primeiro ano"

```
[PREENCHER — decisão sua]
Estimativa, não compromisso, e não afeta a elegibilidade.
Pela base atual (12 testadores, sem campanha), a faixa mais baixa é a realista.
```

---

## Parte 3 — Prontidão para produção

Aqui é onde o pedido se ganha ou se perde: **o revisor desconfia de um teste
fechado que não achou nada**. Esta é a nossa parte mais forte — temos quatro
levas de correção documentadas em commits entre 23 e 24/10/2026.

### "Mudanças feitas com base no que você aprendeu"

> "O teste fechado gerou quatro levas de correção, todas a partir de uso em
> aparelhos reais:
>
> **Interface.** O botão de criar rotina e objetivo ficava escondido atrás da
> barra de navegação inferior; o painel lateral do chat não respeitava os
> limites da tela; os campos de hora de início e fim na criação de tarefa não
> funcionavam corretamente; botões se sobrepunham na tela de criar rotina.
>
> **Desempenho.** Marcar uma tarefa como concluída levava cerca de 4 segundos
> para mostrar o resultado. Passou a responder na hora, com reversão se o
> servidor recusar.
>
> **Um usuário que interrompia o questionário ficava preso.** Ao reabrir o app,
> ia direto para o painel principal sem nunca ter recebido um cronotipo, e não
> havia caminho de volta. Agora o app verifica o cronotipo antes de decidir a
> tela inicial e retoma o questionário de onde parou.
>
> **Mensagens de erro.** Na tela de login, toda falha mostrava 'Sessão
> expirada', inclusive senha errada. Cada situação passou a ter sua mensagem:
> credencial incorreta, muitas tentativas e e-mail inválido. A mensagem de
> credencial é a mesma para senha errada e para e-mail inexistente, de
> propósito, para não permitir descobrir quem tem conta.
>
> **Identificação da versão.** Criamos uma seção 'Sobre' nas configurações, com
> a versão instalada e um identificador do build, para que o suporte saiba
> exatamente qual versão o usuário tem."

### Os três estados — não diga "corrigido" para o que não foi

Conferido no código em 09/11/2026:

| Feedback do testador | Estado real |
|---|---|
| Telas do onboarding arrastavam | ✅ **Corrigido e commitado** (`2397dc9`, `html.is-native` em `index.css`) |
| Fundo roxo da página de foco cansava | ❌ **Aberto** — `bg-[#270d35]` segue em `Focus.tsx:208` |
| Resultado explicar melhor o cronotipo | 🔄 **Em andamento** — é o onboarding novo, ainda sem commit |
| Lógica de notificações estranha | 🔄 [CONFIRMAR o estado antes de enviar] |
| Lógica de rotinas podia melhorar | 🔄 [CONFIRMAR o estado antes de enviar] |

Trate cada um conforme a coluna da direita. Isso **não** prejudica o pedido: o
Google pede que você descreva o que aprendeu e o que fez com isso, não que tudo
esteja pronto. O que prejudica é escrever "corrigido" e o revisor abrir a
página de foco.

### "Como você determinou que o app está pronto para produção"

> "Cada leva de correção foi reinstalada nos aparelhos e testada no fluxo real:
> criar conta, responder o questionário, criar e concluir tarefas, criar
> rotinas, login por e-mail e login com Google. Os problemas relatados pelos
> testadores foram reproduzidos antes de corrigir e reconferidos no aparelho
> depois, não apenas no navegador — vários deles só aparecem em aparelho real,
> porque dependem das áreas de segurança da tela e do teclado do sistema.
>
> O app roda contra um backend único em produção, com HTTPS, autenticação por
> token, limite de requisições nos endpoints sensíveis e exclusão de conta
> disponível dentro do app.
>
> Os problemas que restam estão registrados e são de desempenho e acabamento,
> não de funcionamento: nenhum impede o uso do app nem causa travamento."

A última frase **só vale se for verdade no dia do envio**. Se algo estiver
quebrado, corrija antes — não envie contando que o revisor não vá ver. O Google
é direto: *"enviar apps não conformes esperando que os revisores identifiquem
os problemas leva a rejeições, atrasos na revisão e processos de recurso mais
longos."*

---

## Depois de enviar

- **A revisão leva até 7 dias**, às vezes mais. A resposta vai por e-mail para
  o proprietário da conta.
- **Cuidado ao navegar no formulário:** o Google avisa que as respostas de uma
  seção são perdidas se você clicar em Descartar ou sair sem clicar em
  Avançar/Enviar. Escreva aqui, cole lá.
- **Mantenha o teste fechado rodando** até sair o resultado. Se os inscritos
  caírem abaixo de 12 durante a revisão, você perde a base do pedido.
- **Se o Google pedir mais teste**, os dois motivos que ele nomeia são menos de
  12 inscritos ou engajamento insuficiente. A página oficial não fala de prazo
  de espera nem de regras para pedir de novo.

### Quando a produção for liberada

A primeira publicação em produção tem um passo que não existe no teste fechado:

> **O SHA-1 muda.** O app publicado é assinado pelo Play App Signing, com um
> certificado diferente do seu. Pegue o SHA-1 em **Configuração → Integridade
> do app** e adicione no cliente Android do Google Cloud Console — **sem isso o
> login com Google para de funcionar na versão da loja**, e só na dela.
