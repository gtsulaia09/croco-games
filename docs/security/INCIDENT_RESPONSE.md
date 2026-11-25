# Security Incident Response Guide

> **Confidentiality rule:** Never expose active incident details, unpatched vulnerabilities, user emails, or raw evidence publicly. Coordinate internally with the project owner and authorized cybersecurity specialists.

## 1. Standard 10-Step Response Procedure

Every confirmed or suspected security incident follows these ten phases:

1. **Identify**: detect via `security_events`, `admin_audit_logs`, integrity flags, user reports, Cloudflare Analytics, or CI alerts. Assign an incident lead and timestamp all actions.
2. **Contain**: limit blast radius immediately (revoke sessions, close affected rooms, enable maintenance mode / disable `registrationOpen` or `roomCreationOpen` via Admin Platform Settings, or temporarily restrict traffic in Cloudflare WAF).
3. **Disable compromised credentials**: revoke affected Cloudflare API tokens, rotate Worker secrets, disable compromised Firebase accounts, or revoke admin/moderator roles.
4. **Revoke affected sessions**: use `POST /api/admin/users/:id/revoke-sessions` (or update `users.sessions_valid_after` + `DELETE FROM admin_step_up` in D1) so all active ID tokens and step-up tokens are rejected immediately.
5. **Preserve evidence**: export `admin_audit_logs`, `security_events`, `reports`, `integrity_flags`, `game_sessions`, and `match_events` before mutating records; verify the audit hash chain (`GET /api/admin/audit/verify`).
6. **Recover service**: deploy verified clean builds, restore D1 from a verified encrypted backup if data integrity was compromised (see [`BACKUP_AND_RECOVERY.md`](BACKUP_AND_RECOVERY.md)), and lift emergency restrictions.
7. **Investigate root cause**: reconstruct the exact attack path from preserved logs, code, and git history.
8. **Remediate**: patch the underlying vulnerability and review neighboring code paths for the same class of bug.
9. **Test the fix**: add an automated security regression test reproducing the attack (`apps/worker/test/` or `packages/*/src/*.test.ts`) and verify the full CI pipeline passes.
10. **Record lessons learned**: write a private post-incident report updating `THREAT_MODEL.md`, `ASVS_CHECKLIST.md`, and runbooks.

---

## 2. Scenario-Specific Playbooks

### 2.1 Suspected User Account Takeover
- **Signals**: `login.new_country` in `security_events`, user report, unexpected sessions in `/api/me/sessions`.
- **Containment**: Admin/Mod calls `POST /api/admin/users/:id/revoke-sessions` (or suspends account temporarily); instruct user to change Firebase/Google/Facebook password and enable 2FA on their identity provider.
- **Recovery**: verify user regained control of email/IdP, unsuspend account, review recent match history/reports.

### 2.2 Compromised Administrator Account (Severity: Critical)
- **Signals**: unexpected `admin_audit_logs` entries, `admin.mfa_failed` bursts, `admin.recovery_code_used`, unauthorized `role.grant` or `settings.updated`.
- **Containment**:
  1. Immediately set `users.sessions_valid_after = strftime('%s','now') + 60`, `DELETE FROM admin_step_up`, and remove compromised staff row from `roles` (or rotate `ADMIN_FIREBASE_UID` / temporarily clear `MFA_ENCRYPTION_KEY` via `wrangler secret delete` to fail-close ALL admin routes immediately).
  2. Disable the Firebase account in Firebase Console and revoke Firebase refresh tokens.
- **Investigation & Recovery**: run `GET /api/admin/audit/verify` (or inspect `admin_audit_logs` directly), review every action since compromise, undo unauthorized role grants/settings/suspensions, rotate `MFA_ENCRYPTION_KEY` and `RECOVERY_CODE_PEPPER`, re-enroll MFA on a clean device.

### 2.3 Exposed API Credentials or Worker Secrets
- **Signals**: Gitleaks alert, GitHub Secret Scanning alert, unexpected Cloudflare deployment or Worker secret access.
- **Containment**: revoke Cloudflare API tokens immediately in Cloudflare Dashboard; rotate affected Worker secrets (`wrangler secret put`); follow [`SECRETS_MANAGEMENT.md`](SECRETS_MANAGEMENT.md) §6.
- **Verification**: inspect Cloudflare Audit Log for unauthorized Worker/D1/Pages changes and redeploy from a verified commit on `main`.

### 2.4 Data Leakage
- **Signals**: unexpected PII in API responses, logs, or frontend bundles; abnormal `GET /api/users/*` or `GET /api/admin/users` volume.
- **Containment**: deploy hotfix removing leaked fields or temporarily disable the affected route; check `scripts/security-checks.mjs` bundle scan and Cloudflare logs.
- **Recovery**: assess scope of exposed data (emails, usernames, login metadata — note no passwords or raw IPs are stored), notify affected stakeholders per company policy, add output-shape regression test.

### 2.5 Unauthorized Room Access
- **Signals**: `room.join_denied`, `room.password_failed` spikes, `room.invite_code_invalid`, user reports of uninvited players in private/invite-only rooms.
- **Containment**: Admin/Mod kicks unauthorized user (`POST /api/admin/rooms/:id/kick`) or closes room (`POST /api/admin/rooms/:id/close`).
- **Investigation**: verify `RoomDO.join` and `routes/rooms.ts` invite-grant/block/password checks; revoke any leaked invite link rows in D1 (`DELETE FROM invite_links WHERE room_id = ?`).

### 2.6 Game-State Manipulation or Private Card Disclosure
- **Signals**: `game.illegal_action` spikes, `integrity_flags`, player report with impossible hand/score evidence.
- **Containment**: close active rooms (`POST /api/admin/rooms/:id/close`) or disable room creation (`PUT /api/admin/settings` → `roomCreationOpen: false`) while investigating.
- **Investigation**: inspect `match_events` for the match ID, verify `engine.view(state, seat)` redaction and `RoomDO.applyAction` validation, void compromised `game_sessions` (`status = 'void'`) and recompute affected ratings if necessary.

### 2.7 Database Compromise (D1)
- **Signals**: broken audit hash chain (`verifyAuditChain` returns non-null `brokenAt`), unexpected schema/data modifications, Cloudflare account compromise.
- **Containment**: rotate all Cloudflare account credentials and API tokens, pause deployments, put platform into maintenance mode.
- **Recovery**: export compromised DB for forensics, restore clean D1 state from the latest verified encrypted backup (or D1 Time Travel bookmark before compromise), verify `PRAGMA integrity_check` and audit chain continuity.

### 2.8 Service Abuse (Spam, Match Farming, Scraping)
- **Signals**: `ratelimit.exceeded` bursts, `integrity_flags` (`pair_farming`, `abnormal_win_rate`), high report volume.
- **Containment**: suspend abusive accounts (`POST /api/admin/users/:id/suspend`), tune rate-limit bindings or add Cloudflare WAF rule for abusive ASNs/paths, enable Cloudflare Turnstile (`TURNSTILE_SECRET` + `VITE_TURNSTILE_SITE_KEY`) if automated account creation occurs.

### 2.9 Suspected DDoS or Free-Tier Quota Exhaustion
- **Signals**: sudden spike in Worker requests (approaching 100k/day free limit) or D1 writes (approaching 100k/day), elevated `503` / `429` responses.
- **Containment**: enable Cloudflare "Under Attack Mode" in Cloudflare Dashboard, activate the free-tier WAF rate-limiting rule on `/api/*`, temporarily disable `registrationOpen` and `roomCreationOpen` via Admin Settings to reduce D1 writes.
- **Honest expectation**: free-tier quotas reset at 00:00 UTC; volumetric attacks exceeding free-tier limits cannot be fully absorbed without upgrading infrastructure (documented residual risk R1).

### 2.10 Malicious Dependency Detection
- **Signals**: OSV-Scanner / `pnpm audit` / Dependabot alert or public advisory affecting a package in `docs/security/sbom.cdx.json`.
- **Containment**: check `docs/security/sbom.cdx.json` (`croco:dependency-class: runtime` vs `development`) to determine production exposure; halt deployments immediately if a runtime or build-time dependency is compromised.
- **Remediation**: pin to a patched or clean version, verify lockfile integrity hashes, rotate CI/deploy tokens if a malicious install script ran in CI, regenerate SBOM (`pnpm run sbom`), redeploy.
