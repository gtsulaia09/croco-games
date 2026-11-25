# Security Policy — Croco Games

## Security Posture & Honest Scope

Croco Games is engineered with a **security-first, defense-in-depth architecture** targeting **OWASP ASVS 5.0.0 Level 2** as its baseline, with **Level 3-aligned controls** for authentication, authorization, administrator MFA, cryptographic storage, and server-authoritative game integrity.

> **Important disclosure:** Automated unit tests, integration tests, static analysis, and internal threat modeling do **not** constitute an independent security audit or formal certification. Croco Games is prepared for — and requires — an **independent human-led security assessment and staging penetration test** by authorized cybersecurity specialists before production release. Never claim this platform is unbreakable; all known residual risks are tracked openly in [`docs/security/THREAT_MODEL.md`](docs/security/THREAT_MODEL.md) (§5).

## Security Release Gate

Production deployment is **blocked** while any of the following conditions remain unresolved:

- Any open **Critical** or **High** severity vulnerability.
- Any unexplained authentication bypass or broken access control finding.
- Any exposed secret, private key, or source map in the repository or built bundle.
- Any unauthenticated or non-MFA-protected administrator operation.
- Any unvalidated client game action or confirmed hidden-card/state disclosure.
- Any unverified backup/restore procedure or missing staging security test sign-off.

Exceptions require explicit written justification and acceptance by both the project owner and the authorized security reviewer.

## Reporting a Vulnerability

Please **do not** disclose security vulnerabilities in public GitHub issues, pull requests, or room chat.

1. Report suspected vulnerabilities privately to the project owner / internal cybersecurity team via your organization's private security channel (or GitHub Private Vulnerability Reporting if enabled on the repository).
2. Include: affected component/endpoint, reproduction steps, impact assessment, and any proof-of-concept payloads (against local or staging environments only).
3. **Never** run intrusive penetration tests against production or third-party infrastructure (Firebase/Cloudflare) without explicit written authorization.

## Security Documentation Package

Prepared for independent cybersecurity review:

| Document | Scope |
|---|---|
| [`docs/security/THREAT_MODEL.md`](docs/security/THREAT_MODEL.md) | STRIDE threat model, sensitive assets, trust boundaries, 44 attack scenarios, residual risks R1–R7 |
| [`docs/security/SECURITY_ARCHITECTURE.md`](docs/security/SECURITY_ARCHITECTURE.md) | 7-layer defense-in-depth architecture, identity/admin/realtime/data designs, free-tier limits |
| [`docs/security/ATTACK_SURFACE.md`](docs/security/ATTACK_SURFACE.md) | Entry points, Zod `.strict()` input inventory, output redaction, dependency trust chain |
| [`docs/security/AUTHORIZATION_MATRIX.md`](docs/security/AUTHORIZATION_MATRIX.md) | Endpoint-by-endpoint and WebSocket message authorization rules |
| [`docs/security/SECURITY_CONTROLS.md`](docs/security/SECURITY_CONTROLS.md) | Catalog of implemented controls mapped to code and tests |
| [`docs/security/ASVS_CHECKLIST.md`](docs/security/ASVS_CHECKLIST.md) | OWASP ASVS 5.0.0 verification checklist with evidence and residual risk |
| [`docs/security/AUTHENTICATION_SECURITY.md`](docs/security/AUTHENTICATION_SECURITY.md) | Firebase ID token verification, revocation, Admin bootstrap & TOTP MFA |
| [`docs/security/API_SECURITY.md`](docs/security/API_SECURITY.md) | Perimeter, CORS, CSRF, validation, error handling, rate limiting |
| [`docs/security/WEBSOCKET_SECURITY.md`](docs/security/WEBSOCKET_SECURITY.md) | One-time subprotocol tickets, CSWSH, Hibernation API, frame limits, replay defense |
| [`docs/security/DATABASE_SECURITY.md`](docs/security/DATABASE_SECURITY.md) | Cloudflare D1 prepared statements, triggers, data minimization, retention |
| [`docs/security/SECRETS_MANAGEMENT.md`](docs/security/SECRETS_MANAGEMENT.md) | Secret inventory, environment isolation, rotation, compromise handling |
| [`docs/security/INCIDENT_RESPONSE.md`](docs/security/INCIDENT_RESPONSE.md) | 10-step runbook covering 10 incident scenarios |
| [`docs/security/BACKUP_AND_RECOVERY.md`](docs/security/BACKUP_AND_RECOVERY.md) | Encrypted D1 backup workflow, restore verification, free-tier limitations |
| [`docs/security/SECURITY_TEST_REPORT.md`](docs/security/SECURITY_TEST_REPORT.md) | Executed automated security tests, findings, staging ZAP guide |
| [`docs/security/DEPENDENCY_AUDIT.md`](docs/security/DEPENDENCY_AUDIT.md) | Dependency inventory, audit results, license review, install-script review |
| [`docs/security/sbom.cdx.json`](docs/security/sbom.cdx.json) | Machine-readable CycloneDX 1.5 Software Bill of Materials |
| [`docs/security/DESIGN_REVIEW.md`](docs/security/DESIGN_REVIEW.md) | Phase 0 internal security design review record |
