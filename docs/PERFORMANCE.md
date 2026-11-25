# Croco Games — Performance & Low-End Hardware Engineering

This document records the measured performance of **Croco Games**, the architectural decisions made specifically for weak office computers and mobile devices, and the automated gates that prevent performance regressions.

All numbers in this document come from real builds and automated browser runs — nothing is estimated or extrapolated.

---

## 1. Reference Low-End Hardware Profile

Per project requirements, the primary optimization target is a conservative office workstation rather than a modern developer machine:

- **CPU**: Dual-core or modest quad-core office CPU (simulated via Chromium CDP `Emulation.setCPUThrottlingRate: 4`)
- **RAM**: 4 GB system memory
- **Graphics**: Integrated GPU (no WebGL / 3D dependency)
- **Display**: `1366x768` office laptop viewport
- **Browser**: Chromium-based browser
- **Additional targets**: Tablet (`768x1024`), smartphone portrait (`390x844`), smartphone landscape (`844x390`)

---

## 2. Measured Bundle Sizes (Production Build — Before vs. After Visual Redesign)

Measured by `node scripts/bundle-budget.mjs` (gzip level 9) against the Cloudflare Pages production build (`pnpm build`):

| Asset Category | Budget | Before Redesign | After Redesign (gzip) | Status |
|---|---|---|---|---|
| Initial JavaScript (entry + modulepreloads) | <= 200.0 KB | 120.0 KB | **129.0 KB** → **128.5 KB** after the realistic-table redesign (2026-11-25, measured on the `--mode pages` build) | Pass |
| Initial CSS | <= 100.0 KB | 6.7 KB | **12.4 KB** → **10.4 KB** after the realistic-table redesign; table materials (felt, wood, cards, chips, tiles) moved to a lazy **7.4 KB** `GameBoard` CSS chunk | Pass |
| Per-route / per-game lazy chunks (excl. Firebase SDK) | <= 60.0 KB | 0.2 – 20.2 KB | **0.2 – 20.2 KB** (game boards 2.12–3.94 KB, game engines 2.0–4.3 KB) | Pass |
| Total lazy chunks | — | 41 chunks | **56 chunks** | Code-split |

### Lazy-Loaded Game Engine Isolation

Opening the dashboard or practice menu downloads **zero** game engines and **zero** Firebase SDK code. Selecting a game downloads only that game's engine chunk and its UI board component:

- `joker`, `japanese_joker`, `bura3`, `bura5`, `poker` (`holdem`/`shortdeck`/`omaha`/`omaha_hilo`), `dominoes`, `backgammon` are each dynamically imported through `@croco/game-engine/registry` (`import()` per game).
- Each board UI (`JokerBoard`, `JapaneseJokerBoard`, `BuraBoard`, `PokerBoard`, `DominoBoard`, `BackgammonBoard`) is lazy-loaded via `React.lazy` in `apps/web/src/games/GameBoard.tsx`.
- Individual engine chunks range from **2.0 KB to 4.3 KB gzipped** (`dominoes` ~2.0 KB, `bura5` 2.4 KB, `japanese_joker` 2.6 KB, `backgammon` 3.0 KB, `bura3` 3.1 KB, `joker` 3.3 KB, `poker` 4.3 KB).
- The Firebase Auth SDK (`35.1 KB + 9.6 KB = 44.7 KB gz`) is lazy-loaded only when backend authentication is configured and invoked (`apps/web/src/lib/firebase.ts`), never on the initial paint of the static demo or practice screens.
- Browser code imports `@croco/shared/client` (Zod-free pure TypeScript helpers and constants), keeping `zod` completely out of the initial frontend bundle.

The budget check is enforced in CI (`.github/workflows/ci.yml`) via `node scripts/bundle-budget.mjs`.

---

## 3. Measured Runtime Performance (4x CPU Throttle, 1366x768)

Executed via Playwright (`apps/web/e2e/performance.spec.ts`) in Chromium with **service workers blocked** (cold load), **4x CDP CPU throttling**, and **`1366x768`** viewport while actively running a 4-player Joker table against bots:

| Metric | Target / Gate | Before Redesign | After Redesign (Cold 4x CPU) | Status |
|---|---|---|---|---|
| Cold initial load to interactive practice catalog (`/#/practice`) | < 10,000 ms (4x CPU) | 3,078 ms | **1,536 ms** | Pass |
| `DOMContentLoaded` (4x CPU) | — | 1,342 ms | **371 ms** | Pass |
| Active table frame rate (1 s `requestAnimationFrame` window, 4x CPU) | >= 20 FPS (aim >= 30 FPS) | 61.7 FPS | **54.4 FPS**; realistic tables: **39.9 FPS** in the first second (board mount + card deal), **60 FPS steady** | Pass |
| Active DOM node count on 4-player Joker table | < 1,500 nodes | 200 nodes | **485 nodes** → **472 nodes** | Pass |
| Chromium `JSHeapUsedSize` (CDP `Performance.getMetrics`) | < 120 MB | 5.7 MB | **5.7 MB** → **6.1 MB** | Pass |
| Lazy chunk isolation assertion (opening Joker excludes Poker, Backgammon, Dominoes, Bura) | Strictly isolated | Verified | Verified via network response inspection | Pass |

### Realistic tables — steady state per game (2026-11-25)

Production build, 1366x768, 4x CPU throttle, service workers blocked; first second after opening the table and again 2.5 s later:

| Game | First second | Steady state | DOM nodes | JS heap |
|---|---|---|---|---|
| Joker | 39.6 FPS (max frame 210 ms) | 60.9 FPS (max 17 ms) | 484 | 5.2 MB |
| Japanese Joker | 48.7 FPS | 60.4 FPS | 634 | 5.4 MB |
| Bura (3) | 60.9 FPS | 60.3 FPS | 316 | 4.7 MB |
| Bura (5) | 60.4 FPS | 60.2 FPS | 344 | 4.7 MB |
| Texas Hold'em | 54.4 FPS | 60.3 FPS | 334 | 5.1 MB |
| Omaha | 55.6 FPS | 60.5 FPS | 412 | 5.4 MB |
| Dominoes | 59.2 FPS | 60.2 FPS | 441 | 4.9 MB |
| Backgammon | 57.7 FPS | 60.5 FPS | 530 | 5.6 MB |

The first-second dip on the card tables is the board mounting plus the staggered deal animation; nothing animates once the table is idle.

---

## 4. Responsive Layout & Zero Horizontal Overflow Verification

Tested across four viewports on `/#/practice`, `/#/practice/joker`, `/#/practice/holdem`, and `/#/practice/backgammon` after each board finishes rendering (`apps/web/e2e/performance.spec.ts`):

| Viewport Profile | Dimensions | Measured Horizontal Overflow (`scrollWidth - clientWidth`) | Status |
|---|---|---|---|
| Office laptop | `1366x768` | <= 1 px (0 px overflow) | Pass |
| Tablet | `768x1024` | <= 1 px (0 px overflow) | Pass |
| Mobile portrait | `390x844` | <= 1 px (0 px overflow) | Pass |
| Mobile landscape | `844x390` | <= 1 px (0 px overflow) | Pass |

Adaptive layout highlights:

- **Desktop**: Persistent top navigation, room browser grid, table board alongside sticky `320px` chat rail.
- **Tablet & Mobile**: Collapsible mobile navigation bar, collapsible room/game chat toggle (`lg:hidden`), minimum touch targets (`min-h-11` / `min-w-11` on buttons and cards), adaptive card fans and backgammon SVG point scaling.

---

## 5. Architecture Choices for Weak Hardware & Low Bandwidth

1. **Zero Canvas / Zero WebGL / Zero Physics Engine**: Cards, dominoes, chips, and backgammon points are rendered with semantic HTML/SVG and lightweight CSS classes (`apps/web/src/styles.css`). This keeps DOM counts around ~200 nodes and JS heap under 10 MB.
2. **GPU-Friendly CSS Transitions Only**: Animations use `transform` and `opacity` only (`fade-in`). Heavy `backdrop-filter`, continuous blur animations, particle systems, and animated box-shadow glows are avoided.
3. **Reduced-Motion & Background-Tab Pausing**:
   - `@media (prefers-reduced-motion: reduce)` disables animations and transitions (`apps/web/src/styles.css`).
   - `document.addEventListener("visibilitychange", ...)` in `apps/web/src/App.tsx` toggles `data-hidden="true"` on `<html>`, and CSS pauses decorative animations whenever the browser tab is hidden.
4. **Route-Level Code Splitting**: Every top-level page (`Dashboard`, `Rooms`, `RoomPage`, `Leaderboards`, `Friends`, `Notifications`, `Settings`, `Admin`, `Practice`, `Invite`, `Login`, `Verify`, `Setup`) is dynamically imported via `React.lazy`.
5. **Efficient State & Networking**:
   - Durable Object WebSocket Hibernation API (`RoomDO`, `LobbyDO`) minimizes backend memory and CPU billing between moves.
   - Room connections use exponential reconnect backoff (`apps/web/src/hooks/useRoom.ts`), bounded chat buffers, and sequence-numbered state updates.
   - No client polling loops when WebSockets are active; static hashed assets in `/assets/*` ship with `Cache-Control: public, max-age=31536000, immutable`.
6. **PWA Static Shell Caching (Strictly Non-Authoritative)**:
   - `apps/web/public/sw.js` caches only static assets and the HTML shell so repeat visits load rapidly on office networks and local practice continues working offline.
   - `/api/*` and WebSocket upgrades are explicitly bypassed so offline mode never fakes or queues live multiplayer actions.

---

## 6. How to Reproduce Performance Measurements

```bash
# 1. Production build + gzip bundle budget verification
pnpm build
node scripts/bundle-budget.mjs

# 2. 4x-CPU-throttled CDP benchmark + 4-viewport overflow check
pnpm --filter @croco/web exec playwright test e2e/performance.spec.ts
```

On Windows machines with Chrome installed locally (without downloading Playwright's bundled Chromium), prefix with `PW_CHANNEL=chrome`:

```powershell
$env:PW_CHANNEL = "chrome"
pnpm --filter @croco/web exec playwright test e2e/performance.spec.ts
```

---

## 7. Known Performance Limitations & Future Profiling

- **Multi-user live load testing**: The automated Playwright benchmark tests cold loading, 4x CPU rendering, lazy chunk isolation, and local bot gameplay. Full staging load testing under concurrent Cloudflare Durable Object rooms and D1 writes (e.g., 50+ concurrent WebSocket players on the Cloudflare Workers free tier) has not yet been executed against a live deployed environment and must be verified on staging before broad rollout.
- **Older physical mobile hardware**: Automated mobile testing runs on Playwright Chromium emulating `Pixel 7` / `390x844` and `844x390` viewports. Spot-checking on physical budget Android and iOS devices on staging is recommended prior to launch.
