import type { ReactNode } from "react";
import { Bot } from "lucide-react";
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

export function opponentsOrder(count: number, mySeat: number | null): number[] {
  const me = mySeat ?? -1;
  const out: number[] = [];
  for (let k = 1; k <= count; k++) {
    const s = ((me < 0 ? 0 : me) + k) % count;
    if (s !== me) out.push(s);
  }
  return mySeat === null ? Array.from({ length: count }, (_, i) => i) : out;
}

/** Sleek floating top arena HUD bar — replaces boxy borders with clean status pills. */
export function TurnBar({ toAct, mySeat, deadline, seats, extra }: { toAct: number | null; mySeat: number | null; deadline: number | null; seats: SeatInfo[]; extra?: ReactNode }) {
  const t = useT();
  const name = useSeatName(seats);
  const mine = toAct !== null && toAct === mySeat;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#080f18]/88 border border-white/12 px-3 py-2 text-xs sm:text-sm" aria-live="polite">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold ${
          toAct === null
            ? "bg-gold/20 text-gold border border-gold/40"
            : mine
              ? "bg-primary text-[#031a0b] shadow-[0_0_16px_rgba(0,217,95,0.35)]"
              : "bg-surface-hover text-text-2 border border-white/10"
        }`}
      >
        <span className={`size-2 rounded-full shrink-0 ${toAct === null ? "bg-gold" : mine ? "bg-[#031a0b] turn-dot" : "bg-muted"}`} aria-hidden="true" />
        <span>{toAct === null ? t("game.finished") : mine ? t("game.yourTurn") : t("game.waitingFor", { name: name(toAct) })}</span>
      </span>
      <Countdown deadline={deadline} />
      <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-text-2">{extra}</div>
    </div>
  );
}

/** Mini fanned card-back visual badge showing opponent card count. */
export function MiniCardCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/12 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
      <span className="inline-flex -space-x-1" aria-hidden="true">
        <span className="inline-block w-2.5 h-3.5 rounded-[2px] bg-[#1c3d5a] border border-gold/55 -rotate-6" />
        <span className="inline-block w-2.5 h-3.5 rounded-[2px] bg-[#13293d] border border-gold/55 rotate-6" />
      </span>
      <span>{count}</span>
    </span>
  );
}

export function ChipIcon({ size = 14, color = "#ffc845" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="8" fill={color} stroke="#fff" strokeWidth="1.8" strokeDasharray="3.2 2.4" />
      <circle cx="10" cy="10" r="4" fill="#060b11" fillOpacity="0.7" />
    </svg>
  );
}

/** Modern floating capsule player pod (GGPoker / Aurora style). */
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
      className={`seat-pod flex items-center gap-2.5 min-w-0 ${
        compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
      } ${active ? "seat-active" : ""} ${dimmed ? "opacity-50" : ""}`}
    >
      <div className="relative shrink-0">
        {s?.occupant === "human" ? (
          <Avatar id={s.user?.avatar} size={compact ? 30 : 36} ring={active ? "primary" : "none"} />
        ) : (
          <span
            className={`rounded-full bg-[#17283b] border flex items-center justify-center text-accent shadow-inner ${
              compact ? "size-7.5" : "size-9"
            } ${active ? "border-primary ring-2 ring-primary/40" : "border-white/15"}`}
          >
            <Bot size={compact ? 14 : 17} />
          </span>
        )}
        {dealer && (
          <span className="dealer-disc absolute -bottom-1 -right-1 !size-4.5 !text-[9px]" title={t("ui.dealer")}>
            D
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-white flex items-center gap-1.5 min-w-0 leading-tight">
          <span className="truncate max-w-[8.5rem]">{name}</span>
          {s?.user?.badges.admin && <AdminBadge />}
        </div>
        <div className="text-text-2/85 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 leading-tight">
          {s && !s.connected && s.occupant === "human" && <span className="text-warning font-semibold">{t("room.disconnected")}</span>}
          {s?.botControlled && <span className="text-accent font-semibold">{t("room.botControlled")}</span>}
          {children}
        </div>
      </div>
    </div>
  );
}

/** High-visibility Trump pill with bright white card badge for suit legibility. */
export function TrumpBadge({ card, suit }: { card?: string | null; suit: string | null }) {
  const t = useT();
  const red = suit === "H" || suit === "D";
  return (
    <span className="chip bg-[#0e1926] border border-white/18 text-white gap-1.5">
      <span className="text-muted">{t("game.trump")}:</span>
      {suit ? (
        <span className={`inline-flex items-center justify-center size-4.5 rounded bg-white ${red ? "text-[#e11d48]" : "text-[#0f172a]"}`}>
          <SuitIcon suit={suit} size={12} />
        </span>
      ) : (
        <span className="text-gold font-bold">{t("game.noTrump")}</span>
      )}
      {card && card.startsWith("X") && <span className="text-gold font-black">JK</span>}
    </span>
  );
}
