import type { z } from "zod";
import type { BotDifficulty, GameType } from "@croco/shared";
import type { Rng } from "./rng";

export interface EngineContext {
  rng: Rng;
  now: number;
}

/** Public events are broadcast to every participant; they must never contain hidden data. */
export interface PublicEvent {
  type: string;
  seat?: number;
  [key: string]: unknown;
}

export type ApplyResult<S> =
  | { ok: true; state: S; events: PublicEvent[] }
  | { ok: false; error: string };

export interface MatchOutcome {
  /** placement per seat, 1 = best; ties share a placement. */
  placements: number[];
  /** final score per seat (game-specific meaning). */
  scores: number[];
}

export interface BotInput<V, A> {
  view: V;
  legal: A[];
  seat: number;
  difficulty: BotDifficulty;
  rng: Rng;
}

/**
 * Contract implemented by every game. Engines are pure: no I/O, no clocks other than
 * `ctx.now`, randomness only through `ctx.rng`. The caller (RoomDO) owns persistence.
 */
export interface GameEngine<S = unknown, A = unknown, C = unknown, V = unknown> {
  readonly type: GameType;
  /** Strict schema with defaults for room-level game configuration. */
  readonly configSchema: z.ZodType<C>;
  /** Strict schema for client-submitted actions. */
  readonly actionSchema: z.ZodType<A>;
  seatLimits(config: C): { min: number; max: number };
  create(config: C, players: number, ctx: EngineContext): S;
  /** Seats whose input is awaited right now. */
  actors(state: S): number[];
  /** Legal actions for a seat (possibly templates, e.g. raise ranges). Derivable from that seat's view. */
  legalActions(state: S, seat: number): A[];
  apply(state: S, seat: number, action: A, ctx: EngineContext): ApplyResult<S>;
  /** Redacted view for a seat, or the public spectator view when seat is null. */
  view(state: S, seat: number | null): V;
  /** View handed to bots: never more than a human with perfect memory of their own observations would know. */
  botView?(state: S, seat: number): V;
  isOver(state: S): boolean;
  outcome(state: S): MatchOutcome;
  /** Action taken when a seat's turn timer expires (conservative, never forfeits the match). */
  timeoutAction(state: S, seat: number, ctx: EngineContext): A;
  bot(input: BotInput<V, A>): A;
  /** Short public description of the stage, e.g. "hand 3/24" or "flop". */
  stage(state: S): string;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Assign placements from scores (higher is better unless `lowerIsBetter`). Ties share placement. */
export function placementsFromScores(scores: readonly number[], lowerIsBetter = false): number[] {
  return scores.map((s) => 1 + scores.filter((o) => (lowerIsBetter ? o < s : o > s)).length);
}

/** Next seat clockwise among `active` seats (or all seats when active is omitted). */
export function nextSeat(seat: number, count: number, active?: (s: number) => boolean): number {
  for (let i = 1; i <= count; i++) {
    const s = (seat + i) % count;
    if (!active || active(s)) return s;
  }
  return seat;
}
