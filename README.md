# Croco Games

**Security-first, low-end-PC-optimized online multiplayer card and board game platform.**

Built as a TypeScript monorepo targeting **OWASP ASVS 5.0.0 Level 2** (with Level 3 controls for authentication, authorization, administrator MFA, cryptography, and game integrity) and designed to run entirely on **free-tier infrastructure** (Cloudflare Pages, Workers, Durable Objects, D1, Firebase Authentication Spark, and GitHub Pages for the isolated live demo).

---

## Games Implemented (10 Independent Engines)

Every game runs as a pure, server-authoritative engine in `packages/game-engine` with cryptographically secure randomness (`crypto.getRandomValues` + rejection sampling), per-seat private card redaction, 3 bot difficulty levels (`easy`, `medium`, `hard`), individual statistics, match history, and dedicated leaderboards:

1. **Joker (`joker`)** — Georgian 4-player classic (standard 24-hand 4-set schedule + Nines variant, dealer bid restriction, high/low jokers, hist penalty, set bonuses)
2. **Japanese Joker (`japanese_joker`)** — Distinct 2-player Georgian game (open/hidden 5-pile table cards, joker demands, ½-point scoring)
3. **Bura — Three-Card (`bura3`)** — 36/32-card deck, closed discards, 31+ opening claims, Bura & optional combinations
4. **Bura — Five-Card (`bura5`)** — Independent 5-card engine played to the last card with Kozel-style penalty scoring
5. **Texas Hold'em (`holdem`)** — Virtual chips only, blinds/antes, No/Pot/Fixed Limit, side pots, full showdown evaluation
6. **Short Deck / 6+ Hold'em (`shortdeck`)** — 36-card deck (`6`–`A`), Flush > Full House, `A-6-7-8-9` wheel, configurable Trips > Straight
7. **Omaha (`omaha`)** — 4 hole cards; strict **exact-2 hole + exact-3 board** evaluation
8. **Omaha Hi-Lo (`omaha_hilo`)** — Split-pot High + qualifying 8-or-better Ace-to-Five Low
9. **Dominoes (`dominoes`)** — Double-six 28-tile set, Draw & Block variants, blocked-game detection
10. **Backgammon (`backgammon`)** — 15 checkers, server-rolled dice, bar entry, hitting, bearing off, compulsory-dice rules, doubling cube + Crawford rule

---

## Core Platform Capabilities

- **Cybersecurity & Anti-Cheat**: server-side Firebase ID token verification (`jose` RS256 + JWKS rotation), application-level session visibility & revocation, default-deny API, exact-origin CORS, strict CSP + `frame-ancestors 'none'`, Zod `.strictObject()` validation, prepared-only SQL, one-time WebSocket subprotocol tickets (CSWSH-protected), per-seat view redaction, append-only hash-chained Admin audit log.
- **Admin System**: trusted server bootstrap (`ADMIN_FIREBASE_UID` + verified `ADMIN_BOOTSTRAP_EMAIL`), mandatory RFC 6238 TOTP MFA (`@oslojs/otp`, AES-256-GCM secret encryption, replay protection, 10 one-time recovery codes), 15-minute bound step-up tokens, `moderator` vs `admin` least privilege, visible **Admin** badge across profiles, lobbies, chats, game boards, leaderboards, and admin views.
- **Social & Rooms**: Counter-Strike 1.6-style room browser with filters/search/details/password/invite-code join, friends & requests, blocking, live presence (`online` / `away` / `in_game` / `offline`), direct invitations & expiring invite links, real-time notifications, room-isolated chat with emojis/mute/report.
- **Disconnect & Cross-Device Recovery**: grace-period bot takeover during disconnects, automatic return to the original human seat on reconnect from any device, single-socket seat ownership (`4001` supersede).
- **Internationalization**: Georgian (`ka`, default) and English (`en`) with automated parity tests.
- **Low-End Office PC & Mobile First**: ~120 KB gzipped initial JS, ~6.7 KB gzipped CSS, lazy-loaded per-game engines and boards, pure CSS cards, hidden-tab animation pausing, responsive desktop/tablet/mobile layouts, shell-only PWA offline support for Practice Mode.

---

## Honest Security & Demo Posture

- **Not certified without independent testing**: automated tests and internal threat modeling prepare this repository for review by independent cybersecurity specialists. Production deployment remains gated on staging verification and independent security sign-off (see [`SECURITY.md`](SECURITY.md)).
- **GitHub Pages Demo**: built from the exact same frontend source (`--mode pages`). Without a separately configured isolated demo backend, login and multiplayer are cleanly disabled and clearly labelled as local in-browser Practice Mode against bots — never touching production data, secrets, or admin endpoints.

---

## Quick Start (Local Development)

Prerequisites: **Node.js ≥ 22.12**, **pnpm 10.28+**.

```bash
# 1. Install dependencies (exact lockfile versions)
pnpm install --frozen-lockfile

# 2. Configure local environment variables (copy placeholders from .env.example)
#    Never commit .env or apps/worker/.dev.vars

# 3. Apply local D1 migrations
pnpm --filter @croco/worker db:migrate:local

# 4. Run full verification pipeline
pnpm lint
pnpm typecheck
pnpm run check:security
pnpm test
pnpm build
node scripts/bundle-budget.mjs
pnpm run sbom

# 5. Start development servers (in separate terminals)
pnpm --filter @croco/worker dev     # API + Durable Objects on http://127.0.0.1:8787
pnpm --filter @croco/web dev        # Frontend SPA on http://127.0.0.1:5173
```

---

## Documentation Index

### Architecture, Games, Performance & Deployment
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — Monorepo, data flows, realtime multiplayer, recovery, ratings
- [`docs/architecture/DATABASE.md`](docs/architecture/DATABASE.md) — D1 schema, indexes, constraints, triggers, migrations
- [`docs/architecture/API.md`](docs/architecture/API.md) — REST API & WebSocket wire protocol reference
- [`docs/games/GAME_RULES.md`](docs/games/GAME_RULES.md) — Complete rules, variations, scoring, and bots for all 10 games
- [`docs/deployment/DEPLOYMENT.md`](docs/deployment/DEPLOYMENT.md) — 14-step Cloudflare production/staging & GitHub Pages deployment guide
- [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) — Bundle budgets and measured 4x-CPU low-end office PC profiling
- [`docs/TESTING.md`](docs/TESTING.md) — Unit, security, integration, E2E, and performance test guide

### Cybersecurity Audit Package
- [`SECURITY.md`](SECURITY.md) — Security policy, release gate, vulnerability reporting
- [`docs/security/THREAT_MODEL.md`](docs/security/THREAT_MODEL.md) — STRIDE analysis, 44 attack scenarios, residual risks R1–R7
- [`docs/security/SECURITY_ARCHITECTURE.md`](docs/security/SECURITY_ARCHITECTURE.md) — 7-layer defense-in-depth design & free-tier limits
- [`docs/security/SECURITY_CONTROLS.md`](docs/security/SECURITY_CONTROLS.md) — Implemented controls mapped to source & tests
- [`docs/security/ASVS_CHECKLIST.md`](docs/security/ASVS_CHECKLIST.md) — OWASP ASVS 5.0.0 Level 2/3 verification checklist
- [`docs/security/ATTACK_SURFACE.md`](docs/security/ATTACK_SURFACE.md) — Entry points, strict input inventory, output redaction
- [`docs/security/AUTHORIZATION_MATRIX.md`](docs/security/AUTHORIZATION_MATRIX.md) — Endpoint & WebSocket permission matrix
- [`docs/security/AUTHENTICATION_SECURITY.md`](docs/security/AUTHENTICATION_SECURITY.md) — Firebase verification, revocation, Admin TOTP MFA
- [`docs/security/API_SECURITY.md`](docs/security/API_SECURITY.md) — Perimeter, CORS, CSRF, validation, rate limits
- [`docs/security/WEBSOCKET_SECURITY.md`](docs/security/WEBSOCKET_SECURITY.md) — Tickets, CSWSH, Hibernation API, frame/replay protection
- [`docs/security/DATABASE_SECURITY.md`](docs/security/DATABASE_SECURITY.md) — Prepared SQL, triggers, minimization, retention
- [`docs/security/SECRETS_MANAGEMENT.md`](docs/security/SECRETS_MANAGEMENT.md) — Secret inventory, rotation, compromise recovery
- [`docs/security/INCIDENT_RESPONSE.md`](docs/security/INCIDENT_RESPONSE.md) — 10-step incident runbook & 10 playbooks
- [`docs/security/BACKUP_AND_RECOVERY.md`](docs/security/BACKUP_AND_RECOVERY.md) — Encrypted D1 backups & restore verification
- [`docs/security/SECURITY_TEST_REPORT.md`](docs/security/SECURITY_TEST_REPORT.md) — Executed security test evidence & staging ZAP guide
- [`docs/security/DEPENDENCY_AUDIT.md`](docs/security/DEPENDENCY_AUDIT.md) — Runtime/dev dependency audit, licenses, install-script review
- [`docs/security/sbom.cdx.json`](docs/security/sbom.cdx.json) — CycloneDX 1.5 Software Bill of Materials
- [`docs/security/DESIGN_REVIEW.md`](docs/security/DESIGN_REVIEW.md) — Phase 0 internal security design review
- [`.env.example`](.env.example) — Placeholder-only environment template
