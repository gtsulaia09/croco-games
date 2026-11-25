/**
 * Japanese Joker (იაპონური ჯოკერი) — a two-player Georgian game, distinct from Joker:
 *  - 36-card pack, black sixes are jokers;
 *  - 3 cards dealt, the non-dealer names trump (or no trump), then each player receives a row
 *    of 5 face-down cards covered by 5 face-up cards, and 5 more cards to the hand;
 *  - players may play from the hand or from their face-up table cards; following suit is
 *    compulsory, then trumping; jokers beat everything;
 *  - a led joker "demands" an opponent's face-up card or the highest card of a suit;
 *  - every card won is worth ½ point; the round winner scores the difference; first to the
 *    target (default 20) wins.
 * Source and assumptions: docs/games/GAME_RULES.md §Japanese Joker.
 */
import { z } from "zod";
import { DECK_36_JOKERS, isJoker, rankValue, suitOf, SUITS, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";

export const japaneseJokerConfigSchema = z.strictObject({
  targetPoints: z.number().int().min(5).max(50).default(20),
  /** After a face-up table card is played the card beneath goes to the hand (source) or flips face up. */
  revealMode: z.enum(["toHand", "flip"]).default("toHand"),
  /** When only one complete pile is left on a player's table, both cards go to the hand. */
  lastPileToHand: z.boolean().default(true),
});
export type JapaneseJokerConfig = z.infer<typeof japaneseJokerConfigSchema>;

const suitSchema = z.enum(SUITS);
const cardSchema = z.enum(DECK_36_JOKERS as [string, ...string[]]);
const demandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("card"), card: cardSchema }),
  z.strictObject({ kind: z.literal("highest"), suit: suitSchema }),
]);
export const japaneseJokerActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("trump"), suit: z.union([suitSchema, z.literal("none")]) }),
  z.strictObject({ type: z.literal("play"), card: cardSchema, demand: demandSchema.optional() }),
]);
export type JapaneseJokerAction = z.infer<typeof japaneseJokerActionSchema>;
type Demand = z.infer<typeof demandSchema>;

export interface Pile {
  up: Card | null;
  down: Card | null;
}

interface Play {
  seat: number;
  card: Card;
  from: "hand" | "table";
  demand?: Demand;
}

export interface JapaneseJokerState {
  config: JapaneseJokerConfig;
  dealer: number;
  round: number;
  phase: "trump" | "play" | "over";
  hands: Card[][];
  table: Pile[][];
  /** Cards dealt after the trump choice. */
  pending: { hands: Card[][]; table: Pile[][] } | null;
  trump: Suit | null;
  trumpChosen: boolean;
  leader: number;
  toAct: number;
  trick: Play[];
  lastTrick: { plays: Play[]; winner: number } | null;
  won: number[];
  scores: number[];
  lastRound: { round: number; won: number[]; points: number[] } | null;
}

export interface JapaneseJokerView {
  phase: JapaneseJokerState["phase"];
  round: number;
  dealer: number;
  trump: Suit | null;
  trumpChosen: boolean;
  toAct: number | null;
  leader: number;
  trick: Play[];
  lastTrick: JapaneseJokerState["lastTrick"];
  won: number[];
  scores: number[];
  targetPoints: number;
  table: Array<Array<{ up: Card | null; hasDown: boolean }>>;
  handCounts: number[];
  you: { seat: number; hand: Card[]; playable: Card[] } | null;
  lastRound: JapaneseJokerState["lastRound"];
}

const other = (s: number) => 1 - s;

function deal(state: JapaneseJokerState, ctx: EngineContext, events: PublicEvent[]): void {
  const deck = shuffle(DECK_36_JOKERS, ctx.rng);
  const first = other(state.dealer);
  const order = [first, state.dealer];
  state.hands = [[], []];
  state.table = [[], []];
  for (let r = 0; r < 3; r++) for (const s of order) state.hands[s]!.push(deck.pop()!);
  const table: Pile[][] = [
    Array.from({ length: 5 }, () => ({ up: null, down: null })),
    Array.from({ length: 5 }, () => ({ up: null, down: null })),
  ];
  for (let i = 0; i < 5; i++) for (const s of order) table[s]![i]!.down = deck.pop()!;
  for (let i = 0; i < 5; i++) for (const s of order) table[s]![i]!.up = deck.pop()!;
  const hands: Card[][] = [[], []];
  for (let r = 0; r < 5; r++) for (const s of order) hands[s]!.push(deck.pop()!);
  state.pending = { hands, table };
  state.trump = null;
  state.trumpChosen = false;
  state.phase = "trump";
  state.toAct = first;
  state.leader = first;
  state.trick = [];
  state.lastTrick = null;
  state.won = [0, 0];
  events.push({ type: "deal", round: state.round, dealer: state.dealer });
}

function playable(state: Pick<JapaneseJokerState, "hands" | "table" | "trick" | "trump">, seat: number): Card[] {
  const pool = [...state.hands[seat]!, ...state.table[seat]!.map((p) => p.up).filter((c): c is Card => c !== null)];
  const lead = state.trick[0];
  if (!lead) return pool;
  const jokers = pool.filter(isJoker);
  const normal = pool.filter((c) => !isJoker(c));
  if (isJoker(lead.card) && lead.demand) {
    if (lead.demand.kind === "card") {
      return normal.includes(lead.demand.card) ? [lead.demand.card, ...jokers] : pool;
    }
    const suit = lead.demand.suit;
    const ofSuit = normal.filter((c) => suitOf(c) === suit);
    if (!ofSuit.length) return pool;
    const highest = ofSuit.reduce((a, b) => (rankValue(b) > rankValue(a) ? b : a));
    return [highest, ...jokers];
  }
  const suit = suitOf(lead.card);
  const ofSuit = normal.filter((c) => suitOf(c) === suit);
  if (ofSuit.length) return [...ofSuit, ...jokers];
  const trumps = state.trump ? normal.filter((c) => suitOf(c) === state.trump) : [];
  if (trumps.length) return [...trumps, ...jokers];
  return pool;
}

export function japaneseTrickWinner(trick: Play[], trump: Suit | null): number {
  const [lead, follow] = trick as [Play, Play];
  if (isJoker(follow.card)) return follow.seat; // a following joker beats everything, incl. the first joker
  if (isJoker(lead.card)) return lead.seat;
  const ls = suitOf(lead.card);
  const fs = suitOf(follow.card);
  if (fs === ls) return rankValue(follow.card) > rankValue(lead.card) ? follow.seat : lead.seat;
  if (trump && fs === trump) return follow.seat;
  return lead.seat;
}

function removeCard(state: JapaneseJokerState, seat: number, card: Card): "hand" | "table" | null {
  const hand = state.hands[seat]!;
  const hi = hand.indexOf(card);
  if (hi >= 0) {
    hand.splice(hi, 1);
    return "hand";
  }
  const pile = state.table[seat]!.find((p) => p.up === card);
  if (!pile) return null;
  pile.up = null;
  if (pile.down) {
    if (state.config.revealMode === "flip") pile.up = pile.down;
    else hand.push(pile.down);
    pile.down = null;
  }
  if (state.config.lastPileToHand) {
    const remaining = state.table[seat]!.filter((p) => p.up || p.down);
    if (remaining.length === 1 && remaining[0]!.up && remaining[0]!.down) {
      hand.push(remaining[0]!.up, remaining[0]!.down);
      remaining[0]!.up = null;
      remaining[0]!.down = null;
    }
  }
  return "table";
}

function cardsLeft(state: JapaneseJokerState): number {
  return state.hands.reduce((s, h) => s + h.length, 0) + state.table.flat().reduce((s, p) => s + (p.up ? 1 : 0) + (p.down ? 1 : 0), 0);
}

function finishRound(state: JapaneseJokerState, ctx: EngineContext, events: PublicEvent[]): void {
  const diff = (state.won[0]! - state.won[1]!) / 2;
  const points = [Math.max(0, diff), Math.max(0, -diff)];
  state.scores[0]! += points[0]!;
  state.scores[1]! += points[1]!;
  state.lastRound = { round: state.round, won: [...state.won], points };
  events.push({ type: "round_end", ...state.lastRound });
  if (state.scores.some((s) => s >= state.config.targetPoints) && state.scores[0] !== state.scores[1]) {
    state.phase = "over";
    return;
  }
  state.round += 1;
  state.dealer = other(state.dealer);
  deal(state, ctx, events);
}

function legal(state: JapaneseJokerState, seat: number): JapaneseJokerAction[] {
  if (state.phase === "over" || state.toAct !== seat) return [];
  if (state.phase === "trump") return [...SUITS.map((suit) => ({ type: "trump" as const, suit })), { type: "trump", suit: "none" }];
  const out: JapaneseJokerAction[] = [];
  const leading = state.trick.length === 0;
  const opponentUp = state.table[other(seat)]!.map((p) => p.up).filter((c): c is Card => c !== null && !isJoker(c));
  for (const card of playable(state, seat)) {
    if (isJoker(card) && leading) {
      for (const c of opponentUp) out.push({ type: "play", card, demand: { kind: "card", card: c } });
      for (const suit of SUITS) out.push({ type: "play", card, demand: { kind: "highest", suit } });
    } else {
      out.push({ type: "play", card });
    }
  }
  return out;
}

export const japaneseJokerEngine: GameEngine<JapaneseJokerState, JapaneseJokerAction, JapaneseJokerConfig, JapaneseJokerView> = {
  type: "japanese_joker",
  configSchema: japaneseJokerConfigSchema as unknown as z.ZodType<JapaneseJokerConfig>,
  actionSchema: japaneseJokerActionSchema,
  seatLimits: () => ({ min: 2, max: 2 }),

  create(config, players, ctx) {
    if (players !== 2) throw new Error("Japanese Joker is a two-player game");
    const state: JapaneseJokerState = {
      config,
      dealer: ctx.rng.int(2),
      round: 1,
      phase: "trump",
      hands: [[], []],
      table: [[], []],
      pending: null,
      trump: null,
      trumpChosen: false,
      leader: 0,
      toAct: 0,
      trick: [],
      lastTrick: null,
      won: [0, 0],
      scores: [0, 0],
      lastRound: null,
    };
    deal(state, ctx, []);
    return state;
  },

  actors: (state) => (state.phase === "over" ? [] : [state.toAct]),
  legalActions: legal,

  apply(state, seat, action, ctx) {
    if (state.phase === "over") return fail("match_over");
    if (state.toAct !== seat) return fail("not_your_turn");
    const next = deepClone(state);
    const events: PublicEvent[] = [];
    if (action.type === "trump") {
      if (next.phase !== "trump") return fail("not_trump_phase");
      next.trump = action.suit === "none" ? null : action.suit;
      next.trumpChosen = true;
      for (const s of [0, 1]) {
        next.hands[s]!.push(...next.pending!.hands[s]!);
        next.table[s] = next.pending!.table[s]!;
      }
      next.pending = null;
      next.phase = "play";
      next.toAct = other(next.dealer);
      next.leader = next.toAct;
      events.push({ type: "trump_chosen", seat, suit: action.suit });
      return { ok: true, state: next, events };
    }
    if (next.phase !== "play") return fail("not_play_phase");
    if (!playable(next, seat).includes(action.card)) {
      const owned = next.hands[seat]!.includes(action.card) || next.table[seat]!.some((p) => p.up === action.card);
      return fail(owned ? "must_follow_rules" : "card_not_available");
    }
    const leading = next.trick.length === 0;
    if (isJoker(action.card) && leading) {
      if (!action.demand) return fail("demand_required");
      if (action.demand.kind === "card") {
        const opponentUp = next.table[other(seat)]!.map((p) => p.up);
        if (!opponentUp.includes(action.demand.card) || isJoker(action.demand.card)) return fail("demand_card_not_visible");
      }
    } else if (action.demand) {
      return fail("demand_not_allowed");
    }
    const from = removeCard(next, seat, action.card)!;
    const play: Play = { seat, card: action.card, from, ...(action.demand ? { demand: deepClone(action.demand) } : {}) };
    next.trick.push(play);
    events.push({ type: "play", ...play });
    if (next.trick.length < 2) {
      next.toAct = other(seat);
      return { ok: true, state: next, events };
    }
    const winner = japaneseTrickWinner(next.trick, next.trump);
    next.won[winner]! += 2;
    next.lastTrick = { plays: next.trick, winner };
    next.trick = [];
    next.leader = winner;
    next.toAct = winner;
    events.push({ type: "trick_won", seat: winner });
    if (cardsLeft(next) === 0) finishRound(next, ctx, events);
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    const tableFor = (s: number) =>
      (state.phase === "trump" ? [] : state.table[s]!).map((p) => ({ up: p.up, hasDown: p.down !== null }));
    return {
      phase: state.phase,
      round: state.round,
      dealer: state.dealer,
      trump: state.trump,
      trumpChosen: state.trumpChosen,
      toAct: state.phase === "over" ? null : state.toAct,
      leader: state.leader,
      trick: deepClone(state.trick),
      lastTrick: state.lastTrick ? deepClone(state.lastTrick) : null,
      won: [...state.won],
      scores: [...state.scores],
      targetPoints: state.config.targetPoints,
      table: [tableFor(0), tableFor(1)],
      handCounts: state.hands.map((h) => h.length),
      you:
        seat === null
          ? null
          : { seat, hand: [...state.hands[seat]!], playable: state.phase === "play" && state.toAct === seat ? playable(state, seat) : [] },
      lastRound: state.lastRound ? deepClone(state.lastRound) : null,
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => ({ placements: placementsFromScores(state.scores), scores: [...state.scores] }),
  timeoutAction: (state, seat, ctx) => japaneseJokerEngine.bot({ view: japaneseJokerEngine.view(state, seat), legal: legal(state, seat), seat, difficulty: "easy", rng: ctx.rng }),

  bot({ view, legal: options, difficulty, rng }) {
    const you = view.you!;
    if (view.phase === "trump") {
      if (difficulty === "easy") return pick(options, rng);
      const best = SUITS.map((s) => ({ s, v: you.hand.filter((c) => !isJoker(c) && suitOf(c) === s).reduce((t, c) => t + rankValue(c), 0) })).sort(
        (a, b) => b.v - a.v,
      )[0]!;
      return best.v >= 18 ? { type: "trump", suit: best.s } : { type: "trump", suit: "none" };
    }
    const plays = options as Array<Extract<JapaneseJokerAction, { type: "play" }>>;
    if (difficulty === "easy") return pick(plays, rng);
    const trump = view.trump;
    const value = (c: Card) => (isJoker(c) ? 30 : rankValue(c) + (trump && suitOf(c) === trump ? 10 : 0));
    if (view.trick.length === 0) {
      // Use a joker to pull the opponent's best visible card (hard), otherwise lead the strongest non-joker.
      const jokerDemands = plays.filter((p) => isJoker(p.card) && p.demand?.kind === "card");
      if (difficulty === "hard" && jokerDemands.length) {
        return jokerDemands.sort((a, b) => value((b.demand as { card: Card }).card) - value((a.demand as { card: Card }).card))[0]!;
      }
      const normals = plays.filter((p) => !isJoker(p.card));
      if (normals.length) {
        const sorted = normals.sort((a, b) => value(a.card) - value(b.card));
        return difficulty === "hard" ? sorted[sorted.length - 1]! : sorted[0]!;
      }
      return plays[0]!;
    }
    const lead = view.trick[0]!;
    const winners = plays.filter((p) => japaneseTrickWinner([lead, { seat: you.seat, card: p.card, from: "hand" }], trump) === you.seat);
    if (winners.length) {
      const cheap = winners.filter((p) => !isJoker(p.card));
      return (cheap.length ? cheap : winners).sort((a, b) => value(a.card) - value(b.card))[0]!;
    }
    return plays.sort((a, b) => value(a.card) - value(b.card))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `round ${state.round}`),
};
