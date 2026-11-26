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

  it("plays the first card of a deal from the hand, then allows open table cards", () => {
    const s = started(5);
    const seat = s.toAct;
    const up = s.table[seat]![0]!.up!;
    const demand = up.startsWith("X") ? { demand: { kind: "highest" as const, suit: "S" as const } } : {};
    expect(japaneseJokerEngine.apply(s, seat, { type: "play", card: up, ...demand }, testCtx())).toEqual({ ok: false, error: "first_card_from_hand" });
    expect(japaneseJokerEngine.view(s, seat).you!.playable.every((c) => s.hands[seat]!.includes(c))).toBe(true);
    s.playedThisDeal[seat] = true;
    expect(japaneseJokerEngine.view(s, seat).you!.playable).toContain(up);
  });

  it("turns the covered card face up after an open table card is played", () => {
    const s = started(5);
    const seat = s.toAct;
    const pile = s.table[seat]![0]!;
    const up = pile.up!;
    const down = pile.down!;
    s.trick = [];
    s.playedThisDeal[seat] = true;
    const r = japaneseJokerEngine.apply(s, seat, { type: "play", card: up, ...(up.startsWith("X") ? { demand: { kind: "highest", suit: "S" } } : {}) }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.table[seat]![0]).toEqual({ up: down, down: null });
    expect(japaneseJokerEngine.view(r.state, 1 - seat).table[seat]![0]!.up).toBe(down);
  });

  it("house variant: the covered card can go to the hand instead", () => {
    const s = started(5, { revealMode: "toHand" });
    const seat = s.toAct;
    const pile = s.table[seat]![0]!;
    const up = pile.up!;
    const down = pile.down!;
    s.playedThisDeal[seat] = true;
    const r = japaneseJokerEngine.apply(s, seat, { type: "play", card: up, ...(up.startsWith("X") ? { demand: { kind: "highest", suit: "S" } } : {}) }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.table[seat]![0]).toEqual({ up: null, down: null });
    expect(r.state.hands[seat]).toContain(down);
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
    s.playedThisDeal = [true, true];
    let r = japaneseJokerEngine.apply(s, leader, { type: "play", card: "AD" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "7C" }, testCtx())).toEqual({ ok: false, error: "must_follow_rules" });
    expect(japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "KS" }, testCtx())).toEqual({ ok: false, error: "must_follow_rules" });
    r = japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "9D" }, testCtx());
    expect(r.ok).toBe(true);
  });

  it("a led joker demands the highest card of a named suit", () => {
    const s = started(7);
    const leader = s.toAct;
    const follower = 1 - leader;
    s.hands[leader] = ["X1"];
    s.table[leader] = [{ up: null, down: null }];
    s.hands[follower] = ["QD", "8D"];
    s.table[follower] = [{ up: "AH", down: "6D" }];
    s.playedThisDeal = [true, true];
    expect(japaneseJokerEngine.apply(s, leader, { type: "play", card: "X1" }, testCtx())).toEqual({ ok: false, error: "demand_required" });
    expect(japaneseJokerEngine.actionSchema.safeParse({ type: "play", card: "X1", demand: { kind: "card", card: "AH" } }).success).toBe(false);
    const r = japaneseJokerEngine.apply(s, leader, { type: "play", card: "X1", demand: { kind: "highest", suit: "D" } }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(japaneseJokerEngine.legalActions(r.state, follower)).toEqual([{ type: "play", card: "QD" }]);
  });

  it("without the demanded suit the opponent must trump, and the trump beats the joker", () => {
    const s = started(8);
    const leader = s.toAct;
    const follower = 1 - leader;
    s.trump = "S";
    s.hands[leader] = ["X1", "7H"];
    s.table[leader] = [{ up: null, down: null }];
    s.hands[follower] = ["7S", "8D"];
    s.table[follower] = [{ up: null, down: null }];
    s.playedThisDeal = [true, true];
    let r = japaneseJokerEngine.apply(s, leader, { type: "play", card: "X1", demand: { kind: "highest", suit: "C" } }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(japaneseJokerEngine.legalActions(r.state, follower)).toEqual([{ type: "play", card: "7S" }]);
    r = japaneseJokerEngine.apply(r.state, follower, { type: "play", card: "7S" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastTrick!.winner).toBe(follower);
    expect(r.state.won[follower]).toBe(1);
  });

  it("lets a following joker take the trick (მოჯოკვრა) or go low (გატანება)", () => {
    const s = started(9);
    const leader = s.toAct;
    const follower = 1 - leader;
    s.trump = "S";
    s.hands[leader] = ["AH", "7D"];
    s.table[leader] = [{ up: null, down: null }];
    s.hands[follower] = ["X2", "8C"];
    s.table[follower] = [{ up: null, down: null }];
    s.playedThisDeal = [true, true];
    const led = japaneseJokerEngine.apply(s, leader, { type: "play", card: "AH" }, testCtx());
    if (!led.ok) throw new Error(led.error);
    expect(japaneseJokerEngine.legalActions(led.state, follower)).toEqual(
      expect.arrayContaining([
        { type: "play", card: "X2", joker: { mode: "high" } },
        { type: "play", card: "X2", joker: { mode: "low" } },
      ]),
    );
    const winnerOf = (action: Record<string, unknown>) => {
      const r = japaneseJokerEngine.apply(led.state, follower, action as never, testCtx());
      if (!r.ok) throw new Error(r.error);
      return r.state.lastTrick!.winner;
    };
    expect(winnerOf({ type: "play", card: "X2", joker: { mode: "high" } })).toBe(follower);
    expect(winnerOf({ type: "play", card: "X2", joker: { mode: "low" } })).toBe(leader);
    expect(winnerOf({ type: "play", card: "X2" })).toBe(follower); // no choice sent = takes

    // A joker played low on a led joker leaves the trick to the leader.
    const p = (seat: number, card: string) => ({ seat, card, from: "hand" as const });
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, { ...p(1, "X2"), joker: { mode: "low" } }], "S")).toBe(0);

    // The option can be switched off for a room.
    const off = started(9, { jokerLow: false });
    off.trump = "S";
    off.hands[off.toAct] = ["AH"];
    off.table[off.toAct] = [{ up: null, down: null }];
    off.hands[1 - off.toAct] = ["X2"];
    off.table[1 - off.toAct] = [{ up: null, down: null }];
    off.playedThisDeal = [true, true];
    const r = japaneseJokerEngine.apply(off, off.toAct, { type: "play", card: "AH" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(japaneseJokerEngine.legalActions(r.state, 1 - off.toAct)).toEqual([{ type: "play", card: "X2" }]);
    expect(japaneseJokerEngine.apply(r.state, 1 - off.toAct, { type: "play", card: "X2", joker: { mode: "low" } }, testCtx())).toEqual({
      ok: false,
      error: "joker_low_disabled",
    });
  });

  it("decides tricks: jokers beat everything, second joker beats the first", () => {
    const p = (seat: number, card: string) => ({ seat, card, from: "hand" as const });
    expect(japaneseTrickWinner([p(0, "AH"), p(1, "7S")], "S")).toBe(1);
    expect(japaneseTrickWinner([p(0, "AH"), p(1, "KH")], "S")).toBe(0);
    expect(japaneseTrickWinner([p(0, "7H"), p(1, "AD")], "S")).toBe(0);
    expect(japaneseTrickWinner([p(0, "AS"), p(1, "X2")], "S")).toBe(1);
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, p(1, "AH")], "S")).toBe(0);
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, p(1, "X2")], "S")).toBe(1);
    // A trump beats a joker that demanded a non-trump suit; not when trumps were demanded or in "bez".
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, p(1, "7S")], "S")).toBe(1);
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "S" } }, p(1, "7D")], "S")).toBe(0);
    expect(japaneseTrickWinner([{ ...p(0, "X1"), demand: { kind: "highest", suit: "H" } }, p(1, "7S")], null)).toBe(0);
  });
});

describe("Japanese Joker matches", () => {
  it("uses the handbook defaults: target 11, covered cards flip face up", () => {
    expect(cfg()).toEqual({ targetPoints: 11, revealMode: "flip", lastPileToHand: false, jokerLow: true });
    expect(japaneseJokerConfigSchema.safeParse({ targetPoints: 8 }).success).toBe(false);
  });

  it("plays to the target; the deal winner scores the trick difference", () => {
    for (const seed of [1, 2, 3]) {
      const { state, finished } = simulate(japaneseJokerEngine, cfg({ targetPoints: 7, revealMode: seed === 3 ? "toHand" : "flip" }), 2, seed, {
        difficulty: ["hard", "medium"],
        onStep: (st) => {
          if (st.lastRound) {
            expect(st.lastRound.won[0]! + st.lastRound.won[1]!).toBe(18);
            expect(st.lastRound.points[0]! + st.lastRound.points[1]!).toBe(Math.abs(st.lastRound.won[0]! - st.lastRound.won[1]!));
          }
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(7);
    }
  });
});
