/**
 * Display order for a hand of cards (presentation only — never used for legality).
 *
 * Rules (owner's requirement): cards of one suit sit next to each other, and inside a suit they
 * run from the highest card to the lowest. Jokers go first (they are the strongest cards), then
 * the trump suit when there is one, then the remaining suits. Suits alternate black / red where
 * the hand allows it, so two neighbouring suits are never confused.
 */

export type RankOrder = "standard" | "bura";

/** Highest first. Bura ranks the ten directly below the ace. */
const RANKS: Record<RankOrder, readonly string[]> = {
  standard: ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"],
  bura: ["A", "T", "K", "Q", "J", "9", "8", "7", "6"],
};

/** Base suit cycle, already alternating colours: ♠ ♥ ♣ ♦. */
const SUIT_CYCLE = ["S", "H", "C", "D"] as const;
const isRed = (suit: string) => suit === "H" || suit === "D";
const isJoker = (card: string) => card === "X1" || card === "X2";

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

/** Order of the suits present in a hand: trump first, then fewest same-colour neighbours. */
export function suitOrder(suits: readonly string[], trump?: string | null): string[] {
  const present = SUIT_CYCLE.filter((s) => suits.includes(s));
  let best: string[] = present;
  let bestScore = Infinity;
  for (const perm of permutations(present)) {
    if (trump && present.includes(trump as (typeof SUIT_CYCLE)[number]) && perm[0] !== trump) continue;
    let clashes = 0;
    for (let i = 1; i < perm.length; i++) if (isRed(perm[i]!) === isRed(perm[i - 1]!)) clashes++;
    // Tie-break: closest to the base cycle, so the order is stable from hand to hand.
    const drift = perm.reduce((d, s, i) => d + Math.abs(SUIT_CYCLE.indexOf(s as (typeof SUIT_CYCLE)[number]) - i), 0);
    const score = clashes * 100 + drift;
    if (score < bestScore) {
      bestScore = score;
      best = perm;
    }
  }
  return best;
}

export function sortHand(cards: readonly string[], options: { order?: RankOrder; trump?: string | null } = {}): string[] {
  const ranks = RANKS[options.order ?? "standard"];
  const jokers = cards.filter(isJoker).sort((a, b) => a.localeCompare(b));
  const normal = cards.filter((c) => !isJoker(c));
  const suits = suitOrder([...new Set(normal.map((c) => c[1]!))], options.trump);
  const rankIndex = (c: string) => {
    const i = ranks.indexOf(c[0]!);
    return i < 0 ? ranks.length : i;
  };
  const sorted = normal.slice().sort((a, b) => suits.indexOf(a[1]!) - suits.indexOf(b[1]!) || rankIndex(a) - rankIndex(b));
  return [...jokers, ...sorted];
}
