# Prompt — Origem do WebView no iOS e mensagem de erro de rede

Dois consertos encontrados testando a build do TestFlight num iPhone real em
23/10/2026. Leia o `AGENTS.md` antes de mexer em qualquer coisa.

## Contexto que você não deve redescobrir

A Build 2 (commit `d6261ed`) foi instalada num iPhone com iOS 16.4+ e:

- **O app renderiza corretamente.** Cores, cartões, vidro e a safe area do topo
  estão certos. O Tailwind v4 funciona no iOS 16.4. Não investigue CSS.
- **O login falhava** com a mensagem de desenvolvedor do `api.ts:138`.

A causa foi diagnosticada: **CORS**. O `backend/main.py` libera as origens de
`FRONTEND_URL` + `CORS_ORIGINS`. Em produção o `CORS_ORIGINS` tem
`https://localhost` (a origem do WebView do **Android**, por causa do
`androidScheme: "https"`). O iOS usa o esquema padrão do Capacitor e manda
`Origin: capacitor://localhost`, que não estava liberada — o preflight era
recusado, o `fetch` estourava e caía no `catch`.

**Já foi aplicado um remendo em produção:** `capacitor://localhost` foi
acrescentado ao `CORS_ORIGINS` do `.env` do VPS. Não mexa no backend; o conserto
abaixo é do lado do app.

## Tarefa 1 — `iosScheme: "https"` no capacitor.config.ts

Em `axonweb/capacitor.config.ts`, dentro do bloco `server`, ao lado do
`androidScheme`, acrescente `iosScheme: "https"`.

**Por que:** com isso o WebView do iOS passa a usar a **mesma origem** do
Android (`https://localhost`), e o projeto volta a ter uma origem só para
manter no CORS em vez de duas. Duas origens é a classe de erro que acabou de
custar uma sessão de teste com aparelho emprestado.

**Por que agora e não depois:** trocar o esquema troca a origem do WebView, e o
`localStorage` é por origem — a troca **apaga a sessão e desloga todo mundo no
iOS**. Hoje não existe nenhum usuário iOS, então o custo é zero. Depois do
lançamento, é um deslogamento em massa.

Escreva um comentário no padrão do arquivo (o bloco `ios` ali do lado é um bom
modelo) registrando as duas coisas: que a origem tem que bater com a do Android
por causa do CORS, e que mudar isso depois desloga os usuários.

Não edite `axonweb/ios/App/App/capacitor.config.json` — ele é gerado pelo
`cap sync` e o CI o regenera.

## Tarefa 2 — Mensagem de rede voltada ao usuário

`axonweb/src/lib/api.ts`, linha ~138. O `catch` em volta do `fetch` hoje lança:

```
"⚠️ DEV: Backend inacessível. Abra a porta 8000 como Pública no painel de Portas
do VS Code e certifique-se de que o servidor está rodando (uvicorn main:app --reload)."
```

Esse texto aparece para **qualquer** falha de rede, inclusive na build de
produção — foi exatamente o que o iPhone mostrou. Duas razões para trocar:

1. É instrução de desenvolvedor exibida a um usuário final.
2. **É risco de rejeição na App Store.** "App que parece incompleto ou em
   testes" é o primeiro item da lista do `docs/PLANO_IOS.md` (Fase 5) do que a
   Apple rejeita e o Google não. Um revisor lendo "painel de Portas do VS Code"
   e "uvicorn --reload" conclui exatamente isso.

Troque por uma mensagem de usuário em português, no tom do resto do app — algo
como *"Não foi possível conectar ao servidor. Verifique sua conexão e tente
novamente."*. A mensagem vai para `Error.message` e é exibida direto pelas
telas, então ela precisa estar pronta para leitura, sem prefixo técnico.

**Mantenha a dica de desenvolvedor**, mas só em desenvolvimento, atrás de
`import.meta.env.DEV`. Ela é útil e já economizou tempo de quem trabalha no
projeto; o problema é ela vazar para produção.

Deixe um comentário dizendo por que a dica é condicional, para ninguém
"simplificar" removendo a condição depois.

## Tarefa 3 — Impedir o zoom automático do iOS ao focar um campo

Em `axonweb/src/main.tsx`, ao lado de onde a classe `is-native` é aplicada,
reescreva em runtime o conteúdo da meta tag de viewport **quando a plataforma
for iOS**, acrescentando `maximum-scale=1.0, user-scalable=no` ao que já existe
em `axonweb/index.html`:

```
width=device-width, initial-scale=1.0, viewport-fit=cover
```

Use `Capacitor.getPlatform() === "ios"` como condição.

**Por que:** o WebKit dá zoom automático sempre que o usuário foca um campo com
fonte **menor que 16px**, e **não desfaz o zoom depois** — a tela fica
aproximada e deslocada até o usuário dar pinch para voltar. Observado num
iPhone 15 em 23/10/2026, em todos os campos do app. Medido no código: 6 campos
estão em `text-[0.72rem]` (11,5px) e os outros 75 herdam tamanhos também abaixo
de 16px.

**Por que não a solução "correta" de pôr 16px nos campos:** são 81 campos e
mudaria o design visual do app inteiro, numa semana em que a colega está
trabalhando no design (branch `front/ajustes-design`). Fica registrado aqui
como a melhoria futura, não como o que fazer agora.

**Por que `getPlatform() === "ios"` e não `isNativePlatform()`:** o Android não
tem esse comportamento, está publicado e funcionando. Travar o zoom lá também
seria mudar um app em produção sem motivo.

**Por que NÃO usar a classe `is-native`:** o `main.tsx` a aplica **sempre**,
inclusive na web — está comentado lá o porquê. Usá-la aqui desligaria o
pinch-zoom em `axonapp.tech` no navegador, que é regressão de acessibilidade
real. Dentro de um app instalado, não ter pinch-zoom na interface é o
comportamento esperado; num site, não é.

Escreva um comentário explicando as duas coisas: que o gatilho é fonte abaixo
de 16px, e que isso vale só para o app iOS instalado.

## O que NÃO tocar

- `backend/` — nada. O CORS de produção já foi ajustado à mão no VPS.
- `axonweb/index.html` — a meta de viewport dele é a da **web** e fica como
  está. A mudança da Tarefa 3 é em runtime, só no app iOS.
- O tamanho de fonte de qualquer campo: a Tarefa 3 existe justamente para
  **não** mexer no design.
- O condicional `CAP_SERVER_URL` do `capacitor.config.ts`: é a proteção que
  impede um release apontar para o servidor de desenvolvimento.
- O bloco `ios` existente (`contentInset`, `allowsLinkPreview`) e o
  `android.allowMixedContent`.
- `.github/workflows/ios.yml`, o scheme compartilhado, o `Info.plist`,
  `IPHONEOS_DEPLOYMENT_TARGET` e `TARGETED_DEVICE_FAMILY`.
- As constantes `BASE_URL`/`API_URL` com fallback `http://localhost:8000` em
  `api.ts`, `liveTranscription.ts`, `AppleAuthButton.tsx` e
  `GoogleAuthButton.tsx`. O fallback é para desenvolvimento e em build de
  produção o `VITE_API_URL` sempre está definido.

## Verificação

- [ ] `capacitor.config.ts` tem `iosScheme: "https"` dentro de `server`
- [ ] O texto "VS Code" e "uvicorn" só aparece dentro de um ramo
      `import.meta.env.DEV`:
      `grep -n 'VS Code\|uvicorn' axonweb/src/lib/api.ts`
- [ ] A meta de viewport só é reescrita quando `Capacitor.getPlatform() === "ios"`
- [ ] `axonweb/index.html` NÃO foi alterado (a web mantém o pinch-zoom)
- [ ] `cd axonweb && npm run lint` passa
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json` passa
- [ ] `cd axonweb && npm run build` passa
- [ ] `cd backend && python3 -c "import main"` passa
- [ ] `npx tsx` ou leitura manual confirma que a mensagem de produção não
      contém jargão técnico

## Entrega

**Não commite.** O Bernardo faz os commits.

Ao terminar, diga: os arquivos alterados, o texto exato da mensagem nova de
produção, e confirme que a dica de desenvolvedor ficou atrás de
`import.meta.env.DEV`.
