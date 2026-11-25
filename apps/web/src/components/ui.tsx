import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { PublicUser } from "@croco/shared/client";
import { ApiError } from "../lib/api";
import { useT } from "../i18n";

const AVATAR_GLYPHS = ["🐊", "🦁", "🐯", "🦊", "🐺", "🐻", "🐼", "🐨", "🐸", "🦉", "🦅", "🐬", "🐙", "🦄", "🐝", "🐢", "🐧", "🦓", "🦒", "🐘", "🦈", "🐲", "🦜", "🐞"];

export function Avatar({ id, size = 36, title }: { id: string | undefined; size?: number; title?: string }) {
  const n = Math.max(0, Math.min(23, Number.parseInt((id ?? "a01").slice(1), 10) - 1 || 0));
  const hue = (n * 47) % 360;
  return (
    <span
      role="img"
      aria-label={title ?? "avatar"}
      className="inline-flex items-center justify-center rounded-full shrink-0 border border-white/10"
      style={{ width: size, height: size, background: `hsl(${hue} 45% 28%)`, fontSize: size * 0.55 }}
    >
      {AVATAR_GLYPHS[n]}
    </span>
  );
}

export function AdminBadge() {
  return <span className="chip bg-gold/15 text-gold border border-gold/40">Admin</span>;
}

export function UserName({ user, you, className = "" }: { user: PublicUser | undefined; you?: boolean; className?: string }) {
  const t = useT();
  if (!user) return <span className="text-muted">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <span className="truncate">{user.username}</span>
      {user.badges.admin && <AdminBadge />}
      {!user.badges.admin && user.badges.moderator && <span className="chip bg-accent/15 text-accent">{t("common.moderator")}</span>}
      {you && <span className="text-muted text-xs">({t("common.you")})</span>}
    </span>
  );
}

export function BotBadge({ difficulty }: { difficulty?: string }) {
  const t = useT();
  return (
    <span className="chip bg-secondary/40 text-text-2">
      {t("common.bot")}
      {difficulty ? ` · ${t(`difficulty.${difficulty}`)}` : ""}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
      <span className="size-5 rounded-full border-2 border-muted/40 border-t-primary animate-spin" />
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  let key = "errors.generic";
  if (error instanceof ApiError) key = error.code === "network" ? "errors.network" : `errors.${error.code}`;
  else if (typeof error === "string") key = error.startsWith("errors.") ? error : `errors.${error}`;
  const text = t(key);
  return (
    <p role="alert" className="text-sm text-danger">
      {text.startsWith("errors.") ? t("errors.generic") : text}
    </p>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose(): void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, button, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-[var(--radius-card)] fade-in`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center text-muted py-10 text-sm">{children}</div>;
}

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };

export function suitSymbol(s: string): string {
  return SUIT_SYMBOL[s] ?? s;
}

export function cardLabel(card: string): string {
  if (card === "X1" || card === "X2") return "🃏";
  return `${RANK_LABEL[card[0]!] ?? card[0]}${SUIT_SYMBOL[card[1]!] ?? ""}`;
}

export function PlayingCard({
  card,
  onClick,
  selected,
  playable = true,
  small,
  back,
  title,
}: {
  card?: string;
  onClick?: () => void;
  selected?: boolean;
  playable?: boolean;
  small?: boolean;
  back?: boolean;
  title?: string;
}) {
  const style = small ? ({ "--card-w": "2.25rem", fontSize: "0.7rem" } as React.CSSProperties) : ({ fontSize: "0.85rem" } as React.CSSProperties);
  if (back || !card) return <span className="pcard pcard-back" style={style} aria-label="hidden card" />;
  const joker = card === "X1" || card === "X2";
  const red = card[1] === "H" || card[1] === "D";
  const label = joker ? (
    <>
      <span>JK</span>
      <span className="self-center text-lg">🃏</span>
      <span />
    </>
  ) : (
    <>
      <span>{RANK_LABEL[card[0]!] ?? card[0]}</span>
      <span className="self-center text-lg leading-none">{SUIT_SYMBOL[card[1]!]}</span>
      <span className="self-end rotate-180">{RANK_LABEL[card[0]!] ?? card[0]}</span>
    </>
  );
  const common = {
    className: `pcard ${joker ? "pcard-joker" : ""}`,
    "data-red": red,
    "data-selected": selected ? "true" : "false",
    "data-playable": playable ? "true" : "false",
    style,
    title: title ?? cardLabel(card),
  };
  if (onClick) {
    return (
      <button type="button" {...common} onClick={onClick} disabled={!playable} aria-pressed={selected} aria-label={cardLabel(card)}>
        {label}
      </button>
    );
  }
  return (
    <span {...common} aria-label={cardLabel(card)}>
      {label}
    </span>
  );
}

/** Seconds remaining until a server deadline. Ticks only while the tab is visible. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 500);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function Countdown({ deadline }: { deadline: number | null }) {
  const s = useCountdown(deadline);
  const t = useT();
  if (s === null) return null;
  return <span className={`chip ${s <= 5 ? "bg-danger/20 text-danger" : "bg-surface-3 text-text-2"}`}>{t("game.seconds", { s })}</span>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-semibold text-text-2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
