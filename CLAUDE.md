# CLAUDE.md

O manual de arquitetura, segurança, design system e Definition of Done é o `AGENTS.md`. Ele vale integralmente aqui e não é repetido neste arquivo:

@AGENTS.md

Este arquivo cobre só o que falta lá: comandos, variáveis de ambiente, mapa rápido do código e cuidados operacionais.

---

## Comandos

Da raiz do repositório (`package.json` da raiz usa `concurrently`):

```bash
npm run dev          # frontend (Vite :5173) + backend (uvicorn :8000 --reload)
npm run dev:front    # só o frontend
npm run dev:back     # só o backend
npm run build        # build de produção do frontend
npm run preview      # serve o build — use para medir performance (ver AGENTS.md §13)
```

Em `axonweb/`:

```bash
npm run lint
npx tsc --noEmit -p tsconfig.json
npx tsx src/lib/voice/voice.test.ts
npm run android:sync     # vite build + cap sync android
```

Em `backend/`:

```bash
python3 -c "import main"          # checagem de import (precisa do .env)
python3 tests_stt_vocabulary.py   # testes das funções puras de voz
```

Não há pytest nem Vitest: cada arquivo de teste roda com `python3 <arquivo>` ou `npx tsx <arquivo>`.

Scripts de entrega em `scripts/` (todos pedem ação humana e mexem em produção ou no aparelho):

- `deploy.sh [site|backend]`: o site sobe o build **local**; o backend faz `git pull` no VPS. Sem commit+push, os dois ficam em versões diferentes.
- `build-apk.sh`: APK de debug apontando para `api.axonapp.tech`.
- `build-release.sh`: AAB da Play Store.

## Variáveis de ambiente

Backend (`backend/.env`, nunca commitado):

- Obrigatórias: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`.
- Ambiente/CORS: `ENV` (padrão `production`; `development` libera a regex do Codespace), `FRONTEND_URL`, `CORS_ORIGINS`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GCP_PROJECT_ID`.
- Push: `FIREBASE_CREDENTIALS_JSON` ou `FIREBASE_CREDENTIALS_PATH`.
- Voz: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY` e os ajustes `VOICE_*`, `*_STT_MODEL`, `*_TTS_MODEL`.

Frontend: `VITE_API_URL` (URL do backend). `VITE_BUILD_COMMIT` é carimbado pelo `vite.config.ts` a partir do `git rev-parse`.

Android (live reload): `CAP_SERVER_URL` liga `server.url` no `capacitor.config.ts`. Nunca defina essa variável num build de release.

## Mapa rápido

- **Entrada do backend:** `backend/main.py` registra os 19 routers, os middlewares de segurança e o APScheduler (`planning_scheduler.run` a cada 5 min).
- **Modelo do Claude:** constante `_MODEL` em `backend/services/claude_service.py`. Prompts em `services/prompts.py`; contexto do chat em `services/chat_context.py`.
- **Esquema do banco:** `backend/supabase_schema.sql` (base) + `backend/migrations.sql` (numeradas; a última é a 34). A próxima migration é a 35.
- **Frontend:** rotas em `axonweb/src/app/App.tsx`; todo HTTP em `axonweb/src/lib/api.ts` (~2.100 linhas; procure a função existente antes de criar outra). Alias `@` → `axonweb/src`.
- **Arquivos grandes:** `Planning.tsx` (~6.500 linhas), `Goals.tsx`, `Dashboard.tsx`, `Insights.tsx`, `Routines.tsx`, `Chat.tsx` (2.000+ cada). Leia por trechos com `offset`/`limit` e use `grep` para achar o ponto certo.
- **Integração nativa:** `src/lib/nativeAuth.ts` (OAuth por deep link), `push.ts` (FCM), `nativeBack.ts` (botão voltar). Plugin nativo novo não chega por live reload; exige rebuild do APK.
- **Docs:** `docs/` tem guias de publicação e prompts de handoff; `AUDIT_REPORT.md` é a auditoria que motivou o `AGENTS.md`.

## Cuidados operacionais

- **Não commite.** O Bernardo faz os commits. "Deixar pronto" não inclui `git commit` nem `push`.
- **Não suba um segundo backend contra o Supabase de produção.** O scheduler duplicaria notificações e push para usuários reais. O `npm run dev:back` local usa o mesmo `.env`; se ele aponta para produção, trate-o com esse cuidado.
- **Delete e update em lote:** confira o alcance (`select` com o mesmo filtro) antes de executar.
- **Dados de teste** criados em conta real são apagados ao terminar, incluindo o que derivou deles (stats, insights, notificações).
- **Teste o caminho real.** `tsc` e `import main` não pegam erro de chamada nem de regra; exercite o endpoint ou a tela alterada.
- **Migration nova** é aplicada à mão no SQL Editor do Supabase antes de reiniciar o backend. Avise o usuário quando houver uma pendente.
- **Custo de API:** qualquer chamada nova ao Claude ou à voz precisa de rate limit e, se estiver no caminho de abertura de tela, de cache com TTL.
- Comentários e mensagens de erro em português, como no resto do código.
