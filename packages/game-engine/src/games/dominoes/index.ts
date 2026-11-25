/**
 * Dominoes — standard double-six set (28 tiles), 2–4 players, "draw" or "block" variants.
 * Round 1 opens with the highest double; later rounds are opened by the previous winner.
 * A round ends when a player plays their last tile (domino) or nobody can play (blocked).
 * The winner scores the pips left in opponents' hands; first to the score limit wins.
 */
import { z } from "zod";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, shuffle } from "../../core/rng";

export type Tile = `${number}-${number}`;
export const ALL_TILES: readonly Tile[] = (() => {
  const out: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push(`${a}-${b}`);
  return out;
})();

export const dominoesConfigSchema = z.strictObject({
  variant: z.enum(["draw", "block"]).default("draw"),
  scoreLimit: z.number().int().min(50).max(500).default(100),
  handSize: z.number().int().min(5).max(7).default(7),
});
export type DominoesConfig = z.infer<typeof dominoesConfigSchema>;

const tileSchema = z.enum(ALL_TILES as unknown as [string, ...string[]]);
export const dominoesActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("play"), tile: tileSchema, end: z.enum(["left", "right"]) }),
  z.strictObject({ type: z.literal("draw") }),
  z.strictObject({ type: z.literal("pass") }),
]);
export type DominoesAction = z.infer<typeof dominoesActionSchema>;

export interface PlacedTile {
  tile: Tile;
  /** Values as laid out left → right. */
  left: number;
  right: number;
  by: number;
}

export interface DominoesState {
  config: DominoesConfig;
  players: number;
  hands: Tile[][];
  boneyard: Tile[];
  line: PlacedTile[];
  toAct: number;
  round: number;
  consecutivePasses: number;
  /** Required opening tile (round 1: highest double), or null if any tile may open. */
  opening: Tile | null;
  scores: number[];
  phase: "play" | "over";
  lastRound: { round: number; winner: number | null; blocked: boolean; points: number; pips: number[] } | null;
}

export interface DominoesView {
  phase: DominoesState["phase"];
  round: number;
  line: PlacedTile[];
  ends: { left: number; right: number } | null;
  toAct: number | null;
  handCounts: number[];
  boneyardCount: number;
  scores: number[];
  scoreLimit: number;
  variant: DominoesConfig["variant"];
  opening: Tile | null;
  you: { seat: number; hand: Tile[] } | null;
  lastRound: DominoesState["lastRound"];
}

export function tileValues(tile: Tile): [number, number] {
  const [a, b] = tile.split("-").map(Number) as [number, number];
  return [a, b];
}

export const pips = (tile: Tile) => tileValues(tile)[0] + tileValues(tile)[1];
const isDouble = (tile: Tile) => tileValues(tile)[0] === tileValues(tile)[1];

export function lineEnds(line: readonly PlacedTile[]): { left: number; right: number } | null {
  if (!line.length) return null;
  return { left: line[0]!.left, right: line[line.length - 1]!.right };
}

function fits(tile: Tile, end: number): boolean {
  const [a, b] = tileValues(tile);
  return a === end || b === end;
}

function playOptions(state: DominoesState, seat: number): DominoesAction[] {
  const hand = state.hands[seat]!;
  const ends = lineEnds(state.line);
  const out: DominoesAction[] = [];
  if (!ends) {
    for (const tile of hand) if (!state.opening || tile === state.opening) out.push({ type: "play", tile, end: "left" });
    return out;
  }
  for (const tile of hand) {
    if (fits(tile, ends.left)) out.push({ type: "play", tile, end: "left" });
    if (fits(tile, ends.right)) out.push({ type: "play", tile, end: "right" });
  }
  return out;
}

function legal(state: DominoesState, seat: number): DominoesAction[] {
  if (state.phase === "over" || state.toAct !== seat) return [];
  const plays = playOptions(state, seat);
  if (plays.length) return plays;
  if (state.config.variant === "draw" && state.boneyard.length > 0) return [{ type: "draw" }];
  return [{ type: "pass" }];
}

function deal(state: DominoesState, ctx: EngineContext, opener: number | null, events: PublicEvent[]): void {
  const tiles = shuffle(ALL_TILES, ctx.rng);
  const handSize = state.players === 4 ? 7 : state.config.handSize;
  state.hands = Array.from({ length: state.players }, () => tiles.splice(0, handSize));
  state.boneyard = state.config.variant === "draw" ? tiles : [];
  state.line = [];
  state.consecutivePasses = 0;
  if (opener === null) {
    // Highest double opens; if no doubles were dealt, the heaviest tile opens.
    let best: { seat: number; tile: Tile; key: number } | null = null;
    state.hands.forEach((hand, seat) => {
      for (const tile of hand) {
        const key = (isDouble(tile) ? 100 : 0) + pips(tile) * 2 + Math.max(...tileValues(tile)) * 0.01;
        if (!best || key > best.key) best = { seat, tile, key };
      }
    });
    const chosen = best as unknown as { seat: number; tile: Tile };
    state.toAct = chosen.seat;
    state.opening = chosen.tile;
  } else {
    state.toAct = opener;
    state.opening = null;
  }
  events.push({ type: "deal", round: state.round, opener: state.toAct });
}

function endRound(state: DominoesState, ctx: EngineContext, events: PublicEvent[], winner: number | null, blocked: boolean): void {
  const handPips = state.hands.map((h) => h.reduce((s, t) => s + pips(t), 0));
  let points = 0;
  if (winner !== null) {
    points = handPips.reduce((s, p, i) => (i === winner ? s : s + p), 0);
    state.scores[winner]! += points;
  }
  state.lastRound = { round: state.round, winner, blocked, points, pips: handPips };
  events.push({ type: "round_end", ...state.lastRound, hands: state.hands.map((h) => [...h]) });
  if (state.scores.some((s) => s >= state.config.scoreLimit)) {
    state.phase = "over";
    return;
  }
  state.round += 1;
  deal(state, ctx, winner ?? state.toAct, events);
}

export const dominoesEngine: GameEngine<DominoesState, DominoesAction, DominoesConfig, DominoesView> = {
  type: "dominoes",
  configSchema: dominoesConfigSchema as unknown as z.ZodType<DominoesConfig>,
  actionSchema: dominoesActionSchema,
  seatLimits: () => ({ min: 2, max: 4 }),

  create(config, players, ctx) {
    if (players < 2 || players > 4) throw new Error("Dominoes needs 2–4 players");
    const state: DominoesState = {
      config,
      players,
      hands: [],
      boneyard: [],
      line: [],
      toAct: 0,
      round: 1,
      consecutivePasses: 0,
      opening: null,
      scores: new Array<number>(players).fill(0),
      phase: "play",
      lastRound: null,
    };
    deal(state, ctx, null, []);
    return state;
  },

  actors: (state) => (state.phase === "over" ? [] : [state.toAct]),
  legalActions: legal,

  apply(state, seat, action, ctx) {
    if (state.phase === "over") return fail("match_over");
    if (state.toAct !== seat) return fail("not_your_turn");
    const next = deepClone(state);
    const events: PublicEvent[] = [];
    const options = legal(next, seat);
    if (action.type === "draw") {
      if (!options.some((o) => o.type === "draw")) return fail("cannot_draw");
      next.hands[seat]!.push(next.boneyard.pop()!);
      events.push({ type: "draw", seat });
      return { ok: true, state: next, events };
    }
    if (action.type === "pass") {
      if (!options.some((o) => o.type === "pass")) return fail("cannot_pass");
      next.consecutivePasses += 1;
      events.push({ type: "pass", seat });
      if (next.consecutivePasses >= next.players) {
        // Blocked: lowest pip count wins; a tie for lowest scores nothing.
        const handPips = next.hands.map((h) => h.reduce((s, t) => s + pips(t), 0));
        const low = Math.min(...handPips);
        const lows = handPips.map((p, i) => (p === low ? i : -1)).filter((i) => i >= 0);
        endRound(next, ctx, events, lows.length === 1 ? lows[0]! : null, true);
      } else {
        next.toAct = (seat + 1) % next.players;
      }
      return { ok: true, state: next, events };
    }
    if (!options.some((o) => o.type === "play" && o.tile === action.tile && o.end === action.end)) {
      return fail(next.hands[seat]!.includes(action.tile as Tile) ? "tile_does_not_fit" : "tile_not_in_hand");
    }
    const tile = action.tile as Tile;
    const [a, b] = tileValues(tile);
    const ends = lineEnds(next.line);
    if (!ends) next.line.push({ tile, left: a, right: b, by: seat });
    else if (action.end === "left") next.line.unshift({ tile, left: a === ends.left ? b : a, right: ends.left, by: seat });
    else next.line.push({ tile, left: ends.right, right: a === ends.right ? b : a, by: seat });
    next.hands[seat] = next.hands[seat]!.filter((t) => t !== tile);
    next.consecutivePasses = 0;
    next.opening = null;
    events.push({ type: "play", seat, tile, end: action.end });
    if (next.hands[seat]!.length === 0) endRound(next, ctx, events, seat, false);
    else next.toAct = (seat + 1) % next.players;
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    return {
      phase: state.phase,
      round: state.round,
      line: deepClone(state.line),
      ends: lineEnds(state.line),
      toAct: state.phase === "over" ? null : state.toAct,
      handCounts: state.hands.map((h) => h.length),
      boneyardCount: state.boneyard.length,
      scores: [...state.scores],
      scoreLimit: state.config.scoreLimit,
      variant: state.config.variant,
      // Only the holder learns which tile must open (others see it when it is played).
      opening: seat !== null && state.opening && state.hands[seat]!.includes(state.opening) ? state.opening : null,
      you: seat === null ? null : { seat, hand: [...state.hands[seat]!] },
      lastRound: state.lastRound ? deepClone(state.lastRound) : null,
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => ({ placements: placementsFromScores(state.scores), scores: [...state.scores] }),
  timeoutAction: (state, seat, ctx) => {
    const options = legal(state, seat);
    return options.find((o) => o.type !== "play") ?? pick(options, ctx.rng);
  },

  bot({ view, legal: options, difficulty, rng }) {
    if (options.length === 1 || options[0]!.type !== "play") return options[0]!;
    const plays = options as Array<Extract<DominoesAction, { type: "play" }>>;
    if (difficulty === "easy") return pick(plays, rng);
    const hand = view.you!.hand;
    const score = (p: (typeof plays)[number]) => {
      const tile = p.tile as Tile;
      let s = pips(tile);
      if (difficulty === "hard") {
        if (isDouble(tile)) s += 4; // doubles are hard to place later
        // Prefer leaving ends that match the rest of our hand.
        const ends = view.ends;
        const [a, b] = tileValues(tile);
        const newEnd = !ends ? b : p.end === "left" ? (a === ends.left ? b : a) : a === ends.right ? b : a;
        const rest = hand.filter((t) => t !== tile);
        s += rest.filter((t) => fits(t, newEnd)).length * 3;
      }
      return s;
    };
    return plays.slice().sort((x, y) => score(y) - score(x))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `round ${state.round} · ${state.boneyard.length} in boneyard`),
};
