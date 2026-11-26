import { useEffect, useState } from "react";

export interface TrickLike<P> {
  plays: P[];
  winner: number;
}

export type TrickStage = "live" | "won" | "collect" | "idle";

/** How long a finished trick stays on the felt before it is swept to the winner. */
export const TRICK_HOLD_MS = 1100;
export const TRICK_SWEEP_MS = 480;

/**
 * Decides which trick the felt shows (presentation only):
 *  - "live": the trick being played now;
 *  - "won": a trick that just finished, held for a moment with the winning card highlighted;
 *  - "collect": the same trick while it is swept toward the winner;
 *  - "idle": nothing on the felt.
 * A trick that already existed when the board mounted is never replayed.
 */
export function useTrickStage<P extends { card: string }>(trick: P[], lastTrick: TrickLike<P> | null) {
  const sig = lastTrick ? `${lastTrick.plays.map((p) => p.card).join(",")}>${lastTrick.winner}` : "";
  const [shown, setShown] = useState<{ sig: string; phase: "won" | "collect" | "idle" }>({ sig, phase: "idle" });

  // A new finished trick arrived: show it (state derived during render, no extra effect pass).
  if (shown.sig !== sig) setShown({ sig, phase: sig ? "won" : "idle" });

  useEffect(() => {
    if (shown.phase === "won") {
      const id = setTimeout(() => setShown((s) => (s.sig === sig ? { ...s, phase: "collect" } : s)), TRICK_HOLD_MS);
      return () => clearTimeout(id);
    }
    if (shown.phase === "collect") {
      const id = setTimeout(() => setShown((s) => (s.sig === sig ? { ...s, phase: "idle" } : s)), TRICK_SWEEP_MS + 120);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [shown.phase, sig]);

  if (trick.length > 0) return { stage: "live" as TrickStage, plays: trick, winner: null as number | null };
  if (lastTrick && shown.sig === sig && shown.phase !== "idle") return { stage: shown.phase as TrickStage, plays: lastTrick.plays, winner: lastTrick.winner };
  return { stage: "idle" as TrickStage, plays: [] as P[], winner: null as number | null };
}
