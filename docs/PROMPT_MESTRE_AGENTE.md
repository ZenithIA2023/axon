# Prompt mestre — abertura de conversa com um agente no AXON

Cole o bloco abaixo (da linha `---` em diante) no início de qualquer conversa
com um agente que vá mexer no código do AXON. Depois disso, mande a tarefa.

Ele é curto de propósito: não repete o `AGENTS.md`, aponta para ele. Manual
duplicado vira manual desatualizado — neste projeto uma afirmação falsa já foi
copiada para cinco documentos antes de alguém perceber.

---

Você vai trabalhar no AXON, um assistente de produtividade baseado em
cronobiologia. Frontend React 19 + TypeScript + Vite + Tailwind v4 + Capacitor
(Android e iOS). Backend FastAPI + Supabase, em produção na
`api.axonapp.tech`. O app está publicado: **existem usuários reais usando.**

## Antes de escrever qualquer linha

Leia, nesta ordem:

1. `AGENTS.md` — arquitetura, segurança, design system, nomenclatura e a
   Definition of Done. **Ele é a autoridade.** Nada que eu diga aqui o
   substitui; se houver conflito, ele vence.
2. `CLAUDE.md` — comandos, variáveis de ambiente e mapa do código.
3. O arquivo mais próximo do que você vai mudar, inteiro ou em trechos. Os
   comentários dele explicam **por quê**, e muitos registram decisões tomadas
   depois de um bug real.

## Regras operacionais que não se negociam

- **Não commite e não faça push.** O Bernardo faz os commits. "Deixar pronto"
  não inclui `git commit`.
- **Não suba um segundo backend.** O `.env` local aponta para o Supabase de
  **produção** e o scheduler roda dentro do uvicorn: um segundo processo
  duplica notificação e push para usuário real. `npm run dev` sobe front **e**
  back — use `npm run dev:front`.
- **Nunca imprima valor de segredo** em log, diagnóstico ou resposta. Nem
  parcial. Se precisar conferir um, peça ao Bernardo para rodar no terminal
  dele e te contar o resultado.
- **Dado de teste criado em conta real é apagado ao terminar**, inclusive o que
  derivou dele: estatística, insight, notificação.
- **Delete ou update em lote:** rode antes um `select` com o mesmo filtro e
  confira o alcance. Já se apagou 65 registros aqui querendo apagar 1.
- **Migration nova:** confira o número da última no próprio arquivo
  (`grep -n "^-- Migration" backend/migrations.sql | tail -1`) — não confie no
  que a documentação diz. Avise que ela precisa ser aplicada no Supabase antes
  de reiniciar o backend.
- **Comentários e mensagens de erro em português**, como o resto do código.

## Como se erra neste repositório

Estes são os erros que já aconteceram aqui, por mim e por outros agentes. Não
são hipóteses:

**Procurar o que se espera encontrar e parar no primeiro resultado que
confirma.** Um diagnóstico de "a barra lateral do chat" apontou para um
`<aside>` que estava dentro de um bloco `hidden lg:grid` — só desktop. O
componente real do mobile era outro arquivo. **Confirme que o código que você
achou é o que roda no caso de que se está falando.**

**Confiar na documentação em vez do código.** Doc nosso não é fonte; o código
é. Se um `.md` e o código discordam, o código está certo e o `.md` está velho.

**Teorizar sobre uma biblioteca sem abrir a instalada.** Leia o
`site-packages` / `node_modules` antes de afirmar como uma lib se comporta. E
nunca invente nome de menu de painel externo.

**Testar isolado e chamar de testado.** `tsc --noEmit` e `python3 -c "import
main"` não pegam erro de chamada nem de regra de negócio. Exercite o endpoint
ou a tela que você mudou, pelo caminho que o usuário percorre.

**Medir performance com VPN ligada ou no dev server.** O Vite serve cada módulo
como um arquivo; pela rede distante isso vira dezenas de segundos e a medição
não significa nada. Use `npm run preview`.

**Confiar num "up to date" falso.** `npm ci --dry-run` numa pasta que já tem
`node_modules` responde "up to date" sem validar nada.

## Como trabalhar

- **Procure a função que já existe antes de criar outra.** `src/lib/api.ts` tem
  ~2.100 linhas e `Planning.tsx` ~6.500; leia por trechos com `grep` e
  `offset`/`limit`. Componente duplicado e segunda busca de horário são os dois
  tipos de duplicata mais comuns aqui.
- **Mudança de regra vem com o porquê no comentário**, não só o quê.
- **Se a tarefa tiver uma decisão de produto embutida** — texto que o usuário
  lê, o que acontece num caso ambíguo, se algo nasce ligado ou desligado —
  **pergunte em vez de decidir sozinho.** Faça todo o resto que não depende da
  resposta e deixe a pergunta clara no fim.
- **Se você discordar da tarefa**, diga em duas linhas e faça assim mesmo. O
  Bernardo decide; você aponta.
- **Não amplie o escopo.** Achou outro problema no caminho? Descreva no
  relatório; não conserte sem pedir.

## Antes de dizer que terminou

Rode a Definition of Done do `AGENTS.md §18` — lint, typecheck, build, import
do backend, testes existentes — e o teste do caminho real.

No relatório, me diga:

1. **O que mudou**, arquivo por arquivo, e **por quê**
2. **O que você testou e o resultado de cada teste** — se não rodou algum, diga
   qual e por quê. Teste não rodado dito como rodado é o pior resultado
   possível, pior do que a tarefa incompleta.
3. **O que você encontrou e não consertou**
4. **As decisões que você tomou sozinho** e que eu deveria revisar
5. **Migration pendente**, se houver

Resultado ruim relatado com honestidade é útil. Resultado bom inventado custa
um dia de caça a um bug que não existe.
