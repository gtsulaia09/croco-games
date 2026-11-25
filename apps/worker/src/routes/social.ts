import { Hono } from "hono";
import { randomId, randomToken, sha256Hex } from "@croco/security";
import {
  blockCreateSchema,
  friendRequestCreateSchema,
  invitationCreateSchema,
  inviteLinkCreateSchema,
  LIMITS,
  notificationsReadSchema,
  paginationSchema,
  searchQuerySchema,
  usernameSkeleton,
  type FriendDto,
  type FriendRequestDto,
  type GameType,
  type InvitationDto,
  type NotificationDto,
  type PresenceStatus,
} from "@croco/shared";
import { authenticate, requireProfile, requireVerified } from "../auth";
import { all, decodeTimeCursor, encodeTimeCursor, one, run, stmt } from "../db";
import type { AppEnv, Ctx } from "../http/context";
import { parseOrThrow, query, readJson } from "../http/app";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { lobbyStub, notify } from "../notify";
import { areFriends, isBlockedEitherWay, publicUser, publicUsers, toPublicUser, type PublicUserRow } from "../users";

export const socialRoutes = new Hono<AppEnv>();
socialRoutes.use("/users/search", authenticate, requireProfile);
socialRoutes.use("/friends", authenticate, requireProfile);
socialRoutes.use("/friends/*", authenticate, requireProfile);
socialRoutes.use("/friend-requests", authenticate, requireProfile);
socialRoutes.use("/friend-requests/*", authenticate, requireProfile);
socialRoutes.use("/blocks", authenticate, requireProfile);
socialRoutes.use("/blocks/*", authenticate, requireProfile);
socialRoutes.use("/notifications", authenticate, requireProfile);
socialRoutes.use("/notifications/*", authenticate, requireProfile);
socialRoutes.use("/invitations", authenticate, requireProfile);
socialRoutes.use("/invitations/*", authenticate, requireProfile);
socialRoutes.use("/invite-links", authenticate, requireProfile);
socialRoutes.use("/invite-links/*", authenticate, requireProfile);
socialRoutes.use("/presence/*", authenticate, requireProfile);

const ID = /^[a-z]{1,3}_[A-Za-z0-9]{16,32}$/;
function idParam(value: string | undefined, prefix: string): string {
  if (!value || !ID.test(value) || !value.startsWith(`${prefix}_`)) throw new ApiError("not_found");
  return value;
}

socialRoutes.get("/users/search", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "user_search", user.id);
  const q = parseOrThrow(searchQuerySchema, query(c)["q"] ?? "");
  const prefix = usernameSkeleton(q);
  // Prefix search on the normalised key; users who blocked the caller are excluded.
  const rows = await all<PublicUserRow>(
    c.env.DB,
    `SELECT p.user_id AS id, p.username, p.avatar,
       EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'admin') AS is_admin,
       EXISTS (SELECT 1 FROM roles r WHERE r.user_id = p.user_id AND r.role = 'moderator') AS is_mod
     FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE p.username_key >= ? AND p.username_key < ? AND u.status = 'active' AND p.user_id <> ?
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker = p.user_id AND b.blocked = ?)
     ORDER BY p.username_key LIMIT ?`,
    prefix,
    `${prefix}\u{10FFFF}`,
    user.id,
    user.id,
    LIMITS.search.results,
  );
  return c.json({ items: rows.map(toPublicUser) });
});

async function presenceFor(c: { env: AppEnv["Bindings"] }, ids: string[]): Promise<Map<string, { status: PresenceStatus; roomId: string | null; gameType: string | null }>> {
  if (!ids.length) return new Map();
  try {
    const entries = await lobbyStub(c.env).presence(ids);
    return new Map(entries.map((e) => [e.userId, e]));
  } catch {
    return new Map();
  }
}

socialRoutes.get("/friends", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "friends", user.id);
  const rows = await all<{ friend: string; created_at: number; show_online: number }>(
    c.env.DB,
    `SELECT CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END AS friend, f.created_at, p.show_online
     FROM friends f JOIN profiles p ON p.user_id = (CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END)
     WHERE f.user_a = ? OR f.user_b = ? LIMIT ?`,
    user.id,
    user.id,
    user.id,
    user.id,
    LIMITS.social.maxFriends,
  );
  const users = await publicUsers(c.env.DB, rows.map((r) => r.friend));
  const presence = await presenceFor(c, rows.filter((r) => r.show_online === 1).map((r) => r.friend));
  const items: FriendDto[] = rows
    .filter((r) => users.has(r.friend))
    .map((r) => {
      const p = presence.get(r.friend);
      return {
        user: users.get(r.friend)!,
        status: p?.status ?? "offline",
        roomId: p?.roomId ?? null,
        gameType: (p?.gameType as GameType | null) ?? null,
        since: r.created_at,
      };
    });
  return c.json({ items });
});

socialRoutes.delete("/friends/:id", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "friend_remove", user.id);
  const other = idParam(c.req.param("id"), "u");
  const [a, b] = user.id < other ? [user.id, other] : [other, user.id];
  const res = await run(c.env.DB, "DELETE FROM friends WHERE user_a = ? AND user_b = ?", a, b);
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  return c.json({ ok: true });
});

socialRoutes.get("/friend-requests", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "friend_requests", user.id);
  const rows = await all<{ id: string; from_user: string; to_user: string; created_at: number; status: FriendRequestDto["status"] }>(
    c.env.DB,
    "SELECT id, from_user, to_user, created_at, status FROM friend_requests WHERE (from_user = ? OR to_user = ?) AND status = 'pending' ORDER BY created_at DESC LIMIT 100",
    user.id,
    user.id,
  );
  const users = await publicUsers(c.env.DB, rows.flatMap((r) => [r.from_user, r.to_user]));
  const items: FriendRequestDto[] = rows
    .filter((r) => users.has(r.from_user) && users.has(r.to_user))
    .map((r) => ({ id: r.id, from: users.get(r.from_user)!, to: users.get(r.to_user)!, createdAt: r.created_at, status: r.status }));
  return c.json({ incoming: items.filter((i) => i.to.id === user.id), outgoing: items.filter((i) => i.from.id === user.id) });
});

socialRoutes.post("/friend-requests", requireVerified, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "friend_request", user.id);
  const { toUserId } = await readJson(c, friendRequestCreateSchema);
  if (toUserId === user.id) throw new ApiError("bad_request");
  const target = await publicUser(c.env.DB, toUserId);
  // Blocked or unknown users look identical to the caller (no enumeration).
  if (!target || (await isBlockedEitherWay(c.env.DB, user.id, toUserId))) throw new ApiError("not_found");
  if (await areFriends(c.env.DB, user.id, toUserId)) throw new ApiError("already_friends");
  const pending = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM friend_requests WHERE from_user = ? AND status = 'pending'", user.id);
  if ((pending?.n ?? 0) >= LIMITS.social.maxPendingOutgoingRequests) throw new ApiError("rate_limited");
  // A reverse pending request is accepted instead of creating a duplicate.
  const reverse = await one<{ id: string }>(c.env.DB, "SELECT id FROM friend_requests WHERE from_user = ? AND to_user = ? AND status = 'pending'", toUserId, user.id);
  if (reverse) return acceptRequest(c, reverse.id);
  const id = randomId("fr");
  try {
    await run(c.env.DB, "INSERT INTO friend_requests (id, from_user, to_user, status, created_at) VALUES (?, ?, ?, 'pending', ?)", id, user.id, toUserId, Date.now());
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) throw new ApiError("request_pending");
    throw e;
  }
  const me = await publicUser(c.env.DB, user.id);
  c.executionCtx.waitUntil(notify(c.env, toUserId, "friend_request", me, { requestId: id }));
  return c.json({ id }, 201);
});

async function acceptRequest(c: Ctx, requestId: string) {
  const { user } = c.get("auth");
  const req = await one<{ from_user: string }>(c.env.DB, "SELECT from_user FROM friend_requests WHERE id = ? AND to_user = ? AND status = 'pending'", requestId, user.id);
  if (!req) throw new ApiError("not_found");
  if (await isBlockedEitherWay(c.env.DB, user.id, req.from_user)) throw new ApiError("not_found");
  const [a, b] = user.id < req.from_user ? [user.id, req.from_user] : [req.from_user, user.id];
  const now = Date.now();
  const results = await c.env.DB.batch([
    stmt(c.env.DB, "UPDATE friend_requests SET status = 'accepted', responded_at = ? WHERE id = ? AND to_user = ? AND status = 'pending'", now, requestId, user.id),
    stmt(c.env.DB, "INSERT OR IGNORE INTO friends (user_a, user_b, created_at) VALUES (?, ?, ?)", a, b, now),
  ]);
  if (results[0]!.meta.changes !== 1) throw new ApiError("conflict");
  const me = await publicUser(c.env.DB, user.id);
  c.executionCtx.waitUntil(notify(c.env, req.from_user, "friend_accepted", me, {}));
  return c.json({ ok: true });
}

socialRoutes.post("/friend-requests/:id/accept", requireVerified, async (c) => {
  await rateLimit(c, "write", "friend_request", c.get("auth").user.id);
  return acceptRequest(c, idParam(c.req.param("id"), "fr"));
});

socialRoutes.post("/friend-requests/:id/reject", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "friend_request", user.id);
  const res = await run(
    c.env.DB,
    "UPDATE friend_requests SET status = 'rejected', responded_at = ? WHERE id = ? AND to_user = ? AND status = 'pending'",
    Date.now(),
    idParam(c.req.param("id"), "fr"),
    user.id,
  );
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  return c.json({ ok: true });
});

socialRoutes.post("/friend-requests/:id/cancel", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "friend_request", user.id);
  const res = await run(
    c.env.DB,
    "UPDATE friend_requests SET status = 'cancelled', responded_at = ? WHERE id = ? AND from_user = ? AND status = 'pending'",
    Date.now(),
    idParam(c.req.param("id"), "fr"),
    user.id,
  );
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  return c.json({ ok: true });
});

socialRoutes.get("/blocks", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "blocks", user.id);
  const rows = await all<{ blocked: string }>(c.env.DB, "SELECT blocked FROM blocks WHERE blocker = ? ORDER BY created_at DESC LIMIT 200", user.id);
  const users = await publicUsers(c.env.DB, rows.map((r) => r.blocked));
  return c.json({ items: rows.map((r) => users.get(r.blocked)).filter(Boolean) });
});

socialRoutes.post("/blocks", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "block", user.id);
  const { userId } = await readJson(c, blockCreateSchema);
  if (userId === user.id) throw new ApiError("bad_request");
  if (!(await publicUser(c.env.DB, userId))) throw new ApiError("not_found");
  const [a, b] = user.id < userId ? [user.id, userId] : [userId, user.id];
  await c.env.DB.batch([
    stmt(c.env.DB, "INSERT OR IGNORE INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)", user.id, userId, Date.now()),
    stmt(c.env.DB, "DELETE FROM friends WHERE user_a = ? AND user_b = ?", a, b),
    stmt(c.env.DB, "UPDATE friend_requests SET status = 'cancelled', responded_at = ? WHERE status = 'pending' AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))", Date.now(), user.id, userId, userId, user.id),
    stmt(c.env.DB, "UPDATE invitations SET status = 'rejected', responded_at = ? WHERE status = 'pending' AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))", Date.now(), user.id, userId, userId, user.id),
  ]);
  return c.json({ ok: true }, 201);
});

socialRoutes.delete("/blocks/:id", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "block", user.id);
  const res = await run(c.env.DB, "DELETE FROM blocks WHERE blocker = ? AND blocked = ?", user.id, idParam(c.req.param("id"), "u"));
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  return c.json({ ok: true });
});

socialRoutes.get("/notifications", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "notifications", user.id);
  const { limit, cursor } = parseOrThrow(paginationSchema, query(c));
  const after = decodeTimeCursor(cursor);
  const rows = await all<{ id: string; kind: NotificationDto["kind"]; actor_id: string | null; data_json: string; created_at: number; read_at: number | null }>(
    c.env.DB,
    `SELECT id, kind, actor_id, data_json, created_at, read_at FROM notifications
     WHERE user_id = ? AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    user.id,
    after ? 1 : null,
    after?.ts ?? 0,
    after?.ts ?? 0,
    after?.id ?? "",
    limit,
  );
  const actors = await publicUsers(c.env.DB, rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x)));
  const unread = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id);
  const items: NotificationDto[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    createdAt: r.created_at,
    read: r.read_at !== null,
    ...(r.actor_id && actors.has(r.actor_id) ? { actor: actors.get(r.actor_id)! } : {}),
    data: JSON.parse(r.data_json) as NotificationDto["data"],
  }));
  const last = rows[rows.length - 1];
  return c.json({ items, unread: unread?.n ?? 0, nextCursor: rows.length === limit && last ? encodeTimeCursor(last.created_at, last.id) : null });
});

socialRoutes.post("/notifications/read", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "notifications_read", user.id);
  const input = await readJson(c, notificationsReadSchema);
  const now = Date.now();
  if ("all" in input) await run(c.env.DB, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", now, user.id);
  else await run(c.env.DB, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))", now, user.id, JSON.stringify(input.ids));
  return c.json({ ok: true });
});

socialRoutes.get("/invitations", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "invitations", user.id);
  const now = Date.now();
  await run(c.env.DB, "UPDATE invitations SET status = 'expired' WHERE to_user = ? AND status = 'pending' AND expires_at <= ?", user.id, now);
  const rows = await all<{ id: string; from_user: string; room_id: string; name: string; game_type: GameType; created_at: number; expires_at: number; status: InvitationDto["status"] }>(
    c.env.DB,
    `SELECT i.id, i.from_user, i.room_id, r.name, r.game_type, i.created_at, i.expires_at, i.status
     FROM invitations i JOIN rooms r ON r.id = i.room_id WHERE i.to_user = ? ORDER BY i.created_at DESC LIMIT 50`,
    user.id,
  );
  const users = await publicUsers(c.env.DB, rows.map((r) => r.from_user));
  const items: InvitationDto[] = rows
    .filter((r) => users.has(r.from_user))
    .map((r) => ({ id: r.id, from: users.get(r.from_user)!, room: { id: r.room_id, name: r.name, gameType: r.game_type }, createdAt: r.created_at, expiresAt: r.expires_at, status: r.status }));
  return c.json({ items });
});

socialRoutes.post("/invitations", requireVerified, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "invite", user.id);
  const { roomId, toUserId } = await readJson(c, invitationCreateSchema);
  if (toUserId === user.id) throw new ApiError("bad_request");
  if (!(await areFriends(c.env.DB, user.id, toUserId)) || (await isBlockedEitherWay(c.env.DB, user.id, toUserId))) throw new ApiError("forbidden");
  const member = await one(c.env.DB, "SELECT 1 AS ok FROM room_members WHERE room_id = ? AND user_id = ? AND left_at IS NULL", roomId, user.id);
  if (!member) throw new ApiError("not_in_room");
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
  const check = await stub.inviteCheck(user.id);
  if (!check.ok) throw new ApiError(check.error);
  const id = randomId("inv");
  const now = Date.now();
  await run(c.env.DB, "UPDATE invitations SET status = 'expired' WHERE room_id = ? AND to_user = ? AND status = 'pending' AND expires_at <= ?", roomId, toUserId, now);
  try {
    await run(
      c.env.DB,
      "INSERT INTO invitations (id, room_id, from_user, to_user, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      id,
      roomId,
      user.id,
      toUserId,
      now,
      now + LIMITS.room.inviteTtlMs,
    );
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) throw new ApiError("request_pending");
    throw e;
  }
  const me = await publicUser(c.env.DB, user.id);
  c.executionCtx.waitUntil(notify(c.env, toUserId, "game_invitation", me, { invitationId: id, roomId, roomName: check.name, gameType: check.gameType }));
  return c.json({ id }, 201);
});

socialRoutes.post("/invitations/:id/accept", requireVerified, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "join", user.id);
  const id = idParam(c.req.param("id"), "inv");
  const inv = await one<{ room_id: string; from_user: string; expires_at: number }>(
    c.env.DB,
    "SELECT room_id, from_user, expires_at FROM invitations WHERE id = ? AND to_user = ? AND status = 'pending'",
    id,
    user.id,
  );
  if (!inv) throw new ApiError("not_found");
  if (inv.expires_at <= Date.now()) {
    await run(c.env.DB, "UPDATE invitations SET status = 'expired' WHERE id = ?", id);
    throw new ApiError("invitation_expired");
  }
  const me = await publicUser(c.env.DB, user.id);
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(inv.room_id));
  const result = await stub.join(me!, { inviteGrant: true, asSpectator: false });
  if (!result.ok) throw new ApiError(result.error);
  await run(c.env.DB, "UPDATE invitations SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending'", Date.now(), id);
  c.executionCtx.waitUntil(notify(c.env, inv.from_user, "invitation_accepted", me, { roomId: inv.room_id }));
  return c.json({ roomId: inv.room_id, seat: result.seat });
});

socialRoutes.post("/invitations/:id/reject", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "invite", user.id);
  const res = await run(
    c.env.DB,
    "UPDATE invitations SET status = 'rejected', responded_at = ? WHERE id = ? AND to_user = ? AND status = 'pending'",
    Date.now(),
    idParam(c.req.param("id"), "inv"),
    user.id,
  );
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  return c.json({ ok: true });
});

socialRoutes.post("/invite-links", requireVerified, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "invite_link", user.id);
  const { roomId } = await readJson(c, inviteLinkCreateSchema);
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
  const check = await stub.inviteCheck(user.id, true);
  if (!check.ok) throw new ApiError(check.error);
  const code = randomToken(24);
  const now = Date.now();
  await run(
    c.env.DB,
    "INSERT INTO invite_links (code_hash, room_id, created_by, created_at, expires_at, uses, max_uses) VALUES (?, ?, ?, ?, ?, 0, ?)",
    await sha256Hex(code),
    roomId,
    user.id,
    now,
    now + LIMITS.room.inviteLinkTtlMs,
    LIMITS.room.inviteLinkMaxUses,
  );
  return c.json({ code, expiresAt: now + LIMITS.room.inviteLinkTtlMs }, 201);
});

socialRoutes.get("/invite-links/:code", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "invite_link_lookup", user.id);
  const code = c.req.param("code");
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(code)) throw new ApiError("not_found");
  const row = await one<{ room_id: string; name: string; game_type: string; host_id: string }>(
    c.env.DB,
    "SELECT l.room_id, r.name, r.game_type, r.host_id FROM invite_links l JOIN rooms r ON r.id = l.room_id WHERE l.code_hash = ? AND l.expires_at > ? AND l.uses < l.max_uses AND r.phase <> 'closed'",
    await sha256Hex(code),
    Date.now(),
  );
  if (!row) throw new ApiError("not_found");
  return c.json({ room: { id: row.room_id, name: row.name, gameType: row.game_type, host: await publicUser(c.env.DB, row.host_id) } });
});

socialRoutes.get("/presence/online", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "presence", user.id);
  const { limit } = parseOrThrow(paginationSchema, query(c));
  let online: Array<{ userId: string; status: PresenceStatus; roomId: string | null; gameType: string | null }>;
  try {
    online = await lobbyStub(c.env).listOnline(200);
  } catch {
    online = [];
  }
  const ids = online.map((o) => o.userId);
  const visible = new Set(
    (
      await all<{ user_id: string }>(
        c.env.DB,
        "SELECT p.user_id FROM profiles p WHERE p.show_online = 1 AND p.user_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker = p.user_id AND b.blocked = ?)",
        JSON.stringify(ids),
        user.id,
      )
    ).map((r) => r.user_id),
  );
  const users = await publicUsers(c.env.DB, [...visible]);
  const items = online
    .filter((o) => visible.has(o.userId) && users.has(o.userId))
    .slice(0, limit)
    .map((o) => ({ user: users.get(o.userId)!, status: o.status, gameType: o.gameType }));
  return c.json({ items, total: visible.size });
});
