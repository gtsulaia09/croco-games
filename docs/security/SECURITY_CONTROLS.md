# Security Controls Catalog

Every control listed below is **implemented in the current codebase** and mapped to its enforcing files and automated verification tests. Controls that depend on external operator configuration (Cloudflare dashboard, Firebase Console, GitHub Environments) are explicitly marked as **Operator-configured**.

---

## Layer 1 — Infrastructure & Deployment

| Control | Implementation | Verification |
|---|---|---|
| Environment separation (`development`, `staging`, `demo`, `production`) | Separate Wrangler environments and D1 databases in `apps/worker/wrangler.toml`; separate GitHub Environments in `.github/workflows/deploy-cloudflare.yml` and `deploy-pages-demo.yml` | `loadConfig` fail-closed tests (`apps/worker/test/security-hardening.test.ts`) |
| Fail-closed runtime configuration | `apps/worker/src/env.ts` (`loadConfig`) rejects placeholder project IDs, non-HTTPS origins in deployed envs, short `IP_HASH_KEY`, malformed `MFA_ENCRYPTION_KEY`; disables admin routes if any admin secret is missing | `apps/worker/test/security-hardening.test.ts` |
| TLS / HTTPS & Cloudflare Edge DDoS/WAF | **Operator-configured** via Cloudflare Pages/Workers + `Strict-Transport-Security` header emitted by `apps/web/vite.config.ts` | Header verification on build output (`apps/web/dist/_headers`) |
| No source maps published | `apps/web/vite.config.ts` (`sourcemap: false`), `apps/worker/wrangler.toml` (`upload_source_maps = false`), enforced in `scripts/security-checks.mjs` | `pnpm run check:security` |

## Layer 2 — Application Perimeter

| Control | Implementation | Verification |
|---|---|---|
| Exact-match CORS allowlist (no `*`, no reflection) | `packages/security/src/http.ts` (`parseAllowedOrigins`, `isAllowedOrigin`) + `apps/worker/src/http/app.ts` | `apps/worker/test/perimeter.test.ts`, `packages/security/src/hardening.test.ts` |
| State-changing Origin enforcement & JSON-only bodies (CSRF defense) | `apps/worker/src/http/app.ts`: non-GET/HEAD requires allowlisted `Origin`; `readJson` requires `application/json` | `apps/worker/test/perimeter.test.ts` |
| Request body size cap (16 KB) & UTF-8 strict decoding | `apps/worker/src/http/app.ts` (`LIMITS.http.maxBodyBytes = 16384`, `TextDecoder(..., { fatal: true })`) | `apps/worker/test/perimeter.test.ts` |
| Strict API security headers on all responses (incl. errors) | `API_SECURITY_HEADERS` (`CSP: default-src 'none'`, `nosniff`, `DENY`, `no-referrer`, `no-store`, `COOP`, `CORP`, `Permissions-Policy`) | `apps/worker/test/perimeter.test.ts`, `packages/security/src/hardening.test.ts` |
| Strict SPA CSP & clickjacking defense | `apps/web/vite.config.ts` emits `_headers` (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`) for Cloudflare Pages and meta CSP + frame-busting (`apps/web/src/main.tsx`) for GitHub Pages | `apps/web/e2e/demo.spec.ts` |
| Layered rate limiting (IP + user + endpoint + room-local) | Cloudflare `RL_AUTH`, `RL_WRITE`, `RL_READ`, `RL_TICKET`, `RL_IP` bindings with fail-closed in-isolate `SlidingWindowCounter` fallback (`apps/worker/src/http/ratelimit.ts`) + D1 caps + RoomDO password lockout | `apps/worker/test/rooms.test.ts`, `apps/worker/test/admin.test.ts`, `apps/worker/test/security-hardening.test.ts` |
| Strict input validation & mass-assignment protection | Zod `.strictObject()` across all REST and WebSocket schemas (`packages/shared/src/validation.ts`, `protocol.ts`, engine schemas) | `packages/shared/src/validation.test.ts`, `apps/worker/test/auth.test.ts`, `apps/worker/test/rooms.test.ts` |
| Optional Cloudflare Turnstile anti-automation on registration | Backend `POST /api/me/profile` verifies `turnstileToken` via `siteverify` when `TURNSTILE_SECRET` is set; frontend `apps/web/src/pages/Setup.tsx` mounts widget only when `VITE_TURNSTILE_SITE_KEY` is configured | Code review + CSP tests (`packages/security/src/hardening.test.ts`) |

## Layer 3 — Identity & Session Security

| Control | Implementation | Verification |
|---|---|---|
| Server-side Firebase ID token verification | `packages/security/src/firebase-token.ts` using `jose.jwtVerify` + `createRemoteJWKSet` (RS256 only, `kid` required, `iss`, `aud`, `sub`, `exp`, `iat`, `auth_time`, max lifetime 1h, provider allowlist) | `packages/security/src/security.test.ts`, `hardening.test.ts`, `apps/worker/test/auth.test.ts` |
| Application-level session visibility & revocation | `user_sessions` table + `users.sessions_valid_after`; single-device revoke & sign-out-everywhere (`apps/worker/src/routes/me.ts`, `auth.ts`) | `apps/worker/test/auth.test.ts` |
| Session rotation on privilege change & suspension | `sessions_valid_after = now + 1` and `DELETE FROM admin_step_up` on role grant/revoke or suspension (`apps/worker/src/routes/admin.ts`) | `apps/worker/test/admin.test.ts` |
| Email verification enforcement for sensitive actions | `requireVerified` middleware on social/room writes (`apps/worker/src/auth.ts`) | `apps/worker/test/auth.test.ts` |
| Recent authentication check (≤ 10 min) | `assertRecentAuth` on account deletion, MFA enrollment, recovery code regeneration, role changes, platform settings (`apps/worker/src/auth.ts`) | `apps/worker/test/auth.test.ts`, `apps/worker/test/admin.test.ts` |
| Anti-impersonation usernames | NFC normalization, Latin/Georgian allowlist, homoglyph skeleton (`usernameSkeleton`), reserved word filter (`packages/shared/src/username.ts`) | `packages/shared/src/validation.test.ts`, `apps/worker/test/auth.test.ts` |
| Generic auth errors & email enumeration protection | Frontend `Login.tsx` returns generic errors and silent reset confirmation; Firebase Email Enumeration Protection is **Operator-configured** | `apps/web/src/lib/firebase.ts`, `apps/web/src/pages/Login.tsx` |

## Layer 4 — Authorization & Admin Security

| Control | Implementation | Verification |
|---|---|---|
| Default-deny API authentication | Every non-public route requires `authenticate` + `requireProfile` | Default-deny route inventory test (`apps/worker/test/security-hardening.test.ts`) |
| Ownership & IDOR/BOLA scoping | SQL `WHERE` clauses scope sessions, friend requests, notifications, invitations, and profiles to `auth.user.id` | `apps/worker/test/auth.test.ts`, `apps/worker/test/social.test.ts` |
| Trusted Admin bootstrap | Requires verified `sub === ADMIN_FIREBASE_UID` AND `emailVerified === true` AND `email === ADMIN_BOOTSTRAP_EMAIL` (`apps/worker/src/auth.ts`) | `apps/worker/test/admin.test.ts` |
| Mandatory Admin/Moderator TOTP MFA | `@oslojs/otp` RFC 6238 TOTP; AES-256-GCM encrypted secret bound with user AAD; monotonic `last_used_step` replay guard; 5 failures / 15 min lockout; 10 HMAC-peppered one-time recovery codes (`packages/security/src/totp.ts`, `apps/worker/src/routes/admin.ts`) | `packages/security/src/security.test.ts`, `apps/worker/test/admin.test.ts` |
| In-memory bound step-up tokens | 256-bit random token stored as SHA-256 hash in `admin_step_up`, bound to `(user_id, auth_time)`, 15-min TTL, sent via `X-Admin-Step-Up` | `apps/worker/test/admin.test.ts` |
| Staff least privilege (`moderator` vs `admin`) | `requireStaff(["admin"])` vs `requireStaff(["admin", "moderator"])`; moderators cannot view user emails, suspend > 7 days, manage roles, edit settings, or access audit/security logs | `apps/worker/test/security-hardening.test.ts` |

## Layer 5 — Realtime & Game Integrity

| Control | Implementation | Verification |
|---|---|---|
| One-time 30s WebSocket tickets in subprotocol | `POST /api/rooms/:id/ticket` & `/api/lobby/ticket` return 256-bit token stored hashed; sent in `Sec-WebSocket-Protocol: croco.v1, t.<ticket>` (never in URL) | `apps/worker/test/rooms.test.ts`, `apps/worker/test/security-hardening.test.ts` |
| CSWSH Origin check + frame/rate caps | Both Worker and DO validate `Origin`; RoomDO enforces 4 KB max frame, LobbyDO 1 KB max frame, per-socket `TokenBucket`, malformed-frame disconnect | `apps/worker/test/rooms.test.ts`, `apps/worker/test/security-hardening.test.ts` |
| Single-seat device ownership | Opening a newer authenticated RoomDO socket closes the older socket with `4001` (`superseded`) | `apps/worker/test/rooms.test.ts` |
| Server-authoritative game engines & CSPRNG | All 10 engines in `packages/game-engine`; `cryptoRng()` uses `crypto.getRandomValues` with rejection sampling; ESLint forbids `Math.random()` in production engine/worker/security code | `packages/game-engine/src/core/core.test.ts`, all 10 game test suites |
| Per-seat private card redaction | `engine.view(state, seat)` and spectator `engine.view(state, null)`; hidden state never leaves RoomDO | `packages/game-engine/src/core/security.test.ts`, `apps/worker/test/rooms.test.ts`, `apps/worker/test/security-hardening.test.ts` |
| Action revision & replay protection | `game.action` checks `msg.rev === game.rev` and deduplicates `msg.id` against a 256-entry ring buffer | `apps/worker/test/rooms.test.ts` |
| Server-verified ratings & anti-farming | Ratings updated exclusively inside `RoomDO.finishMatch` → `finalizeMatch`; ≥ 2 humans required; 5 rated matches/pair/day cap; anomaly flags for review | `apps/worker/test/ratings.test.ts` |

## Layer 6 — Data & Frontend Safety

| Control | Implementation | Verification |
|---|---|---|
| Prepared SQL statements only | Every D1 query uses `.prepare(...).bind(...)` via `apps/worker/src/db.ts`; static check forbids non-constant `${}` SQL interpolation | `scripts/security-checks.mjs`, `apps/worker/test/social.test.ts` |
| XSS & DOM injection prevention | Plain-text React rendering; ESLint bans `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, `javascript:` URLs | `eslint.config.js`, `packages/shared/src/validation.test.ts`, `apps/worker/test/rooms.test.ts` |
| Pseudonymised IP & data minimization | Raw IPs are never persisted (truncated `HMAC-SHA-256` with `IP_HASH_KEY`); no account passwords stored; room password hashes live only in RoomDO storage (`PBKDF2-SHA-256`) | `apps/worker/src/http/app.ts`, `database/migrations/0001_initial_schema.sql` |
| Open-redirect protection | Hash router with no server redirects; `safeInternalPath` allowlist | `packages/shared/src/validation.test.ts` |

## Layer 7 — Monitoring, Audit & Supply Chain

| Control | Implementation | Verification |
|---|---|---|
| Append-only, hash-chained Admin audit log | `admin_audit_logs` with SHA-256 `prev_hash` chain (`apps/worker/src/audit.ts`), SQLite `BEFORE UPDATE` & 365-day `BEFORE DELETE` triggers, `GET /api/admin/audit/verify` | `apps/worker/test/admin.test.ts`, `apps/worker/test/security-hardening.test.ts` |
| Structured security event logging with redaction | `security_events` table + `redact()` deep sanitizer stripping tokens, passwords, tickets, recovery codes | `packages/security/src/security.test.ts`, `hardening.test.ts` |
| Supply-chain CI pipeline | Frozen lockfile, SHA-pinned GitHub Actions, `pnpm audit`, OSV-Scanner, Gitleaks, Semgrep SAST, CycloneDX 1.5 SBOM, Trojan Source bidi check | `.github/workflows/ci.yml`, `scripts/security-checks.mjs`, `scripts/generate-sbom.mjs` |
