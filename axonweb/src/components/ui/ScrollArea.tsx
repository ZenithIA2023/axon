import type { ReactNode, RefObject } from "react";

type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  fadeTop?: boolean;
  fadeBottom?: boolean;
  /** Acesso ao elemento que realmente rola — para rolar por código. */
  viewportRef?: RefObject<HTMLDivElement | null>;
};

export function ScrollArea({
  children,
  className = "",
  contentClassName = "",
  fadeTop = false,
  fadeBottom = false,
  viewportRef,
}: ScrollAreaProps) {
  return (
    <div className={`relative flex min-h-0 flex-col ${className}`}>
      {fadeTop && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6"
          style={{
            background:
              "linear-gradient(to bottom, var(--surface-elevated), transparent)",
          }}
        />
      )}

      <div
        ref={viewportRef}
        className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain ${contentClassName}`}
      >
        {children}
      </div>

      {fadeBottom && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6"
          style={{
            background:
              "linear-gradient(to top, var(--surface-elevated), transparent)",
          }}
        />
      )}
    </div>
  );
}