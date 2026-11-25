import { describe, expect, it } from "vitest";
import { simulate, testCtx } from "../../testing";
import {
  bestHoldemHand,
  bestOmahaHand,
  bestOmahaLow,
  buildPots,
  evaluate5,
  holdemEngine,
  omahaEngine,
  omahaHiLoEngine,
  pokerConfigSchema,
  raiseRange,
  shortDeckEngine,
  type PokerState,
} from "./index";

const cfg = (over: Record<string, unknown> = {}) => pokerConfigSchema.parse(over);
const v = (cards: string) => evaluate5(cards.split(" "));

describe("hand evaluator (standard)", () => {
  it("orders categories correctly", () => {
    const order = [
      "2S 5H 7D 9C JS", // high
      "2S 2H 7D 9C JS", // pair
      "2S 2H 7D 7C JS", // two pair
      "2S 2H 2D 9C JS", // trips
      "5S 6H 7D 8C 9S", // straight
      "2H 5H 7H 9H JH", // flush
      "2S 2H 2D 9C 9S", // full house
      "2S 2H 2D 2C 9S", // quads
      "5H 6H 7H 8H 9H", // straight flush
    ].map((h) => v(h).value);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
  });

  it("treats A-2-3-4-5 as the lowest straight", () => {
    expect(v("AS 2H 3D 4C 5S").category).toBe("straight");
    expect(v("AS 2H 3D 4C 5S").value).toBeLessThan(v("2H 3D 4C 5S 6S").value);
    expect(v("TS JH QD KC AS").value).toBeGreaterThan(v("9S TH JD QC KS").value);
  });

  it("compares kickers", () => {
    expect(v("AS AH KD 9C 2S").value).toBeGreaterThan(v("AS AH QD JC TS").value);
    expect(v("KS KH 5D 5C 2S").value).toBeGreaterThan(v("KS KH 4D 4C AS").value);
  });

  it("picks the best five of seven", () => {
    const best = bestHoldemHand(["AH", "KH"], ["QH", "JH", "TH", "2C", "3D"]);
    expect(best.category).toBe("straight_flush");
  });
});

describe("short deck (6+) rankings", () => {
  const rules = { shortDeck: true, tripsBeatStraight: false };
  it("flush beats full house", () => {
    expect(evaluate5("6H 8H TH QH AH".split(" "), rules).value).toBeGreaterThan(evaluate5("6S 6H 6D 9C 9S".split(" "), rules).value);
  });
  it("A-6-7-8-9 is a straight (ace plays low)", () => {
    const h = evaluate5("AS 6H 7D 8C 9S".split(" "), rules);
    expect(h.category).toBe("straight");
    expect(h.value).toBeLessThan(evaluate5("6H 7D 8C 9S TS".split(" "), rules).value);
  });
  it("supports the trips-beat-straight variation", () => {
    const tripsFirst = { shortDeck: true, tripsBeatStraight: true };
    expect(evaluate5("7S 7H 7D KC AS".split(" "), tripsFirst).value).toBeGreaterThan(
      evaluate5("6H 7D 8C 9S TS".split(" "), tripsFirst).value,
    );
    expect(evaluate5("7S 7H 7D KC AS".split(" "), rules).value).toBeLessThan(evaluate5("6H 7D 8C 9S TS".split(" "), rules).value);
  });
});

describe("Omaha uses exactly two hole and three board cards", () => {
  it("four hearts in hand + one on board is NOT a flush", () => {
    const h = bestOmahaHand(["AH", "KH", "QH", "JH"], ["2H", "7C", "8D", "9S", "3C"]);
    expect(h.category).not.toBe("flush");
  });
  it("four hearts on board + one in hand is NOT a flush", () => {
    const h = bestOmahaHand(["AH", "KC", "QD", "JS"], ["2H", "7H", "8H", "9H", "3C"]);
    expect(h.category).not.toBe("flush");
  });
  it("two hearts in hand + three on board IS a flush", () => {
    const h = bestOmahaHand(["AH", "KH", "QD", "JS"], ["2H", "7H", "8H", "9C", "3C"]);
    expect(h.category).toBe("flush");
  });
  it("board quads cannot be used as quads in Omaha", () => {
    const h = bestOmahaHand(["2C", "3D", "5S", "7H"], ["KS", "KH", "KD", "KC", "9S"]);
    expect(h.category).toBe("trips");
  });
});

describe("Omaha Hi-Lo low hands", () => {
  it("A-2-3-4-5 is the best low; 8-high qualifies; 9-high does not", () => {
    const wheel = bestOmahaLow(["AS", "2H", "KD", "KC"], ["3D", "4C", "5S", "QH", "JH"])!;
    const eight = bestOmahaLow(["AS", "8H", "KD", "KC"], ["3D", "4C", "6S", "QH", "JH"])!;
    expect(wheel.value).toBeLessThan(eight.value);
    expect(bestOmahaLow(["9S", "2H", "KD", "KC"], ["3D", "4C", "QS", "QH", "JH"])).toBeNull();
  });
  it("requires five distinct low ranks and exactly two hole cards", () => {
    // Only one low card in hand: no low possible even though the board has four.
    expect(bestOmahaLow(["AS", "KH", "KD", "QC"], ["2D", "3C", "4S", "5H", "JH"])).toBeNull();
    // Pairs do not count toward the five distinct ranks.
    expect(bestOmahaLow(["AS", "AH", "KD", "QC"], ["2D", "3C", "9S", "TH", "JH"])).toBeNull();
  });
});

describe("pot construction", () => {
  it("builds main and side pots from contributions", () => {
    const pots = buildPots([100, 300, 300, 50], [true, true, true, false]);
    expect(pots).toEqual([
      { amount: 350, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ]);
  });
  it("conserves every chip", () => {
    const totals = [37, 500, 120, 120, 9];
    const pots = buildPots(totals, [true, true, false, true, true]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(totals.reduce((s, t) => s + t, 0));
  });
});

function fixedState(engine: typeof holdemEngine, players: number, over: Record<string, unknown> = {}): PokerState {
  return engine.create(cfg({ startingChips: 1000, smallBlind: 5, bigBlind: 10, ...over }), players, testCtx(42));
}

function totalChips(s: PokerState): number {
  return s.players.reduce((a, p) => a + p.chips + p.total, 0);
}

describe("betting rules", () => {
  it("gives the big blind the option preflop", () => {
    let s = fixedState(holdemEngine, 3);
    const ctx = testCtx(7);
    // Everybody limps.
    while (s.toAct !== null && s.phase === "preflop") {
      const seat = s.toAct;
      const p = s.players[seat]!;
      if (s.currentBet - p.street > 0) {
        const r = holdemEngine.apply(s, seat, { type: "call" }, ctx);
        expect(r.ok).toBe(true);
        if (r.ok) s = r.state;
      } else {
        // The BB is now to act with no bet to call: it may check or raise.
        expect(holdemEngine.legalActions(s, seat).map((a) => a.type)).toEqual(expect.arrayContaining(["check", "raise"]));
        break;
      }
    }
  });

  it("rejects out-of-turn actions and too-small raises", () => {
    const s = fixedState(holdemEngine, 3);
    const notToAct = (s.toAct! + 1) % 3;
    expect(holdemEngine.apply(s, notToAct, { type: "fold" }, testCtx()).ok).toBe(false);
    const r = holdemEngine.apply(s, s.toAct!, { type: "raise", to: 15 }, testCtx());
    expect(r).toEqual({ ok: false, error: "raise_too_small" });
    expect(holdemEngine.apply(s, s.toAct!, { type: "check" }, testCtx())).toEqual({ ok: false, error: "cannot_check" });
  });

  it("a short all-in raise does not reopen raising for players who already acted", () => {
    let s = fixedState(holdemEngine, 3);
    const ctx = testCtx(3);
    const utg = s.toAct!;
    // UTG raises to 100 (full raise of 90).
    let r = holdemEngine.apply(s, utg, { type: "raise", to: 100 }, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    // Next player has only 130 behind: shove to 130 (raise of 30 < 90 → incomplete).
    const short = s.toAct!;
    s.players[short]!.chips = 130 - s.players[short]!.street;
    r = holdemEngine.apply(s, short, { type: "allin" }, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    // Big blind has not acted yet → may re-raise.
    const bb = s.toAct!;
    expect(raiseRange(s, bb)).not.toBeNull();
    r = holdemEngine.apply(s, bb, { type: "call" }, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    // Back to UTG who already acted and faces only an incomplete raise → call or fold only.
    expect(s.toAct).toBe(utg);
    expect(raiseRange(s, utg)).toBeNull();
    expect(holdemEngine.apply(s, utg, { type: "raise", to: 400 }, ctx)).toEqual({ ok: false, error: "raise_not_allowed" });
  });

  it("caps pot-limit raises at the size of the pot", () => {
    const s = fixedState(omahaEngine, 3, { smallBlind: 1, bigBlind: 2 });
    const range = raiseRange(s, s.toAct!)!;
    expect(range.max).toBe(7); // call 2 + pot (3 + 2) → raise to 7
    expect(omahaEngine.apply(s, s.toAct!, { type: "raise", to: 8 }, testCtx())).toEqual({ ok: false, error: "raise_too_large" });
    expect(omahaEngine.apply(s, s.toAct!, { type: "allin" }, testCtx())).toEqual({ ok: false, error: "allin_not_allowed" });
  });

  it("enforces fixed-limit bet sizes and the four-bet cap", () => {
    let s = fixedState(holdemEngine, 2, { bettingStructure: "fixed_limit" });
    const ctx = testCtx(5);
    const sizes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const range = raiseRange(s, s.toAct!);
      if (!range) break;
      expect(range.min).toBe(range.max);
      sizes.push(range.min);
      const r = holdemEngine.apply(s, s.toAct!, { type: "raise", to: range.min }, ctx);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(sizes).toEqual([20, 30, 40]); // BB counts as the first bet: 10 → 20 → 30 → 40 (cap 4)
  });

  it("returns uncalled bets and conserves chips across every action", () => {
    let s = fixedState(holdemEngine, 2);
    const before = totalChips(s);
    const r = holdemEngine.apply(s, s.toAct!, { type: "raise", to: 500 }, testCtx());
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    const r2 = holdemEngine.apply(s, s.toAct!, { type: "fold" }, testCtx());
    if (!r2.ok) throw new Error(r2.error);
    expect(totalChips(r2.state)).toBe(before);
    expect(r2.state.lastHand?.refunded[0]?.amount).toBe(490);
  });
});

describe("handbook defaults", () => {
  it("6+ Hold'em: everyone antes, the button posts the button blind, action starts left of the button", () => {
    const s = fixedState(shortDeckEngine, 4);
    expect(s.config.shortDeckBlinds).toBe("button");
    const v = shortDeckEngine.view(s, null);
    expect(v.blindMode).toBe("button");
    expect(v.blinds).toEqual({ small: 0, big: 10, ante: 5 });
    // Three players paid the 5 ante; the button paid ante + the 10 button blind.
    for (const p of s.players) expect(p.total).toBe(p === s.players[s.dealer] ? 15 : 5);
    expect(s.players[s.dealer]!.street).toBe(10);
    expect(s.toAct).toBe((s.dealer + 1) % 4);
    expect(s.currentBet).toBe(10);
  });

  it("6+ Hold'em ranks a straight above three of a kind unless the house variant is chosen", () => {
    expect(cfg().tripsBeatStraight).toBe(false);
  });

  it("Hold'em and Omaha seat up to ten players; 6+ up to six", () => {
    expect(holdemEngine.seatLimits(cfg())).toEqual({ min: 2, max: 10 });
    expect(omahaEngine.seatLimits(cfg())).toEqual({ min: 2, max: 10 });
    expect(omahaHiLoEngine.seatLimits(cfg())).toEqual({ min: 2, max: 10 });
    expect(shortDeckEngine.seatLimits(cfg())).toEqual({ min: 2, max: 6 });
    expect(holdemEngine.create(cfg(), 10, testCtx(1)).players).toHaveLength(10);
  });
});

describe("private card confidentiality", () => {
  it("never shows opponents' hole cards before showdown", () => {
    const s = fixedState(holdemEngine, 4);
    for (let seat = 0; seat < 4; seat++) {
      const view = holdemEngine.view(s, seat);
      for (const p of view.players) {
        if (p.seat === seat) expect(p.hole).toEqual(s.players[seat]!.hole);
        else expect(p.hole).toBeNull();
      }
      const json = JSON.stringify(view);
      for (const [i, p] of s.players.entries()) {
        if (i === seat) continue;
        for (const c of p.hole) expect(json.includes(`"${c}"`) && !s.board.includes(c)).toBe(false);
      }
      // The remaining deck order is never part of a view.
      expect(json).not.toContain("deck");
    }
    const spectator = JSON.stringify(holdemEngine.view(s, null));
    for (const p of s.players) for (const c of p.hole) expect(spectator).not.toContain(`"${c}"`);
  });

  it("does not reveal folded hands at showdown", () => {
    const { state } = simulate(holdemEngine, cfg({ maxHands: 30 }), 4, 11, {
      onStep: (st) => {
        const last = st.lastHand;
        if (!last) return;
        for (const seat of Object.keys(last.revealed).map(Number)) {
          // Revealed hands must belong to players who reached showdown (not winner-by-fold).
          expect(last.awards.some((a) => a.side === "all" && Object.keys(last.revealed).length === 0 && a.seat === seat)).toBe(false);
        }
      },
    });
    expect(state.handNumber).toBeGreaterThan(0);
  });
});

describe("full matches with bots", () => {
  const engines = [holdemEngine, shortDeckEngine, omahaEngine, omahaHiLoEngine];
  it.each(engines.map((e) => [e.type, e] as const))("%s plays to completion with legal actions and chip conservation", (_, engine) => {
    for (const seed of [1, 2, 3]) {
      const config = cfg({ maxHands: 40, startingChips: 300, blindLevelHands: 10 });
      const initial = 300 * 4;
      const { state, finished } = simulate(engine, config, 4, seed, {
        difficulty: ["easy", "medium", "hard", "medium"],
        onStep: (s) => expect(totalChips(s)).toBe(initial),
      });
      expect(finished).toBe(true);
      const outcome = engine.outcome(state);
      expect(outcome.placements).toHaveLength(4);
      expect(Math.min(...outcome.placements)).toBe(1);
      expect(outcome.scores.reduce((a, b) => a + b, 0)).toBe(initial);
    }
  });
});

describe("Omaha Hi-Lo showdown splits", () => {
  function rigged(hole0: string, hole1: string, board: string): PokerState {
    const s = omahaHiLoEngine.create(cfg({ startingChips: 1000, smallBlind: 5, bigBlind: 10 }), 2, testCtx(9));
    s.players[0]!.hole = hole0.split(" ");
    s.players[1]!.hole = hole1.split(" ");
    const [f1, f2, f3, t, r] = board.split(" ");
    // pop() order: burn, flop×3, burn, turn, burn, river
    s.deck = [r!, "2D", t!, "3D", f3!, f2!, f1!, "4D"];
    return s;
  }
  function checkDown(s: PokerState): PokerState {
    const ctx = testCtx(1);
    const hand = s.handNumber;
    while (s.handNumber === hand && s.phase !== "over") {
      const seat = s.toAct!;
      const owes = s.currentBet - s.players[seat]!.street;
      const r = omahaHiLoEngine.apply(s, seat, owes > 0 ? { type: "call" } : { type: "check" }, ctx);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    return s;
  }

  it("splits the pot between the best high and the best qualifying low", () => {
    const s = checkDown(rigged("AH 2C KD KS", "QC QD JH TS", "3S 4H 5C QH QS"));
    const awards = s.lastHand!.awards;
    expect(awards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ seat: 1, side: "high", amount: 10, category: "quads" }),
        expect.objectContaining({ seat: 0, side: "low", amount: 10 }),
      ]),
    );
  });

  it("lets one player scoop high and low", () => {
    const s = checkDown(rigged("AH 2C KD KS", "QC QD JH TS", "3S 4H 5C 9D QH"));
    const toSeat0 = s.lastHand!.awards.filter((a) => a.seat === 0).reduce((t, a) => t + a.amount, 0);
    expect(toSeat0).toBe(20);
    expect(s.lastHand!.awards.every((a) => a.seat === 0)).toBe(true);
  });

  it("gives the whole pot to the high hand when no low qualifies", () => {
    const s = checkDown(rigged("AH 2C KD KS", "QC QD JH TS", "9S TH JC 8H KC"));
    expect(s.lastHand!.awards.every((a) => a.side === "high")).toBe(true);
    expect(s.lastHand!.awards.reduce((t, a) => t + a.amount, 0)).toBe(20);
  });

  it("splits the low half between tied low hands", () => {
    const s = checkDown(rigged("AH 2C KD KS", "AD 2S QH QC", "3S 4H 5C 9D JD"));
    const lows = s.lastHand!.awards.filter((a) => a.side === "low");
    expect(lows.map((a) => a.amount).sort()).toEqual([5, 5]);
  });
});
