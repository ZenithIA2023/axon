# Prompt — Ajustes pós-primeira execução do CI iOS

Dois ajustes pequenos no projeto iOS e no workflow, depois do primeiro
`workflow_dispatch` com `somente_resolver = true` (23/10/2026, sucesso em 1m18s).
Leia o `AGENTS.md` antes de mexer em qualquer coisa.

## Contexto que você não deve redescobrir

- A Fase 3 está feita e commitada na `main`: `.github/workflows/ios.yml`, o
  scheme compartilhado `App.xcscheme`, `IPHONEOS_DEPLOYMENT_TARGET = 16.4` e o
  `axonweb/ios/README.md`.
- O teste de fumaça passou: `npm ci` funciona em máquina limpa e o
  `xcodebuild -resolvePackageDependencies -scheme App` acha o scheme.
- A próxima execução é a build completa, que assina e envia ao TestFlight.
  Estes dois ajustes existem para ela não tropeçar.

## Tarefa 1 — Declarar a isenção de criptografia no Info.plist

Em `axonweb/ios/App/App/Info.plist`, acrescente:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

**Por que:** sem essa chave, todo build que chega ao TestFlight fica retido com
"Missing Compliance" e **nenhum testador consegue instalar** até alguém
responder à mão, no App Store Connect, uma pergunta sobre exportação de
criptografia. Acontece em **todo** build, não só no primeiro.

O valor `false` é a declaração correta para o AXON: o app não implementa
criptografia própria e usa apenas HTTPS fornecido pelo sistema, que é isento.

Acrescente um comentário XML acima da chave explicando isso, no padrão dos
outros comentários do arquivo (as três `NS*UsageDescription` já têm).

## Tarefa 2 — Atualizar as actions para a v5

Em `.github/workflows/ios.yml`:

```
actions/checkout@v4    →  actions/checkout@v5
actions/setup-node@v4  →  actions/setup-node@v5
```

**Por que:** a primeira execução emitiu o aviso *"Node.js 20 is deprecated. The
following actions target Node.js 20 but are being forced to run on Node.js 24:
actions/checkout@v4, actions/setup-node@v4"*. É o runtime interno das actions,
não o Node do projeto (que é 24 e está correto). Hoje é só aviso; quando o
GitHub remover o Node 20, vira falha.

Não mexa no `node-version: 24` do `setup-node` — esse é o Node do projeto e
está certo.

`actions/upload-artifact@v4` **não** apareceu no aviso. Confira antes de mexer:
se não estiver na lista do aviso, deixe como está.

## Tarefa 3 — Parar o crash do `xcodebuild -version` no log

No passo **"Selecionar e conferir o Xcode"** do `.github/workflows/ios.yml`,
troque a linha que calcula a versão maior:

```bash
major="$(xcodebuild -version | head -1 | awk '{print $2}' | cut -d. -f1)"
```

por uma que **consuma a saída inteira**, por exemplo:

```bash
major="$(xcodebuild -version | awk 'NR==1 { split($2, v, "."); print v[1] }')"
```

**Por que:** o `head -1` fecha o cano depois da primeira linha. O `xcodebuild`
tenta escrever a segunda (`Build version 17F113`), encontra o descritor
fechado e, em vez de tratar o SIGPIPE, estoura uma
`NSFileHandleOperationException` com pilha completa no log. Observado na
execução de 23/10/2026:

```
*** Terminating app due to uncaught exception 'NSFileHandleOperationException',
    reason: '*** -[_NSStdIOFileHandle writeData:]: Broken pipe'
```

Hoje o job **não** quebra porque esse passo não tem `pipefail` e o status do
cano é o do `cut`, que sai 0. Mas são dois problemas reais:

1. A pilha vermelha aparece em toda execução e parece falha grave quando não é.
2. No dia em que alguém padronizar esse passo com `set -euo pipefail`, como os
   outros passos do arquivo já usam, a build passa a falhar de verdade ali.

O `awk` lê o fluxo até o fim, então não há cano fechado. Qualquer solução que
não use leitor de saída antecipada (`head`, `sed -n 1p`) serve; se escolher
outra, explique qual e por quê.

Confirme que o valor extraído continua sendo `26` para a saída `Xcode 26.6`.

## O que NÃO tocar

- Qualquer outra coisa do `ios.yml`: as quatro recusas, a keychain temporária,
  o `sed` da assinatura manual, o `CURRENT_PROJECT_VERSION`, os `if` de
  `somente_resolver`. Tudo isso foi revisado e está correto.
- `IPHONEOS_DEPLOYMENT_TARGET` (16.4) e `TARGETED_DEVICE_FAMILY` ("1").
- O scheme compartilhado.
- `scripts/build-release.sh` e `axonweb/android/` — o Android está publicado.
- `axonweb/src/` e `backend/` — nada de frontend nem de backend nesta tarefa.

## Verificação

- [ ] `plutil -lint axonweb/ios/App/App/Info.plist` — ou, sem macOS:
      `python3 -c "import plistlib; plistlib.load(open('axonweb/ios/App/App/Info.plist','rb'))"`
- [ ] A chave lida do plist é booleana `False`, não a string `"false"`
- [ ] YAML válido:
      `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ios.yml'))"`
- [ ] `grep -c '@v4' .github/workflows/ios.yml` devolve só o que você decidiu manter
- [ ] O passo do Xcode não usa mais `head`/`sed -n 1p` sobre o `xcodebuild`
- [ ] `cd axonweb && npm run lint` passa
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json` passa
- [ ] `cd axonweb && npm run build` passa
- [ ] `cd backend && python3 -c "import main"` passa

## Entrega

**Não commite.** O Bernardo faz os commits.

Ao terminar, liste os arquivos alterados e diga se o `upload-artifact` foi
mantido em v4 ou atualizado, com o motivo.
