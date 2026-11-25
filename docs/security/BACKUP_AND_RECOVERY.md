# Backup and Recovery

## 1. Persistence Scope

| Store | Data | Backup Strategy |
|---|---|---|
| **Cloudflare D1** | Users, profiles, roles, social graph, match history, ratings, reports, integrity flags, security events, append-only admin audit logs, platform settings | 1) Cloudflare D1 Time Travel (7-day built-in point-in-time recovery on free plan) + 2) Daily automated encrypted SQL export (`.github/workflows/backup-d1.yml`) |
| **Durable Objects (`RoomDO`, `LobbyDO`)** | Active in-progress room state, ephemeral WS tickets, room chat (last 200 msgs) | Persisted to DO SQLite storage across restarts/hibernation. Finished match results and public event logs are committed to D1 upon match end. Ephemeral rooms are not exported externally. |
| **Firebase Auth** | User credentials, OAuth links | Managed by Google Firebase. User UIDs link to D1 `users.firebase_uid`. |

## 2. Automated Encrypted Backup Workflow

`.github/workflows/backup-d1.yml` runs nightly at `03:15 UTC` (and on-demand via `workflow_dispatch`) inside isolated `staging` and `production` GitHub Environments:

1. **Export**: runs `wrangler d1 export DB --remote --env <env> --output backup-raw.sql` using a minimally scoped `CLOUDFLARE_API_TOKEN`.
2. **Automated restore verification** *(every single backup is tested before archiving)*:
   - Imports `backup-raw.sql` into a clean scratch `sqlite3` database.
   - Asserts `PRAGMA integrity_check` returns `ok`.
   - Asserts `PRAGMA foreign_key_check` returns empty.
   - Logs non-sensitive table counts (`users`, `game_sessions`, `admin_audit_logs`).
3. **Compression & encryption**: compresses with `gzip -9` and encrypts with `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt` using the environment-specific `BACKUP_ENCRYPTION_KEY` secret.
4. **Integrity & round-trip check**: computes a `.sha256` checksum and verifies decryption round-trips byte-for-byte to the original SQL hash.
5. **Private storage**: deletes plaintext SQL from the runner and uploads only the encrypted `.sql.gz.enc` + `.sha256` as a private GitHub Actions artifact (30-day retention, accessible only to authenticated repository maintainers — **never** committed to Git and **never** placed on a public URL).

## 3. Environment Separation

- Development (`croco-games-dev`) and demo (`croco-games-demo`) databases are **never** backed up with production keys or mixed with production archives.
- `staging` and `production` use distinct GitHub Environments, distinct D1 database IDs, and distinct `BACKUP_ENCRYPTION_KEY` secrets.

## 4. Recovery Procedures

### Option A — Rapid Point-in-Time Restore via D1 Time Travel (within 7 days)
```bash
cd apps/worker
# Inspect current bookmark before making changes
npx wrangler d1 time-travel info DB --env production
# Restore to a known-good timestamp (UTC ISO-8601)
npx wrangler d1 time-travel restore DB --env production --timestamp="2026-11-25T03:00:00Z"
```

### Option B — Full Restore from Encrypted Backup Archive (up to 30 days)
```bash
# 1. Verify ciphertext checksum
sha256sum -c croco-d1-production-<timestamp>.sql.gz.enc.sha256

# 2. Decrypt and decompress locally on a secured operator workstation
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -in croco-d1-production-<timestamp>.sql.gz.enc | gunzip -c > restore.sql

# 3. Validate locally in SQLite before touching Cloudflare
sqlite3 verify.db < restore.sql
sqlite3 verify.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
rm -f verify.db

# 4. Restore into a fresh staging/recovery D1 database first and test
npx wrangler d1 execute croco-games-staging --remote --file=restore.sql

# 5. Clean up plaintext file immediately
shred -u restore.sql   # or secure delete on Windows
```

After any restore:
1. Run `GET /api/admin/audit/verify` as Admin to confirm hash-chain integrity.
2. Verify `/api/health`, login, room creation, and leaderboards on the restored instance.

## 5. Periodic Restore Drills & Honest Free-Tier Limitations

- **Unverified backup rule**: a backup has **not** been proven until a full staging restore drill succeeds. Before production go-live (and quarterly thereafter), operators must execute Option B into `croco-games-staging` and record the drill date and result.
- **Free-tier limitations (honest disclosure)**:
  - Cloudflare D1 Free limits Time Travel history to **7 days** and database size to **500 MB** (paid Workers gives 30-day Time Travel).
  - GitHub Actions private artifacts expire after **30–90 days** (configured to 30 days) and share repository storage quotas (500 MB on GitHub Free for private repos). For long-term retention (> 30 days) or off-GitHub redundancy, operators should copy encrypted `.sql.gz.enc` bundles to an access-controlled private Cloudflare R2 bucket (10 GB/month free tier, zero egress, private access only) or internal corporate backup storage.
  - Active in-memory matches inside `RoomDO` during an unscheduled Cloudflare region outage may be lost if not yet finalized to D1.
