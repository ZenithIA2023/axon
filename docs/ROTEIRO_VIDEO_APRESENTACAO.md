# Roteiro — vídeo de apresentação do AXON (motion design)

Vídeo de apresentação do AXON para quem nunca ouviu falar do projeto. Serve para
investidor, orientadora, loja, site e qualquer apresentação.

**Versão 3.** A v1 (90 s) era curta demais e virava trailer; a v2 (2:46, formato
do vídeo do Raiz) ficou corrida — cinco cartelas de seção recomeçavam a narrativa
a cada 25 s. Esta versão tem **três atos**, não cinco seções, e investe o tempo
economizado no beat que faltava: **o que o problema custa para quem assiste**.

**Nada sobre teste fechado, convite ou testadores entra aqui.** Essa cartela é
produzida à parte quando for preciso, e o master fica evergreen.

Documento escrito que acompanha: `claude.ai/artifact/C8LPrLNdZTsqKpp15TQZAf`.

---

## Ficha técnica

| Item | Valor |
|---|---|
| Duração | **2:42** |
| Resolução / fps | 1920×1080, 30 fps, 16:9 |
| Idioma | Português (Brasil), tom conversacional |
| Áudio | Narração em voz única |
| Legendas | Queimadas, sincronizadas à narração |

### A linha que o espectador percorre

| Beat | Onde acontece |
|---|---|
| Ver o problema | abertura — o sistema que morre no dia 15 |
| Entender o problema | ato 1 — a pergunta que o app nunca faz |
| **Sentir o impacto na própria vida** | ato 1, 0:36 — **as horas que vazam** |
| Entender o que é o AXON | ato 2 + 1:32 — o cronotipo e a pergunta que faltava |
| Entender como ele resolve | ato 3 — a reorganização e o resto |

O terceiro beat é o que a v2 não tinha. Ele é também o que fecha o vídeo: as
horas perdidas no ato 1 voltam como **horas devolvidas** em 2:26.

### Por que três atos e não cinco seções

Cinco cartelas de tela cheia custavam ~8 s de overhead e, pior, **cinco
recomeços**. Aqui a transição de ato é um **chapéu que desliza sobre a cena em
andamento** (0,8 s, sem corte, sem tela cheia). O espectador recebe o sinal de
estrutura sem que a narrativa pare.

---

## 1. Narração completa (texto limpo)

> Imagina alguém que decide se organizar. Domingo à noite: baixa o aplicativo,
> monta a lista, põe cor em cada matéria, define o horário de estudar. Dia um,
> funciona. Dia três, funciona. Dia quinze, o aplicativo continua lá, intacto —
> e a pessoa parou de abrir.
>
> Aí vem o diagnóstico de sempre. Falta de disciplina. Falta de foco. Preguiça.
>
> Mas repara no que esse aplicativo perguntou. O quê. Quando. Quanto é urgente.
> E parou aí. Tem uma pergunta que ele nunca fez.
>
> E ela custa caro. Você põe a matéria mais difícil às sete da manhã porque
> cabia na agenda. Leva três horas no que levaria uma. O resto do dia atrasa
> junto. No fim da semana, você não perdeu uma tarefa. Perdeu horas.
>
> E conclui que o problema é a sua força de vontade. Passa a semana seguinte
> tentando ter mais. Não é disciplina.
>
> A cronobiologia estuda isso há décadas. A capacidade de atenção e de esforço
> de cada pessoa sobe e desce ao longo do dia, num padrão individual e
> relativamente estável. Esse padrão tem nome: cronotipo.
>
> É assim que um aplicativo comum enxerga o seu dia. Todas as horas iguais.
> E é assim que o seu dia é de verdade.
>
> Três pessoas. Às nove da manhã, a primeira está em noventa e cinco. A segunda,
> em quarenta e seis. A terceira, em vinte e oito. Mesmo horário, três dias
> completamente diferentes.
>
> E não são três tipos. São cinco. Tem gente que não tem um pico — tem dois,
> separados por uma queda no meio da tarde.
>
> O AXON é o aplicativo que faz a pergunta que faltava. Dezoito perguntas sobre
> sono e disposição, uma vez só, e ele monta a sua curva.
>
> E aí ele faz isto. Esse é um dia como ele costuma ficar: a tarefa pesada caída
> num bloco de sono, uma tarefa leve ocupando o seu melhor horário, buracos no
> meio, o dia terminando às onze da noite. O AXON olha o dia inteiro e
> reorganiza. O que exige mais vai para o seu pico. O que é leve vai para a sua
> queda. O que é parecido fica junto. Os vãos fecham.
>
> E você fala com ele normalmente — "marca dentista amanhã às duas" já vira
> tarefa, digitando ou falando.
>
> Todo dia ele pergunta como foi. Cerca de um minuto. E é aqui que ele deixa de
> ser um palpite: a cada registro, a sua curva se ajusta. No décimo quarto, o
> AXON abandona a média do seu perfil e passa a usar você.
>
> Depois ele devolve o que aprendeu. Os insights mostram o padrão que você não
> estava vendo. Os relatórios da semana e do mês mostram o que andou: quanto você
> concluiu, em que dia rendeu mais, como foi o seu sono, quais rotinas se
> sustentaram, quais objetivos avançaram.
>
> E aquelas horas que o dia mal encaixado tirava de você? O AXON mostra quantas
> voltaram.
>
> Seu dia tem uma forma. O AXON descobre qual é a sua.

---

## 2. Sistema visual

### Paleta da interface

| Papel | Cor |
|---|---|
| Fundo padrão | `#f7f2ff`, com anéis concêntricos radiais muito sutis |
| Roxo principal | `#7b2cbf` |
| Roxo claro (sobre fundo escuro) | `#a855f7` |
| Fundo escuro (abertura de ato, encerramento) | `#2d0850` → `#1a0530`, gradiente radial com partículas |
| Caixa de legenda | `#231038`, texto branco |
| Alerta / custo / problema | `#b45309` |
| Grifo tipo marca-texto | `#f3e3b0` |

### Paleta das curvas — **validada, não troque**

| Cronotipo | Claro | Escuro |
|---|---|---|
| Matutino | `#d97706` | `#c87d12` |
| Bimodal | `#be185d` | `#d4487e` |
| Misto | `#166534` | `#2f8f4f` |
| Vespertino | `#7b2cbf` | `#a855f7` |
| Noturno | `#0891b2` | `#0d93b8` |

Essas cinco passaram nos seis checks de paleta categórica (banda de luminosidade,
piso de croma, separação em daltonismo deutan/protan ΔE 17,8, piso de visão
normal ΔE 20,5, contraste ≥ 3:1) nos dois modos. **A tentação óbvia é usar cinco
tons de roxo** — isso funde as curvas para quem tem daltonismo vermelho-verde, que
é cerca de 8% dos homens, e some de vez em preto e branco.

Cada curva também leva **rótulo direto** na ponta, nunca só a cor.

### Tipografia

**Inter**, pesos 500–900. Frases de impacto em 80–120 px, peso 900, tracking
`-0.045em` (a assinatura tipográfica do app). Todo número em `tabular-nums`,
senão a largura treme enquanto o contador sobe.

### HUD persistente

1. **Barra de progresso** no topo — linha roxa de ~4 px crescendo ao longo do
   vídeo inteiro.
2. **Legenda queimada** no centro inferior — caixa `#231038`, branco semibold
   ~26 px, máximo 2 linhas, troca a cada frase.
3. **Nota de fonte** no canto inferior direito, acima da legenda — texto
   minúsculo cinza. **Toda cena com número tem uma.**
4. **Chapéu de ato** — ver abaixo. Não há pílula de seção permanente.

### Chapéus de ato (substituem as cartelas)

Uma barra horizontal roxa desliza da esquerda sobre a cena em andamento, mostra
o texto por ~1,2 s e sai. **A cena por baixo não para.**

| Ato | Texto | Entra em |
|---|---|---|
| 1 | `O PROBLEMA` | 0:16 |
| 2 | `POR QUE ACONTECE` | 0:55 |
| 3 | `O AXON` | 1:32 |

### Linguagem de movimento

- Entradas: fade + translateY ~20 px, ease-out. Listas em cascata (stagger
  0,2–0,4 s), sincronizadas à frase.
- **Tipografia cinética** nas frases de impacto: palavra por palavra, a nova em
  cinza escurecendo até preto.
- Contadores sobem até o valor final.
- Foco/desfoco: o elemento anterior desfoca e esmaece quando o novo entra.
- Câmera quase estática.
- **Uma ideia visual por frase narrada.** Nada na tela sem ser mencionado.
- Nenhuma transição acima de 0,6 s — **exceto** a deformação da reta (1,2 s) e a
  reorganização do dia (ver 3.10).

### Assets

`axonweb/src/assets/axon/`: `axon-happy-wave.webp`, `axon-happy.webp`,
`axon-normal.png`, `axon-head-sad.png`.
Logo: `axonweb/public/axon-logo.svg` e `axon-logo-inverted.svg`.

Os WebP são **sem perda** de propósito — uma conversão com perda já degradou o
mascote e foi rejeitada. Não recomprima na edição.

---

## 3. Cena a cena

Formato: **tempo** · narração (= legenda) · tela · animação.

---

## ATO 1 — O problema e o que ele te custa (0:00–0:55)

### 3.1 · 0:00–0:06 · "Imagina alguém que decide se organizar. Domingo à noite:"

- Fundo lilás. Estudante ilustrada (flat, estilo dos mascotes) à mesa, caderno e
  celular. Luz de fim de domingo pela janela.
- Etiqueta branca arredondada entra ao lado: **"domingo à noite"**.
- Animação: cena já presente; etiqueta com fade/pop em 0,3 s.

### 3.2 · 0:06–0:11 · "baixa o aplicativo, monta a lista, põe cor em cada matéria, define o horário de estudar."

- Mockup de celular entra pela direita e cresce até o centro. Dentro, uma lista
  se constrói sozinha: itens aparecem um a um, cada um ganha uma tag colorida
  (Cálculo, Física, Inglês) e um horário.
- Animação: um item por palavra-chave; as cores num segundo passe, em cascata.
- **O sistema fica visivelmente caprichado. Esse é o ponto** — não é desleixo
  que vem a seguir.

### 3.3 · 0:11–0:16 · "Dia um, funciona. Dia três, funciona. Dia quinze, o aplicativo continua lá, intacto — e a pessoa parou de abrir."

- Contador no canto: **`dia 1`** → **`dia 3`** → **`dia 15`**.
- Dias 1 e 3: checks verdes pousam nos itens.
- **`dia 15`**: os checks somem, a tela desatura, uma camada de grão cobre o
  mockup. A lista continua idêntica, intocada.
- Animação: `dia 3` → `dia 15` é um **corte seco**. Sem transição — a quebra é o
  efeito.

**→ 0:16 entra o chapéu `O PROBLEMA`.**

### 3.4 · 0:16–0:26 · "Aí vem o diagnóstico de sempre. Falta de disciplina. Falta de foco. Preguiça."

- O celular esmaecido recua. **"DISCIPLINA"** gigante, cinza, entra no centro.
- Em volta pousam etiquetas: `falta de foco`, `preguiça`, `procrastinação`.
- Animação: a palavra entra grande; as etiquetas em cascata, uma por palavra
  narrada.

### 3.5 · 0:26–0:33 · "Mas repara no que esse aplicativo perguntou. O quê. Quando. Quanto é urgente."

- "DISCIPLINA" desfoca e esmaece. Entra um formulário de nova tarefa, limpo.
- Três campos se preenchem sozinhos, um por trecho falado:
  **O quê** → `Estudar Cálculo` · **Quando** → `07:00` · **Urgência** → `Alta`.
- Cada campo preenchido ganha um check roxo.

### 3.6 · 0:33–0:36 · "E parou aí. Tem uma pergunta que ele nunca fez."

- Um quarto campo entra **vazio**, borda tracejada, com um ponto de interrogação.
- Animação: entra e pulsa uma vez. Não é preenchido. **Fica na tela.**

### 3.7 · 0:36–0:48 · ⭐ O CUSTO — "E ela custa caro. Você põe a matéria mais difícil às sete da manhã porque cabia na agenda. Leva três horas no que levaria uma. O resto do dia atrasa junto."

Este é o beat que a v2 não tinha. **Não corte tempo daqui.**

- O formulário recua. Entra uma **barra de dia horizontal** (06:00 → 00:00) com
  blocos encaixados — a agenda da pessoa.
- O bloco `Estudar Cálculo` está às 07:00 e tem **1 hora**.
- Ele **incha até 3 horas**, empurrando fisicamente todos os blocos seguintes
  para a direita. Os últimos blocos do dia são empurrados **para fora da tela**.
- Animação: o inchaço em 1,0 s, com os blocos seguintes deslizando em cadeia
  (stagger 0,06 s). O empurrão para fora é literal — é a imagem do dia
  transbordando.

### 3.8 · 0:48–0:52 · "No fim da semana, você não perdeu uma tarefa. Perdeu horas."

- A barra de dia se multiplica em **sete barras empilhadas** (a semana). Em cada
  uma, a parte empurrada para fora fica marcada em `#b45309`.
- Um contador soma esses pedaços: **`0h`** → **`11h`**.
- ⚠ **O número é ilustrativo.** Ver "As fontes" — ele precisa ou de uma nota
  `exemplo ilustrativo` na tela, ou de um valor tirado da conta de teste.

### 3.9 · 0:52–0:55 · "E conclui que o problema é a sua força de vontade. Passa a semana seguinte tentando ter mais. Não é disciplina."

- Tudo esmaece. Tipografia cinética, palavra por palavra:
  **"Não é disciplina."**

**→ 0:55 entra o chapéu `POR QUE ACONTECE`.**

---

## ATO 2 — Por que acontece (0:55–1:32)

### 3.10 · 0:55–1:04 · "A cronobiologia estuda isso há décadas. A capacidade de atenção e de esforço de cada pessoa sobe e desce ao longo do dia, num padrão individual e relativamente estável. Esse padrão tem nome: cronotipo."

- À esquerda, pilha de artigos científicos ilustrados (capas sóbrias, sem texto
  legível) com datas visíveis: `1963`, `1986`.
- À direita, uma onda suave pulsando, ainda sem eixo — abstrata.
- Ao fim, a onda congela e entra **"cronotipo"**, roxo, minúsculas.
- **Nota de fonte:** `Kleitman (1963); Lavie (1986) — padrão bimodal de alerta`

### 3.11 · 1:04–1:14 · ⭐ A DEFORMAÇÃO — "É assim que um aplicativo comum enxerga o seu dia. Todas as horas iguais. E é assim que o seu dia é de verdade."

- Eixo de 24 h se desenha da esquerda para a direita (`0h` → `23h`).
- Uma **linha reta e plana** entra no meio da altura. Rótulo cinza: `como um app
  comum vê o seu dia`.
- **A reta se deforma** na curva Matutina: sobe até o pico das 9h, cai à tarde.
  Rótulo troca para `Matutino`.
- Em seguida, por stroke reveal (0,7 s cada): `Vespertino` e `Noturno`.

**Animação — o movimento mais importante do vídeo.** Dê à deformação **1,2 s**,
`easeInOut`, com a reta "respirando" meio segundo antes de ceder. Não acelere.

- **Nota de fonte:** `Curvas usadas pelo AXON (services/chronotype.py)`

### 3.12 · 1:14–1:24 · "Três pessoas. Às nove da manhã, a primeira está em noventa e cinco. A segunda, em quarenta e seis. A terceira, em vinte e oito. Mesmo horário, três dias completamente diferentes."

- Linha vertical tracejada **desce nas 9h**. Três pontos pousam nos cruzamentos.
- Contadores sobem: **`95`**, **`46`**, **`28`**, cada um na cor da sua curva.
- Depois as curvas esmaecem e os três números ficam sozinhos, gigantes. Abaixo,
  pequeno: `9h da manhã`.

> **Por que só três aqui.** Às 9h o Bimodal está em 92 e o Misto em 78 — o 92
> encosta no 95 do Matutino e embola a manchete. Os cinco entram na cena
> seguinte, onde a diferença entre eles é visível.

### 3.13 · 1:24–1:32 · "E não são três tipos. São cinco. Tem gente que não tem um pico — tem dois, separados por uma queda no meio da tarde."

- As três curvas voltam, apagadas. Entram **`Misto`** (platô largo, sem pico
  único) e, por último, **`Bimodal`**.
- A Bimodal se desenha devagar e **para no vale das 14h**, antes de subir de
  novo — um micro-beat de 0,3 s no ponto baixo, para o olho registrar os dois
  picos. Depois completa.
- Os cinco rótulos ficam na ponta das curvas.

**→ 1:32 entra o chapéu `O AXON`.**

---

## ATO 3 — Como o AXON resolve (1:32–2:32)

### 3.14 · 1:32–1:40 · "O AXON é o aplicativo que faz a pergunta que faltava. Dezoito perguntas sobre sono e disposição, uma vez só, e ele monta a sua curva."

- **Volta o campo vazio de borda tracejada** da cena 3.6 — agora com rótulo:
  **`a que horas você funciona?`** — e desta vez ele **se preenche**.
- Corte para o celular com o questionário: perguntas passando, opções sendo
  escolhidas. Contador **`1/18`** → **`18/18`**, acelerando.
- À direita, a curva da pessoa **se desenha sozinha** conforme o contador sobe.

### 3.15 · 1:40–1:56 · ⭐⭐ A REORGANIZAÇÃO — o centro do vídeo

> "E aí ele faz isto. Esse é um dia como ele costuma ficar: a tarefa pesada caída
> num bloco de sono, uma tarefa leve ocupando o seu melhor horário, buracos no
> meio, o dia terminando às onze da noite. O AXON olha o dia inteiro e
> reorganiza. O que exige mais vai para o seu pico. O que é leve vai para a sua
> queda. O que é parecido fica junto. Os vãos fecham."

**Tela.** A curva da pessoa fica ao fundo, apagada, como relevo. Sobre ela, a
grade de **blocos de 90 minutos** (16 por dia — é a grade real do app). Em cima,
as tarefas do dia, bagunçadas.

**Os quatro movimentos são os mesmos do código** — `routine_analysis_service.py`
faz exatamente estes, nesta ordem, porque problemas vêm antes de oportunidades:

| # | Movimento | O que anima |
|---|---|---|
| 1 | `bad_block` | a tarefa pesada **sai do bloco de sono** e sobe para um bloco bom |
| 2 | `complexity_match` | a tarefa pesada e a leve **trocam de lugar** — a pesada assume o pico |
| 3 | `grouping` | duas tarefas da mesma tag, dispersas, **deslizam para perto** |
| 4 | `compaction` | os vãos **fecham** e o fim do dia recua |

**Animação.** Os quatro acontecem **em sequência, um por frase**, não todos de
uma vez — ~3,5 s cada. Cada movimento deixa um rastro curto no caminho
percorrido. No fim, um relógio no canto recua: **`23:00`** → **`21:15`**.

**Nota de fonte:** `Reorganização determinística — services/routine_analysis_service.py`

> **Detalhe que vale um segundo de tela:** quem escolhe os horários é o algoritmo
> em Python, deterministicamente — o modelo de IA só escreve o *motivo* em
> português depois que a lista já está pronta. Se couber um selo discreto
> `o algoritmo decide · a IA explica`, ele diz mais sobre a seriedade do projeto
> do que trinta segundos de narração sobre IA.

### 3.16 · 1:56–2:04 · "E você fala com ele normalmente — 'marca dentista amanhã às duas' já vira tarefa, digitando ou falando."

- Celular na tela de chat. Animação de digitação: `marca dentista amanhã às 14h`
  (~1,2 s). A mensagem sobe e **a tarefa aparece na agenda**, com horário e
  duração.
- À direita, ícone de microfone pulsando com forma de onda — a mesma frase, por
  voz, numa tela própria.

### 3.17 · 2:04–2:16 · "Todo dia ele pergunta como foi. Cerca de um minuto. E é aqui que ele deixa de ser um palpite: a cada registro, a sua curva se ajusta. No décimo quarto, o AXON abandona a média do seu perfil e passa a usar você."

- Tela do registro diário: como foi o dia, a que horas acordou, em que período
  rendeu mais. Timer no canto: **`0:04`** → **`0:58`**, parando antes de 1:00.
- A curva volta a ocupar a tela. Contador **`dia 1`**. A cada tique a curva
  **se ajusta de leve** — um ponto sobe, outro desce. Ao fundo, a curva média
  original como **fantasma pontilhado**.
- No **`dia 14`**: o fantasma desaparece, a curva ganha cor cheia e um único
  pulso de brilho.
- Animação: os 14 dias em ~6 s, **acelerando** — os primeiros devagar (dá para
  ver o ajuste), os últimos em rajada.
- Texto ao fim: **`a sua curva, não a média`**
- **Nota de fonte:** `Limiar de calibração: 14 registros (services/calibration_service.py)`

### 3.18 · 2:16–2:26 · "Depois ele devolve o que aprendeu. Os insights mostram o padrão que você não estava vendo. Os relatórios da semana e do mês mostram o que andou: quanto você concluiu, em que dia rendeu mais, como foi o seu sono, quais rotinas se sustentaram, quais objetivos avançaram."

- **Dois tempos.** Primeiro, três cartões de insight entram em cascata, cada um
  com um mini-gráfico. Depois eles se empilham e viram a **capa de um relatório**,
  que abre mostrando os blocos reais:
  `taxa de conclusão + variação vs. período anterior` · `dia mais produtivo` ·
  `plano × real` · `grade de rotinas` · `objetivos` · `sono`
- ⚠ Os textos dos insights são **exemplos ilustrativos** — gere a partir da conta
  de teste ou marque como exemplo na tela.

### 3.19 · 2:26–2:32 · ⭐ FECHA O ARCO — "E aquelas horas que o dia mal encaixado tirava de você? O AXON mostra quantas voltaram."

- **Volta a barra de dia da cena 3.7**, agora reorganizada. Dois relógios entram
  lado a lado:

  ```
  Plano: até 22:00        Terminou: 20:45
            +1h15 de volta pra você
  ```
- As sete barras da semana reaparecem ao fundo, e a faixa `#b45309` do que
  transbordava encolhe.
- **Nota de fonte:** `Comparação entre o fim planejado e o fim real do próprio dia`

> **LEIA ISTO ANTES DE ESCREVER QUALQUER COISA NESTA CENA.** Ver a seção 4.

---

## Encerramento (2:32–2:42)

### 3.20 · 2:32–2:38 · "Seu dia tem uma forma."

- Tela roxo-escura (gradiente radial + partículas). A curva da pessoa se
  redesenha em traço luminoso, sozinha. A frase entra palavra por palavra.

### 3.21 · 2:38–2:42 · "O AXON descobre qual é a sua."

- Segunda linha em roxo-claro.
- **Fechamento do ciclo:** ao fundo, muito discreta, volta a estudante da
  abertura — agora estudando, e o relógio da parede marca **o horário do pico
  dela**, não as 7h. É a mesma cena do começo, resolvida.
- Logo AXON e **`axonapp.tech`**. O último frame fica parado **2 s cheios**.

---

## 4. As horas poupadas — a cena mais fácil de errar

**Nunca diga, narre, escreva ou sugira que "o AXON te poupa X horas por semana".**

O app não mede isso e a equipe decidiu, de propósito, não medir. Está na primeira
linha do [saved_time_service.py](../backend/services/saved_time_service.py):

> *"Não é um contrafactual ('você levaria 10h sem o AXON' — impossível de provar).
> É uma comparação entre dois horários do próprio usuário: o dia estava planejado
> até 22h, ele terminou o que planejou às 20h45 → 1h15 devolvida."*

A primeira versão dessa métrica **foi descartada em agosto de 2026** porque
`completed_at` registra quando o usuário *tocou no botão*, não quando terminou —
erra em 75% dos casos. A reconstrução inteira (três regras inegociáveis, descarte
de dias com confiança baixa, pergunta ao usuário quando a marcação é fora de
hora) existe para o número ser **menor e verdadeiro**.

Um vídeo que promete "X horas poupadas" desfaz esse trabalho numa frase — e é
exatamente o tipo de afirmação que alguém confere.

**A formulação permitida é a comparação:** `plano até 22:00` → `terminou 20:45` →
`+1h15`. É mais concreta que o contrafactual, e cabe melhor em animação.

E vale dizer em voz alta numa apresentação, mesmo que não entre no vídeo: *a
gente tinha uma métrica fácil e jogou fora porque a medição estava errada.* Isso
constrói mais credibilidade do que o número teria construído.

---

## 5. As fontes

A regra é simples: **se a cena tem número na tela, ela tem nota de fonte. Se não
há fonte, tira-se o número — não a nota.**

### Fontes reais, já verificadas

| Afirmação | Fonte | |
|---|---|---|
| `95 / 46 / 28` às 9h e as 5 curvas | `services/chronotype.py` | ✅ código em produção |
| Padrão bimodal de alerta | Kleitman (1963), Lavie (1986) | ✅ citados no código |
| Calibração liga no 14º registro | `services/calibration_service.py` | ✅ é o algoritmo |
| Questionário de 18 perguntas | `pages/Questionnaire.tsx` | ✅ dá para contar |
| 5 cronotipos | `TABELA_PONTOS` em `chronotype.py` | ✅ |
| Os 4 movimentos da reorganização | `services/routine_analysis_service.py` | ✅ |
| Blocos de 90 min, 16 por dia | `services/calibration_service.py` | ✅ |
| `+1h15` (plano × real) | `services/saved_time_service.py` | ✅ com a formulação da seção 4 |

### O que precisa de decisão antes de ir para a tela

| Item | Situação |
|---|---|
| **As `11h` perdidas na semana (cena 3.8)** | **Ilustrativo.** Ou marque `exemplo` na tela, ou gere o número a partir da conta de teste. Não invente um número "médio". |
| Textos dos insights (cena 3.18) | Ilustrativos — mesma regra. |
| "A cronobiologia estuda isso **há décadas**" | Ok vago, sustentado pelas duas citações. Mas se aparecer **data ou número** na tela, precisa de referência. |
| Jovens adultos tendem ao vespertino | **Fora do roteiro de propósito** — seria o argumento mais forte para plateia acadêmica, e é bem estabelecido na literatura (Roenneberg, *social jetlag*). Não entrou porque ninguém verificou a fonte. **Vale a pesquisa.** |
| Origem das 18 perguntas | O conteúdo sugere o questionário clássico de matutinidade-vespertinidade (Horne & Östberg), mas **isso não está escrito em lugar nenhum do código**. Se alguém confirmar, acrescenta lastro acadêmico de graça. |

---

## 6. Dados das curvas

Valores de hora em hora, `0h` a `23h`. **São os do app** — se o número aparece na
tela, é este.

```
Matutino    12  8  8 10 30 55 72 85 92 95 90 82 62 48 42 45 50 48 42 36 30 22 16 12
Bimodal     14  8  8 10 22 38 55 70 82 92 92 84 65 48 46 58 80 90 88 76 60 44 28 18
Misto       18 12 10 12 22 36 52 64 72 78 80 80 72 65 68 74 76 72 64 56 46 36 26 20
Vespertino  30 20 14 10 10 12 18 26 36 46 55 62 64 62 60 72 82 90 90 86 76 62 48 38
Noturno     70 55 40 28 18 10 10 14 20 28 34 40 44 46 50 54 60 68 76 84 88 90 88 80
```

Às 9h: **95 · 92 · 78 · 46 · 28**. Não desenhe curvas "mais bonitas".

---

## 7. O que não pode aparecer

**Nunca mostre eventos do Google Agenda aparecendo dentro do AXON.** O app
**escreve** na agenda, não lê: `backend/services/google_service.py` tem POST,
PATCH e DELETE de evento, e nenhum GET. Essa afirmação falsa já foi copiada para
cinco documentos do projeto — incluindo a narração de um vídeo enviado à Google
na verificação do OAuth, e deu retrabalho. Único sentido permitido:
**tarefa criada no AXON → evento aparece no Google Agenda.**

Também fora:

- **"O AXON te poupa X horas"** — ver seção 4.
- **Marcas e logos de concorrentes.**
- **Dados de usuário real.** Use a conta de teste.
- **Números inventados** de usuários, precisão ou produtividade.
- **Promessa de resultado.** O AXON organiza o dia em volta do ritmo da pessoa.
  Não promete nota melhor nem fim da procrastinação.
- **Cinco tons de roxo nas curvas** — ver a paleta validada.
- **Curvas estilizadas.** Se o número aparece na tela, é o número do app.
- **Qualquer menção a teste fechado, convite ou testadores** — não entra no
  master.

---

## 8. Checklist antes de dar por pronto

- [ ] `95`, `46`, `28` e as cinco curvas batem com `chronotype.py`
- [ ] As cinco curvas usam a paleta validada, e cada uma tem rótulo direto
- [ ] A cena do **custo** (3.7–3.8) ficou com os 12 s cheios
- [ ] As horas perdidas (3.8) e os insights (3.18) estão marcados como exemplo
      ou vieram da conta de teste
- [ ] A cena 3.19 usa a comparação `plano × real`, **nunca** o contrafactual
- [ ] A deformação da reta (3.11) tem 1,2 s, não menos
- [ ] Os 4 movimentos da reorganização (3.15) acontecem **em sequência**
- [ ] O campo vazio de 3.6 é o mesmo que se preenche em 3.14
- [ ] A estudante da abertura reaparece no encerramento, com outro horário
- [ ] Toda cena com número tem nota de fonte, e toda nota é real
- [ ] A narração não afirma em nenhum ponto que o AXON lê a agenda
- [ ] Nenhuma menção a teste fechado
- [ ] O vídeo faz sentido no mudo
- [ ] Último frame com `axonapp.tech` legível, parado 2 s
- [ ] Testado no celular: o texto menor é legível em tela de 6"
