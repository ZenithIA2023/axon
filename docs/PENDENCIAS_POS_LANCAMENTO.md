# Pendências para depois do lançamento

Consolidado em 2026-09-15 a partir de três análises: a auditoria técnica (`AUDIT_REPORT.md`), a verificação de segurança antiga e a análise do Fable de julho/2026. Tudo o que estava aqui e já foi corrigido saiu da lista. O que sobrou está agrupado por quem faz e por urgência.

Convenção: **[B]** Bernardo, **[F]** frontend (colega), **[BF]** os dois, **[VPS]** passo manual no servidor.

---

## 1. Antes de abrir para usuários reais

Bloqueiam uma experiência confiável. Fazer antes de divulgar.

- [ ] **[B] Recuperação de senha de verdade (SEC-002).** As telas `ForgotPassword` e `ResetPassword` simulam sucesso e não fazem nada. Passos: registrar `https://axonapp.tech/reset-password` em Supabase → Authentication → URL Configuration → Redirect URLs; criar `POST /auth/forgot-password` (usa `supabase_auth.auth.reset_password_for_email`) e `POST /auth/reset-password` (usa `admin.update_user_by_id`); ligar as duas telas. Enquanto não existir, o mínimo honesto é a tela avisar que a recuperação ainda não está disponível.
- [ ] **[B] Página de Termos de Uso.** O link no cadastro aponta para `#`. Falta o texto. Quando existir, salvar em `axonweb/public/legal/termos.html` e apontar o link em `Signup.tsx`.
- [ ] **[VPS] Conferir o `.env` de produção.** Precisa ter `ENV=production` e `FRONTEND_URL=https://axonapp.tech`. Se `ENV` estiver como `development`, o `/docs` fica aberto e o CORS aceita qualquer Codespace.
  ```
  grep -E "^(ENV|FRONTEND_URL|CORS_ORIGINS)=" /opt/axon-app/backend/.env
  ```
- [ ] **[VPS] Ativar `--proxy-headers` no systemd.** Sem isso o rate limit de login vê o IP do Nginx para todo mundo (um balde só). Editar o `ExecStart` do serviço conforme `docs/play-store/DEPLOY_VPS.md`, depois `systemctl daemon-reload && systemctl restart <serviço>`.
- [ ] **[BF] Paginação real de conversas.** Hoje a lista pede 50 (teto do backend). Quem passar de 50 conversas volta a ver conversas sumindo. Implementar paginação com `offset` no Chat ou subir o teto com busca no servidor.

---

## 2. Segurança e robustez (primeiras semanas)

Não bloqueiam o lançamento, mas ficam mais caros de fazer depois.

- [ ] **[B] Criptografar `google_refresh_token` e `google_access_token`** em `profiles`. Hoje em texto claro. Chave nova no `.env` (Fernet), migração dos valores existentes, leitura/escrita em `google_service.py`.
- [ ] **[B] Logs de auditoria.** Nenhum registro de login, falha de autenticação, exclusão de conta ou ação do agente. Decidir onde guardar (tabela `audit_log` ou stdout estruturado) e registrar pelo menos: login ok/falha por e-mail, refresh, delete de conta, tools destrutivas do agente.
- [ ] **[B] Validar JWT localmente** em `auth_helper.get_current_user`. Hoje cada request chama o Supabase Auth remotamente (latência e dependência de disponibilidade). Usar `SUPABASE_JWT_SECRET` (HS256) com `python-jose`, que já está nas dependências. Cuidado: tokens revogados só expiram no TTL.
- [ ] **[B] Avatar: validar os bytes do arquivo**, não só o `Content-Type`. `profile.py` confia no header do cliente e o bucket é público. Abrir com Pillow (já instalado) antes de subir.
- [ ] **[B] RLS e tabelas fora do repositório (C3).** `user_memories`, `daily_logs`, `notifications`, `routines`, `routine_items`, `axon_insights`, `device_tokens`, `weekly_reports` não têm SQL versionado, e várias tabelas não têm RLS. Exportar o schema real do Supabase para `supabase_schema.sql`, habilitar RLS com policy `auth.uid() = user_id` em todas. É defesa em profundidade: o backend continua sendo a única porta.
- [ ] **[B] Fixar versões no `requirements.txt`.** Nenhuma dependência tem `==`. Um build futuro pode puxar versão incompatível ou comprometida. `pip freeze` filtrado pelas 13 libs.
- [ ] **[B] OAuth do Google em memória.** `_pending_states`, `_pending_sessions`, `_pending_connects` em `google_service.py` são dicionários do processo. Quebram com 2 workers ou restart no meio do login. Mover para tabela quando for escalar.
- [ ] **[B] Higienizar `user_memories` no prompt.** Texto livre que o modelo grava volta ao system prompt. Impacto contido ao próprio usuário, mas vale limitar tamanho e tratar o bloco como dado não confiável.
- [ ] **[B] `supabase_auth` com anon key.** O cliente de auth usa service key sem precisar. Trocar por anon key; as chamadas `admin.*` (reset de senha, delete de conta) ficam no cliente de dados.
- [ ] **[B] Migrations pendentes.** Ver `pendencias-agosto-2026` e `ofensiva-registro-diario` na memória: Migration 24 e outras não aplicadas; `user_energy_profiles` não existia no banco (calibração nunca funcionou). Conferir no Supabase quais migrations de `migrations.sql` estão de fato aplicadas.

---

## 3. Performance (quando a base de usuários crescer)

- [ ] **[B] `daily_stats_service._fetch` sem filtro de data.** Carrega todas as tarefas do usuário desde sempre para congelar poucos dias. Filtrar por `scheduled_date >= (dia mais antigo pendente - margem)`.
- [ ] **[F] Planning carrega tudo e recarrega no clique.** `getTasks()` sem filtro no mount e `loadTasks()` + `loadSubtasks()` a cada toggle de checkbox. Com rotinas materializando 60 dias, cresce rápido. Filtrar por janela visível e atualizar só a tarefa afetada no toggle (a subtarefa já é otimista).
- [ ] **[B] Busca linear no agente.** `deletar_tarefa` lista todas as tarefas para achar uma; `deletar_rotina` computa streak de todas. Trocar por `select().eq("id", ...)`.
- [ ] **[B] `list_objectives` refaz `_counts` por objetivo.** Mesmo padrão N+1 já corrigido em conversas e rotinas.
- [ ] **[F] Polling de notificações a cada 15 s.** Decisão de 14/09 foi manter. Revisitar se o custo de backend aparecer: subir para 60 s ou checar `unread-count` antes da lista.
- [ ] **[F] Imagens do mascote e decorações (~3 MB).** Otimização com perda foi revertida por qualidade. Opção sem perda: WebP lossless preservando transparência, validado no navegador antes.
- [ ] **[B] Pré-gerar insights** fora do caminho de abertura da aba (ver `plano-pregerar-insights` na memória).

---

## 4. Arquitetura e limpeza (contínuo, sem pressa)

- [ ] **[F] Páginas monolíticas.** `Planning.tsx` 6.154 linhas e 74 `useState`, `Goals.tsx` 2.541, `Dashboard.tsx` 2.304, `Insights.tsx` 2.143, `Chat.tsx` 1.979. Extrair subcomponentes e hooks aos poucos, sem big-bang. Maior fonte de risco de regressão do projeto.
- [ ] **[BF] Testes automatizados.** Não há runner. Meta: Vitest no frontend, pytest no backend, rodando no CI. Começar pelas funções puras (streak, insights, correlações, blocos de rotina, voz) e pelos fluxos de auth e CRUD.
- [ ] **[F] Cores hardcoded.** `#7b2cbf` aparece 289 vezes, `#a855f7` 121. Migrar para os tokens (`--accent`, etc.) ao tocar em cada tela.
- [ ] **[F] `PasswordField` em 3 cópias com diferenças.** Unificar só depois de confirmar que as diferenças não são intencionais. `Header` de onboarding em 5 cópias.
- [ ] **[F] `toISODate` / `isTaskOnDate` duplicados** entre `Planning.tsx` e `Focus.tsx`. Extrair para `lib/`.
- [ ] **[B] `_CURVE_KEY` copiado em 5 arquivos.** Centralizar em `chronotype.py`.
- [ ] **[B] `@app.on_event` deprecado.** Migrar para `lifespan` no `main.py`.
- [ ] **[B] `POST /chat` (não streaming) e `claude_service.stream_chat`** sem uso. Remover quando confirmado que nada externo chama.
- [ ] **[F] Rota `/chat/axon-notifications` com notificações falsas.** ~250 linhas em `ChatConversation.tsx` (`systemNotifications`). Sem link de navegação; se alguém abrir a URL vê avisos inventados. Remover ou ligar à API real.
- [ ] **[F] Bolha do Axon invisível durante tool use sem texto.** `ChatConversation.tsx` filtra `item.text?.trim()`; chips de ferramenta só aparecem quando chega texto.
- [ ] **[F] `NotificationSettingsSheet.tsx`** restaurado a pedido: é o esqueleto da página de configurações que ainda não existe. Ligar quando a página nascer, ou remover.
- [ ] **[F] `?google=connected` que ninguém lê** (ver `axon-pendencias-fase4-e-avulsas`).
- [ ] **[B] Raio de borda com 11 valores customizados.** Padronizar numa escala.

---

## 5. Decisões de arquitetura (não são bugs; revisitar só se o contexto mudar)

- **service_role ignora RLS.** Escolha consciente. A proteção é o filtro por `user_id` em toda função de serviço, verificado sem vazamento em 14/09. A regra está no `AGENTS.md`.
- **Token em localStorage.** Cookie `httpOnly` exigiria reforma grande e complica o WebView do Capacitor. Risco aceito.
- **`/classify` público.** O questionário roda antes do cadastro. Tem rate limit desde 14/09.
- **3 vulnerabilidades `uuid` no `npm audit`.** Via `@capacitor/cli → xcode → uuid`; `xcode` é ferramenta de iOS, que o projeto não usa. `npm audit fix --force` faria downgrade do Capacitor. **Não corrigir.**
- **Mensagem "e-mail poderá ser reutilizado após N dias"** no cadastro confirma que o e-mail teve conta. Enumeração leve, intencional para o usuário entender o bloqueio.

---

## Nota sobre este arquivo

O repositório é público. Esta lista descreve lacunas em aberto. Se preferir não expor isso, mantenha o arquivo fora do git (`.gitignore`) ou torne o repositório privado.
