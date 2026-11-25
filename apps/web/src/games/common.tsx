import type { ReactNode } from "react";
import { Bot, Layers } from "lucide-react";
import type { GameType, SeatInfo } from "@croco/shared/client";
import { useT } from "../i18n";
import { AdminBadge, Avatar, Countdown, SuitIcon } from "../components/ui";

export interface BoardProps<V = unknown> {
  gameType: GameType;
  view: V;
  deadline: number | null;
  mySeat: number | null;
  seats: SeatInfo[];
  onAction(action: Record<string, unknown>): void;
  /** Practice mode labels seats as "You" / "Bot n". */
  practice?: boolean;
}

export function useSeatName(seats: SeatInfo[]) {
  const t = useT();
  return (seat: number) => {
    const s = seats[seat];
    if (!s) return `#${seat + 1}`;
    if (s.occupant === "bot") return `${t("common.bot")} ${s.botName ?? ""}`.trim();
    return s.user?.username ?? `#${seat + 1}`;
  };
}

/** Seats ordered so that "me" comes last (rendered at the bottom). */
export function opponentsOrder(count: number, mySeat: number | null): number[] {
  const me = mySeat ?? -1;
  const out: number[] = [];
  for (let k = 1; k <= count; k++) {
    const s = ((me < 0 ? 0 : me) + k) % count;
    if (s !== me) out.push(s);
  }
  return mySeat === null ? Array.from({ length: count }, (_, i) => i) : out;
}

/** Sleek floating HUD bar at the top of every game table. */
export function TurnBar({ toAct, mySeat, deadline, seats, extra }: { toAct: number | null; mySeat: number | null; deadline: number | null; seats: SeatInfo[]; extra?: ReactNode }) {
  const t = useT();
  const name = useSeatName(seats);
  const mine = toAct !== null && toAct === mySeat;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm border transition-colors ${
        mine
          ? "bg-primary/18 border-primary/60 shadow-[0_0_16px_rgba(24,184,78,0.18)]"
          : "bg-bg/75 border-white/10"
      }`}
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2 font-extrabold text-white">
        <span className={`size-2.5 rounded-full shrink-0 ${toAct === null ? "bg-gold" : mine ? "bg-primary turn-dot" : "bg-muted/70"}`} aria-hidden="true" />
        <span>{toAct === null ? t("game.finished") : mine ? t("game.yourTurn") : t("game.waitingFor", { name: name(toAct) })}</span>
      </span>
      <Countdown deadline={deadline} />
      <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-text-2">{extra}</div>
    </div>
  );
}

/** Mini stacked card-back SVG icon showing an opponent's hidden card count (no emojis). */
export function MiniCardCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg/65 border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-text-2 tabular-nums">
      <Layers size={10} className="text-accent" />
      {count}
    </span>
  );
}

/** Crisp SVG poker chip badge for stacks and pots. */
export function ChipIcon({ size = 14, color = "#f5c451" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8" fill={color} stroke="#fff" strokeWidth="1.8" strokeDasharray="3.2 2.4" />
      <circle cx="10" cy="10" r="4" fill="#071117" fillOpacity="0.65" />
    </svg>
  );
}

/** Casino-grade player seat plate for card and board tables. */
export function SeatTag({
  seat,
  seats,
  active,
  dealer,
  dimmed,
  compact,
  children,
}: {
  seat: number;
  seats: SeatInfo[];
  active?: boolean;
  dealer?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const s = seats[seat];
  const name = useSeatName(seats)(seat);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border transition-all min-w-0 ${
        compact ? "px-2 py-1.5 text-[11px]" : "px-2.5 py-2 text-xs"
      } ${active ? "seat-active" : "border-white/12 bg-bg/72"} ${dimmed ? "opacity-55" : ""}`}
    >
      <div className="relative shrink-0">
        {s?.occupant === "human" ? (
          <Avatar id={s.user?.avatar} size={compact ? 26 : 30} ring={active ? "primary" : "none"} />
        ) : (
          <span
            className={`rounded-full bg-secondary/45 border flex items-center justify-center text-accent ${
              compact ? "size-6.5" : "size-7.5"
            } ${active ? "border-primary" : "border-secondary/70"}`}
          >
            <Bot size={compact ? 13 : 15} />
          </span>
        )}
        {dealer && (
          <span className="dealer-disc absolute -bottom-1 -right-1 !size-4 !text-[9px]" title={t("ui.dealer")}>
            D
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-white flex items-center gap-1 min-w-0 leading-tight">
          <span className="truncate max-w-[8.5rem]">{name}</span>
          {s?.user?.badges.admin && <AdminBadge />}
        </div>
        <div className="text-muted flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 leading-tight">
          {s && !s.connected && s.occupant === "human" && <span className="text-warning font-semibold">{t("room.disconnected")}</span>}
          {s?.botControlled && <span className="text-accent font-semibold">{t("room.botControlled")}</span>}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Crisp SVG trump indicator chip for Joker, Japanese Joker, and Bura tables. */
export function TrumpBadge({ card, suit }: { card?: string | null; suit: string | null }) {
  const t = useT();
  const red = suit === "H" || suit === "D";
  return (
    <span className="chip bg-bg/80 border border-white/15 text-text-2">
      <span className="text-muted">{t("game.trump")}:</span>
      {suit ? (
        <span className={`inline-flex items-center ${red ? "text-[#ff6b6b]" : "text-white"}`}>
          <SuitIcon suit={suit} size={13} />
        </span>
      ) : (
        <span className="text-gold">{t("game.noTrump")}</span>
      )}
      {card && card.startsWith("X") && <span className="text-gold font-black">JK</span>}
    </span>
  );
}
