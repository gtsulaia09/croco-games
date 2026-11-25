/**
 * Bura — three-card version (default ruleset documented in docs/games/GAME_RULES.md §Bura).
 * Lead 1–3 cards of one suit; opponents beat every card or throw the same number face down.
 * A player who has taken a trick may "open" (claim) on their lead: 31+ card points wins the
 * hand, a false claim gives every opponent a point. Three trumps ("bura") win immediately.
 */
import { z } from "zod";
import { suitOf, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, nextSeat, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
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

const HAND = 3;
const MAX_LEAD = 3;

export const bura3ConfigSchema = z.strictObject({
  targetPoints: z.number().int().min(3).max(21).default(7),
  deck: z.enum(["36", "32"]).default("36"),
  /** Non-beating cards are played face down and stay hidden until a claim. */
  closedDiscards: z.boolean().default(true),
  /** Molodka (3 of a non-trump suit) and three aces take the lead out of turn. */
  combinations: z.boolean().default(false),
  /** Variation: three aces win the hand like a bura when nobody holds a bura. */
  threeAcesWin: z.boolean().default(false),
  /** Show players the known points in their own pile (default off: players must remember). */
  memoryAid: z.boolean().default(false),
});
export type Bura3Config = z.infer<typeof bura3ConfigSchema>;

const cardSchema = z.enum(BURA_DECK_36 as [string, ...string[]]);
const cardsSchema = z.array(cardSchema).min(1).max(MAX_LEAD);
export const bura3ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("lead"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("beat"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("discard"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("claim") }),
  z.strictObject({ type: z.literal("pass") }),
]);
export type Bura3Action = z.infer<typeof bura3ActionSchema>;

type HandEndReason = "claim" | "false_claim" | "bura" | "three_aces" | "draw";

export interface Bura3State {
  config: Bura3Config;
  players: number;
  hands: Card[][];
  stock: Card[];
  trumpCard: Card;
  trump: Suit;
  captured: Card[][];
  known: Card[][];
  tricksWon: number[];
  leader: number;
  dealer: number;
  phase: "lead" | "respond" | "final" | "over";
  trick: Trick | null;
  forcedLead: Card[] | null;
  scores: number[];
  drawCarry: number;
  handNumber: number;
  lastHand: {
    handNumber: number;
    winner: number | null;
    reason: HandEndReason;
    claimer: number | null;
    claimedPoints: number | null;
    revealed: Record<number, Card[]>;
    awarded: number[];
  } | null;
}

export interface Bura3View {
  phase: Bura3State["phase"];
  handNumber: number;
  trumpCard: Card;
  trump: Suit;
  stockCount: number;
  leader: number;
  toAct: number | null;
  scores: number[];
  targetPoints: number;
  drawCarry: number;
  players: Array<{ seat: number; handCount: number; capturedCount: number; tricksWon: number }>;
  trick: { leader: number; count: number; bestSeat: number; plays: Array<{ seat: number; faceUp: Card[] | null; count: number }> } | null;
  you: { seat: number; hand: Card[]; knownPoints: number | null; hiddenInPile: number | null; forcedLead: Card[] | null } | null;
  lastHand: Bura3State["lastHand"];
}

function deckFor(config: Bura3Config): readonly Card[] {
  return config.deck === "32" ? BURA_DECK_32 : BURA_DECK_36;
}

function order(state: Bura3State, from: number): number[] {
  return Array.from({ length: state.players }, (_, i) => (from + i) % state.players);
}

function deal(state: Bura3State, ctx: EngineContext, events: PublicEvent[]): void {
  const deck = shuffle(deckFor(state.config), ctx.rng);
  state.handNumber += 1;
  state.hands = Array.from({ length: state.players }, () => []);
  state.captured = Array.from({ length: state.players }, () => []);
  state.known = Array.from({ length: state.players }, () => []);
  state.tricksWon = new Array<number>(state.players).fill(0);
  for (let r = 0; r < HAND; r++) for (const s of order(state, state.dealer + 1)) state.hands[s]!.push(deck.pop()!);
  state.trumpCard = deck.pop()!;
  state.trump = suitOf(state.trumpCard);
  // The trump indicator lies face up under the stock and is drawn last.
  state.stock = [state.trumpCard, ...deck];
  state.leader = nextSeat(state.dealer, state.players);
  state.trick = null;
  state.forcedLead = null;
  state.phase = "lead";
  events.push({ type: "deal", handNumber: state.handNumber, dealer: state.dealer, trumpCard: state.trumpCard });
  checkCombinations(state, ctx, events);
}

function endHand(state: Bura3State, ctx: EngineContext, events: PublicEvent[], result: {
  winner: number | null;
  reason: HandEndReason;
  claimer?: number;
  revealed?: Record<number, Card[]>;
}): void {
  const awarded = new Array<number>(state.players).fill(0);
  if (result.reason === "false_claim") {
    for (let s = 0; s < state.players; s++) if (s !== result.claimer) awarded[s] = 1;
  } else if (result.winner !== null) {
    awarded[result.winner] = 1 + state.drawCarry;
    state.drawCarry = 0;
  } else {
    state.drawCarry += 1;
  }
  for (let s = 0; s < state.players; s++) state.scores[s]! += awarded[s]!;
  state.lastHand = {
    handNumber: state.handNumber,
    winner: result.winner,
    reason: result.reason,
    claimer: result.claimer ?? null,
    claimedPoints: result.claimer !== undefined ? sumPoints(state.captured[result.claimer]!) : null,
    revealed: result.revealed ?? {},
    awarded,
  };
  events.push({ type: "hand_end", ...state.lastHand });
  if (state.scores.some((p) => p >= state.config.targetPoints)) {
    state.phase = "over";
    state.trick = null;
    return;
  }
  // The hand winner (or claimer) deals next; after a draw the same dealer deals again.
  if (result.winner !== null) state.dealer = result.winner;
  else if (result.claimer !== undefined) state.dealer = result.claimer;
  deal(state, ctx, events);
}

function checkCombinations(state: Bura3State, ctx: EngineContext, events: PublicEvent[]): void {
  if (state.phase !== "lead") return;
  const seats = order(state, state.leader);
  const trumps = (s: number) => state.hands[s]!.length === HAND && state.hands[s]!.every((c) => suitOf(c) === state.trump);
  const aces = (s: number) => state.hands[s]!.length === HAND && state.hands[s]!.every((c) => c[0] === "A");
  const bura = seats.find(trumps);
  if (bura !== undefined) {
    endHand(state, ctx, events, { winner: bura, reason: "bura", revealed: { [bura]: [...state.hands[bura]!] } });
    return;
  }
  if (state.config.threeAcesWin) {
    const ace = seats.find(aces);
    if (ace !== undefined) {
      endHand(state, ctx, events, { winner: ace, reason: "three_aces", revealed: { [ace]: [...state.hands[ace]!] } });
      return;
    }
  }
  if (!state.config.combinations) return;
  const molodka = (s: number) =>
    state.hands[s]!.length === HAND &&
    state.hands[s]!.every((c) => suitOf(c) === suitOf(state.hands[s]![0]!)) &&
    suitOf(state.hands[s]![0]!) !== state.trump;
  const holder = seats.find(aces) ?? seats.find(molodka);
  if (holder !== undefined) {
    state.leader = holder;
    state.forcedLead = [...state.hands[holder]!];
    events.push({ type: "combination", seat: holder, kind: aces(holder) ? "three_aces" : "molodka" });
  }
}

function drawAfterTrick(state: Bura3State, winner: number): void {
  const needed = state.hands.reduce((s, h) => s + (HAND - h.length), 0);
  if (needed === 0 || state.stock.length < needed) return; // short stock is not used
  for (let round = 0; round < HAND; round++) {
    for (const s of order(state, winner)) {
      if (state.hands[s]!.length < HAND && state.stock.length > 0) state.hands[s]!.push(state.stock.pop()!);
    }
  }
}

function resolveTrick(state: Bura3State, ctx: EngineContext, events: PublicEvent[]): void {
  const trick = state.trick!;
  const winner = trick.bestSeat;
  const cards = trickCards(trick);
  state.captured[winner]!.push(...cards);
  state.tricksWon[winner]! += 1;
  for (const p of trick.plays) {
    if (p.faceUp || !state.config.closedDiscards || p.seat === winner) state.known[winner]!.push(...p.cards);
  }
  events.push({ type: "trick_won", seat: winner, cards: cards.length });
  state.trick = null;
  state.leader = winner;
  state.forcedLead = null;
  drawAfterTrick(state, winner);
  if (state.hands.every((h) => h.length === 0)) {
    state.phase = "final";
    return;
  }
  state.phase = "lead";
  checkCombinations(state, ctx, events);
}

function legal(state: Bura3State, seat: number): Bura3Action[] {
  const hand = state.hands[seat]!;
  if (state.phase === "lead" && seat === state.leader) {
    const out: Bura3Action[] = state.forcedLead
      ? [{ type: "lead", cards: [...state.forcedLead] }]
      : leadOptions(hand, MAX_LEAD).map((cards) => ({ type: "lead" as const, cards }));
    if (state.tricksWon[seat]! > 0) out.push({ type: "claim" });
    return out;
  }
  if (state.phase === "final" && seat === state.leader) {
    return state.tricksWon[seat]! > 0 ? [{ type: "claim" }, { type: "pass" }] : [{ type: "pass" }];
  }
  if (state.phase === "respond" && state.trick?.pending[0] === seat) {
    const k = state.trick.count;
    const options = combos(hand, k);
    const out: Bura3Action[] = [];
    for (const o of options) {
      if (canBeatSet(o, state.trick.best, state.trump)) out.push({ type: "beat", cards: o });
      out.push({ type: "discard", cards: o });
    }
    return out;
  }
  return [];
}

function sameMultiset(a: readonly Card[], b: readonly Card[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function holds(hand: readonly Card[], cards: readonly Card[]): boolean {
  if (new Set(cards).size !== cards.length) return false;
  return cards.every((c) => hand.includes(c));
}

export const bura3Engine: GameEngine<Bura3State, Bura3Action, Bura3Config, Bura3View> = {
  type: "bura3",
  configSchema: bura3ConfigSchema as unknown as z.ZodType<Bura3Config>,
  actionSchema: bura3ActionSchema,
  seatLimits: () => ({ min: 2, max: 4 }),

  create(config, players, ctx) {
    if (players < 2 || players > 4) throw new Error("Bura needs 2–4 players");
    const state: Bura3State = {
      config,
      players,
      hands: [],
      stock: [],
      trumpCard: "AS",
      trump: "S",
      captured: [],
      known: [],
      tricksWon: [],
      leader: 0,
      dealer: ctx.rng.int(players),
      phase: "lead",
      trick: null,
      forcedLead: null,
      scores: new Array<number>(players).fill(0),
      drawCarry: 0,
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

    if (action.type === "claim" || action.type === "pass") {
      if (seat !== next.leader || (next.phase !== "lead" && next.phase !== "final")) return fail("not_your_turn");
      if (action.type === "pass") {
        if (next.phase !== "final") return fail("cannot_pass");
        endHand(next, ctx, events, { winner: null, reason: "draw" });
        return { ok: true, state: next, events };
      }
      if (next.tricksWon[seat] === 0) return fail("no_tricks_taken");
      const points = sumPoints(next.captured[seat]!);
      const revealed = { [seat]: [...next.captured[seat]!] };
      events.push({ type: "claim", seat, points });
      if (points >= 31) endHand(next, ctx, events, { winner: seat, reason: "claim", claimer: seat, revealed });
      else endHand(next, ctx, events, { winner: null, reason: "false_claim", claimer: seat, revealed });
      return { ok: true, state: next, events };
    }

    if (action.type === "lead") {
      if (next.phase !== "lead" || seat !== next.leader) return fail("not_your_turn");
      if (!holds(hand, action.cards)) return fail("card_not_in_hand");
      if (!isValidLead(action.cards, MAX_LEAD)) return fail("lead_must_be_one_suit");
      if (next.forcedLead && !sameMultiset(next.forcedLead, action.cards)) return fail("must_lead_combination");
      next.hands[seat] = hand.filter((c) => !action.cards.includes(c));
      const pending = order(next, seat).slice(1);
      next.trick = {
        leader: seat,
        count: action.cards.length,
        plays: [{ seat, faceUp: [...action.cards], cards: [...action.cards] }],
        bestSeat: seat,
        best: [...action.cards],
        pending,
      };
      next.forcedLead = null;
      next.phase = "respond";
      events.push({ type: "lead", seat, cards: [...action.cards] });
      return { ok: true, state: next, events };
    }

    // beat / discard
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
    if (trick.pending.length === 0) resolveTrick(next, ctx, events);
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    const you =
      seat === null
        ? null
        : {
            seat,
            hand: [...state.hands[seat]!],
            knownPoints: state.config.memoryAid ? sumPoints(state.known[seat]!) : null,
            hiddenInPile: state.config.memoryAid ? state.captured[seat]!.length - state.known[seat]!.length : null,
            forcedLead: state.leader === seat && state.forcedLead ? [...state.forcedLead] : null,
          };
    return {
      phase: state.phase,
      handNumber: state.handNumber,
      trumpCard: state.trumpCard,
      trump: state.trump,
      stockCount: state.stock.length,
      leader: state.leader,
      toAct: bura3Engine.actors(state)[0] ?? null,
      scores: [...state.scores],
      targetPoints: state.config.targetPoints,
      drawCarry: state.drawCarry,
      players: state.hands.map((h, i) => ({
        seat: i,
        handCount: h.length,
        capturedCount: state.captured[i]!.length,
        tricksWon: state.tricksWon[i]!,
      })),
      trick: state.trick
        ? {
            leader: state.trick.leader,
            count: state.trick.count,
            bestSeat: state.trick.bestSeat,
            plays: state.trick.plays.map((p) => ({
              seat: p.seat,
              faceUp: p.faceUp ? [...p.faceUp] : seat === p.seat ? [...p.cards] : null,
              count: p.cards.length,
            })),
          }
        : null,
      you,
      lastHand: state.lastHand ? deepClone(state.lastHand) : null,
    };
  },

  botView(state, seat) {
    // Bots get the same information as a player with perfect memory of their own pile.
    const v = bura3Engine.view(state, seat);
    if (v.you) {
      v.you.knownPoints = sumPoints(state.known[seat]!);
      v.you.hiddenInPile = state.captured[seat]!.length - state.known[seat]!.length;
    }
    return v;
  },

  isOver: (state) => state.phase === "over",

  outcome: (state) => ({ placements: placementsFromScores(state.scores), scores: [...state.scores] }),

  timeoutAction(state, seat, ctx) {
    const options = legal(state, seat);
    if (state.phase === "final") return { type: "pass" };
    if (state.phase === "respond" && state.trick) {
      return { type: "discard", cards: cheapestDiscard(state.hands[seat]!, state.trick.count, state.trump) };
    }
    const singles = options.filter((o) => o.type === "lead" && o.cards.length === 1);
    return singles.length ? (singles[0] as Bura3Action) : pick(options, ctx.rng);
  },

  bot({ view, legal: options, difficulty, rng }) {
    const you = view.you!;
    const trump = view.trump;
    if (options.length === 1) return options[0]!;
    const known = you.knownPoints ?? 0;
    const canClaim = options.some((o) => o.type === "claim");
    if (canClaim) {
      // Easy bots occasionally misjudge; others only claim when the known points suffice.
      // Hidden face-down cards may be worth nothing, so only known points are trusted.
      const estimate = difficulty === "easy" ? known + rng.int(9) - 4 : known;
      if (estimate >= 31) return { type: "claim" };
    }
    if (view.phase === "final") return { type: "pass" };
    if (view.phase === "respond" && view.trick) {
      const best = view.trick.plays.find((p) => p.seat === view.trick!.bestSeat)?.faceUp ?? [];
      const atStake = view.trick.plays.reduce((s, p) => s + (p.faceUp ? sumPoints(p.faceUp) : 0), 0);
      const beat = cheapestBeat(you.hand, best, trump);
      if (beat) {
        const spendsTrump = beat.some((c) => suitOf(c) === trump);
        const worth = atStake + sumPoints(beat);
        const threshold = difficulty === "easy" ? rng.int(15) : spendsTrump ? 10 : 0;
        if (worth >= threshold) return { type: "beat", cards: beat };
      }
      return { type: "discard", cards: cheapestDiscard(you.hand, view.trick.count, trump) };
    }
    // Leading.
    const leads = options.filter((o): o is Extract<Bura3Action, { type: "lead" }> => o.type === "lead");
    if (difficulty === "easy") return pick(leads, rng);
    const nonTrump = leads.filter((o) => o.cards.every((c) => suitOf(c) !== trump));
    // Strong multi-card leads of high cards grab points; otherwise lead a low single.
    const strong = nonTrump.filter((o) => o.cards.length > 1 && o.cards.every((c) => cardPoints(c) >= 10));
    if (strong.length && difficulty === "hard") return strong.sort((a, b) => b.cards.length - a.cards.length)[0]!;
    const pool = nonTrump.length ? nonTrump : leads;
    return pool.slice().sort((a, b) => a.cards.length - b.cards.length || sumPoints(a.cards) - sumPoints(b.cards))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `hand ${state.handNumber} · ${state.stock.length} in stock`),
};
