/**
 * Bura — five-card team game (owner's rules handbook, 2026-11-25; parabura.ge):
 *  - four players in two teams; partners sit opposite (seats 0+2 against 1+3);
 *  - 36-card pack (6–A, ten ranks above king), 120 card points; five cards each, one card turned
 *    for trump at the bottom of the stock; hands are refilled after every trick;
 *  - lead 1–5 cards of one suit; everyone answers with the same number, beating every card with a
 *    distinct higher card of its suit or a trump, or throwing (partners may feed points);
 *  - malutka: when an opponent leads a single card and all five of your cards are of one suit and
 *    beat it, you may lay all five at once — they become the new target;
 *  - host option "malutka with any suit" (მალუტკა ნებისმიერი ფერით, parabura.ge): a full hand of
 *    one suit goes down on your turn whatever the lead size; everyone else answers it — players who
 *    already played top up to five (earlier cards count), the rest lay five — and takes it only by
 *    beating all five one-for-one;
 *  - bura: a full hand of five trumps, shown on your turn, wins the deal at once;
 *  - raises on your own turn — davi ×2, se ×3, chari ×4, panji ×5, shashi ×6 — the teams alternate;
 *    the other team accepts, raises again or concedes (the raisers then score the value before the
 *    raise, card points are not counted);
 *  - a deal is won with 61+ card points (60:60 scores nothing) and is worth its current value;
 *    first team to the target (6 / 11 / 21) wins.
 */
import { z } from "zod";
import { suitOf, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";
import { combos } from "../poker/evaluator";
import {
  addAnswer,
  answerBeats,
  beats,
  BURA_DECK_36,
  buraRank,
  cardPoints,
  cheapestBeat,
  cheapestDiscard,
  isMalutkaHand,
  isValidLead,
  leadOptions,
  owedBy,
  playedBy,
  sumPoints,
  trickCards,
  type Trick,
} from "../_bura/core";

const PLAYERS = 4;
const HAND = 5;
export const MAX_VALUE = 6;
export const DEAL_POINTS = 61;
/** Georgian names of the deal values 1..6. */
export const RAISE_NAMES = ["", "plain", "davi", "se", "chari", "panji", "shashi"] as const;

export const bura5ConfigSchema = z.strictObject({
  targetPoints: z.union([z.literal(6), z.literal(11), z.literal(21)]).default(11),
  /** Thrown (non-beating) cards are played face down. */
  closedDiscards: z.boolean().default(true),
  /** Allow raising the deal value (davi … shashi). */
  raises: z.boolean().default(true),
  malutka: z.boolean().default(true),
  /** Host option (parabura.ge): a five-card one-suit malutka against a lead of any size. */
  malutkaAnySuit: z.boolean().default(false),
});
export type Bura5Config = z.infer<typeof bura5ConfigSchema>;

const cardSchema = z.enum(BURA_DECK_36 as [string, ...string[]]);
const cardsSchema = z.array(cardSchema).min(1).max(HAND);
export const bura5ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("lead"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("beat"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("discard"), cards: cardsSchema }),
  z.strictObject({ type: z.literal("malutka"), cards: z.array(cardSchema).length(HAND) }),
  z.strictObject({ type: z.literal("bura") }),
  z.strictObject({ type: z.literal("raise") }),
  z.strictObject({ type: z.literal("accept") }),
  z.strictObject({ type: z.literal("fold") }),
]);
export type Bura5Action = z.infer<typeof bura5ActionSchema>;

export type Bura5EndReason = "points" | "bura" | "fold" | "draw";

export interface PendingRaise {
  by: number;
  team: number;
  from: number;
  to: number;
  responder: number;
  resume: "lead" | "respond";
}

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
  phase: "lead" | "respond" | "raise" | "over";
  trick: Trick | null;
  /**
   * The last finished trick (presentation only): tables show it before it is collected. Optional
   * because games persisted before it existed have none; it never affects play or scoring.
   */
  lastTrick?: { plays: Trick["plays"]; winner: number } | null;
  /** Current deal value (1 = plain … 6 = shashi). */
  value: number;
  raise: PendingRaise | null;
  /** Team whose raise was last accepted: the next raise must come from the other team. */
  lastRaiseTeam: number | null;
  /** Team scores [seats 0+2, seats 1+3]. */
  scores: [number, number];
  handNumber: number;
  lastHand: {
    handNumber: number;
    winnerTeam: number | null;
    reason: Bura5EndReason;
    value: number;
    points: [number, number] | null;
    by: number | null;
    revealed: Record<number, Card[]>;
  } | null;
}

export interface Bura5View {
  phase: Bura5State["phase"];
  handNumber: number;
  trumpCard: Card;
  trump: Suit;
  stockCount: number;
  leader: number;
  toAct: number | null;
  value: number;
  raise: Omit<PendingRaise, "resume"> | null;
  scores: [number, number];
  targetPoints: number;
  players: Array<{ seat: number; team: number; handCount: number; capturedCount: number; tricksWon: number }>;
  trick: { leader: number; count: number; bestSeat: number; plays: Array<{ seat: number; faceUp: Card[] | null; count: number }> } | null;
  /** The last finished trick, redacted like `trick` (face-down discards stay hidden from others). */
  lastTrick: { winner: number; plays: Array<{ seat: number; faceUp: Card[] | null; count: number }> } | null;
  you: { seat: number; team: number; hand: Card[]; canRaise: boolean; canBura: boolean; malutka: Card[] | null } | null;
  lastHand: Bura5State["lastHand"];
}

export const teamOf = (seat: number) => seat % 2;
const order = (from: number) => Array.from({ length: PLAYERS }, (_, i) => (from + i) % PLAYERS);

function deal(state: Bura5State, ctx: EngineContext, events: PublicEvent[]): void {
  const deck = shuffle(BURA_DECK_36, ctx.rng);
  state.handNumber += 1;
  state.hands = Array.from({ length: PLAYERS }, () => []);
  state.captured = Array.from({ length: PLAYERS }, () => []);
  state.tricksWon = new Array<number>(PLAYERS).fill(0);
  for (let r = 0; r < HAND; r++) for (const s of order(state.dealer + 1)) state.hands[s]!.push(deck.pop()!);
  state.trumpCard = deck.pop()!;
  state.trump = suitOf(state.trumpCard);
  state.stock = [state.trumpCard, ...deck];
  state.leader = (state.dealer + 1) % PLAYERS;
  state.trick = null;
  state.value = 1;
  state.raise = null;
  state.lastRaiseTeam = null;
  state.phase = "lead";
  events.push({ type: "deal", handNumber: state.handNumber, dealer: state.dealer, trumpCard: state.trumpCard });
}

function endDeal(
  state: Bura5State,
  ctx: EngineContext,
  events: PublicEvent[],
  result: { winnerTeam: number | null; reason: Bura5EndReason; award: number; by?: number; revealed?: Record<number, Card[]> },
): void {
  if (result.winnerTeam !== null) state.scores[result.winnerTeam]! += result.award;
  const points: [number, number] = [0, 0];
  state.captured.forEach((c, s) => (points[teamOf(s)]! += sumPoints(c)));
  state.lastHand = {
    handNumber: state.handNumber,
    winnerTeam: result.winnerTeam,
    reason: result.reason,
    value: result.award,
    points: result.reason === "points" || result.reason === "draw" ? points : null,
    by: result.by ?? null,
    revealed: result.revealed ?? {},
  };
  events.push({ type: "hand_end", ...state.lastHand });
  state.trick = null;
  state.raise = null;
  if (state.scores.some((p) => p >= state.config.targetPoints)) {
    state.phase = "over";
    return;
  }
  state.dealer = (state.dealer + 1) % PLAYERS;
  deal(state, ctx, events);
}

/** Refill hands to five from the winner clockwise, as far as the stock goes (trump card last). */
function refill(state: Bura5State, winner: number): void {
  for (let round = 0; round < HAND; round++) {
    for (const s of order(winner)) {
      if (state.hands[s]!.length < HAND && state.stock.length > 0) state.hands[s]!.push(state.stock.pop()!);
    }
  }
}

function currentActor(state: Bura5State): number | null {
  if (state.phase === "over") return null;
  if (state.phase === "raise") return state.raise!.responder;
  if (state.phase === "respond") return state.trick?.pending[0] ?? null;
  return state.leader;
}

const hasBura = (state: Bura5State, seat: number) => state.hands[seat]!.length === HAND && state.hands[seat]!.every((c) => suitOf(c) === state.trump);

function canRaise(state: Bura5State, seat: number): boolean {
  if (!state.config.raises || state.value >= MAX_VALUE) return false;
  if (state.phase !== "lead" && state.phase !== "respond") return false;
  if (currentActor(state) !== seat) return false;
  return state.lastRaiseTeam !== teamOf(seat);
}

/** Malutka cards for a responder, or null. */
export function malutkaFor(state: Pick<Bura5State, "config" | "phase" | "trick" | "hands" | "trump">, seat: number): Card[] | null {
  if (!state.config.malutka || state.phase !== "respond") return null;
  const trick = state.trick;
  if (!trick || trick.pending[0] !== seat || playedBy(trick, seat).length > 0) return null;
  const hand = state.hands[seat]!;
  if (!isMalutkaHand(hand, HAND, state.trump)) return null;
  // Any suit, any lead size (the lead is not already five cards); it need not beat the table.
  if (state.config.malutkaAnySuit && trick.count < HAND) return [...hand];
  if (trick.count !== 1 || teamOf(trick.leader) === teamOf(seat) || trick.plays.length !== 1) return null;
  const led = trick.best[0]!;
  if (!hand.every((c) => beats(c, led, state.trump))) return null;
  // Everyone still to answer must be able to answer five cards.
  if (trick.pending.slice(1).some((s) => state.hands[s]!.length < HAND)) return null;
  return [...hand];
}

function resolveTrick(state: Bura5State, ctx: EngineContext, events: PublicEvent[]): void {
  const trick = state.trick!;
  const winner = trick.bestSeat;
  state.captured[winner]!.push(...trickCards(trick));
  state.tricksWon[winner]! += 1;
  events.push({ type: "trick_won", seat: winner, team: teamOf(winner) });
  state.lastTrick = { plays: deepClone(trick.plays), winner };
  state.trick = null;
  state.leader = winner;
  refill(state, winner);
  if (state.hands.every((h) => h.length === 0)) {
    const points: [number, number] = [0, 0];
    state.captured.forEach((c, s) => (points[teamOf(s)]! += sumPoints(c)));
    const winnerTeam = points[0] >= DEAL_POINTS ? 0 : points[1] >= DEAL_POINTS ? 1 : null;
    endDeal(state, ctx, events, { winnerTeam, reason: winnerTeam === null ? "draw" : "points", award: state.value });
    return;
  }
  state.phase = "lead";
}

function legal(state: Bura5State, seat: number): Bura5Action[] {
  if (currentActor(state) !== seat) return [];
  if (state.phase === "raise") {
    const out: Bura5Action[] = [{ type: "accept" }, { type: "fold" }];
    if (state.raise!.to < MAX_VALUE) out.push({ type: "raise" });
    return out;
  }
  const hand = state.hands[seat]!;
  const out: Bura5Action[] = [];
  if (hasBura(state, seat)) out.push({ type: "bura" });
  if (canRaise(state, seat)) out.push({ type: "raise" });
  if (state.phase === "lead") {
    // Every player must be able to answer with the same number of cards.
    const minHand = Math.min(...state.hands.map((h) => h.length));
    for (const cards of leadOptions(hand, Math.min(HAND, minHand))) out.push({ type: "lead", cards });
    return out;
  }
  const trick = state.trick!;
  const mal = malutkaFor(state, seat);
  if (mal) out.push({ type: "malutka", cards: mal });
  for (const o of combos(hand, owedBy(trick, seat, hand.length))) {
    if (answerBeats(trick, seat, o, state.trump)) out.push({ type: "beat", cards: o });
    out.push({ type: "discard", cards: o });
  }
  return out;
}

const holds = (hand: readonly Card[], cards: readonly Card[]) => new Set(cards).size === cards.length && cards.every((c) => hand.includes(c));

export const bura5Engine: GameEngine<Bura5State, Bura5Action, Bura5Config, Bura5View> = {
  type: "bura5",
  configSchema: bura5ConfigSchema as unknown as z.ZodType<Bura5Config>,
  actionSchema: bura5ActionSchema,
  seatLimits: () => ({ min: PLAYERS, max: PLAYERS }),

  create(config, players, ctx) {
    if (players !== PLAYERS) throw new Error("Five-card Bura is played by four players in two teams");
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
      dealer: ctx.rng.int(PLAYERS),
      phase: "lead",
      trick: null,
      value: 1,
      raise: null,
      lastRaiseTeam: null,
      scores: [0, 0],
      handNumber: 0,
      lastHand: null,
    };
    deal(state, ctx, []);
    return state;
  },

  actors(state) {
    const a = currentActor(state);
    return a === null ? [] : [a];
  },

  legalActions: legal,

  apply(state, seat, action, ctx) {
    if (state.phase === "over") return fail("match_over");
    if (currentActor(state) !== seat) return fail("not_your_turn");
    const next = deepClone(state);
    const events: PublicEvent[] = [];
    const hand = next.hands[seat]!;

    switch (action.type) {
      case "raise": {
        if (next.phase === "raise") {
          const r = next.raise!;
          if (r.to >= MAX_VALUE) return fail("max_value");
          // A counter-raise accepts the pending raise and asks for one step more.
          next.value = r.to;
          next.lastRaiseTeam = r.team;
          next.raise = { by: seat, team: teamOf(seat), from: r.to, to: r.to + 1, responder: (seat + 1) % PLAYERS, resume: r.resume };
        } else {
          if (!canRaise(next, seat)) return fail("cannot_raise");
          next.raise = { by: seat, team: teamOf(seat), from: next.value, to: next.value + 1, responder: (seat + 1) % PLAYERS, resume: next.phase as "lead" | "respond" };
          next.phase = "raise";
        }
        events.push({ type: "raise", seat, to: next.raise.to });
        return { ok: true, state: next, events };
      }
      case "accept": {
        if (next.phase !== "raise") return fail("no_raise");
        const r = next.raise!;
        next.value = r.to;
        next.lastRaiseTeam = r.team;
        next.phase = r.resume;
        next.raise = null;
        events.push({ type: "raise_accepted", seat, value: next.value });
        return { ok: true, state: next, events };
      }
      case "fold": {
        if (next.phase !== "raise") return fail("no_raise");
        const r = next.raise!;
        events.push({ type: "raise_folded", seat, value: r.from });
        endDeal(next, ctx, events, { winnerTeam: r.team, reason: "fold", award: r.from, by: seat });
        return { ok: true, state: next, events };
      }
      case "bura": {
        if (next.phase !== "lead" && next.phase !== "respond") return fail("not_your_turn");
        if (!hasBura(next, seat)) return fail("no_bura");
        events.push({ type: "bura", seat });
        endDeal(next, ctx, events, { winnerTeam: teamOf(seat), reason: "bura", award: next.value, by: seat, revealed: { [seat]: [...hand] } });
        return { ok: true, state: next, events };
      }
      case "lead": {
        if (next.phase !== "lead") return fail("not_your_turn");
        if (!holds(hand, action.cards)) return fail("card_not_in_hand");
        const minHand = Math.min(...next.hands.map((h) => h.length));
        if (!isValidLead(action.cards, Math.min(HAND, minHand))) return fail("invalid_lead");
        next.hands[seat] = hand.filter((c) => !action.cards.includes(c));
        next.trick = {
          leader: seat,
          count: action.cards.length,
          plays: [{ seat, faceUp: [...action.cards], cards: [...action.cards] }],
          bestSeat: seat,
          best: [...action.cards],
          pending: order(seat).slice(1),
        };
        next.phase = "respond";
        events.push({ type: "lead", seat, cards: [...action.cards] });
        return { ok: true, state: next, events };
      }
      case "malutka": {
        const mal = malutkaFor(next, seat);
        if (!mal || !holds(mal, action.cards) || action.cards.length !== HAND) return fail("no_malutka");
        const trick = next.trick!;
        next.hands[seat] = [];
        trick.plays.push({ seat, faceUp: [...action.cards], cards: [...action.cards] });
        trick.best = [...action.cards];
        trick.bestSeat = seat;
        trick.count = HAND;
        if (next.config.malutkaAnySuit) {
          // Everyone else answers the malutka in turn, topping up to five or laying their hand.
          trick.pending = order(seat)
            .slice(1)
            .filter((s) => owedBy(trick, s, next.hands[s]!.length) > 0);
        } else {
          trick.pending.shift();
        }
        events.push({ type: "malutka", seat, cards: [...action.cards] });
        if (trick.pending.length === 0) resolveTrick(next, ctx, events);
        return { ok: true, state: next, events };
      }
      case "beat":
      case "discard": {
        const trick = next.trick;
        if (next.phase !== "respond" || !trick) return fail("not_your_turn");
        if (action.cards.length !== owedBy(trick, seat, hand.length)) return fail("wrong_card_count");
        if (!holds(hand, action.cards)) return fail("card_not_in_hand");
        if (action.type === "beat" && !answerBeats(trick, seat, action.cards, next.trump)) return fail("does_not_beat");
        next.hands[seat] = hand.filter((c) => !action.cards.includes(c));
        const faceUp = action.type === "beat" || !next.config.closedDiscards ? [...action.cards] : null;
        addAnswer(trick, seat, action.cards, action.type === "beat", next.config.closedDiscards);
        trick.pending.shift();
        events.push({ type: action.type, seat, cards: faceUp ?? undefined, count: action.cards.length });
        if (trick.pending.length === 0) resolveTrick(next, ctx, events);
        return { ok: true, state: next, events };
      }
    }
  },

  view(state, seat) {
    return {
      phase: state.phase,
      handNumber: state.handNumber,
      trumpCard: state.trumpCard,
      trump: state.trump,
      stockCount: state.stock.length,
      leader: state.leader,
      toAct: currentActor(state),
      value: state.value,
      raise: state.raise ? { by: state.raise.by, team: state.raise.team, from: state.raise.from, to: state.raise.to, responder: state.raise.responder } : null,
      scores: [...state.scores] as [number, number],
      targetPoints: state.config.targetPoints,
      players: state.hands.map((h, i) => ({ seat: i, team: teamOf(i), handCount: h.length, capturedCount: state.captured[i]!.length, tricksWon: state.tricksWon[i]! })),
      trick: state.trick
        ? {
            leader: state.trick.leader,
            count: state.trick.count,
            bestSeat: state.trick.bestSeat,
            plays: state.trick.plays.map((p) => ({ seat: p.seat, faceUp: seat === p.seat ? [...p.cards] : p.faceUp ? [...p.faceUp] : null, count: p.cards.length })),
          }
        : null,
      you:
        seat === null
          ? null
          : {
              seat,
              team: teamOf(seat),
              hand: [...state.hands[seat]!],
              canRaise: canRaise(state, seat),
              canBura: currentActor(state) === seat && (state.phase === "lead" || state.phase === "respond") && hasBura(state, seat),
              malutka: malutkaFor(state, seat),
            },
      lastTrick: state.lastTrick
        ? {
            winner: state.lastTrick.winner,
            plays: state.lastTrick.plays.map((p) => ({ seat: p.seat, faceUp: seat === p.seat ? [...p.cards] : p.faceUp ? [...p.faceUp] : null, count: p.cards.length })),
          }
        : null,
      lastHand: state.lastHand ? deepClone(state.lastHand) : null,
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => {
    const scores = [0, 1, 2, 3].map((s) => state.scores[teamOf(s)]!);
    return { placements: placementsFromScores(scores), scores };
  },

  timeoutAction(state, seat, ctx) {
    if (state.phase === "raise") return { type: "accept" };
    if (state.phase === "respond" && state.trick) {
      const hand = state.hands[seat]!;
      return { type: "discard", cards: cheapestDiscard(hand, owedBy(state.trick, seat, hand.length), state.trump) };
    }
    const options = legal(state, seat).filter((o) => o.type === "lead");
    return options.find((o) => o.type === "lead" && o.cards.length === 1) ?? pick(options, ctx.rng);
  },

  bot({ view, legal: options, difficulty, rng }) {
    const you = view.you!;
    const trump = view.trump;
    const trumps = you.hand.filter((c) => suitOf(c) === trump);
    const strength = trumps.length + you.hand.filter((c) => c[0] === "A" || c[0] === "T").length * 0.5;
    if (options.some((o) => o.type === "bura")) return { type: "bura" };
    if (view.phase === "raise") {
      if (difficulty === "easy") return { type: "accept" };
      if (difficulty === "hard" && strength >= 4 && options.some((o) => o.type === "raise")) return { type: "raise" };
      return strength >= 1.5 || view.raise!.to <= 2 ? { type: "accept" } : { type: "fold" };
    }
    if (difficulty !== "easy" && you.canRaise && strength >= (difficulty === "hard" ? 3.5 : 4) && view.value < 3) return { type: "raise" };
    if (you.malutka) return { type: "malutka", cards: you.malutka };

    if (view.phase === "respond" && view.trick) {
      const best = view.trick.plays.find((p) => p.seat === view.trick!.bestSeat)?.faceUp ?? [];
      const partnerWinning = teamOf(view.trick.bestSeat) === you.team;
      const mine = view.trick.plays.find((p) => p.seat === you.seat)?.count ?? 0;
      const count = Math.min(view.trick.count - mine, you.hand.length);
      if (mine > 0) {
        // Answering a malutka with cards already on the felt: beat it as cheaply as the rules allow.
        const beats = options.filter((o): o is Extract<Bura5Action, { type: "beat" }> => o.type === "beat");
        if (beats.length && !partnerWinning) return beats.sort((a, b) => sumPoints(a.cards) - sumPoints(b.cards))[0]!;
        return { type: "discard", cards: cheapestDiscard(you.hand, count, trump) };
      }
      if (partnerWinning && difficulty !== "easy") {
        // Feed points to a winning partner when nobody after us can still take the trick cheaply.
        const lastToAnswer = view.trick.plays.length === 3;
        const feed = you.hand
          .filter((c) => suitOf(c) !== trump)
          .sort((a, b) => cardPoints(b) - cardPoints(a))
          .slice(0, count);
        if (lastToAnswer && feed.length === count) return { type: "discard", cards: feed };
        return { type: "discard", cards: cheapestDiscard(you.hand, count, trump) };
      }
      const atStake = view.trick.plays.reduce((s, p) => s + (p.faceUp ? sumPoints(p.faceUp) : 0), 0);
      const beat = cheapestBeat(you.hand, best, trump);
      if (beat) {
        const spendsTrump = beat.some((c) => suitOf(c) === trump);
        const late = view.stockCount === 0;
        const threshold = difficulty === "easy" ? rng.int(12) : spendsTrump && !late ? 10 : 0;
        if (atStake + sumPoints(beat) >= threshold) return { type: "beat", cards: beat };
      }
      return { type: "discard", cards: cheapestDiscard(you.hand, count, trump) };
    }
    const leads = options.filter((o): o is Extract<Bura5Action, { type: "lead" }> => o.type === "lead");
    if (difficulty === "easy") return pick(leads, rng);
    const nonTrump = leads.filter((o) => o.cards.every((c) => suitOf(c) !== trump));
    if (difficulty === "hard") {
      const strong = nonTrump.filter((o) => o.cards.length > 1 && o.cards.every((c) => cardPoints(c) >= 10));
      if (strong.length) return strong.sort((a, b) => b.cards.length - a.cards.length)[0]!;
    }
    const pool = nonTrump.length ? nonTrump : leads;
    return pool.slice().sort((a, b) => a.cards.length - b.cards.length || sumPoints(a.cards) - sumPoints(b.cards) || buraRank(a.cards[0]!) - buraRank(b.cards[0]!))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `hand ${state.handNumber} · x${state.value} · ${state.stock.length} in stock`),
};
