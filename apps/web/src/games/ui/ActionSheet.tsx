import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A decision panel that rises over the table (joker choices, trump demands …). It is a real
 * modal dialog: focus moves into it, Escape closes it, and the rest of the page is inert to
 * pointer input while it is open.
 */
export function ActionSheet({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus], button:not([aria-label=close])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="psheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="psheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="psheet-head">
          <div className="min-w-0">
            <h2 className="psheet-title">{title}</h2>
            {subtitle && <p className="psheet-sub">{subtitle}</p>}
          </div>
          <button type="button" className="psheet-close" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="psheet-body">{children}</div>
      </div>
    </div>
  );
}
