import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

// Live reload no aparelho real (fase 1.7 do plano da Play Store): apontar o
// WebView para o servidor de dev do Vite em vez dos arquivos empacotados.
// Só liga quando CAP_SERVER_URL está definida — assim o bloco `server.url`
// NUNCA entra num build de release, que é falha de segurança grave.
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "tech.axonapp.app",
  appName: "Axon",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // O WebView do iOS usa a MESMA origem do Android (https://localhost). Com o
    // esquema padrão (capacitor://localhost) seria uma segunda origem para
    // manter no CORS do backend — e a falta dela já derrubou o login da
    // primeira build do TestFlight (23/10/2026).
    // Não troque depois do lançamento: o localStorage é por origem, então mudar
    // o esquema apaga a sessão e desloga todos os usuários do iOS.
    iosScheme: "https",
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    // "never": o WKWebView NÃO adiciona inset próprio. As safe areas do iPhone
    // (entalhe, ilha, barra de gestos) são tratadas no CSS via
    // env(safe-area-inset-*) atrás da classe `is-native`, como já é feito no
    // Android. Com "always" o iOS somaria o inset dele ao do CSS e o respiro
    // das bordas sairia dobrado.
    contentInset: "never",
    // Pressionar e segurar um link não abre a pré-visualização do Safari: num
    // app o gesto confunde, e a navegação toda é interna ao React Router.
    allowsLinkPreview: false,
  },
  plugins: {
    Keyboard: {
      // O WebView é redimensionado quando o teclado abre, então os campos do
      // Chat e do questionário não ficam escondidos atrás dele.
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
