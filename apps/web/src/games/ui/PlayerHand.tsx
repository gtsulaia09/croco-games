import { useState, type CSSProperties, type MouseEvent } from "react";
import { useT } from "../../i18n";
import { PlayingCard, type CardSize } from "../cards";
import { rememberCardRect } from "./motion";

export interface HandEntry {
  card: string;
  /** Legal now (false = shaded and not clickable while a legal-move filter is active). */
  playable?: boolean;
  /** Externally selected (multi-select games such as Bura). */
  selected?: boolean;
}

/** Touch screens without hover: first tap lifts the card, a second tap plays it. */
function coarsePointer(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(hover: none) and (pointer: coarse)").matches);
}

/**
 * The player's hand as an overlapping fan. Overlap is computed in CSS from the hand's own width
 * (cards never shrink below a readable size; very long hands scroll instead). Cards keep their
 * order, so suits stay grouped.
 *
 *  - mode "play": clicking a playable card plays it (two taps on touch screens: lift, then play);
 *  - mode "select": clicking toggles selection (the parent keeps the selection).
 */
export function PlayerHand({
  cards,
  label,
  dealKey,
  mode = "play",
  onPick,
  size = "hand",
  active = true,
}: {
  cards: HandEntry[];
  label: string;
  dealKey?: string | number;
  mode?: "play" | "select";
  onPick?: (card: string) => void;
  size?: CardSize;
  /** false: the hand is visible but not interactive (not your turn). */
  active?: boolean;
}) {
  const t = useT();
  const [armed, setArmed] = useState<string | null>(null);
  const n = cards.length;
  const mid = (n - 1) / 2;
  const spread = Math.min(2.4, 18 / Math.max(n, 1));
  const live = active && Boolean(onPick);
  const armedCard = live && armed && cards.some((c) => c.card === armed && c.playable !== false) ? armed : null;

  function click(card: string, e: MouseEvent<HTMLButtonElement>) {
    if (!onPick) return;
    if (mode === "play" && coarsePointer() && armedCard !== card) {
      setArmed(card);
      return;
    }
    if (mode === "play") rememberCardRect(card, e.currentTarget);
    setArmed(null);
    onPick(card);
  }

  return (
    <div className="phand-wrap" data-mode={mode} data-live={live ? "true" : "false"}>
      <div key={dealKey} className="phand" role="group" aria-label={label} style={{ "--gaps": Math.max(1, n - 1) } as CSSProperties}>
        {cards.map((c, i) => {
          const off = i - mid;
          const vars = {
            "--fan-r": n > 2 ? `${(off * spread).toFixed(2)}deg` : "0deg",
            "--fan-y": n > 2 ? `${(off * off * Math.min(1.3, 11 / ((n * n) / 4 + 1))).toFixed(2)}px` : "0px",
            "--deal-i": i,
            zIndex: i + 1,
          } as CSSProperties;
          const legal = c.playable !== false;
          return (
            <PlayingCard
              key={c.card}
              card={c.card}
              size={size}
              playable={!live || legal}
              selected={Boolean(c.selected) || armedCard === c.card}
              onClick={live && legal ? (e) => click(c.card, e) : undefined}
              asButton
              animate="deal"
              style={vars}
            />
          );
        })}
      </div>
      {armedCard && <p className="phand-hint">{t("table.tapAgain")}</p>}
    </div>
  );
}
