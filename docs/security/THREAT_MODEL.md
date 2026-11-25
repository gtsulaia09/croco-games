# Croco Games — Threat Model

Status: **Maintained alongside the implemented codebase.** Last reviewed: 2026-11-25.
Methodology: **STRIDE** per component plus scenario analysis of every attack listed in the
project specification (§3). Severity uses a simple likelihood × impact scale
(Critical / High / Medium / Low). "Test" references point to automated tests in this
repository; "manual" means a manual verification step in `SECURITY_TEST_REPORT.md`.

> Honest scope note: this is an internal, AI-assisted threat model prepared for review by the
> company's security specialists. It is **not** an independent assessment.

## 1. System summary

| Component | Technology | Trust level |
|---|---|---|
| Browser client (SPA) | React, Vite, Firebase JS SDK | **Untrusted** |
| Static hosting | Cloudflare Pages (production/staging), GitHub Pages (demo) | Trusted to serve the published bundle only |
| API Worker | Cloudflare Worker (Hono, Zod, jose) | Trusted |
| RoomDO | Durable Object, one per room — authoritative game state, chat, tickets | Trusted |
| LobbyDO | Durable Object singleton — presence and push notifications | Trusted |
| D1 | Cloudflare D1 (SQLite) — users, social, rooms index, matches, ratings, audit | Trusted store |
| Identity provider | Firebase Authentication (Google, Facebook, email/password) | Trusted third party (token issuer) |
| CI/CD | GitHub Actions | Trusted only for protected branch + environments |

### Sensitive assets

| ID | Asset | Why it matters |
|---|---|---|
| A1 | Firebase ID tokens / refresh tokens | Account takeover |
| A2 | Admin role, admin MFA secret, recovery codes, step-up tokens | Full platform control |
| A3 | Hidden game state: deck order, opponents' cards, face-down discards, bot internals, RNG | Cheating |
| A4 | Room passwords (hash), invitation codes, WebSocket tickets | Unauthorized room access |
| A5 | Personal data: email, provider identifiers, IP prefixes, login history | Privacy |
| A6 | Ratings, match records, statistics | Leaderboard integrity |
| A7 | Chat messages, reports | Privacy, abuse handling |
| A8 | Audit log and security events | Forensics, non-repudiation |
| A9 | Deployment credentials (Cloudflare API token), Worker secrets | Infrastructure takeover |
| A10 | Source code and dependencies | Supply-chain integrity |

### Trust boundaries

| TB | Boundary | Crossing data | Primary controls |
|---|---|---|---|
| TB1 | Internet → Cloudflare edge | All requests | TLS, Cloudflare DDoS mitigation, WAF (free managed rules), request limits |
| TB2 | Browser → API Worker (HTTPS) | Bearer ID token, JSON bodies | Origin allowlist (CORS), Content-Type enforcement, Zod strict schemas, token verification, rate limiting, size limits |
| TB3 | Browser → RoomDO/LobbyDO (WSS) | Game actions, chat | Origin allowlist, one-time ticket in subprotocol, per-room authorization, message schema, size/rate limits, revision + idempotency checks |
| TB4 | Worker → Google JWKS | Public signing keys | HTTPS, pinned JWKS URL, `kid` must exist, RS256 only, cached with rotation |
| TB5 | Worker/DO → D1 | SQL | Prepared statements with `.bind()` only, allowlisted identifiers, bounded queries |
| TB6 | Worker → DO (RPC) | Typed calls | Only the Worker can address DOs; inputs revalidated inside the DO |
| TB7 | GitHub → Cloudflare (deploy) | Scoped API token | Protected `production` environment, minimal token scope, pinned actions |
| TB8 | Developer → repository | Code, dependencies | Lockfile, Gitleaks, OSV-Scanner, Semgrep, review |

## 2. STRIDE by component

### 2.1 Authentication (Firebase + Worker verification)

| STRIDE | Threat | Control | Residual |
|---|---|---|---|
| S | Forged / unsigned / `alg:none` token | jose `jwtVerify` with `algorithms:['RS256']`, Google JWKS only, `iss`/`aud`/`sub`/`exp`/`iat`/`auth_time` checks | Compromise of Google signing keys (out of scope) |
| S | Token for another Firebase project | `aud` and `iss` bound to `FIREBASE_PROJECT_ID` | — |
| T | Client-supplied user id / role | Identity derived only from verified `sub`; role read from D1 `roles` | — |
| R | User denies actions | Security events + admin audit log | Users' own non-admin actions are logged only where security-relevant |
| I | Email enumeration | Firebase email enumeration protection (operator must enable); API never reveals existence of an email | Depends on operator configuration (documented) |
| D | Login flooding | Firebase quotas + Worker rate limits on profile creation + Turnstile (optional, free) | Firebase-side limits not under our control |
| E | Using a revoked session | App-level revocation: `sessions_valid_after`, per-session revocation by `(uid, auth_time)` | Tokens remain valid at Google until expiry (≤1 h) but are rejected by our API |

### 2.2 Admin

| STRIDE | Threat | Control | Residual |
|---|---|---|---|
| S | Attacker registers username "Admin" | Role only from `ADMIN_FIREBASE_UID` bootstrap + `roles` table; reserved usernames | — |
| S | Stolen admin ID token | TOTP step-up (encrypted secret, replay-protected) required for every admin route; step-up token bound to `(user, auth_time)`; 15-min expiry | Real-time phishing of token + TOTP (mitigate: WebAuthn later — documented) |
| T | Tampering with audit log | Audit table writable only by trusted code paths; no update/delete endpoints; hash chain (`prev_hash`) | D1 operator with Cloudflare account access can still alter rows |
| E | Ordinary user calls admin endpoint | `requireAdmin` middleware: role + MFA enrolled + valid step-up, checked server-side for every route | — |
| E | Admin privileges before MFA | Bootstrap creates `admin` role in state `mfa_pending`; only enrollment endpoints usable | — |

### 2.3 Rooms, invitations, chat

| STRIDE | Threat | Control |
|---|---|---|
| S | Message impersonation in chat | Sender identity attached by server from the socket tag; client cannot set it |
| T | Room config tampering by non-host | Host checks in RoomDO; host transfer only by host or automatic on host leave |
| I | Password disclosure | Password hash kept only in RoomDO storage (PBKDF2-SHA256 + salt), never in D1 or API responses |
| I | Private room listing | Invite-only rooms omitted from browser unless caller is a member/invitee |
| D | Password brute force | Per-user (5/15 min) and per-room (50/h) attempt limits in RoomDO, security events |
| E | Joining without authorization | Join checks inside RoomDO (capacity, password, invite grant, bans, blocks); ticket only for members |

### 2.4 Game engines and RoomDO

| STRIDE | Threat | Control |
|---|---|---|
| S | Acting for another seat | Seat resolved from socket tag → member record; action `seat` never accepted from client |
| T | Illegal move / score submission | Server-authoritative engines validate every action; scores computed server-side only |
| T | Replay / duplicate | Per-action `id` dedupe set (bounded), required `rev` equal to current revision |
| I | Hidden card leakage | `engine.view(state, seat)` redaction; per-player sends; tests assert opponent cards never serialized |
| I | RNG prediction | `crypto.getRandomValues` with rejection sampling, Fisher–Yates; no seeds stored |
| D | Message flood | Token bucket per connection, 4 KB message cap, connection caps |
| E | Bot takeover keeps control | Reconnect restores human; bot actions re-check `botControlled` and revision at execution |

### 2.5 Data (D1)

| STRIDE | Threat | Control |
|---|---|---|
| T | SQL injection | Prepared statements + `.bind()` everywhere; lint rule + test that greps for template SQL with interpolation |
| I | Over-exposure in responses | DTO mappers whitelist fields; public profile never includes email/firebase uid |
| D | Unbounded reads | `LIMIT` on every list query, max page size 50, cursor pagination |

### 2.6 CI/CD and supply chain

| STRIDE | Threat | Control |
|---|---|---|
| T | Malicious dependency | Lockfile, `--frozen-lockfile`, OSV-Scanner, `pnpm audit`, review of install scripts (`onlyBuiltDependencies` allowlist) |
| I | Secret in repository | Gitleaks in CI, GitHub secret scanning, `.env.example` placeholders only |
| E | PR from fork steals deploy secrets | Deploy jobs only on `push` to `main` with protected environments; no `pull_request_target` |

## 3. Required attack scenarios

Legend — **Sev**: inherent severity before controls. **Det**: detection. **Rec**: recovery.

| # | Scenario | Component | Impact | Sev | Preventive controls | Det | Test procedure | Rec |
|---|---|---|---|---|---|---|---|---|
| 1 | Account takeover | Auth | Full user account control | High | Firebase-managed credentials; app-level session revocation; suspicious login signals (`login.new_country`) logged | `security_events` `login.new_country` | `apps/worker/test/auth.test.ts` session revocation tests | Revoke all sessions, user resets password; IR §2.1 |
| 2 | Credential stuffing | Firebase | Mass account takeover | High | Firebase protections + enumeration protection; Turnstile on profile creation; rate limits | Firebase console, security events | Manual (Firebase side) | IR §2.1 |
| 3 | Password attacks | Firebase | Weak passwords guessed | Medium | Firebase password policy (operator configures min length 12) | Firebase | Manual | Force reset |
| 4 | Brute-force (API) | Worker | Resource abuse | Medium | Per-user + per-IP rate limiting | `ratelimit.exceeded` events | `apps/worker/test/admin.test.ts`, `security-hardening.test.ts` | Auto-recovers |
| 5 | Session theft | Browser | Impersonation | High | Strict CSP (no inline/eval), no tokens in URLs/logs, short-lived ID tokens, revocation | Concurrent sessions list | `perimeter.test.ts`; `packages/security/src/hardening.test.ts` | Revoke session |
| 6 | Session fixation | Auth | Attacker-chosen session | Low | No server-issued pre-auth session ids; Firebase issues tokens after auth | — | Design review | — |
| 7 | Authentication bypass | Worker | Unauthenticated access | Critical | Default-deny middleware on `/api/*` except explicit public routes | 401 metrics | `apps/worker/test/security-hardening.test.ts` route inventory + `auth.test.ts` | Hotfix + regression test |
| 8 | Broken access control | Worker/DO | Data modification | Critical | Ownership + state checks per handler (AUTHORIZATION_MATRIX) | `authz.denied` / 403 logs | `apps/worker/test/security-hardening.test.ts`, `admin.test.ts`, `rooms.test.ts` | Hotfix |
| 9 | IDOR/BOLA | Worker | Read/modify others' data | High | Resource lookups always scoped by authenticated user id | 404/403 | `auth.test.ts` & `social.test.ts` IDOR tests | Hotfix |
| 10 | Privilege escalation | Worker | Admin access | Critical | Roles only from D1, no role in any request schema (`.strict()`), admin routes need MFA step-up | `admin.denied` | `auth.test.ts`, `admin.test.ts`, `security-hardening.test.ts` | IR §2.2 |
| 11 | Admin impersonation | UI/chat | Social engineering | Medium | Admin badge from server role only; reserved usernames incl. lookalikes; bots labelled BOT | — | Username validation tests | Rename + suspend |
| 12 | SQL injection | D1 | Data breach | Critical | Prepared statements only | — | Payload tests on search/username; static check | — |
| 13 | Stored XSS | UI | Token theft | High | React text rendering, no `dangerouslySetInnerHTML`, CSP `script-src 'self'`, username charset allowlist | CSP reports (if configured) | XSS payload tests in chat/usernames/room names | Purge content |
| 14 | Reflected XSS | UI/API | Token theft | Medium | JSON-only API with `nosniff`, no HTML responses | — | Header tests | — |
| 15 | DOM XSS | UI | Token theft | Medium | No `innerHTML`, hash-router params treated as data, ESLint rule | — | Static check | — |
| 16 | CSRF | API | Unwanted actions | Low (bearer tokens, no cookies) | Bearer tokens only; Origin allowlist; `application/json` required | — | CSRF tests (form-encoded rejected) | — |
| 17 | CORS misconfiguration | API | Cross-origin data theft | High | Exact-match origin allowlist per environment, no reflection, no `*` | — | CORS tests | — |
| 18 | Clickjacking | UI | UI redress | Medium | `frame-ancestors 'none'` (Cloudflare Pages `_headers`, API); GitHub Pages cannot set headers → frame-busting script + documented residual | — | Header test | — |
| 19 | Open redirect | UI | Phishing | Low | No server redirects; client only navigates to internal routes allowlist | — | Unit test of `safeInternalPath` | — |
| 20 | Path traversal | Static/API | File read | Low | No filesystem; route params validated as ids | — | Schema tests | — |
| 21 | Insecure file upload | — | RCE/XSS | N/A | **No uploads** — preset avatar selection only | — | — | — |
| 22 | API abuse / scraping | Worker | Data harvesting | Medium | Auth for all user data, search min 3 chars + 20 results + rate limits | rate events | Ratelimit tests | — |
| 23 | WebSocket hijacking | DO | Session hijack | High | One-time 30 s tickets, user-bound, single use | `ws.ticket_invalid` | WS tests | — |
| 24 | Cross-Site WebSocket Hijacking | DO | Actions from attacker site | High | Origin allowlist at upgrade + ticket (not cookies) | `ws.origin_denied` | CSWSH test with foreign Origin | — |
| 25 | Unauthorized room access | DO | Join/spectate private rooms | High | Join checks in DO; ticket issued only to members | `room.join_denied` | Room isolation tests | Kick + rotate password |
| 26 | Room password disclosure | DO/API | Access | Medium | Hash only in DO storage; never in responses/logs | — | Response-shape tests | — |
| 27 | Private card disclosure | Engines/DO | Cheating | Critical | Per-seat views; spectators see public view only | — | View redaction tests for every game | IR §6 |
| 28 | Game-state manipulation | DO | Cheating | Critical | Server-authoritative engines; no client state accepted | `game.illegal_action` | Illegal-action tests per engine | Void match |
| 29 | Poker chip manipulation | Engine | Unfair results | High | Chips only changed by engine; conservation invariant tests (sum of stacks + pots constant) | invariant failure event | Property tests | Void hand |
| 30 | Leaderboard manipulation | Ratings | Fake rank | High | Ratings computed only from DO-finalized matches; ≥2 humans for rated play; pair farming caps | `integrity.flag` | Rating tests | Recompute ratings |
| 31 | Replay attacks | DO | Duplicate actions | High | Action `id` dedupe + `rev` check | `game.stale_action` | Replay tests | — |
| 32 | Race conditions | DO/D1 | Double join, double accept | Medium | DO single-threaded input gate; D1 unique constraints + conditional updates | — | Concurrency tests | — |
| 33 | Duplicate actions | DO | Double moves | Medium | Same as 31 | — | Tests | — |
| 34 | Bot manipulation | Engines | Predictable bots exploited | Low | Bots receive only seat view; randomized tie-breaks | — | Bot view tests | — |
| 35 | Automated account creation | Firebase/Worker | Spam accounts | Medium | Firebase quotas, Turnstile on profile creation, rate limits | security events | Manual | Bulk suspend |
| 36 | Scraping | Worker | Privacy | Low | Same as 22 | — | — | — |
| 37 | Spam (chat/invites/friend requests) | DO/Worker | Abuse | Medium | Rate limits, blocks, reports, mute | reports | Ratelimit tests | Suspend |
| 38 | Resource exhaustion | Worker/DO/D1 | Outage | High | Size limits, bounded queries, CPU-bounded handlers, connection caps, graceful 503 on quota | Cloudflare analytics | Load notes in PERFORMANCE.md | Wait for quota reset; IR §9 |
| 39 | DoS | Edge | Outage | High | Cloudflare automatic DDoS mitigation (free) | Cloudflare | — | IR §9 (documented free-plan limits) |
| 40 | Malicious dependency injection | Build | Backdoor | High | Lockfile, OSV, audit, install-script allowlist | CI | CI | IR §10 |
| 41 | Supply-chain attack (CI) | Actions | Secret theft | High | Actions pinned to SHAs, minimal `permissions`, environments | — | Workflow review | Rotate tokens |
| 42 | Secret leakage | Repo/bundle | Infra takeover | Critical | No secrets in Vite env (only public Firebase config), Gitleaks, bundle scan (`scripts/security-checks.mjs`) | Gitleaks | CI + `scripts/security-checks.mjs` | IR §2.3 |
| 43 | Misconfigured deployment environments | Infra | Demo hits prod | High | Per-environment `wrangler.toml` envs, separate D1 + origins; Worker refuses to start with missing/invalid config (fail closed) | Startup error | `apps/worker/test/security-hardening.test.ts` (`loadConfig`) | Redeploy |
| 44 | Information disclosure via logs/errors | Worker | Leaks | Medium | Generic error bodies with correlation id; structured logs with redaction of tokens/passwords | — | Error-shape + redaction tests | — |

## 4. Abuse cases specific to free infrastructure

* Exhausting the **100k requests/day** Worker quota or **100k D1 rows written/day** stops the
  service for everyone until 00:00 UTC. Mitigations reduce but cannot eliminate this — see
  `SECURITY_ARCHITECTURE.md §Free-tier limits`. This is a documented residual risk (Medium).

## 5. Residual risks (summary)

| ID | Risk | Severity | Status |
|---|---|---|---|
| R1 | Volumetric DoS / quota exhaustion on free plan | Medium | Accepted pending owner sign-off |
| R2 | Firebase refresh tokens are JS-accessible (IndexedDB); XSS would expose them | Medium | Mitigated by CSP; accepted |
| R3 | TOTP is phishable; WebAuthn not yet implemented | Medium | Open (planned) |
| R4 | GitHub Pages demo cannot send security headers (no `frame-ancestors`, HSTS controlled by GitHub) | Low | Accepted for demo; production uses Cloudflare Pages |
| R5 | Cloudflare account holders can modify D1 data incl. audit rows | Medium | Hash chain gives tamper evidence, not prevention |
| R6 | Collusion between human players in multi-player games (e.g. Bura soft-play) | Medium | Detection signals only |
| R7 | Room password hashing uses reduced PBKDF2 iterations due to Worker CPU limits | Low | Compensated by online attempt limits and room-scoped lifetime |
