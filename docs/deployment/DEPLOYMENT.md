# Deployment Guide — Cloudflare Production, Staging & GitHub Pages Demo

Croco Games runs exclusively on **free-tier infrastructure** with strict environment separation (`development`, `staging`, `demo`, `production`).

> **Pre-deployment reminder:** Never activate paid billing without owner approval, never commit secrets to Git, and never point the GitHub Pages demo at production Workers, databases, or admin endpoints.

---

## Current Production Setup (Automatic Deploys)

Every push to `main` runs `.github/workflows/deploy-production.yml`: the full verification gate (`pnpm run ci`), then D1 migrations, the API Worker (`croco-games-api.giowulaia76.workers.dev`) and the web site — a static-assets Worker configured in `apps/web/wrangler.jsonc` (`https://croco-games.giowulaia76.workers.dev`; Cloudflare's successor to Pages, which honours the build's `_headers`).

One-time GitHub setup (Settings → Secrets and variables → Actions):

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers Scripts: Edit and D1: Edit (the only required setting) |
| Variable (optional) | `VITE_FIREBASE_API_KEY` | Overrides the Firebase web API key, which is otherwise read from the live API's `/api/config/public` (worker secret `FIREBASE_WEB_API_KEY`, set once with `wrangler secret put FIREBASE_WEB_API_KEY --env production`) |
| Variable (optional) | `VITE_FACEBOOK_LOGIN` | `true` once Facebook login is enabled in Firebase |
| Secret (optional) | `BACKUP_ENCRYPTION_KEY` | Enables the nightly encrypted D1 backup (`backup-d1.yml`); skipped until set |

GitHub Actions must be enabled for the repository (Settings → Actions → General). The GitHub Pages demo (`deploy-pages-demo.yml`) is manual-only. Staging and demo Cloudflare environments are deployed by hand with `deploy-cloudflare.yml`.

---

## Free-Tier Limits (Verified Baseline)

| Service | Free-Tier Quota | Operational Notes |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day · 10 ms CPU/invocation | Rate limits & Hibernation API keep usage low; resets 00:00 UTC |
| Cloudflare Durable Objects | SQLite-backed classes · 100,000 requests/day · 5 GB storage | WebSocket auto-response heartbeats do not wake DOs |
| Cloudflare D1 | 5M rows read/day · 100k rows written/day · 500 MB/DB · 7-day Time Travel | Chat stays in DO storage; 1 `match_events` row per match |
| Cloudflare Pages | Unlimited static requests · 500 builds/month | Serves `_headers` with strict CSP + `frame-ancestors 'none'` + HSTS |
| Firebase Authentication (Spark) | Google, Facebook, Email/Password free (50k MAU) | Firebase TOTP MFA is paid → Admin TOTP MFA is implemented in our Worker |
| GitHub Pages | Free static hosting for demo only | Cannot send HTTP headers → demo uses meta CSP + frame-busting |

---

## Step-by-Step Deployment Checklist (14 Steps)

### 1. Connect GitHub Repository & Protect Environments
1. Push the repository to GitHub and protect the `main` branch (require PRs + passing `CI and Security Checks` workflow + Gitleaks + OSV-Scanner + Semgrep).
2. Enable **GitHub Secret Scanning** and **Push Protection** in Repository Settings → Code security.
3. Create four GitHub Environments in Settings → Environments:
   - `github-pages` (no secrets; optional isolated `DEMO_*` public variables only)
   - `demo`
   - `staging`
   - `production` (enable **Required reviewers** and restrict deployment branch to `main`)

### 2. Create Cloudflare D1 Databases
Create separate D1 databases for each environment (never share a database across environments):
```bash
cd apps/worker
npx wrangler d1 create croco-games-staging
npx wrangler d1 create croco-games-demo
npx wrangler d1 create croco-games-prod
```
Record each `database_id` and update `apps/worker/wrangler.toml` under `[env.staging]`, `[env.demo]`, and `[env.production]`.

### 3. Verify Durable Objects Configuration
`apps/worker/wrangler.toml` already configures SQLite-backed Durable Objects (`RoomDO`, `LobbyDO`) under `new_sqlite_classes` (required for the Workers Free tier). Confirm `ALLOWED_ORIGINS`, `FIREBASE_PROJECT_ID`, and `FIREBASE_AUTH_DOMAIN` under each `[env.*]` block (never leave `REPLACE_WITH_*` placeholders — the Worker fails closed with `503`).

### 4. Create Cloudflare Pages Projects
Create separate Cloudflare Pages projects (e.g., `croco-games-staging` and `croco-games-prod`) via Dashboard or Wrangler:
```bash
npx wrangler pages project create croco-games-staging --production-branch=main
npx wrangler pages project create croco-games-prod --production-branch=main
```
Note the resulting HTTPS domains (`https://<project>.pages.dev` or custom HTTPS domain) and set them as `ALLOWED_ORIGINS` in `wrangler.toml` for the matching environment.

### 5. Configure Firebase Authentication Projects (Spark Plan)
Create separate Firebase projects for staging, demo (optional), and production:
1. Enable **Authentication** → **Email/Password** (disable passwordless email link unless needed).
2. Enable **Email Enumeration Protection** (Authentication → Settings → User actions).
3. Configure Password Policy (minimum length **12**, require uppercase/lowercase/numeric where available).
4. Add your Cloudflare Pages domain(s) under **Authorized domains** (never add `localhost` to production).
5. Copy the public web app config (`apiKey`, `authDomain`, `projectId`, `appId`) into GitHub Environment **Variables** (`VITE_FIREBASE_*`).

### 6. Configure Google Authentication
1. In Firebase Console → Authentication → Sign-in method → **Google** → Enable.
2. Set project support email and verify OAuth consent screen authorized domains match your Firebase `authDomain` and Cloudflare Pages domain.

### 7. Configure Facebook Authentication
1. Create a Meta Developer app (free) and add **Facebook Login**.
2. Copy the OAuth Redirect URI shown in Firebase Console (`https://<project>.firebaseapp.com/__/auth/handler`) into Meta App → Facebook Login → Valid OAuth Redirect URIs.
3. Paste Meta App ID and App Secret into Firebase Console → Authentication → Sign-in method → **Facebook** → Enable. (The App Secret stays inside Firebase — never in this repo or Worker.)

### 8. Configure the Admin UID & Bootstrap Email
1. Log into the deployed staging/production Firebase project once using the project owner's verified Google or email account.
2. Copy the owner's **User UID** from Firebase Console → Authentication → Users.
3. Set `ADMIN_FIREBASE_UID` and `ADMIN_BOOTSTRAP_EMAIL` via Wrangler secrets (Step 10). Never put either in `wrangler.toml` or `VITE_*`.

### 9. Configure Admin MFA
1. After deploying (Step 11), log in as the owner account and open `#/admin`.
2. Re-authenticate if prompted (`auth_time ≤ 10 min`).
3. Scan/enter the TOTP secret into an authenticator app (Google Authenticator, Aegis, 1Password, etc.) and confirm with the 6-digit code.
4. Store the 10 one-time recovery codes offline in an enterprise vault.
5. Verify that privileged admin tabs unlock only after TOTP step-up and re-lock after 15 minutes.

### 10. Configure Worker & GitHub Secrets
Generate strong random secrets locally (see `docs/security/SECRETS_MANAGEMENT.md`) and upload directly to Cloudflare:
```bash
cd apps/worker
# Repeat per environment (--env staging, --env production; omit admin secrets on demo!)
npx wrangler secret put IP_HASH_KEY --env production
npx wrangler secret put MFA_ENCRYPTION_KEY --env production
npx wrangler secret put RECOVERY_CODE_PEPPER --env production
npx wrangler secret put ADMIN_FIREBASE_UID --env production
npx wrangler secret put ADMIN_BOOTSTRAP_EMAIL --env production
# Optional Cloudflare Turnstile:
# npx wrangler secret put TURNSTILE_SECRET --env production
```
In GitHub Repository → Settings → Environments (`staging`, `production`), configure:
- **Secrets**: `CLOUDFLARE_API_TOKEN` (minimally scoped), `CLOUDFLARE_ACCOUNT_ID`, `BACKUP_ENCRYPTION_KEY`.
- **Variables**: `CLOUDFLARE_PAGES_PROJECT`, `VITE_API_BASE`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_TURNSTILE_SITE_KEY` (optional).

### 11. Apply Migrations & Deploy Staging
Trigger GitHub Actions → **Deploy to Cloudflare** with `environment = staging` (or run locally with `wrangler`):
```bash
cd apps/worker
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler deploy --env staging
```

### 12. Test Security on Staging
Before touching production:
1. Verify `GET https://<staging-api>/api/health` returns `200` with `API_SECURITY_HEADERS`.
2. Verify foreign `Origin` returns `403` and unauthenticated `/api/me` returns `401`.
3. Verify Cloudflare Pages serves `_headers` (`Content-Security-Policy`, `frame-ancestors 'none'`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`).
4. Run an **authorized OWASP ZAP baseline scan** against the staging origin and perform the manual staging checks in `docs/security/SECURITY_TEST_REPORT.md`.
5. Run a manual backup + staging restore test via `.github/workflows/backup-d1.yml`.

### 13. Test Real-Time Multiplayer & Recovery on Staging
1. Sign in with two separate accounts across two browsers/devices.
2. Verify friend request → accept → live presence → room creation (public, password, invite-only) → chat → match play → disconnect grace period → bot takeover → cross-device **Return to game** → match completion → leaderboard update.

### 14. Deploy Production & GitHub Pages Demo
- **Production**: trigger `.github/workflows/deploy-cloudflare.yml` with `environment = production` after security reviewer sign-off.
- **GitHub Pages Demo**: enable GitHub Pages (Source: **GitHub Actions**) in Repository Settings → Pages. Pushing to `main` automatically runs `.github/workflows/deploy-pages-demo.yml`, publishing the isolated demo at `https://<user>.github.io/<repo>/`. Without `DEMO_*` variables, it runs cleanly in labelled offline-capable Practice Mode against bots with zero external requests.
