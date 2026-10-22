# Prompt — Fase 3: CI de build iOS no GitHub Actions

Implemente a Fase 3 do `docs/PLANO_IOS.md`. Leia o `AGENTS.md` antes de mexer em
qualquer coisa.

## Objetivo

O repositório não tem como compilar iOS: o Codespace é Linux e o Xcode só roda em
macOS. Esta fase cria **o primeiro workflow do GitHub Actions do projeto**, que
aluga um runner macOS, monta o `.ipa` e envia para o TestFlight.

Não existe `.github/` no repositório hoje. Você está criando a pasta.

## Contexto que você não deve redescobrir

A Fase 2 foi executada em 22/10/2026 e `axonweb/ios/` já existe. Cinco coisas
foram medidas e valem como fato:

1. **NÃO existe CocoaPods.** O Capacitor 8 usa **Swift Package Manager**:
   `ios/App/CapApp-SPM/Package.swift`, nenhum `Podfile`. Qualquer instrução de
   `pod install` que você encontre em tutorial ou em versão antiga do plano está
   errada para este projeto.
2. **Não existe scheme compartilhado**, e isso quebra o build. Ver abaixo.
3. **O alvo mínimo de iOS está errado** (15.0, deveria ser 16.4). Ver abaixo.
4. O projeto fica em `axonweb/ios/App/App.xcodeproj`. Não há `.xcworkspace`
   próprio (só o interno do `.xcodeproj`), então use `-project`, não `-workspace`.
5. `TARGETED_DEVICE_FAMILY = "1"` — iPhone-only, decidido. Não mexa.

## Tarefa 1 — Criar o scheme compartilhado

`npx cap add ios` não gera scheme compartilhado. O Xcode cria um quando alguém
abre o projeto, mas grava em `xcuserdata/`, que é por usuário e ignorado pelo
Git. **No runner macOS, máquina limpa, `xcodebuild -scheme App` falha com
"scheme not found".**

Crie `axonweb/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`,
apontando para o target `App`, com ação de `archive` configurada para a
configuração `Release`.

O `ios/.gitignore` do Capacitor ignora `xcuserdata` mas **não** `xcshareddata` —
confirme com `git check-ignore` que o arquivo novo é rastreado. Se não for, o
runner não o verá e o build falha pelo mesmo motivo.

## Tarefa 2 — Subir o alvo mínimo de iOS para 16.4

Em `axonweb/ios/App/App.xcodeproj/project.pbxproj`, trocar todas as ocorrências:

```
IPHONEOS_DEPLOYMENT_TARGET = 15.0;   →   IPHONEOS_DEPLOYMENT_TARGET = 16.4;
```

**Por que** (foi medido, não é preferência): o CSS que o `npm run build` gera usa
`color-mix()` em 736 lugares e `@property` em 75. O Tailwind v4 tem como base o
Safari 16.4, e usa `color-mix()` em toda cor com transparência — cada
`text-white/62`, cada borda `/20`, todo o glassmorphism. Em iOS 15 essas
declarações são descartadas e o app abre sem cor de texto, sem borda e sem fundo
de cartão.

Com o alvo em 15.0 a App Store ofereceria o download para iOS 15.0–16.3 e essas
pessoas instalariam um app quebrado.

Acrescente um comentário no `capacitor.config.ts` ou num `README` do `ios/`
registrando o motivo, para ninguém rebaixar o número depois achando que ganha
alcance.

## Tarefa 3 — O workflow

Crie `.github/workflows/ios.yml`.

### Gatilho

```yaml
on:
  workflow_dispatch:
```

**Nunca `on: push`.** Runner macOS gasta 10× por minuto; a cota equivale a ~200
minutos reais de macOS por mês, ou 10 a 15 builds. Gatilho automático queima tudo
numa tarde.

Ofereça um `input` booleano `somente_resolver` (padrão `false`): quando `true`, o
workflow para depois da tarefa 4 abaixo. É o teste de fumaça de 2 minutos.

### Passos, em ordem

1. `actions/checkout`
2. Node + `npm ci` em `axonweb/`
3. `VITE_API_URL=https://api.axonapp.tech npm run build`
4. **Resolver os pacotes Swift e provar que o scheme existe:**
   ```bash
   xcodebuild -resolvePackageDependencies \
     -project axonweb/ios/App/App.xcodeproj -scheme App
   xcodebuild -list -project axonweb/ios/App/App.xcodeproj
   ```
   Se `somente_resolver` for `true`, encerrar aqui com sucesso.
5. `npx cap sync ios`
6. Instalar certificado e provisioning profile a partir dos secrets, numa
   keychain temporária criada no job (nunca na keychain padrão)
7. `xcodebuild archive` e `xcodebuild -exportArchive` → `.ipa`
8. Enviar ao TestFlight com a chave de API do App Store Connect
9. Publicar o `.ipa` como artifact do job, para dar para baixar sem depender do
   TestFlight quando algo der errado

### As quatro recusas, copiadas do Android

`scripts/build-release.sh` recusa a build em quatro situações, todas testadas em
produção. **Replique a mesma lógica no início do workflow**, falhando o job antes
de gastar minuto de macOS:

| Situação | Resultado |
|---|---|
| `CAP_SERVER_URL` definida | ❌ recusa — app publicado apontando para dev é falha de segurança grave |
| `VITE_API_URL` com `localhost`, `127.0.0.1` ou `github.dev` | ❌ recusa |
| `VITE_API_URL` ausente | ❌ recusa |
| Certificado ausente nos secrets | ❌ recusa |

Leia `scripts/build-release.sh` antes de escrever: ele é o modelo, e tem uma
quinta conferência que vale copiar — depois do `cap sync`, verificar que o
`capacitor.config.json` nativo saiu **sem** `server.url`:

```bash
grep -q '"url"' axonweb/ios/App/App/capacitor.config.json && exit 1
```

### Secrets (o Bernardo cria; você só consome)

```
APPLE_CERTIFICATE_P12         .p12 de distribuição, em base64
APPLE_CERTIFICATE_PASSWORD
APPLE_PROVISIONING_PROFILE    .mobileprovision, em base64
APPSTORE_API_KEY_ID
APPSTORE_API_ISSUER_ID
APPSTORE_API_PRIVATE_KEY      o .p8, em base64
```

Nunca escreva nenhum desses valores em arquivo, log ou comentário. Não imprima
nomes de variáveis em diagnóstico: um `.p8` colado sem fechar aspas já virou
nome de variável e vazou num log neste projeto.

## O que NÃO tocar

- `scripts/build-release.sh` e qualquer coisa de `axonweb/android/` — o Android
  está publicado e funcionando
- `axonweb/src/` — nenhuma mudança de frontend nesta fase
- `backend/` — nada
- O `TARGETED_DEVICE_FAMILY` e o bloco `ios` do `capacitor.config.ts`
- O condicional `CAP_SERVER_URL` do `capacitor.config.ts`: é a proteção que
  impede release apontar para dev. Não simplifique.

## Verificação

Antes de considerar pronto:

- [ ] `git check-ignore` confirma que o `App.xcscheme` **não** está ignorado
- [ ] `grep -c "15.0" axonweb/ios/App/App.xcodeproj/project.pbxproj` devolve 0
      para `IPHONEOS_DEPLOYMENT_TARGET`
- [ ] `cd axonweb && npm run lint` passa
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json` passa
- [ ] `cd axonweb && npm run build` passa
- [ ] `cd backend && python3 -c "import main"` passa
- [ ] O YAML é válido (`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ios.yml'))"`)
- [ ] As quatro recusas estão no workflow e cada uma falha o job **antes** de
      qualquer passo que use o runner macOS para compilar

Você **não consegue testar o workflow** — ele só roda no GitHub, com os secrets,
e cada execução custa minutos de uma cota pequena. Por isso o `somente_resolver`
existe: a primeira execução real vai ser com ele em `true`.

## Entrega

**Não commite.** O Bernardo faz os commits.

Ao terminar, diga em uma lista curta: os arquivos criados ou alterados, e o que
o Bernardo precisa fazer antes de apertar o botão (criar os 6 secrets, e rodar
primeiro com `somente_resolver = true`).
