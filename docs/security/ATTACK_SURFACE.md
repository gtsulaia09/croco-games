# Attack Surface Analysis

## 1. Entry points

| Entry point | Protocol | Auth | Input size cap | Notes |
|---|---|---|---|---|
| Static SPA (Cloudflare Pages / GitHub Pages) | HTTPS GET | none | n/a | Only hashed static assets; no server logic. `_headers` sets CSP etc. on Cloudflare Pages |
| `/api/*` REST | HTTPS | Bearer Firebase ID token (except 3 public routes) | 16 KB JSON | See `AUTHORIZATION_MATRIX.md` for the full route list |
| `/api/rooms/:id/ws` | WSS | one-time ticket (subprotocol) + Origin | 4 KB per frame | Hibernation API, RoomDO |
| `/api/lobby/ws` | WSS | one-time ticket (subprotocol) + Origin | 1 KB per frame | LobbyDO singleton |
| Durable Object alarms | internal | n/a | n/a | Timers, bot moves, grace periods; re-validate state |
| Firebase Auth endpoints | HTTPS (Google) | Firebase | Google | Out of our code, configured by operator |
| GitHub Actions | CI | GitHub | n/a | `push` to `main` deploys only via protected environment |
| Cloudflare dashboard / API token | HTTPS | Cloudflare account | n/a | Out-of-band; least-privilege tokens |

## 2. Inputs inventory (validated with Zod `.strict()`)

| Input | Rules |
|---|---|
| ids (`u_…`, `r_…`, `n_…`, …) | `^[a-z]{1,3}_[A-Za-z0-9]{16,32}$` |
| username | NFC, 3–20 chars, `[A-Za-z0-9_]` + Georgian Mkhedruli `U+10D0–U+10FF`; reserved names and look-alikes rejected |
| room name | NFC, 3–40 chars, no control chars, collapsed whitespace |
| room password | 4–64 chars (never logged or echoed) |
| chat text | NFC, 1–300 chars after trim, control chars removed, rendered as text |
| game action | per-game discriminated union, e.g. `{type:"play", cards:[…]}` — card ids from a fixed enum |
| pagination | `limit` 1–50 (default 20), opaque cursor ≤ 200 chars |
| search `q` | 3–20 chars, same charset as usernames |
| report reason | enum; details ≤ 500 chars |
| game config | per-game schema with numeric bounds (e.g. blinds 1–10 000, turn timer 10–120 s) |

## 3. Outputs that could leak

| Output | Risk | Control |
|---|---|---|
| Public profile | PII | DTO: `id, username, avatar, isAdmin, isModerator, createdAt, stats` only |
| Room list/details | Password, invite codes, hidden state | DTO excludes; tests assert absence |
| Game state frames | Hidden cards | `view(state, seat)`; redaction tests per game |
| Errors | Stack traces, SQL | Generic `{error:{code,message,ref}}`, details only in redacted logs |
| Logs | Tokens, passwords | Logger redacts `authorization`, `password`, `ticket`, `token`, `secret`, `code` keys |
| Bundle / source maps | Secrets | Only public Firebase web config in `VITE_*`; source maps not deployed publicly; bundle scan in CI |

## 4. Dependencies in the trust chain

Runtime: `hono`, `zod`, `jose`, `@oslojs/otp` (+ `@oslojs/crypto`, `@oslojs/encoding`,
`@oslojs/binary`), `react`, `react-dom`, `react-router`, `zustand`, `@firebase/app`, `@firebase/auth`, `lucide-react`.
Everything else is development-only. See `DEPENDENCY_AUDIT.md` and `sbom.cdx.json`.

## 5. Out of scope / not present

* File uploads (avatars are chosen from a built-in set).
* Real-money operations: chips are virtual, cannot be bought, sold, deposited or withdrawn.
* Server-rendered HTML.
* Third-party analytics and ad scripts.
