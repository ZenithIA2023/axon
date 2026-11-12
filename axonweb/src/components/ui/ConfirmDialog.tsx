import { AnimatePresence, motion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

// ===========================================================================
// TIPOS DO COMPONENTE
// ===========================================================================

type ConfirmDialogVariant = "default" | "danger" | "success";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
  // Trava só o botão de confirmar (o de cancelar continua livre), para quando
  // a confirmação depende de algo dentro de `description` — ex.: digitar o
  // e-mail antes de excluir a conta.
  confirmDisabled?: boolean;
  icon?: ElementType;
  onConfirm: () => void;
  onClose: () => void;
};

// ===========================================================================
// CONFIGURAÇÕES VISUAIS POR VARIANTE
// ===========================================================================

const VARIANT_CONFIG: Record<
  ConfirmDialogVariant,
  {
    icon: ElementType;
    iconClassName: string;
    confirmClassName: string;
  }
> = {
  default: {
    icon: AlertTriangle,
    iconClassName: "border-accent-soft bg-accent-soft text-accent",
    confirmClassName:
      "bg-[var(--accent-strong)] text-white shadow-card hover:brightness-105",
  },
  danger: {
    icon: AlertTriangle,
    iconClassName: "border-red-300/25 bg-red-500/10 text-red-600 dark:text-red-200",
    confirmClassName:
      "bg-red-500/90 text-white shadow-card hover:bg-red-500",
  },
  success: {
    icon: CheckCircle2,
    iconClassName:
      "border-emerald-300/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    confirmClassName:
      "bg-emerald-500/90 text-white shadow-card hover:bg-emerald-500",
  },
};

// ===========================================================================
// MODAL GLOBAL DE CONFIRMAÇÃO
// ===========================================================================
// Use para ações sensíveis: excluir, sair, confirmar criação contínua etc.
// As cores usam tokens globais para responder aos temas claro/escuro.

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  confirmDisabled = false,
  icon,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = icon ?? config.icon;

  function handleClose() {
    if (loading) return;
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Fechar confirmação"
            onClick={handleClose}
            className="absolute inset-0"
          />

          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-soft bg-surface-elevated p-5 text-center text-primary shadow-soft backdrop-blur-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at top right, var(--accent-soft), transparent 52%)",
              }}
            />

            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative">
              <div
                className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border ${config.iconClassName}`}
              >
                <Icon className="h-6 w-6" />
              </div>

              <h2
                id="confirm-dialog-title"
                className="text-xl font-semibold tracking-[-0.035em] text-primary"
              >
                {title}
              </h2>

              {description && (
                <div className="mt-3 text-sm leading-6 text-muted">
                  {description}
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="min-h-12 rounded-2xl border border-soft bg-surface-muted px-4 text-sm font-semibold text-secondary transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cancelLabel}
                </button>

                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={loading || confirmDisabled}
                  className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${config.confirmClassName}`}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
