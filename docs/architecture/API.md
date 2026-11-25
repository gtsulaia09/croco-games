# API & WebSocket Protocol Reference

Base path: `/api` (served by `apps/worker`).
All JSON request/response bodies use `Content-Type: application/json`.
All protected endpoints require `Authorization: Bearer <Firebase ID Token>` and an allowlisted `Origin` header on state-changing methods.
Error responses always follow `{ "error": { "code": "<ErrorCode>", "ref": "<requestId>", "fields"?: { ... } } }`.

---

## 1. Public Endpoints (Unauthenticated)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check (`{ ok: true, environment }`). |
| `GET` | `/api/config/public` | Public flags: `{ environment, turnstileSiteKey, registrationOpen, maintenanceMessage }`. |
| `GET` | `/api/games` | Static catalog of all 10 game types with seat limits. |

## 2. Account, Profile & Sessions (`apps/worker/src/routes/me.ts`)

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/me` | Token | — | `MeResponse` (`account`, `profile`, `roles`, `admin`, `activeRoomId`) |
| `POST` | `/api/me/profile` | Token | `{ username, avatar, locale, turnstileToken? }` | `201 { ok: true }` |
| `PATCH` | `/api/me/profile` | Profile | `{ avatar?, locale?, showOnline? }` | `200 { ok: true }` |
| `DELETE` | `/api/me` | Token + Recent (≤10m) | — | `200 { ok: true }` (non-admin only) |
| `GET` | `/api/me/sessions` | Token | — | `{ items: SessionDto[] }` |
| `POST` | `/api/me/sessions/revoke` | Token | `{ sessionId }` | `200 { ok: true }` |
| `POST` | `/api/me/sessions/revoke-all` | Token | — | `200 { ok: true }` |
| `GET` | `/api/me/login-history` | Token | — | `{ items: [{ ts, kind, country }] }` |
| `GET` | `/api/me/active-game` | Profile | — | `{ active: { roomId, role, seat, gameType, name, phase } \| null }` |
| `GET` | `/api/me/stats` | Profile | — | `{ items: PlayerStatsDto[] }` (all 10 games) |
| `GET` | `/api/me/matches` | Profile | `?limit=1..50&cursor=...` | `{ items: MatchHistoryDto[], nextCursor }` |
| `GET` | `/api/users/:id` | Profile | — | `{ user: PublicUser, stats: PlayerStatsDto[] }` |

## 3. Social, Invitations & Presence (`apps/worker/src/routes/social.ts`)

| Method | Path | Auth | Body / Query |
|---|---|---|---|
| `GET` | `/api/users/search` | Profile | `?q=<3..20 chars>` → `{ items: PublicUser[] }` (max 20) |
| `GET` | `/api/friends` | Profile | `{ items: FriendDto[] }` with live presence |
| `DELETE` | `/api/friends/:id` | Profile | Removes friendship |
| `GET` | `/api/friend-requests` | Profile | `{ incoming: FriendRequestDto[], outgoing: FriendRequestDto[] }` |
| `POST` | `/api/friend-requests` | Verified | `{ toUserId }` → `201 { id }` (auto-accepts reverse pending) |
| `POST` | `/api/friend-requests/:id/accept` | Verified | Accepts incoming request |
| `POST` | `/api/friend-requests/:id/reject` | Profile | Rejects incoming request |
| `POST` | `/api/friend-requests/:id/cancel` | Profile | Cancels outgoing request |
| `GET` / `POST` / `DELETE` | `/api/blocks`, `/api/blocks/:id` | Profile | List / block `{ userId }` / unblock user |
| `GET` | `/api/notifications` | Profile | `?limit&cursor` → `{ items, unread, nextCursor }` |
| `POST` | `/api/notifications/read` | Profile | `{ all: true }` or `{ ids: [...] }` |
| `GET` | `/api/invitations` | Profile | Incoming invitations (auto-expires past TTL) |
| `POST` | `/api/invitations` | Verified | `{ roomId, toUserId }` (room member inviting a friend) |
| `POST` | `/api/invitations/:id/accept` / `reject` | Verified / Profile | Accept joins room immediately (`{ roomId, seat }`) |
| `POST` | `/api/invite-links` | Verified | `{ roomId }` (host only) → `201 { code, expiresAt }` |
| `GET` | `/api/invite-links/:code` | Profile | Validates code and returns room preview |
| `GET` | `/api/presence/online` | Profile | `?limit` → visible online users list |

## 4. Rooms, Reports & WebSocket Tickets (`apps/worker/src/routes/rooms.ts`)

| Method | Path | Auth | Body / Query |
|---|---|---|---|
| `GET` | `/api/rooms` | Profile | `?gameType=<GameType>&filter=all\|public\|password\|invite\|waiting\|active\|seats&q=&limit=&cursor=` |
| `POST` | `/api/rooms` | Verified | `createRoomSchema` (`gameType`, `name`, `visibility`, `password?`, `maxPlayers`, `bots`, `botDifficulty`, `turnSeconds`, `allowSpectators`, `autoStart`, `chatEnabled`, `allowInvites`, `gameConfig`) |
| `GET` | `/api/rooms/:id` | Profile | Public room summary (`hasPassword`, never hash) |
| `POST` | `/api/rooms/:id/join` | Verified | `{ password?, inviteCode?, asSpectator? }` → `{ roomId, seat }` |
| `POST` | `/api/rooms/:id/leave` | Profile | Leaves room (or forfeits seat if mid-match) |
| `POST` | `/api/rooms/:id/ticket` | Profile (Member) | Issues one-time 30s room WS ticket |
| `GET` | `/api/rooms/:id/ws` | Ticket + Origin | Upgrades to `RoomDO` (`Sec-WebSocket-Protocol: croco.v1, t.<ticket>`) |
| `POST` | `/api/lobby/ticket` | Profile | Issues one-time 30s lobby WS ticket |
| `GET` | `/api/lobby/ws` | Ticket + Origin | Upgrades to `LobbyDO` |
| `POST` | `/api/reports` | Profile | `{ targetUserId, roomId?, messageId?, reason, details? }` (max 10/day) |

## 5. Leaderboards (`apps/worker/src/routes/leaderboards.ts`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/leaders` | Profile | Current #1 established leader per game, lead over #2, `youLead`, `yourRank` |
| `GET` | `/api/leaderboards/global` | Profile | Normalized cross-game percentile leaderboard (top 50) |
| `GET` | `/api/leaderboards/:gameType` | Profile | `?period=all\|month\|week&limit=&cursor=` — includes `leadOverNext`, `winRate`, `recent` (last 5 form) |

## 6. Administration & MFA (`apps/worker/src/routes/admin.ts`)

All operational endpoints require `X-Admin-Step-Up: <token>` in addition to Bearer token.

| Method | Path | Min Role | Extra Check |
|---|---|---|---|
| `GET` | `/api/admin/mfa/status` | Staff | — |
| `POST` | `/api/admin/mfa/enroll/start` & `/confirm` | Staff | Recent auth (≤10m) |
| `POST` | `/api/admin/mfa/verify` & `/recover` | Staff | 5 fails / 15m cap |
| `POST` | `/api/admin/mfa/recovery-codes/regenerate` | Staff + Step-Up | Recent auth |
| `GET` | `/api/admin/overview`, `/online`, `/rooms`, `/reports`, `/integrity`, `/users` | Staff + Step-Up | Emails visible to `admin` only |
| `POST` | `/api/admin/users/:id/suspend`, `/unsuspend`, `/revoke-sessions` | Staff + Step-Up | Mods limited to ≤ 7 days; never targets admin |
| `POST` | `/api/admin/rooms/:id/kick`, `/close` | Staff + Step-Up | Audited |
| `POST` | `/api/admin/reports/:id/resolve`, `/integrity/:id/resolve` | Staff + Step-Up | Audited |
| `POST` | `/api/admin/users/:id/roles` | Admin + Step-Up | Recent auth; `moderator` only; rotates target sessions |
| `GET` | `/api/admin/audit`, `/audit/verify`, `/security-events` | Admin + Step-Up | Hash-chain verification |
| `GET` / `PUT` | `/api/admin/settings` | Admin + Step-Up | `PUT` requires recent auth |

---

## 7. WebSocket Wire Protocol (`packages/shared/src/protocol.ts`)

### RoomDO Client → Server (all carry unique `id: string`, max 4 KB)
- `{"type":"hb"}` — Hibernation auto-heartbeat (server replies `{"type":"hb_ack"}`).
- `ping` · `sync` · `chat.send` (`text`) · `room.ready` (`ready`) · `room.start` · `room.addBot` (`difficulty`) · `room.removeBot` (`seat`) · `room.kick` (`userId`) · `room.mute` (`userId, muted`) · `room.transferHost` (`userId`) · `room.updateSettings` (`settings`) · `game.action` (`rev, action`) · `room.leave`.

### RoomDO Server → Client (all carry monotonic `seq: number`)
- `hello` (`you`, `room`, `chat` [last 50], `game` [redacted view + `rev` + `deadline`])
- `room` (`room` snapshot) · `chat` (`message`) · `game` (`rev`, `view`, `deadline`, `events`) · `match.end` (`result`) · `ack` (`id`) · `pong` (`id`, `serverTime`) · `error` (`id?`, `code`).

### LobbyDO Messages (max 1 KB)
- Client → Server: `ping`, `presence.set` (`status: "online" | "away"`).
- Server → Client: `hello` (`unread`), `notification` (`notification`), `presence` (`userId`, `status`), `pong`, `error`.

### Application Close Codes
- `4001`: Superseded by another device/tab · `4002`: Kicked · `4003`: Room closed · `4004`: Unauthorized · `4008`: Rate limited.
