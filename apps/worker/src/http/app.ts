import { Hono } from "hono";
import type { z } from "zod";
import { API_SECURITY_HEADERS, hmacSha256Hex, isAllowedOrigin, randomToken, redact } from "@croco/security";
import { LIMITS, type ApiErrorBody } from "@croco/shared";
import { ConfigError, loadConfig } from "../env";
import { ApiError } from "./errors";
import type { AppEnv, Ctx } from "./context";
import { rateLimit } from "./ratelimit";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function errorBody(code: ApiError["code"], ref: string, fields?: Record<string, string>): ApiErrorBody {
  return { error: { code, ref, ...(fields ? { fields } : {}) } };
}

/** Reads and validates a JSON body with a hard size cap. */
export async function readJson<S extends z.ZodType>(c: Ctx, schema: S): Promise<z.infer<S>> {
  const type = c.req.header("Content-Type") ?? "";
  if (!/^application\/json(;\s*charset=utf-8)?$/i.test(type)) throw new ApiError("unsupported_media_type");
  const buf = await c.req.raw.arrayBuffer();
  if (buf.byteLength > LIMITS.http.maxBodyBytes) throw new ApiError("payload_too_large");
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf));
  } catch {
    throw new ApiError("bad_request");
  }
  return parseOrThrow(schema, data);
}

export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const res = schema.safeParse(data);
  if (!res.success) {
    const fields: Record<string, string> = {};
    for (const issue of res.error.issues.slice(0, 10)) fields[issue.path.join(".") || "_"] = issue.code === "custom" ? issue.message : issue.code;
    throw new ApiError("validation_failed", fields);
  }
  return res.data;
}

export function query(c: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  const url = new URL(c.req.url);
  for (const [k, v] of url.searchParams) if (!(k in out)) out[k] = v;
  return out;
}

/** Responses proxied from Durable Objects have immutable headers; copy before modifying. */
function setHeaders(c: Ctx, headers: Record<string, string>, append: Record<string, string> = {}): void {
  try {
    for (const [k, v] of Object.entries(headers)) c.res.headers.set(k, v);
    for (const [k, v] of Object.entries(append)) c.res.headers.append(k, v);
  } catch {
    c.res = new Response(c.res.body, c.res);
    for (const [k, v] of Object.entries(headers)) c.res.headers.set(k, v);
    for (const [k, v] of Object.entries(append)) c.res.headers.append(k, v);
  }
}

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Request context, configuration (fails closed), client metadata.
  app.use("*", async (c, next) => {
    const requestId = randomToken(9);
    c.set("requestId", requestId);
    try {
      c.set("config", loadConfig(c.env));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "invalid_configuration", requestId, error: e instanceof ConfigError ? e.message : "unknown" }));
      return c.json(errorBody("service_unavailable", requestId), 503, API_SECURITY_HEADERS);
    }
    const ip = c.req.header("CF-Connecting-IP") ?? "0.0.0.0";
    c.set("ip", ip);
    c.set("ipHash", (await hmacSha256Hex(c.get("config").ipHashKey, ip)).slice(0, 24));
    const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf;
    c.set("country", typeof cf?.country === "string" && /^[A-Z]{2}$/.test(cf.country) ? cf.country : null);
    await next();
    if (c.res.status === 101) return; // WebSocket upgrade responses are passed through untouched
    setHeaders(c, { ...API_SECURITY_HEADERS, "X-Request-Id": requestId });
  });

  // CORS with an exact origin allowlist; state-changing requests require an allowed Origin.
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin") ?? null;
    const allowed = isAllowedOrigin(origin, c.get("config").allowedOrigins);
    if (c.req.method === "OPTIONS") {
      if (!allowed) return c.json(errorBody("forbidden", c.get("requestId")), 403);
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Step-Up",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }
    if (origin && !allowed) return c.json(errorBody("forbidden", c.get("requestId")), 403);
    if (!["GET", "HEAD"].includes(c.req.method) && !allowed) return c.json(errorBody("forbidden", c.get("requestId")), 403);
    if (BODY_METHODS.has(c.req.method)) {
      const length = Number(c.req.header("Content-Length") ?? "0");
      if (Number.isFinite(length) && length > LIMITS.http.maxBodyBytes) return c.json(errorBody("payload_too_large", c.get("requestId")), 413);
    }
    await rateLimit(c, "ip", "global");
    await next();
    if (allowed && c.res.status !== 101) {
      setHeaders(c, { "Access-Control-Allow-Origin": origin!, "Access-Control-Expose-Headers": "X-Request-Id, Retry-After" }, { Vary: "Origin" });
    }
  });

  app.onError((e, c) => {
    const requestId = c.get("requestId") ?? "unknown";
    if (e instanceof ApiError) {
      const res = c.json(errorBody(e.code, requestId, e.fields), e.status as 400);
      for (const [k, v] of Object.entries(e.headers ?? {})) res.headers.set(k, v);
      return res;
    }
    // Never leak internals: generic body, details only in redacted logs.
    console.error(JSON.stringify({ level: "error", msg: "unhandled_error", requestId, error: redact(String((e as Error)?.stack ?? e)) }));
    return c.json(errorBody("internal_error", requestId), 500);
  });

  app.notFound((c) => c.json(errorBody("not_found", c.get("requestId") ?? "unknown"), 404));
  return app;
}
