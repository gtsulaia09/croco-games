/**
 * Trick mechanics shared by the two Bura engines (3-card and 5-card). The engines differ in
 * hand size, lead limits, end-of-hand logic, combinations and match scoring.
 */
import { makeDeck, suitOf, type Card, type Suit } from "../../core/cards";
import { combos } from "../poker/evaluator";

/** Bura ranking: A > 10 > K > Q > J > 9 > 8 > 7 > 6 (ten ranks above king). */
const BURA_ORDER = ["6", "7", "8", "9", "J", "Q", "K", "T", "A"] as const;
const BURA_POINTS: Record<string, number> = { A: 11, T: 10, K: 4, Q: 3, J: 2 };

export const BURA_DECK_36: readonly Card[] = makeDeck(["6", "7", "8", "9", "T", "J", "Q", "K", "A"]);
/** Three-card Bura pack: tens to aces only (6–9 removed), still 120 points. */
export const BURA_DECK_20: readonly Card[] = makeDeck(["T", "J", "Q", "K", "A"]);
export const BURA_DECK_32: readonly Card[] = makeDeck(["7", "8", "9", "T", "J", "Q", "K", "A"]);

export function buraRank(card: Card): number {
  return BURA_ORDER.indexOf(card[0] as (typeof BURA_ORDER)[number]);
}

export function cardPoints(card: Card): number {
  return BURA_POINTS[card[0]!] ?? 0;
}

export function sumPoints(cards: readonly Card[]): number {
  return cards.reduce((s, c) => s + cardPoints(c), 0);
}

/** Does `attacker` beat `defender` given the trump suit? */
export function beats(attacker: Card, defender: Card, trump: Suit): boolean {
  const a = suitOf(attacker);
  const d = suitOf(defender);
  if (a === d) return buraRank(attacker) > buraRank(defender);
  return a === trump && d !== trump;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

/** True if every card in `best` can be beaten by a distinct card of `response`. */
export function canBeatSet(response: readonly Card[], best: readonly Card[], trump: Suit): boolean {
  if (response.length !== best.length) return false;
  return permutations([...response]).some((perm) => perm.every((c, i) => beats(c, best[i]!, trump)));
}

export function isValidLead(cards: readonly Card[], maxLead: number): boolean {
  if (cards.length < 1 || cards.length > maxLead) return false;
  return cards.every((c) => suitOf(c) === suitOf(cards[0]!));
}

export interface TrickPlay {
  seat: number;
  /**
   * Cards played face up (lead or beating set); null when discarded face down. After a malutka
   * top-up it can be shorter than `cards`: the earlier face-up cards stay, the thrown ones are hidden.
   */
  faceUp: Card[] | null;
  /** All cards actually played (hidden from other players when discarded face down). */
  cards: Card[];
}

export interface Trick {
  leader: number;
  count: number;
  plays: TrickPlay[];
  bestSeat: number;
  best: Card[];
  /** Seats that still have to respond, in order. */
  pending: number[];
}

export function trickCards(trick: Trick): Card[] {
  return trick.plays.flatMap((p) => p.cards);
}

/** Cards a seat has already put into the trick. */
export function playedBy(trick: Trick, seat: number): Card[] {
  return trick.plays.filter((p) => p.seat === seat).flatMap((p) => p.cards);
}

/**
 * How many cards a seat still has to put into the trick. Normally the lead count; after a malutka
 * a player who already played tops up to the malutka's size (earlier cards count), and a player
 * with fewer cards lays down the whole hand.
 */
export function owedBy(trick: Trick, seat: number, handSize: number): number {
  return Math.max(0, Math.min(trick.count - playedBy(trick, seat).length, handSize));
}

/** Can `added` together with the seat's earlier cards beat the current best set one-for-one? */
export function answerBeats(trick: Trick, seat: number, added: readonly Card[], trump: Suit): boolean {
  const answer = [...playedBy(trick, seat), ...added];
  return answer.length === trick.count && canBeatSet(answer, trick.best, trump);
}

/**
 * Record an answer. A seat that already played (topping up against a malutka) keeps one set on
 * the felt: its earlier cards plus the new ones. A beating answer is shown face up and becomes the
 * set to beat; a thrown one stays face down when `closed` (earlier face-up cards stay visible).
 */
export function addAnswer(trick: Trick, seat: number, added: readonly Card[], beat: boolean, closed: boolean): void {
  const earlier = trick.plays.find((p) => p.seat === seat);
  if (!earlier) {
    trick.plays.push({ seat, faceUp: beat || !closed ? [...added] : null, cards: [...added] });
  } else {
    earlier.cards = [...earlier.cards, ...added];
    earlier.faceUp = beat || !closed ? [...earlier.cards] : earlier.faceUp;
  }
  if (beat) {
    trick.best = [...playedBy(trick, seat)];
    trick.bestSeat = seat;
  }
}

/** Cards of a finished trick the winner saw go into the pile (thrown face-down cards stay unknown). */
export function seenByWinner(trick: Pick<Trick, "plays">, winner: number, closed: boolean): Card[] {
  return trick.plays.flatMap((p) => (p.seat === winner || !closed ? p.cards : (p.faceUp ?? [])));
}

/** Five (or three) cards of one suit that are not all trumps — the shape of a malutka. */
export function isMalutkaHand(hand: readonly Card[], size: number, trump: Suit): boolean {
  if (hand.length !== size) return false;
  if (!hand.every((c) => suitOf(c) === suitOf(hand[0]!))) return false;
  return !hand.every((c) => suitOf(c) === trump); // all trumps is a bura
}

export function cheapestBeat(hand: readonly Card[], best: readonly Card[], trump: Suit): Card[] | null {
  let bestOption: Card[] | null = null;
  let bestCost = Infinity;
  for (const option of combos(hand, best.length)) {
    if (!canBeatSet(option, best, trump)) continue;
    const cost = option.reduce((s, c) => s + cardPoints(c) + (suitOf(c) === trump ? 6 + buraRank(c) : buraRank(c) * 0.1), 0);
    if (cost < bestCost) {
      bestCost = cost;
      bestOption = option;
    }
  }
  return bestOption;
}

export function cheapestDiscard(hand: readonly Card[], count: number, trump: Suit): Card[] {
  return hand
    .slice()
    .sort((a, b) => cardPoints(a) + (suitOf(a) === trump ? 20 : 0) - (cardPoints(b) + (suitOf(b) === trump ? 20 : 0)) || buraRank(a) - buraRank(b))
    .slice(0, count);
}

/** Lead options for bots: singles and same-suit groups up to `maxLead`. */
export function leadOptions(hand: readonly Card[], maxLead: number): Card[][] {
  const out: Card[][] = [];
  for (let k = 1; k <= Math.min(maxLead, hand.length); k++) {
    for (const option of combos(hand, k)) if (isValidLead(option, maxLead)) out.push(option);
  }
  return out;
}
