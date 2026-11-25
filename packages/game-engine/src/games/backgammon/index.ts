/**
 * Long nardi (გრძელი ნარდი) — the game id stays "backgammon" so rooms, ratings and leaderboards
 * keep working. Rules: owner's rules handbook (2026-11-25) and nardeon.com.
 *  - each player's 15 stones start on their "head"; the heads are diagonally opposite and both
 *    players move the same way round the whole board to their own home (last six points);
 *  - a stone may land on an empty point or on its own stones, never on a point holding any
 *    opponent stone; there is no hitting;
 *  - one stone may leave the head per turn — on a player's first turn of a game two may leave
 *    with 6-6, 4-4 or 3-3;
 *  - six consecutive points may not be held unless an opponent stone has already passed them;
 *  - both dice must be played if possible, otherwise the larger one; doubles are played four times;
 *  - bearing off once all 15 stones are home; a win is 1 point, "mars" (opponent bore off none) 2;
 *  - the higher single die starts each game, then rolls both dice.
 *
 * Coordinates in actions are RELATIVE to the moving player: 24 = the head, 1 = the last point,
 * 0 = borne off. A move always goes from a higher to a lower point.
 */
import { z } from "zod";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, rollDie } from "../../core/rng";

export const HEAD = 24;

export const backgammonConfigSchema = z.strictObject({
  matchLength: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]).default(3),
});
export type BackgammonConfig = z.infer<typeof backgammonConfigSchema>;

const moveSchema = z.strictObject({ from: z.number().int().min(1).max(24), to: z.number().int().min(0).max(23) });
export const backgammonActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("roll") }),
  z.strictObject({ type: z.literal("move"), moves: z.array(moveSchema).max(4) }),
]);
export type BackgammonAction = z.infer<typeof backgammonActionSchema>;
export type Move = z.infer<typeof moveSchema>;

export interface Position {
  /** Absolute points, index 0..23. Positive = player 0 stones, negative = player 1. */
  points: number[];
  off: [number, number];
}

export type GameKind = "single" | "mars" | "deadlock";

export interface BackgammonState {
  config: BackgammonConfig;
  pos: Position;
  phase: "preroll" | "move" | "over";
  toAct: number;
  dice: number[];
  scores: [number, number];
  game: number;
  /** Whether each player has completed a turn this game (head exception on the first turn). */
  hadTurn: [boolean, boolean];
  lastMove: { player: number; dice: number[]; moves: Move[] } | null;
  lastGame: { game: number; winner: number; points: number; kind: GameKind } | null;
  /** Single dice rolled to decide who starts the current game: [player 0, player 1]. */
  openingRoll: [number, number] | null;
  /** Consecutive turns without a legal move (deadlock guard). */
  stuckTurns: number;
}

export interface BackgammonView {
  phase: BackgammonState["phase"];
  points: number[];
  off: [number, number];
  toAct: number | null;
  dice: number[];
  scores: [number, number];
  matchLength: number;
  game: number;
  pips: [number, number];
  lastMove: BackgammonState["lastMove"];
  lastGame: BackgammonState["lastGame"];
  openingRoll: [number, number] | null;
  you: { player: number; sequences: Move[][] } | null;
}

/** Absolute index (0..23) of a relative point (1..24) for a player. */
export const absIndex = (player: number, rel: number) => (player === 0 ? rel - 1 : (rel + 11) % 24);
/** Relative point (1..24) of an absolute index for a player. */
export const relPoint = (player: number, abs: number) => (player === 0 ? abs + 1 : (abs + 13) % 24 || 24);
const sign = (player: number) => (player === 0 ? 1 : -1);

export function initialPosition(): Position {
  const points = new Array<number>(24).fill(0);
  points[absIndex(0, HEAD)] = 15;
  points[absIndex(1, HEAD)] = -15;
  return { points, off: [0, 0] };
}

/** Signed count from the player's perspective: >0 own stones, <0 opponent's. */
export function relCount(pos: Position, player: number, rel: number): number {
  return pos.points[absIndex(player, rel)]! * sign(player);
}

export function pipCount(pos: Position, player: number): number {
  let pips = 0;
  for (let rel = 1; rel <= 24; rel++) {
    const c = relCount(pos, player, rel);
    if (c > 0) pips += c * rel;
  }
  return pips;
}

function allHome(pos: Position, player: number): boolean {
  for (let rel = 7; rel <= 24; rel++) if (relCount(pos, player, rel) > 0) return false;
  return true;
}

function highestOccupied(pos: Position, player: number): number {
  for (let rel = 24; rel >= 1; rel--) if (relCount(pos, player, rel) > 0) return rel;
  return 0;
}

/**
 * Six-point block rule: a run of six or more consecutive points held by `player` is allowed only
 * when at least one opponent stone has already passed it (or the opponent has borne off).
 */
export function illegalBlock(pos: Position, player: number): boolean {
  const opp = 1 - player;
  if (pos.off[opp]! > 0) return false;
  // Walk the opponent's path (24 → 1) and find runs of points held by `player`.
  let runLow = 0;
  let runLen = 0;
  const check = () => {
    if (runLen < 6) return false;
    // Has any opponent stone gone past the lowest point of the run?
    for (let q = runLow - 1; q >= 1; q--) if (relCount(pos, opp, q) > 0) return false;
    return true;
  };
  for (let q = 24; q >= 1; q--) {
    if (relCount(pos, opp, q) < 0) {
      runLen += 1;
      runLow = q;
    } else {
      if (check()) return true;
      runLen = 0;
    }
  }
  return check();
}

export interface Step {
  pos: Position;
  move: Move;
}

/** Applies a single move if legal for `die` (ignoring the head limit); returns the new position or null. */
export function applySingle(pos: Position, player: number, from: number, die: number): Step | null {
  if (from < 1 || from > 24 || relCount(pos, player, from) <= 0) return null;
  let to = from - die;
  if (to <= 0) {
    if (!allHome(pos, player)) return null;
    if (to < 0 && highestOccupied(pos, player) > from) return null;
    to = 0;
  } else if (relCount(pos, player, to) < 0) {
    return null; // any opponent stone blocks the point
  }
  const next: Position = { points: pos.points.slice(), off: [pos.off[0], pos.off[1]] };
  next.points[absIndex(player, from)]! -= sign(player);
  if (to === 0) next.off[player]! += 1;
  else next.points[absIndex(player, to)]! += sign(player);
  if (illegalBlock(next, player)) return null;
  return { pos: next, move: { from, to } };
}

export function positionKey(pos: Position): string {
  return `${pos.points.join(",")}|${pos.off.join(",")}`;
}

/** How many stones may leave the head this turn. */
export function headLimit(dice: number[], firstTurn: boolean): number {
  return firstTurn && dice.length === 4 && [6, 4, 3].includes(dice[0]!) ? 2 : 1;
}

export interface TurnAnalysis {
  maxDice: number;
  finals: Map<string, { moves: Move[]; pos: Position }>;
}

/** Enumerates every legal way to play the dice; keeps sequences satisfying the "maximum dice" and "larger die" rules. */
export function analyseTurn(pos: Position, player: number, dice: number[], firstTurn: boolean): TurnAnalysis {
  const limit = headLimit(dice, firstTurn);
  const all: Array<{ moves: Move[]; used: number[]; pos: Position }> = [];
  const seen = new Set<string>();
  const visit = (p: Position, remaining: number[], moves: Move[], used: number[], headUsed: number) => {
    const key = `${positionKey(p)}#${remaining.join("")}#${headUsed}#${used[0] ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    let moved = false;
    const tried = new Set<number>();
    for (let i = 0; i < remaining.length; i++) {
      const die = remaining[i]!;
      if (tried.has(die)) continue;
      tried.add(die);
      const rest = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
      for (let from = 24; from >= 1; from--) {
        if (relCount(p, player, from) <= 0) continue;
        if (from === HEAD && headUsed >= limit) continue;
        const r = applySingle(p, player, from, die);
        if (!r) continue;
        moved = true;
        visit(r.pos, rest, [...moves, r.move], [...used, die], headUsed + (from === HEAD ? 1 : 0));
      }
    }
    if (!moved) all.push({ moves, used, pos: p });
  };
  visit(pos, dice, [], [], 0);
  const maxDice = Math.max(0, ...all.map((s) => s.moves.length));
  let candidates = all.filter((s) => s.moves.length === maxDice);
  if (maxDice === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const larger = Math.max(...dice);
    const withLarger = candidates.filter((s) => s.used[0] === larger);
    if (withLarger.length) candidates = withLarger;
  }
  const finals = new Map<string, { moves: Move[]; pos: Position }>();
  for (const c of candidates) {
    const key = positionKey(c.pos);
    if (!finals.has(key)) finals.set(key, { moves: c.moves, pos: c.pos });
  }
  return { maxDice, finals };
}

function rollForTurn(state: BackgammonState, ctx: EngineContext, events: PublicEvent[]): void {
  const a = rollDie(ctx.rng);
  const b = rollDie(ctx.rng);
  state.dice = a === b ? [a, a, a, a] : [a, b];
  state.phase = "move";
  events.push({ type: "roll", seat: state.toAct, dice: [a, b] });
  autoPassIfStuck(state, ctx, events);
}

function autoPassIfStuck(state: BackgammonState, ctx: EngineContext, events: PublicEvent[]): void {
  const analysis = analyseTurn(state.pos, state.toAct, state.dice, !state.hadTurn[state.toAct]);
  if (analysis.maxDice > 0) return;
  state.stuckTurns += 1;
  state.hadTurn[state.toAct] = true;
  if (state.stuckTurns >= 40) {
    // Theoretical mutual deadlock: the lower pip count wins a single game.
    const winner = pipCount(state.pos, 0) <= pipCount(state.pos, 1) ? 0 : 1;
    endGame(state, winner, "deadlock", ctx, events);
    return;
  }
  events.push({ type: "no_moves", seat: state.toAct });
  state.lastMove = { player: state.toAct, dice: [...state.dice], moves: [] };
  beginTurn(state, 1 - state.toAct);
}

function beginTurn(state: BackgammonState, player: number): void {
  state.toAct = player;
  state.dice = [];
  state.phase = "preroll";
}

function startGame(state: BackgammonState, ctx: EngineContext, events: PublicEvent[]): void {
  state.pos = initialPosition();
  state.game += 1;
  state.lastMove = null;
  state.hadTurn = [false, false];
  let a: number;
  let b: number;
  do {
    a = rollDie(ctx.rng);
    b = rollDie(ctx.rng);
  } while (a === b);
  state.openingRoll = [a, b];
  events.push({ type: "opening_roll", dice: [a, b], starter: a > b ? 0 : 1, game: state.game });
  // The higher die starts and then rolls both dice.
  beginTurn(state, a > b ? 0 : 1);
}

function endGame(state: BackgammonState, winner: number, kind: GameKind, ctx: EngineContext, events: PublicEvent[]): void {
  state.stuckTurns = 0;
  const points = kind === "mars" ? 2 : 1;
  state.scores[winner]! += points;
  state.lastGame = { game: state.game, winner, points, kind };
  events.push({ type: "game_end", ...state.lastGame });
  if (state.scores[winner]! >= state.config.matchLength) {
    state.phase = "over";
    state.dice = [];
    return;
  }
  startGame(state, ctx, events);
}

function legal(state: BackgammonState, seat: number): BackgammonAction[] {
  if (state.phase === "over" || state.toAct !== seat) return [];
  if (state.phase === "preroll") return [{ type: "roll" }];
  return [...analyseTurn(state.pos, seat, state.dice, !state.hadTurn[seat]).finals.values()].map((f) => ({ type: "move" as const, moves: f.moves }));
}

function evaluate(pos: Position, player: number, weights: { point: number; home: number; block: number }): number {
  const opp = 1 - player;
  let score = (pipCount(pos, opp) - pipCount(pos, player)) * 1 + pos.off[player]! * 6;
  let run = 0;
  for (let rel = 1; rel <= 24; rel++) {
    const c = relCount(pos, player, rel);
    if (c > 0) {
      score += weights.point + (rel <= 6 ? weights.home : 0);
      run += 1;
      score += run * weights.block;
      if (c > 4 && rel !== HEAD) score -= (c - 4) * 0.5;
    } else {
      run = 0;
    }
  }
  return score;
}

export const backgammonEngine: GameEngine<BackgammonState, BackgammonAction, BackgammonConfig, BackgammonView> = {
  type: "backgammon",
  configSchema: backgammonConfigSchema as unknown as z.ZodType<BackgammonConfig>,
  actionSchema: backgammonActionSchema,
  seatLimits: () => ({ min: 2, max: 2 }),

  create(config, players, ctx) {
    if (players !== 2) throw new Error("Nardi is a two-player game");
    const state: BackgammonState = {
      config,
      pos: initialPosition(),
      phase: "preroll",
      toAct: 0,
      dice: [],
      scores: [0, 0],
      game: 0,
      hadTurn: [false, false],
      lastMove: null,
      lastGame: null,
      openingRoll: null,
      stuckTurns: 0,
    };
    startGame(state, ctx, []);
    return state;
  },

  actors: (state) => (state.phase === "over" ? [] : [state.toAct]),
  legalActions: legal,

  apply(state, seat, action, ctx) {
    if (state.phase === "over") return fail("match_over");
    if (state.toAct !== seat) return fail("not_your_turn");
    const next = deepClone(state);
    const events: PublicEvent[] = [];
    if (action.type === "roll") {
      if (next.phase !== "preroll") return fail("cannot_roll_now");
      rollForTurn(next, ctx, events);
      return { ok: true, state: next, events };
    }
    if (next.phase !== "move") return fail("cannot_move_now");
    const firstTurn = !next.hadTurn[seat];
    const analysis = analyseTurn(next.pos, seat, next.dice, firstTurn);
    if (action.moves.length !== analysis.maxDice) return fail("must_use_maximum_dice");
    // Replay the submitted moves, consuming one matching die per move.
    let pos = next.pos;
    const remaining = [...next.dice];
    let headUsed = 0;
    const limit = headLimit(next.dice, firstTurn);
    for (const m of action.moves) {
      if (m.from === HEAD && ++headUsed > limit) return fail("one_stone_from_head");
      let applied: Step | null = null;
      for (const die of [...new Set(remaining)].sort((a, b) => a - b)) {
        const r = applySingle(pos, seat, m.from, die);
        if (r && r.move.to === m.to) {
          applied = r;
          remaining.splice(remaining.indexOf(die), 1);
          break;
        }
      }
      if (!applied) return fail("illegal_move");
      pos = applied.pos;
    }
    if (!analysis.finals.has(positionKey(pos))) return fail("illegal_move_sequence");
    next.pos = pos;
    next.stuckTurns = 0;
    next.hadTurn[seat] = true;
    next.lastMove = { player: seat, dice: [...next.dice], moves: action.moves.map((m) => ({ ...m })) };
    events.push({ type: "move", seat, moves: action.moves });
    if (pos.off[seat] === 15) endGame(next, seat, pos.off[1 - seat] === 0 ? "mars" : "single", ctx, events);
    else beginTurn(next, 1 - seat);
    return { ok: true, state: next, events };
  },

  view(state, seat) {
    return {
      phase: state.phase,
      points: [...state.pos.points],
      off: [...state.pos.off] as [number, number],
      toAct: state.phase === "over" ? null : state.toAct,
      dice: [...state.dice],
      scores: [...state.scores] as [number, number],
      matchLength: state.config.matchLength,
      game: state.game,
      pips: [pipCount(state.pos, 0), pipCount(state.pos, 1)],
      lastMove: state.lastMove ? deepClone(state.lastMove) : null,
      lastGame: state.lastGame ? { ...state.lastGame } : null,
      openingRoll: state.openingRoll,
      you:
        seat === null
          ? null
          : {
              player: seat,
              sequences:
                state.phase === "move" && state.toAct === seat
                  ? [...analyseTurn(state.pos, seat, state.dice, !state.hadTurn[seat]).finals.values()].map((f) => f.moves)
                  : [],
            },
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => ({ placements: placementsFromScores(state.scores), scores: [...state.scores] }),

  timeoutAction(state, seat, ctx) {
    if (state.phase === "preroll") return { type: "roll" };
    return pick(legal(state, seat), ctx.rng);
  },

  bot({ view, legal: options, seat, difficulty, rng }) {
    if (view.phase === "preroll") return { type: "roll" };
    const moves = options as Array<Extract<BackgammonAction, { type: "move" }>>;
    if (difficulty === "easy" || moves.length === 1) return pick(moves, rng);
    const pos: Position = { points: [...view.points], off: [...view.off] as [number, number] };
    const weights = difficulty === "hard" ? { point: 1.5, home: 1, block: 0.8 } : { point: 1, home: 0.5, block: 0.3 };
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const m of moves) {
      let p = pos;
      for (const mv of m.moves) {
        const r = [1, 2, 3, 4, 5, 6].map((d) => applySingle(p, seat, mv.from, d)).find((x) => x?.move.to === mv.to);
        if (r) p = r.pos;
      }
      const s = evaluate(p, seat, weights) + rng.int(100) / 1000;
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    return best;
  },

  stage: (state) => (state.phase === "over" ? "finished" : `game ${state.game} · ${state.scores[0]}–${state.scores[1]}`),
};
