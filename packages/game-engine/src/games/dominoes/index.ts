/**
 * Dominoes — Georgian online model (owner's rules handbook, 2026-11-25; tamashebi.cc):
 *  - two players, double-six set (28 tiles), seven tiles each, the rest is the bazaar (boneyard);
 *  - round 1 is opened by the highest double; later rounds by the previous winner;
 *  - the first double of a round is the "stavka" (spinner): it lies across the chain and opens two
 *    more directions (up / down); later doubles are ordinary tiles;
 *  - after every move the open ends are added up; a multiple of 5 scores that many points. An
 *    uncovered stavka counts as both halves (once) while any of its sides is still open;
 *  - no playable tile: draw from the bazaar until one fits — the last two bazaar tiles are never
 *    drawn; if nothing can be drawn, pass;
 *  - "domino" (last tile played): the opponent's remaining pips, rounded to the nearest 5;
 *    "riba" (blocked): fewer pips wins the opponent's pips rounded up to a multiple of 5, a tie is
 *    a draw; first to the score limit wins.
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

const PLAYERS = 2;
const HAND = 7;
/** The last tiles of the bazaar may not be drawn. */
export const PROTECTED_BONEYARD = 2;

export const dominoesConfigSchema = z.strictObject({
  /** "draw": take tiles from the bazaar; "block": no drawing (house variant). */
  variant: z.enum(["draw", "block"]).default("draw"),
  scoreLimit: z.number().int().min(50).max(500).default(100),
});
export type DominoesConfig = z.infer<typeof dominoesConfigSchema>;

export type End = "left" | "right" | "up" | "down";
const tileSchema = z.enum(ALL_TILES as unknown as [string, ...string[]]);
export const dominoesActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("play"), tile: tileSchema, end: z.enum(["left", "right", "up", "down"]) }),
  z.strictObject({ type: z.literal("draw") }),
  z.strictObject({ type: z.literal("pass") }),
]);
export type DominoesAction = z.infer<typeof dominoesActionSchema>;

/** A tile in the main left → right line. */
export interface PlacedTile {
  tile: Tile;
  left: number;
  right: number;
  by: number;
}

/** A tile on a stavka arm, from the stavka outwards. */
export interface ArmTile {
  tile: Tile;
  inner: number;
  outer: number;
  by: number;
}

export interface DominoesState {
  config: DominoesConfig;
  players: number;
  hands: Tile[][];
  boneyard: Tile[];
  line: PlacedTile[];
  /** The round's stavka (first double played), if any. */
  spinner: Tile | null;
  up: ArmTile[];
  down: ArmTile[];
  toAct: number;
  round: number;
  consecutivePasses: number;
  /** Required opening tile (round 1: highest double), or null if any tile may open. */
  opening: Tile | null;
  scores: number[];
  phase: "play" | "over";
  lastScore: { seat: number; points: number; sum: number } | null;
  lastRound: { round: number; winner: number | null; blocked: boolean; points: number; pips: number[] } | null;
}

export type DominoEnds = Partial<Record<End, number>>;

export interface DominoesView {
  phase: DominoesState["phase"];
  round: number;
  line: PlacedTile[];
  spinner: Tile | null;
  up: ArmTile[];
  down: ArmTile[];
  ends: DominoEnds | null;
  /** Current sum of the open ends (scores when it is a multiple of 5). */
  openSum: number;
  toAct: number | null;
  handCounts: number[];
  boneyardCount: number;
  /** Tiles that may still be drawn (the last two stay in the bazaar). */
  drawable: number;
  scores: number[];
  scoreLimit: number;
  variant: DominoesConfig["variant"];
  opening: Tile | null;
  lastScore: DominoesState["lastScore"];
  you: { seat: number; hand: Tile[] } | null;
  lastRound: DominoesState["lastRound"];
}

export function tileValues(tile: Tile): [number, number] {
  const [a, b] = tile.split("-").map(Number) as [number, number];
  return [a, b];
}

export const pips = (tile: Tile) => tileValues(tile)[0] + tileValues(tile)[1];
const isDouble = (tile: Tile) => tileValues(tile)[0] === tileValues(tile)[1];

type Board = Pick<DominoesState, "line" | "spinner" | "up" | "down">;

/** Open ends of the layout (up / down exist once there is a stavka). */
export function openEnds(board: Board): DominoEnds | null {
  if (!board.line.length) return null;
  const ends: DominoEnds = { left: board.line[0]!.left, right: board.line[board.line.length - 1]!.right };
  if (board.spinner) {
    const v = tileValues(board.spinner)[0];
    ends.up = board.up.length ? board.up[board.up.length - 1]!.outer : v;
    ends.down = board.down.length ? board.down[board.down.length - 1]!.outer : v;
  }
  return ends;
}

/** Sum of the open ends used for scoring. */
export function openSum(board: Board): number {
  const { line, spinner, up, down } = board;
  if (!line.length) return 0;
  if (line.length === 1 && !up.length && !down.length) return line[0]!.left + line[0]!.right;
  let sum = 0;
  let spinnerOpen = false;
  const first = line[0]!;
  const last = line[line.length - 1]!;
  if (first.tile === spinner) spinnerOpen = true;
  else sum += first.left;
  if (last.tile === spinner) spinnerOpen = true;
  else sum += last.right;
  if (spinner) {
    if (!up.length || !down.length) spinnerOpen = true;
    if (up.length) sum += up[up.length - 1]!.outer;
    if (down.length) sum += down[down.length - 1]!.outer;
    if (spinnerOpen) sum += pips(spinner);
  }
  return sum;
}

/** Points for a domino: opponent pips rounded to the nearest multiple of 5. */
export const roundNearest5 = (n: number) => Math.round(n / 5) * 5;
/** Points for a riba: opponent pips rounded up to a multiple of 5. */
export const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;

function fits(tile: Tile, end: number): boolean {
  const [a, b] = tileValues(tile);
  return a === end || b === end;
}

function playOptions(state: DominoesState, seat: number): DominoesAction[] {
  const hand = state.hands[seat]!;
  const ends = openEnds(state);
  const out: DominoesAction[] = [];
  if (!ends) {
    for (const tile of hand) if (!state.opening || tile === state.opening) out.push({ type: "play", tile, end: "left" });
    return out;
  }
  for (const tile of hand) {
    for (const end of ["left", "right", "up", "down"] as const) {
      const v = ends[end];
      if (v !== undefined && fits(tile, v)) out.push({ type: "play", tile, end });
    }
  }
  return out;
}

const drawable = (state: DominoesState) => (state.config.variant === "draw" ? Math.max(0, state.boneyard.length - PROTECTED_BONEYARD) : 0);

function legal(state: DominoesState, seat: number): DominoesAction[] {
  if (state.phase === "over" || state.toAct !== seat) return [];
  const plays = playOptions(state, seat);
  if (plays.length) return plays;
  if (drawable(state) > 0) return [{ type: "draw" }];
  return [{ type: "pass" }];
}

function deal(state: DominoesState, ctx: EngineContext, opener: number | null, events: PublicEvent[]): void {
  const tiles = shuffle(ALL_TILES, ctx.rng);
  state.hands = Array.from({ length: state.players }, () => tiles.splice(0, HAND));
  state.boneyard = state.config.variant === "draw" ? tiles : [];
  state.line = [];
  state.spinner = null;
  state.up = [];
  state.down = [];
  state.consecutivePasses = 0;
  state.lastScore = null;
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
    const opponents = handPips.reduce((s, p, i) => (i === winner ? s : s + p), 0);
    points = blocked ? roundUp5(opponents) : roundNearest5(opponents);
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
  seatLimits: () => ({ min: PLAYERS, max: PLAYERS }),

  create(config, players, ctx) {
    if (players !== PLAYERS) throw new Error("Dominoes is played by two players");
    const state: DominoesState = {
      config,
      players,
      hands: [],
      boneyard: [],
      line: [],
      spinner: null,
      up: [],
      down: [],
      toAct: 0,
      round: 1,
      consecutivePasses: 0,
      opening: null,
      scores: [0, 0],
      phase: "play",
      lastScore: null,
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
        // Riba: fewer pips wins; equal pips is a draw.
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
    const ends = openEnds(next);
    if (!ends) next.line.push({ tile, left: a, right: b, by: seat });
    else if (action.end === "left") next.line.unshift({ tile, left: a === ends.left ? b : a, right: ends.left!, by: seat });
    else if (action.end === "right") next.line.push({ tile, left: ends.right!, right: a === ends.right ? b : a, by: seat });
    else {
      const match = ends[action.end]!;
      next[action.end].push({ tile, inner: match, outer: a === match ? b : a, by: seat });
    }
    if (!next.spinner && isDouble(tile) && (action.end === "left" || action.end === "right")) next.spinner = tile;
    next.hands[seat] = next.hands[seat]!.filter((t) => t !== tile);
    next.consecutivePasses = 0;
    next.opening = null;
    events.push({ type: "play", seat, tile, end: action.end });
    const sum = openSum(next);
    if (sum > 0 && sum % 5 === 0) {
      next.scores[seat]! += sum;
      next.lastScore = { seat, points: sum, sum };
      events.push({ type: "score", seat, points: sum });
    } else {
      next.lastScore = null;
    }
    if (next.scores[seat]! >= next.config.scoreLimit) {
      // Reaching the limit during play ends the match at once.
      const handPips = next.hands.map((h) => h.reduce((s, t) => s + pips(t), 0));
      next.lastRound = { round: next.round, winner: seat, blocked: false, points: 0, pips: handPips };
      next.phase = "over";
      return { ok: true, state: next, events };
    }
    if (next.hands[seat]!.length === 0) endRound(next, ctx, events, seat, false);
    else next.toAct = (seat + 1) % next.players;
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    return {
      phase: state.phase,
      round: state.round,
      line: deepClone(state.line),
      spinner: state.spinner,
      up: deepClone(state.up),
      down: deepClone(state.down),
      ends: openEnds(state),
      openSum: openSum(state),
      toAct: state.phase === "over" ? null : state.toAct,
      handCounts: state.hands.map((h) => h.length),
      boneyardCount: state.boneyard.length,
      drawable: drawable(state),
      scores: [...state.scores],
      scoreLimit: state.config.scoreLimit,
      variant: state.config.variant,
      // Only the holder learns which tile must open (others see it when it is played).
      opening: seat !== null && state.opening && state.hands[seat]!.includes(state.opening) ? state.opening : null,
      lastScore: state.lastScore ? { ...state.lastScore } : null,
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
    const board: Board = { line: view.line, spinner: view.spinner, up: view.up, down: view.down };
    const score = (p: (typeof plays)[number]) => {
      const tile = p.tile as Tile;
      const [a, b] = tileValues(tile);
      // Simulate the placement to see what it scores.
      const ends = openEnds(board);
      const sim: Board = deepClone(board);
      if (!ends) sim.line.push({ tile, left: a, right: b, by: 0 });
      else if (p.end === "left") sim.line.unshift({ tile, left: a === ends.left ? b : a, right: ends.left!, by: 0 });
      else if (p.end === "right") sim.line.push({ tile, left: ends.right!, right: a === ends.right ? b : a, by: 0 });
      else sim[p.end].push({ tile, inner: ends[p.end]!, outer: a === ends[p.end] ? b : a, by: 0 });
      if (!sim.spinner && isDouble(tile) && (p.end === "left" || p.end === "right")) sim.spinner = tile;
      const sum = openSum(sim);
      let s = (sum > 0 && sum % 5 === 0 ? sum * 3 : 0) + pips(tile);
      if (difficulty === "hard") {
        if (isDouble(tile)) s += 4; // doubles are hard to place later
        const newEnds = Object.values(openEnds(sim) ?? {});
        const rest = hand.filter((t) => t !== tile);
        s += rest.filter((t) => newEnds.some((e) => fits(t, e))).length * 2;
      }
      return s;
    };
    return plays.slice().sort((x, y) => score(y) - score(x))[0]!;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `round ${state.round} · ${state.boneyard.length} in bazaar`),
};
