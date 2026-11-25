import type { ReactNode } from "react";
import type { GameType, SeatInfo } from "@croco/shared/client";
import { useT } from "../i18n";
import { Avatar, Countdown, suitSymbol } from "../components/ui";

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

export function TurnBar({ toAct, mySeat, deadline, seats, extra }: { toAct: number | null; mySeat: number | null; deadline: number | null; seats: SeatInfo[]; extra?: ReactNode }) {
  const t = useT();
  const name = useSeatName(seats);
  const mine = toAct !== null && toAct === mySeat;
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary/20 border border-primary/50" : "bg-surface-2 border border-line"}`} aria-live="polite">
      <span className="font-semibold">{toAct === null ? t("game.finished") : mine ? t("game.yourTurn") : t("game.waitingFor", { name: name(toAct) })}</span>
      <Countdown deadline={deadline} />
      <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">{extra}</div>
    </div>
  );
}

export function SeatTag({ seat, seats, active, children }: { seat: number; seats: SeatInfo[]; active?: boolean; children?: ReactNode }) {
  const t = useT();
  const s = seats[seat];
  const name = useSeatName(seats)(seat);
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border text-xs min-w-0 ${active ? "border-primary bg-primary/10" : "border-line bg-surface-2"}`}>
      {s?.occupant === "human" ? <Avatar id={s.user?.avatar} size={24} /> : <span className="size-6 rounded-full bg-secondary/50 flex items-center justify-center text-[10px]">🤖</span>}
      <div className="min-w-0">
        <div className="font-semibold text-text-2 truncate max-w-[9rem]">
          {name} {s?.user?.badges.admin && <span className="text-gold">★</span>}
        </div>
        <div className="text-muted flex flex-wrap gap-x-2">
          {s && !s.connected && s.occupant === "human" && <span className="text-warning">{t("room.disconnected")}</span>}
          {s?.botControlled && <span className="text-accent">{t("room.botControlled")}</span>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function TrumpBadge({ card, suit }: { card?: string | null; suit: string | null }) {
  const t = useT();
  const red = suit === "H" || suit === "D";
  return (
    <span className="chip bg-surface-3 text-text-2">
      {t("game.trump")}:{" "}
      {suit ? <span className={red ? "text-red-400" : "text-white"}>{suitSymbol(suit)}</span> : t("game.noTrump")}
      {card && card.startsWith("X") ? " 🃏" : ""}
    </span>
  );
}
