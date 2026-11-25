# Dependency Audit & Supply-Chain Security

Last audited: **2026-11-25** · Lockfile: `pnpm-lock.yaml` (v9.0, frozen) · Machine-readable SBOM: [`sbom.cdx.json`](sbom.cdx.json) (CycloneDX 1.5).

## 1. Audit Summary

| Check | Command / Tool | Result | Notes |
|---|---|---|---|
| Known vulnerabilities | `pnpm audit` | **0 vulnerabilities found** (Critical: 0, High: 0, Moderate: 0, Low: 0) | Verified locally against npm advisory database on 2026-11-25 |
| Runtime dependency footprint | `pnpm run sbom` (`scripts/generate-sbom.mjs`) | **27 runtime packages** (14 direct + 13 transitive) | Minimal attack surface; Zod excluded from browser bundle via `@croco/shared/client` |
| Development dependency footprint | `pnpm run sbom` | **362 dev/build/test packages** | Never deployed to Worker or browser bundles |
| OSV-Scanner | `.github/workflows/ci.yml` (`google/osv-scanner-action` v2.7.1) | Configured in CI | Scans `pnpm-lock.yaml` on every push/PR |
| Automated updates | `.github/dependabot.yml` | Configured | Weekly PRs for npm and GitHub Actions |

## 2. Production Runtime Dependencies (Complete Direct Inventory)

Every production dependency is open-source, actively maintained, free (zero paid libraries), and pinned to an exact version (`save-exact=true` in `.npmrc`):

### Backend (`apps/worker` & `packages/security` & `packages/shared` & `packages/game-engine`)

| Package | Pinned Version | License | Purpose |
|---|---|---|---|
| `hono` | `4.13.22` | MIT | Lightweight Web Standards HTTP router for Cloudflare Workers |
| `zod` | `4.6.7` | MIT | Strict schema validation (`.strictObject()`) for REST, WS, and game engines |
| `jose` | `6.2.18` | MIT | Vetted RS256 JWT + JWKS verification for Firebase ID tokens (zero dependencies) |
| `@oslojs/otp` | `1.1.0` | MIT | Vetted RFC 4226/6238 HOTP/TOTP primitive for Admin MFA |
| `@oslojs/crypto` | `1.0.1` | MIT | Constant-time cryptographic primitives used by `@oslojs/otp` |
| `@oslojs/encoding` | `1.1.0` | MIT | Strict base32/base64url/hex encoding |
| `@oslojs/binary` | `1.0.0` | MIT | Binary helpers for `@oslojs/otp` |

### Frontend (`apps/web`)

| Package | Pinned Version | License | Purpose |
|---|---|---|---|
| `react` | `19.3.1` | MIT | UI library (text escaping by default) |
| `react-dom` | `19.3.1` | MIT | React DOM renderer |
| `react-router` | `7.18.7` | MIT | Hash-based routing compatible with GitHub Pages & Cloudflare Pages |
| `zustand` | `5.1.0` | MIT | Minimal state management (~1 KB gz) |
| `lucide-react` | `1.80.0` | ISC | Tree-shaken SVG icon components |
| `@firebase/app` | `0.16.2` | Apache-2.0 | Lazy-loaded Firebase core SDK (not loaded in demo mode without backend) |
| `@firebase/auth` | `1.13.6` | Apache-2.0 | Lazy-loaded Firebase Auth SDK (Google, Facebook, Email/Password) |

*All other packages (`vite`, `tailwindcss`, `typescript`, `eslint`, `vitest`, `wrangler`, `@playwright/test`, `@cloudflare/vitest-plugin`, etc.) are strictly `devDependencies`.*

## 3. Install Script Review (Supply-Chain Control)

pnpm v10 blocks arbitrary package lifecycle scripts by default unless explicitly approved. During `pnpm install --frozen-lockfile`:

- **`esbuild@0.28.2`** (dev-only): downloads/verifies platform binary for Vite/Vitest.
- **`workerd`** (dev-only): downloads platform Cloudflare Worker runtime binary for local Wrangler/Vitest.
- **`@firebase/util@1.15.3`** (runtime): its optional postinstall script is **ignored** by pnpm v10 (`Ignored build scripts: @firebase/util@1.15.3`) — no untrusted postinstall code executes from runtime dependencies.

## 4. License Breakdown (SBOM)

From `docs/security/sbom.cdx.json` (389 total lockfile components):
- **Permissive OSI licenses**: MIT (227), Apache-2.0 (28), ISC (13), BSD-2-Clause (8), MIT OR Apache-2.0 (5), BlueOak-1.0.0 (3), BSD-3-Clause (3), CC0-1.0 (1), CC-BY-4.0 (1), 0BSD (1).
- **Weak copyleft (dev-only)**: MPL-2.0 (2, build tooling), Apache-2.0 AND LGPL-3.0-or-later (1, dev-only).
- **Not installed on current OS platform (96)**: platform-specific optional prebuilt binaries for other OS/CPU targets listed in `pnpm-lock.yaml` (e.g., `@esbuild/linux-*`, `@cloudflare/workerd-darwin-*`, `@rollup/rollup-*`); none ship in production bundles.
- **Zero proprietary or paid libraries.**

## 5. Supply-Chain Policies

- Always install with `pnpm install --frozen-lockfile`.
- Commit `pnpm-lock.yaml` and regenerate `docs/security/sbom.cdx.json` (`pnpm run sbom`) whenever dependencies change.
- Review diffs and changelogs on Dependabot PRs before merging; keep `save-exact=true` in `.npmrc`.
- Pin all GitHub Actions in `.github/workflows/*.yml` to full 40-character commit SHAs.
