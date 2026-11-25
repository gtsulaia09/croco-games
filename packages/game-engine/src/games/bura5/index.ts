/**
 * Bura — five-card version. An independent engine (not a cosmetic variant of 3-card Bura):
 *  - five cards per player, refilled from the stock after every trick;
 *  - no "opening" claims and no instant-win combinations — every hand is played to the end;
 *  - card points are counted at the end (120 in the pack): with two players more than 60 wins,
 *    60–60 is a draw;
 *  - match scoring uses penalty points (2 / 4 / 6 by how badly the loser did); the match ends
 *    when a player reaches the penalty limit, lowest penalty wins.
 */
import { z } from "zod";
import { suitOf, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, nextSeat, placementsFromScores, type GameEngine, type PublicEvent, type EngineContext } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";
import { combos } from "../poker/evaluator";
import {
  BURA_DECK_32,
  BURA_DECK_36,
  canBeatSet,
  cardPoints,
  cheapestBeat,
  cheapestDiscard,
  isValidLead,
  leadOptions,
  sumPoints,
  trickCards,
  type Trick,
} from "../_bura/core";

const HAND = 5;

export const bura5ConfigSchema = z.strictObject({
  penaltyLimit: z.number().int().min(6).max(24).default(12),
  deck: z.enum(["36", "32"]).default("36"),
  /** Maximum number of same-suit cards that may be led together. */
  maxLead: z.union([z.literal(3), z.literal(5)]).default(3),
  closedDiscards: z.boolean().default(true),
});
export type Bura5Config = z.infer<typeof bura5ConfigSchema>;

const cardSchema = z.enum(BURA_DECK_36 as [string, ...string[]]);
const cardsSchema = z.array(cardSchema).min(1).max(HAND);
export const bura5ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("lead"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("beat"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("discard"), cards: cardsSchema }),
]);
export type Bura5Action = z.infer<typeof bura5ActionSchema>;

export interface Bura5State {
  config: Bura5Config;
  players: number;
  hands: Card[][];
  stock: Card[];
  trumpCard: Card;
  trump: Suit;
  captured: Card[][];
  tricksWon: number[];
  leader: number;
  dealer: number;
  phase: "lead" | "respond" | "over";
  trick: Trick | null;
  penalties: number[];
  handNumber: number;
  lastHand: { handNumber: number; points: number[]; tricks: number[]; penalties: number[]; draw: boolean } | null;
}

export interface Bura5View {
  phase: Bura5State["phase"];
  handNumber: number;
  trumpCard: Card;
  trump: Suit;
  stockCount: number;
  leader: number;
  toAct: number | null;
  penalties: number[];
  penaltyLimit: number;
  maxLead: number;
  players: Array<{ seat: number; handCount: number; capturedCount: number; tricksWon: number }>;
  trick: { leader: number; count: number; bestSeat: number; plays: Array<{ seat: number; faceUp: Card[] | null; count: number }> } | null;
  you: { seat: number; hand: Card[] } | null;
  lastHand: Bura5State["lastHand"];
}

const order = (s: Bura5State, from: number) => Array.from({ length: s.players }, (_, i) => (from + i) % s.players);

function deal(state: Bura5State, ctx: EngineContext, events: PublicEvent[]): void {
  const deck = shuffle(state.config.deck === "32" ? BURA_DECK_32 : BURA_DECK_36, ctx.rng);
  state.handNumber += 1;
  state.hands = Array.from({ length: state.players }, () => []);
  state.captured = Array.from({ length: state.players }, () => []);
  state.tricksWon = new Array<number>(state.players).fill(0);
  for (let r = 0; r < HAND; r++) for (const s of order(state, state.dealer + 1)) state.hands[s]!.push(deck.pop()!);
  state.trumpCard = deck.pop()!;
  state.trump = suitOf(state.trumpCard);
  state.stock = [state.trumpCard, ...deck];
  state.leader = nextSeat(state.dealer, state.players);
  state.trick = null;
  state.phase = "lead";
  events.push({ type: "deal", handNumber: state.handNumber, dealer: state.dealer, trumpCard: state.trumpCard });
}

/** Penalty points for one hand (Kozel-style scale). */
export function bura5Penalties(points: number[], tricks: number[]): { penalties: number[]; draw: boolean } {
  const n = points.length;
  const best = Math.max(...points);
  const leaders = points.filter((p) => p === best).length;
  const threshold = n === 2 ? 31 : 21;
  const penalties = points.map((p, i) => {
    if (p === best) return leaders > 1 ? 2 : 0;
    if (tricks[i] === 0) return 6;
    return p >= threshold ? 2 : 4;
  });
  return { penalties, draw: leaders > 1 };
}

function finishHand(state: Bura5State, ctx: EngineContext, events: PublicEvent[]): void {
  const points = state.captured.map(sumPoints);
  const { penalties, draw } = bura5Penalties(points, state.tricksWon);
  for (let s = 0; s < state.players; s++) state.penalties[s]! += penalties[s]!;
  state.lastHand = { handNumber: state.handNumber, points, tricks: [...state.tricksWon], penalties, draw };
  events.push({ type: "hand_end", ...state.lastHand });
  if (state.penalties.some((p) => p >= state.config.penaltyLimit)) {
    state.phase = "over";
    state.trick = null;
    return;
  }
  const winner = draw ? null : points.indexOf(Math.max(...points));
  state.dealer = winner ?? nextSeat(state.dealer, state.players);
  deal(state, ctx, events);
}

function draw(state: Bura5State, winner: number): void {
  const needed = state.hands.reduce((s, h) => s + (HAND - h.length), 0);
  if (needed === 0) return;
  // With five-card hands the remaining stock is shared out as far as it goes.
  for (let round = 0; round < HAND; round++) {
    for (const s of order(state, winner)) {
      if (state.hands[s]!.length < HAND && state.stock.length > 0) state.hands[s]!.push(state.stock.pop()!);
    }
  }
}

function legal(state: Bura5State, seat: number): Bura5Action[] {
  const hand = state.hands[seat]!;
  if (state.phase === "lead" && seat === state.leader) {
    // Every player must be able to answer with the same number of cards.
    const minHand = Math.min(...state.hands.map((h) => h.length));
    return leadOptions(hand, Math.min(state.config.maxLead, minHand)).map((cards) => ({ type: "lead" as const, cards }));
  }
  if (state.phase === "respond" && state.trick?.pending[0] === seat) {
    const out: Bura5Action[] = [];
    for (const o of combos(hand, state.trick.count)) {
      if (canBeatSet(o, state.trick.best, state.trump)) out.push({ type: "beat", cards: o });
      out.push({ type: "discard", cards: o });
    }
    return out;
  }
  return [];
}

const holds = (hand: readonly Card[], cards: readonly Card[]) => new Set(cards).size === cards.length && cards.every((c) => hand.includes(c));

export const bura5Engine: GameEngine<Bura5State, Bura5Action, Bura5Config, Bura5View> = {
  type: "bura5",
  configSchema: bura5ConfigSchema as unknown as z.ZodType<Bura5Config>,
  actionSchema: bura5ActionSchema,
  seatLimits: () => ({ min: 2, max: 3 }),

  create(config, players, ctx) {
    if (players < 2 || players > 3) throw new Error("Five-card Bura needs 2–3 players");
    const state: Bura5State = {
      config,
      players,
      hands: [],
      stock: [],
      trumpCard: "AS",
      trump: "S",
      captured: [],
      tricksWon: [],
      leader: 0,
      dealer: ctx.rng.int(players),
      phase: "lead",
      trick: null,
      penalties: new Array<number>(players).fill(0),
      handNumber: 0,
      lastHand: null,
    };
    deal(state, ctx, []);
    return state;
  },

  actors(state) {
    if (state.phase === "over") return [];
    if (state.phase === "respond") return state.trick ? [state.trick.pending[0]!] : [];
    return [state.leader];
  },

  legalActions: legal,

  apply(state, seat, action, ctx) {
    if (state.phase === "over") return fail("match_over");
    const next = deepClone(state);
    const events: PublicEvent[] = [];
    const hand = next.hands[seat]!;
    if (action.type === "lead") {
      if (next.phase !== "lead" || seat !== next.leader) return fail("not_your_turn");
      if (!holds(hand, action.cards)) return fail("card_not_in_hand");
      const minHand = Math.min(...next.hands.map((h) => h.length));
      if (!isValidLead(action.cards, Math.min(next.config.maxLead, minHand))) return fail("invalid_lead");
      next.hands[seat] = hand.filter((c) => !action.cards.includes(c));
      next.trick = {
        leader: seat,
        count: action.cards.length,
        plays: [{ seat, faceUp: [...action.cards], cards: [...action.cards] }],
        bestSeat: seat,
        best: [...action.cards],
        pending: order(next, seat).slice(1),
      };
      next.phase = "respond";
      events.push({ type: "lead", seat, cards: [...action.cards] });
      return { ok: true, state: next, events };
    }
    const trick = next.trick;
    if (next.phase !== "respond" || !trick || trick.pending[0] !== seat) return fail("not_your_turn");
    if (action.cards.length !== trick.count) return fail("wrong_card_count");
    if (!holds(hand, action.cards)) return fail("card_not_in_hand");
    if (action.type === "beat" && !canBeatSet(action.cards, trick.best, next.trump)) return fail("does_not_beat");
    next.hands[seat] = hand.filter((c) => !action.cards.includes(c));
    const faceUp = action.type === "beat" || !next.config.closedDiscards ? [...action.cards] : null;
    trick.plays.push({ seat, faceUp, cards: [...action.cards] });
    if (action.type === "beat") {
      trick.best = [...action.cards];
      trick.bestSeat = seat;
    }
    trick.pending.shift();
    events.push({ type: action.type, seat, cards: faceUp ?? undefined, count: action.cards.length });
    if (trick.pending.length === 0) {
      const winner = trick.bestSeat;
      next.captured[winner]!.push(...trickCards(trick));
      next.tricksWon[winner]! += 1;
      events.push({ type: "trick_won", seat: winner });
      next.trick = null;
      next.leader = winner;
      draw(next, winner);
      if (next.hands.every((h) => h.length === 0)) finishHand(next, ctx, events);
      else next.phase = "lead";
    }
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    return {
      phase: state.phase,
      handNumber: state.handNumber,
      trumpCard: state.trumpCard,
      trump: state.trump,
      stockCount: state.stock.length,
      leader: state.leader,
      toAct: bura5Engine.actors(state)[0] ?? null,
      penalties: [...state.penalties],
      penaltyLimit: state.config.penaltyLimit,
      maxLead: state.config.maxLead,
      players: state.hands.map((h, i) => ({ seat: i, handCount: h.length, capturedCount: state.captured[i]!.length, tricksWon: state.tricksWon[i]! })),
      trick: state.trick
        ? {
            leader: state.trick.leader,
            count: state.trick.count,
            bestSeat: state.trick.bestSeat,
            plays: state.trick.plays.map((p) => ({ seat: p.seat, faceUp: p.faceUp ? [...p.faceUp] : seat === p.seat ? [...p.cards] : null, count: p.cards.length })),
          }
        : null,
      you: seat === null ? null : { seat, hand: [...state.hands[seat]!] },
      lastHand: state.lastHand ? deepClone(state.lastHand) : null,
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => ({ placements: placementsFromScores(state.penalties, true), scores: [...state.penalties] }),

  timeoutAction(state, seat, ctx) {
    if (state.phase === "respond" && state.trick) return { type: "discard", cards: cheapestDiscard(state.hands[seat]!, state.trick.count, state.trump) };
    const options = legal(state, seat);
    return options.find((o) => o.cards.length === 1) ?? pick(options, ctx.rng);
  },

  bot({ view, legal: options, difficulty, rng }) {
    const you = view.you!;
    const trump = view.trump;
    if (view.phase === "respond" && view.trick) {
      const best = view.trick.plays.find((p) => p.seat === view.trick!.bestSeat)?.faceUp ?? [];
      const atStake = view.trick.plays.reduce((s, p) => s + (p.faceUp ? sumPoints(p.faceUp) : 0), 0);
      const beat = cheapestBeat(you.hand, best, trump);
      if (beat) {
        const spendsTrump = beat.some((c) => suitOf(c) === trump);
        const late = view.stockCount === 0;
        const threshold = difficulty === "easy" ? rng.int(12) : spendsTrump && !late ? 10 : 0;
        if (atStake + sumPoints(beat) >= threshold) return { type: "beat", cards: beat };
      }
      return { type: "discard", cards: cheapestDiscard(you.hand, view.trick.count, trump) };
    }
    const leads = options.filter((o): o is Extract<Bura5Action, { type: "lead" }> => o.type === "lead");
    if (difficulty === "easy") return pick(leads, rng);
    const nonTrump = leads.filter((o) => o.cards.every((c) => suitOf(c) !== trump));
    if (difficulty === "hard") {
      const strong = nonTrump.filter((o) => o.cards.length > 1 && o.cards.every((c) => cardPoints(c) >= 10));
      if (strong.length) return strong.sort((a, b) => b.cards.length - a.cards.length)[0]!;
    }
    const pool = nonTrump.length ? nonTrump : leads;
    return pool.slice().sort((a, b) => a.cards.length - b.cards.length || sumPoints(a.cards) - sumPoints(b.cards))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `hand ${state.handNumber} · ${state.stock.length} in stock`),
};
