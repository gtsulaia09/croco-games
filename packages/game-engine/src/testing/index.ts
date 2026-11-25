/**
 * Test-only helpers. NEVER import from production code: the seeded RNG is predictable by design.
 */
import type { BotDifficulty } from "@croco/shared";
import type { EngineContext, GameEngine } from "../core/engine";
import type { Rng } from "../core/rng";

/** mulberry32 — deterministic PRNG for reproducible tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(maxExclusive: number) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * maxExclusive);
    },
  };
}

export function testCtx(seed = 1, now = 1_700_000_000_000): EngineContext {
  return { rng: seededRng(seed), now };
}

export interface SimulationResult<S> {
  state: S;
  steps: number;
  finished: boolean;
}

/**
 * Plays a whole match with bots on every seat. Every bot action must be accepted by the
 * engine — a rejected bot action fails the simulation (bots must only choose legal moves).
 */
export function simulate<S, A, C, V>(
  engine: GameEngine<S, A, C, V>,
  config: C,
  players: number,
  seed: number,
  opts: { difficulty?: BotDifficulty | BotDifficulty[]; maxSteps?: number; onStep?: (state: S) => void } = {},
): SimulationResult<S> {
  const ctx = testCtx(seed);
  let state = engine.create(config, players, ctx);
  const maxSteps = opts.maxSteps ?? 20_000;
  let steps = 0;
  while (!engine.isOver(state) && steps < maxSteps) {
    const actors = engine.actors(state);
    if (actors.length === 0) throw new Error(`No actors in a non-finished state at step ${steps}`);
    const seat = actors[0]!;
    const legal = engine.legalActions(state, seat);
    if (legal.length === 0) throw new Error(`Seat ${seat} must act but has no legal actions`);
    const difficulty = Array.isArray(opts.difficulty)
      ? (opts.difficulty[seat % opts.difficulty.length] ?? "medium")
      : (opts.difficulty ?? "medium");
    const view = engine.botView ? engine.botView(state, seat) : engine.view(state, seat);
    const action = engine.bot({ view, legal, seat, difficulty, rng: ctx.rng });
    const parsed = engine.actionSchema.safeParse(action);
    if (!parsed.success) throw new Error(`Bot produced an action that fails the schema: ${JSON.stringify(action)}`);
    const result = engine.apply(state, seat, parsed.data, ctx);
    if (!result.ok) {
      throw new Error(`Bot action rejected (${result.error}) at step ${steps}: ${JSON.stringify(action)}`);
    }
    state = result.state;
    opts.onStep?.(state);
    steps++;
  }
  return { state, steps, finished: engine.isOver(state) };
}
