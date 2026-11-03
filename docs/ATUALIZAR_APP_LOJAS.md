# Atualizar o app nas lojas (Android + iOS)

Roteiro para **repetir sempre** que uma leva de alterações tiver que chegar ao
celular. Última revisão: 25/10/2026.

Este arquivo cobre **a loja**. Para publicar site e backend no dia a dia, ou
gerar um APK de teste à mão, o arquivo é o `docs/COMO_PUBLICAR.md`. A primeira
publicação na Play Store (criar o app, ficha, OAuth) está em
`docs/play-store/PASSO_A_PASSO.md`.

---

## Primeiro: você precisa mesmo de build nova?

O AXON tem **três destinos independentes**, e eles não se atualizam juntos:

| Mudou em | Chega ao usuário com | Demora |
|---|---|---|
| `backend/` | `./scripts/deploy.sh backend` | segundos |
| `axonweb/src/` **no site** | `./scripts/deploy.sh site` | segundos |
| `axonweb/src/` **no app** | **build nova nas lojas** | horas a dias |

A interface do app vai **empacotada dentro** do APK/IPA. Nenhuma mudança de
frontend chega a quem já instalou sem uma build nova.

> **Não esqueça o backend.** Quando a leva mexe nos dois lados, o deploy do
> backend é o que faz a parte dele aparecer. Exemplo real: o texto novo do erro
> de login mora em `backend/routers/auth.py` — sem `deploy.sh backend`, o app
> novo continua mostrando o texto antigo.

---

## Antes de começar (3 minutos)

```bash
cd /workspaces/AxonWeb

# 1. Tudo commitado e enviado? O iOS compila a partir do GitHub.
git status --short
git push

# 2. O app vai apontar para o backend de produção?
echo "${VITE_API_URL:-vazio}"

# 3. Live reload tem que estar DESLIGADO.
unset CAP_SERVER_URL
```

E duas conferências que não são de comando:

- **Migration pendente?** Se a leva criou uma, aplique o SQL no Supabase
  **antes** de reiniciar o backend.
- **Plugin nativo novo** (`@capacitor/...`)? Então quem for testar precisa
  **desinstalar** o app antes de instalar a build nova. Código nativo novo não
  sobrescreve o antigo de forma confiável e o plugin falha em silêncio.

---

## Passo 1 — Subir os números da versão

É o único passo que exige decisão, e é onde dá erro com mais frequência:
**as duas lojas recusam uma build com número repetido.**

Cada plataforma tem dois números:

| | Número que o usuário vê | Número interno da build |
|---|---|---|
| **Android** | `versionName` (hoje `1.2`) | `versionCode` (hoje `4`) |
| **iOS** | `MARKETING_VERSION` (hoje `1.0`) | `CURRENT_PROJECT_VERSION` |

### Android — obrigatório, na mão

Em `axonweb/android/app/build.gradle` (linhas 13-14):

```gradle
versionCode 5          // SEMPRE +1. A Play Console recusa repetido.
versionName "1.3"      // só quando a mudança é visível para o usuário
```

Acima do `versionCode` existe um comentário descrevendo o que entrou naquela
versão. **Mantenha essa anotação** — é o histórico que diz qual número levou o
quê.

### iOS — o número da build é automático

O workflow usa o número da execução do GitHub Actions como build
(`CURRENT_PROJECT_VERSION=${{ github.run_number }}`, `ios.yml:240`). **Você não
precisa mexer em nada** para cada envio ao TestFlight.

O `MARKETING_VERSION` (o `1.0`) está fixo no projeto Xcode e **não** é
sobrescrito pelo workflow. Mude só quando for publicar uma versão nova de
verdade para o público; para rodadas de teste no TestFlight, deixe como está.

> Os números das duas lojas **não precisam bater** e hoje não batem (Android
> 1.2, iOS 1.0). Isso é normal, mas quando o app for a público nas duas, vale
> alinhar o `versionName` e o `MARKETING_VERSION` para não se confundir depois.

---

## Passo 2 — Android (Play Store)

Tudo acontece no Codespace. **Tempo:** ~10 min de build.

```bash
cd /workspaces/AxonWeb
unset CAP_SERVER_URL
export VITE_API_URL=https://api.axonapp.tech
./scripts/build-release.sh
```

O script faz as recusas de segurança, o build do frontend, o `cap sync android`
e gera o AAB assinado. Ele **para com erro** se o live reload estiver ligado, se
a `VITE_API_URL` apontar para desenvolvimento ou se faltar a keystore — são
proteções, não bugs.

O arquivo sai em:

```
axonweb/android/app/build/outputs/bundle/release/app-release.aab
```

Baixe pelo VS Code: botão direito no arquivo → **Download**.

Na **Play Console**:

1. **Teste → Teste interno → Criar versão**
2. Envie o `app-release.aab`
3. Escreva as notas da versão (o que mudou)
4. **Revisar versão → Iniciar lançamento**

O teste interno libera em minutos ou poucas horas. Quando estiver satisfeito,
o mesmo AAB sobe para **Produção → Criar versão**, que passa por revisão do
Google (horas a ~3 dias).

> O APK de debug e o da loja usam a mesma `applicationId` com assinaturas
> diferentes. O Android recusa instalar um por cima do outro ("App not
> installed"). Desinstale o que estiver no aparelho antes.

---

## Passo 3 — iOS (TestFlight / App Store)

O Codespace é Linux e o Xcode só roda em macOS, então **a build do iOS sai do
GitHub Actions**, não daqui. Você não precisa de um Mac.

1. **Garanta que o código está no GitHub.** O workflow compila o que está na
   branch escolhida; o que ficou só no Codespace não entra.

   ```bash
   git push
   ```

2. No GitHub: aba **Actions** → workflow **"iOS — build e TestFlight"** →
   botão **Run workflow**.

3. Escolha a **branch** com a leva que você quer testar.

4. **Deixe `somente_resolver` DESMARCADO.** Marcado, ele faz só um teste de
   fumaça de ~2 minutos, sem assinar nem compilar — útil para validar o
   workflow, inútil para gerar build.

5. Rode e espere. A execução completa leva **cerca de 10 minutos**.

O workflow faz tudo sozinho: `npm ci`, build do frontend, `cap sync ios`,
instala o certificado e o perfil, compila, assina, exporta o `.ipa` e envia ao
TestFlight. O `.ipa` também fica como artifact por 14 dias, para o caso de o
envio falhar e a build não precisar ser refeita.

Depois, no **App Store Connect**:

- **TestFlight** → a build aparece como *"Processing"* por 5 a 15 minutos e
  depois vira **Ready to Submit**.
- Os testadores recebem a notificação no app TestFlight do iPhone e instalam
  por lá.

> ⚠️ **Minuto de macOS é caro.** O runner macOS gasta **10× por minuto** da
> cota, e dá para ~10 a 15 builds por mês. O gatilho é manual de propósito:
> **nunca** troque o workflow para `on: push`. Se for só conferir se o workflow
> está de pé, use o `somente_resolver`, que roda em 2 minutos.

---

## Passo 4 — Backend e site, se a leva mexeu neles

```bash
git push
./scripts/deploy.sh            # site + backend
./scripts/deploy.sh backend    # só o backend
./scripts/deploy.sh site       # só o site
```

Faça isso **junto** com a build da loja, não depois de uma semana: um app novo
falando com um backend antigo é a fonte mais comum de "funcionava ontem".

---

## Passo 5 — Conferir que deu certo

```bash
curl https://axonapp.tech          # site no ar
curl https://api.axonapp.tech      # {"status":"ok"}
```

No aparelho, depois de instalar:

1. **Configurações → Sobre:** confirma a versão e o commit que você acabou de
   publicar. É a forma mais direta de saber se o aparelho pegou a build nova
   ou continua na antiga.
2. **Login** com e-mail e com Google/Apple.
3. O que a leva mudou, especificamente.
4. Console/comportamento das telas que você tocou.

---

## Problemas comuns

**"Version code 4 has already been used"** (Play Console)
Você esqueceu de subir o `versionCode`. Suba, rode o `build-release.sh` de
novo e envie o AAB novo.

**O TestFlight recusa a build por `CFBundleVersion` repetido**
Não deve acontecer, porque o número vem da execução do Actions. Se acontecer,
é sinal de que alguém fixou o `CURRENT_PROJECT_VERSION` no projeto Xcode.

**O app instalado não mostra as mudanças**
Vá em **Configurações → Sobre** e compare o commit com o que você publicou.
Igual? Então a mudança não estava na build — provavelmente faltou `git push`
antes de rodar o workflow. Diferente? O aparelho ainda está na build antiga.

**Mudei o backend e o app continua igual**
Falta `./scripts/deploy.sh backend`. E confirme o commit que chegou lá:
`ssh root@... 'git -C /opt/axon-app log --oneline -1'`.

**O workflow do iOS não aparece na aba Actions**
Workflow com `workflow_dispatch` só aparece quando o arquivo está na branch
padrão (`main`). Se você mexeu no `ios.yml` numa branch, ele só vira botão
depois do merge.

**O `build-release.sh` falha com "Unsupported class file major version"**
O script já impõe o JDK 21; se esse erro aparecer, o JDK 21 saiu do caminho
esperado (`/usr/local/sdkman/candidates/java/21.0.10-ms`). O Gradle 8.14 não
suporta o JDK 25 que o Codespace exporta por padrão.

**Login com Google para de funcionar só na versão da loja**
O app publicado é assinado com o certificado do **Play App Signing**, que tem
um SHA-1 diferente do seu. Pegue o SHA-1 em **Play Console → Configuração →
Integridade do app** e adicione no cliente Android do Google Cloud Console.

---

## Referência rápida

```bash
# Android
unset CAP_SERVER_URL
export VITE_API_URL=https://api.axonapp.tech
./scripts/build-release.sh
# → axonweb/android/app/build/outputs/bundle/release/app-release.aab
# → Play Console → Teste interno → Criar versão

# iOS
git push
# → GitHub → Actions → "iOS — build e TestFlight" → Run workflow
#   (branch certa, somente_resolver DESMARCADO) → ~10 min
# → App Store Connect → TestFlight

# Backend e site
./scripts/deploy.sh
```

| | Android | iOS |
|---|---|---|
| Onde compila | Codespace | GitHub Actions |
| Tempo | ~10 min | ~10 min |
| Número da build | **na mão** (`versionCode`) | automático |
| Custo | — | 10× da cota de Actions |
| Entrega | Play Console | App Store Connect |

**Validade dos certificados iOS: 22/10/2027.** Certificado de distribuição e
perfil de provisionamento vencem no mesmo dia; depois disso, nenhuma build iOS
sai até renovar os dois e atualizar os secrets do repositório.
