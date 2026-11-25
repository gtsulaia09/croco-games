# Authentication & Identity Security

## 1. Identity Architecture

Croco Games delegates credential storage and primary authentication to **Firebase Authentication (Spark free plan)** supporting **Google**, **Facebook**, and **Email/Password**. The backend Worker and D1 database **never receive, process, or store user account passwords or OAuth client secrets**.

- **Frontend (`apps/web/src/lib/firebase.ts`)**: lazily loads `@firebase/app` and `@firebase/auth` only when a backend is configured. Uses Firebase's managed persistence (`indexedDBLocalPersistence` with `browserSessionPersistence` fallback) and `signInWithPopup` / `reauthenticateWithPopup`. No credentials or tokens are written to `localStorage` by application code.
- **Transport (`apps/web/src/lib/api.ts`)**: every protected request attaches `Authorization: Bearer <Firebase ID Token>` with `credentials: "omit"`. On `401 token_expired`, the client forces a single token refresh (`getIdToken(true)`) and retries once.
- **No cookies**: avoiding session cookies removes classic cross-site request forgery while keeping Pages and Worker origins cleanly decoupled.

## 2. Server-Side ID Token Verification

Every protected request passes through `authenticate` (`apps/worker/src/auth.ts`), which calls `verifyFirebaseIdToken` (`packages/security/src/firebase-token.ts`) built on the maintained **`jose`** library (no custom JWT or RSA code):

1. **Pre-parse rejection**: rejects tokens > 4,096 bytes or not matching 3 base64url segments before any parsing or network I/O.
2. **Header enforcement**: requires `alg === "RS256"` and a non-empty string `kid`. Rejects `alg: "none"`, `HS256` algorithm confusion, and missing `kid`.
3. **Cryptographic signature & key rotation**: verifies signature against Google's pinned securetoken JWKS (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`) via `createRemoteJWKSet` (cached up to 6 hours, 30s refetch cooldown on unknown `kid` for seamless key rotation).
4. **Claim validation**:
   - `iss === https://securetoken.google.com/<FIREBASE_PROJECT_ID>`
   - `aud === FIREBASE_PROJECT_ID`
   - `sub` non-empty string ≤ 128 chars
   - `exp` in the future; `iat` and `auth_time` not in the future (60s clock skew tolerance)
   - Maximum token lifetime `exp - iat ≤ 3660s`
   - `firebase.sign_in_provider` ∈ `{"password", "google.com", "facebook.com"}` (blocks anonymous/custom tokens)
5. **Identity derivation**: internal user ID (`u_...`), roles, and session record are derived strictly from the verified `sub`. Client-supplied user IDs or roles are rejected by `.strict()` schemas.

## 3. Account Lifecycle, Email Verification & Enumeration Protection

- **Registration & profile setup**: new authenticated users must create a unique profile (`POST /api/me/profile`). Usernames are NFC-normalized, restricted to 3–20 Latin/Georgian/digit/underscore characters, deduplicated via a confusable homoglyph skeleton (`usernameSkeleton`), and filtered against reserved words (`Admin`, `Moderator`, `System`, `Croco`, `Bot`, Georgian equivalents).
- **Email verification (`requireVerified`)**: Google and Facebook accounts are provider-verified; password accounts must have `email_verified === true` before performing social or multiplayer writes (creating/joining rooms, sending friend requests, invitations, invite links).
- **Email enumeration protection**: `Login.tsx` always shows generic sign-in error messages and resolves password reset requests identically whether or not an email is registered. Operators must also enable **Email Enumeration Protection** in Firebase Console.
- **Account suspension & deletion**:
  - Suspended accounts (`users.status = 'suspended'`) are rejected on every request until `suspended_until` expires (when expired, status automatically returns to `active`).
  - Account deletion (`DELETE /api/me`) requires recent authentication (`auth_time ≤ 10 min`), forbids deleting an admin account via self-service, leaves any active room, deletes profile, friends, requests, blocks, notifications, invitations, sessions, MFA data, roles, and ratings in one D1 batch, and replaces the user row with an anonymised tombstone (`email = NULL`, `firebase_uid = 'deleted:' || id`).

## 4. Application-Level Session Management & Revocation

Because the Workers runtime does not run the Node-only Firebase Admin SDK, revocation is enforced directly in D1 on every authenticated request:

- Each unique `(user_id, auth_time)` creates a row in `user_sessions` recording provider, coarse non-identifying device label (e.g., `Chrome · Windows` — raw User-Agent is never stored), Cloudflare coarse country code, and truncated HMAC IP hash.
- **Suspicious login detection**: a new session from a country never previously observed for that account logs a `login.new_country` security event.
- **Single-session logout**: `POST /api/me/sessions/revoke` sets `user_sessions.revoked_at` (scoped to `user_id = self`).
- **Logout everywhere / forced revocation**: `POST /api/me/sessions/revoke-all` (or admin suspension/role change) sets `users.sessions_valid_after = now + 1` and deletes all `admin_step_up` tokens. Any token whose `auth_time < sessions_valid_after` is immediately rejected with `401 session_revoked`.

## 5. Administrator Bootstrap & Mandatory MFA

Because Firebase Auth's built-in TOTP MFA requires upgrading to paid Identity Platform, Croco Games implements **application-level RFC 6238 TOTP MFA** inside the Worker using vetted `@oslojs/otp` + WebCrypto:

1. **Fail-closed bootstrap**: admin features are disabled (`503 service_unavailable`) unless all four Worker secrets (`ADMIN_FIREBASE_UID`, `ADMIN_BOOTSTRAP_EMAIL`, `MFA_ENCRYPTION_KEY`, `RECOVERY_CODE_PEPPER`) are configured. On the first verified request where `sub === ADMIN_FIREBASE_UID` **and** `emailVerified === true` **and** `email.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL`, the `admin` role is inserted idempotently and written to `admin_audit_logs`.
2. **Mandatory enrollment before privileges**: `requireStaff` blocks every privileged route with `403 mfa_not_enrolled` until `admin_mfa.enrolled_at` is set. Enrollment (`POST /api/admin/mfa/enroll/start` & `/confirm`) requires recent authentication (`auth_time ≤ 10 min`).
3. **Encrypted secret storage**: 160-bit random TOTP secrets are encrypted with **AES-256-GCM** using `MFA_ENCRYPTION_KEY` (32 bytes) and bound with AAD `<userId>:totp:v1` plus a `key_version` column for rotation.
4. **Replay & brute-force protection**: verification accepts `[step - 1, step, step + 1]` using constant-time comparison across all candidates and atomically advances `admin_mfa.last_used_step` (`WHERE last_used_step IS NULL OR last_used_step < ?`), preventing code replay even under concurrent requests. Failed attempts are capped at **5 per 15 minutes** per staff account via `security_events`.
5. **Recovery codes**: enrollment generates 10 high-entropy 80-bit codes (`xxxx-xxxx-xxxx-xxxx`) shown once and stored as `HMAC-SHA-256(RECOVERY_CODE_PEPPER, "recovery:v1:" + code)`. Each code is atomically marked `used_at` on first use.
6. **Step-up tokens**: verifying a TOTP or recovery code issues a 256-bit random step-up token stored in memory only in the SPA (`X-Admin-Step-Up`), stored as a SHA-256 hash in `admin_step_up`, bound to `(user_id, auth_time)`, expiring in **15 minutes**.
7. **Re-authentication**: sensitive administrative actions (`POST /api/admin/users/:id/roles`, `PUT /api/admin/settings`, MFA enrollment, recovery-code regeneration) additionally enforce `assertRecentAuth` (`auth_time ≤ 10 min`).

**Residual risk (R3):** TOTP protects against stolen ID tokens and compromised passwords, but remains vulnerable to real-time adversary-in-the-middle phishing. Upgrading admin MFA to phishing-resistant WebAuthn/passkeys is tracked as a future enhancement.
