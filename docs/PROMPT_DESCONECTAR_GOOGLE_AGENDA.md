# Prompt — Desconectar o Google Agenda

Leia `AGENTS.md` antes de mexer em qualquer arquivo.

---

## Por que esta mudança existe

Hoje o usuário consegue **vincular** o Google Agenda, mas não consegue
desvincular. O `google_refresh_token` só é gravado — em
`backend/routers/google_auth.py:72` (vincular a agenda) e `:118` (login com
Google) — e nunca é apagado. Não existe endpoint nem botão.

Duas consequências:

1. Quem conecta fica conectado para sempre, a não ser que descubra sozinho o
   painel `myaccount.google.com/permissions`.
2. A tela de Configurações tem uma linha **"Integrações"** com o rótulo
   *"Em breve"* (`axonweb/src/pages/Settings.tsx:259`), e a faixa do Planning
   diz *"Depois será possível conectar o Google Calendar pelas configurações"* —
   as duas prometem algo que não existe.

A verificação do escopo `calendar.events` junto ao Google declara que o usuário
controla o acesso e pode desconectar quando quiser. Esta implementação torna a
declaração verdadeira.

## Decisão já tomada

**Os eventos que o AXON já criou no Google Agenda permanecem lá.** Desconectar
para a sincronização; não apaga nada. São compromissos reais do usuário, e
remover dezenas de eventos da agenda de alguém como efeito colateral de
"desconectar" seria destrutivo e nada óbvio.

A tela de confirmação precisa dizer isso com todas as letras.

## Nenhuma migration

A coluna `profiles.google_refresh_token` já existe. Desconectar é gravar NULL
nela. Não há tabela nem coluna nova.

---

## Fase 1 — Backend

### 1.1 Revogar do lado do Google

Em `backend/services/google_service.py`, junto das outras funções de OAuth:

```python
def revoke_token(refresh_token: str) -> None:
    """
    Invalida a autorização no Google (não só no nosso banco).

    Sem isto, "desconectar" apagaria o token daqui mas a concessão continuaria
    ativa na conta do usuário, e o app seguiria listado em
    myaccount.google.com/permissions como se tivesse acesso. Quem desconecta
    espera que o acesso acabe de verdade.
    """
    with httpx.Client() as client:
        client.post(
            "https://oauth2.googleapis.com/revoke",
            data={"token": refresh_token},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
```

**Não** use `raise_for_status()` aqui. Um token já expirado ou já revogado
devolve 400, e isso não é motivo para impedir o usuário de desconectar. Quem
chama trata como best-effort.

### 1.2 Endpoint

Em `backend/routers/google_auth.py`, autenticado como os demais:

```
DELETE /auth/google/connection
```

O que ele faz, nesta ordem:

1. Lê `google_refresh_token` do perfil (filtrando por `user_id`).
2. Se houver token, chama `google_service.revoke_token` dentro de `try/except`.
   Falha ali **não** interrompe o resto — o comentário deve dizer por quê: o
   usuário pediu para desconectar, e deixar o token gravado porque o Google não
   respondeu seria o pior dos dois mundos.
3. Grava no perfil:
   - `google_refresh_token = None`
   - `calendar_setup_choice = "independent"`
4. Devolve o perfil atualizado (`ProfileResponse`), para o frontend não precisar
   de uma segunda chamada.

**Por que `"independent"` e não `None`:** `NULL` significa "ainda não escolheu" e
faria a pergunta *"Como você quer usar sua agenda?"* reaparecer no Planning.
Quem acabou de desconectar **escolheu** não usar o Google — `"independent"` é o
estado correto, e é o que a faixa da tela vai refletir.

Se não houver token, responda 200 assim mesmo (idempotente): desconectar algo já
desconectado não é erro.

### 1.3 Expor o estado da conexão

`ProfileResponse` em `backend/models/schemas.py` não diz se o Google está
conectado. Adicione:

```python
google_connected: bool = False
```

Preencha em `_build_profile_response` (`backend/routers/profile.py:52`) com
`bool(data.get("google_refresh_token"))`. O `_fetch_profile_data` já traz essa
coluna — foi incluída na Migration 35.

> ⚠️ **Nunca** devolva o token em si. Só o booleano.

> ⚠️ Campo não declarado no schema é filtrado em silêncio pelo Pydantic e nunca
> chega ao frontend. Se `google_connected` voltar sempre `false`, é aqui.

### 1.4 O que acontece com as tarefas já sincronizadas

Nada. `tasks.google_event_id` **permanece** — é coerente com a decisão de manter
os eventos. `calendar_sync._sync` já retorna cedo quando não há refresh token
(`if not refresh_token: return`), então nenhuma chamada ao Google é feita
enquanto o usuário estiver desconectado. Se ele reconectar **a mesma conta**, os
ids continuam válidos e a sincronização volta a funcionar.

**Limitação conhecida, a registrar em comentário:** se o usuário reconectar uma
conta Google **diferente**, os `google_event_id` antigos apontam para eventos que
não existem naquela conta. As atualizações falhariam em silêncio (o `_sync`
engole exceção de propósito). Não trate agora; deixe documentado.

---

## Fase 2 — Frontend

### 2.1 `axonweb/src/lib/api.ts`

- Adicione `google_connected: boolean` ao tipo de resposta de `getProfile`, ao
  lado da função (seção 6 do `AGENTS.md`).
- Crie a função que chama `DELETE /auth/google/connection` e devolve o perfil
  atualizado.

### 2.2 `axonweb/src/pages/Settings.tsx`

A linha **"Integrações"** (linha 259) hoje é um placeholder com `value="Em breve"`.
Transforme-a na funcionalidade real:

- `value` passa a ser **"Conectado"** ou **"Não conectado"**, conforme
  `google_connected` do perfil.
- `description` continua descrevendo a integração; ajuste o texto para citar o
  Google Agenda.
- Quando conectado, tocar na linha abre a confirmação de desconexão.
- Quando não conectado, a linha não precisa fazer nada (ou leva ao Planning,
  onde a vinculação acontece). Escolha uma e comente a decisão.

**Use o `ConfirmDialog` que já existe** (`components/ui/ConfirmDialog.tsx`). O
`AGENTS.md` seção 11 é explícito: não crie modal novo. Veja como
`Settings.tsx:345` já o usa para "Sair da conta".

Texto da confirmação:

> **Desconectar o Google Agenda?**
>
> O Axon deixará de criar e atualizar eventos na sua agenda. Os eventos já
> criados permanecem no Google Agenda.

Botão de confirmação com a variante de perigo, como o de sair da conta.

Depois de confirmar: `try/catch` obrigatório (seção 14 do `AGENTS.md`). Sucesso
→ atualize o estado local e mostre o toast que a página já usa. Falha → erro
visível; não mude o estado.

### 2.3 `axonweb/src/pages/Planning.tsx` — coerência da faixa

A faixa "Google Calendar selecionado" (por volta da linha 1013) é renderizada
quando `calendarSetupChoice === "google"`. Depois de desconectar pelas
Configurações, o backend passa a devolver `"independent"`, então a faixa correta
aparece **na próxima carga** da página.

Se o usuário navegar de Configurações para Planejamento sem recarregar, a tela
pode ficar com o estado antigo. Garanta que o Planning releia o perfil ao montar
— o `useEffect` que já faz isso (linha ~655) cobre o caso, mas **confirme** que
ele roda na navegação entre abas internas, e não só no primeiro carregamento.

O texto da faixa "independente" já existe e diz que será possível conectar pelas
configurações. Isso continua verdade.

---

## Verificação

1. Conta com o Google conectado → Configurações → "Integrações" mostra
   **"Conectado"**.
2. Tocar na linha → o diálogo aparece com o texto acima, mencionando que os
   eventos permanecem.
3. Cancelar → nada muda; a linha continua "Conectado".
4. Confirmar → a linha vira **"Não conectado"** e o toast de sucesso aparece.
5. Abrir o Google Agenda no navegador → **os eventos criados antes continuam
   lá**. Esta é a decisão de produto; se sumirem, é bug.
6. `myaccount.google.com/permissions` → o AXON **não aparece mais** na lista, ou
   aparece sem o acesso ao Calendar. Prova que a revogação funcionou de verdade.
7. Ir para Planejamento → a faixa mostra o calendário independente, **não** a
   pergunta "Como você quer usar sua agenda?".
8. Criar uma tarefa nova → **nenhum** evento aparece no Google Agenda, e nenhum
   erro no console.
9. Vincular de novo pelo Planning → fluxo completo do Google funciona, a linha
   volta a "Conectado", e uma tarefa nova volta a virar evento.
10. Desconectar duas vezes seguidas (recarregando entre elas) → a segunda
    responde 200 sem erro.
11. Com o backend desligado, confirmar a desconexão → erro visível na tela, e a
    linha **não** muda para "Não conectado".
12. Conferir no Supabase que `google_refresh_token` ficou NULL e
    `calendar_setup_choice` virou `independent` — para o usuário certo, e só
    para ele.

## Definition of Done

Checklist da seção 18 do `AGENTS.md`:

- `cd axonweb && npm run lint`
- `cd axonweb && npx tsc --noEmit -p tsconfig.json`
- `cd axonweb && npm run build`
- `cd backend && python3 -c "import main"`
- Mobile revisado em ~400px (as Configurações são uma tela de celular antes de
  tudo)
- Console do navegador sem erro novo
- Nenhuma query nova sem filtro de `user_id`
- **Nenhum token do Google em log, resposta ou mensagem de erro**

Sem migration. Se você criou conta de teste para verificar, apague ao terminar,
inclusive o que derivou dela.
