import type { CSSProperties, ReactNode } from "react";
import { useT } from "../i18n";
import { PlayingCard } from "./cards";
import { tiltFor } from "./common";

/** The stock: face-down deck with the trump card turned crosswise underneath it. */
export function Stock({ trumpCard, count }: { trumpCard: string | null | undefined; count: number }) {
  const t = useT();
  return (
    <div className="grid justify-items-center gap-1.5" title={t("game.stock", { n: count })}>
      <div className="stock" style={{ "--cw": "clamp(48px, 4.2vw + 20px, 72px)" } as CSSProperties}>
        {trumpCard && (
          <span className="stock-trump">
            <PlayingCard card={trumpCard} size="sm" />
          </span>
        )}
        {count > 0 && (
          <span className="stock-deck">
            <PlayingCard back size="sm" />
          </span>
        )}
        {count > 0 && <span className="stock-count">{count}</span>}
      </div>
      <span className="felt-label">{t("game.trump")}</span>
    </div>
  );
}

export interface BuraPlay {
  seat: number;
  faceUp: string[] | null;
  count: number;
}

/** Cards on the table this trick; the currently winning set is outlined. */
export function BuraTrick({ plays, bestSeat, mySeat, name }: { plays: BuraPlay[]; bestSeat: number | null; mySeat: number | null; name: (s: number) => string }) {
  return (
    <div className="bura-trick" style={{ "--cw": "clamp(48px, 4.2vw + 20px, 72px)" } as CSSProperties}>
      {plays.map((p) => {
        const best = bestSeat === p.seat;
        const from = { "--from-y": p.seat === mySeat ? "80px" : "-80px" } as CSSProperties;
        return (
          <div key={p.seat} className="bura-play" data-best={best ? "true" : "false"}>
            <div className="bura-cards">
              {p.faceUp
                ? p.faceUp.map((c) => <PlayingCard key={c} card={c} size="sm" animate="play" style={{ ...from, "--tilt": tiltFor(c, 3) } as CSSProperties} className="[rotate:var(--tilt)]" />)
                : Array.from({ length: p.count }, (_, i) => <PlayingCard key={i} back size="sm" animate="play" style={from} />)}
            </div>
            <span className="trick-tag !static !translate-x-0" data-tone={best ? "win" : undefined}>
              {name(p.seat)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Captured cards: a small face-down pile with the count. */
export function CapturedPile({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="pile" title={String(count)}>
      <PlayingCard back size="xs" />
      <span className="stock-count !-right-2 !-bottom-1.5 !min-w-5 !h-5 !text-[11px]">{count}</span>
    </span>
  );
}

export function Meter({ value, max, tone = "brand", label }: { value: number; max: number; tone?: "brand" | "gold" | "warn" | "danger"; label: ReactNode }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return (
    <span className="meter-wrap">
      <span className="meter-label">{label}</span>
      <span className="meter" data-tone={tone} aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
