import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { japaneseJokerConfigSchema, japaneseJokerEngine, japaneseTrickWinner, type JapaneseJokerState } from "./index";

const cfg = (o: Record<string, unknown> = {}) => japaneseJokerConfigSchema.parse(o);

function started(seed = 1, o: Record<string, unknown> = {}): JapaneseJokerState {
  const s = japaneseJokerEngine.create(cfg(o), 2, testCtx(seed));
  const r = japaneseJokerEngine.apply(s, s.toAct, { type: "trump", suit: "H" }, testCtx(seed));
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("Japanese Joker deal", () => {
  it("lets the non-dealer choose trump after seeing three cards", () => {
    const s = japaneseJokerEngine.create(cfg(), 2, testCtx(2));
    expect(s.phase).toBe("trump");
    expect(s.toAct).toBe(1 - s.dealer);
    expect(s.hands.every((h) => h.length === 3)).toBe(true);
    expect(japaneseJokerEngine.apply(s, s.dealer, { type: "trump", suit: "S" }, testCtx())).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("then gives each player 8 cards in hand and 5 face-up-on-face-down piles", () => {
    const s = started();
    expect(s.hands.map((h) => h.length)).toEqual([8, 8]);
    for (const t of s.table) {
      expect(t).toHaveLength(5);
      expect(t.every((p) => p.up && p.down)).toBe(true);
    }
    const all = [...s.hands.flat(), ...s.table.flat().flatMap((p) => [p.up!, p.down!])];
    expect(new Set(all).size).toBe(36);
  });

  it("supports playing without trumps", () => {
    const s = japaneseJokerEngine.create(cfg(), 2, testCtx(3));
    const r = japaneseJokerEngine.apply(s, s.toAct, { type: "trump", suit: "none" }, testCtx());
    expect(r.ok && r.state.trump).toBeNull();
  });
});

describe("Japanese Joker play", () => {
  it("hides the opponent's hand and face-down cards but shows face-up table cards", () => {
    const s = started(4);
    for (const seat of [0, 1]) {
      const v = japaneseJokerEngine.view(s, seat);
      const json = JSON.stringify(v);
      for (const c of s.hands[1 - seat]!) expect(json).not.toContain(`"${c}"`);
      for (const p of s.table[seat]!) expect(json).not.toContain(`"${p.down}"`);
      for (const p of s.table[1 - seat]!) expect(v.table[1 - seat]!.some((t) => t.up === p.up)).toBe(true);
    }
  });

  it("moves the covered card into the hand after a face-up card is played", () => {
    const s = started(5);
    const seat = s.toAct;
    const pile = s.table[seat]![0]!;
    const up = pile.up!;
    const down = pile.down!;
    s.trick = [];
    const r = japaneseJokerEngine.apply(s, seat, { type: "play", card: up, ...(up.startsWith("X") ? { demand: { kind: "highest", suit: "S" } } : {}) }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.table[seat]![0]).toEqual({ up: null, down: null });
    expect(r.state.hands[seat]).toContain(down);
    // The opponent cannot see which card went to the hand.
    expect(JSON.stringify(japaneseJokerEngine.view(r.state, 1 - seat))).not.toContain(`"${down}"`);
  });

  it("enforces follow-suit across hand and face-up table cards, then trumping", () => {
    const s = started(6);
    const leader = s.toAct;
    const follower = 1 - leader;
    s.hands[leader] = ["AD"];
    s.table[leader] = [{ up: null, down: null }];
    s.hands[follower] = ["7C", "KS"];
    s.table[follower] = [{ up: "9D", down: "8S" }];
    s.trump = "S";
    let r = japaneseJokerEngine.apply(s, leader, { type: "play", card: "AD" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "7C" }, testCtx())).toEqual({ ok: false, error: "must_follow_rules" });
    expect(japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "KS" }, testCtx())).toEqual({ ok: false, error: "must_follow_rules" });
    r = japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "9D" }, testCtx());
    expect(r.ok).toBe(true);
  });

  it("a led joker demands a visible card or the highest of a suit", () => {
    const s = started(7);
    const leader = s.toAct;
    const follower = 1 - leader;
    s.hands[leader] = ["X1", "7H"];
    s.table[leader] = [{ up: null, down: null }];
    s.hands[follower] = ["QD", "8D"];
    s.table[follower] = [{ up: "AH", down: "6D" }];
    expect(japaneseJokerEngine.apply(s, leader, { type: "play", card: "X1" }, testCtx())).toEqual({ ok: false, error: "demand_required" });
    expect(japaneseJokerEngine.apply(s, leader, { type: "play", card: "X1", demand: { kind: "card", card: "QD" } }, testCtx())).toEqual({
      ok: false,
      error: "demand_card_not_visible",
    });
    const r = japaneseJokerEngine.apply(s, leader, { type: "play", card: "X1", demand: { kind: "card", card: "AH" } }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(japaneseJokerEngine.legalActions(r.state, follower)).toEqual([{ type: "play", card: "AH" }]);

    const s2 = started(7);
    s2.hands[leader] = ["X1"];
    s2.table[leader] = [{ up: null, down: null }];
    s2.hands[follower] = ["QD", "8D"];
    s2.table[follower] = [{ up: "AH", down: "6D" }];
    const r2 = japaneseJokerEngine.apply(s2, leader, { type: "play", card: "X1", demand: { kind: "highest", suit: "D" } }, testCtx());
    if (!r2.ok) throw new Error(r2.error);
    expect(japaneseJokerEngine.legalActions(r2.state, follower)).toEqual([{ type: "play", card: "QD" }]);
  });

  it("decides tricks: jokers beat everything, second joker beats the first", () => {
    const p = (seat: number, card: string) => ({ seat, card, from: "hand" as const });
    expect(japaneseTrickWinner([p(0, "AH"), p(1, "7S")], "S")).toBe(1);
    expect(japaneseTrickWinner([p(0, "AH"), p(1, "KH")], "S")).toBe(0);
    expect(japaneseTrickWinner([p(0, "7H"), p(1, "AD")], "S")).toBe(0);
    expect(japaneseTrickWinner([p(0, "AS"), p(1, "X2")], "S")).toBe(1);
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, p(1, "AH")], "S")).toBe(0);
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, p(1, "X2")], "S")).toBe(1);
  });
});

describe("Japanese Joker matches", () => {
  it("plays to the target with ½-point-per-card scoring", () => {
    for (const seed of [1, 2, 3]) {
      const { state, finished } = simulate(japaneseJokerEngine, cfg({ targetPoints: 8, revealMode: seed === 3 ? "flip" : "toHand" }), 2, seed, {
        difficulty: ["hard", "medium"],
        onStep: (st) => {
          if (st.lastRound) {
            expect(st.lastRound.won[0]! + st.lastRound.won[1]!).toBe(36);
            expect(st.lastRound.points[0]! + st.lastRound.points[1]!).toBe(Math.abs(st.lastRound.won[0]! - st.lastRound.won[1]!) / 2);
          }
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(8);
    }
  });
});
