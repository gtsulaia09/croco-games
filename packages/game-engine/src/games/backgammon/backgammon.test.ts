import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import {
  absIndex,
  analyseTurn,
  applySingle,
  backgammonConfigSchema,
  backgammonEngine,
  initialPosition,
  pipCount,
  type BackgammonState,
  type Position,
} from "./index";

const cfg = (o: Record<string, unknown> = {}) => backgammonConfigSchema.parse(o);

function emptyPos(): Position {
  return { points: new Array<number>(24).fill(0), bar: [0, 0], off: [0, 0] };
}
/** Place checkers using player-relative point numbers. */
function put(pos: Position, player: number, rel: number, count: number) {
  pos.points[absIndex(player, rel)] = player === 0 ? count : -count;
}

describe("backgammon setup", () => {
  it("starts with 15 checkers each and 167 pips", () => {
    const p = initialPosition();
    expect(p.points.filter((c) => c > 0).reduce((a, b) => a + b, 0)).toBe(15);
    expect(p.points.filter((c) => c < 0).reduce((a, b) => a - b, 0)).toBe(15);
    expect(pipCount(p, 0)).toBe(167);
    expect(pipCount(p, 1)).toBe(167);
  });

  it("decides the opening roll with two different dice and the higher die starts", () => {
    const s = backgammonEngine.create(cfg(), 2, testCtx(3));
    const [a, b] = s.openingRoll!;
    expect(a).not.toBe(b);
    expect(s.toAct).toBe(a > b ? 0 : 1);
    expect(s.dice).toEqual([a, b]);
  });
});

describe("movement rules", () => {
  it("cannot land on a point with two or more opposing checkers", () => {
    const p = initialPosition();
    // Player 0 from 24 with a 5 lands on 19 — the opponent's 6-point (5 checkers).
    expect(applySingle(p, 0, 24, 5)).toBeNull();
    expect(applySingle(p, 0, 24, 3)).not.toBeNull();
  });

  it("hits a blot and sends it to the bar", () => {
    const p = emptyPos();
    put(p, 0, 10, 1);
    put(p, 1, 18, 1); // player 1's 18 = player 0's 7
    const r = applySingle(p, 0, 10, 3)!;
    expect(r.hit).toBe(true);
    expect(r.pos.bar[1]).toBe(1);
  });

  it("must enter from the bar first and respects blocked entry points", () => {
    const p = emptyPos();
    p.bar[0] = 1;
    put(p, 0, 13, 2);
    put(p, 1, 6, 2); // player 1's 6 = player 0's 19 (entry with a 6)
    expect(applySingle(p, 0, 13, 2)).toBeNull(); // cannot move other checkers while on the bar
    expect(applySingle(p, 0, 25, 6)).toBeNull(); // blocked
    expect(applySingle(p, 0, 25, 5)!.move).toEqual({ from: 25, to: 20 });
  });

  it("bears off exactly, and with a higher die only from the highest point", () => {
    const p = emptyPos();
    put(p, 0, 5, 1);
    put(p, 0, 3, 14);
    expect(applySingle(p, 0, 3, 6)).toBeNull(); // a checker on 5 is higher
    expect(applySingle(p, 0, 5, 6)!.move).toEqual({ from: 5, to: 0 });
    expect(applySingle(p, 0, 3, 3)!.move).toEqual({ from: 3, to: 0 });
  });

  it("forbids bearing off while a checker is outside the home board", () => {
    const p = emptyPos();
    put(p, 0, 8, 1);
    put(p, 0, 2, 14);
    expect(applySingle(p, 0, 2, 2)).toBeNull();
  });

  it("requires using both dice when possible", () => {
    const p = initialPosition();
    const a = analyseTurn(p, 0, [3, 1]);
    expect(a.maxDice).toBe(2);
    for (const f of a.finals.values()) expect(f.moves).toHaveLength(2);
  });

  it("requires the larger die when only one die can be played", () => {
    // Player 0: one checker on 20; opponent blocks 14 and everything reachable after a 6 then 1.
    const p = emptyPos();
    put(p, 0, 20, 1);
    put(p, 0, 1, 14);
    for (const rel of [19, 13, 12]) put(p, 1, 25 - rel, 2);
    // From 20: a 1 → 19 blocked; a 6 → 14 open; then 14 − 1 = 13 blocked. Either die alone is
    // possible only via the 6 here, so the larger-die rule keeps the 6.
    const a = analyseTurn(p, 0, [6, 1]);
    expect(a.maxDice).toBe(1);
    for (const f of a.finals.values()) expect(f.moves[0]).toEqual({ from: 20, to: 14 });
  });

  it("plays four moves on doubles", () => {
    const a = analyseTurn(initialPosition(), 0, [2, 2, 2, 2]);
    expect(a.maxDice).toBe(4);
  });

  it("rejects incomplete or illegal sequences through the engine", () => {
    const s = backgammonEngine.create(cfg({ doublingCube: false }), 2, testCtx(4));
    const seat = s.toAct;
    expect(backgammonEngine.apply(s, seat, { type: "move", moves: [] }, testCtx()).ok).toBe(false);
    expect(backgammonEngine.apply(s, seat, { type: "move", moves: [{ from: 24, to: 1 }, { from: 24, to: 2 }] }, testCtx()).ok).toBe(false);
    expect(backgammonEngine.apply(s, 1 - seat, { type: "roll" }, testCtx())).toEqual({ ok: false, error: "not_your_turn" });
  });
});

describe("doubling cube and scoring", () => {
  function prerollState(): BackgammonState {
    const s = backgammonEngine.create(cfg({ matchLength: 7 }), 2, testCtx(5));
    s.phase = "preroll";
    s.dice = [];
    return s;
  }

  it("doubles, takes and hands the cube to the taker", () => {
    const s = prerollState();
    const p = s.toAct;
    let r = backgammonEngine.apply(s, p, { type: "double" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.phase).toBe("doubled");
    expect(r.state.toAct).toBe(1 - p);
    r = backgammonEngine.apply(r.state, 1 - p, { type: "take" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.cube).toEqual({ value: 2, owner: 1 - p });
    // The doubler can no longer double (the taker owns the cube).
    r.state.phase = "preroll";
    r.state.toAct = p;
    expect(backgammonEngine.apply(r.state, p, { type: "double" }, testCtx())).toEqual({ ok: false, error: "cannot_double" });
  });

  it("a dropped double wins the game at the current cube value", () => {
    const s = prerollState();
    const p = s.toAct;
    const r1 = backgammonEngine.apply(s, p, { type: "double" }, testCtx());
    if (!r1.ok) throw new Error(r1.error);
    const r2 = backgammonEngine.apply(r1.state, 1 - p, { type: "drop" }, testCtx());
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.scores[p]).toBe(1);
    expect(r2.state.lastGame).toMatchObject({ winner: p, kind: "drop", points: 1 });
  });

  it("forbids doubling in the Crawford game", () => {
    const s = prerollState();
    s.crawfordGame = true;
    expect(backgammonEngine.apply(s, s.toAct, { type: "double" }, testCtx())).toEqual({ ok: false, error: "cannot_double" });
  });

  it("scores gammons and backgammons", () => {
    const base = backgammonEngine.create(cfg({ matchLength: 11, doublingCube: false }), 2, testCtx(6));
    const s = structuredClone(base);
    s.pos = emptyPos();
    put(s.pos, 0, 1, 1);
    s.pos.off[0] = 14;
    put(s.pos, 1, 20, 15); // player 1 still in player 0 home board (abs 4), nothing off → backgammon
    s.toAct = 0;
    s.phase = "move";
    s.dice = [1, 2];
    const r = backgammonEngine.apply(s, 0, { type: "move", moves: [{ from: 1, to: 0 }] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastGame).toMatchObject({ winner: 0, kind: "backgammon", points: 3 });

    const g = structuredClone(base);
    g.pos = emptyPos();
    put(g.pos, 0, 1, 1);
    g.pos.off[0] = 14;
    put(g.pos, 1, 10, 15);
    g.toAct = 0;
    g.phase = "move";
    g.dice = [1, 2];
    const r2 = backgammonEngine.apply(g, 0, { type: "move", moves: [{ from: 1, to: 0 }] }, testCtx());
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.lastGame).toMatchObject({ kind: "gammon", points: 2 });
  });
});

describe("backgammon matches", () => {
  it("plays complete matches with legal bot moves and checker conservation", () => {
    for (const seed of [1, 2, 3]) {
      const { state, finished } = simulate(backgammonEngine, cfg({ matchLength: 3 }), 2, seed, {
        difficulty: seed === 1 ? ["hard", "easy"] : ["medium", "hard"],
        onStep: (st) => {
          const p0 = st.pos.points.filter((c) => c > 0).reduce((a, b) => a + b, 0) + st.pos.bar[0] + st.pos.off[0];
          const p1 = st.pos.points.filter((c) => c < 0).reduce((a, b) => a - b, 0) + st.pos.bar[1] + st.pos.off[1];
          expect(p0).toBe(15);
          expect(p1).toBe(15);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(3);
    }
  });
});
