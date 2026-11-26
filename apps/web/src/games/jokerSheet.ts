import type { JokerView } from "@croco/game-engine/games/joker";

/**
 * The Joker score sheet (ოქმი) built from the public game view — presentation only. Scores,
 * bonuses and totals are taken from the engine as they are; nothing is recalculated except the
 * per-set subtotals, which are plain sums of the engine's own numbers.
 */

export type SheetView = Pick<JokerView, "ruleset" | "handNumber" | "phase" | "bids" | "tricks" | "history" | "bonuses" | "totals">;

export interface SheetCell {
  bid: number | null;
  tricks: number | null;
  /** null while the hand is not finished. */
  points: number | null;
  /** Declaration met exactly (null while the hand is not finished). */
  made: boolean | null;
}

export interface SheetRow {
  hand: number;
  cards: number;
  status: "done" | "current" | "upcoming";
  cells: SheetCell[];
}

export interface SheetSet {
  /** 0-based, as in the engine's history records. */
  index: number;
  cards: number[];
  rows: SheetRow[];
  /** Sum of finished hands plus the set's bonuses (premia), per seat. */
  subtotal: number[];
  bonus: number[];
  complete: boolean;
  active: boolean;
}

const PLAYERS = 4;

/** Deals per set: standard 1→8, 4×9, 8→1, 4×9; "nines" four sets of four nine-card deals. */
export function jokerSchedule(ruleset: JokerView["ruleset"]): number[][] {
  if (ruleset === "nines") return [[9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9]];
  return [[1, 2, 3, 4, 5, 6, 7, 8], [9, 9, 9, 9], [8, 7, 6, 5, 4, 3, 2, 1], [9, 9, 9, 9]];
}

export function buildSheet(view: SheetView): { sets: SheetSet[]; totals: number[]; leaders: number[] } {
  const schedule = jokerSchedule(view.ruleset);
  const byHand = new Map(view.history.map((h) => [h.hand, h]));
  let hand = 0;
  const sets = schedule.map((cardsInSet, index): SheetSet => {
    const rows = cardsInSet.map((cards): SheetRow => {
      hand += 1;
      const rec = byHand.get(hand);
      if (rec) {
        return {
          hand,
          cards: rec.cards,
          status: "done",
          cells: Array.from({ length: PLAYERS }, (_, s) => ({
            bid: rec.bids[s] ?? 0,
            tricks: rec.tricks[s] ?? 0,
            points: rec.scores[s] ?? 0,
            made: rec.bids[s] === rec.tricks[s],
          })),
        };
      }
      const current = view.phase !== "over" && hand === view.handNumber;
      return {
        hand,
        cards,
        status: current ? "current" : "upcoming",
        cells: Array.from({ length: PLAYERS }, (_, s) => ({
          bid: current ? (view.bids[s] ?? null) : null,
          tricks: current && view.phase === "play" ? (view.tricks[s] ?? 0) : null,
          points: null,
          made: null,
        })),
      };
    });
    const bonus = Array.from({ length: PLAYERS }, (_, s) => view.bonuses.filter((b) => b.set === index && b.seat === s).reduce((sum, b) => sum + b.amount, 0));
    const subtotal = Array.from({ length: PLAYERS }, (_, s) => rows.reduce((sum, r) => sum + (r.cells[s]!.points ?? 0), 0) + bonus[s]!);
    return {
      index,
      cards: cardsInSet,
      rows,
      bonus,
      subtotal,
      complete: rows.every((r) => r.status === "done"),
      active: rows.some((r) => r.status === "current"),
    };
  });
  const max = Math.max(...view.totals);
  const leaders = view.history.length ? view.totals.flatMap((v, s) => (v === max ? [s] : [])) : [];
  return { sets, totals: [...view.totals], leaders };
}
