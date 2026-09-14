# AGENTS.md — Manual para quem trabalha no AXON

Leia este arquivo inteiro antes de mudar qualquer coisa. Ele existe para que futuros desenvolvedores e agentes de IA evoluam o projeto sem quebrar a arquitetura, a segurança e o design que já existem. O relatório de auditoria que motivou este manual está em `AUDIT_REPORT.md`.

---

## 1. Visão geral

O AXON é um assistente pessoal de produtividade baseado em cronobiologia. O usuário responde um questionário, recebe um cronotipo, e a partir daí o app organiza tarefas, rotinas e objetivos respeitando os blocos de energia dele. Um agente (Claude, com tool use) conversa por texto e por voz e executa ações no calendário. Registros diários alimentam insights, calibração de energia e relatórios narrativos.

Plataformas: site (`axonapp.tech`) e app Android (Capacitor, mesmo bundle). Backend único em `api.axonapp.tech`.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 8, TypeScript (strict), Tailwind CSS 4, Framer Motion, React Router 7, Recharts, lucide-react |
| Mobile | Capacitor 8 (Android). O projeto iOS não existe. |
| Backend | Python 3, FastAPI, Pydantic v2, slowapi (rate limit), APScheduler, httpx |
| Banco/Auth/Storage | Supabase (Postgres, Auth, Storage) |
| IA | Anthropic Claude (chat, insights, relatórios); OpenAI/Google/ElevenLabs (voz) |
| Integrações | Google OAuth + Calendar, Firebase Cloud Messaging (push) |
| Deploy | VPS Hostinger, Nginx + uvicorn (1 worker) via systemd; `scripts/deploy.sh` |

## 3. Arquitetura

```
Navegador / WebView  →  FastAPI (routers → services)  →  Supabase (service_role)
                                    ↓
                       Claude · OpenAI · Google · FCM
```

Decisões que devem ser preservadas:

- **O backend é a única fronteira de autorização.** O frontend nunca fala direto com o Supabase. A `anon key` não existe no frontend e não deve ser adicionada.
- **O cliente Supabase do backend usa `service_role` e ignora RLS de propósito** (ver `backend/database.py`). Toda função de serviço recebe `user_id` explicitamente e filtra por ele. Sem esse filtro, a query devolve dados de todos os usuários.
- **Dois clientes Supabase separados** (`supabase` para dados, `supabase_auth` para auth) com `auto_refresh_token=False`. Não unifique: o cliente de auth muta sessão e o timer de refresh já causou deslogamento em massa uma vez.
- **Um único worker em produção.** O `planning_scheduler` roda dentro do processo; dois workers duplicariam notificações. Se precisar escalar, o scheduler sai para um processo próprio antes.
- **HashRouter no app, BrowserRouter na web**, decidido em runtime (`App.tsx`). Deep links do OAuth usam `com.axon.app:///#/rota`.
- **Fuso horário do usuário** vem do header `X-Timezone` e é persistido em `profiles.timezone`. Todo cálculo de "hoje" usa `services/user_tz`.
- **Backend calcula, Claude escreve.** Insights, correlações e relatórios fazem a matemática em Python e usam o modelo só para redigir. Não peça ao modelo para fazer aritmética sobre dados brutos.

## 4. Estrutura de diretórios

```
axonweb/            frontend
  src/app/App.tsx   rotas (todas as rotas vivem aqui)
  src/pages/        uma página por rota
  src/components/   componentes por domínio (auth, chat, layout, ui, voice…)
  src/lib/api.ts    ÚNICO cliente HTTP; sessão, refresh, helpers por domínio
  src/lib/voice/    captura, transcrição, TTS, fila de frases
  src/styles/index.css  tokens do design system (cores, superfícies, sombras)
  android/          projeto Capacitor (não edite o que o `cap sync` gera)
backend/
  main.py           app, CORS, scheduler
  auth_helper.py    get_current_user (valida JWT)
  limiter.py        rate limiters
  routers/          HTTP: validação, rate limit, tradução de erros
  services/         regra de negócio; toda função recebe user_id
  models/schemas.py Pydantic (request/response)
  supabase_schema.sql, migrations.sql  esquema e migrations numeradas
  scripts/          manutenção pontual (rodar à mão)
docs/               deploy, Play Store, memória de decisões
scripts/            deploy.sh, build-apk.sh, build-release.sh
```

## 5. Regras de componentes

- Uma página por rota em `src/pages/`. Subcomponentes que só uma página usa podem ficar no mesmo arquivo; quando a página passa de ~800 linhas, extraia para `src/components/<domínio>/`.
- Componentes compartilhados de auth (fundo, logo, campos) devem viver em `src/components/auth/`, não copiados em cada página (hoje `AuthGlow`, `PasswordField`, `InputField` estão duplicados; não crie uma quarta cópia).
- Estado de servidor vive na página que o carrega; não crie store global sem necessidade demonstrada.
- Toda página autenticada deve checar `api.isLoggedIn()` no primeiro `useEffect` e redirecionar para `/login`. O `request()` em `api.ts` também redireciona em 401, mas a checagem local evita flash de conteúdo.
- Limpe todo `setInterval`, `addEventListener` e listener nativo no cleanup do `useEffect`.

## 6. Regras TypeScript

- `strict` está ligado e `tsc --noEmit` passa limpo. Mantenha assim: rode `npx tsc --noEmit -p axonweb/tsconfig.json` antes de concluir.
- Proibido `any`, `@ts-ignore`, `@ts-expect-error` e `as unknown as` para silenciar erro. Se o tipo está errado, corrija o tipo. Os poucos `as any` que existem em `Goals.tsx` e `Planning.tsx` são dívida, não padrão.
- Tipos das respostas da API vivem em `src/lib/api.ts`, ao lado da função que as busca. Se o backend mudar um campo, mude o tipo no mesmo commit.
- Arquivos novos em `.tsx`/`.ts`. Os `.jsx` restantes (landing, `Button.jsx`, `Card.jsx`) são legado.

## 7. Nomenclatura

- Backend: Python `snake_case`; serviços terminam em `_service.py`; routers têm o nome do recurso; erros de posse/validação são `ValueError` com mensagem em português que o router traduz para HTTP.
- Frontend: componentes `PascalCase`, hooks `useX`, helpers `camelCase`. Chaves de storage começam com `axon_`.
- Rotas em português onde já estão (`/voz`, `/rotinas`, `/objetivos`) e em inglês onde já estão (`/dashboard`, `/planning`). Não renomeie rotas existentes: o app instalado e os deep links dependem delas.
- Comentários em português, explicando o **porquê**. O código atual é referência de qualidade nisso.

## 8. Serviços e APIs

- Toda chamada HTTP do frontend passa por `src/lib/api.ts`. Nunca use `fetch` direto numa página. O helper `request()` cuida de token, `X-Timezone`, refresh em 401 e erros.
- Streaming (chat e voz) usa `streamSSE()` no mesmo arquivo.
- Novo endpoint no backend: router → schema Pydantic → função em `services/` que recebe `user_id`. O router nunca acessa `supabase` para regra de negócio complexa; só para leituras simples de perfil.
- Chamadas ao Claude ficam em `services/claude_service.py`. Extração estruturada (JSON) vai **sem** thinking; conversa vai com thinking adaptativo. Isso foi medido, não é preferência.
- Ferramentas do agente vivem em `services/agent_tools.py`. Toda tool recebe `user_id` do servidor, nunca do modelo. Tools de exclusão ficam fora do modo voz por padrão.

## 9. Supabase

- **Autenticação:** Supabase Auth (email/senha e Google via `sign_in_with_id_token`). O backend devolve `access_token` + `refresh_token`; o frontend guarda em `localStorage` (lembrar) ou `sessionStorage`.
- **Acesso ao banco:** só pelo backend, com `service_role`. Toda query filtra `user_id`.
- **RLS:** definida nas tabelas principais, mas não é exercida (service_role bypassa). Algumas tabelas internas não têm RLS. Trate RLS como defesa em profundidade: mantenha e adicione, mas nunca dependa dela.
- **Migrations:** numeradas em `backend/migrations.sql`, com comentário explicando o motivo. Aplique no SQL Editor do Supabase **antes** de reiniciar o backend. Nunca altere uma migration já aplicada; escreva a próxima.
- **Service role:** só em `backend/.env`. Nunca no frontend, nunca em docs, nunca em commit.
- **Anon key:** não é usada. Se um dia for, todas as tabelas precisam de RLS antes.
- **Storage:** bucket `avatars` é público para leitura; upload só via `/profile/avatar` autenticado.

## 10. Segurança (regras obrigatórias)

1. O frontend nunca é camada de autorização. Toda decisão de acesso acontece no backend.
2. Todo recurso pertence a um usuário. Toda leitura, atualização e exclusão filtra por `user_id`. Toda função nova em `services/` recebe `user_id` como primeiro argumento.
3. Ao inserir uma linha que referencia outra (ex.: mensagem → conversa, subtarefa → tarefa), verifique que a linha pai pertence ao usuário antes do insert.
4. `service_role` nunca aparece no browser, no bundle, em logs ou em docs.
5. Validação de entrada com Pydantic no backend. Limites de tamanho para texto (chat 4.000 chars, TTS 2.000, áudio 2 MB) e listas (histórico 50).
6. Rate limit em todo endpoint que custa dinheiro (IA, voz) ou que sofre brute force (auth). Use `limiter` (por IP) ou `chat_limiter` (por usuário).
7. Dados pessoais não vão para logs. `print` de diagnóstico não inclui conteúdo de mensagens, notas ou e-mail.
8. Endpoints de debug não existem em produção. Se precisar de um, condicione a `ENV == "development"`.
9. CORS em produção lista só as origens reais (`FRONTEND_URL`, `CORS_ORIGINS`). A regex do Codespace só entra em desenvolvimento.
10. Mensagens de erro para o usuário nunca incluem stack trace nem detalhe interno. `str(e)` de exceção só vai ao usuário quando é um `ValueError` de validação nossa.
11. Não coloque secrets em `docs/` nem em `.env.example` (só placeholders).

## 11. Design System

Tokens em `axonweb/src/styles/index.css` (`:root` claro, `.dark` escuro):

- **Roxo principal:** `--accent: #7b2cbf` (claro) / `#a855f7` (escuro); `--accent-strong`, `--accent-soft`, `--accent-muted`, `--accent-border`.
- **Fundos:** `--app-bg` (`#f7f2ff` / `#08070d`), `--app-bg-soft`; fundo das telas de auth e onboarding é `#2d0850`.
- **Superfícies (glassmorphism):** `--surface-base`, `--surface-elevated`, `--surface-muted`, com `backdrop-blur-sm/xl` e bordas `--border-soft`.
- **Texto:** `--text-primary`, `--text-secondary`, `--text-muted`, `--text-soft`.
- **Estados:** `--danger`, `--success` e variantes `-soft`.
- **Sombras:** `--shadow-soft`, `--shadow-card`.
- **Tipografia:** Inter Variable (`@fontsource-variable/inter`). Títulos `font-black` com `tracking-[-0.045em]`.
- **Raio:** `rounded-2xl` para cards e inputs, `rounded-full` para pills e botões redondos, `rounded-[1.65rem]` para cards de auth. Não invente novos valores arbitrários.
- **Botão primário:** `bg-[#7b2cbf] hover:bg-[#8d31dd] dark:bg-[#a855f7]`, `rounded-2xl`, `min-h-10`, `active:scale-[0.98]`.
- **Inputs:** borda `border-[#7b2cbf]/20`, fundo `#fbf8ff` / `#191722`, foco `border-[#7b2cbf]/45`.
- **Modais/sheets:** `components/ui/BottomSheet.tsx` e `ConfirmDialog.tsx`. Use-os; não crie um modal novo.
- **Ícones:** lucide-react, tamanho `h-4 w-4` em linha, `h-5 w-5` em botões.
- **Animações:** Framer Motion; entradas com `opacity`+`y`, duração 0,25 a 0,5s, `easeOut`.
- **Loading/empty/error:** `components/ui/EmptyState.tsx` para vazio; skeletons e spinners locais por página.
- **Prefira os tokens (`text-[var(--accent)]`, classes semânticas) a hex hardcoded.** O código atual tem centenas de `#7b2cbf` literais; não aumente esse número.

## 12. Responsividade

- Mobile-first. A largura de referência é ~430px. Só depois `sm:` e `lg:`.
- Bottom navigation (`BottomNav`) aparece só no app instalado; na web a navegação é a `Sidebar`.
- Safe areas do Android ficam atrás da classe `is-native` no `<html>` e se aplicam ao `<main>`.
- Telas desktop incompletas são trabalho em andamento, não bug. Não "corrija" o desktop mudando o mobile.

## 13. Performance

- Uma query ao Supabase custa ~105ms. Nunca faça query em loop por item; busque em lote com `in_()` e agrupe em memória (ver `routines_service.list_routines` como modelo).
- Não chame o Claude no caminho de abertura de tela sem cache. Padrão: cache em tabela (`axon_insights`, `axon_discoveries`, `weekly_reports`) com TTL.
- Novas rotas no frontend devem ser `React.lazy` (quando o code splitting for adotado; ver P2 do relatório).
- Imagens: WebP, no tamanho de exibição. Nada acima de ~150 KB em `src/assets`.
- Polling: um único lugar por tipo de dado. Antes de adicionar um `setInterval`, procure o que já existe (`NotificationToastProvider`, Dashboard).

## 14. Tratamento de erros

- Backend: `ValueError` para validação/posse (vira 400/404), `HTTPException` no router. Falhas de integrações secundárias (push, calendário, calibração, memória) são engolidas **de propósito e com comentário dizendo por quê**; não faça isso para o fluxo principal.
- Frontend: todo `await api.*` tem `try/catch` ou `.catch()`; erro vira estado visível (`setError`) ou toast. Sem `catch {}` vazio sem comentário.
- Streaming: um erro no meio do SSE emite um evento de texto com aviso e `[DONE]`; nunca deixa o cliente pendurado.
- Nunca mostre `stack trace` ao usuário.

## 15. Testes

- Backend: `cd backend && python3 tests_stt_vocabulary.py` (funções puras de voz). Não há runner; use `python3 <arquivo>`.
- Frontend: `cd axonweb && npx tsx src/lib/voice/voice.test.ts`.
- Funções que fazem cálculo (streak, insights, correlações, blocos de rotina) são puras e devem ganhar testes no mesmo estilo quando alteradas.
- Meta de curto prazo: Vitest no frontend e pytest no backend, rodando no CI. Até lá, o "teste" obrigatório é o checklist da seção 18.

## 16. Como adicionar uma nova funcionalidade

1. Leia o `AUDIT_REPORT.md` e os comentários do módulo mais próximo do que vai mudar.
2. Se precisar de coluna/tabela: escreva a próxima migration numerada em `backend/migrations.sql`, com o porquê. Aplique no Supabase antes do deploy.
3. Backend: schema Pydantic → função em `services/` (recebe `user_id`, filtra por ele) → rota no router com auth e rate limit se custar dinheiro.
4. Se o agente precisa da ação: adicione a tool em `agent_tools.py` chamando o **mesmo** service.
5. Frontend: função em `src/lib/api.ts` com tipo de resposta → uso na página com `try/catch` → estados de loading/vazio/erro.
6. Rode lint, typecheck e build. Teste o fluxo no navegador e, se tocar em algo nativo, no aparelho.
7. Atualize `docs/` ou este arquivo se a mudança introduzir uma regra nova.

## 17. O que NÃO fazer

- Não criar componente duplicado; procure em `components/` antes.
- Não adicionar biblioteca antes de verificar se já existe solução no projeto (há Framer Motion, Recharts, lucide, clsx, tailwind-merge).
- Não usar `any` só para silenciar o TypeScript.
- Não desabilitar regra de lint sem justificativa em comentário.
- Não colocar secrets no frontend, em docs ou em `.env.example`.
- Não acessar dados sem filtrar por `user_id`.
- Não remover arquivo só porque parece não usado; confirme imports dinâmicos, rotas e assets servidos por URL (ex.: `public/legal/`).
- Não mudar padrões visuais globais (tokens, raio, sombras) para corrigir uma tela.
- Não alterar RLS ou o cliente Supabase sem entender o modelo da seção 9.
- Não rodar um segundo backend contra o Supabase de produção (o scheduler duplicaria notificações e push para usuários reais).
- Não rodar scripts de `backend/scripts/` sem `--apply` consciente; há histórico de um backfill que moveu tarefas reais.
- Não commitar `node_modules`, `dist`, `.env`, keystores ou `google-services.json`.

## 18. Definition of Done

Antes de dar uma mudança por concluída:

- [ ] `cd axonweb && npm run lint` passa (ou o erro é pré-existente e documentado).
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json` passa.
- [ ] Testes existentes passam (`voice.test.ts`, `tests_stt_vocabulary.py`) e os novos, se houver.
- [ ] `cd axonweb && npm run build` passa sem novo aviso de chunk.
- [ ] Backend importa sem erro: `cd backend && python3 -c "import main"` (com `.env` presente).
- [ ] O fluxo alterado foi testado no navegador; no aparelho se tocou em nativo.
- [ ] Segurança revisada: toda query nova filtra `user_id`; nenhum endpoint novo sem auth; nenhum secret novo.
- [ ] Mobile revisado em ~400px; desktop revisado quando a tela já tem versão desktop.
- [ ] Console do navegador sem erros novos.
- [ ] Aba Network sem requests inesperados (loops, polling novo).
- [ ] Migration aplicada no Supabase antes do deploy do backend.
