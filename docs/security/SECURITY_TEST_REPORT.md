# Croco Games — Security Verification & Test Report

**Report Date**: 2026-11-25  
**Target**: Croco Games Monorepo (`apps/web`, `apps/worker`, `packages/security`, `packages/shared`, `packages/game-engine`)  
**Security Target**: OWASP ASVS 5.0.0 Level 2 baseline, with Level 3 controls on authentication, authorization, Admin protection, cryptography, and authoritative game integrity (see `docs/security/ASVS_CHECKLIST.md`).

---

## 1. Executive Summary & Honesty Disclaimer

This report documents the automated security testing, static analysis, code review, and hardening remediation performed on the Croco Games codebase prior to staging deployment.

> **Important Release Gate Notice**:
> 1. **No independent human-led penetration test has been conducted yet.** This document reflects internal engineering code review and automated test verification only. Production release MUST wait until an independent cybersecurity specialist conducts a penetration test against a deployed staging environment and signs off on all findings.
> 2. **Local Windows runtime limitation for `@croco/worker` integration tests**: All 7 `@croco/worker` integration and security test suites (57 test cases, including `apps/worker/test/security-hardening.test.ts`) pass strict TypeScript compilation and ESLint static analysis, but **could not be executed on the local Windows workstation** because the host's `C:\Windows\System32\msvcp140.dll` (`14.28.29910.0`, Visual C++ 2019) crashes Cloudflare `workerd` (`0xc0000005` access violation). Those suites are wired into `.github/workflows/ci.yml` on `ubuntu-latest` and MUST be executed and observed passing in Linux CI (or after upgrading the Windows host's VC++ Redistributable to v14.40+) before staging promotion.
> 3. **No software system is unbreakable.** Residual risks and free-tier infrastructure limits are documented openly in Section 6 and in `docs/security/THREAT_MODEL.md`.

---

## 2. Verification Coverage & Executed Results

### 2.1 Static Analysis, Secret Scanning & Build Security

| Check | Command / Tool | Status | Evidence |
|---|---|---|---|
| ESLint static analysis | `pnpm lint` | **PASS** | 0 errors, 0 warnings across all 5 workspaces |
| Strict TypeScript checking | `pnpm typecheck` | **PASS** | 0 errors across `@croco/web`, `@croco/worker` (incl. `test/*.test.ts`), `@croco/game-engine`, `@croco/shared`, `@croco/security` |
| Custom security gate | `pnpm run check:security` (`scripts/security-checks.mjs`) | **PASS** | All 6 checks passed across source and built `apps/web/dist`: no hardcoded secrets/private keys, no SQL template interpolation in D1 queries, no tracked `.env` files, strict `VITE_*` allowlist, no `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`, no `Math.random()` in game engines, no secret patterns in built bundle |
| Production security headers | `apps/web/vite.config.ts` -> `apps/web/dist/_headers` | **PASS** | Verified emitted `_headers` contains strict CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`, no `unsafe-inline`/`unsafe-eval`), HSTS (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP |
| Dependency vulnerability scan | `pnpm audit` | **PASS** | **0 vulnerabilities** (critical: 0, high: 0, moderate: 0, low: 0) |
| SBOM generation | `pnpm run sbom` (`scripts/generate-sbom.mjs`) | **PASS** | CycloneDX 1.5 JSON (`docs/security/sbom.cdx.json`): 389 components (27 runtime, 362 dev), licenses inventoried |
| CI external scanners (Gitleaks, OSV-Scanner, Semgrep CE) | `.github/workflows/ci.yml` | **CONFIGURED (CI)** | Configured with SHA-pinned actions; executes on `ubuntu-latest` on push/PR |

### 2.2 Executed Automated Security & Functional Tests

| Suite | Scope | Executed | Passed | Failed |
|---|---|---:|---:|---:|
| `@croco/security` (`security.test.ts` + `hardening.test.ts`) | RS256 Firebase JWT verification, multi-`kid` JWKS key rotation, algorithm/audience/issuer/expiry rejection, AES-256-GCM unique IVs & ciphertext tamper rejection, PBKDF2-SHA256 room password & NFC normalization, TOTP RFC 6238 & replay rejection, backup codes, HMAC WS ticket binding/expiry, origin spoofing/malformed URL rejection, API security headers & Turnstile CSP, deep log redaction & recursion cap | 33 | **33** | 0 |
| `@croco/shared` (`validation.test.ts`) | Username canonicalization, reserved-name blocking, control/homoglyph rejection, Zod schema strictness & bounds | 31 | **31** | 0 |
| `@croco/game-engine` (8 files incl. `core/security.test.ts`) | CSPRNG Fisher-Yates shuffle, all 10 game rulesets, spectator/opponent private-card redaction across all 10 games, out-of-turn action immutability across all 10 games, bot legal action validation at `easy`/`medium`/`hard` for all 10 games | 129 | **129** | 0 |
| `@croco/web` Vitest (`i18n.test.ts`) | Georgian (`ka`) / English (`en`) key parity | 4 | **4** | 0 |
| `@croco/web` Playwright E2E (`demo.spec.ts`, `practice.spec.ts`, `performance.spec.ts`) | Strict CSP verification, clickjacking `<iframe>` self-wipe refusal, unconfigured demo honesty (zero fake auth/multiplayer), Georgian/English toggle, all 10 games played end-to-end on Desktop & Mobile, offline PWA shell isolation, 4x CPU throttle performance, lazy game-engine chunk isolation, zero horizontal overflow across 4 viewports | 33 (+1 intentionally skipped desktop-only CDP test on mobile) | **33** | 0 |

### 2.3 Worker Integration & Security Test Suites (Ready, Pending Linux CI Execution)

The following 7 integration suites in `apps/worker/test/` run against real Cloudflare Durable Objects (`RoomDO`, `LobbyDO`) and real D1 SQLite migrations via `@cloudflare/vitest-pool-workers`:

| Test File | Cases | Security Controls Covered | Local Status |
|---|---:|---|---|
| `perimeter.test.ts` | 7 | CORS allowlist, security headers, unknown route 404, oversized body rejection, malformed JSON handling, rate limiting | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |
| `auth.test.ts` | 12 | Firebase RS256 JWT verification, unverified email denial, suspended user lockout, profile creation, role self-escalation denial, Turnstile verification | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |
| `admin.test.ts` | 4 | `ADMIN_UID` bootstrap, TOTP MFA enrollment & step-up enforcement, backup codes, Admin suspension/audit logging | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |
| `social.test.ts` | 6 | Friends, friend requests, bilateral blocking, room invitations, notifications, privacy filtering | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |
| `rooms.test.ts` | 13 | Public/password/invite-only room joins, WS tickets, hidden card isolation, host controls, chat, disconnect -> bot takeover -> cross-device reconnect | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |
| `ratings.test.ts` | 5 | Server-verified match completion, rating updates, per-game & global leaderboards, leader gap calculation | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |
| `security-hardening.test.ts` | 10 | Default-deny sweep across ~50 protected routes, fail-closed `loadConfig`, host-block enforcement on room join, cross-room invite-code isolation, non-host command rejection & chat mute enforcement, LobbyDO WS auth & friend-only presence, spectator/opponent redaction across Hold'em/Omaha/Japanese Joker/Dominoes, moderator least privilege, SQLite append-only audit log triggers, platform settings gates & room/report rate caps | Typechecked & linted; **pending Linux CI / VC++ 14.40+ run** |

---

## 3. Hardening Review Findings & Remediations

Every issue discovered during code review and security/E2E testing was fixed and regression-tested:

| ID | Severity | Component | Description | Remediation | Verification / Retest |
|---|---|---|---|---|---|
| **FIND-01** | **High** | `apps/worker/src/routes/rooms.ts` | `POST /api/rooms/:id/join` did not enforce bilateral host blocking (`isBlockedEitherWay`) or reject closed rooms before consuming invite links / invoking `RoomDO.join`, creating an authorization discrepancy against `AUTHORIZATION_MATRIX.md`. | Added D1 `rooms` status/host lookup and `isBlockedEitherWay(c.env.DB, hostRow.host_id, user.id)` check before invite-link consumption and Durable Object handoff. | Regression test added in `apps/worker/test/security-hardening.test.ts`; typechecked & linted (execution pending Linux CI). |
| **FIND-02** | **Medium** | `scripts/security-checks.mjs` | Used `new URL("..", import.meta.url).pathname` (producing `/C:/...` on Windows) and raw backslash paths when filtering `apps/worker/src` and `apps/web/src`, causing the script to crash on Windows and silently skip SQL-interpolation and `VITE_*` allowlist checks on Windows hosts. | Replaced with `fileURLToPath()` and POSIX path normalization (`.replace(/\\/g, "/")`) plus `basename()` matching. | Verified on Windows: `pnpm run check:security` now scans all source and built files cleanly with 0 false passes. |
| **FIND-03** | **Medium** | `apps/web/src/pages/Setup.tsx` | Backend `POST /api/me/profile` supported Cloudflare Turnstile anti-abuse verification when `TURNSTILE_SECRET` is set, but the profile setup UI did not render the Turnstile widget or submit `turnstileToken`. | Added conditional Turnstile explicit widget rendering (`config.turnstileSiteKey`) with matching CSP allowlist in `apps/web/vite.config.ts` and `packages/security/src/hardening.test.ts`; zero external requests when unconfigured. | Typechecked, linted, CSP test passes in `@croco/security`. |
| **FIND-04** | **Medium** | `apps/web/src/pages/Practice.tsx` | Navigating directly from one practice game to another (e.g. `/#/practice/joker` -> `/#/practice/holdem` -> `/#/practice/backgammon`) reused the mounted `PracticeGame` instance and momentarily passed the previous game's state into the new board component, crashing `PokerBoard` and `BackgammonBoard` with unhandled `TypeError`s. | Added `key={gameType}` to `<PracticeGame />` and synchronously reset `engine` and `state` to `null` inside `useLocalGame` when `gameType` changes. | Discovered by `apps/web/e2e/performance.spec.ts`; retested across all 4 viewports on Desktop and Mobile (**33/33 Playwright E2E passing**, 0 console/page errors). |
| **FIND-05** | **Low** | `scripts/generate-sbom.mjs` | YAML indentation regex `/^  '?([^':]+?)'?:/` matched 4-space-indented `dependencies:` keys, truncating transitive runtime dependency traversal in `docs/security/sbom.cdx.json` (undercounting runtime deps as 14 instead of 27). | Tightened key regex to `/^  '?([^\s':][^':]*?)'?:/`. | Re-ran `pnpm run sbom`; verified complete transitive closure (389 total components: 27 runtime, 362 dev). |
| **FIND-06** | **Low** | `apps/web/vite.config.ts`, `apps/web/package.json` | `build:pages` used Unix-only inline env syntax (`VITE_DEPLOYMENT=github-pages vite build`), breaking reproducible GitHub Pages demo builds on Windows. | Switched to `vite build --mode pages` and inferred `deployment = "github-pages"` from `mode === "pages"` in `vite.config.ts`. | Verified `pnpm run build:pages-demo` and Playwright `webServer` succeed cleanly on Windows. |
| **FIND-07** | **Low** | `apps/web/src/games/common.tsx`, `Dashboard.tsx`, `Settings.tsx`, `Rooms.tsx`, `Admin.tsx`, `AppShell.tsx` | UI completeness gaps against spec: literal `Admin` badge missing on game-board `SeatTag` / Dashboard / Settings, Player ID missing in Settings, maintenance banner missing in `AppShell`, Room Details & Join-by-Invite-Code dialogs missing in `Rooms`, and live Online Users + Room Kick missing in `Admin`. | Implemented all missing UI elements backed by existing authorized server APIs (`/api/config/public`, `/api/admin/online`, `/api/admin/rooms/:id/kick`, `/api/rooms/:id/join`) with matching `ka`/`en` i18n keys. | `i18n.test.ts` (4/4), `pnpm typecheck`, `pnpm lint`, and Playwright E2E all pass. |

**Open Critical / High Vulnerabilities in Codebase**: **0** (FIND-01 remediated; subject to Linux CI execution of `apps/worker/test/` and independent staging pentest).

---

## 4. OWASP ZAP Staging Scan Playbook

Once staging is deployed (`https://staging-api.<domain>` and `https://staging.<domain>`), run OWASP ZAP baseline and API scans using free Docker images before inviting external testers:

```bash
# 1. Baseline passive scan against staging Cloudflare Pages frontend
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://staging.<your-domain> \
  -J zap-web-report.json \
  -r zap-web-report.html

# 2. Baseline scan against staging Worker API public endpoints
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://staging-api.<your-domain>/api/health \
  -J zap-api-report.json \
  -r zap-api-report.html
```

Verify zero unexpected High/Medium alerts (e.g., missing CSP/HSTS/X-Frame-Options, verbose error disclosure, permissive CORS reflection).

---

## 5. Manual Staging Security Test Checklist (Pre-Production)

The independent security reviewer should explicitly verify these end-to-end scenarios against **staging**:

1. **Authentication & Session Integrity**:
   - Replay an expired or tampered Firebase ID token -> `401`.
   - Authenticate with an unverified email/password account -> blocked from all gameplay/social/admin routes.
   - Sign in as Admin (`ADMIN_UID`), confirm TOTP MFA enrollment + step-up challenge blocks destructive actions without fresh step-up.
2. **Authorization & Privilege Escalation**:
   - Attempt to call every `/api/admin/*` route as a regular player and as a moderator -> `403`.
   - Attempt to inject `"role": "admin"` or `"badges": { "admin": true }` in profile create/update payloads -> ignored/rejected.
   - Attempt to join a password room without password, an invite-only room with a code from a different room, or a room hosted by a user who blocked the caller -> `403`.
3. **WebSocket & Game Integrity**:
   - Attempt WebSocket upgrade with forged `Origin: https://evil.example` -> `403`.
   - Attempt to reuse a single-use WS ticket or use User A's ticket for Room B -> `401`/`403`.
   - Inspect every raw WebSocket frame sent to Player A, Player B, and a spectator during Hold'em, Omaha, Bura, Joker, Japanese Joker, and Dominoes -> verify zero opponent hole/hand cards or deck order ever appear in network traffic.
   - Inject forged `game.action` frames out of turn, with invalid card indices, or with client-supplied scores -> rejected; state unchanged.
4. **Input Validation, XSS & SQLi**:
   - Submit `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, and SQLi payloads (`' OR 1=1 --`) in usernames, room names, chat messages, and report reasons -> rendered safely as plain text, zero SQL errors.
   - Verify framing the staging frontend inside an attacker `<iframe src="...">` is blocked by both `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
5. **Rate Limiting & Abuse**:
   - Exceed login/ticket/chat/report/room-creation thresholds -> `429` returned cleanly without crashing Worker or leaking stack traces.
6. **Backup & Recovery**:
   - Trigger `.github/workflows/backup-d1.yml` against staging D1, confirm encrypted backup artifact passes SQLite `PRAGMA integrity_check` and `PRAGMA foreign_key_check` and decrypts cleanly with the passphrase.

---

## 6. Residual Risks & Free-Tier Infrastructure Limitations

Documented transparently per strict engineering policy:

1. **Cloudflare Free-Tier Rate Limiting**: Application-layer rate limiting uses D1/Durable Object counters and optional Turnstile rather than Cloudflare Enterprise Advanced Rate Limiting / Bot Management. Distributed volumetric L7 DDoS attacks could exhaust free Workers daily request quotas (100,000 requests/day) before application rate limits trigger. Mitigation: Cloudflare Free WAF custom rules (5 free rules) and Under Attack Mode if needed.
2. **Firebase Auth Spark Plan**: Email verification, Google/Facebook OAuth, and token signing are provided on Firebase Spark, whereas Firebase Identity Platform native SMS/TOTP MFA requires upgrading to Blaze. Croco Games therefore implements TOTP MFA + single-use backup codes + step-up challenges natively on the Worker (`packages/security/src/totp.ts` + AES-256-GCM encrypted secrets in D1) so Admin MFA works 100% on the free tier.
3. **GitHub Pages Static Headers**: GitHub Pages cannot emit custom HTTP response headers (`frame-ancestors`, HSTS preload, `X-Frame-Options`). The GitHub Pages demo (`--mode pages`) is therefore strictly an **isolated local-practice-only build** with no backend credentials, a build-injected `<meta http-equiv="Content-Security-Policy">`, and runtime frame-busting self-wipe (`apps/web/src/main.tsx`), verified by `e2e/demo.spec.ts`. Production runs exclusively on Cloudflare Pages with full HTTP `_headers`.
4. **D1 Automated Point-in-Time Recovery**: Production D1 backups rely on `.github/workflows/backup-d1.yml` (daily scheduled encrypted snapshots with automated restore/integrity verification) plus Cloudflare D1 Time Travel (free-tier 7-day retention window).

---

## 7. Sign-Off Gate

| Gate | Status |
|---|---|
| Phase 0 Security Design Review (`docs/security/DESIGN_REVIEW.md`) | Complete |
| Static Analysis, Custom Security Checks, Dependency Audit, SBOM | Complete (Pass) |
| Unit, Engine Security, i18n, and Playwright E2E + Performance Suites | Complete (Pass) |
| `@croco/worker` Miniflare Integration & Security Suites on Linux CI | **Required before staging sign-off** (blocked locally by Windows `msvcp140.dll` 14.28) |
| Staging Deployment, OWASP ZAP Scan & Backup Dry Run | **Required before production release** |
| Independent Human-Led Penetration Test & Security Sign-Off | **Required before production release** |
