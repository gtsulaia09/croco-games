/**
 * Backgammon — two players, fifteen checkers each, server-rolled dice, full move validation
 * (bar entry, hitting, bearing off, "use both dice / use the larger die" rules), optional
 * doubling cube with the Crawford rule, gammons and backgammons, match play to N points.
 *
 * Coordinates in actions are RELATIVE to the moving player: points 1–24 counted from that
 * player's home, 25 = the bar, 0 = borne off. A move always goes from a higher to a lower point.
 */
import { z } from "zod";
import { deepClone, fail, placementsFromScores, type EngineContext, type GameEngine, type PublicEvent } from "../../core/engine";
import { pick, rollDie } from "../../core/rng";

export const backgammonConfigSchema = z.strictObject({
  matchLength: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7), z.literal(9), z.literal(11)]).default(5),
  doublingCube: z.boolean().default(true),
  crawford: z.boolean().default(true),
});
export type BackgammonConfig = z.infer<typeof backgammonConfigSchema>;

const moveSchema = z.strictObject({ from: z.number().int().min(1).max(25), to: z.number().int().min(0).max(24) });
export const backgammonActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("roll") }),
  z.strictObject({ type: z.literal("double") }),
  z.strictObject({ type: z.literal("take") }),
  z.strictObject({ type: z.literal("drop") }),
  z.strictObject({ type: z.literal("move"), moves: z.array(moveSchema).max(4) }),
]);
export type BackgammonAction = z.infer<typeof backgammonActionSchema>;
export type Move = z.infer<typeof moveSchema>;

export interface Position {
  /** Absolute points, index 0..23. Positive = player 0 checkers, negative = player 1. */
  points: number[];
  bar: [number, number];
  off: [number, number];
}

export interface BackgammonState {
  config: BackgammonConfig;
  pos: Position;
  phase: "preroll" | "doubled" | "move" | "over";
  toAct: number;
  dice: number[];
  cube: { value: number; owner: number | null };
  scores: [number, number];
  game: number;
  crawfordGame: boolean;
  crawfordUsed: boolean;
  lastMove: { player: number; dice: number[]; moves: Move[] } | null;
  lastGame: { game: number; winner: number; points: number; kind: "single" | "gammon" | "backgammon" | "drop" | "deadlock" } | null;
  openingRoll: [number, number] | null;
  /** Consecutive turns without a legal move (deadlock guard). */
  stuckTurns: number;
}

export interface BackgammonView {
  phase: BackgammonState["phase"];
  points: number[];
  bar: [number, number];
  off: [number, number];
  toAct: number | null;
  dice: number[];
  cube: BackgammonState["cube"];
  canDouble: boolean;
  scores: [number, number];
  matchLength: number;
  game: number;
  crawfordGame: boolean;
  pips: [number, number];
  lastMove: BackgammonState["lastMove"];
  lastGame: BackgammonState["lastGame"];
  openingRoll: [number, number] | null;
  you: { player: number; sequences: Move[][] } | null;
}

const INITIAL: Array<[number, number]> = [
  // [absolute index, signed count]
  [23, 2],
  [12, 5],
  [7, 3],
  [5, 5],
  [0, -2],
  [11, -5],
  [16, -3],
  [18, -5],
];

export function initialPosition(): Position {
  const points = new Array<number>(24).fill(0);
  for (const [i, c] of INITIAL) points[i] = c;
  return { points, bar: [0, 0], off: [0, 0] };
}

/** Absolute index of a relative point (1..24) for a player. */
export const absIndex = (player: number, rel: number) => (player === 0 ? rel - 1 : 24 - rel);
const sign = (player: number) => (player === 0 ? 1 : -1);

/** Signed count from the player's perspective: >0 own checkers, <0 opponent's. */
function relCount(pos: Position, player: number, rel: number): number {
  return pos.points[absIndex(player, rel)]! * sign(player);
}

export function pipCount(pos: Position, player: number): number {
  let pips = pos.bar[player]! * 25;
  for (let rel = 1; rel <= 24; rel++) {
    const c = relCount(pos, player, rel);
    if (c > 0) pips += c * rel;
  }
  return pips;
}

function allHome(pos: Position, player: number): boolean {
  if (pos.bar[player]! > 0) return false;
  for (let rel = 7; rel <= 24; rel++) if (relCount(pos, player, rel) > 0) return false;
  return true;
}

function highestOccupied(pos: Position, player: number): number {
  for (let rel = 24; rel >= 1; rel--) if (relCount(pos, player, rel) > 0) return rel;
  return 0;
}

/** Applies a single move if legal for `die`; returns the new position or null. */
export function applySingle(pos: Position, player: number, from: number, die: number): { pos: Position; move: Move; hit: boolean } | null {
  const opp = 1 - player;
  if (pos.bar[player]! > 0 && from !== 25) return null;
  if (from === 25) {
    if (pos.bar[player]! === 0) return null;
  } else if (from < 1 || from > 24 || relCount(pos, player, from) <= 0) {
    return null;
  }
  let to = from - die;
  if (to <= 0) {
    if (from === 25 || !allHome(pos, player)) return null;
    if (to < 0 && highestOccupied(pos, player) > from) return null;
    to = 0;
  } else if (relCount(pos, player, to) < -1) {
    return null; // blocked by two or more opposing checkers
  }
  const next: Position = { points: pos.points.slice(), bar: [pos.bar[0], pos.bar[1]], off: [pos.off[0], pos.off[1]] };
  if (from === 25) next.bar[player]! -= 1;
  else next.points[absIndex(player, from)]! -= sign(player);
  let hit = false;
  if (to === 0) {
    next.off[player]! += 1;
  } else {
    const idx = absIndex(player, to);
    if (relCount(next, player, to) === -1) {
      next.points[idx] = 0;
      next.bar[opp]! += 1;
      hit = true;
    }
    next.points[idx]! += sign(player);
  }
  return { pos: next, move: { from, to }, hit };
}

export function positionKey(pos: Position): string {
  return `${pos.points.join(",")}|${pos.bar.join(",")}|${pos.off.join(",")}`;
}

export interface TurnAnalysis {
  maxDice: number;
  finals: Map<string, { moves: Move[]; pos: Position }>;
}

/** Enumerates every legal way to play the dice; keeps only sequences that satisfy the "maximum dice" and "larger die" rules. */
export function analyseTurn(pos: Position, player: number, dice: number[]): TurnAnalysis {
  const isDouble = dice.length === 4;
  const all: Array<{ moves: Move[]; used: number[]; pos: Position }> = [];
  const visit = (p: Position, remaining: number[], moves: Move[], used: number[]) => {
    let moved = false;
    const tried = new Set<number>();
    for (let i = 0; i < remaining.length; i++) {
      const die = remaining[i]!;
      if (tried.has(die)) continue;
      tried.add(die);
      const rest = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
      const froms = p.bar[player]! > 0 ? [25] : Array.from({ length: 24 }, (_, k) => 24 - k).filter((rel) => relCount(p, player, rel) > 0);
      for (const from of froms) {
        const r = applySingle(p, player, from, die);
        if (!r) continue;
        moved = true;
        visit(r.pos, rest, [...moves, r.move], [...used, die]);
      }
    }
    if (!moved) all.push({ moves, used, pos: p });
  };
  visit(pos, dice, [], []);
  const maxDice = Math.max(0, ...all.map((s) => s.moves.length));
  let candidates = all.filter((s) => s.moves.length === maxDice);
  if (!isDouble && maxDice === 1 && dice.length === 2 && dice[0] !== dice[1]) {
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

function canDouble(state: BackgammonState, player: number): boolean {
  if (!state.config.doublingCube || state.crawfordGame) return false;
  if (state.cube.owner !== null && state.cube.owner !== player) return false;
  // No point doubling when the current game already decides the match for the doubler.
  if (state.scores[player]! + state.cube.value >= state.config.matchLength) return false;
  return state.cube.value < 64;
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
  const analysis = analyseTurn(state.pos, state.toAct, state.dice);
  if (analysis.maxDice === 0) {
    state.stuckTurns += 1;
    if (state.stuckTurns >= 40) {
      // Theoretical mutual deadlock (both players closed out): lower pip count wins a single game.
      const winner = pipCount(state.pos, 0) <= pipCount(state.pos, 1) ? 0 : 1;
      endGame(state, winner, "deadlock", ctx, events);
      return;
    }
    events.push({ type: "no_moves", seat: state.toAct });
    state.lastMove = { player: state.toAct, dice: [...state.dice], moves: [] };
    beginTurn(state, 1 - state.toAct, ctx, events);
  }
}

function beginTurn(state: BackgammonState, player: number, ctx: EngineContext, events: PublicEvent[]): void {
  state.toAct = player;
  state.dice = [];
  if (canDouble(state, player)) {
    state.phase = "preroll";
  } else {
    rollForTurn(state, ctx, events);
  }
}

function startGame(state: BackgammonState, ctx: EngineContext, events: PublicEvent[]): void {
  state.pos = initialPosition();
  state.cube = { value: 1, owner: null };
  state.game += 1;
  state.lastMove = null;
  let a: number;
  let b: number;
  do {
    a = rollDie(ctx.rng);
    b = rollDie(ctx.rng);
  } while (a === b);
  state.openingRoll = [a, b];
  state.toAct = a > b ? 0 : 1;
  state.dice = [a, b];
  state.phase = "move";
  events.push({ type: "opening_roll", dice: [a, b], starter: state.toAct, game: state.game });
  autoPassIfStuck(state, ctx, events);
}

function endGame(state: BackgammonState, winner: number, kind: NonNullable<BackgammonState["lastGame"]>["kind"], ctx: EngineContext, events: PublicEvent[]): void {
  state.stuckTurns = 0;
  const multiplier = kind === "backgammon" ? 3 : kind === "gammon" ? 2 : 1;
  const points = state.cube.value * multiplier;
  state.scores[winner]! += points;
  state.lastGame = { game: state.game, winner, points, kind };
  events.push({ type: "game_end", ...state.lastGame });
  if (state.scores[winner]! >= state.config.matchLength) {
    state.phase = "over";
    state.dice = [];
    return;
  }
  // Crawford rule: the first game after a player reaches match point is played without the cube.
  const matchPoint = state.config.matchLength - 1;
  if (state.config.crawford && !state.crawfordUsed && state.config.matchLength > 1 && state.scores.some((s) => s === matchPoint)) {
    state.crawfordGame = true;
    state.crawfordUsed = true;
  } else {
    state.crawfordGame = false;
  }
  startGame(state, ctx, events);
}

function gameKind(pos: Position, winner: number): "single" | "gammon" | "backgammon" {
  const loser = 1 - winner;
  if (pos.off[loser]! > 0) return "single";
  // Backgammon: loser still has a checker on the bar or in the winner's home board.
  let inWinnersHome = pos.bar[loser]! > 0;
  for (let rel = 19; rel <= 24; rel++) if (relCount(pos, loser, rel) > 0) inWinnersHome = true;
  return inWinnersHome ? "backgammon" : "gammon";
}

function legal(state: BackgammonState, seat: number): BackgammonAction[] {
  if (state.phase === "over" || state.toAct !== seat) return [];
  if (state.phase === "preroll") return [{ type: "roll" }, { type: "double" }];
  if (state.phase === "doubled") return [{ type: "take" }, { type: "drop" }];
  return [...analyseTurn(state.pos, seat, state.dice).finals.values()].map((f) => ({ type: "move" as const, moves: f.moves }));
}

function evaluate(pos: Position, player: number, weights: { blot: number; point: number; home: number; hit: number }): number {
  const opp = 1 - player;
  let score = (pipCount(pos, opp) - pipCount(pos, player)) * 1 + pos.off[player]! * 4 + pos.bar[opp]! * weights.hit;
  const racing = highestOccupied(pos, player) < 25 - highestOccupied(pos, opp);
  for (let rel = 1; rel <= 24; rel++) {
    const c = relCount(pos, player, rel);
    if (c >= 2) score += weights.point + (rel <= 6 ? weights.home : 0);
    if (c === 1 && !racing) score -= weights.blot * (rel > 6 ? 1 : 0.6);
  }
  return score;
}

export const backgammonEngine: GameEngine<BackgammonState, BackgammonAction, BackgammonConfig, BackgammonView> = {
  type: "backgammon",
  configSchema: backgammonConfigSchema as unknown as z.ZodType<BackgammonConfig>,
  actionSchema: backgammonActionSchema,
  seatLimits: () => ({ min: 2, max: 2 }),

  create(config, players, ctx) {
    if (players !== 2) throw new Error("Backgammon is a two-player game");
    const state: BackgammonState = {
      config,
      pos: initialPosition(),
      phase: "move",
      toAct: 0,
      dice: [],
      cube: { value: 1, owner: null },
      scores: [0, 0],
      game: 0,
      crawfordGame: false,
      crawfordUsed: false,
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
    switch (action.type) {
      case "roll":
        if (next.phase !== "preroll") return fail("cannot_roll_now");
        rollForTurn(next, ctx, events);
        return { ok: true, state: next, events };
      case "double":
        if (next.phase !== "preroll" || !canDouble(next, seat)) return fail("cannot_double");
        next.phase = "doubled";
        next.toAct = 1 - seat;
        events.push({ type: "double_offered", seat, value: next.cube.value * 2 });
        return { ok: true, state: next, events };
      case "take":
        if (next.phase !== "doubled") return fail("no_double_offered");
        next.cube = { value: next.cube.value * 2, owner: seat };
        next.toAct = 1 - seat;
        events.push({ type: "double_taken", seat, value: next.cube.value });
        rollForTurn(next, ctx, events);
        return { ok: true, state: next, events };
      case "drop":
        if (next.phase !== "doubled") return fail("no_double_offered");
        events.push({ type: "double_dropped", seat });
        endGame(next, 1 - seat, "drop", ctx, events);
        return { ok: true, state: next, events };
      case "move": {
        if (next.phase !== "move") return fail("cannot_move_now");
        const analysis = analyseTurn(next.pos, seat, next.dice);
        if (action.moves.length !== analysis.maxDice) return fail("must_use_maximum_dice");
        // Replay the submitted moves, consuming one matching die per move.
        let pos = next.pos;
        const remaining = [...next.dice];
        for (const m of action.moves) {
          let applied: ReturnType<typeof applySingle> = null;
          const candidates = [...new Set(remaining)].sort((a, b) => a - b);
          for (const die of candidates) {
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
        next.lastMove = { player: seat, dice: [...next.dice], moves: action.moves.map((m) => ({ ...m })) };
        events.push({ type: "move", seat, moves: action.moves });
        if (pos.off[seat] === 15) {
          endGame(next, seat, gameKind(pos, seat), ctx, events);
        } else {
          beginTurn(next, 1 - seat, ctx, events);
        }
        return { ok: true, state: next, events };
      }
    }
  },

  view(state, seat) {
    return {
      phase: state.phase,
      points: [...state.pos.points],
      bar: [...state.pos.bar] as [number, number],
      off: [...state.pos.off] as [number, number],
      toAct: state.phase === "over" ? null : state.toAct,
      dice: [...state.dice],
      cube: { ...state.cube },
      canDouble: state.phase === "preroll" && canDouble(state, state.toAct),
      scores: [...state.scores] as [number, number],
      matchLength: state.config.matchLength,
      game: state.game,
      crawfordGame: state.crawfordGame,
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
                state.phase === "move" && state.toAct === seat ? [...analyseTurn(state.pos, seat, state.dice).finals.values()].map((f) => f.moves) : [],
            },
    };
  },

  isOver: (state) => state.phase === "over",
  outcome: (state) => ({ placements: placementsFromScores(state.scores), scores: [...state.scores] }),

  timeoutAction(state, seat, ctx) {
    if (state.phase === "preroll") return { type: "roll" };
    if (state.phase === "doubled") return { type: "take" };
    return pick(legal(state, seat), ctx.rng);
  },

  bot({ view, legal: options, seat, difficulty, rng }) {
    if (view.phase === "preroll") {
      if (difficulty === "easy" || !view.canDouble) return { type: "roll" };
      const lead = view.pips[1 - seat]! - view.pips[seat]!;
      return lead > Math.max(12, view.pips[seat]! * 0.1) ? { type: "double" } : { type: "roll" };
    }
    if (view.phase === "doubled") {
      if (difficulty === "easy") return { type: "take" };
      const deficit = view.pips[seat]! - view.pips[1 - seat]!;
      return deficit > Math.max(20, view.pips[seat]! * 0.2) ? { type: "drop" } : { type: "take" };
    }
    const moves = options as Array<Extract<BackgammonAction, { type: "move" }>>;
    if (difficulty === "easy" || moves.length === 1) return pick(moves, rng);
    const pos: Position = { points: [...view.points], bar: [...view.bar] as [number, number], off: [...view.off] as [number, number] };
    const weights = difficulty === "hard" ? { blot: 6, point: 3, home: 3, hit: 12 } : { blot: 3, point: 2, home: 1, hit: 8 };
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const m of moves) {
      let p = pos;
      for (const mv of m.moves) {
        // Recompute each step using the die implied by the move.
        const die = mv.from - mv.to;
        const r = applySingle(p, seat, mv.from, die) ?? [1, 2, 3, 4, 5, 6].map((d) => applySingle(p, seat, mv.from, d)).find((x) => x?.move.to === mv.to);
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
