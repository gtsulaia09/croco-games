# Croco Games — Testing & Quality Assurance Guide

This document describes every automated and manual test suite in the **Croco Games** monorepo, how to run each suite locally and in CI, and the observed results from the latest verification pass.

---

## 1. Test Suite Architecture

| Layer | Package / Location | Runner | What It Verifies |
|---|---|---|---|
| Static analysis & lint | Monorepo root | ESLint (`pnpm lint`) | TypeScript, React Hooks, unsafe patterns across all workspaces |
| Strict type checking | All 5 workspace packages | `tsc --noEmit` (`pnpm typecheck`) | End-to-end strict TypeScript types across web, worker, engines, shared, security |
| Custom security lint | `scripts/security-checks.mjs` | Node (`pnpm run check:security`) | Secret patterns, raw SQL interpolation in D1 calls, tracked `.env` files, `VITE_*` allowlist, dangerous HTML sinks (`dangerouslySetInnerHTML`/`innerHTML`/`eval`), `Math.random()` in game engines, built bundle secret leakage |
| Security primitives unit tests | `packages/security/src/*.test.ts` | Vitest | RS256 JWKS verification & key rotation, AES-GCM encryption/tamper rejection, PBKDF2 password hashing, TOTP/backup codes, HMAC WS ticket binding, origin allowlist, CSP/security headers, deep log redaction |
| Shared validation tests | `packages/shared/src/validation.test.ts` | Vitest | Username canonicalization & reserved/homoglyph checks, room/chat/report Zod schemas, bounds enforcement |
| Game engine & security tests | `packages/game-engine/src/**/*.test.ts` | Vitest | Rules, scoring, hand evaluation, tie-breakers, bot legality (easy/medium/hard), CSPRNG deck fairness, spectator/opponent hidden-card redaction, out-of-turn rejection across all 10 games |
| Web unit tests | `apps/web/src/i18n/i18n.test.ts` | Vitest | Georgian (`ka`) and English (`en`) translation key parity and interpolation safety |
| Backend integration & security tests | `apps/worker/test/*.test.ts` | Vitest + `@cloudflare/vitest-pool-workers` (Miniflare + real D1 SQLite + real Durable Objects) | Perimeter/CORS/headers/default-deny (~50 routes), Firebase auth & email verification, profile/role immutability, Admin TOTP MFA + step-up + audit log immutability, moderator least privilege, friends/requests/blocking/invitations, room lifecycle/password/invites/chat/mute/kick, WebSocket ticket/origin/hidden-card redaction, bot takeover & cross-device reconnect, server-verified ratings & leaderboards, rate limiting |
| End-to-end & performance tests | `apps/web/e2e/*.spec.ts` | Playwright (Desktop + Mobile) | Demo honesty & redirect safety, strict CSP & anti-clickjacking frame refusal, Georgian/English switching, playing all 10 games against bots through the real UI, offline PWA shell reload, 4x-CPU-throttled CDP performance benchmark (`1366x768`), lazy game-engine chunk isolation, zero horizontal overflow across 4 viewports |
| Dependency & supply chain | Root / CI | `pnpm audit`, `scripts/generate-sbom.mjs`, Gitleaks, OSV-Scanner, Semgrep | Vulnerability advisories, CycloneDX 1.5 SBOM generation, secret scanning, SAST |

---

## 2. Running Tests Locally

### Full Verification Sequence

```bash
pnpm lint
pnpm typecheck
pnpm run check:security
pnpm test
pnpm build
node scripts/bundle-budget.mjs
pnpm run sbom
pnpm audit --audit-level=moderate
```

> **Note (pnpm v10)**: Run the root `ci` script as `pnpm run ci` (not `pnpm ci`, which pnpm v10 reserves as an unimplemented subcommand).

### Individual Suites

```bash
# Unit & security tests (Node / Vitest — fast, cross-platform)
pnpm --filter @croco/security test
pnpm --filter @croco/shared test
pnpm --filter @croco/game-engine test
pnpm --filter @croco/web test

# Worker + Durable Objects + D1 integration & security tests (Miniflare / workerd)
pnpm --filter @croco/worker test

# Playwright E2E + 4x CPU performance benchmark (builds GitHub Pages demo and serves locally)
pnpm --filter @croco/web e2e

# Performance & responsive overflow spec only
pnpm --filter @croco/web exec playwright test e2e/performance.spec.ts
```

### Platform-Specific Prerequisites

- **Windows (`@croco/worker` / `workerd`)**: Cloudflare's `workerd` runtime binary requires the **latest Microsoft Visual C++ Redistributable (x64, v14.40+ / Visual Studio 2022)** (`msvcp140.dll` / `vcruntime140.dll`). Older Windows builds shipping `msvcp140.dll` v14.28 (VC++ 2019) will crash `workerd` with `0xc0000005` (access violation / stack overflow). Install the latest redistributable from Microsoft (`https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist`) or run `@croco/worker` tests in WSL2 / Linux CI (`ubuntu-latest`, configured in `.github/workflows/ci.yml`).
- **Windows (Playwright)**: If Chrome is already installed locally, you can run Playwright without downloading Chromium by setting `PW_CHANNEL=chrome` (PowerShell: `$env:PW_CHANNEL = "chrome"`).
- **Windows (PowerShell execution policy)**: If `pnpm.ps1` is blocked by execution policy, invoke `pnpm.CMD` directly.

---

## 3. Test Inventory & Latest Observed Results

| Suite | Files | Executed Tests | Result | Notes |
|---|---:|---:|---|---|
| ESLint (`pnpm lint`) | Entire repo | — | **PASS** | 0 errors, 0 warnings |
| TypeScript (`pnpm typecheck`) | All 5 packages | — | **PASS** | Strict mode across web, worker (incl. all 7 worker test files), engines, shared, security |
| Custom security checks (`pnpm run check:security`) | Source + `apps/web/dist` | 6 check categories | **PASS** | 0 violations (175 files scanned) |
| `@croco/security` | 2 (`security.test.ts`, `hardening.test.ts`) | 33 | **33 / 33 PASS** | Crypto, JWKS rotation, TOTP, tickets, origin, headers, log redaction |
| `@croco/shared` | 1 (`validation.test.ts`) | 31 | **31 / 31 PASS** | Schemas, username normalization, bounds |
| `@croco/game-engine` | 8 (core + security + 6 game suites covering all 10 games) | 129 | **129 / 129 PASS** | All 10 independent engines, bots (easy/medium/hard), hidden-state isolation, out-of-turn immutability |
| `@croco/web` (Vitest) | 1 (`i18n.test.ts`) | 4 | **4 / 4 PASS** | `ka` / `en` parity |
| `@croco/web` (Playwright E2E + Perf) | 3 (`demo.spec.ts`, `practice.spec.ts`, `performance.spec.ts`) | 34 defined | **33 PASS, 1 SKIPPED** | Desktop + Mobile; 1 desktop-only CDP 4x-CPU test intentionally skipped on `mobile` project |
| Bundle budget (`scripts/bundle-budget.mjs`) | `apps/web/dist` | 2 budgets | **PASS** | Initial JS 120.0 KB gz (<= 200 KB), CSS 6.7 KB gz (<= 100 KB) |
| Dependency audit (`pnpm audit`) | Lockfile (389 components) | — | **PASS** | 0 vulnerabilities |
| `@croco/worker` (Miniflare / workerd) | 7 (`perimeter`, `auth`, `admin`, `social`, `rooms`, `ratings`, `security-hardening` — 57 test cases) | **Not executed on local Windows host** | **BLOCKED LOCALLY (host VC++ DLL)** | Typechecked (`tsc`) & linted (`eslint`) cleanly; blocked locally by host `msvcp140.dll` `14.28.29910.0`. Configured to run on `ubuntu-latest` in `.github/workflows/ci.yml`. |

> **Honesty policy**: Tests that could not run in the local host environment (`@croco/worker` Miniflare integration suite, live staging OWASP ZAP scan, and live Firebase/Cloudflare staging end-to-end flows) are explicitly reported as **not executed locally** rather than passed.

---

## 4. CI Automation (`.github/workflows/ci.yml`)

Every push and pull request to `main` runs five parallel/staged jobs on `ubuntu-latest`:

1. **`verify`**: `pnpm lint`, `pnpm typecheck`, `pnpm run check:security`, `pnpm test` (including all 7 `@croco/worker` Miniflare suites), `pnpm build`, `pnpm build:pages-demo`, `node scripts/bundle-budget.mjs`, and CycloneDX SBOM artifact upload.
2. **`e2e`**: Builds the demo target and runs the full Playwright Desktop + Mobile suite (`demo.spec.ts`, `practice.spec.ts`, `performance.spec.ts`).
3. **`secrets`**: Runs Gitleaks (`gitleaks/gitleaks-action`) against repository history using `.gitleaks.toml`.
4. **`dependencies`**: Runs `pnpm audit --audit-level=moderate` and Google OSV-Scanner (`google/osv-scanner-action`).
5. **`sast`**: Runs Semgrep Community Edition (`p/typescript`, `p/react`, `p/owasp-top-ten`, `p/security-audit`) failing on errors.

All third-party GitHub Actions are pinned to verified 40-character commit SHAs.

---

## 5. Staging & Manual Verification Checklist

Before promoting a release to production (see `docs/deployment/DEPLOYMENT.md` and `docs/security/SECURITY_TEST_REPORT.md`):

1. Confirm all `.github/workflows/ci.yml` jobs (including `@croco/worker` Miniflare tests on `ubuntu-latest`) pass on the release commit.
2. Execute end-to-end multiplayer smoke tests on **staging** with two real Firebase accounts (Google login, Email login + verification, Facebook login once provider is configured, friend request, room creation/join, live gameplay, disconnect -> bot takeover -> cross-device reconnect, leaderboard update).
3. Verify Admin bootstrap (`ADMIN_UID` match), TOTP MFA enrollment, step-up challenge for privileged Admin actions, and immutable `admin_audit_logs` records.
4. Run OWASP ZAP baseline & OpenAPI/API checks against the staging Worker and Pages URLs.
5. Verify a D1 backup & restore dry run via `.github/workflows/backup-d1.yml`.
6. Complete independent human-led cybersecurity review and penetration testing against staging.
