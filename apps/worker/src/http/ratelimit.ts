import { SlidingWindowCounter } from "@croco/security";
import type { Env } from "../env";
import { ApiError } from "./errors";
import { securityEvent } from "../audit";
import type { Ctx } from "./context";

export type Bucket = "auth" | "write" | "read" | "ticket" | "ip";

const BINDINGS: Record<Bucket, keyof Env> = {
  auth: "RL_AUTH",
  write: "RL_WRITE",
  read: "RL_READ",
  ticket: "RL_TICKET",
  ip: "RL_IP",
};

/** Same limits as wrangler.toml — used when the binding is unavailable (local tests). */
const FALLBACK_LIMITS: Record<Bucket, number> = { auth: 10, write: 40, read: 180, ticket: 20, ip: 900 };
const fallback = new Map<Bucket, SlidingWindowCounter>();

async function check(env: Env, bucket: Bucket, key: string): Promise<boolean> {
  const binding = env[BINDINGS[bucket]] as RateLimit | undefined;
  if (binding) {
    try {
      const { success } = await binding.limit({ key });
      return success;
    } catch {
      // Fall through to the in-isolate limiter rather than failing open.
    }
  }
  let counter = fallback.get(bucket);
  if (!counter) {
    counter = new SlidingWindowCounter(FALLBACK_LIMITS[bucket], 60_000);
    fallback.set(bucket, counter);
  }
  if (counter.isLimited(key)) return false;
  counter.hit(key);
  return true;
}

/**
 * Rate-limits by a stable key (user id where available). IP-only limits are deliberately
 * generous so that a whole office behind one NAT address is not blocked.
 */
export async function rateLimit(c: Ctx, bucket: Bucket, scope: string, subject?: string): Promise<void> {
  const key = `${scope}:${subject ?? `ip:${c.get("ipHash")}`}`;
  if (await check(c.env, bucket, key)) return;
  c.executionCtx.waitUntil(
    securityEvent(c.env, "ratelimit.exceeded", { userId: subject?.startsWith("u_") ? subject : null, ipHash: c.get("ipHash"), details: { bucket, scope } }),
  );
  throw new ApiError("rate_limited", undefined, { "Retry-After": "60" });
}

/** Test helper: clears in-isolate fallback counters. */
export function resetFallbackLimits(): void {
  fallback.clear();
}
