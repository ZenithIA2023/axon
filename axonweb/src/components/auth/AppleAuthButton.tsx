import { isNative } from "../../lib/nativeAuth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type AppleAuthButtonProps = {
  label: string;
};

/**
 * Botão "Continuar com a Apple", só na web.
 *
 * No app Android ele some: o plugin nativo não existe lá e a Apple só exige o
 * botão no app iOS. O fluxo nativo do iOS entra na Fase 2 (docs/PLANO_IOS.md).
 *
 * Visual segue as diretrizes da Apple: preto com logo e texto brancos no tema
 * claro, branco com preto no escuro, logo e texto da mesma cor. Altura, raio e
 * tamanho do texto são os mesmos do GoogleAuthButton — a Apple exige
 * proeminência equivalente à dos outros logins sociais.
 */
export default function AppleAuthButton({ label }: AppleAuthButtonProps) {
  if (isNative()) return null;

  function handleClick() {
    // A Apple volta por POST ao backend, que redireciona para /auth/callback
    // com o mesmo session_code do Google.
    window.location.href = `${API_URL}/auth/apple`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex min-h-10 w-full items-center justify-center gap-3 rounded-2xl bg-black px-6 text-[0.74rem] font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-black lg:hover:-translate-y-0.5 lg:hover:shadow-[0_18px_42px_rgba(0,0,0,0.22)]"
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <AppleIcon />
      </span>

      <span>{label}</span>
    </button>
  );
}

function AppleIcon() {
  return (
    <svg
      className="h-[1.05rem] w-[1.05rem] shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}
