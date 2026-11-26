/**
 * Bura — three-card version, one against one (owner's rules handbook, 2026-11-25; parabura.ge):
 *  - 20-card pack (10, J, Q, K, A in four suits; 6–9 removed), 120 card points;
 *  - three cards each; one card is turned for trump and lies at the bottom of the stock;
 *  - lead 1–3 cards of one suit; the opponent answers with the same number, beating every card
 *    with a distinct higher card of its suit or a trump, or throwing the cards (face down);
 *  - after winning a trick the taker chooses "var" or "continue" BEFORE the hands are refilled:
 *    var with 31+ captured points wins the deal, with fewer the opponent wins it;
 *  - "bura" (three trumps in hand on your turn) wins the deal at once;
 *  - otherwise the deal is played out: 61+ card points wins, 60:60 is a draw;
 *  - each deal won is worth one point; first to the target (6 / 11 / 21) wins the match.
 */
import { z } from "zod";
import { suitOf, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";
import { combos } from "../poker/evaluator";
import {
  BURA_DECK_20,
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

const PLAYERS = 2;
const HAND = 3;
const MAX_LEAD = 3;
export const VAR_POINTS = 31;
export const DEAL_POINTS = 61;

export const bura3ConfigSchema = z.strictObject({
  targetPoints: z.union([z.literal(6), z.literal(11), z.literal(21)]).default(11),
  /** "20" is the rules pack; 32/36 are house variants (6–9 / 7–9 are worth nothing). */
  deck: z.enum(["20", "32", "36"]).default("20"),
  /** Thrown (non-beating) cards are played face down and stay hidden. */
  closedDiscards: z.boolean().default(true),
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
  /** "Var": claim the deal with 31+ captured points (only right after winning a trick). */
  z.strictObject({ type: z.literal("claim") }),
  /** Decline var and refill the hands. */
  z.strictObject({ type: z.literal("continue") }),
]);
export type Bura3Action = z.infer<typeof bura3ActionSchema>;

export type Bura3EndReason = "points" | "var" | "false_var" | "bura" | "draw";

export interface Bura3State {
  config: Bura3Config;
  players: number;
  hands: Card[][];
  stock: Card[];
  trumpCard: Card;
  trump: Suit;
  captured: Card[][];
  /** Cards each player saw go into their own pile (for the memory aid and bots). */
  known: Card[][];
  tricksWon: number[];
  leader: number;
  dealer: number;
  phase: "lead" | "respond" | "var" | "over";
  trick: Trick | null;
  /**
   * The last finished trick (presentation only): tables show it before it is collected. Optional
   * because games persisted before it existed have none; it never affects play or scoring.
   */
  lastTrick?: { plays: Trick["plays"]; winner: number } | null;
  scores: number[];
  handNumber: number;
  lastHand: {
    handNumber: number;
    winner: number | null;
    reason: Bura3EndReason;
    claimer: number | null;
    claimedPoints: number | null;
    points: number[];
    revealed: Record<number, Card[]>;
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
  players: Array<{ seat: number; handCount: number; capturedCount: number; tricksWon: number }>;
  trick: { leader: number; count: number; bestSeat: number; plays: Array<{ seat: number; faceUp: Card[] | null; count: number }> } | null;
  /** The last finished trick, redacted like `trick` (face-down discards stay hidden from others). */
  lastTrick: { winner: number; plays: Array<{ seat: number; faceUp: Card[] | null; count: number }> } | null;
  you: { seat: number; hand: Card[]; knownPoints: number | null; hiddenInPile: number | null } | null;
  lastHand: Bura3State["lastHand"];
}

function deckFor(config: Bura3Config): readonly Card[] {
  return config.deck === "36" ? BURA_DECK_36 : config.deck === "32" ? BURA_DECK_32 : BURA_DECK_20;
}

const other = (s: number) => 1 - s;

function deal(state: Bura3State, ctx: EngineContext, events: PublicEvent[]): void {
  const deck = shuffle(deckFor(state.config), ctx.rng);
  state.handNumber += 1;
  state.hands = [[], []];
  state.captured = [[], []];
  state.known = [[], []];
  state.tricksWon = [0, 0];
  const first = other(state.dealer);
  for (let r = 0; r < HAND; r++) for (const s of [first, state.dealer]) state.hands[s]!.push(deck.pop()!);
  state.trumpCard = deck.pop()!;
  state.trump = suitOf(state.trumpCard);
  // The trump indicator lies face up at the bottom of the stock and is drawn last.
  state.stock = [state.trumpCard, ...deck];
  state.leader = first;
  state.trick = null;
  state.phase = "lead";
  events.push({ type: "deal", handNumber: state.handNumber, dealer: state.dealer, trumpCard: state.trumpCard });
  checkBura(state, first, ctx, events);
}

const hasBura = (state: Bura3State, seat: number) => state.hands[seat]!.length === HAND && state.hands[seat]!.every((c) => suitOf(c) === state.trump);

/** Three trumps on your turn win the deal at once. Returns true if the deal ended. */
function checkBura(state: Bura3State, seat: number, ctx: EngineContext, events: PublicEvent[]): boolean {
  if (!hasBura(state, seat)) return false;
  endDeal(state, ctx, events, { winner: seat, reason: "bura", revealed: { [seat]: [...state.hands[seat]!] } });
  return true;
}

function endDeal(
  state: Bura3State,
  ctx: EngineContext,
  events: PublicEvent[],
  result: { winner: number | null; reason: Bura3EndReason; claimer?: number; revealed?: Record<number, Card[]> },
): void {
  if (result.winner !== null) state.scores[result.winner]! += 1;
  const points = state.captured.map(sumPoints);
  state.lastHand = {
    handNumber: state.handNumber,
    winner: result.winner,
    reason: result.reason,
    claimer: result.claimer ?? null,
    claimedPoints: result.claimer !== undefined ? points[result.claimer]! : null,
    points: result.reason === "points" || result.reason === "draw" || result.claimer !== undefined ? points : [],
    revealed: result.revealed ?? {},
  };
  events.push({ type: "hand_end", ...state.lastHand });
  state.trick = null;
  if (state.scores.some((p) => p >= state.config.targetPoints)) {
    state.phase = "over";
    return;
  }
  // The deal winner deals next; after a draw the deal passes on.
  state.dealer = result.winner ?? other(state.dealer);
  deal(state, ctx, events);
}

/** Refill both hands to three, winner first, sharing a short stock equally (trump card last). */
function refill(state: Bura3State, winner: number): void {
  const need = HAND - state.hands[winner]!.length;
  const each = Math.min(need, Math.floor(state.stock.length / PLAYERS));
  for (let k = 0; k < each; k++) for (const s of [winner, other(winner)]) state.hands[s]!.push(state.stock.pop()!);
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
  state.lastTrick = { plays: deepClone(trick.plays), winner };
  state.trick = null;
  state.leader = winner;
  if (state.hands.every((h) => h.length === 0) && state.stock.length === 0) {
    finishByPoints(state, ctx, events);
    return;
  }
  // The taker may declare "var" before the hands are refilled.
  state.phase = "var";
}

function finishByPoints(state: Bura3State, ctx: EngineContext, events: PublicEvent[]): void {
  const points = state.captured.map(sumPoints);
  const winner = points[0]! >= DEAL_POINTS ? 0 : points[1]! >= DEAL_POINTS ? 1 : null;
  endDeal(state, ctx, events, { winner, reason: winner === null ? "draw" : "points" });
}

function continueDeal(state: Bura3State, ctx: EngineContext, events: PublicEvent[]): void {
  refill(state, state.leader);
  if (state.hands[state.leader]!.length === 0) {
    finishByPoints(state, ctx, events);
    return;
  }
  state.phase = "lead";
  checkBura(state, state.leader, ctx, events);
}

function legal(state: Bura3State, seat: number): Bura3Action[] {
  const hand = state.hands[seat]!;
  if (state.phase === "var" && seat === state.leader) return [{ type: "claim" }, { type: "continue" }];
  if (state.phase === "lead" && seat === state.leader) {
    const max = Math.min(MAX_LEAD, state.hands[other(seat)]!.length);
    return leadOptions(hand, max).map((cards) => ({ type: "lead" as const, cards }));
  }
  if (state.phase === "respond" && state.trick?.pending[0] === seat) {
    const out: Bura3Action[] = [];
    for (const o of combos(hand, state.trick.count)) {
      if (canBeatSet(o, state.trick.best, state.trump)) out.push({ type: "beat", cards: o });
      out.push({ type: "discard", cards: o });
    }
    return out;
  }
  return [];
}

function holds(hand: readonly Card[], cards: readonly Card[]): boolean {
  if (new Set(cards).size !== cards.length) return false;
  return cards.every((c) => hand.includes(c));
}

export const bura3Engine: GameEngine<Bura3State, Bura3Action, Bura3Config, Bura3View> = {
  type: "bura3",
  configSchema: bura3ConfigSchema as unknown as z.ZodType<Bura3Config>,
  actionSchema: bura3ActionSchema,
  seatLimits: () => ({ min: PLAYERS, max: PLAYERS }),

  create(config, players, ctx) {
    if (players !== PLAYERS) throw new Error("Three-card Bura is played one against one");
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
      dealer: ctx.rng.int(PLAYERS),
      phase: "lead",
      trick: null,
      scores: [0, 0],
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

    if (action.type === "claim" || action.type === "continue") {
      if (next.phase !== "var" || seat !== next.leader) return fail("var_not_available");
      if (action.type === "continue") {
        continueDeal(next, ctx, events);
        return { ok: true, state: next, events };
      }
      const points = sumPoints(next.captured[seat]!);
      const revealed = { [seat]: [...next.captured[seat]!] };
      events.push({ type: "var", seat, points });
      if (points >= VAR_POINTS) endDeal(next, ctx, events, { winner: seat, reason: "var", claimer: seat, revealed });
      else endDeal(next, ctx, events, { winner: other(seat), reason: "false_var", claimer: seat, revealed });
      return { ok: true, state: next, events };
    }

    if (action.type === "lead") {
      if (next.phase !== "lead" || seat !== next.leader) return fail("not_your_turn");
      if (!holds(hand, action.cards)) return fail("card_not_in_hand");
      if (!isValidLead(action.cards, Math.min(MAX_LEAD, next.hands[other(seat)]!.length))) return fail("lead_must_be_one_suit");
      next.hands[seat] = hand.filter((c) => !action.cards.includes(c));
      next.trick = {
        leader: seat,
        count: action.cards.length,
        plays: [{ seat, faceUp: [...action.cards], cards: [...action.cards] }],
        bestSeat: seat,
        best: [...action.cards],
        pending: [other(seat)],
      };
      next.phase = "respond";
      events.push({ type: "lead", seat, cards: [...action.cards] });
      checkBura(next, other(seat), ctx, events);
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
      players: state.hands.map((h, i) => ({ seat: i, handCount: h.length, capturedCount: state.captured[i]!.length, tricksWon: state.tricksWon[i]! })),
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
      lastTrick: state.lastTrick
        ? {
            winner: state.lastTrick.winner,
            plays: state.lastTrick.plays.map((p) => ({ seat: p.seat, faceUp: p.faceUp ? [...p.faceUp] : seat === p.seat ? [...p.cards] : null, count: p.cards.length })),
          }
        : null,
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
    if (state.phase === "var") return { type: "continue" };
    if (state.phase === "respond" && state.trick) {
      return { type: "discard", cards: cheapestDiscard(state.hands[seat]!, state.trick.count, state.trump) };
    }
    const options = legal(state, seat);
    const singles = options.filter((o) => o.type === "lead" && o.cards.length === 1);
    return singles.length ? (singles[0] as Bura3Action) : pick(options, ctx.rng);
  },

  bot({ view, legal: options, difficulty, rng }) {
    const you = view.you!;
    const trump = view.trump;
    if (options.length === 1) return options[0]!;
    if (view.phase === "var") {
      // Only points the bot actually saw count; hidden thrown cards may be worth nothing.
      const known = you.knownPoints ?? 0;
      const estimate = difficulty === "easy" ? known + rng.int(9) - 4 : known;
      return estimate >= VAR_POINTS ? { type: "claim" } : { type: "continue" };
    }
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
