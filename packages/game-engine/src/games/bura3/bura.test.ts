import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { beats, BURA_DECK_32, BURA_DECK_36, canBeatSet, sumPoints } from "../_bura/core";
import { bura5ConfigSchema, bura5Engine, bura5Penalties, type Bura5State } from "../bura5";
import { bura3ConfigSchema, bura3Engine, type Bura3State } from "./index";

const cfg3 = (o: Record<string, unknown> = {}) => bura3ConfigSchema.parse(o);
const cfg5 = (o: Record<string, unknown> = {}) => bura5ConfigSchema.parse(o);

describe("Bura card mechanics", () => {
  it("has 120 card points in both packs", () => {
    expect(sumPoints(BURA_DECK_36)).toBe(120);
    expect(sumPoints(BURA_DECK_32)).toBe(120);
  });

  it("ranks ten above king and lets any trump beat a non-trump", () => {
    expect(beats("TH", "KH", "S")).toBe(true);
    expect(beats("KH", "TH", "S")).toBe(false);
    expect(beats("6S", "AH", "S")).toBe(true);
    expect(beats("AH", "6S", "S")).toBe(false);
    expect(beats("7S", "6S", "S")).toBe(true);
    expect(beats("AD", "6H", "S")).toBe(false); // different non-trump suit never beats
  });

  it("requires every led card to be beaten by a distinct card", () => {
    expect(canBeatSet(["AH", "TH"], ["KH", "QH"], "S")).toBe(true);
    expect(canBeatSet(["AH", "7D"], ["KH", "QH"], "S")).toBe(false);
    expect(canBeatSet(["6S", "AH"], ["KH", "QH"], "S")).toBe(true); // trump + ace
    expect(canBeatSet(["AH"], ["KH", "QH"], "S")).toBe(false); // wrong count
  });
});

function conservation(state: Bura3State | Bura5State, deckSize: number) {
  const inTrick = state.trick ? state.trick.plays.reduce((s, p) => s + p.cards.length, 0) : 0;
  const total =
    state.hands.reduce((s, h) => s + h.length, 0) + state.stock.length + state.captured.reduce((s, c) => s + c.length, 0) + inTrick;
  expect(total).toBe(deckSize);
}

describe("three-card Bura engine", () => {
  it("deals three cards each with the trump card under the stock", () => {
    const s = bura3Engine.create(cfg3(), 2, testCtx(1));
    if (s.lastHand) return; // an instant bura was dealt; covered elsewhere
    expect(s.hands.every((h) => h.length === 3)).toBe(true);
    expect(s.stock[0]).toBe(s.trumpCard);
    conservation(s, 36);
  });

  it("rejects leads of mixed suits, foreign cards and out-of-turn play", () => {
    const s = bura3Engine.create(cfg3(), 2, testCtx(4));
    s.phase = "lead";
    s.forcedLead = null;
    s.hands[s.leader] = ["AH", "KD", "7H"];
    const other = (s.leader + 1) % 2;
    expect(bura3Engine.apply(s, s.leader, { type: "lead", cards: ["AH", "KD"] }, testCtx())).toEqual({ ok: false, error: "lead_must_be_one_suit" });
    expect(bura3Engine.apply(s, s.leader, { type: "lead", cards: ["QS"] }, testCtx())).toEqual({ ok: false, error: "card_not_in_hand" });
    expect(bura3Engine.apply(s, other, { type: "lead", cards: [s.hands[other]![0]!] }, testCtx())).toEqual({ ok: false, error: "not_your_turn" });
    expect(bura3Engine.apply(s, s.leader, { type: "lead", cards: ["AH", "AH"] }, testCtx()).ok).toBe(false);
  });

  it("rejects a 'beat' that does not beat and hides face-down discards from the opponent", () => {
    let s = bura3Engine.create(cfg3(), 2, testCtx(5));
    s.phase = "lead";
    s.forcedLead = null;
    s.trump = "S";
    const leader = s.leader;
    const other = (leader + 1) % 2;
    s.hands[leader] = ["AH", "7D", "8C"];
    s.hands[other] = ["6H", "9D", "TC"];
    const r = bura3Engine.apply(s, leader, { type: "lead", cards: ["AH"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(bura3Engine.apply(s, other, { type: "beat", cards: ["6H"] }, testCtx())).toEqual({ ok: false, error: "does_not_beat" });
    const d = bura3Engine.apply(s, other, { type: "discard", cards: ["TC"] }, testCtx());
    if (!d.ok) throw new Error(d.error);
    // Leader's view of the finished trick history must not reveal the face-down ten.
    const events = JSON.stringify(d.events);
    expect(events).not.toContain("TC");
    expect(JSON.stringify(bura3Engine.view(d.state, leader))).not.toContain('"TC"');
  });

  it("scores a true claim for the claimer and a false claim for the opponents", () => {
    const base = bura3Engine.create(cfg3({ targetPoints: 21 }), 2, testCtx(6));
    base.phase = "lead";
    base.forcedLead = null;
    const seat = base.leader;
    const truthful = structuredClone(base);
    truthful.captured[seat] = ["AH", "TH", "KH", "QH", "JH", "6C"]; // 30 + 2 = 11+10+4+3+2 = 30 → not enough
    truthful.captured[seat]!.push("TD"); // 40
    truthful.tricksWon[seat] = 2;
    const ok = bura3Engine.apply(truthful, seat, { type: "claim" }, testCtx());
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.state.lastHand?.reason).toBe("claim");
    expect(ok.state.scores[seat]).toBe(1);

    const liar = structuredClone(base);
    liar.captured[seat] = ["AH", "TH"]; // 21
    liar.tricksWon[seat] = 1;
    const bad = bura3Engine.apply(liar, seat, { type: "claim" }, testCtx());
    if (!bad.ok) throw new Error(bad.error);
    expect(bad.state.lastHand?.reason).toBe("false_claim");
    expect(bad.state.scores[seat]).toBe(0);
    expect(bad.state.scores[(seat + 1) % 2]).toBe(1);
  });

  it("does not allow claiming before taking a trick", () => {
    const s = bura3Engine.create(cfg3(), 2, testCtx(7));
    s.phase = "lead";
    s.tricksWon = [0, 0];
    expect(bura3Engine.apply(s, s.leader, { type: "claim" }, testCtx())).toEqual({ ok: false, error: "no_tricks_taken" });
  });

  it("never exposes the opponents' hands or the stock order", () => {
    const s = bura3Engine.create(cfg3(), 3, testCtx(8));
    for (let seat = 0; seat < 3; seat++) {
      const view = bura3Engine.view(s, seat);
      const json = JSON.stringify(view);
      expect(json).not.toContain("stock\":[");
      for (let other = 0; other < 3; other++) {
        if (other === seat) continue;
        for (const c of s.hands[other]!) if (c !== s.trumpCard) expect(json).not.toContain(`"${c}"`);
      }
    }
  });

  it.each([2, 3, 4])("plays full matches with %i players (legal bot moves, card conservation)", (players) => {
    for (const seed of [1, 2, 3]) {
      const { state, finished } = simulate(bura3Engine, cfg3({ targetPoints: 5 }), players, seed, {
        difficulty: ["easy", "medium", "hard", "medium"],
        onStep: (st) => {
          if (st.phase !== "over") conservation(st, 36);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(5);
    }
  });

  it("supports the combinations and 32-card variations", () => {
    const { finished } = simulate(bura3Engine, cfg3({ targetPoints: 5, combinations: true, threeAcesWin: true, deck: "32", closedDiscards: false }), 2, 9);
    expect(finished).toBe(true);
  });
});

describe("five-card Bura engine", () => {
  it("scores penalty points on the 2/4/6 scale", () => {
    expect(bura5Penalties([80, 40], [5, 2])).toEqual({ penalties: [0, 2], draw: false });
    expect(bura5Penalties([95, 25], [6, 1])).toEqual({ penalties: [0, 4], draw: false });
    expect(bura5Penalties([120, 0], [8, 0])).toEqual({ penalties: [0, 6], draw: false });
    expect(bura5Penalties([60, 60], [4, 4])).toEqual({ penalties: [2, 2], draw: true });
    expect(bura5Penalties([60, 40, 20], [3, 2, 1])).toEqual({ penalties: [0, 2, 4], draw: false });
  });

  it("deals five cards and plays every hand to the end", () => {
    const s = bura5Engine.create(cfg5(), 2, testCtx(2));
    expect(s.hands.every((h) => h.length === 5)).toBe(true);
    conservation(s, 36);
  });

  it.each([2, 3])("plays full matches with %i players", (players) => {
    for (const seed of [4, 5]) {
      const { state, finished } = simulate(bura5Engine, cfg5({ penaltyLimit: 6 }), players, seed, {
        difficulty: ["hard", "medium", "easy"],
        onStep: (st) => {
          if (st.phase !== "over") conservation(st, 36);
          if (st.lastHand) expect(st.lastHand.points.reduce((a, b) => a + b, 0)).toBe(120);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.penalties)).toBeGreaterThanOrEqual(6);
      expect(bura5Engine.outcome(state).placements).toContain(1);
    }
  });

  it("allows five-card leads only when configured", () => {
    const s = bura5Engine.create(cfg5(), 2, testCtx(3));
    s.hands[s.leader] = ["AH", "TH", "KH", "QH", "JH"];
    expect(bura5Engine.apply(s, s.leader, { type: "lead", cards: ["AH", "TH", "KH", "QH"] }, testCtx())).toEqual({ ok: false, error: "invalid_lead" });
    const wide = bura5Engine.create(cfg5({ maxLead: 5 }), 2, testCtx(3));
    wide.hands[wide.leader] = ["AH", "TH", "KH", "QH", "JH"];
    expect(bura5Engine.apply(wide, wide.leader, { type: "lead", cards: ["AH", "TH", "KH", "QH"] }, testCtx()).ok).toBe(true);
  });
});
