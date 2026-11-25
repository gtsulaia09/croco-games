import type { CSSProperties, ReactNode } from "react";
import { Bot, WifiOff } from "lucide-react";
import type { GameType, SeatInfo } from "@croco/shared/client";
import { useT } from "../i18n";
import { AdminBadge, Avatar, Countdown, SuitIcon, suitSymbol } from "../components/ui";

export interface BoardProps<V = unknown> {
  gameType: GameType;
  view: V;
  deadline: number | null;
  mySeat: number | null;
  seats: SeatInfo[];
  onAction(action: Record<string, unknown>): void;
  practice?: boolean;
}

export const SUITS = ["S", "H", "D", "C"] as const;
export const isRedSuit = (s: string | null | undefined) => s === "H" || s === "D";

export function useSeatName(seats: SeatInfo[]) {
  const t = useT();
  return (seat: number) => {
    const s = seats[seat];
    if (!s) return `#${seat + 1}`;
    if (s.occupant === "bot") return `${t("common.bot")} ${s.botName ?? ""}`.trim();
    return s.user?.username ?? `#${seat + 1}`;
  };
}

/** Other seats in play order starting left of `mySeat` (spectators see everyone from seat 0). */
export function opponentsOrder(count: number, mySeat: number | null): number[] {
  const me = mySeat ?? -1;
  const out: number[] = [];
  for (let k = 1; k <= count; k++) {
    const s = ((me < 0 ? 0 : me) + k) % count;
    if (s !== me) out.push(s);
  }
  return mySeat === null ? Array.from({ length: count }, (_, i) => i) : out;
}

/** Small stable tilt for a card lying on the table, so tricks look hand-placed. */
export function tiltFor(card: string, max = 6): string {
  let h = 0;
  for (let i = 0; i < card.length; i++) h = (h * 31 + card.charCodeAt(i)) % 997;
  return `${((h % (max * 20 + 1)) / 10 - max).toFixed(1)}deg`;
}

/** Status strip above the table: whose turn it is, the timer and the game facts. */
export function TurnBar({ toAct, mySeat, deadline, seats, extra }: { toAct: number | null; mySeat: number | null; deadline: number | null; seats: SeatInfo[]; extra?: ReactNode }) {
  const t = useT();
  const name = useSeatName(seats);
  const mine = toAct !== null && toAct === mySeat;
  const state = toAct === null ? "over" : mine ? "mine" : "wait";
  return (
    <div className="hud" aria-live="polite">
      <span className="turn-pill" data-state={state}>
        {toAct === null ? t("game.finished") : mine ? t("game.yourTurn") : t("game.waitingFor", { name: name(toAct) })}
      </span>
      <Countdown deadline={deadline} />
      <div className="hud-info">{extra}</div>
    </div>
  );
}

export function HudChip({ children, tone, title }: { children: ReactNode; tone?: "gold" | "danger" | "brand"; title?: string }) {
  return (
    <span className="hud-chip" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

/** Face-down counter: how many cards (or tiles) a player still holds. */
export function MiniCardCount({ count }: { count: number }) {
  return (
    <span className="back-count" aria-label={String(count)}>
      <span aria-hidden="true" className="inline-flex">
        <i />
        <i />
      </span>
      {count}
    </span>
  );
}

export function ChipIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8.5" fill="#d9a520" stroke="#3a2a05" strokeWidth="1" />
      <circle cx="10" cy="10" r="8.5" stroke="#fff6dc" strokeWidth="2.2" strokeDasharray="3.1 3.6" />
      <circle cx="10" cy="10" r="4.6" fill="#b9860f" stroke="#fff6dc" strokeWidth="0.8" />
    </svg>
  );
}

const DENOMS = [1000, 500, 100, 25, 5, 1] as const;

/** A short stack of casino chips that roughly represents an amount (at most 6 chips). */
export function ChipStack({ amount, max = 6 }: { amount: number; max?: number }) {
  const chips: number[] = [];
  let left = Math.max(0, Math.round(amount));
  for (const d of DENOMS) {
    while (left >= d && chips.length < max) {
      chips.push(d);
      left -= d;
    }
  }
  if (chips.length === 0) return null;
  return (
    <span className="chip-stack" aria-hidden="true">
      {chips.map((d, i) => (
        <span key={i} className="pchip" data-v={d} />
      ))}
    </span>
  );
}

/**
 * A player's plate at the table: avatar, name, Admin badge, bot/offline flags and the
 * game-specific numbers passed as children.
 */
export function SeatTag({
  seat,
  seats,
  active,
  dealer,
  dimmed,
  compact,
  layout = "row",
  children,
  className = "",
  style,
}: {
  seat: number;
  seats: SeatInfo[];
  active?: boolean;
  dealer?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  layout?: "row" | "stack";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useT();
  const s = seats[seat];
  const name = useSeatName(seats)(seat);
  const size = compact ? 32 : 38;
  const offline = Boolean(s && !s.connected && s.occupant === "human");
  return (
    <div className={`seat ${className}`} data-active={active ? "true" : "false"} data-dimmed={dimmed ? "true" : "false"} data-offline={offline ? "true" : "false"} data-layout={layout} style={style}>
      <div className="seat-avatar">
        {s?.occupant === "human" ? (
          <Avatar id={s.user?.avatar} size={size} />
        ) : (
          <span className="rounded-full flex items-center justify-center text-[#8fd3ff] border border-white/15" style={{ width: size, height: size, background: "#0e3a4c" }}>
            <Bot size={compact ? 16 : 18} />
          </span>
        )}
        {dealer && (
          <span className="seat-badge !bg-[#f3efe4] !text-[#111] text-[9px] font-black" title={t("ui.dealer")}>
            D
          </span>
        )}
      </div>
      <div className="seat-body">
        <div className="seat-name">
          <span>{name}</span>
          {s?.user?.badges.admin && <AdminBadge />}
        </div>
        <div className="seat-meta">
          {offline && (
            <span className="seat-flag" data-tone="warn">
              <WifiOff size={10} /> {t("room.disconnected")}
            </span>
          )}
          {s?.botControlled && (
            <span className="seat-flag" data-tone="info">
              <Bot size={10} /> {t("room.botControlled")}
            </span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function SeatStat({ label, value, tone }: { label?: string; value: ReactNode; tone?: "gold" | "good" | "bad" }) {
  return (
    <span className="seat-stat" data-tone={tone}>
      {label && <span>{label}</span>}
      <b>{value}</b>
    </span>
  );
}

/** Trump shown as a small white card-stock tile in the HUD. */
export function TrumpBadge({ card, suit }: { card?: string | null; suit: string | null }) {
  const t = useT();
  return (
    <span className="hud-chip">
      <span>{t("game.trump")}:</span>
      {suit ? (
        <span className={`inline-flex items-center justify-center size-5 rounded-[5px] bg-[#fbf9f3] ${isRedSuit(suit) ? "text-[#c8102e]" : "text-[#161b24]"}`}>
          <SuitIcon suit={suit} size={13} />
          <span className="sr-only">{suitSymbol(suit)}</span>
        </span>
      ) : (
        <b className="text-[#e2c27a]">{t("game.noTrump")}</b>
      )}
      {card && card.startsWith("X") && <b className="text-[#e2c27a]">{t("ui.jokerCard")}</b>}
    </span>
  );
}

/** Wooden / leather rail with a felt (or table-top) surface inside. */
export function GameTable({
  rail,
  felt,
  print,
  className = "",
  feltClassName = "",
  children,
  style,
}: {
  rail: "walnut" | "mahogany" | "oak" | "lacquer" | "leather";
  felt: string;
  print?: string;
  className?: string;
  feltClassName?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={`gt ${className}`} data-rail={rail} style={style}>
      <div className={`gt-felt ${feltClassName}`} data-felt={felt}>
        {print && (
          <div className="felt-print" aria-hidden="true">
            {print}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Four suit tiles (plus an optional extra button) for trump or joker choices. */
export function SuitPicker({ onPick, size = "md", labelFor }: { onPick(suit: string): void; size?: "md" | "sm"; labelFor?: (suit: string) => string }) {
  return (
    <>
      {SUITS.map((s) => (
        <button key={s} type="button" className={`suit-tile ${size === "sm" ? "!h-11 !min-w-11" : ""}`} data-red={isRedSuit(s) ? "true" : "false"} onClick={() => onPick(s)}>
          <SuitIcon suit={s} size={size === "sm" ? 18 : 24} />
          {labelFor ? <span className="text-xs">{labelFor(s)}</span> : <span className="sr-only">{suitSymbol(s)}</span>}
        </button>
      ))}
    </>
  );
}
