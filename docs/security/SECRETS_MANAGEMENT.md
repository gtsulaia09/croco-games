# Secrets Management

## 1. Core Policy

- **Zero secrets in Git**: no API tokens, private keys, service account JSON files, encryption keys, peppers, admin UIDs, or `.env` / `.dev.vars` files may ever be committed.
- **Public vs. secret separation**: Vite `VITE_*` variables are compiled into the public JavaScript bundle and are strictly allowlisted in `scripts/security-checks.mjs` to public web identifiers only (`VITE_API_BASE`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_TURNSTILE_SITE_KEY`, `VITE_DEPLOYMENT`, `VITE_BASE_PATH`).
- **Placeholder template**: `.env.example` contains placeholder values only.
- **Per-environment isolation**: `development`, `staging`, `demo`, and `production` must never share Worker secrets, D1 databases, Firebase projects, or Cloudflare API tokens.

## 2. Secret Inventory

### Cloudflare Worker Secrets (`wrangler secret put <NAME> --env <env>`)

| Secret | Format / Strength | Purpose | Fail-Closed Behavior |
|---|---|---|---|
| `IP_HASH_KEY` | ≥ 32 random chars | HMAC-SHA-256 key for pseudonymising client IP addresses | Deployed envs return `503` if missing/short |
| `MFA_ENCRYPTION_KEY` | 32 random bytes, base64url | AES-256-GCM key encrypting `admin_mfa.secret_enc` | Admin routes disabled (`503`) if missing/invalid |
| `RECOVERY_CODE_PEPPER` | ≥ 32 random chars | HMAC-SHA-256 pepper for `admin_recovery_codes` | Admin routes disabled (`503`) if missing/short |
| `ADMIN_FIREBASE_UID` | Firebase Auth UID | Initial administrator identity binding | Admin routes disabled (`503`) if missing |
| `ADMIN_BOOTSTRAP_EMAIL` | Verified email address | Second check required alongside UID for admin bootstrap | Admin routes disabled (`503`) if missing |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret | Optional server-side anti-automation check on profile creation | Turnstile skipped only when intentionally unset |

### GitHub Actions Environment Secrets (Scoped per Environment)

| Secret | Environment(s) | Scope / Least Privilege |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `staging`, `demo`, `production` (separate tokens) | Minimal permissions: Workers Scripts Edit, D1 Edit, Cloudflare Pages Edit for that environment only |
| `CLOUDFLARE_ACCOUNT_ID` | `staging`, `demo`, `production` | Cloudflare account identifier |
| `BACKUP_ENCRYPTION_KEY` | `staging`, `production` | High-entropy passphrase (≥ 32 random chars) for AES-256 encrypted D1 backups; store offline copy in enterprise password vault |

*Note: The `github-pages` environment receives **no secrets** — only optional public `DEMO_*` variables if a separate isolated demo backend is deployed.*

## 3. Generating Strong Secrets

```bash
# 32-byte base64url key (for MFA_ENCRYPTION_KEY)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 48-byte base64url secret (for IP_HASH_KEY, RECOVERY_CODE_PEPPER, BACKUP_ENCRYPTION_KEY)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 4. Automated Secret Scanning

1. **Repository & bundle scanner (`scripts/security-checks.mjs`)**: runs on every CI build and locally via `pnpm run check:security`. Rejects private keys, Google service account JSON, AWS/GitHub/Slack/live API tokens, committed `.env` files, non-allowlisted `VITE_*` variables, published `.map` source maps, and any server secret names inside `apps/web/dist`.
2. **Gitleaks (`.github/workflows/ci.yml` + `.gitleaks.toml`)**: scans full Git history (`fetch-depth: 0`) on every push and pull request.
3. **GitHub Secret Scanning & Push Protection**: operators should enable GitHub's native secret scanning and push protection in repository settings.

## 5. Rotation Procedures

- **`CLOUDFLARE_API_TOKEN`**: create a new minimally scoped token in Cloudflare Dashboard → update the target GitHub Environment secret → run a test deploy on `staging` → revoke the old token.
- **`IP_HASH_KEY`**: set new value via `wrangler secret put IP_HASH_KEY --env <env>`. Existing historical `ip_hash` values in `security_events` remain pseudonymised under the old key; new events hash under the new key (no user downtime).
- **`RECOVERY_CODE_PEPPER`**: rotate via `wrangler secret put`, then have all staff regenerate recovery codes via `POST /api/admin/mfa/recovery-codes/regenerate` (which overwrites hashed codes under the new pepper).
- **`MFA_ENCRYPTION_KEY`**: `admin_mfa` includes a `key_version` column. To rotate safely without locking out admins: decrypt rows under `v1` and re-encrypt under `v2` during a planned maintenance window (or re-enroll staff MFA immediately after rotating the secret).
- **`BACKUP_ENCRYPTION_KEY`**: update the GitHub Environment secret and archive the previous passphrase in the vault until older encrypted backups expire (30 days).

## 6. Accidental Secret Commit Response

Deleting a secret in a subsequent commit does **not** remove it from Git history or forks. If a secret is ever exposed:

1. **Revoke immediately** at the issuing provider (Cloudflare, Firebase, GitHub).
2. **Generate and deploy** a replacement secret to all affected environments.
3. **Inspect audit logs** (`admin_audit_logs`, `security_events`, Cloudflare Audit Log, Firebase Auth logs) for unauthorized use during the exposure window.
4. **Scrub Git history** (`git filter-repo`) if appropriate and force-push only after team coordination.
5. **Document the incident** per [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) (§3).
