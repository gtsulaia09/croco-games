/**
 * Card utilities. Cards are compact strings: rank char + suit char, e.g. "AS", "TH", "6C".
 * Jokers are "X1" and "X2". Suits: S(pades) H(earts) D(iamonds) C(lubs).
 */
export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];
export const RANKS_52 = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const RANKS_36 = ["6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS_52)[number];
export type Card = string;

export const JOKERS = ["X1", "X2"] as const;

export function isJoker(card: Card): boolean {
  return card === "X1" || card === "X2";
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

/** Numeric rank 2..14 (A = 14). */
export function rankValue(card: Card): number {
  return RANKS_52.indexOf(rankOf(card)) + 2;
}

export function makeDeck(ranks: readonly string[], suits: readonly Suit[] = SUITS): Card[] {
  const deck: Card[] = [];
  for (const s of suits) for (const r of ranks) deck.push(`${r}${s}`);
  return deck;
}

export const DECK_52: readonly Card[] = makeDeck(RANKS_52);
export const DECK_36: readonly Card[] = makeDeck(RANKS_36);
/** 36-card pack with the two black sixes replaced by jokers (Joker, Japanese Joker). */
export const DECK_36_JOKERS: readonly Card[] = [...DECK_36.filter((c) => c !== "6S" && c !== "6C"), ...JOKERS];

export function isValidCard(card: unknown, deck: readonly Card[]): card is Card {
  return typeof card === "string" && deck.includes(card);
}

export function removeCards(hand: Card[], cards: readonly Card[]): Card[] {
  const out = hand.slice();
  for (const c of cards) {
    const i = out.indexOf(c);
    if (i < 0) throw new Error(`Card ${c} not in hand`);
    out.splice(i, 1);
  }
  return out;
}

export function hasAll(hand: readonly Card[], cards: readonly Card[]): boolean {
  const pool = hand.slice();
  for (const c of cards) {
    const i = pool.indexOf(c);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

export function unique<T>(items: readonly T[]): boolean {
  return new Set(items).size === items.length;
}
