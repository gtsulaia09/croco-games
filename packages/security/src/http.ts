/**
 * HTTP perimeter helpers shared by the Worker and the static-site header generator.
 */

/** Exact-match origin allowlist. Never reflects arbitrary origins and never allows `*`. */
export function parseAllowedOrigins(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((o) => o.trim())
    .filter((o) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(o));
}

export function isAllowedOrigin(origin: string | null | undefined, allowlist: readonly string[]): boolean {
  if (!origin) return false;
  return allowlist.includes(origin);
}

/** Security headers for JSON API responses. */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Resource-Policy": "same-site",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

export interface SpaCspOptions {
  apiOrigin: string;
  firebaseAuthDomain: string;
  turnstile: boolean;
}

/**
 * Content-Security-Policy for the SPA. No 'unsafe-inline' scripts, no 'unsafe-eval'.
 * Firebase Auth popups need its auth domain (frame) and Google's API loader (script).
 */
export function spaContentSecurityPolicy(opts: SpaCspOptions): string {
  const api = new URL(opts.apiOrigin);
  const wsOrigin = `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`;
  const scriptSrc = ["'self'", "https://apis.google.com"];
  const frameSrc = [`https://${opts.firebaseAuthDomain}`];
  if (opts.turnstile) {
    scriptSrc.push("https://challenges.cloudflare.com");
    frameSrc.push("https://challenges.cloudflare.com");
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api.origin} ${wsOrigin} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com`,
    `frame-src ${frameSrc.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const SENSITIVE_KEYS = /^(authorization|password|pass|token|idtoken|ticket|secret|code|cookie|set-cookie|stepup|x-admin-step-up|recovery.*|totp.*)$/i;

/** Deep-redacts values of sensitive keys before logging. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    // Strip anything that looks like a JWT or bearer token embedded in free text.
    return value
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[jwt]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .slice(0, 2000);
  }
  return value;
}

/** In-memory token bucket used inside Durable Objects for per-connection limits. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(cost = 1, now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Sliding-window counter used for exact, low-volume limits (e.g. room password attempts). */
export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  count(key: string, now = Date.now()): number {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length) this.hits.set(key, arr);
    else this.hits.delete(key);
    return arr.length;
  }

  isLimited(key: string, now = Date.now()): boolean {
    return this.count(key, now) >= this.limit;
  }

  hit(key: string, now = Date.now()): void {
    if (this.hits.size >= this.maxKeys && !this.hits.has(key)) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    arr.push(now);
    this.hits.set(key, arr);
  }

  toJSON(): Record<string, number[]> {
    return Object.fromEntries(this.hits);
  }

  load(data: Record<string, number[]> | undefined): void {
    if (!data) return;
    for (const [k, v] of Object.entries(data)) if (Array.isArray(v)) this.hits.set(k, v.filter((n) => typeof n === "number"));
  }
}
