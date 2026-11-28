import { decodeKey, parseAllowedOrigins } from "@croco/security";
import type { GameChatDO } from "./chat/GameChatDO";
import type { LobbyDO } from "./lobby/LobbyDO";
import type { RoomDO } from "./room/RoomDO";

export interface Env {
  DB: D1Database;
  ROOM: DurableObjectNamespace<RoomDO>;
  LOBBY: DurableObjectNamespace<LobbyDO>;
  /** One chat room per game type. */
  GAME_CHAT: DurableObjectNamespace<GameChatDO>;
  RL_AUTH?: RateLimit;
  RL_WRITE?: RateLimit;
  RL_READ?: RateLimit;
  RL_TICKET?: RateLimit;
  RL_IP?: RateLimit;
  ENVIRONMENT: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_AUTH_DOMAIN?: string;
  /**
   * Public Firebase web config (the same values every visitor's browser receives). Served by
   * /api/config/public so the deploy pipeline can build the site without keeping the key in Git
   * or in a GitHub variable. The API key is set with `wrangler secret put FIREBASE_WEB_API_KEY`.
   */
  FIREBASE_WEB_API_KEY?: string;
  FIREBASE_APP_ID?: string;
  ALLOWED_ORIGINS: string;
  // Secrets (wrangler secret put …)
  MFA_ENCRYPTION_KEY?: string;
  RECOVERY_CODE_PEPPER?: string;
  IP_HASH_KEY?: string;
  ADMIN_FIREBASE_UID?: string;
  ADMIN_BOOTSTRAP_EMAIL?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
}

export type Environment = "development" | "test" | "staging" | "demo" | "production";

export interface AppConfig {
  environment: Environment;
  projectId: string;
  allowedOrigins: string[];
  ipHashKey: string;
  admin: {
    enabled: boolean;
    firebaseUid: string | null;
    bootstrapEmail: string | null;
    mfaKey: Uint8Array | null;
    recoveryPepper: string | null;
  };
  turnstile: { secret: string; siteKey: string | null } | null;
}

export class ConfigError extends Error {}

const cache = new WeakMap<object, AppConfig | ConfigError>();

/**
 * Validates configuration once per isolate. Invalid configuration fails CLOSED: every request
 * gets a 503 rather than running with weakened security.
 */
export function loadConfig(env: Env): AppConfig {
  const cached = cache.get(env);
  if (cached instanceof ConfigError) throw cached;
  if (cached) return cached;
  try {
    const cfg = buildConfig(env);
    cache.set(env, cfg);
    return cfg;
  } catch (e) {
    const err = e instanceof ConfigError ? e : new ConfigError(String(e));
    cache.set(env, err);
    throw err;
  }
}

function buildConfig(env: Env): AppConfig {
  const environments: Environment[] = ["development", "test", "staging", "demo", "production"];
  if (!environments.includes(env.ENVIRONMENT as Environment)) throw new ConfigError("ENVIRONMENT is invalid");
  const environment = env.ENVIRONMENT as Environment;
  const deployed = environment === "staging" || environment === "demo" || environment === "production";
  if (!/^[a-z0-9-]{4,40}$/.test(env.FIREBASE_PROJECT_ID ?? "") || env.FIREBASE_PROJECT_ID.startsWith("REPLACE")) {
    throw new ConfigError("FIREBASE_PROJECT_ID is not configured");
  }
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (allowedOrigins.length === 0) throw new ConfigError("ALLOWED_ORIGINS is empty");
  if (deployed && allowedOrigins.some((o) => !o.startsWith("https://"))) {
    throw new ConfigError("Deployed environments only allow https origins");
  }
  if (deployed && (!env.IP_HASH_KEY || env.IP_HASH_KEY.length < 32)) throw new ConfigError("IP_HASH_KEY must be set (≥32 chars)");
  const ipHashKey = env.IP_HASH_KEY && env.IP_HASH_KEY.length >= 32 ? env.IP_HASH_KEY : "development-only-ip-hash-key-not-secret";

  // Admin features require every admin secret. Missing secrets disable admin features (fail closed).
  let mfaKey: Uint8Array | null = null;
  if (env.MFA_ENCRYPTION_KEY) {
    try {
      mfaKey = decodeKey(env.MFA_ENCRYPTION_KEY, 32);
    } catch {
      throw new ConfigError("MFA_ENCRYPTION_KEY must be 32 bytes, base64url encoded");
    }
  }
  const pepper = env.RECOVERY_CODE_PEPPER && env.RECOVERY_CODE_PEPPER.length >= 32 ? env.RECOVERY_CODE_PEPPER : null;
  const firebaseUid = env.ADMIN_FIREBASE_UID && /^[A-Za-z0-9_-]{1,128}$/.test(env.ADMIN_FIREBASE_UID) ? env.ADMIN_FIREBASE_UID : null;
  const bootstrapEmail = env.ADMIN_BOOTSTRAP_EMAIL && env.ADMIN_BOOTSTRAP_EMAIL.includes("@") ? env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase() : null;
  const adminEnabled = Boolean(mfaKey && pepper && firebaseUid && bootstrapEmail);

  return {
    environment,
    projectId: env.FIREBASE_PROJECT_ID,
    allowedOrigins,
    ipHashKey,
    admin: { enabled: adminEnabled, firebaseUid, bootstrapEmail, mfaKey, recoveryPepper: pepper },
    turnstile: env.TURNSTILE_SECRET ? { secret: env.TURNSTILE_SECRET, siteKey: env.TURNSTILE_SITE_KEY ?? null } : null,
  };
}
