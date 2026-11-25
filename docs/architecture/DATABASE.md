# Database Schema & Operations (`Cloudflare D1`)

Migration source: [`database/migrations/0001_initial_schema.sql`](../../database/migrations/0001_initial_schema.sql) (SQLite / Cloudflare D1).

## 1. Entity-Relationship Overview

### Identity, Profiles & Administration

| Table | Primary Key | Purpose & Key Constraints |
|---|---|---|
| `users` | `id` (`u_*`) | Internal user record linked to `firebase_uid` (UNIQUE, never public), `email` (admin-only), `sign_in_provider` (`password`/`google.com`/`facebook.com`), `status` (`active`/`suspended`/`deleted`), `sessions_valid_after`, `suspended_until`. |
| `profiles` | `user_id` (FK `users`) | Public player identity: `username`, `username_key` (UNIQUE homoglyph skeleton), `avatar` (`a01`–`a24`), `locale` (`ka`/`en`), `show_online` (`0`/`1`). |
| `roles` | `(user_id, role)` | Privileged roles (`admin`, `moderator`), `granted_by`, `granted_at`. |
| `user_sessions` | `id` (`s_*`) | Per-sign-in visibility & revocation keyed by `UNIQUE(user_id, auth_time)`, coarse `device`, `country`, truncated `ip_hash`, `revoked_at`. |
| `admin_mfa` | `user_id` | AES-256-GCM encrypted TOTP secret (`secret_enc`), `key_version`, `enrolled_at`, monotonic `last_used_step` (replay protection). |
| `admin_recovery_codes` | `(user_id, code_hash)` | HMAC-SHA-256 hashed one-time recovery codes + `used_at`. |
| `admin_step_up` | `token_hash` | SHA-256 hashed 15-minute step-up tokens bound to `(user_id, auth_time)`. |

### Social System

| Table | Primary Key | Purpose & Key Constraints |
|---|---|---|
| `friend_requests` | `id` (`fr_*`) | `from_user`, `to_user`, `status` (`pending`/`accepted`/`rejected`/`cancelled`), `CHECK(from_user <> to_user)`, partial unique index `friend_requests_one_pending`. |
| `friends` | `(user_a, user_b)` | Symmetric friendship stored with canonical order `CHECK(user_a < user_b)`. |
| `blocks` | `(blocker, blocked)` | Directed user block (`CHECK(blocker <> blocked)`), indexed by `blocked`. |
| `notifications` | `id` (`n_*`) | Persisted notifications (`friend_request`, `friend_accepted`, `game_invitation`, `invitation_accepted`, `match_completed`), `read_at`. |

### Rooms & Invitations

| Table | Primary Key | Purpose & Key Constraints |
|---|---|---|
| `game_types` | `id` | Seeded catalog of all 10 game IDs (`joker`, `japanese_joker`, `bura3`, `bura5`, `holdem`, `shortdeck`, `omaha`, `omaha_hilo`, `dominoes`, `backgammon`). |
| `rooms` | `id` (`r_*`) | Room browser index (`game_type`, `name`, `name_key`, `visibility`, `has_password`, `host_id`, `players`, `max_players`, `spectators`, `allow_spectators`, `phase`, `stage`). **Never stores passwords.** |
| `room_members` | `(room_id, user_id)` | Active membership index (`role`, `seat`, `joined_at`, `left_at`). Partial unique index `room_members_one_active(user_id) WHERE left_at IS NULL` enforces one active room per user globally. |
| `invitations` | `id` (`inv_*`) | Direct friend invitations with `expires_at` and partial unique index `invitations_one_pending(room_id, to_user)`. |
| `invite_links` | `code_hash` | SHA-256 hashed shareable invite codes bound to `room_id`, with `expires_at`, `uses`, `max_uses`. |

### Matches, Statistics & Leaderboards

| Table | Primary Key | Purpose & Key Constraints |
|---|---|---|
| `game_sessions` | `id` (`m_*`) | Authoritative match record (`room_id`, `game_type`, `status`, `rated`, `players`, `humans`, `started_at`, `finished_at`, `final_rev`). |
| `match_events` | `match_id` | Compact JSON array of up to 500 public match events (one row per match to protect D1 free-tier write quota). |
| `match_participants` | `(match_id, seat)` | Per-seat placement, score, `forfeited`, `rating_before`, `rating_after`, `rating_delta`, `finished_at`. Bots have `user_id = NULL`. |
| `game_ratings` | `(user_id, game_type)` | Per-game Elo rating (initial 1500), total `matches`, `rated` count, `wins`, `draws`, `losses`. Indexed on `(game_type, rating DESC)`. |

### Moderation, Audit & Platform Settings

| Table | Primary Key | Purpose & Key Constraints |
|---|---|---|
| `reports` | `id` (`rp_*`) | Abuse/cheating reports with optional server-captured `message_snapshot`, `status` (`open`/`dismissed`/`actioned`), moderator resolution fields. |
| `integrity_flags` | `id` (`if_*`) | Automated anti-cheat / anti-farming investigation signals (`pair_farming`, `abnormal_win_rate`). |
| `security_events` | `id` (AUTOINCREMENT) | Structured security telemetry (`ts`, `kind`, `user_id`, `ip_hash`, `country`, redacted `details_json`). |
| `admin_audit_logs` | `id` (AUTOINCREMENT) | Hash-chained append-only administrative log (`prev_hash`, `hash` UNIQUE). Protected by `BEFORE UPDATE` and 365-day `BEFORE DELETE` triggers. |
| `platform_settings` | `key` | Allowlisted JSON settings (`registrationOpen`, `roomCreationOpen`, `maintenanceMessage`, `maxRoomsPerUser`). |

## 2. Durable Object Storage (Not in D1)

- **`RoomDO`**: stores `room` metadata (including PBKDF2 room password hash, seat state, bans, short-lived hashed tickets), `game` authoritative state (`rev`, hidden hands/deck, processed action IDs), `chat` (ring buffer of last 200 room messages), and `events` (up to 1,000 public events during active play).
- **`LobbyDO`**: stores `activity` map (`userId → { roomId, gameType, playing }`) and short-lived hashed `tickets`.

## 3. Running Migrations

```bash
# Local development (Miniflare / Wrangler D1)
pnpm --filter @croco/worker db:migrate:local

# Remote Cloudflare environments
cd apps/worker
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply DB --remote --env demo
npx wrangler d1 migrations apply DB --remote --env production
```
