import { z } from "zod";
import type { GameType } from "@croco/shared";
import { DECK_36, DECK_52, type Card } from "../../core/cards";
import {
  deepClone,
  fail,
  type ApplyResult,
  type EngineContext,
  type GameEngine,
  type MatchOutcome,
  type PublicEvent,
} from "../../core/engine";
import { shuffle } from "../../core/rng";
import {
  bestHoldemHand,
  bestOmahaHand,
  bestOmahaLow,
  type HandCategory,
  type RankingRules,
} from "./evaluator";
import { pokerBot } from "./bot";

export type PokerVariant = "holdem" | "shortdeck" | "omaha" | "omaha_hilo";
export type BettingStructure = "no_limit" | "pot_limit" | "fixed_limit";
export type Street = "preflop" | "flop" | "turn" | "river";

export const pokerConfigSchema = z.strictObject({
  startingChips: z.number().int().min(100).max(100_000).default(1000),
  smallBlind: z.number().int().min(0).max(10_000).default(5),
  bigBlind: z.number().int().min(1).max(20_000).default(10),
  ante: z.number().int().min(0).max(10_000).default(0),
  bettingStructure: z.enum(["no_limit", "pot_limit", "fixed_limit"]).optional(),
  maxHands: z.number().int().min(5).max(500).default(100),
  /** 0 = blinds never increase; otherwise blinds and ante double every N hands. */
  blindLevelHands: z.number().int().min(0).max(100).default(0),
  /** Short Deck only. */
  tripsBeatStraight: z.boolean().default(true),
});
export type PokerConfig = z.infer<typeof pokerConfigSchema>;

export const pokerActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("fold") }),
  z.strictObject({ type: z.literal("check") }),
  z.strictObject({ type: z.literal("call") }),
  z.strictObject({ type: z.literal("raise"), to: z.number().int().min(1).max(100_000_000) }),
  z.strictObject({ type: z.literal("allin") }),
]);
export type PokerAction = z.infer<typeof pokerActionSchema>;

export interface PokerPlayer {
  chips: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  busted: boolean;
  /** Chips committed on the current street. */
  street: number;
  /** Chips committed in the whole hand (antes + all streets). */
  total: number;
  /** Needs no further action until someone bets/raises (reset by any raise). */
  acted: boolean;
  /** Has voluntarily acted at least once on this street (NOT reset by raises). */
  hasActed: boolean;
  /** Current bet level when this player last acted (for re-raise rights after short all-ins). */
  lastActedBet: number;
  bustedAtHand: number | null;
}

export interface HandSummary {
  handNumber: number;
  board: Card[];
  awards: Array<{ seat: number; amount: number; pot: number; side: "high" | "low" | "all"; category?: HandCategory }>;
  revealed: Record<number, Card[]>;
  refunded: Array<{ seat: number; amount: number }>;
}

export interface PokerState {
  variant: PokerVariant;
  config: PokerConfig & { bettingStructure: BettingStructure };
  players: PokerPlayer[];
  dealer: number;
  handNumber: number;
  deck: Card[];
  board: Card[];
  phase: Street | "over";
  toAct: number | null;
  currentBet: number;
  /** Size of the last full bet/raise on this street (minimum raise increment). */
  minRaise: number;
  raisesThisStreet: number;
  blinds: { small: number; big: number; ante: number };
  lastHand: HandSummary | null;
  bustOrder: number[];
}

export interface PokerView {
  variant: PokerVariant;
  handNumber: number;
  maxHands: number;
  phase: PokerState["phase"];
  board: Card[];
  dealer: number;
  toAct: number | null;
  currentBet: number;
  pot: number;
  blinds: PokerState["blinds"];
  structure: BettingStructure;
  players: Array<{
    seat: number;
    chips: number;
    street: number;
    total: number;
    folded: boolean;
    allIn: boolean;
    busted: boolean;
    holeCount: number;
    hole: Card[] | null;
  }>;
  you: { seat: number; hole: Card[]; toCall: number; raise: { min: number; max: number } | null; canCheck: boolean } | null;
  lastHand: HandSummary | null;
}

const HOLE_CARDS: Record<PokerVariant, number> = { holdem: 2, shortdeck: 2, omaha: 4, omaha_hilo: 4 };
const DEFAULT_STRUCTURE: Record<PokerVariant, BettingStructure> = {
  holdem: "no_limit",
  shortdeck: "no_limit",
  omaha: "pot_limit",
  omaha_hilo: "pot_limit",
};
const FIXED_LIMIT_CAP = 4;

function rules(state: PokerState): RankingRules {
  return { shortDeck: state.variant === "shortdeck", tripsBeatStraight: state.config.tripsBeatStraight };
}

function activeSeats(state: PokerState): number[] {
  return state.players.map((_, i) => i).filter((i) => !state.players[i]!.busted);
}

function nextActive(state: PokerState, from: number, pred: (p: PokerPlayer, i: number) => boolean): number | null {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(state.players[i]!, i)) return i;
  }
  return null;
}

const inHand = (p: PokerPlayer) => !p.busted && !p.folded;
const canAct = (p: PokerPlayer) => !p.busted && !p.folded && !p.allIn;

function potTotal(state: PokerState): number {
  return state.players.reduce((s, p) => s + p.total, 0);
}

function commit(p: PokerPlayer, amount: number): number {
  const a = Math.min(amount, p.chips);
  p.chips -= a;
  p.street += a;
  p.total += a;
  if (p.chips === 0) p.allIn = true;
  return a;
}

function fixedBetSize(state: PokerState): number {
  return state.phase === "turn" || state.phase === "river" ? state.blinds.big * 2 : state.blinds.big;
}

/** Range of legal "raise to" amounts for a seat, or null if raising is not allowed. */
export function raiseRange(state: PokerState, seat: number): { min: number; max: number } | null {
  const p = state.players[seat]!;
  if (!canAct(p) || state.toAct !== seat) return null;
  const allInTo = p.street + p.chips;
  if (allInTo <= state.currentBet) return null; // can only call (possibly all-in)
  // Re-raise rights: a player who already acted may raise again only if facing a full raise.
  if (p.hasActed && state.currentBet - p.lastActedBet < state.minRaise) return null;
  // Someone must remain who could respond; if everyone else is all-in, no raise.
  const others = state.players.filter((o, i) => i !== seat && canAct(o));
  if (others.length === 0 && state.currentBet <= p.street) return null;
  if (others.length === 0) return null;

  const structure = state.config.bettingStructure;
  if (structure === "fixed_limit") {
    if (state.raisesThisStreet >= FIXED_LIMIT_CAP) return null;
    const to = state.currentBet + fixedBetSize(state);
    const target = Math.min(to, allInTo);
    return { min: target, max: target };
  }
  const minTo = Math.min(state.currentBet + Math.max(state.minRaise, state.blinds.big), allInTo);
  let maxTo = allInTo;
  if (structure === "pot_limit") {
    const toCall = state.currentBet - p.street;
    const potAfterCall = potTotal(state) + toCall;
    maxTo = Math.min(allInTo, state.currentBet + potAfterCall);
  }
  return { min: Math.min(minTo, maxTo), max: maxTo };
}

function startHand(state: PokerState, ctx: EngineContext, events: PublicEvent[]): void {
  const active = activeSeats(state);
  state.handNumber += 1;
  // Blind levels.
  if (state.config.blindLevelHands > 0) {
    const level = Math.floor((state.handNumber - 1) / state.config.blindLevelHands);
    const mult = 2 ** level;
    state.blinds = {
      small: state.config.smallBlind * mult,
      big: state.config.bigBlind * mult,
      ante: state.config.ante * mult,
    };
  }
  for (const p of state.players) {
    p.hole = [];
    p.folded = p.busted;
    p.allIn = false;
    p.street = 0;
    p.total = 0;
    p.acted = false;
    p.hasActed = false;
    p.lastActedBet = 0;
  }
  state.board = [];
  state.deck = shuffle(state.variant === "shortdeck" ? DECK_36 : DECK_52, ctx.rng);
  if (state.handNumber > 1) {
    state.dealer = nextActive(state, state.dealer, (p) => !p.busted) ?? state.dealer;
  } else if (state.players[state.dealer]!.busted) {
    state.dealer = nextActive(state, state.dealer, (p) => !p.busted) ?? state.dealer;
  }

  // Antes (dead money, not part of the street bet).
  if (state.blinds.ante > 0) {
    for (const i of active) {
      const p = state.players[i]!;
      const a = Math.min(state.blinds.ante, p.chips);
      p.chips -= a;
      p.total += a;
      if (p.chips === 0) p.allIn = true;
    }
  }

  const headsUp = active.length === 2;
  const sb = headsUp ? state.dealer : nextActive(state, state.dealer, (p) => !p.busted)!;
  const bb = nextActive(state, sb, (p) => !p.busted)!;
  state.phase = "preflop";
  state.currentBet = 0;
  state.raisesThisStreet = 0;
  const sbPaid = commit(state.players[sb]!, state.blinds.small);
  const bbPaid = commit(state.players[bb]!, state.blinds.big);
  state.currentBet = Math.max(sbPaid, bbPaid, state.blinds.big);
  state.minRaise = state.blinds.big;
  if (state.config.bettingStructure === "fixed_limit") state.raisesThisStreet = 1;

  const holeCount = HOLE_CARDS[state.variant];
  for (let r = 0; r < holeCount; r++) {
    for (let k = 1; k <= state.players.length; k++) {
      const i = (state.dealer + k) % state.players.length;
      if (!state.players[i]!.busted) state.players[i]!.hole.push(state.deck.pop()!);
    }
  }
  events.push({ type: "hand_start", handNumber: state.handNumber, dealer: state.dealer, sb, bb });
  state.toAct = nextActive(state, bb, canAct);
  if (state.toAct === null || bettingDone(state)) advance(state, events);
}

function bettingDone(state: PokerState): boolean {
  const live = state.players.filter(inHand);
  if (live.length <= 1) return true;
  const actors = state.players.filter(canAct);
  if (actors.length === 0) return true;
  if (actors.length === 1) {
    const p = actors[0]!;
    // Last player with chips only needs to act if facing a bet.
    if (p.street >= state.currentBet) return true;
    return p.acted && p.street >= state.currentBet;
  }
  return actors.every((p) => p.acted && p.street === state.currentBet);
}

function dealStreet(state: PokerState, street: Street, events: PublicEvent[]): void {
  state.deck.pop(); // burn
  const count = street === "flop" ? 3 : 1;
  for (let i = 0; i < count; i++) state.board.push(state.deck.pop()!);
  state.phase = street;
  events.push({ type: "street", street, board: [...state.board] });
}

function advance(state: PokerState, events: PublicEvent[]): void {
  for (;;) {
    const live = state.players.filter(inHand);
    if (live.length <= 1) {
      finishHand(state, events);
      return;
    }
    // Reset street.
    for (const p of state.players) {
      p.street = 0;
      p.acted = false;
      p.hasActed = false;
      p.lastActedBet = 0;
    }
    state.currentBet = 0;
    state.minRaise = state.blinds.big;
    state.raisesThisStreet = 0;
    const next: Record<Street, Street | null> = { preflop: "flop", flop: "turn", turn: "river", river: null };
    const street = next[state.phase as Street];
    if (!street) {
      finishHand(state, events);
      return;
    }
    dealStreet(state, street, events);
    const actors = state.players.filter(canAct);
    if (actors.length >= 2) {
      state.toAct = nextActive(state, state.dealer, canAct);
      return;
    }
    // Everyone (or all but one) is all-in: run out the board.
  }
}

function refundUncalled(state: PokerState): Array<{ seat: number; amount: number }> {
  const totals = state.players.map((p) => p.total);
  const maxTotal = Math.max(...totals);
  const holders = totals.filter((t) => t === maxTotal).length;
  if (holders !== 1) return [];
  const seat = totals.indexOf(maxTotal);
  const second = Math.max(0, ...totals.filter((_, i) => i !== seat));
  const excess = maxTotal - second;
  if (excess <= 0) return [];
  const p = state.players[seat]!;
  p.total -= excess;
  p.chips += excess;
  if (p.chips > 0) p.allIn = false;
  return [{ seat, amount: excess }];
}

interface Pot {
  amount: number;
  eligible: number[];
}

export function buildPots(totals: readonly number[], live: readonly boolean[]): Pot[] {
  const levels = [...new Set(totals.filter((t, i) => live[i] && t > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const t of totals) amount += Math.max(0, Math.min(t, level) - prev);
    const eligible = totals.map((t, i) => (live[i] && t >= level ? i : -1)).filter((i) => i >= 0);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Dead money above the highest live level (only possible from folded players) goes to the last pot.
  const leftover = totals.reduce((s, t) => s + Math.max(0, t - prev), 0);
  if (leftover > 0 && pots.length > 0) pots[pots.length - 1]!.amount += leftover;
  return pots;
}

/** Order seats starting left of the dealer (odd chips go to the first winner in this order). */
function seatOrder(state: PokerState, seats: number[]): number[] {
  const n = state.players.length;
  return seats.slice().sort((a, b) => ((a - state.dealer - 1 + n) % n) - ((b - state.dealer - 1 + n) % n));
}

function splitAmount(state: PokerState, amount: number, winners: number[]): Array<[number, number]> {
  const ordered = seatOrder(state, winners);
  const share = Math.floor(amount / ordered.length);
  let odd = amount - share * ordered.length;
  return ordered.map((s) => {
    const extra = odd > 0 ? 1 : 0;
    odd -= extra;
    return [s, share + extra];
  });
}

function finishHand(state: PokerState, events: PublicEvent[]): void {
  const refunded = refundUncalled(state);
  const live = state.players.map(inHand);
  const liveSeats = live.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  const summary: HandSummary = { handNumber: state.handNumber, board: [...state.board], awards: [], revealed: {}, refunded };
  const totals = state.players.map((p) => p.total);
  const pots = buildPots(totals, live);

  if (liveSeats.length === 1) {
    const winner = liveSeats[0]!;
    const amount = pots.reduce((s, p) => s + p.amount, 0);
    state.players[winner]!.chips += amount;
    summary.awards.push({ seat: winner, amount, pot: 0, side: "all" });
  } else {
    const hiLo = state.variant === "omaha_hilo";
    const omaha = state.variant === "omaha" || hiLo;
    const high = new Map<number, ReturnType<typeof bestHoldemHand>>();
    const low = new Map<number, ReturnType<typeof bestOmahaLow>>();
    for (const s of liveSeats) {
      const hole = state.players[s]!.hole;
      summary.revealed[s] = [...hole];
      high.set(s, omaha ? bestOmahaHand(hole, state.board) : bestHoldemHand(hole, state.board, rules(state)));
      if (hiLo) low.set(s, bestOmahaLow(hole, state.board));
    }
    pots.forEach((pot, potIndex) => {
      const bestHigh = Math.max(...pot.eligible.map((s) => high.get(s)!.value));
      const highWinners = pot.eligible.filter((s) => high.get(s)!.value === bestHigh);
      const lows = pot.eligible.map((s) => [s, low.get(s)] as const).filter(([, v]) => v);
      if (hiLo && lows.length > 0) {
        const bestLow = Math.min(...lows.map(([, v]) => v!.value));
        const lowWinners = lows.filter(([, v]) => v!.value === bestLow).map(([s]) => s);
        const highHalf = Math.ceil(pot.amount / 2); // odd chip goes to the high half
        const lowHalf = pot.amount - highHalf;
        for (const [s, a] of splitAmount(state, highHalf, highWinners)) {
          state.players[s]!.chips += a;
          summary.awards.push({ seat: s, amount: a, pot: potIndex, side: "high", category: high.get(s)!.category });
        }
        for (const [s, a] of splitAmount(state, lowHalf, lowWinners)) {
          state.players[s]!.chips += a;
          summary.awards.push({ seat: s, amount: a, pot: potIndex, side: "low" });
        }
      } else {
        for (const [s, a] of splitAmount(state, pot.amount, highWinners)) {
          state.players[s]!.chips += a;
          summary.awards.push({ seat: s, amount: a, pot: potIndex, side: hiLo ? "high" : "all", category: high.get(s)!.category });
        }
      }
    });
  }

  // Busts.
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i]!;
    if (!p.busted && p.chips === 0) {
      p.busted = true;
      p.bustedAtHand = state.handNumber;
      state.bustOrder.push(i);
    }
    p.total = 0;
    p.street = 0;
  }
  state.lastHand = summary;
  events.push({ type: "hand_end", summary });
  state.toAct = null;
  if (activeSeats(state).length <= 1 || state.handNumber >= state.config.maxHands) {
    state.phase = "over";
  }
}

function applyAction(state: PokerState, seat: number, action: PokerAction): string | null {
  const p = state.players[seat]!;
  const toCall = state.currentBet - p.street;
  switch (action.type) {
    case "fold":
      p.folded = true;
      break;
    case "check":
      if (toCall > 0) return "cannot_check";
      break;
    case "call":
      if (toCall <= 0) return "nothing_to_call";
      commit(p, toCall);
      break;
    case "allin":
    case "raise": {
      const allInTo = p.street + p.chips;
      const to = action.type === "allin" ? allInTo : action.to;
      if (to <= state.currentBet) {
        // All-in for less than (or equal to) the current bet is a call.
        if (action.type === "allin" && toCall > 0) {
          commit(p, toCall);
          break;
        }
        return "raise_too_small";
      }
      const range = raiseRange(state, seat);
      if (!range) return "raise_not_allowed";
      if (to > range.max) return "raise_too_large";
      if (to < range.min && to !== allInTo) return "raise_too_small";
      const raiseSize = to - state.currentBet;
      commit(p, to - p.street);
      const full = raiseSize >= state.minRaise;
      if (full) state.minRaise = raiseSize;
      state.currentBet = to;
      state.raisesThisStreet += 1;
      for (const [i, o] of state.players.entries()) if (i !== seat && canAct(o)) o.acted = false;
      break;
    }
  }
  p.acted = true;
  p.hasActed = true;
  p.lastActedBet = state.currentBet;
  return null;
}

function makeEngine(type: GameType & PokerVariant): GameEngine<PokerState, PokerAction, PokerConfig, PokerView> {
  return {
    type,
    configSchema: pokerConfigSchema as unknown as z.ZodType<PokerConfig>,
    actionSchema: pokerActionSchema,
    seatLimits: () => (type === "shortdeck" ? { min: 2, max: 6 } : { min: 2, max: 9 }),

    create(config, players, ctx) {
      if (config.smallBlind > config.bigBlind) throw new Error("small blind must not exceed big blind");
      const state: PokerState = {
        variant: type,
        config: { ...config, bettingStructure: config.bettingStructure ?? DEFAULT_STRUCTURE[type] },
        players: Array.from({ length: players }, () => ({
          chips: config.startingChips,
          hole: [],
          folded: false,
          allIn: false,
          busted: false,
          street: 0,
          total: 0,
          acted: false,
          hasActed: false,
          lastActedBet: 0,
          bustedAtHand: null,
        })),
        dealer: ctx.rng.int(players),
        handNumber: 0,
        deck: [],
        board: [],
        phase: "preflop",
        toAct: null,
        currentBet: 0,
        minRaise: config.bigBlind,
        raisesThisStreet: 0,
        blinds: { small: config.smallBlind, big: config.bigBlind, ante: config.ante },
        lastHand: null,
        bustOrder: [],
      };
      startHand(state, ctx, []);
      while (state.toAct === null && state.phase !== "over") startHand(state, ctx, []);
      return state;
    },

    actors: (state) => (state.phase !== "over" && state.toAct !== null ? [state.toAct] : []),

    legalActions(state, seat) {
      if (state.toAct !== seat || state.phase === "over") return [];
      const p = state.players[seat]!;
      const toCall = state.currentBet - p.street;
      const out: PokerAction[] = [{ type: "fold" }];
      if (toCall <= 0) out.push({ type: "check" });
      else out.push({ type: "call" });
      const range = raiseRange(state, seat);
      if (range) {
        out.push({ type: "raise", to: range.min });
        if (range.max !== range.min) out.push({ type: "raise", to: range.max });
      }
      if (state.config.bettingStructure === "no_limit" && p.chips > 0) out.push({ type: "allin" });
      return out;
    },

    apply(state, seat, action, ctx): ApplyResult<PokerState> {
      if (state.phase === "over") return fail("match_over");
      if (state.toAct !== seat) return fail("not_your_turn");
      if (action.type === "allin" && state.config.bettingStructure !== "no_limit") {
        // Limit structures: use "call" or "raise" up to the allowed maximum instead.
        return fail("allin_not_allowed");
      }
      const next = deepClone(state);
      const err = applyAction(next, seat, action);
      if (err) return fail(err);
      const events: PublicEvent[] = [{ type: "action", seat, action: action.type, ...(action.type === "raise" ? { to: action.to } : {}) }];
      if (bettingDone(next)) {
        advance(next, events);
      } else {
        next.toAct = nextActive(next, seat, canAct);
      }
      // Start the next hand automatically; the previous hand stays visible in `lastHand`.
      while (next.toAct === null && next.phase !== "over") {
        startHand(next, ctx, events);
      }
      return { ok: true, state: next, events };
    },

    view(state, seat) {
      const showdown = state.lastHand?.revealed ?? {};
      return {
        variant: state.variant,
        handNumber: state.handNumber,
        maxHands: state.config.maxHands,
        phase: state.phase,
        board: [...state.board],
        dealer: state.dealer,
        toAct: state.toAct,
        currentBet: state.currentBet,
        pot: potTotal(state),
        blinds: { ...state.blinds },
        structure: state.config.bettingStructure,
        players: state.players.map((p, i) => ({
          seat: i,
          chips: p.chips,
          street: p.street,
          total: p.total,
          folded: p.folded,
          allIn: p.allIn,
          busted: p.busted,
          holeCount: p.hole.length,
          hole: i === seat ? [...p.hole] : null,
        })),
        you:
          seat === null
            ? null
            : {
                seat,
                hole: [...state.players[seat]!.hole],
                toCall: Math.max(0, Math.min(state.currentBet - state.players[seat]!.street, state.players[seat]!.chips)),
                raise: raiseRange(state, seat),
                canCheck: state.currentBet - state.players[seat]!.street <= 0,
              },
        // Only cards that were actually shown down are public.
        lastHand: state.lastHand ? { ...state.lastHand, revealed: { ...showdown } } : null,
      };
    },

    isOver: (state) => state.phase === "over",

    outcome(state): MatchOutcome {
      const n = state.players.length;
      const placements = new Array<number>(n).fill(0);
      const alive = state.players
        .map((p, i) => ({ i, chips: p.chips }))
        .filter((x) => !state.players[x.i]!.busted)
        .sort((a, b) => b.chips - a.chips);
      let place = 1;
      for (let k = 0; k < alive.length; k++) {
        const prev = alive[k - 1];
        if (prev && prev.chips === alive[k]!.chips) placements[alive[k]!.i] = placements[prev.i]!;
        else placements[alive[k]!.i] = place;
        place++;
      }
      // Busted players: later bust = better; same hand = tie.
      const busted = state.players.map((p, i) => ({ i, hand: p.bustedAtHand ?? 0 })).filter((x) => state.players[x.i]!.busted);
      busted.sort((a, b) => b.hand - a.hand);
      for (let k = 0; k < busted.length; k++) {
        const prev = busted[k - 1];
        if (prev && prev.hand === busted[k]!.hand) placements[busted[k]!.i] = placements[prev.i]!;
        else placements[busted[k]!.i] = place;
        place++;
      }
      return { placements, scores: state.players.map((p) => p.chips) };
    },

    timeoutAction(state, seat) {
      const p = state.players[seat]!;
      return state.currentBet - p.street <= 0 ? { type: "check" } : { type: "fold" };
    },

    bot: (input) => pokerBot(input),

    stage: (state) => (state.phase === "over" ? "finished" : `hand ${state.handNumber} · ${state.phase}`),
  };
}

export const holdemEngine = makeEngine("holdem");
export const shortDeckEngine = makeEngine("shortdeck");
export const omahaEngine = makeEngine("omaha");
export const omahaHiLoEngine = makeEngine("omaha_hilo");
