import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Clock, Shield, X } from "lucide-react";
import type { PublicUser } from "@croco/shared/client";
import { ApiError } from "../lib/api";
import { useT } from "../i18n";

const AVATAR_PALETTES = [
  { bg: "#083d23", fg: "#00e676", accent: "#ffc845", shape: "crown" },
  { bg: "#0e3554", fg: "#38bdf8", accent: "#e0f2fe", shape: "spade" },
  { bg: "#4c1726", fg: "#fb7185", accent: "#fde68a", shape: "heart" },
  { bg: "#38280e", fg: "#ffc845", accent: "#fef3c7", shape: "diamond" },
  { bg: "#0f3d39", fg: "#2dd4bf", accent: "#ccfbf1", shape: "club" },
  { bg: "#2b1c4a", fg: "#a78bfa", accent: "#ffc845", shape: "star" },
  { bg: "#163345", fg: "#67e8f9", accent: "#00d95f", shape: "shield" },
  { bg: "#45210e", fg: "#fb923c", accent: "#fef08a", shape: "bolt" },
  { bg: "#0a3830", fg: "#34d399", accent: "#ffffff", shape: "hex" },
  { bg: "#38183b", fg: "#e879f9", accent: "#fde68a", shape: "gem" },
  { bg: "#19304f", fg: "#60a5fa", accent: "#ffc845", shape: "dice" },
  { bg: "#382e0e", fg: "#facc15", accent: "#fef9c3", shape: "chip" },
  { bg: "#114026", fg: "#22c55e", accent: "#dcfce7", shape: "spade" },
  { bg: "#47171c", fg: "#f87171", accent: "#fee2e2", shape: "crown" },
  { bg: "#113245", fg: "#22d3ee", accent: "#cffafe", shape: "star" },
  { bg: "#2a1f42", fg: "#c084fc", accent: "#f3e8ff", shape: "diamond" },
  { bg: "#332510", fg: "#f59e0b", accent: "#fef3c7", shape: "shield" },
  { bg: "#0d3b32", fg: "#10b981", accent: "#ffc845", shape: "chip" },
  { bg: "#1f2e47", fg: "#93c5fd", accent: "#dbeafe", shape: "bolt" },
  { bg: "#45192b", fg: "#f472b6", accent: "#fce7f3", shape: "heart" },
  { bg: "#133830", fg: "#5eead4", accent: "#ffc845", shape: "hex" },
  { bg: "#361f13", fg: "#fdba74", accent: "#ffedd5", shape: "dice" },
  { bg: "#182845", fg: "#818cf8", accent: "#e0e7ff", shape: "gem" },
  { bg: "#113820", fg: "#86efac", accent: "#ffc845", shape: "club" },
] as const;

function AvatarGlyph({ shape, fg, accent }: { shape: (typeof AVATAR_PALETTES)[number]["shape"]; fg: string; accent: string }) {
  switch (shape) {
    case "crown":
      return (
        <>
          <path d="M12 5L15 11L20 8L18 17H6L4 8L9 11L12 5Z" fill={fg} />
          <rect x="6" y="18" width="12" height="2" rx="1" fill={accent} />
        </>
      );
    case "spade":
      return (
        <>
          <path d="M12 4C12 4 6 9.8 6 13.5C6 15.6 7.7 17 9.6 17C10.6 17 11.4 16.5 12 15.8C12.6 16.5 13.4 17 14.4 17C16.3 17 18 15.6 18 13.5C18 9.8 12 4 12 4Z" fill={fg} />
          <path d="M10 19.5H14L12.8 16.5H11.2L10 19.5Z" fill={accent} />
        </>
      );
    case "heart":
      return <path d="M12 19.5C12 19.5 5 14.8 5 9.8C5 7.4 6.9 5.5 9.2 5.5C10.6 5.5 11.5 6.3 12 7.3C12.5 6.3 13.4 5.5 14.8 5.5C17.1 5.5 19 7.4 19 9.8C19 14.8 12 19.5 12 19.5Z" fill={fg} />;
    case "diamond":
      return (
        <>
          <path d="M12 4L18.5 12L12 20L5.5 12L12 4Z" fill={fg} />
          <path d="M12 8L15 12L12 16L9 12L12 8Z" fill={accent} opacity="0.6" />
        </>
      );
    case "club":
      return (
        <>
          <circle cx="12" cy="8.5" r="3" fill={fg} />
          <circle cx="8.5" cy="13" r="3" fill={fg} />
          <circle cx="15.5" cy="13" r="3" fill={fg} />
          <path d="M10 19.5H14L12.8 15H11.2L10 19.5Z" fill={accent} />
        </>
      );
    case "star":
      return <path d="M12 4.5L14.3 9.2L19.5 9.9L15.7 13.5L16.6 18.7L12 16.2L7.4 18.7L8.3 13.5L4.5 9.9L9.7 9.2L12 4.5Z" fill={fg} />;
    case "shield":
      return (
        <>
          <path d="M12 4L18.5 6.8V12.2C18.5 16.2 15.6 18.9 12 20C8.4 18.9 5.5 16.2 5.5 12.2V6.8L12 4Z" fill={fg} />
          <path d="M12 7.2L15.5 8.8V12C15.5 14.3 13.9 16 12 16.8V7.2Z" fill={accent} opacity="0.45" />
        </>
      );
    case "bolt":
      return <path d="M13.5 4L6.5 13H11.5L10.5 20L17.5 11H12.5L13.5 4Z" fill={fg} />;
    case "hex":
      return (
        <>
          <polygon points="12,4 19,8 19,16 12,20 5,16 5,8" fill={fg} opacity="0.9" />
          <polygon points="12,7.5 15.8,9.8 15.8,14.2 12,16.5 8.2,14.2 8.2,9.8" fill={accent} opacity="0.35" />
        </>
      );
    case "gem":
      return (
        <>
          <polygon points="7,6 17,6 20,10.5 12,19.5 4,10.5" fill={fg} />
          <polygon points="12,6 15.5,10.5 12,18 8.5,10.5" fill={accent} opacity="0.4" />
        </>
      );
    case "dice":
      return (
        <>
          <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill={fg} />
          <circle cx="9.2" cy="9.2" r="1.4" fill="#060b11" />
          <circle cx="12" cy="12" r="1.4" fill="#060b11" />
          <circle cx="14.8" cy="14.8" r="1.4" fill="#060b11" />
        </>
      );
    case "chip":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" fill={fg} stroke={accent} strokeWidth="2" strokeDasharray="3 2.5" />
          <circle cx="12" cy="12" r="3.5" fill="#060b11" />
        </>
      );
  }
}

export function Avatar({ id, size = 36, title, ring }: { id: string | undefined; size?: number; title?: string; ring?: "primary" | "gold" | "none" }) {
  const n = Math.max(0, Math.min(AVATAR_PALETTES.length - 1, Number.parseInt((id ?? "a01").slice(1), 10) - 1 || 0));
  const p = AVATAR_PALETTES[n]!;
  const ringCls = ring === "primary" ? "ring-2 ring-primary" : ring === "gold" ? "ring-2 ring-gold" : "";
  return (
    <span
      role="img"
      aria-label={title ?? "avatar"}
      className={`inline-flex items-center justify-center rounded-full shrink-0 border border-white/20 overflow-hidden shadow-md ${ringCls}`}
      style={{ width: size, height: size, background: p.bg }}
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <AvatarGlyph shape={p.shape} fg={p.fg} accent={p.accent} />
      </svg>
    </span>
  );
}

export function StatusDot({ status }: { status: "online" | "in_game" | "away" | "offline" | string }) {
  const cls =
    status === "online"
      ? "bg-primary shadow-[0_0_8px_rgba(0,217,95,0.9)]"
      : status === "in_game"
        ? "bg-gold shadow-[0_0_8px_rgba(255,200,69,0.85)]"
        : status === "away"
          ? "bg-warning"
          : "bg-muted/40";
  return <span className={`inline-block size-2 rounded-full shrink-0 ${cls}`} aria-hidden="true" />;
}

export function AdminBadge() {
  return (
    <span className="chip bg-gold/18 text-gold border border-gold/45 h-5 px-2 text-[10px]">
      <Shield size={10} /> Admin
    </span>
  );
}

export function UserName({ user, you, className = "" }: { user: PublicUser | undefined; you?: boolean; className?: string }) {
  const t = useT();
  if (!user) return <span className="text-muted">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <span className="truncate">{user.username}</span>
      {user.badges.admin && <AdminBadge />}
      {!user.badges.admin && user.badges.moderator && <span className="chip bg-accent/15 text-accent border border-accent/35 h-5 px-2 text-[10px]">{t("common.moderator")}</span>}
      {you && <span className="text-muted text-[11px] font-normal">({t("common.you")})</span>}
    </span>
  );
}

export function BotBadge({ difficulty }: { difficulty?: string }) {
  const t = useT();
  return (
    <span className="chip bg-secondary/45 text-text-2 border border-line-strong h-5 px-2 text-[10px]">
      <Bot size={11} />
      {t("common.bot")}
      {difficulty ? ` · ${t(`difficulty.${difficulty}`)}` : ""}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted text-sm" role="status">
      <span className="size-5 rounded-full border-2 border-line-strong border-t-primary animate-spin" />
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
    <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-xl px-3.5 py-2">
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-2xl border-line-strong fade-in`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-2">
          <h2 className="font-bold text-base tracking-tight">{title}</h2>
          <button className="btn-ghost btn-sm size-8 px-0 rounded-full" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center text-muted py-12 px-4 text-sm">
      {icon && <div className="size-11 rounded-full bg-surface-3 border border-line flex items-center justify-center text-muted">{icon}</div>}
      <p className="max-w-sm">{children}</p>
    </div>
  );
}

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };

export function suitSymbol(s: string): string {
  return SUIT_SYMBOL[s] ?? s;
}

export function cardLabel(card: string): string {
  if (card === "X1" || card === "X2") return "Joker";
  return `${RANK_LABEL[card[0]!] ?? card[0]}${SUIT_SYMBOL[card[1]!] ?? ""}`;
}

export function SuitIcon({ suit, size = 16, className = "" }: { suit: string; size?: number; className?: string }) {
  switch (suit) {
    case "S":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 2C12 2 3.8 10 3.8 14.4C3.8 17.1 5.9 19 8.5 19C10 19 11.1 18.3 11.9 17.2C11.7 18.8 10.9 20.3 9.4 21.6H14.6C13.1 20.3 12.3 18.8 12.1 17.2C12.9 18.3 14 19 15.5 19C18.1 19 20.2 17.1 20.2 14.4C20.2 10 12 2 12 2Z" />
        </svg>
      );
    case "H":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 21.5C12 21.5 3.2 15.3 3.2 9.1C3.2 5.9 5.7 3.5 8.7 3.5C10.5 3.5 11.4 4.5 12 5.7C12.6 4.5 13.5 3.5 15.3 3.5C18.3 3.5 20.8 5.9 20.8 9.1C20.8 15.3 12 21.5 12 21.5Z" />
        </svg>
      );
    case "D":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 2L20.5 12L12 22L3.5 12L12 2Z" />
        </svg>
      );
    case "C":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="7.4" r="4.3" />
          <circle cx="7.3" cy="13.3" r="4.3" />
          <circle cx="16.7" cy="13.3" r="4.3" />
          <path d="M9.4 21.6H14.6L13.1 16H10.9L9.4 21.6Z" />
        </svg>
      );
    default:
      return null;
  }
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
  return (
    <span className="hud-chip tabular-nums" data-tone={s <= 5 ? "danger" : undefined}>
      <Clock size={12} /> {t("game.seconds", { s })}
    </span>
  );
}

export function Section({ title, subtitle, action, icon, children }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="size-8 rounded-lg bg-primary/14 border border-primary/30 text-primary flex items-center justify-center shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2 className="font-bold text-sm sm:text-base text-white tracking-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
