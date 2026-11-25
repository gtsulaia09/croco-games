import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import {
  absIndex,
  analyseTurn,
  applySingle,
  backgammonConfigSchema,
  backgammonEngine,
  HEAD,
  illegalBlock,
  initialPosition,
  pipCount,
  relCount,
  relPoint,
  type BackgammonState,
  type Position,
} from "./index";

const cfg = (o: Record<string, unknown> = {}) => backgammonConfigSchema.parse(o);

/** Builds a position from {player: {rel: count}}. */
function position(stones: Record<0 | 1, Record<number, number>>, off: [number, number] = [0, 0]): Position {
  const points = new Array<number>(24).fill(0);
  for (const player of [0, 1] as const) {
    for (const [rel, n] of Object.entries(stones[player])) points[absIndex(player, Number(rel))]! += n * (player === 0 ? 1 : -1);
  }
  return { points, off };
}

describe("long nardi board", () => {
  it("starts with all fifteen stones on each player's head, diagonally opposite", () => {
    const p = initialPosition();
    expect(relCount(p, 0, HEAD)).toBe(15);
    expect(relCount(p, 1, HEAD)).toBe(15);
    // White's head is black's point 12 and vice versa.
    expect(relPoint(1, absIndex(0, HEAD))).toBe(12);
    expect(relPoint(0, absIndex(1, HEAD))).toBe(12);
    expect(pipCount(p, 0)).toBe(15 * 24);
    for (let rel = 1; rel <= 24; rel++) for (const pl of [0, 1]) expect(relPoint(pl, absIndex(pl, rel))).toBe(rel);
  });

  it("never lets a stone land on a point holding an opponent stone (no hitting)", () => {
    const p = position({ 0: { 24: 14, 20: 1 }, 1: { 24: 14, 3: 1 } });
    // White's point 15 is black's point 3 → occupied by one black stone.
    expect(relPoint(1, absIndex(0, 15))).toBe(3);
    expect(applySingle(p, 0, 20, 5)).toBeNull();
    expect(applySingle(p, 0, 20, 4)).not.toBeNull();
  });

  it("allows only one stone from the head per turn, two on a first 6-6, 4-4 or 3-3", () => {
    const start = initialPosition();
    const plain = analyseTurn(start, 0, [5, 3], false);
    for (const { moves } of plain.finals.values()) expect(moves.filter((m) => m.from === HEAD)).toHaveLength(1);
    const sixes = analyseTurn(start, 0, [6, 6, 6, 6], true);
    // 24→18 twice; the next six would land on the opponent's head, so only two moves are possible.
    expect(sixes.maxDice).toBe(2);
    expect([...sixes.finals.values()][0]!.moves).toEqual([
      { from: 24, to: 18 },
      { from: 24, to: 18 },
    ]);
    const laterSixes = analyseTurn(start, 0, [6, 6, 6, 6], false);
    expect([...laterSixes.finals.values()].every(({ moves }) => moves.filter((m) => m.from === HEAD).length === 1)).toBe(true);
    const fives = analyseTurn(start, 0, [5, 5, 5, 5], true);
    expect([...fives.finals.values()].every(({ moves }) => moves.filter((m) => m.from === HEAD).length === 1)).toBe(true);
  });

  it("forbids a six-point block until an opponent stone has passed it", () => {
    // White holds 18..23 (six in a row) in front of all black stones on black's head.
    const block = position({ 0: { 24: 9, 23: 1, 22: 1, 21: 1, 20: 1, 19: 1, 18: 1 }, 1: { 24: 15 } });
    expect(illegalBlock(block, 0)).toBe(true);
    // The same block is fine once a black stone has gone past it.
    const passed = position({ 0: { 24: 9, 23: 1, 22: 1, 21: 1, 20: 1, 19: 1, 18: 1 }, 1: { 24: 14, 1: 1 } });
    expect(illegalBlock(passed, 0)).toBe(false);
    // Five in a row is always allowed (the head counts as a held point).
    const five = position({ 0: { 24: 10, 22: 1, 21: 1, 20: 1, 19: 1, 18: 1 }, 1: { 24: 15 } });
    expect(illegalBlock(five, 0)).toBe(false);
    // A move that would close the gap and complete a forbidden block is rejected.
    expect(applySingle(five, 0, 24, 1)).toBeNull();
    expect(applySingle(five, 0, 24, 2)).not.toBeNull();
  });

  it("must play both dice when possible, else the larger one", () => {
    // A lone stone uses both dice: 4→3 with the 1, then bears off with the 6.
    const both = analyseTurn(position({ 0: { 4: 1 }, 1: { 24: 15 } }, [14, 0]), 0, [6, 1], false);
    expect(both.maxDice).toBe(2);
    // Either die alone is playable from 13, but not both (black holds white's point 2): the 6 must be played.
    const one = analyseTurn(position({ 0: { 13: 1 }, 1: { 24: 14, 14: 1 } }, [14, 0]), 0, [6, 5], false);
    expect(one.maxDice).toBe(1);
    expect([...one.finals.values()].map((f) => f.moves)).toEqual([[{ from: 13, to: 7 }]]);
  });

  it("bears off exactly, or from the farthest stone with a larger die", () => {
    const p = position({ 0: { 5: 1, 2: 1 }, 1: { 24: 15 } }, [13, 0]);
    expect(applySingle(p, 0, 2, 6)).toBeNull(); // a stone is still on 5
    expect(applySingle(p, 0, 5, 6)?.move).toEqual({ from: 5, to: 0 });
    expect(applySingle(p, 0, 5, 3)?.move).toEqual({ from: 5, to: 2 }); // move inside home
    const notHome = position({ 0: { 7: 1, 2: 1 }, 1: { 24: 15 } }, [13, 0]);
    expect(applySingle(notHome, 0, 2, 2)).toBeNull();
  });
});

describe("long nardi play", () => {
  it("decides the starter with single dice, then the starter rolls both dice", () => {
    const s = backgammonEngine.create(cfg(), 2, testCtx(3));
    expect(s.openingRoll![0]).not.toBe(s.openingRoll![1]);
    expect(s.toAct).toBe(s.openingRoll![0] > s.openingRoll![1] ? 0 : 1);
    expect(s.phase).toBe("preroll");
    expect(backgammonEngine.legalActions(s, s.toAct)).toEqual([{ type: "roll" }]);
    const r = backgammonEngine.apply(s, s.toAct, { type: "roll" }, testCtx(3));
    expect(r.ok).toBe(true);
  });

  it("rejects a second stone from the head on a normal turn", () => {
    const s: BackgammonState = backgammonEngine.create(cfg(), 2, testCtx(4));
    s.toAct = 0;
    s.phase = "move";
    s.dice = [5, 3];
    s.hadTurn = [true, true];
    const r = backgammonEngine.apply(s, 0, { type: "move", moves: [{ from: 24, to: 19 }, { from: 24, to: 21 }] }, testCtx());
    expect(r).toEqual({ ok: false, error: "one_stone_from_head" });
    expect(backgammonEngine.apply(s, 0, { type: "move", moves: [{ from: 24, to: 19 }, { from: 19, to: 16 }] }, testCtx()).ok).toBe(true);
  });

  it("scores 2 for a mars and 1 otherwise", () => {
    const s: BackgammonState = backgammonEngine.create(cfg({ matchLength: 7 }), 2, testCtx(5));
    s.pos = position({ 0: { 1: 1 }, 1: { 24: 15 } }, [14, 0]);
    s.toAct = 0;
    s.phase = "move";
    s.dice = [2, 1];
    s.hadTurn = [true, true];
    const r = backgammonEngine.apply(s, 0, { type: "move", moves: [{ from: 1, to: 0 }] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastGame).toMatchObject({ winner: 0, points: 2, kind: "mars" });
    expect(r.state.scores).toEqual([2, 0]);
  });

  it("plays whole matches with legal bot moves", () => {
    for (const [seed, matchLength] of [[1, 1], [2, 3], [3, 1]] as const) {
      const { state, finished } = simulate(backgammonEngine, cfg({ matchLength }), 2, seed, {
        difficulty: ["hard", "medium"],
        onStep: (st) => {
          for (const pl of [0, 1]) {
            let stones = st.pos.off[pl]!;
            for (let rel = 1; rel <= 24; rel++) stones += Math.max(0, relCount(st.pos, pl, rel));
            expect(stones).toBe(15);
          }
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(matchLength);
    }
  });
});
