# Projeto iOS (Capacitor)

O build e o envio ao TestFlight rodam no GitHub Actions
(`.github/workflows/ios.yml`), porque o Xcode só existe em macOS. Detalhes do
plano em `docs/PLANO_IOS.md`.

## Alvo mínimo: iOS 16.4 — não rebaixe

`IPHONEOS_DEPLOYMENT_TARGET = 16.4` em `App.xcodeproj/project.pbxproj` não é
preferência. O CSS gerado pelo `npm run build` usa `color-mix()` (736 vezes) e
`@property` (75), porque o Tailwind v4 tem o Safari 16.4 como base e usa
`color-mix()` em toda cor com transparência (`text-white/62`, bordas `/20`, o
glassmorphism inteiro). No WebView do iOS 15 essas declarações são descartadas e
o app abre sem cor de texto, sem borda e sem fundo de cartão.

Rebaixar para 15.0 não ganha alcance: a App Store passaria a oferecer o
download a quem tem iOS 15.0–16.3, e essas pessoas instalariam um app quebrado.

O `platforms: [.iOS(.v15)]` em `CapApp-SPM/Package.swift` é gerado pelo
Capacitor e vale só para os pacotes; quem decide onde o app instala é o alvo do
target `App`.

## Outras decisões

- **Sem CocoaPods.** O Capacitor 8 usa Swift Package Manager
  (`App/CapApp-SPM/Package.swift`). Não existe `Podfile`; `pod install` não se
  aplica a este projeto.
- **Scheme compartilhado** em `App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`.
  O `cap add ios` não gera um, e o que o Xcode cria ao abrir o projeto vai para
  `xcuserdata/` (ignorado). Sem ele, `xcodebuild -scheme App` falha no runner.
- **Só iPhone** (`TARGETED_DEVICE_FAMILY = "1"`).
- **Assinatura:** o projeto fica em `Automatic` para quem abrir no Xcode. O
  workflow troca para manual só no target `App`, no runner, com o certificado e
  o perfil dos secrets.
