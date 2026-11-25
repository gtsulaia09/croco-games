import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { forbiddenDealerBid, jokerConfigSchema, jokerEngine, jokerSchedule, playableCards, trickWinner, type JokerState } from "./index";

const cfg = (o: Record<string, unknown> = {}) => jokerConfigSchema.parse(o);

describe("Joker deal structure", () => {
  it("has 24 hands in four sets in the standard ruleset", () => {
    const s = jokerSchedule("standard");
    expect(s.flat()).toHaveLength(24);
    expect(s[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s[1]).toEqual([9, 9, 9, 9]);
    expect(s[2]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("uses a 36-card pack with jokers instead of the black sixes and deals the right counts", () => {
    const s = jokerEngine.create(cfg(), 4, testCtx(3));
    expect(s.hands.every((h) => h.length === 1)).toBe(true);
    const all = [...s.hands.flat(), s.trumpCard!];
    expect(all.some((c) => c === "6S" || c === "6C")).toBe(false);
  });
});

describe("bidding", () => {
  it("forbids the dealer from making the total equal the cards dealt", () => {
    expect(forbiddenDealerBid({ bids: [0, 0, 1, null], cards: 2, dealer: 3 }, 3)).toBe(1);
    expect(forbiddenDealerBid({ bids: [2, 2, 1, null], cards: 2, dealer: 3 }, 3)).toBeNull(); // already over
    expect(forbiddenDealerBid({ bids: [null, 0, 0, 0], cards: 2, dealer: 0 }, 1)).toBeNull(); // not the dealer
  });

  it("rejects the forbidden dealer bid through the engine", () => {
    let s = jokerEngine.create(cfg(), 4, testCtx(5));
    const ctx = testCtx(5);
    for (let i = 0; i < 3; i++) {
      const r = jokerEngine.apply(s, s.toAct, { type: "bid", value: 0 }, ctx);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.toAct).toBe(s.dealer);
    expect(jokerEngine.apply(s, s.dealer, { type: "bid", value: 1 }, ctx)).toEqual({ ok: false, error: "dealer_bid_forbidden" });
    expect(jokerEngine.apply(s, s.dealer, { type: "bid", value: 0 }, ctx).ok).toBe(true);
  });
});

describe("play rules", () => {
  const base = (hands: string[][], trick: JokerState["trick"], trump: "S" | "H" | "D" | "C" | null) =>
    ({ hands, trick, trump }) as Pick<JokerState, "hands" | "trick" | "trump">;

  it("requires following suit (or a joker)", () => {
    const st = base([["AH"], ["7H", "KD", "X1"]], [{ seat: 0, card: "AH" }], "S");
    expect(playableCards(st, 1).sort()).toEqual(["7H", "X1"]);
  });

  it("requires trumping when void in the led suit", () => {
    const st = base([["AH"], ["7S", "KD", "9C"]], [{ seat: 0, card: "AH" }], "S");
    expect(playableCards(st, 1)).toEqual(["7S"]);
  });

  it("allows any card when void in the led suit and trumps", () => {
    const st = base([["AH"], ["KD", "9C"]], [{ seat: 0, card: "AH" }], "S");
    expect(playableCards(st, 1).sort()).toEqual(["9C", "KD"]);
  });

  it("a high joker led naming a suit demands the highest card of that suit", () => {
    const st = base([["X1"], ["7D", "QD", "AH"]], [{ seat: 0, card: "X1", joker: { mode: "high", suit: "D" } }], "S");
    expect(playableCards(st, 1)).toEqual(["QD"]);
  });

  it("determines trick winners including joker cases", () => {
    // Highest trump wins.
    expect(trickWinner([{ seat: 0, card: "AH" }, { seat: 1, card: "7S" }, { seat: 2, card: "KH" }, { seat: 3, card: "9S" }], "S", "trumpWins")).toBe(3);
    // Highest of led suit wins without trumps.
    expect(trickWinner([{ seat: 0, card: "9H" }, { seat: 1, card: "AD" }, { seat: 2, card: "KH" }, { seat: 3, card: "7H" }], "S", "trumpWins")).toBe(2);
    // A following high joker wins; the second high joker beats the first.
    expect(trickWinner([{ seat: 0, card: "AH" }, { seat: 1, card: "X1", joker: { mode: "high" } }, { seat: 2, card: "X2", joker: { mode: "high" } }, { seat: 3, card: "AS" }], "S", "trumpWins")).toBe(2);
    // A low joker always loses.
    expect(trickWinner([{ seat: 0, card: "7H" }, { seat: 1, card: "X1", joker: { mode: "low" } }, { seat: 2, card: "6H" }, { seat: 3, card: "8D" }], "S", "trumpWins")).toBe(0);
    // Led high joker naming a non-trump suit loses to a trump (default) ...
    const led = [{ seat: 0, card: "X1", joker: { mode: "high" as const, suit: "D" as const } }, { seat: 1, card: "7S" }, { seat: 2, card: "KD" }, { seat: 3, card: "8C" }];
    expect(trickWinner(led, "S", "trumpWins")).toBe(1);
    // ... unless the variation says the joker still wins.
    expect(trickWinner(led, "S", "jokerWins")).toBe(0);
    // Led low joker wins by default when nobody follows, trumps or plays a high joker.
    expect(trickWinner([{ seat: 0, card: "X1", joker: { mode: "low", suit: "D" } }, { seat: 1, card: "7H" }, { seat: 2, card: "KC" }, { seat: 3, card: "8C" }], "S", "trumpWins")).toBe(0);
    // ... but loses to any card of the named suit.
    expect(trickWinner([{ seat: 0, card: "X1", joker: { mode: "low", suit: "D" } }, { seat: 1, card: "7D" }, { seat: 2, card: "KC" }, { seat: 3, card: "8C" }], "S", "trumpWins")).toBe(1);
  });

  it("rejects illegal plays and malformed joker declarations", () => {
    const s = jokerEngine.create(cfg(), 4, testCtx(2));
    s.phase = "play";
    s.trick = [];
    s.hands[s.toAct] = ["X1"];
    expect(jokerEngine.apply(s, s.toAct, { type: "play", card: "X1" }, testCtx())).toEqual({ ok: false, error: "joker_mode_required" });
    expect(jokerEngine.apply(s, s.toAct, { type: "play", card: "X1", joker: { mode: "high" } }, testCtx())).toEqual({ ok: false, error: "joker_suit_required" });
    expect(jokerEngine.apply(s, s.toAct, { type: "play", card: "AH" }, testCtx())).toEqual({ ok: false, error: "card_not_in_hand" });
  });
});

describe("scoring", () => {
  function scoreHand(bid: number, tricks: number, cards: number, set = 0, hist: "classic" | "none" = "none") {
    const s = jokerEngine.create(cfg({ hist }), 4, testCtx(1));
    s.cards = cards;
    s.setIndex = set;
    s.handInSet = 0;
    s.bids = [bid, 0, 0, 0];
    s.tricks = [tricks, 0, 0, 0];
    s.phase = "play";
    s.hands = [["AH"], [], [], []];
    s.trick = [];
    s.toAct = 0;
    // Finish the hand by letting seat 0 play its last card into an otherwise empty trick is not
    // possible with four players, so call the scoring path directly via a completed trick.
    s.trick = [
      { seat: 1, card: "7D" },
      { seat: 2, card: "8D" },
      { seat: 3, card: "9D" },
    ];
    s.hands = [["6D"], [], [], []];
    s.leader = 1;
    const r = jokerEngine.apply(s, 0, { type: "play", card: "6D" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    return r.state.history[r.state.history.length - 1]!.scores[0]!;
  }

  it("matches the pagat worked examples (4-card deal)", () => {
    // seat 3 wins the final trick with 9D, so seat 0's trick count is what we set.
    expect(scoreHand(3, 3, 4)).toBe(200);
    expect(scoreHand(3, 4, 4)).toBe(40);
    expect(scoreHand(4, 3, 4)).toBe(30);
    expect(scoreHand(4, 4, 4)).toBe(400);
    expect(scoreHand(0, 0, 4)).toBe(50);
    expect(scoreHand(0, 2, 4)).toBe(20);
  });

  it("applies the hist penalty (−200 in sets 1/3, −500 in sets 2/4)", () => {
    expect(scoreHand(2, 0, 4, 0, "none")).toBe(0);
    expect(scoreHand(2, 0, 4, 0, "classic")).toBe(-200);
    expect(scoreHand(2, 0, 9, 1, "classic")).toBe(-500);
  });
});

describe("full Joker matches", () => {
  it.each(["standard", "nines"] as const)("%s ruleset plays to the end with legal bot moves", (ruleset) => {
    for (const seed of [1, 2]) {
      const { state, finished } = simulate(jokerEngine, cfg({ ruleset, nineTrump: seed === 2 ? "choose" : "lastCard", setBonus: seed === 2 ? "double" : "simple" }), 4, seed, {
        difficulty: ["easy", "medium", "hard", "medium"],
        onStep: (st) => {
          if (st.phase === "over") return;
          // Card conservation within a hand.
          const inPlay = st.hands.reduce((a, h) => a + h.length, 0) + st.trick.length + (st.pendingDeal?.flat().length ?? 0);
          const played = st.tricks.reduce((a, b) => a + b, 0) * 4;
          expect(inPlay + played).toBe(st.cards * 4);
        },
      });
      expect(finished).toBe(true);
      expect(state.history).toHaveLength(ruleset === "standard" ? 24 : 8);
      for (const h of state.history) expect(h.tricks.reduce((a, b) => a + b, 0)).toBe(h.cards);
    }
  });

  it("never shows other players' hands", () => {
    const s = jokerEngine.create(cfg({ ruleset: "nines" }), 4, testCtx(4));
    for (let seat = 0; seat < 4; seat++) {
      const json = JSON.stringify(jokerEngine.view(s, seat));
      for (let other = 0; other < 4; other++) {
        if (other === seat) continue;
        for (const c of s.hands[other]!) if (c !== s.trumpCard) expect(json).not.toContain(`"${c}"`);
      }
    }
  });
});
