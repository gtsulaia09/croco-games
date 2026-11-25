# Croco Games — Security Architecture

Status: Phase 0 design, kept in sync with the implementation. Where something is designed but
not yet implemented, it is marked **(planned)**. Implementation status per control lives in
`SECURITY_CONTROLS.md` and `ASVS_CHECKLIST.md`.

## 1. Architecture overview

```
 Browser (untrusted)                     Cloudflare edge (TLS, DDoS mitigation, WAF)
 ┌─────────────────────┐   HTTPS JSON    ┌──────────────────────────────────────────────┐
 │ React SPA           │ ──────────────▶ │ API Worker (Hono)                             │
 │ Firebase JS SDK     │  Bearer ID token│  ├ perimeter: CORS allowlist, method/CT/size  │
 │ (tokens in IndexedDB│                 │  ├ identity: jose RS256 + app revocation      │
 │  via Firebase)      │   WSS           │  ├ authz: role/ownership/state checks         │
 │                     │ ──────────────▶ │  ├ rate limits (CF ratelimit bindings)         │
 └─────────────────────┘ ticket in       │  └ D1 via prepared statements                 │
          │              subprotocol     │        │ RPC                 │ RPC             │
          │ OAuth popup                  │  ┌─────▼──────┐       ┌──────▼──────┐          │
          ▼                              │  │ RoomDO (×N)│       │ LobbyDO (1) │          │
 Firebase Auth (Google)                  │  │ authoritative      │ presence,   │          │
                                         │  │ game + chat│       │ notifications│         │
                                         │  └─────┬──────┘       └─────────────┘          │
                                         │        ▼                                       │
                                         │   D1 (users, social, rooms index, matches,    │
                                         │       ratings, audit, security events)         │
                                         └──────────────────────────────────────────────┘
```

## 2. Defense-in-depth layers

| Layer | Controls | Where |
|---|---|---|
| 1 Infrastructure | HTTPS only, Cloudflare automatic DDoS mitigation, free managed WAF ruleset, optional WAF rate-limiting rule (1 rule on free plan), separate environments | Cloudflare dashboard, `wrangler.toml` |
| 2 Perimeter | Exact-origin CORS, `OPTIONS`/method allowlist per route, `Content-Type: application/json` required for bodies, 16 KB body cap, security headers on every response, 4 KB WS frame cap | `apps/worker/src/http/*` |
| 3 Identity | Firebase ID token verification (RS256, iss/aud/sub/exp/iat/auth_time), account status, `sessions_valid_after`, per-session revocation, recent-auth checks | `packages/security/src/firebase-token.ts`, `apps/worker/src/auth/*` |
| 4 Authorization | Role-based (user/moderator/admin), ownership scoping on every query, state-machine checks, admin MFA step-up | `apps/worker/src/routes/*`, `AUTHORIZATION_MATRIX.md` |
| 5 Application logic | Server-authoritative engines, seat-bound actions, `rev` + action-id idempotency, CSPRNG shuffles, per-seat redacted views | `packages/game-engine`, `apps/worker/src/room/*` |
| 6 Data | Prepared statements only, minimization (no passwords/tokens stored), encrypted TOTP secrets (AES-256-GCM), hashed recovery codes and tickets, bounded retention | `database/migrations`, `apps/worker/src/db/*` |
| 7 Monitoring | Structured security events in D1, append-only hash-chained admin audit log, rate-limit events, integrity flags | `apps/worker/src/audit/*` |

A single failure must not cascade: e.g. a stolen ID token alone cannot reach admin routes
(MFA step-up), a compromised room ticket is useless after 30 s or one use, an XSS cannot
bypass server-side game validation.

## 3. Identity design

* **Provider:** Firebase Authentication (Spark plan) with Google, Facebook and email/password.
  Firebase stores password hashes; this application **never** sees or stores passwords.
* **Transport:** the SPA obtains a Firebase ID token (`getIdToken()`), sends it as
  `Authorization: Bearer <token>`. No cookies are used for the API, which removes classic CSRF.
* **Verification** (`verifyFirebaseIdToken`):
  * `jose.jwtVerify` with `createRemoteJWKSet(GOOGLE_SECURETOKEN_JWKS)` (keys cached, rotation
    handled by `kid` lookup with cooldown), `algorithms: ['RS256']`.
  * `iss === https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, `aud === FIREBASE_PROJECT_ID`.
  * `sub` non-empty, ≤ 128 chars; `exp` in future; `iat` and `auth_time` not in the future
    (60 s clock tolerance); `firebase.sign_in_provider` in allowlist.
  * Malformed tokens are rejected before any network I/O (structure + size ≤ 4 KB).
* **Application-level revocation:** `users.status` (`active`/`suspended`/`deleted`),
  `users.sessions_valid_after` (tokens with `auth_time` earlier are rejected) and the
  `user_sessions` table keyed by `(user_id, auth_time)` with `revoked_at`. This implements
  logout-from-device, logout-everywhere and admin revocation without the Firebase Admin SDK.
* **Recent authentication:** sensitive operations (account deletion, admin role changes, MFA
  changes) require `now − auth_time ≤ 10 min` → the SPA calls `reauthenticateWithPopup` /
  `reauthenticateWithCredential`.
* **Email verification:** password-provider accounts must have `email_verified=true` before
  social or multiplayer writes (friend requests, invitations, room creation, chat).

### Why not the Firebase Admin SDK / session cookies?
The Admin SDK requires Node APIs and a service-account private key. Firebase **session cookies**
would require cross-site cookies between Pages and the Worker origin. Bearer tokens plus
application-level revocation achieve the required properties with fewer secrets.

## 4. Administrator design

* **Bootstrap:** Worker secrets `ADMIN_FIREBASE_UID` and `ADMIN_BOOTSTRAP_EMAIL`. On the first
  authenticated request whose verified `sub` equals `ADMIN_FIREBASE_UID` **and** whose verified
  email equals `ADMIN_BOOTSTRAP_EMAIL` with `email_verified=true`, the backend inserts the `admin`
  role (idempotent, audited). No other path can create an `admin` role.
* **MFA:** TOTP (RFC 6238) implemented with `@oslojs/otp` (`generateHOTP` primitive, constant-time
  compare). Secrets: 20 random bytes, AES-256-GCM encrypted with `MFA_ENCRYPTION_KEY` (Worker
  secret, 32 bytes), AAD binds ciphertext to the user id, `key_version` column for rotation.
  Replay prevention: last accepted time-step stored; codes for steps ≤ last are rejected.
  Attempts limited to 5 per 15 minutes per admin (counted from `security_events`).
  10 recovery codes, 80 bits each, stored as HMAC-SHA-256 with `RECOVERY_CODE_PEPPER`.
* **Step-up:** a successful TOTP verification returns a random 256-bit step-up token held only in
  memory by the SPA and sent as `X-Admin-Step-Up`. Stored as SHA-256 hash bound to
  `(user_id, auth_time)`, 15-minute lifetime. Every admin route requires: role + MFA enrolled +
  valid step-up. Role changes and settings additionally require recent authentication.
* **Least privilege:** `moderator` (reports, kicks, ≤ 7-day suspensions) vs `admin` (everything,
  roles, settings). Moderators can only be appointed by an admin. Admins cannot be created via API.
* **Audit:** every privileged operation writes an `admin_audit_logs` row
  `{id, ts, actor, action, target, details, ip_hash, prev_hash, hash}` where
  `hash = SHA-256(prev_hash ‖ canonical(row))`. `GET /api/admin/audit/verify` recomputes the chain.

## 5. Realtime design (WebSockets)

1. Client: `POST /api/rooms/:id/ticket` (bearer auth). Worker rate-limits, then calls
   `RoomDO.issueTicket(userId)`. The DO checks membership and returns a random 256-bit ticket;
   it stores only `SHA-256(ticket)`, `userId`, `expiresAt = now + 30 s`.
2. Client opens `wss://api…/api/rooms/:id/ws` with subprotocols `["croco.v1", "t.<ticket>"]`.
   Tickets are never placed in URLs, so they do not appear in access logs.
3. Worker checks `Origin` against the environment allowlist (CSWSH defence), then forwards to the
   DO. The DO consumes the ticket (single use), re-checks membership, accepts the socket with
   subprotocol `croco.v1` via the Hibernation API and tags it with the user id.
4. Every frame: ≤ 4 KB, JSON parse in try/catch, Zod discriminated-union schema (strict),
   token-bucket rate limit, authorization (seat/host), game-state checks (`rev`, action id).
5. One live socket per user per room: a newer authenticated socket supersedes the old one
   (closed with code 4001) — prevents two devices controlling a seat.
6. Server→client frames carry a per-room `seq`; game updates carry the authoritative `rev`.
   Each player receives **only** `engine.view(state, seat)`; spectators receive the public view.

## 6. Game integrity design

* Engines are pure functions in `packages/game-engine` with no I/O; the DO owns the state.
* RNG: `cryptoRng()` uses `crypto.getRandomValues` (Uint32) with rejection sampling for unbiased
  integers; Fisher–Yates shuffle. A seeded RNG exists only in test helpers and is not exported
  from the production entry points.
* Hidden information is never serialized to a client that is not entitled to it. Bots receive the
  same seat view a human would.
* Timers and bot moves are scheduled with DO alarms; when an alarm fires it re-validates
  `rev`, the actor and whether the seat is still bot-controlled before acting.
* Ratings are updated only by the DO's `finalizeMatch` path, never via a public endpoint.

## 7. Data protection

| Data | Stored where | Protection | Retention |
|---|---|---|---|
| Firebase uid | D1 `users.firebase_uid` (never returned by public APIs) | — | Account lifetime |
| Email | D1 `users.email` (admin-visible only) | Minimization | Account lifetime |
| IP address | **Not stored raw.** HMAC-SHA-256 (`IP_HASH_KEY`) truncated, plus coarse country from `cf.country` | Pseudonymised | 90 days (security events) |
| Login history | `user_sessions` | Owner + admin only | 90 days after last seen |
| Room password | RoomDO storage only, PBKDF2-SHA-256 (salted) | Never leaves the DO | Room lifetime |
| Chat | RoomDO SQLite, last 200 messages | Room members only | Room lifetime / 7 days |
| Hidden game state | RoomDO storage | Never sent unredacted | Until match end; finished matches keep only final results + public event log |
| TOTP secret | D1 encrypted | AES-256-GCM | Until removed |
| Audit log | D1 append-only | Hash chain | 1 year |

## 8. Free-tier limits (verified 2026-11-25) and their security impact

| Service | Free limit | Impact | Handling |
|---|---|---|---|
| Workers | 100,000 requests/day, 10 ms CPU per invocation | Quota DoS; CPU budget limits PBKDF2 cost | Rate limits; PBKDF2 iterations tuned (see R7); 503 with `Retry-After` |
| Durable Objects | SQLite-backed only; 100,000 requests/day; 5 GB storage | WS messages count toward requests | Hibernation API; small messages; per-connection rate limits |
| D1 | 5 M rows read/day, 100 k rows written/day, 500 MB/database, Time Travel 7 days | Write quota DoS; limited backup window | Bounded writes per match; chat not stored in D1; scheduled encrypted export |
| Rate Limiting binding | GA; per-location counters, periods of 10 s or 60 s | Not globally exact | Combined with DO-local exact limits for critical paths (room passwords, MFA uses D1 counts) |
| Firebase Auth (Spark) | Email/password, Google, Facebook free; **TOTP MFA requires paid Identity Platform** | Admin MFA | Application-level TOTP (§4) |
| GitHub Pages | No custom response headers | No CSP header, no frame-ancestors | Demo only; meta CSP; production on Cloudflare Pages `_headers` |

These limits are **not** a guarantee of availability under attack. The project does not claim
protection against volumetric DDoS beyond what Cloudflare's free plan provides.
