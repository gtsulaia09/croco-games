import { useState, type CSSProperties, type ReactNode } from "react";
import { Bot, WifiOff } from "lucide-react";
import type { SeatInfo } from "@croco/shared/client";
import { useT } from "../../i18n";
import { AdminBadge, Avatar, useCountdown } from "../../components/ui";
import { useSeatName } from "../common";

/**
 * Seconds left on the current move and the share of the move time still remaining. The total is
 * taken when a new deadline first appears (rooms choose their own move time).
 */
function useTurnClock(deadline: number | null) {
  const left = useCountdown(deadline);
  const [span, setSpan] = useState<{ deadline: number | null; total: number }>({ deadline: null, total: 30 });
  // The first reading after a new deadline is the full move time.
  if (deadline !== span.deadline) setSpan({ deadline, total: left !== null ? Math.max(5, left) : 30 });
  const progress = left === null ? null : Math.max(0, Math.min(1, left / span.total));
  return { left, progress };
}

/**
 * A player's place at the table: avatar with a turn ring (a countdown sweep when the server
 * sets a deadline), dealer chip, name, connection / bot flags and the game's own numbers.
 * `data-seat-anchor` marks the avatar as the origin and target of card flights.
 */
export function PlayerSeat({
  seat,
  seats,
  active,
  deadline,
  dealer,
  you,
  layout = "row",
  badge,
  cards,
  children,
  className = "",
  style,
}: {
  seat: number;
  seats: SeatInfo[];
  active?: boolean;
  deadline?: number | null;
  dealer?: boolean;
  /** The local player's own seat. */
  you?: boolean;
  /** row: avatar beside the text (top / bottom seats); column: avatar above (side seats). */
  layout?: "row" | "column";
  /** Big status bubble beside the avatar (e.g. a Joker declaration). */
  badge?: ReactNode;
  /** Face-down card counter for opponents. */
  cards?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useT();
  const s = seats[seat];
  const name = useSeatName(seats)(seat);
  const offline = Boolean(s && !s.connected && s.occupant === "human");
  const { left, progress } = useTurnClock(active ? (deadline ?? null) : null);
  const urgent = left !== null && left <= 5;

  return (
    <div
      className={`pseat ${className}`}
      data-layout={layout}
      data-active={active ? "true" : "false"}
      data-offline={offline ? "true" : "false"}
      data-you={you ? "true" : "false"}
      style={style}
    >
      <div className="pseat-avatar" data-seat-anchor={seat}>
        <span
          className="pseat-ring"
          data-timed={progress !== null ? "true" : "false"}
          data-urgent={urgent ? "true" : "false"}
          style={progress !== null ? ({ "--p": progress } as CSSProperties) : undefined}
          aria-hidden="true"
        />
        {s?.occupant === "human" ? (
          <Avatar id={s.user?.avatar} size={48} />
        ) : (
          <span className="pseat-bot" aria-hidden="true">
            <Bot size={22} />
          </span>
        )}
        {dealer && (
          <span className="pseat-dealer" title={t("ui.dealer")}>
            D
          </span>
        )}
        {left !== null && (
          <span className="pseat-timer" data-urgent={urgent ? "true" : "false"}>
            {left}
          </span>
        )}
        {badge}
      </div>
      <div className="pseat-body">
        <div className="pseat-name">
          <span className="truncate">{name}</span>
          {s?.user?.badges.admin && <AdminBadge />}
        </div>
        <div className="pseat-meta">
          {offline && (
            <span className="pseat-flag" data-tone="warn">
              <WifiOff size={11} /> {t("room.disconnected")}
            </span>
          )}
          {s?.botControlled && (
            <span className="pseat-flag" data-tone="info">
              <Bot size={11} /> {t("room.botControlled")}
            </span>
          )}
          {children}
          {cards !== undefined && <CardCount count={cards} />}
        </div>
      </div>
    </div>
  );
}

/** A small stack of card backs with the number of cards a player still holds. */
export function CardCount({ count }: { count: number }) {
  const t = useT();
  return (
    <span className="pcount" title={t("table.cardsInHand", { n: count })} aria-label={t("table.cardsInHand", { n: count })}>
      <span aria-hidden="true" className="pcount-backs">
        <i />
        <i />
        <i />
      </span>
      <b>{count}</b>
    </span>
  );
}

/** One labelled number on a seat plate. */
export function SeatNumber({ label, value, tone }: { label?: string; value: ReactNode; tone?: "gold" | "good" | "bad" | "muted" }) {
  return (
    <span className="pstat" data-tone={tone}>
      {label && <span>{label}</span>}
      <b>{value}</b>
    </span>
  );
}
