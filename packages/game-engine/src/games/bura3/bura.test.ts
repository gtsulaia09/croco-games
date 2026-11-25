import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { beats, BURA_DECK_20, BURA_DECK_32, BURA_DECK_36, canBeatSet, sumPoints } from "../_bura/core";
import { bura5ConfigSchema, bura5Engine, malutkaFor, teamOf, type Bura5State } from "../bura5";
import { bura3ConfigSchema, bura3Engine, type Bura3State } from "./index";

const cfg3 = (o: Record<string, unknown> = {}) => bura3ConfigSchema.parse(o);
const cfg5 = (o: Record<string, unknown> = {}) => bura5ConfigSchema.parse(o);

describe("Bura card mechanics", () => {
  it("has 120 card points in every pack, including the 20-card one", () => {
    expect(BURA_DECK_20).toHaveLength(20);
    expect(sumPoints(BURA_DECK_20)).toBe(120);
    expect(sumPoints(BURA_DECK_32)).toBe(120);
    expect(sumPoints(BURA_DECK_36)).toBe(120);
  });

  it("ranks ten above king and lets any trump beat a non-trump", () => {
    expect(beats("TH", "KH", "S")).toBe(true);
    expect(beats("KH", "TH", "S")).toBe(false);
    expect(beats("6S", "AH", "S")).toBe(true);
    expect(beats("AH", "6S", "S")).toBe(false);
    expect(beats("7S", "6S", "S")).toBe(true);
    expect(beats("AD", "6H", "S")).toBe(false); // a different non-trump suit never beats
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
  const total = state.hands.reduce((s, h) => s + h.length, 0) + state.stock.length + state.captured.reduce((s, c) => s + c.length, 0) + inTrick;
  expect(total).toBe(deckSize);
}

/** A three-card state with chosen hands, mid-deal, leader to lead. */
function bura3With(hands: [string[], string[]], trump = "S", stock: string[] = ["AD", "AC", "KD", "KC"]): Bura3State {
  const s = bura3Engine.create(cfg3(), 2, testCtx(4));
  s.phase = "lead";
  s.trick = null;
  s.trump = trump as Bura3State["trump"];
  s.trumpCard = `A${trump}`;
  s.hands = [hands[0], hands[1]];
  s.stock = stock;
  s.captured = [[], []];
  s.known = [[], []];
  s.leader = 0;
  s.lastHand = null;
  s.scores = [0, 0];
  return s;
}

describe("three-card Bura", () => {
  it("is one against one with the 20-card pack and the trump card under the stock", () => {
    expect(bura3Engine.seatLimits(cfg3())).toEqual({ min: 2, max: 2 });
    expect(() => bura3Engine.create(cfg3(), 3, testCtx(1))).toThrow();
    for (const seed of [1, 2, 3, 5, 8]) {
      const s = bura3Engine.create(cfg3(), 2, testCtx(seed));
      if (s.lastHand) continue; // an instant bura was dealt
      expect(s.hands.every((h) => h.length === 3)).toBe(true);
      expect(s.stock[0]).toBe(s.trumpCard);
      expect([...s.hands.flat(), ...s.stock].every((c) => ["T", "J", "Q", "K", "A"].includes(c[0]!))).toBe(true);
      conservation(s, 20);
    }
  });

  it("rejects mixed-suit leads, foreign cards and out-of-turn play", () => {
    const s = bura3With([["AH", "KD", "TH"], ["QC", "JC", "QD"]]);
    expect(bura3Engine.apply(s, 0, { type: "lead", cards: ["AH", "KD"] }, testCtx())).toEqual({ ok: false, error: "lead_must_be_one_suit" });
    expect(bura3Engine.apply(s, 0, { type: "lead", cards: ["QS"] }, testCtx())).toEqual({ ok: false, error: "card_not_in_hand" });
    expect(bura3Engine.apply(s, 1, { type: "lead", cards: ["QC"] }, testCtx())).toEqual({ ok: false, error: "not_your_turn" });
    expect(bura3Engine.apply(s, 0, { type: "lead", cards: ["AH", "AH"] }, testCtx()).ok).toBe(false);
  });

  it("hides thrown cards and offers var to the trick winner before the hands are refilled", () => {
    let s = bura3With([["AH", "JD", "JC"], ["KH", "QD", "TC"]]);
    let r = bura3Engine.apply(s, 0, { type: "lead", cards: ["AH"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(bura3Engine.apply(r.state, 1, { type: "beat", cards: ["KH"] }, testCtx())).toEqual({ ok: false, error: "does_not_beat" });
    r = bura3Engine.apply(r.state, 1, { type: "discard", cards: ["TC"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(JSON.stringify(r.events)).not.toContain("TC");
    s = r.state;
    expect(s.phase).toBe("var");
    expect(bura3Engine.actors(s)).toEqual([0]);
    expect(bura3Engine.legalActions(s, 0)).toEqual([{ type: "claim" }, { type: "continue" }]);
    expect(s.hands.map((h) => h.length)).toEqual([2, 2]); // not refilled yet
    const c = bura3Engine.apply(s, 0, { type: "continue" }, testCtx());
    if (!c.ok) throw new Error(c.error);
    expect(c.state.phase).toBe("lead");
    expect(c.state.hands.map((h) => h.length)).toEqual([3, 3]);
  });

  it("var: 31+ captured points wins the deal, fewer gives it to the opponent", () => {
    const good = bura3With([["JD", "JC", "QH"], ["KD", "QC", "KH"]]);
    good.phase = "var";
    good.captured = [["AH", "TH", "KS", "QS", "JS"], []]; // 11+10+4+3+2 = 30 … add one more
    good.captured[0]!.push("JH"); // 32
    let r = bura3Engine.apply(good, 0, { type: "claim" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastHand).toMatchObject({ reason: "var", winner: 0, claimedPoints: 32 });
    expect(r.state.scores).toEqual([1, 0]);

    const bad = bura3With([["JD", "JC", "QH"], ["KD", "QC", "KH"]]);
    bad.phase = "var";
    bad.captured = [["AH", "TH"], []]; // 21
    r = bura3Engine.apply(bad, 0, { type: "claim" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastHand).toMatchObject({ reason: "false_var", winner: 1 });
    expect(r.state.scores).toEqual([0, 1]);
    expect(bura3Engine.apply(bura3With([["JD"], ["KD"]]), 0, { type: "claim" }, testCtx())).toEqual({ ok: false, error: "var_not_available" });
  });

  it("three trumps on your turn win the deal at once", () => {
    const s = bura3With([["AD", "JD", "JC"], ["KS", "QS", "TS"]]);
    const r = bura3Engine.apply(s, 0, { type: "lead", cards: ["JC"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastHand).toMatchObject({ reason: "bura", winner: 1 });
    expect(r.state.scores).toEqual([0, 1]);
  });

  it("plays the deal out: 61 card points win the deal", () => {
    const s = bura3With([["AH"], ["KH"]], "S", []);
    s.captured = [["AD", "TD", "KD", "QD", "JD", "AC", "TC"], ["KC", "QC", "JC", "AS", "TS", "KS", "QS", "JS"]];
    const r = bura3Engine.apply(s, 0, { type: "lead", cards: ["AH"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    const r2 = bura3Engine.apply(r.state, 1, { type: "discard", cards: ["KH"] }, testCtx());
    if (!r2.ok) throw new Error(r2.error);
    // seat 0: 51 + AH 11 + KH 4 = 66 ≥ 61.
    expect(r2.state.lastHand).toMatchObject({ reason: "points", winner: 0 });
    expect(r2.state.lastHand!.points).toEqual([66, 39]);
  });

  it("plays whole matches to 6 / 11 / 21 with legal bot moves", () => {
    for (const [seed, target] of [[1, 6], [2, 11], [3, 6]] as const) {
      const { state, finished } = simulate(bura3Engine, cfg3({ targetPoints: target }), 2, seed, {
        difficulty: ["hard", "medium"],
        onStep: (st) => {
          if (st.phase !== "over") conservation(st, 20);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBe(target);
    }
  });
});

/** A five-card state with chosen hands, mid-deal, seat 0 to lead. */
function bura5With(hands: string[][], trump = "S"): Bura5State {
  const s = bura5Engine.create(cfg5(), 4, testCtx(9));
  s.phase = "lead";
  s.trick = null;
  s.trump = trump as Bura5State["trump"];
  s.hands = hands.map((h) => [...h]);
  s.stock = [];
  s.captured = [[], [], [], []];
  s.leader = 0;
  s.value = 1;
  s.raise = null;
  s.lastRaiseTeam = null;
  s.scores = [0, 0];
  s.lastHand = null;
  return s;
}

describe("five-card team Bura", () => {
  it("seats four players in two teams with partners opposite", () => {
    expect(bura5Engine.seatLimits(cfg5())).toEqual({ min: 4, max: 4 });
    expect(() => bura5Engine.create(cfg5(), 2, testCtx(1))).toThrow();
    expect([0, 1, 2, 3].map(teamOf)).toEqual([0, 1, 0, 1]);
    const s = bura5Engine.create(cfg5(), 4, testCtx(2));
    expect(s.hands.every((h) => h.length === 5)).toBe(true);
    expect(s.stock).toHaveLength(16);
    conservation(s, 36);
  });

  it("raises step through davi … shashi, alternate between teams, and a concession scores the old value", () => {
    let s = bura5With([["7H"], ["8H"], ["9H"], ["6D"]]);
    let r = bura5Engine.apply(s, 0, { type: "raise" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.phase).toBe("raise");
    expect(bura5Engine.actors(r.state)).toEqual([1]);
    r = bura5Engine.apply(r.state, 1, { type: "accept" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.value).toBe(2);
    expect(bura5Engine.actors(s)).toEqual([0]);
    // The same team cannot raise twice in a row.
    expect(bura5Engine.apply(s, 0, { type: "raise" }, testCtx())).toEqual({ ok: false, error: "cannot_raise" });
    r = bura5Engine.apply(s, 0, { type: "lead", cards: ["7H"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    // Seat 1 (other team) raises to se, seat 2 counter-raises to chari, seat 3 concedes.
    r = bura5Engine.apply(r.state, 1, { type: "raise" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    r = bura5Engine.apply(r.state, 2, { type: "raise" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.value).toBe(3);
    expect(r.state.raise).toMatchObject({ by: 2, from: 3, to: 4, responder: 3 });
    r = bura5Engine.apply(r.state, 3, { type: "fold" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastHand).toMatchObject({ reason: "fold", winnerTeam: 0, value: 3 });
    expect(r.state.scores).toEqual([3, 0]);
  });

  it("five trumps are a bura and win the deal at the current value", () => {
    const s = bura5With([["7H", "8H", "9H", "TH", "JH"], ["6S", "7S", "8S", "9S", "TS"], ["6H", "QH", "KH", "AH", "6C"], ["7C", "8C", "9C", "TC", "JC"]]);
    s.value = 2;
    s.leader = 1;
    const r = bura5Engine.apply(s, 1, { type: "bura" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.lastHand).toMatchObject({ reason: "bura", winnerTeam: 1, value: 2 });
    expect(r.state.scores).toEqual([0, 2]);
  });

  it("malutka: five cards of one suit that all beat a single led card become the new target", () => {
    const s = bura5With([["7D", "8C", "9C", "TC", "JC"], ["8D", "9D", "TD", "KD", "AD"], ["6C", "6H", "7H", "8H", "9H"], ["QC", "KC", "AC", "6D", "TH"]], "S");
    const r = bura5Engine.apply(s, 0, { type: "lead", cards: ["7D"] }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(malutkaFor(r.state, 1)).toEqual(["8D", "9D", "TD", "KD", "AD"]);
    const m = bura5Engine.apply(r.state, 1, { type: "malutka", cards: ["8D", "9D", "TD", "KD", "AD"] }, testCtx());
    if (!m.ok) throw new Error(m.error);
    expect(m.state.trick).toMatchObject({ count: 5, bestSeat: 1, pending: [2, 3] });
    expect(bura5Engine.legalActions(m.state, 2).every((a) => a.type !== "beat" || a.cards.length === 5)).toBe(true);
  });

  it("plays whole team matches with legal bot moves", () => {
    for (const seed of [1, 2, 3]) {
      const { state, finished } = simulate(bura5Engine, cfg5({ targetPoints: 6 }), 4, seed, {
        difficulty: ["hard", "medium", "easy", "hard"],
        onStep: (st) => {
          if (st.phase !== "over") conservation(st, 36);
        },
      });
      expect(finished).toBe(true);
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(6);
      const outcome = bura5Engine.outcome(state);
      expect(outcome.placements[0]).toBe(outcome.placements[2]);
      expect(outcome.placements[1]).toBe(outcome.placements[3]);
    }
  });
});
