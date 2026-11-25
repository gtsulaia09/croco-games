# Database Security

Croco Games uses **Cloudflare D1 (SQLite)** for persistent relational records and **Durable Object SQLite storage** for live room state, ephemeral WebSocket tickets, room password hashes, and bounded room chat history.

## 1. SQL Injection Prevention

- **Prepared statements everywhere**: every database query in `apps/worker/src/` executes through thin helpers in `apps/worker/src/db.ts` (`one`, `all`, `run`, `stmt`) calling `db.prepare(sql).bind(...params)`.
- **No string concatenation with untrusted input**: dynamic IN-lists bind a serialized JSON array via SQLite's `json_each(?)` (`WHERE user_id IN (SELECT value FROM json_each(?))`), never interpolated placeholders or concatenated IDs.
- **Static enforcement**: `scripts/security-checks.mjs` (check #2) scans every `.ts` file under `apps/worker/src/` and fails CI if any template literal passed to `prepare`/`one`/`all`/`run`/`stmt` interpolates anything other than a compile-time `UPPER_SNAKE_CASE` static SQL fragment constant (e.g. `ROOM_SELECT`, `ACCESS_CLAUSE`).
- **Automated payload testing**: `apps/worker/test/social.test.ts` sends classic SQL injection payloads (`' OR 1=1 --`, `%' UNION SELECT email FROM users --`, etc.) through user search and verifies safe handling and zero PII leakage.

## 2. Access Control & Least Privilege

- **No direct client access**: D1 bindings exist only inside the Cloudflare Worker and Durable Objects; credentials and bindings are never exposed to the frontend bundle.
- **Environment isolation**: `apps/worker/wrangler.toml` defines distinct D1 database bindings for `development` (`croco-games-dev`), `staging` (`croco-games-staging`), `demo` (`croco-games-demo`), and `production` (`croco-games-prod`).
- **Ownership in SQL predicates**: queries for sessions, friend requests, notifications, invitations, and profiles include `WHERE user_id = ?` (bound to the verified token's internal user ID) to prevent IDOR/BOLA.
- **Admin data protection**: administrative tables (`roles`, `admin_mfa`, `admin_recovery_codes`, `admin_step_up`, `admin_audit_logs`, `security_events`, `integrity_flags`, `platform_settings`) are never queried by public/player endpoints except for minimal internal auth checks (`roles`, `sessions_valid_after`, `platform_settings`).

## 3. Schema Integrity & Constraints (`database/migrations/0001_initial_schema.sql`)

- **Check constraints**: validate ID prefixes (`GLOB 'u_*'`, `'r_*'`, `'m_*'`, etc.), enum domains (`status`, `role`, `visibility`, `phase`, `sign_in_provider`, `locale`), avatar format (`GLOB 'a[0-9][0-9]'`), and anti-self-reference (`from_user <> to_user`, `blocker <> blocked`, `user_a < user_b`).
- **Referential integrity**: foreign keys with `ON DELETE CASCADE` for personal social/auth records and `ON DELETE SET NULL` on `match_participants` / `reports` so historical integrity records remain valid after account deletion.
- **Concurrency-safe uniqueness**:
  - `profiles(username_key)` unique index prevents homoglyph duplicates.
  - `room_members_one_active` partial unique index (`WHERE left_at IS NULL`) enforces one active room per user globally.
  - `friend_requests_one_pending` and `invitations_one_pending` partial unique indexes prevent duplicate pending records under race conditions.
- **Atomic batches**: multi-table updates (match finalisation, account deletion, friend acceptance, room creation, role changes) execute via `db.batch([...])`.

## 4. Tamper-Evident Append-Only Audit Log

`admin_audit_logs` is protected at both the database and application layers:

1. **SQLite triggers**:
   - `admin_audit_logs_no_update` aborts any `UPDATE` on `admin_audit_logs`.
   - `admin_audit_logs_retention` aborts any `DELETE` of rows younger than 365 days.
2. **Cryptographic hash chain**: `appendAudit` (`apps/worker/src/audit.ts`) computes `hash = SHA-256(prev_hash || "|" || canonical(row))` and uses a conditional `INSERT ... SELECT ... WHERE COALESCE((SELECT hash ... ORDER BY id DESC LIMIT 1), GENESIS) = ?` with retry to prevent concurrent forks.
3. **Verification endpoint**: `GET /api/admin/audit/verify` (admin-only) recomputes up to 5,000 rows per run and reports the first broken row ID if tampering occurred.
4. **Honest limitation (R5)**: a Cloudflare account administrator with direct D1 console access can drop triggers or modify rows; the hash chain provides tamper *evidence*, not prevention against the infrastructure owner.

## 5. Data Minimization, Encryption & Retention

| Data Category | Storage | Protection | Retention |
|---|---|---|---|
| Account passwords | Firebase Auth only | Managed by Firebase (never in D1) | Account lifetime |
| Admin TOTP secrets | `admin_mfa.secret_enc` | AES-256-GCM with `MFA_ENCRYPTION_KEY` + user AAD | Until unenrolled / deleted |
| Recovery codes | `admin_recovery_codes.code_hash` | HMAC-SHA-256 with `RECOVERY_CODE_PEPPER` | Until used / regenerated |
| Step-up tokens & invite link codes | `admin_step_up`, `invite_links` | SHA-256 hash only | 15 min / 2 hours |
| Room passwords | RoomDO storage only | PBKDF2-SHA-256 + 16-byte salt (never in D1/API) | Room lifetime |
| Hidden game state (cards/deck) | RoomDO storage only | Never written to D1 or sent unredacted | Match lifetime only |
| IP addresses | Not stored raw | Truncated `HMAC-SHA-256(IP_HASH_KEY, ip)` + coarse country | 90 days |
| Audit logs | `admin_audit_logs` | Append-only triggers + SHA-256 chain | 365 days minimum |
| Query bounds | All list queries | Hard `LIMIT` (max 50–500) + cursor pagination | Prevents unbounded reads |
