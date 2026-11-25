/**
 * Joker (ჯოკერი) — Georgian trick-taking game for four players. Default ruleset follows the
 * pagat.com description (A. Tvaladze): 36-card pack with jokers instead of the black sixes,
 * 24 hands in four sets (1→8, 4×9, 8→1, 4×9), exact bidding with the dealer restriction,
 * high/low jokers, hist penalty and set bonus. Variations are configurable.
 */
import { z } from "zod";
import { DECK_36_JOKERS, isJoker, rankValue, suitOf, SUITS, type Card, type Suit } from "../../core/cards";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";

const PLAYERS = 4;

export const jokerConfigSchema = z.strictObject({
  ruleset: z.enum(["standard", "nines"]).default("standard"),
  /** Penalty when a player bids ≥1 and takes no tricks: classic −200 (sets 1/3) / −500 (sets 2/4). */
  hist: z.enum(["classic", "none"]).default("classic"),
  setBonus: z.enum(["simple", "double", "none"]).default("simple"),
  /** Nine-card hands: dealer's last card shows trump, or the player left of the dealer chooses after three cards. */
  nineTrump: z.enum(["lastCard", "choose"]).default("lastCard"),
  /** When a high joker is led naming a non-trump suit and someone trumps: does the trump win? */
  ledJokerTrumped: z.enum(["trumpWins", "jokerWins"]).default("trumpWins"),
});
export type JokerConfig = z.infer<typeof jokerConfigSchema>;

const suitSchema = z.enum(SUITS);
const cardSchema = z.enum(DECK_36_JOKERS as [string, ...string[]]);
export const jokerActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("trump"), suit: z.union([suitSchema, z.literal("none")]) }),
  z.strictObject({ type: z.literal("bid"), value: z.number().int().min(0).max(9) }),
  z.strictObject({
    type: z.literal("play"),
    card: cardSchema,
    joker: z.strictObject({ mode: z.enum(["high", "low"]), suit: suitSchema.optional() }).optional(),
  }),
]);
export type JokerAction = z.infer<typeof jokerActionSchema>;

interface JokerPlay {
  seat: number;
  card: Card;
  joker?: { mode: "high" | "low"; suit?: Suit };
}

export interface HandRecord {
  hand: number;
  set: number;
  cards: number;
  bids: number[];
  tricks: number[];
  scores: number[];
}

export interface JokerState {
  config: JokerConfig;
  schedule: number[][];
  setIndex: number;
  handInSet: number;
  handNumber: number;
  totalHands: number;
  dealer: number;
  cards: number;
  hands: Card[][];
  /** Cards still to be dealt after a trump choice (nine-card "choose" variant). */
  pendingDeal: Card[][] | null;
  trumpCard: Card | null;
  trump: Suit | null;
  phase: "trump" | "bid" | "play" | "over";
  bids: Array<number | null>;
  tricks: number[];
  toAct: number;
  leader: number;
  trick: JokerPlay[];
  lastTrick: { plays: JokerPlay[]; winner: number } | null;
  totals: number[];
  history: HandRecord[];
  bonuses: Array<{ set: number; seat: number; amount: number }>;
}

export interface JokerView {
  phase: JokerState["phase"];
  handNumber: number;
  totalHands: number;
  set: number;
  cards: number;
  dealer: number;
  trumpCard: Card | null;
  trump: Suit | null;
  toAct: number | null;
  leader: number;
  bids: Array<number | null>;
  tricks: number[];
  trick: JokerPlay[];
  lastTrick: JokerState["lastTrick"];
  totals: number[];
  history: HandRecord[];
  bonuses: JokerState["bonuses"];
  handCounts: number[];
  you: { seat: number; hand: Card[]; forbiddenBid: number | null; playable: Card[] } | null;
}

export function jokerSchedule(ruleset: JokerConfig["ruleset"]): number[][] {
  if (ruleset === "nines") return [[9, 9, 9, 9], [9, 9, 9, 9]];
  return [[1, 2, 3, 4, 5, 6, 7, 8], [9, 9, 9, 9], [8, 7, 6, 5, 4, 3, 2, 1], [9, 9, 9, 9]];
}

const seatAfter = (s: number, k = 1) => (s + k) % PLAYERS;

function startHand(state: JokerState, ctx: EngineContext, events: PublicEvent[]): void {
  state.cards = state.schedule[state.setIndex]![state.handInSet]!;
  const deck = shuffle(DECK_36_JOKERS, ctx.rng);
  state.hands = [[], [], [], []];
  state.bids = [null, null, null, null];
  state.tricks = [0, 0, 0, 0];
  state.trick = [];
  state.lastTrick = null;
  state.trumpCard = null;
  state.trump = null;
  state.pendingDeal = null;
  const dealOrder = [1, 2, 3, 4].map((k) => seatAfter(state.dealer, k));
  if (state.cards === 9 && state.config.nineTrump === "choose") {
    for (let r = 0; r < 3; r++) for (const s of dealOrder) state.hands[s]!.push(deck.pop()!);
    state.pendingDeal = [[], [], [], []];
    for (let r = 3; r < 9; r++) for (const s of dealOrder) state.pendingDeal[s]!.push(deck.pop()!);
    state.phase = "trump";
    state.toAct = seatAfter(state.dealer);
  } else {
    for (let r = 0; r < state.cards; r++) for (const s of dealOrder) state.hands[s]!.push(deck.pop()!);
    // Short hands: the next card is turned. Full deals: the dealer's last card shows trump.
    state.trumpCard = state.cards < 9 ? deck.pop()! : state.hands[state.dealer]![state.cards - 1]!;
    state.trump = isJoker(state.trumpCard) ? null : suitOf(state.trumpCard);
    state.phase = "bid";
    state.toAct = seatAfter(state.dealer);
  }
  state.leader = seatAfter(state.dealer);
  events.push({ type: "hand_start", hand: state.handNumber, cards: state.cards, dealer: state.dealer, trumpCard: state.trumpCard });
}

/** Bid the dealer may not make (total bids would equal the number of cards), or null. */
export function forbiddenDealerBid(state: Pick<JokerState, "bids" | "cards" | "dealer">, seat: number): number | null {
  if (seat !== state.dealer) return null;
  const others = state.bids.reduce<number>((s, b, i) => (i === seat ? s : s + (b ?? 0)), 0);
  const forbidden = state.cards - others;
  return forbidden >= 0 && forbidden <= state.cards ? forbidden : null;
}

function handScore(bid: number, tricks: number, cards: number, setIndex: number, hist: JokerConfig["hist"]): number {
  if (bid === tricks) {
    if (bid === cards) return 100 * cards;
    if (bid === 0) return 50;
    return 50 * bid + 50;
  }
  if (bid >= 1 && tricks === 0) {
    if (hist === "none") return 0;
    const nineSet = setIndex % 2 === 1;
    return nineSet ? -500 : -200;
  }
  return 10 * tricks;
}

function ledSuitFor(trick: JokerPlay[]): Suit | null {
  const lead = trick[0];
  if (!lead) return null;
  if (isJoker(lead.card)) return lead.joker?.suit ?? null;
  return suitOf(lead.card);
}

/** Cards a seat may legally play now. */
export function playableCards(state: Pick<JokerState, "hands" | "trick" | "trump">, seat: number): Card[] {
  const hand = state.hands[seat]!;
  const lead = state.trick[0];
  if (!lead) return [...hand];
  const jokers = hand.filter(isJoker);
  const normal = hand.filter((c) => !isJoker(c));
  const suit = ledSuitFor(state.trick)!;
  const ofSuit = normal.filter((c) => suitOf(c) === suit);
  const trumps = state.trump ? normal.filter((c) => suitOf(c) === state.trump) : [];
  if (isJoker(lead.card) && lead.joker?.mode === "high") {
    if (ofSuit.length) {
      const highest = ofSuit.reduce((a, b) => (rankValue(b) > rankValue(a) ? b : a));
      return [highest, ...jokers];
    }
    if (suit === state.trump) return [...hand];
    if (trumps.length) return [...trumps, ...jokers];
    return [...hand];
  }
  if (ofSuit.length) return [...ofSuit, ...jokers];
  if (trumps.length) return [...trumps, ...jokers];
  return [...hand];
}

export function trickWinner(trick: JokerPlay[], trump: Suit | null, ledJokerTrumped: JokerConfig["ledJokerTrumped"]): number {
  const lead = trick[0]!;
  const followingHigh = trick.slice(1).filter((p) => isJoker(p.card) && p.joker?.mode === "high");
  if (followingHigh.length) return followingHigh[followingHigh.length - 1]!.seat;
  const normals = trick.filter((p) => !isJoker(p.card));
  const trumps = trump ? normals.filter((p) => suitOf(p.card) === trump) : [];
  const highestOf = (ps: JokerPlay[]) => ps.reduce((a, b) => (rankValue(b.card) > rankValue(a.card) ? b : a)).seat;
  if (isJoker(lead.card) && lead.joker?.mode === "high") {
    const namedTrump = lead.joker.suit === trump;
    if (ledJokerTrumped === "trumpWins" && !namedTrump && trumps.length) return highestOf(trumps);
    return lead.seat;
  }
  if (trumps.length) return highestOf(trumps);
  const suit = ledSuitFor(trick);
  const followers = normals.filter((p) => suitOf(p.card) === suit);
  if (followers.length) return highestOf(followers);
  return lead.seat; // low joker led and nobody followed, trumped or played a high joker
}

function applySetBonus(state: JokerState, events: PublicEvent[]): void {
  if (state.config.setBonus === "none") return;
  const setHands = state.history.filter((h) => h.set === state.setIndex);
  const premium = [0, 1, 2, 3].filter((s) => setHands.every((h) => h.bids[s] === h.tricks[s]));
  if (!premium.length) return;
  const highest = (s: number) => Math.max(...setHands.map((h) => h.scores[s]!));
  for (const s of premium) {
    const amount = highest(s);
    state.totals[s]! += amount;
    state.bonuses.push({ set: state.setIndex, seat: s, amount });
  }
  if (state.config.setBonus === "double") {
    for (const s of [0, 1, 2, 3].filter((x) => !premium.includes(x))) {
      const erase = Math.max(0, highest(s));
      if (erase > 0) {
        state.totals[s]! -= erase;
        state.bonuses.push({ set: state.setIndex, seat: s, amount: -erase });
      }
    }
  }
  events.push({ type: "set_bonus", set: state.setIndex, seats: premium });
}

function finishHand(state: JokerState, ctx: EngineContext, events: PublicEvent[]): void {
  const scores = [0, 1, 2, 3].map((s) => handScore(state.bids[s]!, state.tricks[s]!, state.cards, state.setIndex, state.config.hist));
  for (let s = 0; s < PLAYERS; s++) state.totals[s]! += scores[s]!;
  state.history.push({
    hand: state.handNumber,
    set: state.setIndex,
    cards: state.cards,
    bids: state.bids.map((b) => b ?? 0),
    tricks: [...state.tricks],
    scores,
  });
  events.push({ type: "hand_end", hand: state.handNumber, scores });
  const setDone = state.handInSet + 1 >= state.schedule[state.setIndex]!.length;
  if (setDone) applySetBonus(state, events);
  if (setDone && state.setIndex + 1 >= state.schedule.length) {
    state.phase = "over";
    return;
  }
  if (setDone) {
    state.setIndex += 1;
    state.handInSet = 0;
  } else {
    state.handInSet += 1;
  }
  state.handNumber += 1;
  state.dealer = seatAfter(state.dealer);
  startHand(state, ctx, events);
}

function legal(state: JokerState, seat: number): JokerAction[] {
  if (state.phase === "over" || state.toAct !== seat) return [];
  if (state.phase === "trump") return [...SUITS.map((suit) => ({ type: "trump" as const, suit })), { type: "trump", suit: "none" }];
  if (state.phase === "bid") {
    const forbidden = forbiddenDealerBid(state, seat);
    return Array.from({ length: state.cards + 1 }, (_, v) => v)
      .filter((v) => v !== forbidden)
      .map((value) => ({ type: "bid" as const, value }));
  }
  const leading = state.trick.length === 0;
  const out: JokerAction[] = [];
  for (const card of playableCards(state, seat)) {
    if (!isJoker(card)) out.push({ type: "play", card });
    else if (leading) {
      for (const mode of ["high", "low"] as const) for (const suit of SUITS) out.push({ type: "play", card, joker: { mode, suit } });
    } else {
      out.push({ type: "play", card, joker: { mode: "high" } }, { type: "play", card, joker: { mode: "low" } });
    }
  }
  return out;
}

export const jokerEngine: GameEngine<JokerState, JokerAction, JokerConfig, JokerView> = {
  type: "joker",
  configSchema: jokerConfigSchema as unknown as z.ZodType<JokerConfig>,
  actionSchema: jokerActionSchema,
  seatLimits: () => ({ min: 4, max: 4 }),

  create(config, players, ctx) {
    if (players !== PLAYERS) throw new Error("Joker is played by four players");
    const schedule = jokerSchedule(config.ruleset);
    const state: JokerState = {
      config,
      schedule,
      setIndex: 0,
      handInSet: 0,
      handNumber: 1,
      totalHands: schedule.reduce((s, set) => s + set.length, 0),
      dealer: ctx.rng.int(PLAYERS),
      cards: 0,
      hands: [],
      pendingDeal: null,
      trumpCard: null,
      trump: null,
      phase: "bid",
      bids: [],
      tricks: [],
      toAct: 0,
      leader: 0,
      trick: [],
      lastTrick: null,
      totals: [0, 0, 0, 0],
      history: [],
      bonuses: [],
    };
    startHand(state, ctx, []);
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
      for (let s = 0; s < PLAYERS; s++) next.hands[s]!.push(...next.pendingDeal![s]!);
      next.pendingDeal = null;
      next.phase = "bid";
      next.toAct = seatAfter(next.dealer);
      events.push({ type: "trump_chosen", seat, suit: action.suit });
      return { ok: true, state: next, events };
    }
    if (action.type === "bid") {
      if (next.phase !== "bid") return fail("not_bidding_phase");
      if (action.value > next.cards) return fail("bid_too_high");
      if (action.value === forbiddenDealerBid(next, seat)) return fail("dealer_bid_forbidden");
      next.bids[seat] = action.value;
      events.push({ type: "bid", seat, value: action.value });
      next.toAct = seatAfter(seat);
      if (next.bids.every((b) => b !== null)) {
        next.phase = "play";
        next.toAct = next.leader;
      }
      return { ok: true, state: next, events };
    }
    if (next.phase !== "play") return fail("not_play_phase");
    const hand = next.hands[seat]!;
    if (!hand.includes(action.card)) return fail("card_not_in_hand");
    if (!playableCards(next, seat).includes(action.card)) return fail("must_follow_rules");
    const leading = next.trick.length === 0;
    if (isJoker(action.card)) {
      if (!action.joker) return fail("joker_mode_required");
      if (leading && !action.joker.suit) return fail("joker_suit_required");
      if (!leading && action.joker.suit) return fail("joker_suit_not_allowed");
    } else if (action.joker) {
      return fail("not_a_joker");
    }
    next.hands[seat] = hand.filter((c) => c !== action.card);
    const play: JokerPlay = { seat, card: action.card, ...(action.joker ? { joker: { ...action.joker } } : {}) };
    next.trick.push(play);
    events.push({ type: "play", ...play });
    if (next.trick.length < PLAYERS) {
      next.toAct = seatAfter(seat);
      return { ok: true, state: next, events };
    }
    const winner = trickWinner(next.trick, next.trump, next.config.ledJokerTrumped);
    next.tricks[winner]! += 1;
    next.lastTrick = { plays: next.trick, winner };
    next.trick = [];
    next.leader = winner;
    next.toAct = winner;
    events.push({ type: "trick_won", seat: winner });
    if (next.hands.every((h) => h.length === 0)) finishHand(next, ctx, events);
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    return {
      phase: state.phase,
      handNumber: state.handNumber,
      totalHands: state.totalHands,
      set: state.setIndex + 1,
      cards: state.cards,
      dealer: state.dealer,
      trumpCard: state.trumpCard,
      trump: state.trump,
      toAct: state.phase === "over" ? null : state.toAct,
      leader: state.leader,
      bids: [...state.bids],
      tricks: [...state.tricks],
      trick: deepClone(state.trick),
      lastTrick: state.lastTrick ? deepClone(state.lastTrick) : null,
      totals: [...state.totals],
      history: deepClone(state.history),
      bonuses: deepClone(state.bonuses),
      handCounts: state.hands.map((h) => h.length),
      you:
        seat === null
          ? null
          : {
              seat,
              hand: [...state.hands[seat]!],
              forbiddenBid: state.phase === "bid" ? forbiddenDealerBid(state, seat) : null,
              playable: state.phase === "play" && state.toAct === seat ? playableCards(state, seat) : [],
            },
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => ({ placements: placementsFromScores(state.totals), scores: [...state.totals] }),
  timeoutAction: (state, seat, ctx) => jokerEngine.bot({ view: jokerEngine.view(state, seat), legal: legal(state, seat), seat, difficulty: "easy", rng: ctx.rng }),

  bot({ view, legal: options, difficulty, rng }) {
    const you = view.you!;
    if (difficulty === "easy" && view.phase !== "play") return pick(options, rng);
    const trump = view.trump;
    const strength = (c: Card) => {
      if (isJoker(c)) return 1;
      const r = rankValue(c);
      const isTrump = trump !== null && suitOf(c) === trump;
      if (isTrump) return r >= 12 ? 0.9 : r >= 10 ? 0.6 : 0.35;
      return r === 14 ? 0.7 : r === 13 ? 0.35 : 0.05;
    };
    if (view.phase === "trump") {
      const bySuit = SUITS.map((s) => ({ s, v: you.hand.filter((c) => !isJoker(c) && suitOf(c) === s).reduce((t, c) => t + rankValue(c), 0) }));
      const best = bySuit.sort((a, b) => b.v - a.v)[0]!;
      return best.v >= 20 ? { type: "trump", suit: best.s } : { type: "trump", suit: "none" };
    }
    if (view.phase === "bid") {
      const estimate = Math.round(you.hand.reduce((t, c) => t + strength(c), 0));
      const allowed = options.map((o) => (o as { value: number }).value);
      const target = Math.max(0, Math.min(view.cards, estimate));
      const choice = allowed.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0]!;
      return { type: "bid", value: choice };
    }
    // Play.
    const need = (view.bids[you.seat] ?? 0) - view.tricks[you.seat]!;
    const wantTrick = need > 0;
    const plays = options as Array<Extract<JokerAction, { type: "play" }>>;
    if (difficulty === "easy") return pick(plays, rng);
    const wouldWin = (p: Extract<JokerAction, { type: "play" }>) => {
      const trick = [...view.trick, { seat: you.seat, card: p.card, ...(p.joker ? { joker: p.joker } : {}) }];
      // Assume remaining players cannot beat if we are last; otherwise use the current winner.
      return trickWinner(trick, trump, "trumpWins") === you.seat;
    };
    const value = (p: Extract<JokerAction, { type: "play" }>) => (isJoker(p.card) ? 20 : rankValue(p.card) + (trump && suitOf(p.card) === trump ? 9 : 0));
    if (view.trick.length === 0) {
      if (wantTrick) {
        const highJoker = plays.find((p) => isJoker(p.card) && p.joker?.mode === "high" && p.joker.suit === (trump ?? "S"));
        if (highJoker && (difficulty === "hard" || need >= 2)) return highJoker;
        const normals = plays.filter((p) => !isJoker(p.card));
        if (normals.length) return normals.sort((a, b) => value(b) - value(a))[0]!;
        return plays[0]!;
      }
      const normals = plays.filter((p) => !isJoker(p.card));
      if (normals.length) return normals.sort((a, b) => value(a) - value(b))[0]!;
      return plays.find((p) => p.joker?.mode === "low") ?? plays[0]!;
    }
    const winning = plays.filter(wouldWin);
    const losing = plays.filter((p) => !wouldWin(p));
    if (wantTrick && winning.length) {
      // Win as cheaply as possible; save jokers unless last to play or hard.
      const nonJoker = winning.filter((p) => !isJoker(p.card));
      const pool = nonJoker.length ? nonJoker : winning;
      return pool.sort((a, b) => value(a) - value(b))[0]!;
    }
    if (!wantTrick && losing.length) {
      const lowJoker = losing.find((p) => p.joker?.mode === "low");
      const nonJoker = losing.filter((p) => !isJoker(p.card));
      if (nonJoker.length) return nonJoker.sort((a, b) => value(b) - value(a))[0]!; // dump highest losing card
      return lowJoker ?? losing[0]!;
    }
    return plays.filter((p) => !isJoker(p.card) || p.joker?.mode === "low").sort((a, b) => value(a) - value(b))[0] ?? plays[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `hand ${state.handNumber}/${state.totalHands} · ${state.cards} cards`),
};
