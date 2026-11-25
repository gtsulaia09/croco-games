# Croco Games — System Architecture

## 1. Monorepo Structure

```text
croco-games/
├── apps/
│   ├── web/                     # React 19 + TypeScript + Vite 8 + Tailwind CSS v4 SPA (PWA)
│   │   ├── e2e/                 # Playwright desktop + mobile E2E and 4x-CPU performance tests
│   │   ├── public/              # icon.svg, manifest.webmanifest, sw.js (shell-only offline cache)
│   │   └── src/
│   │       ├── components/      # AppShell, ChatPanel, reusable UI primitives (ui.tsx)
│   │       ├── games/           # 6 lazy-loaded game board families + declarative options
│   │       ├── hooks/           # useRoom WebSocket room state hook
│   │       ├── i18n/            # Georgian (ka, default) & English (en) dictionaries + parity tests
│   │       ├── lib/             # api.ts, config.ts, firebase.ts (lazy), socket.ts (TicketSocket)
│   │       ├── pages/           # 13 lazy-loaded routes (Dashboard, Rooms, RoomPage, Admin, etc.)
│   │       └── store/           # Zustand session & lobby presence store
│   └── worker/                  # Cloudflare Worker (Hono) + Durable Objects + D1 integration
│       ├── src/
│       │   ├── http/            # Perimeter middleware (CORS, headers, JSON caps, rate limiting)
│       │   ├── lobby/LobbyDO.ts # Singleton Durable Object: presence & live notifications
│       │   ├── room/RoomDO.ts   # Per-room Durable Object: authoritative game engine, chat, bots, timers
│       │   ├── routes/          # public, me, social, rooms, leaderboards, admin
│       │   └── *.ts             # auth, audit, db, env, notify, ratings, settings, users
│       └── test/                # Miniflare/workerd Vitest integration & security test suites
├── packages/
│   ├── game-engine/             # 10 pure, deterministic, server-authoritative game engines + CSPRNG
│   ├── security/                # Firebase JWT verify (jose), RFC 6238 TOTP (@oslojs/otp), WebCrypto
│   └── shared/                  # Zod strict schemas, limits, protocol DTOs, zod-free `/client` entry
├── database/migrations/         # Cloudflare D1 SQL migrations (0001_initial_schema.sql)
├── docs/                        # Security package, architecture, game rules, deployment, performance, testing
├── scripts/                     # security-checks.mjs, bundle-budget.mjs, generate-sbom.mjs
└── .github/workflows/           # CI + security scans, GitHub Pages demo, Cloudflare deploy, D1 backup
```

## 2. High-Level Request & Realtime Flow

1. **Static Frontend Delivery**:
   - **Production / Staging**: Cloudflare Pages serves hashed immutable assets and emits `_headers` (strict CSP, `frame-ancestors 'none'`, HSTS, COOP, CORP, `nosniff`).
   - **Live Demo**: GitHub Pages serves the same source built with `--mode pages` (meta CSP + frame-busting). Without a configured demo API backend, all online routes redirect cleanly to clearly labelled local Practice Mode against bots.
2. **REST API (`apps/worker/src/index.ts`)**:
   - Hono router validates configuration fail-closed, enforces exact-origin CORS, rate limits, and verifies Firebase ID tokens via `jose`.
   - Routes read/write Cloudflare D1 using prepared statements and invoke `RoomDO` / `LobbyDO` via typed Durable Object RPC methods.
3. **Real-Time Multiplayer (`RoomDO`)**:
   - Each room has a dedicated SQLite-backed Durable Object (`idFromName(roomId)`), providing a single-threaded, strongly consistent authority for seats, chat, turn timers, bot scheduling, and game state.
   - Clients authenticate WebSocket upgrades with a single-use 30-second ticket via `Sec-WebSocket-Protocol: croco.v1, t.<ticket>`.
   - Zero-CPU Hibernation API auto-responds to `{"type":"hb"}` heartbeats.
4. **Presence & Push Notifications (`LobbyDO`)**:
   - Singleton Durable Object tracks authenticated online/away/in-game sockets per user (capped at 5 tabs/devices), pushes persisted and ephemeral notifications, and fans out presence updates exclusively to friends of users with `showOnline = true`.

## 3. Game Engine Architecture (`packages/game-engine`)

Every game implements the unified `GameEngine<State, Action, Config, View>` contract (`packages/game-engine/src/core/engine.ts`):

- **Pure & immutable**: `create`, `apply`, `view`, `legalActions`, `actors`, `isOver`, `outcome`, `timeoutAction`, `bot`.
- **Zero UI coupling**: rules live strictly in `packages/game-engine`; UI boards in `apps/web/src/games/` render only the redacted `View`.
- **Unbiased CSPRNG**: `cryptoRng()` uses `crypto.getRandomValues(Uint32Array)` with rejection sampling and Fisher–Yates shuffle. Deterministic `seededRng()` exists exclusively in `packages/game-engine/src/testing/` and is never imported by production code.
- **Lazy loading on client**: `@croco/game-engine/registry` uses dynamic `import()` per game so practice mode downloads only the selected game's engine chunk (2–4.5 KB gzipped). Online multiplayer rooms never download engine code at all — only the board UI chunk.

## 4. Disconnect, Bot Takeover & Cross-Device Recovery

1. **Disconnect detection**: when a player's room WebSocket closes (`webSocketClose`/`webSocketError`), `RoomDO` marks the seat `connected = false`, records `disconnectedAt`, broadcasts room status, and schedules a Durable Object `alarm()` for `disconnectedAt + disconnectGraceMs` (default 30s).
2. **Temporary bot takeover**: when the grace period expires, `alarm()` sets `seat.botControlled = true`, posts a `bot_took_over` system message, and runs the game's `medium` bot strategy using `engine.botView` / `engine.view` on that seat's turns so the match continues without stalling other players.
3. **Cross-device recovery**:
   - When the user logs in from any device (e.g. phone after desktop crash), `GET /api/me` and `GET /api/me/active-game` return `activeRoomId` from D1 (`room_members WHERE left_at IS NULL`).
   - Dashboard shows a prominent **Return to game** banner linking to `#/room/:roomId`.
   - Connecting to `RoomDO` supersedes any stale socket (`4001`), sets `seat.connected = true` and `seat.botControlled = false`, cancels pending bot execution via `rescheduleTurn(true)`, and delivers a fresh `hello` frame with the player's private cards, score, round, deadline, and last 50 chat messages.
4. **Explicit leave during match**: clicking **Leave room** during an active match asks confirmation, marks the seat `forfeited = true`, lets a bot finish the seat so other players' match completes cleanly, and scores the forfeiting player in last place.

## 5. Rating & Leaderboard Architecture (`apps/worker/src/ratings.ts`, `routes/leaderboards.ts`)

- **Authoritative only**: ratings change exclusively inside `RoomDO.finishMatch()` → `finalizeMatch()` in a single atomic D1 batch.
- **Multi-player Elo**: every human pair in a match is scored pairwise by placement (`1` win, `0.5` tie, `0` loss) with `K = 32 / (humans - 1)` starting at `1500`. Bots never affect ratings; matches with fewer than 2 humans are recorded as unrated.
- **Anti-farming & anomaly signals**: the same human pair contributes to rated deltas at most **5 times per 24h per game**; further games between them on the same day yield `0` rating delta and flag `pair_farming` at 2× the cap. Sustained ≥ 90% win rate over ≥ 30 rated matches raises an `abnormal_win_rate` flag for human moderator review (never automatic punishment).
- **Established leaders**: players require ≥ **10 rated matches** in a game before counting as an established #1 leader on Dashboard cards or Global rankings.
- **Global leaderboard normalization**: raw ratings from unrelated games are **never summed**. Each established player's rank in a game converts to a normalized percentile (`100` for #1 down to `0`); Global rank orders by `(gamesLed DESC, averagePercentile DESC, gamesRanked DESC)`.
