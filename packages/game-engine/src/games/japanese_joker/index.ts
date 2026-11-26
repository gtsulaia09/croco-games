/**
 * Japanese Joker (იაპონური ჯოკერი) — a two-player Georgian game, distinct from Joker:
 *  - 36-card pack, black sixes are jokers;
 *  - 3 cards dealt, one player (alternating) names trump or "bez" (no trump) and leads; then each
 *    player receives 5 face-down table cards covered by 5 face-up cards and 5 more cards to the hand;
 *  - a player's first card of a deal comes from the hand; afterwards hand or open table cards;
 *    when an open table card is played the card beneath is turned face up;
 *  - following suit is compulsory, then trumping; a joker beats everything (a joker played on a
 *    joker wins); with the `jokerLow` option (owner's request, on by default) a following joker may
 *    instead be played low ("გატანება") and gives the trick away;
 *  - a led joker demands the highest card of a named suit; without that (non-trump) suit the
 *    opponent must trump, and the trump beats the joker;
 *  - 18 tricks per deal; the player with more tricks scores the difference (11:7 gives 4, 9:9 is a
 *    draw); first to the chosen target (1 / 3 / 7 / 11 / 21) wins.
 * Source: owner's rules handbook (2026-11-25) and mygame.ge; see docs/games/GAME_RULES.md.
 */
import { z } from "zod";
import { DECK_36_JOKERS, isJoker, rankValue, suitOf, SUITS, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";

export const japaneseJokerConfigSchema = z.strictObject({
  targetPoints: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(11), z.literal(21)]).default(11),
  /** After a face-up table card is played the card beneath is turned face up (rules) or goes to the hand (house variant). */
  revealMode: z.enum(["flip", "toHand"]).default("flip"),
  /** House variant: when only one complete pile is left on a player's table, both cards go to the hand. */
  lastPileToHand: z.boolean().default(false),
  /** A following joker may be played "high" (takes the trick, "მოჯოკვრა") or "low" (gives it away). */
  jokerLow: z.boolean().default(true),
});
export type JapaneseJokerConfig = z.infer<typeof japaneseJokerConfigSchema>;

const suitSchema = z.enum(SUITS);
const cardSchema = z.enum(DECK_36_JOKERS as [string, ...string[]]);
/** A led joker asks for the highest card of a named suit. */
const demandSchema = z.strictObject({ kind: z.literal("highest"), suit: suitSchema });
export const japaneseJokerActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("trump"), suit: z.union([suitSchema, z.literal("none")]) }),
  z.strictObject({
    type: z.literal("play"),
    card: cardSchema,
    demand: demandSchema.optional(),
    /** Following joker only: "high" takes the trick (default), "low" gives it away. */
    joker: z.strictObject({ mode: z.enum(["high", "low"]) }).optional(),
  }),
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
  joker?: { mode: "high" | "low" };
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
  /** Tricks taken this deal. */
  won: number[];
  scores: number[];
  /** Whether each player has played a card this deal (the first card must come from the hand). */
  playedThisDeal: [boolean, boolean];
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
  /** A following joker may be played low. */
  jokerLow: boolean;
  table: Array<Array<{ up: Card | null; hasDown: boolean }>>;
  handCounts: number[];
  you: { seat: number; hand: Card[]; playable: Card[]; firstFromHand: boolean } | null;
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
  // lastTrick is kept from the previous deal (presentation only): tables show the final
  // trick being collected before the new cards arrive. It never affects play or scoring.
  state.won = [0, 0];
  state.playedThisDeal = [false, false];
  events.push({ type: "deal", round: state.round, dealer: state.dealer });
}

function playable(state: Pick<JapaneseJokerState, "hands" | "table" | "trick" | "trump" | "playedThisDeal">, seat: number): Card[] {
  const tableUp = state.playedThisDeal[seat] ? state.table[seat]!.map((p) => p.up).filter((c): c is Card => c !== null) : [];
  const pool = [...state.hands[seat]!, ...tableUp];
  const lead = state.trick[0];
  if (!lead) return pool;
  const jokers = pool.filter(isJoker);
  const normal = pool.filter((c) => !isJoker(c));
  const trumps = state.trump ? normal.filter((c) => suitOf(c) === state.trump) : [];
  if (isJoker(lead.card) && lead.demand) {
    const suit = lead.demand.suit;
    const ofSuit = normal.filter((c) => suitOf(c) === suit);
    if (ofSuit.length) {
      const highest = ofSuit.reduce((a, b) => (rankValue(b) > rankValue(a) ? b : a));
      return [highest, ...jokers];
    }
    // Without the demanded (non-trump) suit the opponent must trump; the trump then beats the joker.
    if (suit !== state.trump && trumps.length) return [...trumps, ...jokers];
    return pool;
  }
  const suit = suitOf(lead.card);
  const ofSuit = normal.filter((c) => suitOf(c) === suit);
  if (ofSuit.length) return [...ofSuit, ...jokers];
  if (trumps.length) return [...trumps, ...jokers];
  return pool;
}

export function japaneseTrickWinner(trick: Play[], trump: Suit | null): number {
  const [lead, follow] = trick as [Play, Play];
  if (isJoker(follow.card)) return follow.joker?.mode === "low" ? lead.seat : follow.seat; // a joker played on a joker wins, unless played low
  if (isJoker(lead.card)) {
    const demanded = lead.demand?.suit ?? null;
    if (trump && demanded !== trump && suitOf(follow.card) === trump) return follow.seat;
    return lead.seat;
  }
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
  const diff = state.won[0]! - state.won[1]!;
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
  for (const card of playable(state, seat)) {
    if (isJoker(card) && leading) {
      for (const suit of SUITS) out.push({ type: "play", card, demand: { kind: "highest", suit } });
    } else if (isJoker(card) && state.config.jokerLow) {
      out.push({ type: "play", card, joker: { mode: "high" } }, { type: "play", card, joker: { mode: "low" } });
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
      playedThisDeal: [false, false],
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
      const inHand = next.hands[seat]!.includes(action.card);
      const onTable = next.table[seat]!.some((p) => p.up === action.card);
      if (onTable && !inHand && !next.playedThisDeal[seat]) return fail("first_card_from_hand");
      return fail(inHand || onTable ? "must_follow_rules" : "card_not_available");
    }
    const leading = next.trick.length === 0;
    if (isJoker(action.card) && leading) {
      if (!action.demand) return fail("demand_required");
      if (action.joker) return fail("joker_mode_not_allowed");
    } else if (action.demand) {
      return fail("demand_not_allowed");
    }
    if (action.joker && (!isJoker(action.card) || leading)) return fail("joker_mode_not_allowed");
    if (action.joker?.mode === "low" && !next.config.jokerLow) return fail("joker_low_disabled");
    const from = removeCard(next, seat, action.card)!;
    next.playedThisDeal[seat] = true;
    const play: Play = {
      seat,
      card: action.card,
      from,
      ...(action.demand ? { demand: deepClone(action.demand) } : {}),
      ...(isJoker(action.card) && !leading ? { joker: { mode: action.joker?.mode ?? "high" } } : {}),
    };
    next.trick.push(play);
    events.push({ type: "play", ...play });
    if (next.trick.length < 2) {
      next.toAct = other(seat);
      return { ok: true, state: next, events };
    }
    const winner = japaneseTrickWinner(next.trick, next.trump);
    next.won[winner]! += 1;
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
      jokerLow: state.config.jokerLow,
      table: [tableFor(0), tableFor(1)],
      handCounts: state.hands.map((h) => h.length),
      you:
        seat === null
          ? null
          : {
              seat,
              hand: [...state.hands[seat]!],
              playable: state.phase === "play" && state.toAct === seat ? playable(state, seat) : [],
              firstFromHand: state.phase === "play" && !state.playedThisDeal[seat],
            },
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
      // Hard bots use a joker to pull the suit of the opponent's best visible card.
      const oppUp = (view.table[1 - you.seat] ?? []).map((p) => p.up).filter((c): c is Card => c !== null && !isJoker(c));
      const target = oppUp.sort((a, b) => value(b) - value(a))[0];
      const jokerDemand = target ? plays.find((p) => isJoker(p.card) && p.demand?.suit === suitOf(target)) : undefined;
      if (difficulty === "hard" && jokerDemand && target && rankValue(target) >= 13) return jokerDemand;
      const normals = plays.filter((p) => !isJoker(p.card));
      if (normals.length) {
        const sorted = normals.sort((a, b) => value(a.card) - value(b.card));
        return difficulty === "hard" ? sorted[sorted.length - 1]! : sorted[0]!;
      }
      return plays[0]!;
    }
    const lead = view.trick[0]!;
    const asPlay = (p: (typeof plays)[number]): Play => ({ seat: you.seat, card: p.card, from: "hand", ...(p.joker ? { joker: p.joker } : {}) });
    const winners = plays.filter((p) => japaneseTrickWinner([lead, asPlay(p)], trump) === you.seat);
    if (winners.length) {
      const cheap = winners.filter((p) => !isJoker(p.card));
      return (cheap.length ? cheap : winners).sort((a, b) => value(a.card) - value(b.card))[0]!;
    }
    // Losing anyway: throw the cheapest card; never waste a joker played high.
    const losers = plays.filter((p) => !isJoker(p.card) || p.joker?.mode === "low");
    return (losers.length ? losers : plays).sort((a, b) => value(a.card) - value(b.card))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `round ${state.round}`),
};
