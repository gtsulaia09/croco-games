# WebSocket & Real-Time Security

Real-time communication uses secure WebSockets (`wss://` in all deployed environments) terminating in Cloudflare Durable Objects (`RoomDO` per room and `LobbyDO` singleton) via the **WebSocket Hibernation API**.

## 1. Connection Authentication (No Tokens in URLs)

Long-lived Firebase ID tokens are **never** sent in WebSocket query strings (which leak into proxy/access logs and browser histories). Instead, Croco Games uses a two-step one-time ticket flow:

1. Client calls `POST /api/rooms/:id/ticket` (or `POST /api/lobby/ticket`, or `POST /api/chat/:game/ticket` for a game's chat room) with its Bearer Firebase ID token.
2. The Worker verifies the token, enforces rate limits (`RL_TICKET`), and calls `RoomDO.issueTicket(userId)` (or `LobbyDO.issueTicket(userId)`).
   - `RoomDO` verifies the room is open, the user is a current member, and the user has < 5 outstanding tickets.
   - Generates a 256-bit cryptographically random ticket (`randomToken(32)`), persists only `SHA-256(ticket)` + `userId` + `exp = now + 30s` in DO storage, and returns the raw ticket.
3. Client opens `wss://<api>/api/rooms/:id/ws` with `Sec-WebSocket-Protocol: croco.v1, t.<ticket>`.
4. Both the Worker (`assertWsOrigin`) and the Durable Object validate:
   - `Upgrade: websocket` header present.
   - `Origin` header matches the environment's exact `ALLOWED_ORIGINS` allowlist (**CSWSH defense**).
   - Subprotocol contains `croco.v1` and a syntactically valid `t.<ticket>`.
   - `SHA-256(ticket)` exists in DO storage, is immediately deleted (**strict single-use**, even if expired/invalid), is unexpired, and `room.members[userId]` is still valid.
5. On acceptance, the DO responds with `101 Switching Protocols` and `Sec-WebSocket-Protocol: croco.v1`, tags the socket with `[userId]`, and serializes `{ userId }` as the socket attachment.

## 2. Connection Lifecycle & Device Ownership

- **Per-room socket cap**: `RoomDO` rejects upgrades above `LIMITS.ws.maxSocketsPerRoom` (20) with `429`.
- **Single active device per seat**: in `RoomDO`, accepting a new authenticated socket for `userId` closes any older socket for the same `userId` with application code `4001` (`superseded`). Two devices can never race to control the same seat.
- **Lobby socket cap**: `LobbyDO` caps concurrent tabs/devices at 5 per user (closing the oldest with `4001`).
- **Zero-CPU heartbeats**: both DOs configure `setWebSocketAutoResponse('{"type":"hb"}', '{"type":"hb_ack"}')`. Clients send heartbeats every 25 seconds without waking hibernated Durable Objects or consuming CPU/request quotas.
- **Graceful reconnect**: `TicketSocket` (`apps/web/src/lib/socket.ts`) uses capped exponential backoff with random jitter and stops reconnecting permanently on terminal close codes (`4001` superseded, `4002` kicked, `4003` room closed, `4004` unauthorized).

## 3. Incoming Frame Validation & Flood Protection

Every frame reaching `webSocketMessage` goes through:

1. **Text-only check**: binary `ArrayBuffer` frames close the socket with `1008` (`policy`).
2. **Size limit**: frames > 4,096 bytes (`RoomDO`) or > 1,024 bytes (`LobbyDO`) immediately close the socket (`1009` / `1008`).
3. **Token-bucket flood limit**:
   - `RoomDO`: 20-message burst, 10 messages/sec refill; excess closes with `4008` (`rateLimited`) and logs `ws.rejected`.
   - `LobbyDO`: 6-message burst, 0.1/sec refill (`presence.set`).
   - Chat messages additionally pass through a per-user `SlidingWindowCounter` (5 messages / 10 seconds).
4. **Schema allowlist**: JSON parsed in `try/catch` and validated against strict discriminated unions (`clientRoomMessageSchema`, `clientLobbyMessageSchema`). Unknown message types or extra fields return `bad_message`; > 20 malformed frames disconnect the socket (`1008`).
5. **Membership & role authorization**: identity comes exclusively from `ws.deserializeAttachment().userId` — never from the message body. Host-only commands (`room.start`, `room.kick`, `room.mute`, `room.addBot`, `room.removeBot`, `room.transferHost`, `room.updateSettings`) check `room.hostId === userId`. Hosts cannot kick or mute administrators.

## 4. Game Action Integrity & Private State Isolation

- **Seat binding**: `game.action` maps `userId → member.seat`. Spectators and bot-controlled/forfeited seats cannot submit moves.
- **Idempotency & replay defense**: `msg.id` is checked against the last 256 processed action IDs (`game.processed`). Duplicate IDs receive `ack` without re-executing.
- **Optimistic revision lock**: `msg.rev` must equal `game.rev`; stale revisions return `stale_revision` along with a fresh redacted state frame.
- **Per-seat redaction**: `broadcastGame` and `sendHello` compute `engine.view(game.state, seat)` per recipient seat (spectators receive `seat = null`). Private cards, face-down discards, deck order, and boneyard tiles are never serialized to unauthorized sockets.
- **Presence privacy (`LobbyDO`)**: presence updates (`online`, `away`, `in_game`, `offline`) are fanned out exclusively to online friends and suppressed entirely when `profiles.show_online = 0`.
