import { Hono } from "hono";
import {
  GAME_TYPES,
  LIMITS,
  isGameType,
  leaderboardQuerySchema,
  type GameLeaderDto,
  type GameType,
  type GlobalLeaderboardEntry,
  type LeaderboardEntry,
} from "@croco/shared";
import { authenticate, requireProfile } from "../auth";
import { all, decodeOffsetCursor, nextOffsetCursor } from "../db";
import type { AppEnv, Ctx } from "../http/context";
import { parseOrThrow, query } from "../http/app";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { toPublicUser, type PublicUserRow } from "../users";

export const leaderboardRoutes = new Hono<AppEnv>();
leaderboardRoutes.use("/leaderboards/*", authenticate, requireProfile);
leaderboardRoutes.use("/leaders", authenticate, requireProfile);

const ESTABLISHED = LIMITS.rating.establishedMatches;

function periodStart(period: "all" | "month" | "week", now = new Date()): number {
  if (period === "month") return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  if (period === "week") {
    const day = (now.getUTCDay() + 6) % 7; // Monday = 0
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day);
  }
  return 0;
}

async function recentForm(db: D1Database, gameType: GameType, userIds: string[]): Promise<Map<string, Array<"W" | "L" | "D">>> {
  const rows = await all<{ user_id: string; placement: number; winners: number }>(
    db,
    `SELECT user_id, placement, winners FROM (
       SELECT mp.user_id, mp.placement,
         (SELECT COUNT(*) FROM match_participants w WHERE w.match_id = mp.match_id AND w.placement = 1) AS winners,
         ROW_NUMBER() OVER (PARTITION BY mp.user_id ORDER BY mp.finished_at DESC) AS rn
       FROM match_participants mp
       WHERE mp.game_type = ? AND mp.user_id IN (SELECT value FROM json_each(?))
     ) WHERE rn <= 5`,
    gameType,
    JSON.stringify(userIds),
  );
  const out = new Map<string, Array<"W" | "L" | "D">>();
  for (const r of rows) {
    const list = out.get(r.user_id) ?? [];
    list.push(r.placement === 1 ? (r.winners > 1 ? "D" : "W") : "L");
    out.set(r.user_id, list);
  }
  return out;
}

leaderboardRoutes.get("/leaderboards/:gameType", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "leaderboard", user.id);
  const gameType = c.req.param("gameType");
  if (gameType === "global") return globalBoard(c);
  if (!isGameType(gameType)) throw new ApiError("not_found");
  const q = parseOrThrow(leaderboardQuerySchema, query(c));
  const offset = decodeOffsetCursor(q.cursor);
  let rows: Array<PublicUserRow & { rating: number; matches: number; wins: number; losses: number; draws: number; rated: number }>;
  if (q.period === "all") {
    rows = await all(
      c.env.DB,
      `SELECT p.user_id AS id, p.username, p.avatar,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod,
         g.rating, g.matches, g.wins, g.losses, g.draws, g.rated
       FROM game_ratings g JOIN profiles p ON p.user_id = g.user_id JOIN users u ON u.id = g.user_id
       WHERE g.game_type = ? AND g.rated > 0 AND u.status = 'active'
       ORDER BY (g.rated >= ?) DESC, g.rating DESC, g.rated DESC, p.user_id ASC
       LIMIT ? OFFSET ?`,
      gameType,
      ESTABLISHED,
      q.limit,
      offset,
    );
  } else {
    // Period boards rank by rating points gained in the period (minimum 3 rated matches).
    rows = await all(
      c.env.DB,
      `SELECT p.user_id AS id, p.username, p.avatar,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod,
         SUM(mp.rating_delta) AS rating, COUNT(*) AS matches,
         SUM(CASE WHEN mp.placement = 1 THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN mp.placement = 1 THEN 0 ELSE 1 END) AS losses, 0 AS draws, COUNT(*) AS rated
       FROM match_participants mp JOIN profiles p ON p.user_id = mp.user_id JOIN users u ON u.id = mp.user_id
       WHERE mp.game_type = ? AND mp.finished_at >= ? AND mp.rating_delta IS NOT NULL AND u.status = 'active'
       GROUP BY mp.user_id HAVING COUNT(*) >= 3
       ORDER BY rating DESC, matches DESC, p.user_id ASC
       LIMIT ? OFFSET ?`,
      gameType,
      periodStart(q.period),
      q.limit,
      offset,
    );
  }
  const form = await recentForm(c.env.DB, gameType, rows.map((r) => r.id));
  const items: LeaderboardEntry[] = rows.map((r, i) => ({
    rank: offset + i + 1,
    user: toPublicUser(r),
    rating: r.rating,
    matches: r.matches,
    wins: r.wins,
    losses: r.losses,
    winRate: r.matches ? Math.round((r.wins / r.matches) * 1000) / 10 : 0,
    recent: form.get(r.id) ?? [],
    established: q.period === "all" ? r.rated >= ESTABLISHED : true,
    leadOverNext: rows[i + 1] ? r.rating - rows[i + 1]!.rating : null,
  }));
  return c.json({ gameType, period: q.period, items, nextCursor: nextOffsetCursor(offset, q.limit, rows.length) });
});

/** Current #1 per game (established players only), the lead over #2, and the caller's rank. */
leaderboardRoutes.get("/leaders", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "leaders", user.id);
  const top = await all<PublicUserRow & { game_type: GameType; rating: number; rn: number }>(
    c.env.DB,
    `SELECT * FROM (
       SELECT g.game_type, g.rating, p.user_id AS id, p.username, p.avatar,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod,
         ROW_NUMBER() OVER (PARTITION BY g.game_type ORDER BY g.rating DESC, g.rated DESC, g.user_id) AS rn
       FROM game_ratings g JOIN profiles p ON p.user_id = g.user_id JOIN users u ON u.id = g.user_id
       WHERE g.rated >= ? AND u.status = 'active'
     ) WHERE rn <= 2`,
    ESTABLISHED,
  );
  const mine = await all<{ game_type: GameType; rank: number }>(
    c.env.DB,
    `SELECT g.game_type, (SELECT COUNT(*) + 1 FROM game_ratings o WHERE o.game_type = g.game_type AND o.rated >= ? AND o.rating > g.rating) AS rank
     FROM game_ratings g WHERE g.user_id = ? AND g.rated >= ?`,
    ESTABLISHED,
    user.id,
    ESTABLISHED,
  );
  const myRank = new Map(mine.map((m) => [m.game_type, m.rank]));
  const items: GameLeaderDto[] = GAME_TYPES.map((t) => {
    const first = top.find((r) => r.game_type === t && r.rn === 1);
    const second = top.find((r) => r.game_type === t && r.rn === 2);
    return {
      gameType: t,
      leader: first ? { user: toPublicUser(first), rating: first.rating, leadOverSecond: second ? first.rating - second.rating : null } : null,
      youLead: first?.id === user.id,
      yourRank: myRank.get(t) ?? null,
    };
  });
  return c.json({ items });
});

/**
 * Global board. Raw ratings from different games are never added together: each player's
 * standing in a game is converted to a percentile (100 = first) among established players of
 * that game; players are ordered by games led, then average percentile.
 */
async function globalBoard(c: Ctx) {
  const rows = await all<PublicUserRow & { game_type: GameType; rn: number; total: number }>(
    c.env.DB,
    `SELECT * FROM (
       SELECT g.game_type, p.user_id AS id, p.username, p.avatar,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin,
         EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod,
         ROW_NUMBER() OVER (PARTITION BY g.game_type ORDER BY g.rating DESC, g.rated DESC, g.user_id) AS rn,
         COUNT(*) OVER (PARTITION BY g.game_type) AS total
       FROM game_ratings g JOIN profiles p ON p.user_id = g.user_id JOIN users u ON u.id = g.user_id
       WHERE g.rated >= ? AND u.status = 'active'
     ) WHERE rn <= 200`,
    ESTABLISHED,
  );
  const byUser = new Map<string, { row: PublicUserRow; percentiles: Array<[GameType, number]>; firsts: GameType[] }>();
  for (const r of rows) {
    const entry = byUser.get(r.id) ?? { row: r, percentiles: [], firsts: [] };
    const pct = r.total <= 1 ? 100 : Math.round((1 - (r.rn - 1) / (r.total - 1)) * 1000) / 10;
    entry.percentiles.push([r.game_type, pct]);
    if (r.rn === 1) entry.firsts.push(r.game_type);
    byUser.set(r.id, entry);
  }
  const items: GlobalLeaderboardEntry[] = [...byUser.values()]
    .map((e) => {
      const avg = e.percentiles.reduce((s, [, p]) => s + p, 0) / e.percentiles.length;
      const strongest = e.percentiles.slice().sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        rank: 0,
        user: toPublicUser(e.row),
        gamesLed: e.firsts.length,
        averagePercentile: Math.round(avg * 10) / 10,
        strongestGame: strongest,
        gamesRanked: e.percentiles.length,
        firstPlaces: e.firsts,
      };
    })
    .sort((a, b) => b.gamesLed - a.gamesLed || b.averagePercentile - a.averagePercentile || b.gamesRanked - a.gamesRanked)
    .slice(0, 50)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  return c.json({ items });
}
