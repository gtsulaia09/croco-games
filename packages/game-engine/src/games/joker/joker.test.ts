import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import { forbiddenDealerBid, jokerConfigSchema, jokerEngine, jokerSchedule, playableCards, trickWinner, type HandRecord, type JokerConfig, type JokerState } from "./index";

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

/**
 * Finish the current deal through the engine: seats 1–3 have played 7D, 8D, 9D and seat 0 plays
 * 6D, so seat 3 takes the last trick. `tricks` are the counts before that trick.
 */
function finishDeal(s: JokerState, bids: number[], tricks: number[]) {
  s.bids = [...bids];
  s.tricks = [...tricks];
  s.phase = "play";
  s.trick = [
    { seat: 1, card: "7D" },
    { seat: 2, card: "8D" },
    { seat: 3, card: "9D" },
  ];
  s.hands = [["6D"], [], [], []];
  s.leader = 1;
  s.toAct = 0;
  const r = jokerEngine.apply(s, 0, { type: "play", card: "6D" }, testCtx());
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("scoring", () => {
  function scoreHand(bid: number, tricks: number, cards: number, set = 0, hist: JokerConfig["hist"] = "perCard") {
    const s = jokerEngine.create(cfg({ hist }), 4, testCtx(1));
    s.cards = cards;
    s.setIndex = set;
    s.handInSet = 0;
    const done = finishDeal(s, [bid, 0, 0, 0], [tricks, 0, 0, 0]);
    return done.history[done.history.length - 1]!.scores[0]!;
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

  it("uses the standard ხიშტი by default: −100 × the cards dealt", () => {
    expect(cfg().hist).toBe("perCard");
    expect(scoreHand(5, 0, 9, 1)).toBe(-900);
    expect(scoreHand(2, 0, 5)).toBe(-500);
    expect(scoreHand(1, 0, 3)).toBe(-300);
    expect(scoreHand(1, 0, 1)).toBe(-100);
  });

  it("applies a fixed ხიშტი chosen for the table in every deal", () => {
    expect(scoreHand(2, 0, 4, 0, "fixed100")).toBe(-100);
    expect(scoreHand(2, 0, 9, 1, "fixed200")).toBe(-200);
    expect(scoreHand(2, 0, 9, 1, "fixed300")).toBe(-300);
    expect(scoreHand(2, 0, 4, 0, "fixed500")).toBe(-500);
  });

  it("keeps the legacy ხიშტი values working", () => {
    expect(scoreHand(2, 0, 4, 0, "none")).toBe(0);
    expect(scoreHand(2, 0, 4, 0, "classic")).toBe(-200);
    expect(scoreHand(2, 0, 9, 1, "classic")).toBe(-500);
  });

  it("is not a ხიშტი when the bid was a pass or a trick was taken", () => {
    expect(scoreHand(0, 0, 9, 1)).toBe(50);
    expect(scoreHand(3, 1, 9, 1)).toBe(10);
  });
});

describe("premia (set bonus)", () => {
  // The second set of the standard game: four nine-card deals (hands 9–12). Seat 0 makes every
  // bid; seat 1 misses deal 11; seat 2 has two ხიშტი; seat 3 misses everything.
  const earlier: HandRecord[] = [
    { hand: 9, set: 1, cards: 9, bids: [2, 1, 5, 1], tricks: [2, 1, 5, 0], scores: [150, 100, 300, -900] },
    { hand: 10, set: 1, cards: 9, bids: [3, 4, 1, 0], tricks: [3, 4, 0, 1], scores: [200, 250, -900, 10] },
    { hand: 11, set: 1, cards: 9, bids: [0, 2, 0, 2], tricks: [0, 3, 0, 6], scores: [50, 30, 50, 60] },
  ];

  function finishSet(setBonus: JokerConfig["setBonus"]) {
    const s = jokerEngine.create(cfg({ setBonus }), 4, testCtx(1));
    s.setIndex = 1;
    s.handInSet = 3;
    s.handNumber = 12;
    s.cards = 9;
    s.history = earlier.map((h) => ({ ...h }));
    s.totals = [0, 0, 0, 0];
    // Last deal: seat 0 bids 1 and takes 1 (100), seat 1 2/2 (150), seat 2 ხიშტი (−900), seat 3 0/1 (10).
    return finishDeal(s, [1, 2, 1, 0], [1, 2, 0, 0]);
  }

  it("ბოლო იშლება (eraseLast, the default): others lose their last deal that scored", () => {
    expect(cfg().setBonus).toBe("eraseLast");
    const s = finishSet("eraseLast");
    expect(s.history.at(-1)!.scores).toEqual([100, 150, -900, 10]);
    expect(s.bonuses).toEqual([
      { set: 1, seat: 0, amount: 200, kind: "premia", hand: 10 },
      { set: 1, seat: 1, amount: -150, kind: "erase", hand: 12 },
      { set: 1, seat: 2, amount: -50, kind: "erase", hand: 11 },
      { set: 1, seat: 3, amount: -10, kind: "erase", hand: 12 },
    ]);
    expect(s.totals).toEqual([100 + 200, 150 - 150, -900 - 50, 10 - 10]);
  });

  it("ბოლო არ იშლება (eraseHighest): others lose their highest deal of the set", () => {
    const s = finishSet("eraseHighest");
    expect(s.bonuses).toEqual([
      { set: 1, seat: 0, amount: 200, kind: "premia", hand: 10 },
      { set: 1, seat: 1, amount: -250, kind: "erase", hand: 10 },
      { set: 1, seat: 2, amount: -300, kind: "erase", hand: 9 },
      { set: 1, seat: 3, amount: -60, kind: "erase", hand: 11 },
    ]);
  });

  it("keeps the legacy set-bonus values: simple adds only, double erases the highest", () => {
    expect(finishSet("simple").bonuses).toEqual([{ set: 1, seat: 0, amount: 200, kind: "premia", hand: 10 }]);
    expect(finishSet("double").bonuses.filter((b) => b.kind === "erase").map((b) => b.hand)).toEqual([10, 9, 11]);
    expect(finishSet("none").bonuses).toEqual([]);
  });

  it("erases nothing when nobody took the premia", () => {
    const s = jokerEngine.create(cfg(), 4, testCtx(1));
    s.setIndex = 1;
    s.handInSet = 3;
    s.handNumber = 12;
    s.cards = 9;
    s.history = earlier.map((h) => ({ ...h }));
    const done = finishDeal(s, [2, 2, 1, 0], [1, 2, 0, 0]); // seat 0 misses the last deal
    expect(done.bonuses).toEqual([]);
  });

  it("shows the table's rules in the view", () => {
    const s = jokerEngine.create(cfg({ hist: "fixed300", setBonus: "eraseHighest" }), 4, testCtx(1));
    expect(jokerEngine.view(s, 0).rules).toEqual({ hist: "fixed300", setBonus: "eraseHighest" });
  });
});

describe("trump declaration (nine-card deals)", () => {
  it("by default the player after the dealer declares trump after seeing three cards", () => {
    expect(cfg().nineTrump).toBe("choose");
    const s = jokerEngine.create(cfg({ ruleset: "nines" }), 4, testCtx(3));
    const chooser = (s.dealer + 1) % 4;
    expect(s.phase).toBe("trump");
    expect(s.toAct).toBe(chooser);
    expect(s.hands.every((h) => h.length === 3)).toBe(true);
    expect(jokerEngine.legalActions(s, chooser)).toEqual([
      { type: "trump", suit: "S" },
      { type: "trump", suit: "H" },
      { type: "trump", suit: "D" },
      { type: "trump", suit: "C" },
      { type: "trump", suit: "none" },
    ]);
    // Nobody else may declare.
    expect(jokerEngine.apply(s, s.dealer, { type: "trump", suit: "H" }, testCtx())).toEqual({ ok: false, error: "not_your_turn" });
    const r = jokerEngine.apply(s, chooser, { type: "trump", suit: "H" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.trump).toBe("H");
    expect(r.state.trumpBy).toBe(chooser);
    expect(r.state.trumpCard).toBeNull();
    expect(r.state.hands.every((h) => h.length === 9)).toBe(true);
    expect(r.state.phase).toBe("bid");
    expect(r.state.toAct).toBe(chooser);
    expect(jokerEngine.view(r.state, 0).trumpBy).toBe(chooser);
  });

  it("can declare no trump (ბეზი)", () => {
    const s = jokerEngine.create(cfg({ ruleset: "nines" }), 4, testCtx(5));
    const r = jokerEngine.apply(s, s.toAct, { type: "trump", suit: "none" }, testCtx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.trump).toBeNull();
    expect(r.state.trumpBy).toBe(s.toAct);
  });

  it("keeps the dealer's last card as trump in the lastCard variant", () => {
    const s = jokerEngine.create(cfg({ ruleset: "nines", nineTrump: "lastCard" }), 4, testCtx(3));
    expect(s.phase).toBe("bid");
    expect(s.trumpCard).not.toBeNull();
    expect(jokerEngine.view(s, 0).trumpBy).toBeNull();
  });

  it("short deals still turn the next card of the pack", () => {
    const s = jokerEngine.create(cfg(), 4, testCtx(3));
    expect(s.cards).toBe(1);
    expect(s.phase).toBe("bid");
    expect(s.trumpCard).not.toBeNull();
  });
});

describe("full Joker matches", () => {
  it.each(["standard", "nines"] as const)("%s ruleset plays to the end with legal bot moves", (ruleset) => {
    for (const seed of [1, 2]) {
      const { state, finished } = simulate(jokerEngine, cfg({ ruleset, nineTrump: seed === 2 ? "choose" : "lastCard", setBonus: seed === 2 ? "eraseHighest" : "eraseLast", hist: seed === 2 ? "fixed500" : "perCard" }), 4, seed, {
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
      expect(state.history).toHaveLength(ruleset === "standard" ? 24 : 16);
      if (ruleset === "nines") expect(state.history.every((h) => h.cards === 9)).toBe(true);
      for (const h of state.history) expect(h.tricks.reduce((a, b) => a + b, 0)).toBe(h.cards);
    }
  });

  it("plays the nines game as four sets of four nine-card deals", () => {
    expect(jokerSchedule("nines")).toEqual([[9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9]]);
    const s = jokerEngine.create(cfg({ ruleset: "nines" }), 4, testCtx(3));
    expect(s.totalHands).toBe(16);
    expect(s.cards).toBe(9);
    expect(jokerEngine.view(s, 0).ruleset).toBe("nines");
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
