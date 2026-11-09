import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import AuthGlow from "../components/auth/AuthGlow";
import SignupForm from "../components/auth/SignupForm";
import { finishPendingOnboarding, ONBOARDING_ROUTE } from "../lib/onboarding";

// ===========================================================================
// PÁGINA DE CADASTRO
// ===========================================================================

export default function Signup() {
  const navigate = useNavigate();

  // Cadastro avulso (link "Criar conta" do login). Se havia um onboarding
  // respondido neste navegador, ele é gravado na conta nova; senão a pessoa
  // entra no onboarding já logada, a partir da tela de nome.
  async function handleRegistered() {
    const destino = await finishPendingOnboarding(false);
    navigate(destino ?? ONBOARDING_ROUTE);
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#2d0850] px-4 py-8 text-white">
      <AuthGlow />

      <div className="relative z-10 w-full max-w-[340px]">

        <motion.section
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: "easeOut" }}
          className="overflow-hidden rounded-[1.65rem] border border-white/90 bg-white px-5 pb-7 pt-6 text-[#30124b] shadow-[0_28px_90px_rgba(0,0,0,0.26)] dark:border-white/10 dark:bg-[#16111f] dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        >
          <div className="mb-6 text-center">
            <h1 className="mx-auto max-w-[15rem] text-[1.55rem] font-black leading-[0.95] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
              Crie seu assistente pessoal Inteligente
            </h1>

            <p className="mx-auto mt-3 max-w-[16.5rem] text-[0.68rem] font-medium leading-5 text-[#6d28d9] dark:text-white/62">
              Seja bem-vindo ao AXON
            </p>
          </div>

          <SignupForm onRegistered={handleRegistered} />

          <p className="mt-6 text-center text-[0.68rem] text-[#6d28d9] dark:text-white/62">
            Já tem uma conta?{" "}
            <Link
              to="/login"
              className="font-black text-[#6d28d9] dark:text-[#d8b4fe] transition hover:text-[#7b2cbf]"
            >
              Entrar
            </Link>
          </p>
        </motion.section>
      </div>
    </main>
  );
}

