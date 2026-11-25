import type { MiddlewareHandler } from "hono";
import { isIdentityVerified, randomId, sha256Hex, TokenVerificationError, verifyFirebaseIdToken } from "@croco/security";
import { LIMITS } from "@croco/shared";
import { appendAudit, securityEvent } from "./audit";
import { one, run, stmt } from "./db";
import type { AppEnv, AuthState, Ctx, Role, SessionRow, UserRow } from "./http/context";
import { ApiError } from "./http/errors";

const USER_SELECT = `SELECT u.id, u.firebase_uid, u.email, u.sign_in_provider, u.status, u.suspended_until,
  u.sessions_valid_after, u.created_at, u.last_seen_at, p.username, p.avatar, p.locale, p.show_online,
  p.created_at AS profile_created_at
  FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.firebase_uid = ?`;

const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60_000;

/** Coarse, non-identifying device label (no raw User-Agent is stored). */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  return `${browser} · ${os}`;
}

function bearer(c: Ctx): string {
  const header = c.req.header("Authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header);
  if (!m) throw new ApiError("unauthenticated");
  return m[1]!;
}

async function maybeBootstrapAdmin(c: Ctx, state: AuthState): Promise<void> {
  const admin = c.get("config").admin;
  if (!admin.enabled || state.roles.has("admin")) return;
  if (state.token.uid !== admin.firebaseUid) return;
  // The bootstrap identity must match BOTH the configured UID and a verified email.
  if (!state.token.emailVerified || (state.token.email ?? "").toLowerCase() !== admin.bootstrapEmail) {
    await securityEvent(c.env, "admin.bootstrap_rejected", { userId: state.user.id, ipHash: c.get("ipHash"), details: { reason: "email_mismatch_or_unverified" } });
    return;
  }
  const res = await run(c.env.DB, "INSERT OR IGNORE INTO roles (user_id, role, granted_by, granted_at) VALUES (?, 'admin', 'bootstrap', ?)", state.user.id, Date.now());
  if (res.meta.changes === 1) {
    state.roles.add("admin");
    await appendAudit(c.env, { actorId: state.user.id, action: "admin.bootstrap", targetType: "user", targetId: state.user.id, ipHash: c.get("ipHash") });
    await securityEvent(c.env, "privilege.granted", { userId: state.user.id, details: { role: "admin", via: "bootstrap" } });
  }
}

/**
 * Verifies the Firebase ID token, provisions the internal user record, enforces account status,
 * application-level session revocation and records the session (device) for visibility.
 */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const config = c.get("config");
  const raw = bearer(c);
  let token;
  try {
    token = await verifyFirebaseIdToken(raw, { projectId: config.projectId });
  } catch (e) {
    if (e instanceof TokenVerificationError) {
      c.executionCtx.waitUntil(securityEvent(c.env, "auth.invalid_token", { ipHash: c.get("ipHash"), details: { code: e.code } }));
      throw new ApiError(e.code === "expired" ? "token_expired" : "unauthenticated");
    }
    throw e;
  }

  const now = Date.now();
  const [userRes, sessionRes, rolesRes] = await c.env.DB.batch([
    stmt(c.env.DB, USER_SELECT, token.uid),
    stmt(c.env.DB, "SELECT s.id, s.user_id, s.auth_time, s.last_seen_at, s.revoked_at, s.country FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE u.firebase_uid = ? AND s.auth_time = ?", token.uid, token.authTime),
    stmt(c.env.DB, "SELECT r.role FROM roles r JOIN users u ON u.id = r.user_id WHERE u.firebase_uid = ?", token.uid),
  ]);
  let user = (userRes!.results[0] as UserRow | undefined) ?? null;
  let session = (sessionRes!.results[0] as SessionRow | undefined) ?? null;
  const roles = new Set<Role>((rolesRes!.results as Array<{ role: Role }>).map((r) => r.role));

  if (!user) {
    await run(
      c.env.DB,
      "INSERT OR IGNORE INTO users (id, firebase_uid, email, sign_in_provider, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
      randomId("u"),
      token.uid,
      token.email,
      token.signInProvider,
      now,
      now,
    );
    user = await one<UserRow>(c.env.DB, USER_SELECT, token.uid);
    if (!user) throw new ApiError("internal_error");
  }

  if (user.status === "deleted") throw new ApiError("unauthenticated");
  if (user.status === "suspended") {
    if (user.suspended_until !== null && user.suspended_until <= now) {
      await run(c.env.DB, "UPDATE users SET status = 'active', suspended_until = NULL, suspension_reason = NULL WHERE id = ?", user.id);
      user.status = "active";
    } else {
      throw new ApiError("account_suspended", user.suspended_until ? { until: String(user.suspended_until) } : undefined);
    }
  }

  // Application-level revocation ("log out everywhere", admin revocation, privilege changes).
  if (token.authTime < user.sessions_valid_after) throw new ApiError("session_revoked");
  if (session?.revoked_at) throw new ApiError("session_revoked");

  const country = c.get("country");
  if (!session) {
    const id = randomId("s");
    await run(
      c.env.DB,
      "INSERT OR IGNORE INTO user_sessions (id, user_id, auth_time, provider, device, country, ip_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      user.id,
      token.authTime,
      token.signInProvider,
      deviceLabel(c.req.header("User-Agent") ?? null),
      country,
      c.get("ipHash"),
      now,
      now,
    );
    session = { id, user_id: user.id, auth_time: token.authTime, last_seen_at: now, revoked_at: null, country };
    // Suspicious login signal: a new session from a country never seen for this account.
    const seen = country
      ? await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND country = ? AND id <> ?", user.id, country, id)
      : null;
    const priorSessions = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND id <> ?", user.id, id);
    c.executionCtx.waitUntil(
      securityEvent(c.env, seen && seen.n === 0 && (priorSessions?.n ?? 0) > 0 ? "login.new_country" : "login.new_session", {
        userId: user.id,
        ipHash: c.get("ipHash"),
        country,
        details: { provider: token.signInProvider },
      }),
    );
  } else if (now - session.last_seen_at > LAST_SEEN_WRITE_INTERVAL_MS) {
    c.executionCtx.waitUntil(
      c.env.DB.batch([
        stmt(c.env.DB, "UPDATE user_sessions SET last_seen_at = ? WHERE id = ?", now, session.id),
        stmt(c.env.DB, "UPDATE users SET last_seen_at = ? WHERE id = ?", now, user.id),
      ]),
    );
  }

  const state: AuthState = { token, user, session, roles, identityVerified: isIdentityVerified(token) };
  await maybeBootstrapAdmin(c, state);
  c.set("auth", state);
  await next();
};

export const requireProfile: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("auth").user.username) throw new ApiError("profile_required");
  await next();
};

/** Social and multiplayer writes need a verified identity (provider-verified or verified email). */
export const requireVerified: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("auth").identityVerified) throw new ApiError("email_not_verified");
  await next();
};

export function assertRecentAuth(c: Ctx): void {
  const auth = c.get("auth");
  if (Date.now() - auth.token.authTime * 1000 > LIMITS.admin.recentAuthMs) throw new ApiError("recent_auth_required");
}

/**
 * Privileged routes: role from D1 + enrolled MFA + a valid step-up token bound to this
 * user and this sign-in session. Fails closed when admin secrets are not configured.
 */
export function requireStaff(allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    const config = c.get("config");
    if (!allowed.some((r) => auth.roles.has(r))) {
      c.executionCtx.waitUntil(securityEvent(c.env, "admin.denied", { userId: auth.user.id, ipHash: c.get("ipHash"), details: { path: new URL(c.req.url).pathname } }));
      throw new ApiError("forbidden");
    }
    if (!config.admin.enabled) throw new ApiError("service_unavailable");
    const mfa = await one<{ enrolled_at: number | null }>(c.env.DB, "SELECT enrolled_at FROM admin_mfa WHERE user_id = ?", auth.user.id);
    if (!mfa?.enrolled_at) throw new ApiError("mfa_not_enrolled");
    const stepUp = c.req.header("X-Admin-Step-Up");
    if (!stepUp || !/^[A-Za-z0-9_-]{40,64}$/.test(stepUp)) throw new ApiError("step_up_required");
    const row = await one<{ user_id: string }>(
      c.env.DB,
      "SELECT user_id FROM admin_step_up WHERE token_hash = ? AND user_id = ? AND auth_time = ? AND expires_at > ?",
      await sha256Hex(stepUp),
      auth.user.id,
      auth.token.authTime,
      Date.now(),
    );
    if (!row) throw new ApiError("step_up_required");
    await next();
  };
}
