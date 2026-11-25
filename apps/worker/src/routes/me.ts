import { Hono } from "hono";
import {
  createProfileSchema,
  GAME_TYPES,
  LIMITS,
  paginationSchema,
  sessionRevokeSchema,
  updateProfileSchema,
  usernameSkeleton,
  type MatchHistoryDto,
  type MeResponse,
  type PlayerStatsDto,
  type SessionDto,
} from "@croco/shared";
import { assertRecentAuth, authenticate, requireProfile } from "../auth";
import { securityEvent } from "../audit";
import { all, decodeTimeCursor, encodeTimeCursor, one, run, stmt } from "../db";
import type { AppEnv } from "../http/context";
import { parseOrThrow, query, readJson } from "../http/app";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { getSettings } from "../settings";
import { publicUser } from "../users";

export const meRoutes = new Hono<AppEnv>();

async function verifyTurnstile(secret: string, token: string | undefined, ip: string): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

meRoutes.get("/me", authenticate, async (c) => {
  const { user, roles, token, identityVerified } = c.get("auth");
  await rateLimit(c, "read", "me", user.id);
  const staff = roles.has("admin") || roles.has("moderator");
  const mfa = staff ? await one<{ enrolled_at: number | null }>(c.env.DB, "SELECT enrolled_at FROM admin_mfa WHERE user_id = ?", user.id) : null;
  const active = await one<{ room_id: string }>(c.env.DB, "SELECT room_id FROM room_members WHERE user_id = ? AND left_at IS NULL", user.id);
  const body: MeResponse = {
    account: { signInProvider: token.signInProvider, emailVerified: token.emailVerified, identityVerified },
    profile: user.username
      ? {
          id: user.id,
          username: user.username,
          avatar: user.avatar!,
          badges: { admin: roles.has("admin"), moderator: roles.has("moderator") },
          locale: user.locale ?? "ka",
          showOnline: user.show_online === 1,
          createdAt: user.profile_created_at ?? user.created_at,
        }
      : null,
    roles: [...roles],
    admin: staff ? { mfaEnrolled: Boolean(mfa?.enrolled_at), mfaRequired: true } : null,
    activeRoomId: active?.room_id ?? null,
  };
  return c.json(body);
});

meRoutes.post("/me/profile", authenticate, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "auth", "profile_create", user.id);
  await rateLimit(c, "auth", "profile_create_ip");
  const input = await readJson(c, createProfileSchema);
  const settings = await getSettings(c.env);
  if (!settings.registrationOpen) throw new ApiError("registration_closed");
  const turnstile = c.get("config").turnstile;
  if (turnstile && !(await verifyTurnstile(turnstile.secret, input.turnstileToken, c.get("ip")))) {
    await securityEvent(c.env, "registration.turnstile_failed", { userId: user.id, ipHash: c.get("ipHash") });
    throw new ApiError("turnstile_failed");
  }
  if (user.username) throw new ApiError("profile_exists");
  try {
    await run(
      c.env.DB,
      "INSERT INTO profiles (user_id, username, username_key, avatar, locale, show_online, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
      user.id,
      input.username,
      usernameSkeleton(input.username),
      input.avatar,
      input.locale,
      Date.now(),
    );
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) {
      const existing = await one(c.env.DB, "SELECT 1 AS ok FROM profiles WHERE user_id = ?", user.id);
      throw new ApiError(existing ? "profile_exists" : "username_taken");
    }
    throw e;
  }
  await securityEvent(c.env, "account.registered", { userId: user.id, ipHash: c.get("ipHash"), country: c.get("country") });
  return c.json({ ok: true }, 201);
});

meRoutes.patch("/me/profile", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "profile_update", user.id);
  const input = await readJson(c, updateProfileSchema);
  await run(
    c.env.DB,
    "UPDATE profiles SET avatar = COALESCE(?, avatar), locale = COALESCE(?, locale), show_online = COALESCE(?, show_online) WHERE user_id = ?",
    input.avatar ?? null,
    input.locale ?? null,
    input.showOnline === undefined ? null : input.showOnline ? 1 : 0,
    user.id,
  );
  return c.json({ ok: true });
});

/**
 * Account deletion: removes profile, social graph, sessions, notifications and MFA data and
 * strips identifiers from the user row. A tombstone row remains so that finished matches and
 * audit records keep referential integrity without personal data.
 */
meRoutes.delete("/me", authenticate, async (c) => {
  const { user, roles } = c.get("auth");
  await rateLimit(c, "auth", "account_delete", user.id);
  assertRecentAuth(c);
  if (roles.has("admin")) throw new ApiError("forbidden");
  const active = await one<{ room_id: string }>(c.env.DB, "SELECT room_id FROM room_members WHERE user_id = ? AND left_at IS NULL", user.id);
  if (active) {
    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(active.room_id));
    await stub.leave(user.id, "account_deleted");
  }
  const now = Date.now();
  await c.env.DB.batch([
    stmt(c.env.DB, "DELETE FROM profiles WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM friends WHERE user_a = ? OR user_b = ?", user.id, user.id),
    stmt(c.env.DB, "DELETE FROM friend_requests WHERE from_user = ? OR to_user = ?", user.id, user.id),
    stmt(c.env.DB, "DELETE FROM blocks WHERE blocker = ? OR blocked = ?", user.id, user.id),
    stmt(c.env.DB, "DELETE FROM notifications WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM invitations WHERE from_user = ? OR to_user = ?", user.id, user.id),
    stmt(c.env.DB, "DELETE FROM user_sessions WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM admin_mfa WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM admin_recovery_codes WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM admin_step_up WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM roles WHERE user_id = ?", user.id),
    stmt(c.env.DB, "DELETE FROM game_ratings WHERE user_id = ?", user.id),
    stmt(c.env.DB, "UPDATE room_members SET left_at = ? WHERE user_id = ? AND left_at IS NULL", now, user.id),
    stmt(
      c.env.DB,
      "UPDATE users SET status = 'deleted', email = NULL, firebase_uid = 'deleted:' || id, sessions_valid_after = ?, last_seen_at = ? WHERE id = ?",
      Math.floor(now / 1000) + 1,
      now,
      user.id,
    ),
  ]);
  await securityEvent(c.env, "account.deleted", { userId: user.id, ipHash: c.get("ipHash") });
  return c.json({ ok: true });
});

meRoutes.get("/me/sessions", authenticate, async (c) => {
  const { user, session } = c.get("auth");
  await rateLimit(c, "read", "sessions", user.id);
  const rows = await all<{ id: string; created_at: number; last_seen_at: number; provider: string; device: string; country: string | null; revoked_at: number | null; auth_time: number }>(
    c.env.DB,
    "SELECT id, created_at, last_seen_at, provider, device, country, revoked_at, auth_time FROM user_sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 30",
    user.id,
  );
  const items: SessionDto[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    provider: r.provider,
    device: r.device,
    country: r.country,
    current: r.id === session.id,
    revoked: r.revoked_at !== null || r.auth_time < user.sessions_valid_after,
  }));
  return c.json({ items });
});

meRoutes.post("/me/sessions/revoke", authenticate, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "session_revoke", user.id);
  const { sessionId } = await readJson(c, sessionRevokeSchema);
  // Ownership enforced in the WHERE clause (IDOR protection).
  const res = await run(c.env.DB, "UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL", Date.now(), sessionId, user.id);
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  await securityEvent(c.env, "session.revoked", { userId: user.id, ipHash: c.get("ipHash"), details: { sessionId } });
  return c.json({ ok: true });
});

meRoutes.post("/me/sessions/revoke-all", authenticate, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "session_revoke", user.id);
  const nowS = Math.floor(Date.now() / 1000) + 1;
  await c.env.DB.batch([
    stmt(c.env.DB, "UPDATE users SET sessions_valid_after = ? WHERE id = ?", nowS, user.id),
    stmt(c.env.DB, "UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", Date.now(), user.id),
    stmt(c.env.DB, "DELETE FROM admin_step_up WHERE user_id = ?", user.id),
  ]);
  await securityEvent(c.env, "session.revoked_all", { userId: user.id, ipHash: c.get("ipHash") });
  return c.json({ ok: true });
});

meRoutes.get("/me/login-history", authenticate, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "login_history", user.id);
  const items = await all<{ ts: number; kind: string; country: string | null }>(
    c.env.DB,
    "SELECT ts, kind, country FROM security_events WHERE user_id = ? AND kind LIKE 'login.%' ORDER BY ts DESC LIMIT 20",
    user.id,
  );
  return c.json({ items });
});

meRoutes.get("/me/active-game", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "active_game", user.id);
  const row = await one<{ room_id: string; role: string; seat: number | null; game_type: string; name: string; phase: string }>(
    c.env.DB,
    "SELECT m.room_id, m.role, m.seat, r.game_type, r.name, r.phase FROM room_members m JOIN rooms r ON r.id = m.room_id WHERE m.user_id = ? AND m.left_at IS NULL",
    user.id,
  );
  return c.json({ active: row ? { roomId: row.room_id, role: row.role, seat: row.seat, gameType: row.game_type, name: row.name, phase: row.phase } : null });
});

async function statsFor(db: D1Database, userId: string): Promise<PlayerStatsDto[]> {
  const rows = await all<{ game_type: string; rating: number; matches: number; wins: number; losses: number; draws: number; rated: number; rank: number | null }>(
    db,
    `SELECT g.game_type, g.rating, g.matches, g.wins, g.losses, g.draws, g.rated,
       CASE WHEN g.rated >= ? THEN (SELECT COUNT(*) + 1 FROM game_ratings o WHERE o.game_type = g.game_type AND o.rated >= ? AND o.rating > g.rating) END AS rank
     FROM game_ratings g WHERE g.user_id = ?`,
    LIMITS.rating.establishedMatches,
    LIMITS.rating.establishedMatches,
    userId,
  );
  const byType = new Map(rows.map((r) => [r.game_type, r]));
  return GAME_TYPES.map((t) => {
    const r = byType.get(t);
    return {
      gameType: t,
      rating: r?.rating ?? LIMITS.rating.initial,
      matches: r?.matches ?? 0,
      wins: r?.wins ?? 0,
      losses: r?.losses ?? 0,
      draws: r?.draws ?? 0,
      rank: r?.rank ?? null,
      established: (r?.rated ?? 0) >= LIMITS.rating.establishedMatches,
    };
  });
}

meRoutes.get("/me/stats", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "stats", user.id);
  return c.json({ items: await statsFor(c.env.DB, user.id) });
});

meRoutes.get("/me/matches", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "matches", user.id);
  const { limit, cursor } = parseOrThrow(paginationSchema, query(c));
  const after = decodeTimeCursor(cursor);
  const rows = await all<{ match_id: string; game_type: string; finished_at: number; placement: number; score: number; rating_delta: number | null; rated: number; players: number }>(
    c.env.DB,
    `SELECT mp.match_id, mp.game_type, mp.finished_at, mp.placement, mp.score, mp.rating_delta, gs.rated, gs.players
     FROM match_participants mp JOIN game_sessions gs ON gs.id = mp.match_id
     WHERE mp.user_id = ? AND (? IS NULL OR mp.finished_at < ? OR (mp.finished_at = ? AND mp.match_id < ?))
     ORDER BY mp.finished_at DESC, mp.match_id DESC LIMIT ?`,
    user.id,
    after ? 1 : null,
    after?.ts ?? 0,
    after?.ts ?? 0,
    after?.id ?? "",
    limit,
  );
  const items: MatchHistoryDto[] = rows.map((r) => ({
    matchId: r.match_id,
    gameType: r.game_type as MatchHistoryDto["gameType"],
    finishedAt: r.finished_at,
    placement: r.placement,
    players: r.players,
    score: r.score,
    ratingDelta: r.rating_delta,
    rated: r.rated === 1,
  }));
  const last = rows[rows.length - 1];
  return c.json({ items, nextCursor: rows.length === limit && last ? encodeTimeCursor(last.finished_at, last.match_id) : null });
});

meRoutes.get("/users/:id", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "user_profile", user.id);
  const id = c.req.param("id");
  if (!/^u_[A-Za-z0-9]{16,32}$/.test(id)) throw new ApiError("not_found");
  const blocked = await one(c.env.DB, "SELECT 1 AS ok FROM blocks WHERE blocker = ? AND blocked = ?", id, user.id);
  const target = blocked ? null : await publicUser(c.env.DB, id);
  if (!target) throw new ApiError("not_found");
  return c.json({ user: target, stats: await statsFor(c.env.DB, id) });
});
