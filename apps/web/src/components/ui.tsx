import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Clock, Shield, X } from "lucide-react";
import type { PublicUser } from "@croco/shared/client";
import { ApiError } from "../lib/api";
import { useT } from "../i18n";

/**
 * 24 crisp geometric/gaming avatar emblems — renders identically across Windows,
 * macOS, Android, and iOS with zero emoji inconsistency or raster downloads.
 */
const AVATAR_PALETTES = [
  { bg: "#0e4d2e", fg: "#4ade80", accent: "#f5c451", shape: "crown" },
  { bg: "#103e5c", fg: "#38bdf8", accent: "#e0f2fe", shape: "spade" },
  { bg: "#521b29", fg: "#fb7185", accent: "#fde68a", shape: "heart" },
  { bg: "#3b2c12", fg: "#f5c451", accent: "#fef3c7", shape: "diamond" },
  { bg: "#12423d", fg: "#2dd4bf", accent: "#ccfbf1", shape: "club" },
  { bg: "#2e1f4d", fg: "#a78bfa", accent: "#f5c451", shape: "star" },
  { bg: "#1b3a4b", fg: "#67e8f9", accent: "#18b84e", shape: "shield" },
  { bg: "#4a2511", fg: "#fb923c", accent: "#fef08a", shape: "bolt" },
  { bg: "#0c3d35", fg: "#34d399", accent: "#ffffff", shape: "hex" },
  { bg: "#3d1b3f", fg: "#e879f9", accent: "#fde68a", shape: "gem" },
  { bg: "#1e3554", fg: "#60a5fa", accent: "#f5c451", shape: "dice" },
  { bg: "#3d3311", fg: "#facc15", accent: "#fef9c3", shape: "chip" },
  { bg: "#14472c", fg: "#22c55e", accent: "#dcfce7", shape: "spade" },
  { bg: "#4d1a1f", fg: "#f87171", accent: "#fee2e2", shape: "crown" },
  { bg: "#14384c", fg: "#22d3ee", accent: "#cffafe", shape: "star" },
  { bg: "#2f2447", fg: "#c084fc", accent: "#f3e8ff", shape: "diamond" },
  { bg: "#382914", fg: "#f59e0b", accent: "#fef3c7", shape: "shield" },
  { bg: "#0f4238", fg: "#10b981", accent: "#f5c451", shape: "chip" },
  { bg: "#24344d", fg: "#93c5fd", accent: "#dbeafe", shape: "bolt" },
  { bg: "#4a1c30", fg: "#f472b6", accent: "#fce7f3", shape: "heart" },
  { bg: "#163d34", fg: "#5eead4", accent: "#f5c451", shape: "hex" },
  { bg: "#3b2316", fg: "#fdba74", accent: "#ffedd5", shape: "dice" },
  { bg: "#1c2d4a", fg: "#818cf8", accent: "#e0e7ff", shape: "gem" },
  { bg: "#143d24", fg: "#86efac", accent: "#f5c451", shape: "club" },
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
          <circle cx="9.2" cy="9.2" r="1.4" fill="#071117" />
          <circle cx="12" cy="12" r="1.4" fill="#071117" />
          <circle cx="14.8" cy="14.8" r="1.4" fill="#071117" />
        </>
      );
    case "chip":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" fill={fg} stroke={accent} strokeWidth="2" strokeDasharray="3 2.5" />
          <circle cx="12" cy="12" r="3.5" fill="#071117" />
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
      className={`inline-flex items-center justify-center rounded-full shrink-0 border border-white/15 overflow-hidden shadow-sm ${ringCls}`}
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
      ? "bg-primary shadow-[0_0_6px_rgba(24,184,78,0.8)]"
      : status === "in_game"
        ? "bg-gold shadow-[0_0_6px_rgba(245,196,81,0.75)]"
        : status === "away"
          ? "bg-warning"
          : "bg-muted/40";
  return <span className={`inline-block size-2 rounded-full shrink-0 ${cls}`} aria-hidden="true" />;
}

export function AdminBadge() {
  return (
    <span className="chip bg-gold/15 text-gold border border-gold/45 h-5 px-2 text-[10px]">
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
    <span className="chip bg-secondary/35 text-text-2 border border-secondary/50 h-5 px-2 text-[10px]">
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
    <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-2xl border-line-strong fade-in`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-2/80">
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

/** Crisp SVG suit icon for consistent rendering on playing cards & badges across OSes. */
export function SuitIcon({ suit, size = 14, className = "" }: { suit: string; size?: number; className?: string }) {
  switch (suit) {
    case "S":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 2.5C12 2.5 4.2 10.2 4.2 14.3C4.2 16.9 6.2 18.7 8.6 18.7C10 18.7 11.1 18.1 11.9 17.1C11.7 18.6 11 20 9.6 21.2H14.4C13 20 12.3 18.6 12.1 17.1C12.9 18.1 14 18.7 15.4 18.7C17.8 18.7 19.8 16.9 19.8 14.3C19.8 10.2 12 2.5 12 2.5Z" />
        </svg>
      );
    case "H":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 21.2C12 21.2 3.5 15.2 3.5 9.2C3.5 6.1 5.9 3.8 8.8 3.8C10.5 3.8 11.4 4.7 12 5.9C12.6 4.7 13.5 3.8 15.2 3.8C18.1 3.8 20.5 6.1 20.5 9.2C20.5 15.2 12 21.2 12 21.2Z" />
        </svg>
      );
    case "D":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 2.5L20 12L12 21.5L4 12L12 2.5Z" />
        </svg>
      );
    case "C":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="7.6" r="4.1" />
          <circle cx="7.5" cy="13.2" r="4.1" />
          <circle cx="16.5" cy="13.2" r="4.1" />
          <path d="M9.6 21.2H14.4L13 15.8H11L9.6 21.2Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function PlayingCard({
  card,
  onClick,
  selected,
  playable = true,
  small,
  size,
  back,
  title,
  animate,
}: {
  card?: string;
  onClick?: () => void;
  selected?: boolean;
  playable?: boolean;
  small?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  back?: boolean;
  title?: string;
  animate?: boolean;
}) {
  const resolvedSize = size ?? (small ? "sm" : "md");
  const sizeClass = resolvedSize === "xs" ? "pcard-xs" : resolvedSize === "sm" ? "pcard-sm" : resolvedSize === "lg" ? "pcard-lg" : "";
  const animClass = animate ? "card-enter" : "";

  if (back || !card) {
    return (
      <span className={`pcard pcard-back ${sizeClass} ${animClass} items-center justify-center`} aria-label="hidden card">
        <span className="size-3.5 rounded-sm border border-gold/45 rotate-45 bg-primary/25" aria-hidden="true" />
      </span>
    );
  }

  const joker = card === "X1" || card === "X2";
  const rank = RANK_LABEL[card[0]!] ?? card[0]!;
  const suit = card[1] ?? "";
  const red = suit === "H" || suit === "D";
  const isCourt = rank === "J" || rank === "Q" || rank === "K" || rank === "A";

  const cornerText = resolvedSize === "xs" ? "text-[10px]" : resolvedSize === "sm" ? "text-[11px]" : resolvedSize === "lg" ? "text-sm" : "text-xs";
  const cornerPip = resolvedSize === "xs" ? 8 : resolvedSize === "sm" ? 9 : resolvedSize === "lg" ? 11 : 10;
  const centerPip = resolvedSize === "xs" ? 13 : resolvedSize === "sm" ? 18 : resolvedSize === "lg" ? 28 : 22;

  const content = joker ? (
    <>
      <span className={`flex flex-col items-start leading-none font-black ${cornerText}`}>
        <span>JK</span>
      </span>
      <span className="self-center my-auto">
        <svg width={centerPip + 2} height={centerPip + 2} viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="M14 4L17.5 12L25 8.5L21.5 19.5H6.5L3 8.5L10.5 12L14 4Z" fill="#6b4000" />
          <circle cx="14" cy="3" r="2" fill="#c9252d" />
          <circle cx="3" cy="7.5" r="1.8" fill="#18b84e" />
          <circle cx="25" cy="7.5" r="1.8" fill="#18b84e" />
          <rect x="6.5" y="21" width="15" height="2.8" rx="1.4" fill="#6b4000" />
        </svg>
      </span>
      <span className={`self-end rotate-180 leading-none font-black ${cornerText}`}>JK</span>
    </>
  ) : (
    <>
      <span className={`flex flex-col items-center self-start leading-none tracking-tighter ${cornerText}`}>
        <span>{rank}</span>
        {resolvedSize !== "xs" && <SuitIcon suit={suit} size={cornerPip} className="mt-0.5" />}
      </span>
      <span className="self-center my-auto flex items-center justify-center">
        {isCourt && resolvedSize !== "xs" ? (
          <span className="relative flex items-center justify-center">
            <SuitIcon suit={suit} size={centerPip} className={rank === "A" ? "opacity-100" : "opacity-85"} />
            {rank !== "A" && (
              <span className="absolute text-[9px] font-black text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]">{rank}</span>
            )}
          </span>
        ) : (
          <SuitIcon suit={suit} size={centerPip} />
        )}
      </span>
      <span className={`flex flex-col items-center self-end rotate-180 leading-none tracking-tighter ${cornerText}`}>
        <span>{rank}</span>
        {resolvedSize !== "xs" && <SuitIcon suit={suit} size={cornerPip} className="mt-0.5" />}
      </span>
    </>
  );

  const common = {
    className: `pcard ${sizeClass} ${animClass} ${joker ? "pcard-joker" : isCourt ? "pcard-court" : ""}`,
    "data-red": red,
    "data-selected": selected ? "true" : "false",
    "data-playable": playable ? "true" : "false",
    title: title ?? cardLabel(card),
  };

  if (onClick) {
    return (
      <button type="button" {...common} onClick={onClick} disabled={!playable} aria-pressed={selected} aria-label={cardLabel(card)}>
        {content}
      </button>
    );
  }
  return (
    <span {...common} aria-label={cardLabel(card)}>
      {content}
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
  const urgent = s <= 5;
  return (
    <span className={`chip tabular-nums ${urgent ? "bg-danger/20 text-danger border border-danger/45" : "bg-surface-3 text-text-2 border border-line"}`}>
      <Clock size={11} /> {t("game.seconds", { s })}
    </span>
  );
}

export function Section({ title, subtitle, action, icon, children }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="size-8 rounded-lg bg-primary/12 border border-primary/25 text-primary flex items-center justify-center shrink-0">{icon}</span>}
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
