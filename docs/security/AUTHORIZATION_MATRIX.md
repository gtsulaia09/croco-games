# Authorization Matrix

Every row is enforced **server-side** in the Worker or Durable Object. Hiding a button in the UI
is never relied upon. Columns answer the five questions from the spec (§7):
who is authenticated, permission, ownership, valid state, allowed now (rate/recency).

Legend: **Anon** = no token · **User** = verified token + active profile ·
**Verified** = User whose identity is verified (provider google/facebook, or password with
`email_verified`) · **Mod** = moderator role + MFA step-up · **Admin** = admin role + MFA step-up ·
**Recent** = `auth_time` ≤ 10 minutes ago.

## REST API

| Endpoint | Min. principal | Ownership / resource rule | State rule | Rate limit key |
|---|---|---|---|---|
| `GET /api/health`, `GET /api/config/public`, `GET /api/games` | Anon | — | — | IP |
| `GET /api/me` | Token (profile optional) | self | account not deleted | user |
| `POST /api/me/profile` | Token | self; one profile per Firebase uid | no existing profile; username unique & not reserved | user + IP (strict) |
| `PATCH /api/me/profile` | User | self; only `avatar`, `locale`, `showOnline` | — | user |
| `DELETE /api/me` | User + Recent | self | not currently seated in an active match (or forfeit) | user (strict) |
| `GET /api/me/sessions`, `GET /api/me/login-history` | User | self | — | user |
| `POST /api/me/sessions/revoke` | User | session.user_id = self | not already revoked | user |
| `POST /api/me/sessions/revoke-all` | User | self | — | user |
| `GET /api/me/active-game` | User | self | member row active | user |
| `GET /api/me/matches`, `GET /api/me/stats` | User | self | — | user |
| `GET /api/users/:id` | User | public fields only; blocked-by-target → 404 | target active | user |
| `GET /api/users/search` | User | public fields; excludes users who blocked caller | `q` ≥ 3 chars | user (search) |
| `GET /api/friends`, `DELETE /api/friends/:id` | User | friendship row contains self | friendship exists | user |
| `GET /api/friend-requests` | User | from or to = self | — | user |
| `POST /api/friend-requests` | Verified | to ≠ self; no block either way | not already friends / pending; ≤ 50 pending outgoing | user (social) |
| `POST /api/friend-requests/:id/accept` `/reject` | Verified | request.to = self | status pending | user (social) |
| `POST /api/friend-requests/:id/cancel` | User | request.from = self | status pending | user |
| `GET/POST/DELETE /api/blocks` | User | blocker = self; target ≠ self | — | user |
| `GET /api/notifications`, `POST /api/notifications/read` | User | notification.user_id = self | — | user |
| `GET /api/invitations` | User | to = self | not expired | user |
| `POST /api/invitations` | Verified | caller is member of room; target is a friend; not blocked | room open / joinable; ≤ 1 pending per (room,target) | user (social) |
| `POST /api/invitations/:id/accept` `/reject` | Verified | invitation.to = self | pending, not expired | user |
| `POST /api/invite-links` | Verified | caller is host of room | room not finished | user (social) |
| `GET /api/invite-links/:code` | User | code valid for that room only | not expired, uses left | user (join) |
| `GET /api/presence/online` | User | public presence of users with `showOnline` | — | user |
| `GET /api/rooms` | User | invite-only rooms only if member/invitee | — | user |
| `POST /api/rooms` | Verified | host = self | caller has no other active room; ≤ 3 rooms created / 10 min | user (room create) |
| `GET /api/rooms/:id` | User | public info; never password/hash/hidden state | — | user |
| `POST /api/rooms/:id/join` | Verified | — | capacity; password or invite grant; not banned; not blocked by host | user (join) + room-local password limiter |
| `POST /api/rooms/:id/leave` | User | member = self | — | user |
| `POST /api/rooms/:id/ticket` | User | member = self | room not closed | user (ticket) |
| `GET /api/rooms/:id/ws` | Ticket + Origin | ticket.user is member | ticket unused, ≤ 30 s | IP (ws) |
| `POST /api/lobby/ticket`, `GET /api/lobby/ws` | User / Ticket + Origin | self | — | user (ticket) |
| `POST /api/reports` | User | reporter = self; target ≠ self | ≤ 10 reports / day | user (report) |
| `GET /api/leaderboards/*`, `GET /api/leaders` | User | public fields | — | user |
| `GET /api/admin/mfa/status` | admin/mod role (no step-up) | self | — | user (admin) |
| `POST /api/admin/mfa/enroll/start` `/confirm` | admin/mod role + Recent | self | not enrolled (or re-enroll with step-up) | user (mfa) |
| `POST /api/admin/mfa/verify` `/recover` | admin/mod role | self | enrolled; ≤ 5 failures / 15 min | user (mfa) |
| `GET /api/admin/overview`, `/online`, `/rooms`, `/reports`, `/integrity`, `/users` | Mod | — | — | user (admin) |
| `POST /api/admin/users/:id/suspend` | Mod (≤ 7 days) / Admin | target not admin; target ≠ self | — | user (admin write) |
| `POST /api/admin/users/:id/unsuspend`, `/revoke-sessions` | Mod | target not admin | — | user (admin write) |
| `POST /api/admin/users/:id/roles` | Admin + Recent | target ≠ self; only `moderator` grantable | — | user (admin write) |
| `POST /api/admin/rooms/:id/kick` `/close` | Mod | — | room active | user (admin write) |
| `POST /api/admin/reports/:id/resolve`, `/integrity/:id/resolve` | Mod | — | open | user (admin write) |
| `GET /api/admin/audit`, `/audit/verify`, `/security-events` | Admin | — | — | user (admin) |
| `GET/PUT /api/admin/settings` | Admin (+ Recent for PUT) | allowlisted keys only | — | user (admin write) |

## WebSocket messages (RoomDO)

| Message | Who | Rule |
|---|---|---|
| `ping` | any socket | — |
| `sync` | member/spectator | returns caller's own view only |
| `chat.send` | room member or spectator | chat enabled; not muted; ≤ 300 chars; 5 / 10 s |
| `room.ready` | seated member | phase = waiting |
| `room.start` | host | phase = waiting; min players satisfied (bots count) |
| `room.addBot` / `room.removeBot` | host | phase = waiting; bots allowed; seat free |
| `room.kick` | host (not admin/self) | phase = waiting, or bot will take seat during match |
| `room.mute` | host | target is member; target not admin |
| `room.transferHost` | host | target is human member |
| `room.updateSettings` | host | phase = waiting; settings validated by game config schema |
| `game.action` | the seat owner (human, not bot-controlled) | engine says it is this seat's turn; `rev` matches; action id unseen; action legal |
| `room.leave` | member | during match: seat becomes bot-controlled until match end (no forfeit of others) |

## GameChatDO messages (one chat room per game type)

| Message | Who | Rule |
|---|---|---|
| ticket `POST /api/chat/:game/ticket` | signed-in user with a profile | `:game` must be a known game type; `RL_TICKET` |
| `chat.send` | the socket's user | sanitised text 1–300 chars; 5 per 10 s per user; socket token bucket 20 / 10 per s |
| server → `chat`, `online` | — | delivered only to sockets of the same game's chat room |

## LobbyDO messages

| Message | Who | Rule |
|---|---|---|
| `presence.set` | the socket's user | status ∈ {online, away}; 6 / min |
| server → `notification`, `presence.friend` | — | delivered only to the owning user / to that user's friends |
