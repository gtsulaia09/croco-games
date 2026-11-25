import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { ALL_TILES, dominoesConfigSchema, dominoesEngine, openEnds, openSum, pips, roundNearest5, roundUp5, type DominoesState, type Tile } from "./index";

const cfg = (o: Record<string, unknown> = {}) => dominoesConfigSchema.parse(o);

describe("Dominoes set and deal", () => {
  it("uses the 28-tile double-six set", () => {
    expect(ALL_TILES).toHaveLength(28);
    expect(ALL_TILES.reduce((s, t) => s + pips(t), 0)).toBe(168);
  });

  it("is a two-player game: seven tiles each, the highest double opens round one", () => {
    expect(dominoesEngine.seatLimits(cfg())).toEqual({ min: 2, max: 2 });
    expect(() => dominoesEngine.create(cfg(), 3, testCtx(1))).toThrow();
    const s = dominoesEngine.create(cfg(), 2, testCtx(1));
    expect(s.hands.map((h) => h.length)).toEqual([7, 7]);
    expect(s.boneyard).toHaveLength(14);
    const doubles = s.hands.flat().filter((t) => t.split("-")[0] === t.split("-")[1]);
    if (doubles.length) {
      const highest = doubles.sort((a, b) => pips(b as Tile) - pips(a as Tile))[0];
      expect(s.opening).toBe(highest);
      expect(s.hands[s.toAct]).toContain(highest);
    }
    expect(dominoesEngine.legalActions(s, s.toAct)).toEqual([{ type: "play", tile: s.opening, end: "left" }]);
  });
});

function custom(hands: Tile[][], boneyard: Tile[] = [], variant: "draw" | "block" = "draw"): DominoesState {
  const s = dominoesEngine.create(cfg({ variant }), 2, testCtx(3));
  s.hands = hands;
  s.boneyard = boneyard;
  s.line = [];
  s.spinner = null;
  s.up = [];
  s.down = [];
  s.opening = null;
  s.toAct = 0;
  s.consecutivePasses = 0;
  s.scores = [0, 0];
  return s;
}

function play(s: DominoesState, seat: number, tile: Tile, end: "left" | "right" | "up" | "down") {
  const r = dominoesEngine.apply(s, seat, { type: "play", tile, end }, testCtx());
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("stavka (spinner) and scoring by fives", () => {
  it("makes the first double the stavka, opening up and down", () => {
    let s = custom([["5-5", "5-2", "6-6"], ["5-1", "5-3", "5-0"]]);
    s = play(s, 0, "5-5", "left");
    expect(s.spinner).toBe("5-5");
    expect(openEnds(s)).toEqual({ left: 5, right: 5, up: 5, down: 5 });
    // A lone stavka counts both halves: 10 points.
    expect(s.scores[0]).toBe(10);
    s = play(s, 1, "5-1", "up");
    expect(s.up).toEqual([{ tile: "5-1", inner: 5, outer: 1, by: 1 }]);
    // left 5 / right 5 are the stavka itself (counted once as 10) + up 1 = 11: no score.
    expect(openSum(s)).toBe(11);
    expect(s.scores[1]).toBe(0);
  });

  it("scores a multiple of five after a move; later doubles are ordinary tiles", () => {
    let s = custom([["3-2", "2-2", "1-1"], ["3-0", "0-0", "4-4"]]);
    s = play(s, 0, "3-2", "left"); // 3 + 2 = 5 → 5 points
    expect(s.scores[0]).toBe(5);
    s = play(s, 1, "3-0", "left"); // ends 0 and 2 → 2
    expect(s.scores[1]).toBe(0);
    s = play(s, 0, "2-2", "right"); // first double = stavka at the right end: 0 + 4 = 4
    expect(s.spinner).toBe("2-2");
    expect(openSum(s)).toBe(4);
    s = play(s, 1, "0-0", "left"); // not a stavka; ends 0 + 4 = 4
    expect(s.spinner).toBe("2-2");
    expect(openSum(s)).toBe(4);
  });

  it("rounds domino points to the nearest five and riba points up", () => {
    expect([12, 13, 15, 2, 3].map(roundNearest5)).toEqual([10, 15, 15, 0, 5]);
    expect([11, 15, 1].map(roundUp5)).toEqual([15, 15, 5]);
  });

  it("awards a domino the opponent's pips rounded to the nearest five", () => {
    const s = custom([["3-6"], ["6-6", "1-1"]]);
    s.line = [{ tile: "0-3", left: 0, right: 3, by: 1 }];
    const r = dominoesEngine.apply(s, 0, { type: "play", tile: "3-6", end: "right" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    // 0 + 6 = 6 after the move (no score); opponent holds 12 + 2 = 14 → 15.
    expect(r.state.lastRound).toMatchObject({ winner: 0, blocked: false, points: 15 });
    expect(r.state.scores[0]).toBe(15);
  });

  it("riba: fewer pips wins the opponent's pips rounded up; equal pips is a draw", () => {
    let s = custom([["6-6", "0-1"], ["5-6"]], [], "block");
    s.line = [{ tile: "2-3", left: 2, right: 3, by: 1 }];
    let r = dominoesEngine.apply(s, 0, { type: "pass" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    r = dominoesEngine.apply(r.state, 1, { type: "pass" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastRound).toMatchObject({ winner: 1, blocked: true, points: 15 }); // 13 → 15

    s = custom([["6-5"], ["5-6"]], [], "block");
    s.line = [{ tile: "2-3", left: 2, right: 3, by: 1 }];
    r = dominoesEngine.apply(s, 0, { type: "pass" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    r = dominoesEngine.apply(r.state, 1, { type: "pass" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastRound).toMatchObject({ winner: null, blocked: true, points: 0 });
  });
});

describe("the bazaar", () => {
  it("draws only when nothing fits and never the last two tiles", () => {
    const s = custom([["6-6"], ["0-1"]], ["2-2", "3-3", "4-4"]);
    s.line = [{ tile: "4-5", left: 4, right: 5, by: 1 }];
    expect(dominoesEngine.legalActions(s, 0)).toEqual([{ type: "draw" }]);
    expect(dominoesEngine.apply(s, 0, { type: "pass" }, testCtx())).toEqual({ ok: false, error: "cannot_pass" });
    const r = dominoesEngine.apply(s, 0, { type: "draw" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    // 4-4 fits now; with two tiles left the bazaar is closed.
    expect(r.state.boneyard).toHaveLength(2);
    expect(dominoesEngine.view(r.state, 0).drawable).toBe(0);
    const stuck = custom([["6-6"], ["0-1"]], ["2-2", "3-3"]);
    stuck.line = [{ tile: "4-5", left: 4, right: 5, by: 1 }];
    expect(dominoesEngine.legalActions(stuck, 0)).toEqual([{ type: "pass" }]);
  });

  it("hides the other hand and the bazaar", () => {
    const s = dominoesEngine.create(cfg(), 2, testCtx(5));
    for (let seat = 0; seat < 2; seat++) {
      const json = JSON.stringify(dominoesEngine.view(s, seat));
      for (const t of s.hands[1 - seat]!) expect(json).not.toContain(`"${t}"`);
      for (const t of s.boneyard) expect(json).not.toContain(`"${t}"`);
    }
  });
});

describe("Dominoes matches", () => {
  it.each(["draw", "block"] as const)("two players (%s) play to the score limit", (variant) => {
    for (const seed of [1, 2, 3]) {
      const { state, finished } = simulate(dominoesEngine, cfg({ variant, scoreLimit: 60 }), 2, seed, {
        difficulty: ["hard", "medium"],
        onStep: (st) => {
          if (st.phase !== "play") return;
          const placed = st.line.length + st.up.length + st.down.length;
          const total = st.hands.flat().length + st.boneyard.length + placed;
          expect(total).toBe(variant === "draw" ? 28 : 14);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(60);
    }
  });
});
