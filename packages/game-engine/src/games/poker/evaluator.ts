import { rankValue, suitOf, type Card } from "../../core/cards";

/**
 * Poker hand evaluation. Values are comparable integers: higher = better (high hands).
 * Low hands (ace-to-five, 8-or-better) return a value where LOWER = better, or null.
 */
export type HandCategory =
  | "high_card"
  | "pair"
  | "two_pair"
  | "trips"
  | "straight"
  | "flush"
  | "full_house"
  | "quads"
  | "straight_flush";

export interface RankingRules {
  shortDeck: boolean;
  /** Short deck only: three of a kind beats a straight (Triton/GG style). */
  tripsBeatStraight: boolean;
}

export const STANDARD_RULES: RankingRules = { shortDeck: false, tripsBeatStraight: false };

function categoryOrder(rules: RankingRules): HandCategory[] {
  if (!rules.shortDeck) {
    return ["high_card", "pair", "two_pair", "trips", "straight", "flush", "full_house", "quads", "straight_flush"];
  }
  const middle: HandCategory[] = rules.tripsBeatStraight ? ["straight", "trips"] : ["trips", "straight"];
  // In short deck a flush beats a full house (flushes are rarer with 36 cards).
  return ["high_card", "pair", "two_pair", ...middle, "full_house", "flush", "quads", "straight_flush"];
}

const BASE = 15;

export interface HandValue {
  value: number;
  category: HandCategory;
  /** The five cards forming the hand (best ordering for display). */
  cards: Card[];
}

function straightHigh(sortedDistinctDesc: number[], shortDeck: boolean): number | null {
  if (sortedDistinctDesc.length < 5) return null;
  for (let i = 0; i + 4 < sortedDistinctDesc.length; i++) {
    const a = sortedDistinctDesc[i]!;
    if (sortedDistinctDesc[i + 4] === a - 4) return a;
  }
  const has = (v: number) => sortedDistinctDesc.includes(v);
  // Wheel: A-2-3-4-5 (standard) or A-6-7-8-9 (short deck); ace plays low.
  if (!shortDeck && has(14) && has(2) && has(3) && has(4) && has(5)) return 5;
  if (shortDeck && has(14) && has(6) && has(7) && has(8) && has(9)) return 9;
  return null;
}

/** Evaluate exactly five cards. */
export function evaluate5(cards: readonly Card[], rules: RankingRules = STANDARD_RULES): HandValue {
  if (cards.length !== 5) throw new Error("evaluate5 requires exactly five cards");
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const distinct = [...new Set(ranks)];
  const sHigh = distinct.length === 5 ? straightHigh(distinct, rules.shortDeck) : null;

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups sorted by (count desc, rank desc).
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join("");

  let category: HandCategory;
  let kickers: number[];
  if (sHigh !== null && flush) {
    category = "straight_flush";
    kickers = [sHigh];
  } else if (shape === "41") {
    category = "quads";
    kickers = groups.map((g) => g[0]);
  } else if (shape === "32") {
    category = "full_house";
    kickers = groups.map((g) => g[0]);
  } else if (flush) {
    category = "flush";
    kickers = ranks;
  } else if (sHigh !== null) {
    category = "straight";
    kickers = [sHigh];
  } else if (shape === "311") {
    category = "trips";
    kickers = groups.map((g) => g[0]);
  } else if (shape === "221") {
    category = "two_pair";
    kickers = groups.map((g) => g[0]);
  } else if (shape === "2111") {
    category = "pair";
    kickers = groups.map((g) => g[0]);
  } else {
    category = "high_card";
    kickers = ranks;
  }

  const catIndex = categoryOrder(rules).indexOf(category);
  let value = catIndex;
  for (let i = 0; i < 5; i++) value = value * BASE + (kickers[i] ?? 0);
  return { value, category, cards: [...cards] };
}

function* combinations<T>(items: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]!);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

export function combos<T>(items: readonly T[], k: number): T[][] {
  return [...combinations(items, k)];
}

/** Best five-card hand from any combination of hole + board (Hold'em, Short Deck). */
export function bestHoldemHand(hole: readonly Card[], board: readonly Card[], rules: RankingRules = STANDARD_RULES): HandValue {
  let best: HandValue | null = null;
  for (const five of combinations([...hole, ...board], 5)) {
    const v = evaluate5(five, rules);
    if (!best || v.value > best.value) best = v;
  }
  if (!best) throw new Error("Not enough cards to evaluate");
  return best;
}

/** Omaha: EXACTLY two hole cards and EXACTLY three board cards. */
export function bestOmahaHand(hole: readonly Card[], board: readonly Card[]): HandValue {
  let best: HandValue | null = null;
  for (const h of combinations(hole, 2)) {
    for (const b of combinations(board, 3)) {
      const v = evaluate5([...h, ...b], STANDARD_RULES);
      if (!best || v.value > best.value) best = v;
    }
  }
  if (!best) throw new Error("Not enough cards to evaluate");
  return best;
}

export interface LowValue {
  /** Lower is better. */
  value: number;
  cards: Card[];
  ranks: number[];
}

/** Ace-to-five low with 8-or-better qualifier: five distinct ranks, all ≤ 8; straights/flushes ignored. */
export function evaluateLow5(cards: readonly Card[]): LowValue | null {
  const lowRanks = cards.map((c) => (rankValue(c) === 14 ? 1 : rankValue(c)));
  if (lowRanks.some((r) => r > 8)) return null;
  if (new Set(lowRanks).size !== 5) return null;
  const sorted = lowRanks.slice().sort((a, b) => b - a);
  let value = 0;
  for (const r of sorted) value = value * 16 + r;
  return { value, cards: [...cards], ranks: sorted };
}

/** Omaha Hi-Lo low: exactly two hole + three board cards, best qualifying low or null. */
export function bestOmahaLow(hole: readonly Card[], board: readonly Card[]): LowValue | null {
  let best: LowValue | null = null;
  for (const h of combinations(hole, 2)) {
    for (const b of combinations(board, 3)) {
      const v = evaluateLow5([...h, ...b]);
      if (v && (!best || v.value < best.value)) best = v;
    }
  }
  return best;
}
