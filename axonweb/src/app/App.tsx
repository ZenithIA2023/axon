import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import ScrollToTop from "../components/layout/ScrollToTop";

// Primeira pintura: a landing (web) e o NativeEntry (app) precisam aparecer sem
// um flash de loading, então continuam com import estático. Todo o resto é
// carregado sob demanda (lazy) para não pesar o bundle inicial — antes o app
// baixava ~1,6 MB antes de mostrar qualquer tela.
import LandingPage from "../pages/LandingPage";
import NativeEntry from "../pages/NativeEntry";

// Layout / infra: montam junto com o app em qualquer rota, então ficam estáticos.
import DeepLinkHandler from "../components/auth/DeepLinkHandler";
import NativeShell from "../components/layout/NativeShell";
import { BottomNavGate } from "../components/layout/BottomNav";
import NotificationToastProvider from "../components/notifications/NotificationToastProvider";

// Auth (lazy)
const Login = lazy(() => import("../pages/Login"));
const Signup = lazy(() => import("../pages/Signup"));
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const AuthCallback = lazy(() => import("../pages/AuthCallback"));

// Onboarding (lazy)
const QuestionnaireIntro = lazy(() => import("../pages/QuestionnaireIntro"));
const Questionnaire = lazy(() => import("../pages/Questionnaire"));
const Analyzing = lazy(() => import("../pages/Analyzing"));
const Result = lazy(() => import("../pages/Result"));
const DashboardLoading = lazy(() => import("../pages/DashboardLoading"));
const AppLoading = lazy(() => import("../pages/AppLoading"));

// App interno (lazy) — as telas mais pesadas do bundle.
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Chat = lazy(() => import("../pages/Chat"));
const ChatConversation = lazy(() => import("../pages/ChatConversation"));
const VoiceChat = lazy(() => import("../pages/VoiceChat"));
const Planning = lazy(() => import("../pages/Planning"));
const Insights = lazy(() => import("../pages/Insights"));
const RoutineDetailPage = lazy(() =>
  import("../pages/Routines").then((m) => ({ default: m.RoutineDetailPage }))
);
const Focus = lazy(() => import("../pages/Focus"));
const Profile = lazy(() => import("../pages/Profile"));
const Report = lazy(() => import("../pages/Report"));
const Settings = lazy(() => import("../pages/Settings"));

// No app empacotado não existe servidor HTTP: os arquivos vêm do sistema de
// arquivos do aparelho, então a History API do BrowserRouter não funciona e
// "/dashboard" viraria uma tela branca. O HashRouter resolve isso no nativo,
// enquanto a web continua com URLs limpas. A detecção é em runtime, então um
// único `npm run build` serve as duas plataformas.
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

// Fallback neutro enquanto o chunk da rota carrega. Sem lógica nem timers (o
// AppLoading tem os seus e navega sozinho, então não serve aqui) — apenas o
// fundo do app, para a troca de rota não piscar em branco.
function RouteFallback() {
  return (
    <div
      aria-hidden
      style={{
        minHeight: "100dvh",
        background: "var(--app-bg, #0b0b0f)",
      }}
    />
  );
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />

      <DeepLinkHandler />

      <NativeShell />

      <NotificationToastProvider />

      {/* Navegação do app instalado. Na web fica a Sidebar de cada página. */}
      <BottomNavGate />

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public — no app instalado a landing não faz sentido: quem abre já
              escolheu o Axon. Vai direto para o dashboard ou para o login. */}
          <Route
            path="/"
            element={Capacitor.isNativePlatform() ? <NativeEntry /> : <LandingPage />}
          />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Redirects para evitar erro caso algum link antigo ainda exista */}
          <Route
            path="/forgotpassword"
            element={<Navigate to="/forgot-password" replace />}
          />
          <Route
            path="/resetpassword"
            element={<Navigate to="/reset-password" replace />}
          />

          {/* Onboarding */}
          <Route path="/questionnaire-intro" element={<QuestionnaireIntro />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
          <Route path="/analyzing" element={<Analyzing />} />
          <Route path="/result" element={<Result />} />
          <Route path="/app-loading" element={<AppLoading />} />
          <Route path="/dashboard-loading" element={<DashboardLoading />} />

          {/* App interno */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:chatId" element={<ChatConversation />} />
          <Route path="/voz" element={<VoiceChat />} />
          <Route path="/planning" element={<Planning initialView="agenda" />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/rotinas" element={<Planning initialView="rotinas" />} />
          <Route path="/rotinas/:id" element={<RoutineDetailPage />} />
          <Route path="/objetivos" element={<Planning initialView="objetivos" />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/relatorio/:id" element={<Report />} />
          <Route path="/settings" element={<Settings />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
