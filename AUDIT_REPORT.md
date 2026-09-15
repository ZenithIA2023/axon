# AXON — Relatório de Auditoria Técnica

Auditoria de arquitetura, segurança, performance, qualidade e código morto, realizada em 2026-09-14 sobre o estado da branch `main` (commit `849729d`). O foco é entrada em produção com dados pessoais reais.

Escopo verificado: todo o backend FastAPI (`backend/`), todo o frontend React/Vite (`axonweb/src/`), o esquema e as migrations do Supabase, o projeto Android (Capacitor), os scripts de deploy e a documentação. Testes contra produção (`api.axonapp.tech`) foram apenas não destrutivos (headers, verificação de 401, preflight CORS).

---

## 1. Executive Summary

O AXON é um produto maduro e coeso. A arquitetura de dados é sólida: o backend é a única fronteira de autorização, todo serviço recebe `user_id` explicitamente e filtra as queries por ele, e não há confiança na camada visual para proteção. As credenciais estão fora do repositório e fora do bundle. Não encontrei nenhum vazamento de dados entre usuários (IDOR) nas rotas de tarefas, rotinas, objetivos, conversas, notificações ou perfil.

Os problemas que impedem uma entrada tranquila em produção são poucos e concentrados. O mais grave é a política de CORS: em produção, a API aceita requisições autenticadas com credenciais de **qualquer** subdomínio `*.app.github.dev`, uma superfície de ataque de desenvolvimento que ficou ligada no ambiente real. Em seguida vêm duas telas que mentem para o usuário (recuperação e redefinição de senha simulam sucesso sem fazer nada) e um endpoint de debug que expõe o perfil completo do usuário logado. Nenhum desses é um vazamento entre contas, mas o de senha é uma falha funcional séria num fluxo de segurança.

O restante são melhorias de performance (bundle de 1,6 MB num único chunk, imagens de 600 KB não otimizadas, polling redundante) e de organização (páginas de 2.000 a 6.000 linhas, componentes de autenticação duplicados, arquivos órfãos). A dívida técnica é gerenciável e está bem documentada nos próprios comentários do código, que são excepcionalmente bons.

### Scorecard

| Dimensão | Nota | Justificativa |
|---|---|---|
| Arquitetura | 8 | Fronteira de segurança única e clara; serviços isolados dos routers; frontend/backend bem separados. Perde por páginas gigantes e ausência de camada de teste automatizado no caminho crítico. |
| Qualidade de código | 7 | Comentários e nomes excelentes, validação Pydantic rigorosa. Perde por arquivos de milhares de linhas e `except: pass` em excesso. |
| Manutenibilidade | 7 | Um lugar por regra, migrations numeradas e explicadas. Perde pela duplicação de helpers e pela concentração de lógica em poucas páginas. |
| Type safety | 8 | TypeScript estrito ligado, `tsc` passa limpo, quase nenhum `any`. Falta validação de runtime nas respostas da API. |
| Performance | 7 | Após 14/09: code splitting por rota (bundle inicial 1,64 MB → ~257 KB) e N+1 da lista de conversas corrigido (~8x). Ainda perde por imagens pesadas (otimização revertida por qualidade) e páginas grandes. Nota original: 6. |
| Segurança | 7 | Modelo de autorização correto. Após as correções de 14/09 (CORS fechado em produção, debug removido, headers, posse de conversa), o principal ponto aberto é a recuperação de senha falsa (SEC-002), que depende de config do Supabase. Nota original: 5. |
| Privacidade | 7 | Dados minimizados no storage local, sem PII em logs de forma sistemática. Perde pelo endpoint de debug e por dados pessoais indo ao Claude/OpenAI/Google sem aviso explícito no app. |
| Testabilidade | 4 | Funções puras isoladas e testáveis (voz, streak, insights), mas sem runner configurado e sem cobertura dos fluxos de autenticação e CRUD. |
| Documentação | 8 | Comentários de código e docs de deploy muito acima da média. `AGENTS.md` criado nesta auditoria. |
| Consistência de design | 8 | Design system coerente por tokens CSS, tema claro/escuro completo. Perde por centenas de cores hardcoded em vez dos tokens. |

---

## 1.1. Status das correções (rodada de 2026-09-14)

Após a aprovação da auditoria, uma rodada de correções foi aplicada por ondas. O que segue reflete o estado real do código nesta branch. As mudanças ainda **não** foram commitadas ao final desta rodada; typecheck, lint e build passam limpos em todas.

**Corrigido e validado**

| Achado | O que foi feito |
|---|---|
| SEC-001 (CORS) | A regex `*.app.github.dev` agora só é ativada quando `ENV=development`. Em produção fica `None`. Validado importando o app em ambos os modos. |
| SEC-003 (debug) | Endpoints `GET /chat/debug/test` e `GET /chat/debug/perfil` removidos. Sem referências no frontend. |
| SEC-006 (posse de conversa) | `assert_conversation_owned()` criado em `chat_context.py` e chamado em `stream_and_save` (texto + voz) e no `/chat` legado, antes de inserir mensagens. |
| SEC-004 (headers) | Middleware adiciona `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` em toda resposta; `Strict-Transport-Security` só em produção. Sem CSP (API JSON). |
| PERF-004 (N+1 conversas) | Substituído por 1 query em lote. Medido: 1865 ms → 237 ms (~8x). Bug latente de desempate por `created_at` igual também corrigido. |
| PERF-001 (bundle) | Lazy loading aplicado e depois **revertido** em 15/09: o bundle inicial caía para ~257 KB, mas a primeira visita a cada tela travava a navegação por até 7s. Medido lado a lado contra a versão anterior. Em vez disso, o peso da landing caiu 71% (2 MB → 608 KB) otimizando as imagens sem perda de qualidade. |
| DEP-001 (react-router) | Atualizado 7.15.0 → 7.18.3. Os 4 CVEs high saíram do `npm audit`. |
| DEP-002 (transitivas) | `npm audit fix` (sem `--force`) aplicado: 12 → 3 vulnerabilidades. |
| ESLint | Passa a ignorar `android/` e `dist`; globais de Node nos arquivos de config. Lint roda limpo. |
| node_modules | `node_modules/` da raiz removido do rastreamento do git (3.886 arquivos) e adicionado ao `.gitignore`. |
| Código morto | Removidos 6 órfãos (`ResultReport` vazio, `AuthLogo`, `AuthBackground`, `OnboardingBackground`, `Button.jsx`, `Card.jsx`) e 3 funções de API sem uso (`getMe`, `saveChronotype`, `getUnreadCount`, as duas primeiras chamando a rota inexistente `/users/me`). |
| ARCH-002 (dupes) | `AuthGlow` (4 cópias) e `InputField` do Login extraídos para `components/auth/`. |
| AUTH-002 (console.log) | Os 2 `console.log` de `Questionnaire.tsx` removidos. |
| FUNC-002 (link privacidade) | Link "Política de Privacidade" no signup agora aponta para a página real. |

**Descartado por decisão do responsável (com motivo)**

- **PERF-002 (imagens):** a conversão para WebP degradou visivelmente o mascote e os SVGs decorativos perderam transparência. Qualidade de imagem é confiança do usuário; revertido por inteiro. Fica em aberto como opção futura via WebP lossless (sem perda visível).
- **PERF-003 (polling):** análise mostrou que os timers não são duplicados — têm propósitos e frequências distintas, cada um documentado. Fundi-los acoplaria código hoje independente. Mantido como está.
- **NotificationSettingsSheet.tsx:** órfão, mas restaurado a pedido — é o esqueleto pronto da futura página de configurações.
- **3 vulns `uuid` restantes:** via `@capacitor/cli → xcode → uuid`. `xcode` é ferramenta de iOS (o projeto só tem Android). `--force` faria downgrade do Capacitor para uma nightly instável e arriscaria o build Android. Não corrigir.

**Pendente (depende do responsável)**

- **SEC-002 / AUTH-001 / FUNC-001 (recuperação de senha):** ainda telas falsas. Falta registrar a URL de redirect no painel do Supabase para eu implementar o backend. O responsável optou por fazer depois.
- **FUNC-002 (Termos de Uso):** link ainda em `#` — não existe página de Termos no repo (texto jurídico a ser escrito).

**Não abordado nesta rodada (dívida de médio prazo):** ARCH-001 (páginas monolíticas), ARCH-003, PRIV-001, RLS-001/002, DS-001/002, testabilidade. São itens grandes, sem risco imediato, para roadmap.


## 2. Architecture Map

```
App Android (Capacitor, WebView, HashRouter)
Navegador Web (BrowserRouter)
            │  Bearer token (Supabase JWT) no header Authorization
            ▼
FastAPI (backend/, um worker no VPS via Nginx em api.axonapp.tech)
   ├── auth_helper.get_current_user  → valida o JWT com supabase_auth.auth.get_user
   ├── routers/*  → validação, rate limit, chama services
   ├── services/* → regra de negócio, SEMPRE filtra por user_id
   ├── APScheduler (a cada 5 min) → notificações, snapshots, relatórios
   └── database.supabase (service_role, BYPASSA RLS de propósito)
            │
            ▼
Supabase (Postgres + Auth + Storage)
   ├── Auth: email/senha e Google OAuth (id_token)
   ├── 23 tabelas, RLS definida mas irrelevante (backend usa service_role)
   └── Storage: bucket "avatars" (público)
            │
            ▼
Serviços externos
   ├── Anthropic Claude (chat, insights, relatórios, notificações)
   ├── OpenAI / Google / ElevenLabs (voz: TTS e STT)
   └── Google Calendar + FCM (push)
```

Fluxos de usuário principais: onboarding (signup → questionário → cronotipo → dashboard), chat com o agente (tool use sobre tarefas/rotinas/objetivos), planejamento (calendário, rotinas, objetivos), registro diário (DayReview → insights e calibração), voz (push-to-talk → transcrição → agente → fala).

O ponto arquitetural mais importante a preservar: **o cliente Supabase do backend usa a `service_role` key e ignora RLS de propósito.** A segurança inteira depende de cada função de serviço filtrar por `user_id`. Isso está documentado em `database.py` e é seguido consistentemente. Ver o `AGENTS.md` para a regra completa.

---

## 3. Attack Surface Map

- **Páginas públicas:** landing, login, signup, forgot-password, reset-password, callback do OAuth.
- **APIs públicas (sem token):** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/google*`, `POST /classify/` (calcula cronotipo sem salvar), `GET /chat/debug/test`, `GET /`, e o WebSocket `/voice/realtime` (autentica na primeira mensagem).
- **APIs autenticadas:** todo o resto, protegido por `Depends(get_current_user)`.
- **Supabase:** acessado só pelo backend com service_role. A `anon key` não é usada em lugar nenhum do frontend — o frontend fala só com a API própria.
- **Storage:** bucket `avatars` público para leitura (URLs de avatar precisam ser servíveis). Upload só via backend autenticado.
- **OAuth:** Google, com `state` opaco guardado no servidor e código de sessão de uso único. Bem desenhado contra forja de redirect.
- **Entradas do usuário que chegam a LLMs:** mensagens de chat, transcrições de voz, notas do registro diário, títulos de tarefas. Vão para Claude/OpenAI/Google.
- **Storage do navegador:** `axon_token`, `axon_refresh_token`, `axon_user` (id/email/nome), `axon_last_active`, `axon_chronotype`, `axon_schedule_type`, `axon-theme`, `axon_shown_notification_ids`.

---

## 4. Public Exposure Report

### Intencionalmente público
- Landing, telas de auth, `POST /classify/` (o questionário funciona antes do login), `GET /auth/google*`, bucket de avatares (leitura), `GET /` (health check).

### Público, mas provavelmente não deveria estar
- **`GET /chat/debug/test`** responde 200 em produção sem autenticação. Inócuo (só `{"status": "ok"}`), mas é código de debug que não deveria ir a produção. Ver QUAL-002.
- **`GET /chat/debug/perfil`** exige token, mas devolve o **perfil bruto inteiro** do usuário (todas as colunas, incluindo `google_refresh_token`, `google_access_token`) mais todas as respostas do questionário. É debug autenticado, mas expõe o refresh token do Google do próprio usuário na resposta JSON. Ver SEC-003.

### Corretamente protegido
- Todos os endpoints de dados (perfil, tarefas, rotinas, objetivos, conversas, mensagens, notificações, insights, registro diário, voz) devolvem 401 sem token. Verificado ao vivo contra produção.
- `/docs`, `/redoc`, `/openapi.json` desabilitados em produção (`ENV != development`). Verificado: 404.
- Nenhuma secret no bundle JS. Nenhum source map publicado. Verificado no build de produção.

### Não foi possível determinar
- Se o bucket `avatars` permite **listagem** anônima do conteúdo. A tentativa anônima de listar devolveu 400 (bloqueada), o que é o comportamento seguro, mas não confirma as policies de Storage linha a linha. Recomendo revisar as policies do bucket no painel.

---

## 5. Critical Findings

### SEC-001 — CORS de produção aceita qualquer subdomínio `*.app.github.dev` com credenciais
- **Categoria:** Security · **Severidade:** HIGH · **Confiança:** Confirmado · **Prioridade:** P0 · **Esforço:** pequeno
- **Local:** [backend/main.py:33-42](backend/main.py#L33-L42)
- **Evidência:** o middleware CORS usa `allow_origin_regex=r"https://[^.]+\.app\.github\.dev"` junto com `allow_credentials=True`. Testado ao vivo: um preflight com `Origin: https://anything.app.github.dev` para `POST /tasks` em `api.axonapp.tech` retornou `access-control-allow-origin: https://anything.app.github.dev` e `access-control-allow-credentials: true`.
- **Impacto:** qualquer pessoa que hospede uma página num Codespace (domínio trivial de obter, `*.app.github.dev` é compartilhado por todos os usuários do GitHub) pode fazer o navegador de uma vítima logada emitir requisições autenticadas para a API real. O token do AXON não vive em cookie (vive em localStorage), então o risco prático é reduzido: o atacante ainda precisaria do token no header, que a política de CORS por si só não entrega. Mesmo assim, é uma regra de dev que nunca deveria estar no ambiente de produção e amplia a superfície sem necessidade.
- **Reprodução:** `curl -sI -X OPTIONS https://api.axonapp.tech/tasks -H "Origin: https://x.app.github.dev" -H "Access-Control-Request-Method: GET"` → observe o `access-control-allow-origin` refletido.
- **Correção:** condicionar a regex do Codespace a `ENV == "development"`. Em produção, `allow_origins` deve conter apenas `https://axonapp.tech` e `https://localhost` (o WebView do app). Ver a implementação sugerida na onda P0.

### SEC-002 — Redefinição e recuperação de senha são telas falsas
- **Categoria:** Functional/Security · **Severidade:** HIGH · **Confiança:** Confirmado · **Prioridade:** P1 · **Esforço:** médio
- **Local:** [axonweb/src/pages/ForgotPassword.tsx:32-36](axonweb/src/pages/ForgotPassword.tsx#L32-L36), [axonweb/src/pages/ResetPassword.tsx:51-55](axonweb/src/pages/ResetPassword.tsx#L51-L55)
- **Evidência:** ambas simulam sucesso com `await new Promise(resolve => setTimeout(resolve, 900))` e mostram a tela de confirmação. Não existe endpoint de recuperação no backend (`grep` por reset/forgot/recover não achou nada). Os comentários dizem "Exemplo futuro: await api.forgotPassword(email)".
- **Impacto:** um usuário que esqueceu a senha pede o link, vê "Confira sua caixa de entrada", e nunca recebe e-mail nenhum. Fica trancado para fora da conta sem entender por quê. Numa app que armazena dados pessoais e vai à Play Store, um fluxo de recuperação que mente é uma falha grave de confiança e de funcionalidade.
- **Correção:** implementar de verdade usando o Supabase Auth (`reset_password_for_email` no backend, e a página de reset consumindo o token do link). Enquanto não implementado, a tela deveria dizer honestamente que o recurso está indisponível e oferecer contato, em vez de fingir que enviou.

### SEC-003 — Endpoint de debug expõe o refresh token do Google do usuário
- **Categoria:** Security/Privacy · **Severidade:** MEDIUM · **Confiança:** Confirmado · **Prioridade:** P1 · **Esforço:** pequeno
- **Local:** [backend/routers/chat.py:65-93](backend/routers/chat.py#L65-L93)
- **Evidência:** `GET /chat/debug/perfil` faz `select("*")` em `profiles` e devolve o resultado cru, que inclui `google_refresh_token` e `google_access_token`. Exige token (só vê o próprio perfil), mas coloca o refresh token do Google numa resposta JSON de uma rota de debug.
- **Impacto:** o refresh token do Google concede acesso duradouro ao calendário do usuário. Expô-lo numa resposta de API (que pode acabar em logs de proxy, histórico de rede do navegador, ferramentas de captura) é desnecessário. Não é vazamento entre contas, mas viola minimização.
- **Correção:** remover `/chat/debug/perfil` e `/chat/debug/test` de produção, ou no mínimo remover os campos de token do select. São endpoints de debug que não pertencem a um build de produção.

---

## 6. Security Findings (demais)

### SEC-004 — Ausência de headers de segurança HTTP
- **Severidade:** LOW · **Prioridade:** P2 · **Confiança:** Confirmado
- **Evidência:** as respostas de `axonapp.tech` (Nginx) e da API não trazem `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy` nem `Permissions-Policy`. Verificado ao vivo.
- **Impacto:** sem HSTS, um downgrade para HTTP na primeira visita é possível; sem CSP, um XSS eventual tem alcance total. O risco de XSS é baixo porque não há `dangerouslySetInnerHTML` nem `innerHTML` no código (verificado), mas defesa em profundidade se paga barato.
- **Correção:** adicionar os headers no bloco `server` do Nginx (site e API). HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, e uma CSP começando em modo report-only.

### SEC-005 — Rate limiting por IP no login pode ser contornado atrás de proxy
- **Severidade:** LOW · **Prioridade:** P2 · **Confiança:** Suspeita
- **Local:** [backend/limiter.py](backend/limiter.py), [backend/routers/auth.py:51](backend/routers/auth.py#L51)
- **Evidência:** o limiter usa `get_remote_address`. Atrás do Nginx, sem confiar em `X-Forwarded-For`, todos os clientes podem aparecer como o IP do proxy (bloqueando todo mundo junto) ou, se o proxy repassar, o IP real. O login tem 10/min e o register 5/min, o que é razoável, mas a chave precisa ser o IP do cliente real.
- **Correção:** confirmar que o `slowapi`/`get_remote_address` está lendo o IP do cliente correto atrás do Nginx (via `X-Forwarded-For` confiável). Documentar a decisão.

### Autenticação vs. autorização — resultado do teste de IDOR
Verifiquei todas as rotas que recebem um id no path (`/chat/{id}`, `/routines/{id}`, `/objectives/{id}`, `/tasks/{id}`, `/subtasks/{id}`, notificações, relatórios). **Todas** filtram por `user_id` na query de leitura, atualização e exclusão, e levantam 404 quando a linha não pertence ao usuário. Um usuário A não consegue ler nem alterar dados do usuário B manipulando ids. Não encontrei Broken Access Control. Esse é o ponto forte da aplicação.

Uma observação menor: `POST /chat` e `POST /chat/message` gravam mensagens usando o `conversation_id` enviado sem verificar que a conversa pertence ao usuário (diferente de `GET/DELETE /chat/conversations/{id}/messages`, que verificam). Um usuário poderia inserir mensagens numa conversa de outro se adivinhasse o UUID. O risco é baixo (UUIDs não são adivinháveis e ele não conseguiria LER a conversa alheia), mas a checagem de posse deveria existir antes do insert por consistência. Registrado como **SEC-006 (LOW, P2)**.

---

## 7. Supabase / RLS Findings

Todas as 23 tabelas existem no banco de produção (confirmado por introspecção read-only via PostgREST). As tabelas de dados do usuário têm RLS habilitada com policies de ownership por `auth.uid()`. Porém, **o backend usa a service_role key e ignora RLS**, então as policies são hoje uma segunda linha de defesa inativa — a proteção real é o filtro `user_id` no código.

- **RLS-001 (INFO):** algumas tabelas foram criadas deliberadamente **sem** RLS (`deleted_accounts`, `user_energy_profiles`, `daily_task_stats`, `axon_insights`, `axon_discoveries`, `daily_log_drafts`, `device_tokens`, `streak_forfeits`, `voice_stt_usage`, `weekly_reports`), com o argumento de que só o backend as acessa. Isso é aceitável **enquanto** a anon key nunca for usada no cliente e o service_role nunca vazar. Se um dia o frontend passar a falar direto com o Supabase, essas tabelas ficam expostas. Documentado no `AGENTS.md`.
- **RLS-002 (LOW):** as policies de RLS nas tabelas que a têm nunca são exercidas em produção (backend bypassa). Recomendo mantê-las e, idealmente, adicionar RLS às tabelas sem ela, para que o modelo continue seguro mesmo se a fronteira mudar. Baixa prioridade porque não muda o comportamento atual.

### Service role
Confirmado: a `SUPABASE_SERVICE_KEY` está apenas em `backend/.env` (fora do git, verificado por `check-ignore`), nunca no frontend, nunca no bundle. A chave que aparece no histórico do git (`8feaf73`, `94bb643`) é o placeholder `eyJhbGc...` do `.env.example`, não a chave real (o prefixo não bate com a chave atual). Nenhuma credencial real foi commitada.

---

## 8. Authentication Findings

- Signup, login e refresh são sólidos, com rate limiting e mensagens que não vazam se o e-mail existe.
- O auto-login por dispositivo (janela de 7 dias) é bem pensado e centralizado em `hasFreshSession`.
- O bug histórico do timer fantasma do Supabase (que deslogava todo mundo) está corrigido em `database.py` com `auto_refresh_token=False`.
- **AUTH-001 (MEDIUM, P1):** a recuperação de senha não funciona — ver SEC-002.
- **AUTH-002 (LOW):** o `console.log` em `Questionnaire.tsx:445` loga `isLoggedIn` e as respostas do questionário no console do navegador. Não é PII crítica, mas é ruído de debug em produção.

---

## 9. Privacy Findings

- **PRIV-001 (MEDIUM, P2):** dados pessoais (mensagens, notas do dia, transcrições de voz, títulos de tarefas) são enviados a Claude, OpenAI e Google. Há uma política de privacidade em `public/legal/privacidade.html`, mas o app não a expõe (o arquivo é órfão, não linkado). Para a Play Store e o RGPD/LGPD, o usuário deveria conseguir ler quais dados vão a terceiros.
- **PRIV-002 (LOW):** o áudio de voz é enviado para transcrição e não é armazenado pelo backend (verificado: `stt_service` não persiste o áudio, só conta segundos). Bom. As gravações de teste da Fase 2 estão no `.gitignore` da raiz.
- **PRIV-003 (INFO):** o storage local guarda id, e-mail e nome do usuário em `axon_user`. É o mínimo necessário para a UI e é limpo no logout. Aceitável.

---

## 10. Functional Findings

- **FUNC-001 (HIGH):** recuperação/redefinição de senha não funcionam — ver SEC-002.
- **FUNC-002 (LOW):** os links "Termos de Uso" e "Política de Privacidade" no signup apontam para `href="#"` (não levam a lugar nenhum), embora exista uma política em `public/legal/`. Ver [axonweb/src/pages/Signup.tsx:235-241](axonweb/src/pages/Signup.tsx#L235-L241).
- **FUNC-003 (INFO):** as telas de loading (`AppLoading`, `DashboardLoading`, `Analyzing`) são temporizadores fixos que não esperam dado real — são teatro de carregamento. Funciona, mas o dashboard pode não estar pronto quando o timer termina. Aceitável para a experiência, registrado para consciência.

---

## 11. Performance Findings

### PERF-001 — Bundle único de 1,6 MB, sem code splitting
- **Severidade:** MEDIUM · **Prioridade:** P2 · **Confiança:** Confirmado
- **Evidência:** o build de produção gera `index-*.js` de 1,64 MB (432 KB gzip) num único chunk. Não há `React.lazy` nem `import()` de rotas no código. O Vite avisa que chunks passam de 500 KB.
- **Impacto:** primeira carga lenta, sobretudo em 3G/4G no mobile-first. Todas as páginas (incluindo as 6.000 linhas de Planning) carregam antes do login.
- **Correção:** lazy-load das rotas autenticadas com `React.lazy` + `Suspense`. Ganho estimado alto: a landing e o login não precisam do código de Planning/Goals/Insights.

### PERF-002 — Imagens de mascote não otimizadas (600-690 KB cada)
- **Severidade:** MEDIUM · **Prioridade:** P2 · **Confiança:** Confirmado
- **Evidência:** `axon-head-happy.png` (688 KB), `axon-happy-wave.png` (605 KB), `axon-happy.png` (591 KB), mais `brain.svg` (457 KB) e `star.svg` (400 KB) — SVGs decorativos enormes.
- **Correção:** converter os PNG para WebP e redimensionar para o tamanho de exibição real; simplificar/minificar os SVGs. Ganho fácil de mais de 1 MB.

### PERF-003 — Polling redundante de notificações
- **Severidade:** LOW · **Prioridade:** P2 · **Confiança:** Confirmado
- **Evidência:** o `NotificationToastProvider` faz polling a cada 15s, e o Dashboard tem um segundo intervalo de contagem a cada 2 min, além de disparar `analyzeNotifications` (que chama o Claude, ~9s) a cada retorno de aba. Com muitos usuários, `analyze` no `visibilitychange` multiplica chamadas caras ao Claude.
- **Correção:** consolidar o polling num único lugar; considerar Supabase Realtime para o sininho em vez de polling; debounce no `analyze` para não disparar a cada troca de aba.

### PERF-004 — N+1 na listagem de conversas
- **Severidade:** LOW · **Prioridade:** P2 · **Confiança:** Confirmado
- **Local:** [backend/routers/conversations.py:99-104](backend/routers/conversations.py#L99-L104)
- **Evidência:** `list_conversations` chama `_load_last_message_and_count` por conversa, e cada chamada faz duas queries (última mensagem + contagem). Com 8 conversas por página, são 16 idas ao banco de ~105ms. Os serviços de rotina já foram otimizados para evitar isso; conversas ainda não.
- **Correção:** buscar as últimas mensagens e contagens em lote (uma query com `in_` nos ids das conversas).

O backend em geral já teve os N+1 mais quentes corrigidos (`routines_service`, `objectives_service`, dashboard). Isso é visível e elogiável.

---

## 12. Architecture Findings

- **ARCH-001 (MEDIUM, P3):** páginas monolíticas. `Planning.tsx` tem 6.154 linhas com 74 `useState`, `Goals.tsx` 2.541, `Dashboard.tsx` 2.304, `Insights.tsx` 2.143, `Chat.tsx` 1.979. São arquivos difíceis de navegar e revisar, misturando lógica de negócio, estado e ~28 subcomponentes. Não é bug, mas é a maior fonte de risco de regressão. Recomendo extrair subcomponentes e hooks aos poucos, sem refatoração big-bang.
- **ARCH-002 (LOW, P3):** duplicação de componentes de autenticação. `AuthGlow` está definido em 4 arquivos, `PasswordField` em 3, `InputField` em 2, `Header` de onboarding em 5. São cópias idênticas. Extrair para `components/auth/` reduz superfície de manutenção.
- **ARCH-003 (LOW, P3):** duas rotas (`Report.tsx` e `ResultReport.tsx`) e helpers como `toISODate`/`isTaskOnDate` duplicados entre `Planning.tsx` e `Focus.tsx`.

---

## 13. Dead Code

Classificado por confiança. **Nada foi removido nesta auditoria** (Etapa A).

### Provavelmente removível (requer confirmar imports dinâmicos)
- `src/pages/ResultReport.tsx` — nunca importado (o App usa `Report.tsx`).
- `src/components/settings/NotificationSettingsSheet.tsx` — nunca importado.
- `src/components/layout/OnboardingBackground.tsx`, `AuthBackground.tsx` — nunca importados.
- `src/components/auth/AuthLogo.tsx` — nunca importado.
- `src/components/ui/Button.jsx`, `Card.jsx` — nunca importados (as páginas usam classes Tailwind direto).
- `src/assets/axon/axon-normal.png` — não referenciado.

### Requer investigação
- `public/legal/*.html` e `_estilo.css` — não linkados de dentro do app, mas podem ser servidos por URL direta (política de privacidade para a Play Store). **Não remover** sem confirmar que não são o alvo dos links legais.
- `api.getMe`, `api.saveChronotype`, `api.getUnreadCount` — exportadas e sem uso em `src/`. Podem ser API pública intencional; confirmar antes de remover.

### Debug a remover de produção
- `GET /chat/debug/test`, `GET /chat/debug/perfil` (ver SEC-003).
- `console.log`/`console.error` (19 no frontend, 52 `print` no backend). Os `print` do backend são o mecanismo de log escolhido (vão para o journald); os `console.*` do frontend são ruído.

---

## 14. Dependency Findings

`npm audit` reporta 7 vulnerabilidades (3 high, 3 moderate, 1 low), todas em dependências transitivas:
- **DEP-001 (MEDIUM, P2):** `react-router` 7.15.0 tem CVEs de alto nível (open redirect, DoS por route matching, CSRF em document requests). O app não usa SSR/RSC (onde alguns desses vivem), mas o open redirect via backslash em `<Link>` merece atenção. Atualizar para a linha corrigida do react-router 7.
- **DEP-002 (LOW):** `brace-expansion` (DoS) e `uuid` (bounds check) — transitivas, baixo impacto. `npm audit fix` resolve as não-breaking.
- Backend: as versões (FastAPI 0.136, Supabase 2.31, Anthropic 0.107) são recentes. `pip-audit` não está instalado no ambiente; recomendo rodá-lo no CI.

**Não fazer upgrade em massa.** Atualizar o react-router pontualmente e validar a navegação.

---

## 15. Design System Findings

O design system é coerente e está bem definido por tokens CSS em `src/styles/index.css` (cores, superfícies, sombras, texto), com tema claro e escuro completos e sincronização da status bar nativa.

- **DS-001 (LOW, P3):** centenas de cores hexadecimais hardcoded nas páginas (`#7b2cbf` aparece 289 vezes, `#a855f7` 121, etc.) em vez de usar os tokens (`--accent`, `--accent-strong`). Isso torna um ajuste de paleta um find-replace arriscado. Migrar para os tokens ao longo do tempo.
- **DS-002 (INFO):** o raio de borda tem 11 valores customizados diferentes (`rounded-[1.65rem]`, `[1.45rem]`, `[1.7rem]`...). Padronizar numa escala reduziria inconsistência sutil.
- Responsividade: o projeto é mobile-first e usa `lg:` (338 vezes) para o desktop. As telas desktop incompletas devem ser tratadas como trabalho em andamento, não regressão.

---

## 16. Quick Wins

Alto retorno, baixo esforço:
1. Fechar o CORS de produção (SEC-001) — uma condição de `ENV`.
2. Remover os endpoints de debug do chat (SEC-003) — apagar duas funções.
3. Converter os 3 PNG de mascote para WebP e minificar os 2 SVGs grandes (PERF-002) — mais de 1 MB economizado.
4. Adicionar headers de segurança no Nginx (SEC-004) — quatro linhas de config.
5. Apontar os links de Termos/Privacidade para os arquivos legais existentes (FUNC-002).
6. Remover os `console.log` do questionário (AUTH-002).

---

## 17. Technical Debt

- Recuperação de senha por implementar (o maior débito funcional).
- Páginas monolíticas (Planning, Goals, Dashboard) — o maior débito de manutenção.
- Ausência de testes automatizados no caminho crítico (auth, CRUD, autorização). Existem testes de funções puras (voz, streak), mas sem runner configurado e sem CI.
- 43 blocos `except`/`except Exception: pass` no backend. Muitos são deliberados e documentados (calibração, push, sync do calendário não podem derrubar o fluxo principal), mas alguns engolem erros que seriam úteis num log estruturado.
- Sem CI/CD: o deploy é um script manual (`scripts/deploy.sh`) que puxa do GitHub no VPS. Funciona, mas não roda lint/typecheck/build antes de publicar.

---

## 18. Recommended Roadmap

### P0 — Segurança crítica (fazer primeiro, isolado)
- SEC-001: fechar o CORS de produção.

### P1 — Bugs e integridade
- SEC-002 / AUTH-001 / FUNC-001: implementar recuperação de senha de verdade (ou desativar honestamente a tela).
- SEC-003: remover endpoints de debug do chat.
- SEC-006: checar posse da conversa antes de inserir mensagem no `POST /chat`.

### P2 — Performance
- PERF-001: code splitting por rota.
- PERF-002: otimizar imagens.
- PERF-003/004: consolidar polling e resolver o N+1 de conversas.
- SEC-004: headers de segurança no Nginx.
- DEP-001: atualizar react-router.

### P3 — Arquitetura e limpeza
- ARCH-001: quebrar as páginas monolíticas (incremental).
- ARCH-002/003: unificar componentes de auth e helpers duplicados.
- Dead code: remover os órfãos confirmados.
- DS-001: migrar cores hardcoded para tokens.

### P4 — Evolução e documentação
- Configurar runner de teste (Vitest) e CI que rode lint + typecheck + build + testes.
- Adicionar RLS às tabelas que não a têm, como defesa em profundidade.
- Expor a política de privacidade dentro do app.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
