import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useT } from "../i18n";
import { PlayingCard } from "./cards";
import { tiltFor } from "./common";
import { flyIn, rememberCardRect, seatRect } from "./ui/motion";

/** Remember where the selected cards are, so they fly from the hand to the felt. */
export function rememberSelection(scope: HTMLElement | null, cards: readonly string[]) {
  for (const c of cards) rememberCardRect(c, scope?.querySelector(`.phand .pcard[data-card="${c}"]`) ?? null);
}

/** The stock: face-down deck with the trump card turned crosswise underneath, and how many are left. */
export function Stock({ trumpCard, count }: { trumpCard: string | null | undefined; count: number }) {
  const t = useT();
  return (
    <div className="pstock" title={t("game.stock", { n: count })} aria-label={t("game.stock", { n: count })}>
      <div className="pstock-cards">
        {trumpCard && (
          <span className="pstock-trump">
            <PlayingCard card={trumpCard} size="pile" />
          </span>
        )}
        {count > 1 && (
          <span className="pstock-deck">
            <PlayingCard back size="pile" />
          </span>
        )}
      </div>
      <span className="pstock-count">
        <b>{count}</b> {t("table.deck")}
      </span>
    </div>
  );
}

export interface BuraPlay {
  seat: number;
  faceUp: string[] | null;
  count: number;
}

export type BuraPos = "n" | "s" | "w" | "e";

/** One player's cards in the trick; they fly in from the hand or the seat that played them. */
function TrickGroup({ play, pos, best, label, scope, animate }: { play: BuraPlay; pos: BuraPos; best: "winner" | "leading" | null; label: string; scope: RefObject<HTMLDivElement | null>; animate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!animate || !ref.current) return;
    const from = seatRect(scope.current, play.seat);
    ref.current.querySelectorAll<HTMLElement>("[data-fly]").forEach((el) => flyIn(el, el.dataset["fly"]!, from));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className="pbtrick-group" data-pos={pos} data-best={best ?? undefined} data-trick-card="true">
      <div className="pbtrick-cards">
        {play.faceUp
          ? play.faceUp.map((c) => (
              <span key={c} data-fly={c} style={{ "--tilt": tiltFor(c, 3) } as CSSProperties}>
                <PlayingCard card={c} size="trick" highlight={best === "winner" ? "winner" : undefined} />
              </span>
            ))
          : Array.from({ length: play.count }, (_, i) => (
              <span key={i} data-fly={`back-${play.seat}-${i}`}>
                <PlayingCard back size="trick" />
              </span>
            ))}
      </div>
      <span className="pbtrick-tag" data-best={best ?? undefined}>
        {label}
      </span>
    </div>
  );
}

/** The cards on the felt this trick: each player's set placed toward that player; the set that is winning is outlined. */
export function BuraTrick({
  plays,
  bestSeat,
  stage,
  posOf,
  labelOf,
  scope,
  animate,
  layout,
}: {
  plays: BuraPlay[];
  bestSeat: number | null;
  stage: "live" | "won" | "collect";
  posOf: (seat: number) => BuraPos;
  labelOf: (seat: number) => string;
  scope: RefObject<HTMLDivElement | null>;
  animate: boolean;
  layout: "duel" | "cross";
}) {
  return (
    <div className="pbtrick" data-layout={layout} data-stage={stage}>
      {plays.map((p) => (
        <TrickGroup
          key={`${p.seat}-${p.faceUp?.join("") ?? p.count}`}
          play={p}
          pos={posOf(p.seat)}
          best={bestSeat === p.seat ? (stage === "live" ? "leading" : "winner") : null}
          label={labelOf(p.seat)}
          scope={scope}
          animate={animate}
        />
      ))}
    </div>
  );
}

/** An opponent's hand as a small fan of face-down cards. */
export function OpponentHand({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  const mid = (count - 1) / 2;
  return (
    <div className="popp-hand" role="img" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ rotate: `${(i - mid) * 7}deg`, translate: `0 ${Math.abs(i - mid) * 3}px` } as CSSProperties}>
          <PlayingCard back size="pile" />
        </span>
      ))}
    </div>
  );
}

/** Captured cards: a small face-down pile with the count. */
export function CapturedPile({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="pcaptured" title={label} aria-label={label}>
      <span className="pcaptured-backs" aria-hidden="true">
        <i />
        <i />
      </span>
      <b>{count}</b>
    </span>
  );
}

export function Meter({ value, max, tone = "brand", label }: { value: number; max: number; tone?: "brand" | "gold" | "warn" | "danger"; label: ReactNode }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return (
    <span className="pmeter">
      <span className="pmeter-label">{label}</span>
      <span className="pmeter-bar" data-tone={tone} aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
