/**
 * Server-side rating computation. Ratings are ONLY changed here, from match results produced
 * by the authoritative RoomDO — never from client input.
 *
 * Multi-player Elo: every pair of human players is treated as a head-to-head result derived
 * from placements; bots never affect ratings. Anti-farming: the same pair contributes to rated
 * results at most N times per day per game; excess games are recorded but unrated for that pair
 * and raise an integrity flag for review.
 */
import { randomId } from "@croco/security";
import { LIMITS, type GameType } from "@croco/shared";
import { all, stmt } from "./db";

export interface RatedParticipant {
  seat: number;
  userId: string | null;
  isBot: boolean;
  forfeited: boolean;
  placement: number;
  score: number;
}

export interface RatingChange {
  userId: string;
  before: number;
  after: number;
  delta: number;
}

export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/** Pure computation, unit-tested. `excludedPairs` contains "a|b" keys (sorted ids) that must not count. */
export function computeRatingChanges(
  humans: Array<{ userId: string; rating: number; placement: number }>,
  excludedPairs: Set<string> = new Set(),
  k: number = LIMITS.rating.kFactor,
): Map<string, number> {
  const deltas = new Map<string, number>();
  if (humans.length < 2) return deltas;
  const factor = k / (humans.length - 1);
  for (const a of humans) {
    let sum = 0;
    for (const b of humans) {
      if (a.userId === b.userId) continue;
      const key = a.userId < b.userId ? `${a.userId}|${b.userId}` : `${b.userId}|${a.userId}`;
      if (excludedPairs.has(key)) continue;
      const actual = a.placement < b.placement ? 1 : a.placement === b.placement ? 0.5 : 0;
      sum += actual - expectedScore(a.rating, b.rating);
    }
    deltas.set(a.userId, Math.round(factor * sum));
  }
  return deltas;
}

export interface FinalizeInput {
  matchId: string;
  roomId: string;
  gameType: GameType;
  startedAt: number;
  finishedAt: number;
  finalRev: number;
  participants: RatedParticipant[];
  eventsJson: string;
  eventsTruncated: boolean;
}

export interface FinalizeResult {
  rated: boolean;
  changes: RatingChange[];
}

/** Persists a finished match, statistics and ratings atomically (single D1 batch). */
export async function finalizeMatch(db: D1Database, input: FinalizeInput): Promise<FinalizeResult> {
  const humans = input.participants.filter((p) => !p.isBot && p.userId);
  const humanIds = [...new Set(humans.map((h) => h.userId!))];
  const rated = humanIds.length >= LIMITS.rating.minHumansForRated;

  const current = new Map<string, number>(
    (
      await all<{ user_id: string; rating: number }>(
        db,
        "SELECT user_id, rating FROM game_ratings WHERE game_type = ? AND user_id IN (SELECT value FROM json_each(?))",
        input.gameType,
        JSON.stringify(humanIds),
      )
    ).map((r) => [r.user_id, r.rating]),
  );

  // Anti-farming: count today's rated games between each pair in this game type.
  const excluded = new Set<string>();
  const flags: Array<{ userId: string; details: Record<string, unknown> }> = [];
  if (rated) {
    const since = input.finishedAt - 24 * 60 * 60_000;
    const pairRows = await all<{ a: string; b: string; n: number }>(
      db,
      `SELECT x.user_id AS a, y.user_id AS b, COUNT(*) AS n
       FROM match_participants x JOIN match_participants y ON y.match_id = x.match_id AND y.user_id > x.user_id
       JOIN game_sessions g ON g.id = x.match_id
       WHERE g.rated = 1 AND g.game_type = ? AND g.finished_at >= ?
         AND x.user_id IN (SELECT value FROM json_each(?)) AND y.user_id IN (SELECT value FROM json_each(?))
       GROUP BY x.user_id, y.user_id`,
      input.gameType,
      since,
      JSON.stringify(humanIds),
      JSON.stringify(humanIds),
    );
    for (const r of pairRows) {
      if (r.n >= LIMITS.rating.maxRatedMatchesPerPairPerDay) {
        excluded.add(`${r.a}|${r.b}`);
        if (r.n >= LIMITS.rating.maxRatedMatchesPerPairPerDay * 2) flags.push({ userId: r.a, details: { kind: "pair_farming", with: r.b, count: r.n } });
      }
    }
  }

  const ratingInput = humans.map((h) => ({
    userId: h.userId!,
    rating: current.get(h.userId!) ?? LIMITS.rating.initial,
    placement: h.placement,
  }));
  const deltas = rated ? computeRatingChanges(ratingInput, excluded) : new Map<string, number>();
  const changes: RatingChange[] = ratingInput.map((h) => {
    const delta = deltas.get(h.userId) ?? 0;
    return { userId: h.userId, before: h.rating, after: h.rating + delta, delta };
  });
  const changeBy = new Map(changes.map((c) => [c.userId, c]));
  const bestPlacement = Math.min(...input.participants.map((p) => p.placement));
  const winners = input.participants.filter((p) => p.placement === bestPlacement).length;

  const statements: D1PreparedStatement[] = [
    stmt(
      db,
      "INSERT INTO game_sessions (id, room_id, game_type, status, rated, players, humans, started_at, finished_at, final_rev) VALUES (?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = 'finished', rated = excluded.rated, finished_at = excluded.finished_at, final_rev = excluded.final_rev",
      input.matchId,
      input.roomId,
      input.gameType,
      rated ? 1 : 0,
      input.participants.length,
      humanIds.length,
      input.startedAt,
      input.finishedAt,
      input.finalRev,
    ),
    stmt(db, "INSERT OR REPLACE INTO match_events (match_id, events_json, truncated) VALUES (?, ?, ?)", input.matchId, input.eventsJson, input.eventsTruncated ? 1 : 0),
  ];
  for (const p of input.participants) {
    const ch = p.userId ? changeBy.get(p.userId) : undefined;
    statements.push(
      stmt(
        db,
        "INSERT OR REPLACE INTO match_participants (match_id, seat, user_id, is_bot, forfeited, placement, score, rating_before, rating_after, rating_delta, finished_at, game_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        input.matchId,
        p.seat,
        p.userId,
        p.isBot ? 1 : 0,
        p.forfeited ? 1 : 0,
        p.placement,
        Math.round(p.score),
        rated && ch ? ch.before : null,
        rated && ch ? ch.after : null,
        rated && ch ? ch.delta : null,
        input.finishedAt,
        input.gameType,
      ),
    );
  }
  for (const h of humans) {
    const ch = changeBy.get(h.userId!)!;
    const win = h.placement === bestPlacement && winners === 1 ? 1 : 0;
    const draw = h.placement === bestPlacement && winners > 1 ? 1 : 0;
    statements.push(
      stmt(
        db,
        `INSERT INTO game_ratings (user_id, game_type, rating, matches, rated, wins, draws, losses, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, game_type) DO UPDATE SET rating = excluded.rating, matches = matches + 1, rated = rated + excluded.rated,
           wins = wins + excluded.wins, draws = draws + excluded.draws, losses = losses + excluded.losses, updated_at = excluded.updated_at`,
        h.userId,
        input.gameType,
        rated ? ch.after : ch.before,
        rated ? 1 : 0,
        win,
        draw,
        win || draw ? 0 : 1,
        input.finishedAt,
      ),
    );
  }
  for (const f of flags) {
    statements.push(
      stmt(db, "INSERT INTO integrity_flags (id, match_id, user_id, kind, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)", randomId("if"), input.matchId, f.userId, "pair_farming", JSON.stringify(f.details), input.finishedAt),
    );
  }
  await db.batch(statements);

  // Abnormal win-rate signal (investigation aid only, never an automatic punishment).
  if (rated) {
    const suspicious = await all<{ user_id: string; rated: number; wins: number }>(
      db,
      "SELECT user_id, rated, wins FROM game_ratings WHERE game_type = ? AND rated >= 30 AND wins * 100 >= rated * 90 AND user_id IN (SELECT value FROM json_each(?))",
      input.gameType,
      JSON.stringify(humanIds),
    );
    if (suspicious.length) {
      await db.batch(
        suspicious.map((s) =>
          stmt(
            db,
            "INSERT INTO integrity_flags (id, match_id, user_id, kind, details_json, created_at) SELECT ?, ?, ?, 'abnormal_win_rate', ?, ? WHERE NOT EXISTS (SELECT 1 FROM integrity_flags WHERE user_id = ? AND kind = 'abnormal_win_rate' AND status = 'open')",
            randomId("if"),
            input.matchId,
            s.user_id,
            JSON.stringify({ rated: s.rated, wins: s.wins, gameType: input.gameType }),
            input.finishedAt,
            s.user_id,
          ),
        ),
      );
    }
  }
  return { rated, changes };
}
