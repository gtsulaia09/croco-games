import { DECK_36, DECK_52, rankValue, suitOf, type Card } from "../../core/cards";
import type { BotInput } from "../../core/engine";
import { shuffle } from "../../core/rng";
import { bestHoldemHand, bestOmahaHand } from "./evaluator";
import type { PokerAction, PokerView } from "./engine";

/** Rough preflop strength in [0, 1] from the best two-card combination. */
function preflopStrength(hole: Card[]): number {
  let best = 0;
  for (let i = 0; i < hole.length; i++) {
    for (let j = i + 1; j < hole.length; j++) {
      const a = rankValue(hole[i]!);
      const b = rankValue(hole[j]!);
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      let s = (hi + lo) / 28;
      if (a === b) s = 0.5 + hi / 28;
      if (suitOf(hole[i]!) === suitOf(hole[j]!)) s += 0.05;
      if (hi - lo === 1) s += 0.04;
      best = Math.max(best, Math.min(1, s));
    }
  }
  return best;
}

/** Monte-Carlo equity against `opponents` random hands. Uses only cards visible to this seat. */
function estimateEquity(view: PokerView, hole: Card[], opponents: number, samples: number, rng: BotInput<PokerView, PokerAction>["rng"]): number {
  const omaha = view.variant === "omaha" || view.variant === "omaha_hilo";
  const fullDeck = view.variant === "shortdeck" ? DECK_36 : DECK_52;
  const known = new Set([...hole, ...view.board]);
  const remaining = fullDeck.filter((c) => !known.has(c));
  const holeSize = omaha ? 4 : 2;
  const rules = { shortDeck: view.variant === "shortdeck", tripsBeatStraight: true };
  let score = 0;
  for (let s = 0; s < samples; s++) {
    const deck = shuffle(remaining, rng);
    const board = [...view.board, ...deck.splice(0, 5 - view.board.length)];
    const mine = omaha ? bestOmahaHand(hole, board).value : bestHoldemHand(hole, board, rules).value;
    let beaten = false;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const opp = deck.splice(0, holeSize);
      const v = omaha ? bestOmahaHand(opp, board).value : bestHoldemHand(opp, board, rules).value;
      if (v > mine) {
        beaten = true;
        break;
      }
      if (v === mine) ties++;
    }
    if (!beaten) score += ties > 0 ? 1 / (ties + 1) : 1;
  }
  return score / samples;
}

function clampRaise(to: number, range: { min: number; max: number }): number {
  return Math.max(range.min, Math.min(range.max, Math.round(to)));
}

export function pokerBot(input: BotInput<PokerView, PokerAction>): PokerAction {
  const { view, legal, difficulty, rng } = input;
  const you = view.you;
  const has = (t: PokerAction["type"]) => legal.some((a) => a.type === t);
  if (!you || legal.length === 0) return { type: "fold" };
  const opponents = view.players.filter((p) => p.seat !== you.seat && !p.folded && !p.busted).length;
  const toCall = you.toCall;
  const pot = view.pot;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const passive: PokerAction = has("check") ? { type: "check" } : { type: "fold" };

  if (difficulty === "easy") {
    const r = rng.int(100);
    if (has("check")) return r < 85 || !you.raise ? { type: "check" } : { type: "raise", to: you.raise.min };
    const me = view.players[you.seat]!;
    if (toCall <= Math.max(view.blinds.big * 2, me.chips * 0.1) && r < 75) return { type: "call" };
    return r < 15 ? { type: "call" } : { type: "fold" };
  }

  let strength: number;
  if (view.board.length === 0) {
    strength = preflopStrength(you.hole);
    if (opponents > 2) strength -= 0.05 * (opponents - 2);
  } else {
    const samples = difficulty === "hard" ? (you.hole.length === 4 ? 60 : 150) : you.hole.length === 4 ? 25 : 50;
    strength = estimateEquity(view, you.hole, Math.max(1, opponents), samples, rng);
  }

  const raiseThreshold = difficulty === "hard" ? 0.62 : 0.7;
  if (you.raise && strength > raiseThreshold) {
    const fraction = strength > 0.85 ? 1 : 0.6;
    return { type: "raise", to: clampRaise(view.currentBet + pot * fraction, you.raise) };
  }
  if (toCall === 0) {
    // Occasional semi-bluff from hard bots in position-free heads-up spots.
    if (difficulty === "hard" && you.raise && opponents === 1 && rng.int(100) < 12) {
      return { type: "raise", to: clampRaise(pot * 0.5, you.raise) };
    }
    return passive;
  }
  const margin = difficulty === "hard" ? 0.02 : 0.08;
  if (strength >= potOdds + margin) return { type: "call" };
  return passive;
}
