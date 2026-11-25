import { Hono } from "hono";
import { isAllowedOrigin, randomId, sha256Hex } from "@croco/security";
import {
  createRoomSchema,
  GAME_CATALOG,
  joinRoomSchema,
  LIMITS,
  reportCreateSchema,
  roomListQuerySchema,
  usernameSkeleton,
  type GameType,
  type RoomSummary,
} from "@croco/shared";
import { allEngines } from "@croco/game-engine";
import { authenticate, requireProfile, requireVerified } from "../auth";
import { securityEvent } from "../audit";
import { all, decodeOffsetCursor, nextOffsetCursor, one, run, stmt } from "../db";
import type { AppEnv, Ctx } from "../http/context";
import { parseOrThrow, query, readJson } from "../http/app";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { lobbyStub } from "../notify";
import { getSettings } from "../settings";
import { publicUser } from "../users";

export const roomRoutes = new Hono<AppEnv>();

const ROOM_ID = /^r_[A-Za-z0-9]{16,32}$/;
function roomId(c: Ctx): string {
  const id = c.req.param("id");
  if (!id || !ROOM_ID.test(id)) throw new ApiError("not_found");
  return id;
}
const roomStub = (c: Ctx, id: string) => c.env.ROOM.get(c.env.ROOM.idFromName(id));

interface RoomRow {
  id: string;
  game_type: GameType;
  name: string;
  visibility: RoomSummary["visibility"];
  has_password: number;
  host_id: string;
  players: number;
  max_players: number;
  spectators: number;
  allow_spectators: number;
  phase: RoomSummary["phase"] | "closed";
  stage: string | null;
  created_at: number;
  host_username: string;
  host_avatar: string;
  host_admin: number;
  host_mod: number;
}

const ROOM_SELECT = `SELECT r.id, r.game_type, r.name, r.visibility, r.has_password, r.host_id, r.players, r.max_players, r.spectators,
  r.allow_spectators, r.phase, r.stage, r.created_at, p.username AS host_username, p.avatar AS host_avatar,
  EXISTS (SELECT 1 FROM roles x WHERE x.user_id = r.host_id AND x.role = 'admin') AS host_admin,
  EXISTS (SELECT 1 FROM roles x WHERE x.user_id = r.host_id AND x.role = 'moderator') AS host_mod
  FROM rooms r JOIN profiles p ON p.user_id = r.host_id`;

function toSummary(r: RoomRow): RoomSummary {
  return {
    id: r.id,
    gameType: r.game_type,
    name: r.name,
    visibility: r.visibility,
    hasPassword: r.has_password === 1,
    host: { id: r.host_id, username: r.host_username, avatar: r.host_avatar, badges: { admin: r.host_admin === 1, moderator: r.host_mod === 1 } },
    players: r.players,
    maxPlayers: r.max_players,
    phase: r.phase === "closed" ? "finished" : r.phase,
    stage: r.stage,
    allowSpectators: r.allow_spectators === 1,
    spectators: r.spectators,
    createdAt: r.created_at,
  };
}

/** Invite-only rooms are visible only to members and users holding a pending invitation. */
const ACCESS_CLAUSE = `(r.visibility <> 'invite'
  OR EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = ? AND m.left_at IS NULL)
  OR EXISTS (SELECT 1 FROM invitations i WHERE i.room_id = r.id AND i.to_user = ? AND i.status = 'pending' AND i.expires_at > ?))`;

roomRoutes.use("/rooms", authenticate, requireProfile);
roomRoutes.use("/rooms/*", async (c, next) => {
  // The WebSocket endpoint authenticates with a one-time ticket instead of a bearer token.
  if (c.req.path.endsWith("/ws")) return next();
  return authenticate(c, async () => {
    await requireProfile(c, next);
  });
});

roomRoutes.get("/rooms", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "rooms", user.id);
  const q = parseOrThrow(roomListQuerySchema, query(c));
  const offset = decodeOffsetCursor(q.cursor);
  const search = q.q ? usernameSkeleton(q.q) : null;
  const now = Date.now();
  const rows = await all<RoomRow>(
    c.env.DB,
    `${ROOM_SELECT}
     WHERE r.game_type = ? AND r.phase IN ('waiting', 'playing') AND ${ACCESS_CLAUSE}
       AND (? <> 'public' OR (r.visibility = 'public' AND r.has_password = 0))
       AND (? <> 'password' OR r.has_password = 1)
       AND (? <> 'invite' OR r.visibility = 'invite')
       AND (? <> 'waiting' OR r.phase = 'waiting')
       AND (? <> 'active' OR r.phase = 'playing')
       AND (? <> 'seats' OR (r.phase = 'waiting' AND r.players < r.max_players))
       AND (? IS NULL OR instr(r.name_key, ?) > 0 OR instr(p.username_key, ?) > 0)
     ORDER BY CASE r.phase WHEN 'waiting' THEN 0 ELSE 1 END, r.updated_at DESC
     LIMIT ? OFFSET ?`,
    q.gameType,
    user.id,
    user.id,
    now,
    q.filter,
    q.filter,
    q.filter,
    q.filter,
    q.filter,
    q.filter,
    search,
    search,
    search,
    q.limit,
    offset,
  );
  return c.json({ items: rows.map(toSummary), nextCursor: nextOffsetCursor(offset, q.limit, rows.length) });
});

roomRoutes.post("/rooms", requireVerified, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "room_create", user.id);
  const input = await readJson(c, createRoomSchema);
  const settings = await getSettings(c.env);
  if (!settings.roomCreationOpen) throw new ApiError("room_creation_closed");
  const info = GAME_CATALOG[input.gameType];
  if (input.maxPlayers < info.minPlayers || input.maxPlayers > info.maxPlayers) throw new ApiError("validation_failed", { maxPlayers: "out_of_range" });
  if (input.bots >= input.maxPlayers) throw new ApiError("validation_failed", { bots: "too_many" });
  if (input.visibility === "private" && !input.password) throw new ApiError("validation_failed", { password: "required" });
  const configCheck = allEngines[input.gameType].configSchema.safeParse(input.gameConfig);
  if (!configCheck.success) throw new ApiError("validation_failed", { gameConfig: "invalid" });

  const recent = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM rooms WHERE host_id = ? AND created_at > ?", user.id, Date.now() - 10 * 60_000);
  if ((recent?.n ?? 0) >= LIMITS.room.createdPer10Min) throw new ApiError("rate_limited", undefined);

  const id = randomId("r");
  const now = Date.now();
  try {
    await c.env.DB.batch([
      stmt(
        c.env.DB,
        "INSERT INTO rooms (id, game_type, name, name_key, visibility, has_password, host_id, players, max_players, spectators, allow_spectators, phase, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'waiting', ?, ?)",
        id,
        input.gameType,
        input.name,
        usernameSkeleton(input.name),
        input.visibility,
        input.password ? 1 : 0,
        user.id,
        1 + input.bots,
        input.maxPlayers,
        input.allowSpectators ? 1 : 0,
        now,
        now,
      ),
      stmt(c.env.DB, "INSERT INTO room_members (room_id, user_id, role, seat, joined_at) VALUES (?, ?, 'player', 0, ?)", id, user.id, now),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) throw new ApiError("already_in_room");
    throw e;
  }
  const host = (await publicUser(c.env.DB, user.id))!;
  const result = await roomStub(c, id).create({
    roomId: id,
    gameType: input.gameType,
    name: input.name,
    visibility: input.visibility,
    password: input.password ?? null,
    host,
    maxPlayers: input.maxPlayers,
    bots: input.bots,
    settings: {
      turnSeconds: input.turnSeconds,
      autoStart: input.autoStart,
      chatEnabled: input.chatEnabled,
      allowSpectators: input.allowSpectators,
      allowInvites: input.allowInvites,
      botDifficulty: input.botDifficulty,
      disconnectGraceMs: LIMITS.room.disconnectGraceMs.default,
      gameConfig: configCheck.data as Record<string, unknown>,
    },
  });
  if (!result.ok) {
    await c.env.DB.batch([stmt(c.env.DB, "DELETE FROM room_members WHERE room_id = ?", id), stmt(c.env.DB, "DELETE FROM rooms WHERE id = ?", id)]);
    throw new ApiError(result.error);
  }
  return c.json({ id }, 201);
});

roomRoutes.get("/rooms/:id", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "read", "room", user.id);
  const id = roomId(c);
  const row = await one<RoomRow>(c.env.DB, `${ROOM_SELECT} WHERE r.id = ? AND ${ACCESS_CLAUSE}`, id, user.id, user.id, Date.now());
  if (!row || row.phase === "closed") throw new ApiError("not_found");
  return c.json({ room: toSummary(row) });
});

roomRoutes.post("/rooms/:id/join", requireVerified, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "room_join", user.id);
  const id = roomId(c);
  const input = await readJson(c, joinRoomSchema);
  let inviteGrant = false;
  if (input.inviteCode) {
    const res = await run(
      c.env.DB,
      "UPDATE invite_links SET uses = uses + 1 WHERE code_hash = ? AND room_id = ? AND uses < max_uses AND expires_at > ?",
      await sha256Hex(input.inviteCode),
      id,
      Date.now(),
    );
    if (res.meta.changes !== 1) {
      await securityEvent(c.env, "room.invite_code_invalid", { userId: user.id, ipHash: c.get("ipHash"), details: { roomId: id } });
      throw new ApiError("forbidden");
    }
    inviteGrant = true;
  } else {
    const inv = await one<{ id: string }>(
      c.env.DB,
      "SELECT id FROM invitations WHERE room_id = ? AND to_user = ? AND status = 'pending' AND expires_at > ?",
      id,
      user.id,
      Date.now(),
    );
    if (inv) {
      inviteGrant = true;
      await run(c.env.DB, "UPDATE invitations SET status = 'accepted', responded_at = ? WHERE id = ?", Date.now(), inv.id);
    }
  }
  const me = (await publicUser(c.env.DB, user.id))!;
  const result = await roomStub(c, id).join(me, { password: input.password, inviteGrant, asSpectator: input.asSpectator ?? false });
  if (!result.ok) throw new ApiError(result.error);
  return c.json({ roomId: id, seat: result.seat });
});

roomRoutes.post("/rooms/:id/leave", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "room_leave", user.id);
  const result = await roomStub(c, roomId(c)).leave(user.id);
  if (!result.ok) throw new ApiError(result.error);
  return c.json({ ok: true });
});

roomRoutes.post("/rooms/:id/ticket", async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "ticket", "room_ticket", user.id);
  const result = await roomStub(c, roomId(c)).issueTicket(user.id);
  if (!result.ok) throw new ApiError(result.error);
  return c.json({ ticket: result.ticket, expiresIn: result.expiresIn });
});

function assertWsOrigin(c: Ctx): void {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") throw new ApiError("bad_request");
  if (!isAllowedOrigin(c.req.header("Origin"), c.get("config").allowedOrigins)) {
    c.executionCtx.waitUntil(securityEvent(c.env, "ws.rejected", { ipHash: c.get("ipHash"), details: { reason: "origin" } }));
    throw new ApiError("forbidden");
  }
}

roomRoutes.get("/rooms/:id/ws", async (c) => {
  assertWsOrigin(c);
  await rateLimit(c, "ticket", "ws_connect");
  return roomStub(c, roomId(c)).fetch(c.req.raw);
});

roomRoutes.post("/lobby/ticket", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "ticket", "lobby_ticket", user.id);
  return c.json(await lobbyStub(c.env).issueTicket(user.id));
});

roomRoutes.get("/lobby/ws", async (c) => {
  assertWsOrigin(c);
  await rateLimit(c, "ticket", "ws_connect");
  return lobbyStub(c.env).fetch(c.req.raw);
});

roomRoutes.post("/reports", authenticate, requireProfile, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "report", user.id);
  const input = await readJson(c, reportCreateSchema);
  if (input.targetUserId === user.id) throw new ApiError("bad_request");
  const today = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND created_at > ?", user.id, Date.now() - 86_400_000);
  if ((today?.n ?? 0) >= LIMITS.report.perDay) throw new ApiError("rate_limited");
  let snapshot: string | null = null;
  if (input.roomId && input.messageId) {
    const stub = roomStub(c, input.roomId);
    snapshot = await stub.chatSnapshot(user.id, input.messageId, input.targetUserId);
  }
  const id = randomId("rp");
  await run(
    c.env.DB,
    "INSERT INTO reports (id, reporter_id, target_id, room_id, message_id, message_snapshot, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    id,
    user.id,
    input.targetUserId,
    input.roomId ?? null,
    input.messageId ?? null,
    snapshot,
    input.reason,
    input.details ?? null,
    Date.now(),
  );
  return c.json({ id }, 201);
});
