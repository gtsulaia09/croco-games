# API Security

Every `/api/*` endpoint in `apps/worker` is treated as an independent security boundary.

## 1. Perimeter Controls (`apps/worker/src/http/app.ts`)

1. **Fail-closed configuration**: every request resolves `loadConfig(env)`. Invalid or placeholder configuration returns `503 service_unavailable` with full security headers.
2. **Exact-origin CORS**:
   - `ALLOWED_ORIGINS` is parsed by `parseAllowedOrigins` (exact scheme + host + optional port; wildcards `*`, paths, credentials, and `null` are rejected).
   - Deployed environments (`staging`, `demo`, `production`) refuse non-`https://` origins.
   - Preflight `OPTIONS` requests from unapproved origins receive `403`.
   - Any request carrying a foreign `Origin` receives `403`.
   - Any state-changing request (anything other than `GET` / `HEAD`) without an allowlisted `Origin` receives `403`.
   - `Access-Control-Allow-Credentials` is never sent.
3. **Content-Type & size limits**:
   - All JSON body handlers go through `readJson(c, schema)`, which requires `Content-Type: application/json` (rejecting form-encoded CSRF posts with `415 unsupported_media_type`).
   - `Content-Length` and actual body bytes are both capped at **16 KB** (`413 payload_too_large`).
   - Decoded with `new TextDecoder("utf-8", { fatal: true })`; malformed JSON returns `400 bad_request`.
4. **Security headers on every response (including 4xx/5xx)**:
   - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: no-referrer`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
   - `Cross-Origin-Resource-Policy: same-site`
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cache-Control: no-store`
   - `X-Request-Id: <random correlation id>`
5. **Method & route hygiene**: only explicitly registered HTTP methods and routes match; everything else returns `404 not_found` with no method reflection.

## 2. Input Validation & Mass-Assignment Prevention

- All REST inputs and query parameters are parsed with **Zod `.strictObject()`** (`packages/shared/src/validation.ts`). Unexpected properties (`role`, `hostId`, `userId`, `score`, `rating`, `isAdmin`) are rejected with `400 validation_failed`.
- Path IDs are validated against strict prefixed patterns (`^[a-z]{1,3}_[A-Za-z0-9]{16,32}$`) before any database or Durable Object lookup.
- Text inputs (room names, chat messages, report details, maintenance messages) are normalized with NFC, stripped of control and bidirectional override characters (`U+202A–U+202E`, `U+2066–U+2069`, etc.), and length-bounded.
- Per-game room options (`gameConfig`) are re-validated by the target game engine's own strict `configSchema` on both Worker creation and inside `RoomDO`.

## 3. Output Validation & Data Minimization

- User objects returned by public/social/leaderboard endpoints pass through `toPublicUser` / `publicUsers`, whitelisting `{ id, username, avatar, badges }` only — `email`, `firebase_uid`, `ip_hash`, and `suspension_reason` never appear.
- Room summaries and snapshots expose `hasPassword: boolean` only; password hashes never leave `RoomDO` storage.
- Pagination is strictly bounded (`limit` 1–50, default 20; opaque cursor ≤ 200 chars).

## 4. Safe Error Handling

- Known failures throw `ApiError(code, fields?, headers?)`, serialized as `{ error: { code, ref, fields? } }`.
- Unhandled exceptions are caught by `app.onError`, logged to structured JSON after `redact()`, and returned to the caller as `{ error: { code: "internal_error", ref } }` — never stack traces, SQL errors, or file paths.

## 5. Rate Limiting Strategy (`apps/worker/src/http/ratelimit.ts`)

Layered limits avoid blocking an entire office sharing one NAT IP:

| Bucket | Binding / Limit | Keying | Applied to |
|---|---|---|---|
| `ip` | `RL_IP`: 900 / 60s | Pseudonymised IP hash | Global `/api/*` ceiling (NAT-friendly) |
| `auth` | `RL_AUTH`: 10 / 60s | User ID or IP hash | Profile creation, account deletion, MFA enroll/verify, audit verification |
| `write` | `RL_WRITE`: 40 / 60s | User ID | Social mutations, room create/join/leave, reports, admin writes |
| `read` | `RL_READ`: 180 / 60s | User ID | Listings, leaderboards, profiles, notifications, admin reads |
| `ticket` | `RL_TICKET`: 20 / 60s | User ID or IP hash | WS ticket issuance & WS upgrade requests |
| Exact D1 / DO caps | 3 rooms/10m, 10 reports/day, 50 pending friend requests, 5 password fails/15m per user, 50/h per room, 5 MFA fails/15m | User ID / Room ID | High-value abuse paths |

If a Cloudflare Rate Limit binding throws or is unavailable locally, `rateLimit` falls through to an in-isolate `SlidingWindowCounter` (never failing open). Violations return `429 rate_limited` with `Retry-After` and record a sampled `ratelimit.exceeded` event.
