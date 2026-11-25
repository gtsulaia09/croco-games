import { Hono } from "hono";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  randomToken,
  sha256Hex,
  totpKeyUri,
  totpSecretBase32,
  verifyTotp,
} from "@croco/security";
import {
  adminKickSchema,
  adminResolveSchema,
  adminRoleChangeSchema,
  adminSettingsSchema,
  adminSuspendSchema,
  LIMITS,
  PLATFORM_SETTING_KEYS,
  recoveryCodeSchema,
  sanitizeText,
  totpCodeSchema,
  usernameSkeleton,
} from "@croco/shared";
import { assertRecentAuth, authenticate, requireProfile, requireStaff } from "../auth";
import { appendAudit, securityEvent, verifyAuditChain } from "../audit";
import { all, decodeOffsetCursor, nextOffsetCursor, one, run, stmt } from "../db";
import type { AppEnv, Ctx } from "../http/context";
import { query, readJson } from "../http/app";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { lobbyStub } from "../notify";
import { getSettings, invalidateSettings } from "../settings";
import { publicUsers } from "../users";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("/admin/*", authenticate, requireProfile);

const staff = requireStaff(["admin", "moderator"]);
const adminOnly = requireStaff(["admin"]);
const TOTP_AAD = (userId: string) => `${userId}:totp:v1`;

function assertStaffRole(c: Ctx): void {
  const { roles } = c.get("auth");
  if (!roles.has("admin") && !roles.has("moderator")) throw new ApiError("forbidden");
  if (!c.get("config").admin.enabled) throw new ApiError("service_unavailable");
}

async function mfaFailuresRecently(c: Ctx): Promise<number> {
  const row = await one<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) AS n FROM security_events WHERE user_id = ? AND kind = 'admin.mfa_failed' AND ts > ?",
    c.get("auth").user.id,
    Date.now() - 15 * 60_000,
  );
  return row?.n ?? 0;
}

async function issueStepUp(c: Ctx): Promise<{ stepUpToken: string; expiresAt: number }> {
  const { user, token } = c.get("auth");
  const stepUpToken = randomToken(32);
  const now = Date.now();
  const expiresAt = now + LIMITS.admin.stepUpTtlMs;
  await c.env.DB.batch([
    stmt(c.env.DB, "DELETE FROM admin_step_up WHERE user_id = ? AND expires_at <= ?", user.id, now),
    stmt(c.env.DB, "INSERT INTO admin_step_up (token_hash, user_id, auth_time, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", await sha256Hex(stepUpToken), user.id, token.authTime, expiresAt, now),
  ]);
  return { stepUpToken, expiresAt };
}

const audit = (c: Ctx, action: string, targetType: string | null, targetId: string | null, details: Record<string, unknown> = {}) =>
  appendAudit(c.env, { actorId: c.get("auth").user.id, action, targetType, targetId, details, ipHash: c.get("ipHash") });

// ───────────────────────────── MFA ─────────────────────────────

adminRoutes.get("/admin/mfa/status", async (c) => {
  assertStaffRole(c);
  const row = await one<{ enrolled_at: number | null }>(c.env.DB, "SELECT enrolled_at FROM admin_mfa WHERE user_id = ?", c.get("auth").user.id);
  return c.json({ enrolled: Boolean(row?.enrolled_at), pending: Boolean(row && !row.enrolled_at) });
});

adminRoutes.post("/admin/mfa/enroll/start", async (c) => {
  assertStaffRole(c);
  const { user } = c.get("auth");
  await rateLimit(c, "auth", "mfa_enroll", user.id);
  assertRecentAuth(c);
  const existing = await one<{ enrolled_at: number | null }>(c.env.DB, "SELECT enrolled_at FROM admin_mfa WHERE user_id = ?", user.id);
  if (existing?.enrolled_at) throw new ApiError("conflict");
  const secret = generateTotpSecret();
  const blob = await aesGcmEncrypt(c.get("config").admin.mfaKey!, secret, TOTP_AAD(user.id));
  await run(
    c.env.DB,
    "INSERT INTO admin_mfa (user_id, secret_enc, key_version, enrolled_at, last_used_step, created_at) VALUES (?, ?, ?, NULL, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET secret_enc = excluded.secret_enc, key_version = excluded.key_version, created_at = excluded.created_at WHERE admin_mfa.enrolled_at IS NULL",
    user.id,
    blob.data,
    blob.keyVersion,
    Date.now(),
  );
  await audit(c, "mfa.enroll_started", "user", user.id);
  // The secret is shown exactly once for the authenticator app.
  return c.json({ otpauthUri: totpKeyUri("Croco Games", user.username ?? user.id, secret), secret: totpSecretBase32(secret) });
});

async function loadSecret(c: Ctx): Promise<{ secret: Uint8Array; lastStep: number | null; enrolled: boolean }> {
  const { user } = c.get("auth");
  const row = await one<{ secret_enc: string; last_used_step: number | null; enrolled_at: number | null }>(
    c.env.DB,
    "SELECT secret_enc, last_used_step, enrolled_at FROM admin_mfa WHERE user_id = ?",
    user.id,
  );
  if (!row) throw new ApiError("mfa_not_enrolled");
  const secret = await aesGcmDecrypt(c.get("config").admin.mfaKey!, row.secret_enc, TOTP_AAD(user.id));
  return { secret, lastStep: row.last_used_step, enrolled: row.enrolled_at !== null };
}

/** Verifies a TOTP code with attempt limiting and race-safe replay protection. */
async function checkTotp(c: Ctx, code: string, requireEnrolled: boolean): Promise<void> {
  const { user } = c.get("auth");
  if ((await mfaFailuresRecently(c)) >= LIMITS.admin.mfaFailuresPer15Min) throw new ApiError("rate_limited", undefined, { "Retry-After": "900" });
  const { secret, lastStep, enrolled } = await loadSecret(c);
  if (requireEnrolled && !enrolled) throw new ApiError("mfa_not_enrolled");
  const result = verifyTotp(secret, code, lastStep);
  if (!result.ok) {
    await securityEvent(c.env, "admin.mfa_failed", { userId: user.id, ipHash: c.get("ipHash"), details: { replay: result.replay } });
    throw new ApiError("mfa_invalid");
  }
  const update = await run(
    c.env.DB,
    "UPDATE admin_mfa SET last_used_step = ? WHERE user_id = ? AND (last_used_step IS NULL OR last_used_step < ?)",
    result.step,
    user.id,
    result.step,
  );
  if (update.meta.changes !== 1) {
    await securityEvent(c.env, "admin.mfa_failed", { userId: user.id, ipHash: c.get("ipHash"), details: { replay: true } });
    throw new ApiError("mfa_invalid");
  }
}

async function storeRecoveryCodes(c: Ctx, codes: string[]): Promise<void> {
  const { user } = c.get("auth");
  const pepper = c.get("config").admin.recoveryPepper!;
  const now = Date.now();
  await c.env.DB.batch([
    stmt(c.env.DB, "DELETE FROM admin_recovery_codes WHERE user_id = ?", user.id),
    ...(await Promise.all(
      codes.map(async (code) => stmt(c.env.DB, "INSERT INTO admin_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)", user.id, await hashRecoveryCode(pepper, code), now)),
    )),
  ]);
}

adminRoutes.post("/admin/mfa/enroll/confirm", async (c) => {
  assertStaffRole(c);
  const { user } = c.get("auth");
  await rateLimit(c, "auth", "mfa_verify", user.id);
  assertRecentAuth(c);
  const { code } = await readJson(c, totpCodeSchema);
  await checkTotp(c, code, false);
  await run(c.env.DB, "UPDATE admin_mfa SET enrolled_at = ? WHERE user_id = ? AND enrolled_at IS NULL", Date.now(), user.id);
  const codes = generateRecoveryCodes(LIMITS.admin.recoveryCodes);
  await storeRecoveryCodes(c, codes);
  await audit(c, "mfa.enrolled", "user", user.id);
  await securityEvent(c.env, "admin.mfa_enrolled", { userId: user.id, ipHash: c.get("ipHash") });
  return c.json({ recoveryCodes: codes, ...(await issueStepUp(c)) });
});

adminRoutes.post("/admin/mfa/verify", async (c) => {
  assertStaffRole(c);
  const { user } = c.get("auth");
  await rateLimit(c, "auth", "mfa_verify", user.id);
  const { code } = await readJson(c, totpCodeSchema);
  await checkTotp(c, code, true);
  await audit(c, "mfa.step_up", "user", user.id);
  return c.json(await issueStepUp(c));
});

adminRoutes.post("/admin/mfa/recover", async (c) => {
  assertStaffRole(c);
  const { user } = c.get("auth");
  await rateLimit(c, "auth", "mfa_verify", user.id);
  if ((await mfaFailuresRecently(c)) >= LIMITS.admin.mfaFailuresPer15Min) throw new ApiError("rate_limited", undefined, { "Retry-After": "900" });
  const { code } = await readJson(c, recoveryCodeSchema);
  const hash = await hashRecoveryCode(c.get("config").admin.recoveryPepper!, code);
  const res = await run(c.env.DB, "UPDATE admin_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL", Date.now(), user.id, hash);
  if (res.meta.changes !== 1) {
    await securityEvent(c.env, "admin.mfa_failed", { userId: user.id, ipHash: c.get("ipHash"), details: { recovery: true } });
    throw new ApiError("mfa_invalid");
  }
  await audit(c, "mfa.recovery_code_used", "user", user.id);
  await securityEvent(c.env, "admin.recovery_code_used", { userId: user.id, ipHash: c.get("ipHash") });
  return c.json(await issueStepUp(c));
});

adminRoutes.post("/admin/mfa/recovery-codes/regenerate", staff, async (c) => {
  await rateLimit(c, "auth", "mfa_regenerate", c.get("auth").user.id);
  assertRecentAuth(c);
  const codes = generateRecoveryCodes(LIMITS.admin.recoveryCodes);
  await storeRecoveryCodes(c, codes);
  await audit(c, "mfa.recovery_codes_regenerated", "user", c.get("auth").user.id);
  return c.json({ recoveryCodes: codes });
});

// ───────────────────────────── overview ─────────────────────────────

adminRoutes.get("/admin/overview", staff, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const now = Date.now();
  const [users, active, rooms, matches, reports, flags] = await c.env.DB.batch([
    stmt(c.env.DB, "SELECT COUNT(*) AS n FROM users WHERE status <> 'deleted'"),
    stmt(c.env.DB, "SELECT COUNT(*) AS n FROM users WHERE last_seen_at > ?", now - 86_400_000),
    stmt(c.env.DB, "SELECT phase, COUNT(*) AS n FROM rooms WHERE phase IN ('waiting', 'playing') GROUP BY phase"),
    stmt(c.env.DB, "SELECT game_type, COUNT(*) AS n FROM game_sessions WHERE finished_at > ? AND status = 'finished' GROUP BY game_type", now - 86_400_000),
    stmt(c.env.DB, "SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    stmt(c.env.DB, "SELECT COUNT(*) AS n FROM integrity_flags WHERE status = 'open'"),
  ]);
  let online: number;
  try {
    online = (await lobbyStub(c.env).listOnline(500)).length;
  } catch {
    online = 0;
  }
  const n = (r: D1Result | undefined) => (r?.results[0] as { n: number } | undefined)?.n ?? 0;
  return c.json({
    users: n(users),
    activeToday: n(active),
    online,
    rooms: Object.fromEntries((rooms!.results as Array<{ phase: string; n: number }>).map((r) => [r.phase, r.n])),
    matchesToday: Object.fromEntries((matches!.results as Array<{ game_type: string; n: number }>).map((r) => [r.game_type, r.n])),
    openReports: n(reports),
    openIntegrityFlags: n(flags),
  });
});

// ───────────────────────────── users ─────────────────────────────

adminRoutes.get("/admin/users", staff, async (c) => {
  const { user, roles } = c.get("auth");
  await rateLimit(c, "read", "admin", user.id);
  const q = query(c);
  const offset = decodeOffsetCursor(q["cursor"]);
  const search = q["q"] ? usernameSkeleton(sanitizeText(q["q"]).slice(0, 40)) : null;
  const rows = await all<{ id: string; username: string | null; email: string | null; status: string; created_at: number; last_seen_at: number; suspended_until: number | null; roles: string | null }>(
    c.env.DB,
    `SELECT u.id, p.username, u.email, u.status, u.created_at, u.last_seen_at, u.suspended_until,
       (SELECT group_concat(role) FROM roles r WHERE r.user_id = u.id) AS roles
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.status <> 'deleted' AND (? IS NULL OR instr(p.username_key, ?) > 0)
     ORDER BY u.created_at DESC LIMIT 50 OFFSET ?`,
    search,
    search,
    offset,
  );
  // Least privilege: moderators do not see email addresses.
  const showEmail = roles.has("admin");
  return c.json({
    items: rows.map((r) => ({ ...r, email: showEmail ? r.email : null, roles: r.roles ? r.roles.split(",") : [] })),
    nextCursor: nextOffsetCursor(offset, 50, rows.length),
  });
});

async function targetInfo(c: Ctx, id: string): Promise<{ id: string; isAdmin: boolean; roomId: string | null }> {
  if (!/^u_[A-Za-z0-9]{16,32}$/.test(id)) throw new ApiError("not_found");
  const row = await one<{ id: string; is_admin: number; room_id: string | null }>(
    c.env.DB,
    "SELECT u.id, EXISTS (SELECT 1 FROM roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin, (SELECT room_id FROM room_members m WHERE m.user_id = u.id AND m.left_at IS NULL) AS room_id FROM users u WHERE u.id = ? AND u.status <> 'deleted'",
    id,
  );
  if (!row) throw new ApiError("not_found");
  return { id: row.id, isAdmin: row.is_admin === 1, roomId: row.room_id };
}

adminRoutes.post("/admin/users/:id/suspend", staff, async (c) => {
  const { user, roles } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  const target = await targetInfo(c, c.req.param("id"));
  const input = await readJson(c, adminSuspendSchema);
  if (target.id === user.id || target.isAdmin) throw new ApiError("forbidden");
  if (!roles.has("admin") && input.days > LIMITS.admin.moderatorMaxSuspendDays) throw new ApiError("forbidden");
  const until = Date.now() + input.days * 86_400_000;
  await run(
    c.env.DB,
    "UPDATE users SET status = 'suspended', suspended_until = ?, suspension_reason = ?, sessions_valid_after = ? WHERE id = ?",
    until,
    input.reason,
    Math.floor(Date.now() / 1000) + 1,
    target.id,
  );
  if (target.roomId) await c.env.ROOM.get(c.env.ROOM.idFromName(target.roomId)).adminKick(target.id);
  await audit(c, "user.suspended", "user", target.id, { days: input.days, reason: input.reason });
  return c.json({ ok: true, until });
});

adminRoutes.post("/admin/users/:id/unsuspend", staff, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  const target = await targetInfo(c, c.req.param("id"));
  await run(c.env.DB, "UPDATE users SET status = 'active', suspended_until = NULL, suspension_reason = NULL WHERE id = ? AND status = 'suspended'", target.id);
  await audit(c, "user.unsuspended", "user", target.id);
  return c.json({ ok: true });
});

adminRoutes.post("/admin/users/:id/revoke-sessions", staff, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  const target = await targetInfo(c, c.req.param("id"));
  if (target.isAdmin && target.id !== user.id) throw new ApiError("forbidden");
  await c.env.DB.batch([
    stmt(c.env.DB, "UPDATE users SET sessions_valid_after = ? WHERE id = ?", Math.floor(Date.now() / 1000) + 1, target.id),
    stmt(c.env.DB, "DELETE FROM admin_step_up WHERE user_id = ?", target.id),
  ]);
  await audit(c, "user.sessions_revoked", "user", target.id);
  return c.json({ ok: true });
});

adminRoutes.post("/admin/users/:id/roles", adminOnly, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  assertRecentAuth(c);
  const target = await targetInfo(c, c.req.param("id"));
  if (target.id === user.id) throw new ApiError("forbidden");
  const input = await readJson(c, adminRoleChangeSchema);
  if (input.action === "grant") {
    await run(c.env.DB, "INSERT OR IGNORE INTO roles (user_id, role, granted_by, granted_at) VALUES (?, 'moderator', ?, ?)", target.id, user.id, Date.now());
  } else {
    await run(c.env.DB, "DELETE FROM roles WHERE user_id = ? AND role = 'moderator'", target.id);
  }
  // Session rotation on privilege change: the target must sign in again.
  await c.env.DB.batch([
    stmt(c.env.DB, "UPDATE users SET sessions_valid_after = ? WHERE id = ?", Math.floor(Date.now() / 1000) + 1, target.id),
    stmt(c.env.DB, "DELETE FROM admin_step_up WHERE user_id = ?", target.id),
  ]);
  await audit(c, `role.${input.action}`, "user", target.id, { role: input.role });
  await securityEvent(c.env, "privilege.changed", { userId: target.id, details: { role: input.role, action: input.action, by: user.id } });
  return c.json({ ok: true });
});

// ───────────────────────────── realtime monitoring ─────────────────────────────

adminRoutes.get("/admin/online", staff, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const online = await lobbyStub(c.env).listOnline(500);
  const users = await publicUsers(c.env.DB, online.map((o) => o.userId));
  return c.json({ items: online.filter((o) => users.has(o.userId)).map((o) => ({ user: users.get(o.userId), status: o.status, roomId: o.roomId, gameType: o.gameType })) });
});

adminRoutes.get("/admin/rooms", staff, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const rows = await all<{ id: string; game_type: string; name: string; visibility: string; host_id: string; players: number; max_players: number; phase: string; stage: string | null; updated_at: number }>(
    c.env.DB,
    "SELECT id, game_type, name, visibility, host_id, players, max_players, phase, stage, updated_at FROM rooms WHERE phase IN ('waiting', 'playing') ORDER BY updated_at DESC LIMIT 100",
  );
  return c.json({ items: rows });
});

adminRoutes.post("/admin/rooms/:id/kick", staff, async (c) => {
  await rateLimit(c, "write", "admin_write", c.get("auth").user.id);
  const roomId = c.req.param("id");
  if (!/^r_[A-Za-z0-9]{16,32}$/.test(roomId)) throw new ApiError("not_found");
  const input = await readJson(c, adminKickSchema);
  const target = await targetInfo(c, input.userId);
  if (target.isAdmin) throw new ApiError("forbidden");
  const res = await c.env.ROOM.get(c.env.ROOM.idFromName(roomId)).adminKick(input.userId);
  if (!res.ok) throw new ApiError(res.error);
  await audit(c, "room.kick", "room", roomId, { userId: input.userId, reason: input.reason });
  return c.json({ ok: true });
});

adminRoutes.post("/admin/rooms/:id/close", staff, async (c) => {
  await rateLimit(c, "write", "admin_write", c.get("auth").user.id);
  const roomId = c.req.param("id");
  if (!/^r_[A-Za-z0-9]{16,32}$/.test(roomId)) throw new ApiError("not_found");
  const res = await c.env.ROOM.get(c.env.ROOM.idFromName(roomId)).adminClose();
  if (!res.ok) throw new ApiError(res.error);
  await audit(c, "room.close", "room", roomId);
  return c.json({ ok: true });
});

// ───────────────────────────── reports & integrity ─────────────────────────────

adminRoutes.get("/admin/reports", staff, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const status = query(c)["status"] === "closed" ? "closed" : "open";
  const rows = await all<{ id: string; reporter_id: string | null; target_id: string | null; room_id: string | null; message_snapshot: string | null; reason: string; details: string | null; status: string; created_at: number; note: string | null }>(
    c.env.DB,
    "SELECT id, reporter_id, target_id, room_id, message_snapshot, reason, details, status, created_at, note FROM reports WHERE (? = 'open' AND status = 'open') OR (? = 'closed' AND status <> 'open') ORDER BY created_at DESC LIMIT 100",
    status,
    status,
  );
  const users = await publicUsers(c.env.DB, rows.flatMap((r) => [r.reporter_id, r.target_id]).filter((x): x is string => Boolean(x)));
  return c.json({ items: rows.map((r) => ({ ...r, reporter: r.reporter_id ? users.get(r.reporter_id) ?? null : null, target: r.target_id ? users.get(r.target_id) ?? null : null })) });
});

adminRoutes.post("/admin/reports/:id/resolve", staff, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  const id = c.req.param("id");
  if (!/^rp_[A-Za-z0-9]{16,32}$/.test(id)) throw new ApiError("not_found");
  const input = await readJson(c, adminResolveSchema);
  const res = await run(c.env.DB, "UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ?, note = ? WHERE id = ? AND status = 'open'", input.resolution, user.id, Date.now(), input.note, id);
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  await audit(c, "report.resolved", "report", id, { resolution: input.resolution });
  return c.json({ ok: true });
});

adminRoutes.get("/admin/integrity", staff, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const rows = await all<{ id: string; match_id: string | null; user_id: string | null; kind: string; details_json: string; status: string; created_at: number }>(
    c.env.DB,
    "SELECT id, match_id, user_id, kind, details_json, status, created_at FROM integrity_flags ORDER BY (status = 'open') DESC, created_at DESC LIMIT 100",
  );
  const users = await publicUsers(c.env.DB, rows.map((r) => r.user_id).filter((x): x is string => Boolean(x)));
  return c.json({ items: rows.map((r) => ({ ...r, details: JSON.parse(r.details_json), user: r.user_id ? users.get(r.user_id) ?? null : null })) });
});

adminRoutes.post("/admin/integrity/:id/resolve", staff, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  const id = c.req.param("id");
  if (!/^if_[A-Za-z0-9]{16,32}$/.test(id)) throw new ApiError("not_found");
  const input = await readJson(c, adminResolveSchema);
  const res = await run(c.env.DB, "UPDATE integrity_flags SET status = ?, resolved_by = ?, resolved_at = ?, note = ? WHERE id = ? AND status = 'open'", input.resolution, user.id, Date.now(), input.note, id);
  if (res.meta.changes !== 1) throw new ApiError("not_found");
  await audit(c, "integrity.resolved", "integrity_flag", id, { resolution: input.resolution });
  return c.json({ ok: true });
});

// ───────────────────────────── audit & security events ─────────────────────────────

adminRoutes.get("/admin/audit", adminOnly, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const before = Number.parseInt(query(c)["before"] ?? "0", 10);
  const rows = await all<{ id: number; ts: number; actor_id: string; action: string; target_type: string | null; target_id: string | null; details_json: string; hash: string }>(
    c.env.DB,
    "SELECT id, ts, actor_id, action, target_type, target_id, details_json, hash FROM admin_audit_logs WHERE (? = 0 OR id < ?) ORDER BY id DESC LIMIT 100",
    Number.isFinite(before) && before > 0 ? before : 0,
    Number.isFinite(before) && before > 0 ? before : 0,
  );
  return c.json({ items: rows.map((r) => ({ ...r, details: JSON.parse(r.details_json) })) });
});

adminRoutes.get("/admin/audit/verify", adminOnly, async (c) => {
  await rateLimit(c, "auth", "audit_verify", c.get("auth").user.id);
  return c.json(await verifyAuditChain(c.env));
});

adminRoutes.get("/admin/security-events", adminOnly, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  const kind = query(c)["kind"];
  const safeKind = kind && /^[a-z_.]{3,40}$/.test(kind) ? kind : null;
  const rows = await all<{ id: number; ts: number; kind: string; user_id: string | null; country: string | null; details_json: string }>(
    c.env.DB,
    "SELECT id, ts, kind, user_id, country, details_json FROM security_events WHERE (? IS NULL OR kind = ?) ORDER BY id DESC LIMIT 100",
    safeKind,
    safeKind,
  );
  return c.json({ items: rows.map((r) => ({ ...r, details: JSON.parse(r.details_json) })) });
});

// ───────────────────────────── settings ─────────────────────────────

adminRoutes.get("/admin/settings", adminOnly, async (c) => {
  await rateLimit(c, "read", "admin", c.get("auth").user.id);
  return c.json({ settings: await getSettings(c.env, true) });
});

adminRoutes.put("/admin/settings", adminOnly, async (c) => {
  const { user } = c.get("auth");
  await rateLimit(c, "write", "admin_write", user.id);
  assertRecentAuth(c);
  const input = await readJson(c, adminSettingsSchema);
  const before = await getSettings(c.env, true);
  const now = Date.now();
  await c.env.DB.batch(
    PLATFORM_SETTING_KEYS.map((key) =>
      stmt(
        c.env.DB,
        "INSERT INTO platform_settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
        key,
        JSON.stringify(input[key]),
        user.id,
        now,
      ),
    ),
  );
  invalidateSettings();
  await audit(c, "settings.updated", "settings", null, { before, after: input });
  return c.json({ settings: input });
});

