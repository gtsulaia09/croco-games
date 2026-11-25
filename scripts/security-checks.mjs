#!/usr/bin/env node
/**
 * Repository security checks that complement ESLint, Semgrep, Gitleaks and OSV-Scanner:
 *  1. "Trojan Source": no bidirectional-control or invisible characters in source files.
 *  2. Dynamic SQL: SQL passed to D1 helpers must be static. Template interpolation is only
 *     allowed for UPPER_SNAKE_CASE constants that hold static SQL fragments.
 *  3. Secret patterns in tracked source/config (private keys, service accounts, tokens).
 *  4. Frontend env: only allowlisted public VITE_* variables may exist.
 *  5. Built frontend bundle (if present): no server secrets or private key material.
 * Exits non-zero on any finding.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".wrangler", "coverage", "playwright-report", "test-results"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".toml", ".yml", ".yaml", ".md", ".sql", ".html", ".css"]);
const findings = [];
const norm = (p) => relative(ROOT, p).replace(/\\/g, "/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(extname(name)) || name.startsWith(".env")) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

// 1. Trojan Source / invisible characters
const DANGEROUS = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060-\u2064\uFEFF]/u;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (DANGEROUS.test(line)) findings.push(`${norm(f)}:${i + 1} contains bidi/invisible control characters (use \\u escapes)`);
  });
}

// 2. Dynamic SQL in the Worker
const SQL_CALL = /\b(?:prepare|one|all|run|stmt)(?:<[^>]*>)?\(\s*(?:[\w.]+,\s*)?`([\s\S]*?)`/g;
for (const f of files.filter((p) => norm(p).startsWith("apps/worker/src/") && p.endsWith(".ts"))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(SQL_CALL)) {
    for (const expr of m[1].matchAll(/\$\{([^}]*)\}/g)) {
      if (!/^\s*[A-Z][A-Z0-9_]*\s*$/.test(expr[1])) {
        const line = text.slice(0, m.index).split("\n").length;
        findings.push(`${norm(f)}:${line} interpolates "${expr[1].trim()}" into SQL — use bound parameters`);
      }
    }
  }
}

// 3. Secret patterns
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/"type"\s*:\s*"service_account"/, "Google service account JSON"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bsk_live_[A-Za-z0-9]{16,}/, "live API secret"],
];
for (const f of files) {
  if (norm(f) === "scripts/security-checks.mjs") continue;
  const text = readFileSync(f, "utf8");
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) findings.push(`${norm(f)} matches secret pattern: ${label}`);
}
for (const f of files.filter((p) => /\.env(\.|$)/.test(basename(p)) && basename(p) !== ".env.example")) {
  findings.push(`${norm(f)} is an env file and must not be committed`);
}

// 4. Frontend env allowlist (Vite exposes VITE_* to the browser — public values only)
const ALLOWED_VITE = new Set([
  "VITE_API_BASE",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_TURNSTILE_SITE_KEY",
  "VITE_DEPLOYMENT",
  "VITE_BASE_PATH",
]);
for (const f of files.filter((p) => norm(p).startsWith("apps/web/"))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/\bVITE_[A-Z0-9_]+/g)) if (!ALLOWED_VITE.has(m[0])) findings.push(`${norm(f)} uses non-allowlisted ${m[0]}`);
}

// 5. Built bundle scan
const dist = join(ROOT, "apps/web/dist");
if (existsSync(dist)) {
  const FORBIDDEN_IN_BUNDLE = [/MFA_ENCRYPTION_KEY/, /RECOVERY_CODE_PEPPER/, /IP_HASH_KEY/, /ADMIN_FIREBASE_UID/, /TURNSTILE_SECRET/, /-----BEGIN/, /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/, /\.map$/];
  const assetsDir = join(dist, "assets");
  const maps = existsSync(assetsDir)
    ? readdirSync(assetsDir, { withFileTypes: true }).filter((d) => d.name.endsWith(".map")).map((d) => join(assetsDir, d.name))
    : [];
  for (const f of walk(dist).concat(maps)) {
    if (f.endsWith(".map")) {
      findings.push(`${norm(f)}: source maps must not be published`);
      continue;
    }
    const text = readFileSync(f, "utf8");
    for (const re of FORBIDDEN_IN_BUNDLE) if (re.test(text)) findings.push(`${norm(f)} bundle contains forbidden material (${re})`);
  }
}

if (findings.length) {
  console.error(`Security checks failed (${findings.length}):\n - ${findings.join("\n - ")}`);
  process.exit(1);
}
console.log(`Security checks passed (${files.length} files scanned).`);
