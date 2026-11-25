# Internal Security Design Review (Phase 0 gate)

Date: 2026-11-25 · Reviewer: AI engineering assistant (internal, **not independent**) ·
Scope: THREAT_MODEL, SECURITY_ARCHITECTURE, AUTHORIZATION_MATRIX, ATTACK_SURFACE.

The specification requires an internal design review before feature development. This record
lists the questions asked, the decision, and follow-ups. It does not replace the review by the
company's security specialists.

| # | Question | Decision | Follow-up |
|---|---|---|---|
| 1 | Can the frontend influence identity or role? | No. Identity = verified `sub`; role from D1; all schemas `.strict()` and none contain `role`, `userId` of the caller, `score` or `rating`. | Mass-assignment tests |
| 2 | Is MFA achievable on the free tier? | Firebase TOTP needs the paid Identity Platform upgrade, so MFA is implemented in the Worker with `@oslojs/otp`. Secrets encrypted with AES-GCM via WebCrypto. | Admin MFA tests incl. replay |
| 3 | WebSocket authentication without long-lived tokens in URLs? | One-time 30-second ticket in `Sec-WebSocket-Protocol`. Origin allowlist enforced additionally. | CSWSH and ticket reuse tests |
| 4 | Where can hidden game information exist? | Only in RoomDO memory/storage. Serialization to clients only through `view()`. | Redaction tests per engine |
| 5 | Are there cookie-based flows needing CSRF protection? | No cookies for the API. JSON-only bodies, Origin checks. | CSRF/Content-Type tests |
| 6 | How are free-tier CPU limits handled for password hashing? | Room passwords: PBKDF2-SHA-256 with 20 000 iterations + strict online attempt limits (documented deviation R7). Account passwords are handled by Firebase. | Measure CPU in Worker |
| 7 | Does the GitHub Pages demo touch production? | No. Demo builds point to a separate demo Worker + D1, or show "backend not configured" with local practice mode clearly labelled. Production origins exclude GitHub Pages. | CORS env tests |
| 8 | Is the audit log tamper-evident? | Append-only API surface + SHA-256 hash chain verifiable by admins. Not tamper-proof against Cloudflare account owners (R5). | Chain verification test |
| 9 | Can ratings be farmed against bots? | Rated matches require ≥ 2 human players; bot seats excluded from rating; per-pair daily cap; integrity flags for anomalies. | Rating tests |
| 10 | Can two devices control one seat? | One live socket per user per room; newest authenticated socket supersedes; actions need current `rev`. | Supersede test |

**Gate result:** design accepted for implementation, with residual risks R1–R7 recorded in
`THREAT_MODEL.md §5` for owner/security-reviewer acceptance. Production readiness remains
**blocked** until the release gate in `SECURITY.md` is satisfied.
