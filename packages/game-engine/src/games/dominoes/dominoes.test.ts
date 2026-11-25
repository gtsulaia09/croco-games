import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { ALL_TILES, dominoesConfigSchema, dominoesEngine, lineEnds, pips, type DominoesState, type Tile } from "./index";

const cfg = (o: Record<string, unknown> = {}) => dominoesConfigSchema.parse(o);

describe("Dominoes set and deal", () => {
  it("uses the 28-tile double-six set", () => {
    expect(ALL_TILES).toHaveLength(28);
    expect(ALL_TILES.reduce((s, t) => s + pips(t), 0)).toBe(168);
  });

  it("deals seven tiles and opens round one with the highest double", () => {
    const s = dominoesEngine.create(cfg(), 2, testCtx(1));
    expect(s.hands.map((h) => h.length)).toEqual([7, 7]);
    expect(s.boneyard).toHaveLength(14);
    const doubles = s.hands.flat().filter((t) => t.split("-")[0] === t.split("-")[1]);
    if (doubles.length) {
      const highest = doubles.sort((a, b) => pips(b as Tile) - pips(a as Tile))[0];
      expect(s.opening).toBe(highest);
      expect(s.hands[s.toAct]).toContain(highest);
    }
    const legal = dominoesEngine.legalActions(s, s.toAct);
    expect(legal).toEqual([{ type: "play", tile: s.opening, end: "left" }]);
  });

  it("has no boneyard in the block variant", () => {
    expect(dominoesEngine.create(cfg({ variant: "block" }), 3, testCtx(2)).boneyard).toHaveLength(0);
  });
});

function custom(hands: Tile[][], boneyard: Tile[] = [], variant: "draw" | "block" = "draw"): DominoesState {
  const s = dominoesEngine.create(cfg({ variant }), hands.length, testCtx(3));
  s.hands = hands;
  s.boneyard = boneyard;
  s.line = [];
  s.opening = null;
  s.toAct = 0;
  s.consecutivePasses = 0;
  return s;
}

describe("Dominoes placement rules", () => {
  it("places tiles on matching ends and orients them", () => {
    let s = custom([["3-5", "1-5"], ["0-0", "2-4"]]);
    const ctx = testCtx();
    const r = dominoesEngine.apply(s, 0, { type: "play", tile: "3-5", end: "left" }, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(lineEnds(s.line)).toEqual({ left: 3, right: 5 });
    expect(dominoesEngine.apply(s, 1, { type: "play", tile: "2-4", end: "right" }, ctx)).toEqual({ ok: false, error: "tile_does_not_fit" });
  });

  it("forces drawing only when no tile fits, and passing only when the boneyard is empty", () => {
    const s = custom([["6-6"], ["0-1", "1-2"]], ["2-2", "3-3"]);
    s.line = [{ tile: "4-5", left: 4, right: 5, by: 1 }];
    expect(dominoesEngine.legalActions(s, 0)).toEqual([{ type: "draw" }]);
    expect(dominoesEngine.apply(s, 0, { type: "pass" }, testCtx())).toEqual({ ok: false, error: "cannot_pass" });
    const blocked = custom([["6-6"], ["0-1"]], [], "block");
    blocked.line = [{ tile: "4-5", left: 4, right: 5, by: 1 }];
    expect(dominoesEngine.legalActions(blocked, 0)).toEqual([{ type: "pass" }]);
  });

  it("scores opponents' pips when a player dominoes", () => {
    const s = custom([["3-5"], ["6-6", "1-2"]]);
    s.line = [{ tile: "0-3", left: 0, right: 3, by: 1 }];
    const r = dominoesEngine.apply(s, 0, { type: "play", tile: "3-5", end: "right" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastRound).toMatchObject({ winner: 0, blocked: false, points: 15 });
    expect(r.state.scores[0]).toBe(15);
  });

  it("detects a blocked game and awards the lowest hand", () => {
    let s = custom([["6-6", "0-1"], ["5-5"]], [], "block");
    s.line = [{ tile: "2-3", left: 2, right: 3, by: 1 }];
    const ctx = testCtx();
    let r = dominoesEngine.apply(s, 0, { type: "pass" }, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    r = dominoesEngine.apply(s, 1, { type: "pass" }, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastRound).toMatchObject({ winner: 1, blocked: true, points: 13 });
  });

  it("hides other hands and the boneyard", () => {
    const s = dominoesEngine.create(cfg(), 3, testCtx(5));
    for (let seat = 0; seat < 3; seat++) {
      const json = JSON.stringify(dominoesEngine.view(s, seat));
      for (let o = 0; o < 3; o++) if (o !== seat) for (const t of s.hands[o]!) expect(json).not.toContain(`"${t}"`);
      for (const t of s.boneyard) expect(json).not.toContain(`"${t}"`);
    }
  });
});

describe("Dominoes matches", () => {
  it.each([
    [2, "draw"],
    [3, "draw"],
    [4, "block"],
    [2, "block"],
  ] as const)("%i players (%s) play to the score limit", (players, variant) => {
    for (const seed of [1, 2]) {
      const { state, finished } = simulate(dominoesEngine, cfg({ variant, scoreLimit: 60 }), players, seed, {
        difficulty: ["hard", "medium", "easy", "hard"],
        onStep: (st) => {
          if (st.phase !== "play") return;
          const total = st.hands.flat().length + st.boneyard.length + st.line.length;
          // In the block variant undealt tiles sleep out of play.
          expect(total).toBe(variant === "draw" || players === 4 ? 28 : players * 7);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(60);
    }
  });
});
