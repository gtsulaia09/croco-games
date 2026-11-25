#!/usr/bin/env node
/**
 * Generates a CycloneDX 1.5 JSON Software Bill of Materials (SBOM) from pnpm-lock.yaml
 * and the installed workspace packages. Output: docs/security/sbom.cdx.json
 *
 * Zero external dependencies — uses only Node.js built-ins so it stays auditable and fast.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_PATH = join(ROOT, "docs/security/sbom.cdx.json");

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Collect direct runtime dependency names from all workspace packages. */
function collectDirectRuntimeDeps() {
  const runtime = new Set();
  const workspaces = [
    join(ROOT, "package.json"),
    join(ROOT, "apps/web/package.json"),
    join(ROOT, "apps/worker/package.json"),
    join(ROOT, "packages/game-engine/package.json"),
    join(ROOT, "packages/security/package.json"),
    join(ROOT, "packages/shared/package.json"),
  ];
  for (const p of workspaces) {
    if (!existsSync(p)) continue;
    const pkg = readJson(p);
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (!dep.startsWith("@croco/")) runtime.add(dep);
    }
  }
  return runtime;
}

/** Parse pnpm-lock.yaml v9 packages & snapshots sections for exact versions, integrity and graph. */
function parsePnpmLock(text) {
  const lines = text.split(/\r?\n/);
  const packages = new Map(); // key "name@version" -> { name, version, integrity }
  const graph = new Map(); // name -> Set<depName>
  let section = "";
  let currentKey = null;
  let inDeps = false;

  for (const raw of lines) {
    if (/^[a-zA-Z0-9_-]+:\s*$/.test(raw)) {
      section = raw.trim().slice(0, -1);
      currentKey = null;
      inDeps = false;
      continue;
    }
    if (section === "packages") {
      const m = /^ {2}'?([^\s':][^':]*?)'?:\s*$/.exec(raw);
      if (m) {
        const key = m[1];
        const at = key.lastIndexOf("@");
        if (at > 0) {
          currentKey = key;
          packages.set(key, { name: key.slice(0, at), version: key.slice(at + 1), integrity: null });
        }
        continue;
      }
      if (currentKey) {
        const integ = /integrity:\s*(sha\d+-[A-Za-z0-9+/=]+)/.exec(raw);
        if (integ) packages.get(currentKey).integrity = integ[1];
      }
    } else if (section === "snapshots") {
      const m = /^ {2}'?([^\s':][^':]*?)'?:\s*(\{\})?$/.exec(raw);
      if (m) {
        const key = m[1].split("(")[0];
        const at = key.lastIndexOf("@");
        currentKey = at > 0 ? key.slice(0, at) : null;
        inDeps = false;
        continue;
      }
      if (currentKey && /^ {4}(?:dependencies|optionalDependencies):\s*$/.test(raw)) {
        inDeps = true;
        continue;
      }
      if (currentKey && inDeps) {
        if (/^ {4}[a-zA-Z]/.test(raw)) {
          inDeps = false;
          continue;
        }
        const dm = /^ {6}'?([^\s':][^':]*?)'?:\s/.exec(raw);
        if (dm) {
          if (!graph.has(currentKey)) graph.set(currentKey, new Set());
          graph.get(currentKey).add(dm[1]);
        }
      }
    }
  }
  return { packages, graph };
}

/** Expand transitive runtime dependency closure from direct runtime deps. */
function computeRuntimeClosure(direct, graph) {
  const seen = new Set(direct);
  const queue = [...direct];
  while (queue.length) {
    const cur = queue.shift();
    for (const dep of graph.get(cur) ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return seen;
}

/** Build a lookup of installed package.json metadata from node_modules/.pnpm. */
function readInstalledMetadata() {
  const meta = new Map(); // "name@version" -> { license, description }
  const pnpmDir = join(ROOT, "node_modules/.pnpm");
  if (!existsSync(pnpmDir)) return meta;
  for (const entry of readdirSync(pnpmDir)) {
    const nm = join(pnpmDir, entry, "node_modules");
    if (!existsSync(nm)) continue;
    for (const item of readdirSync(nm)) {
      if (item.startsWith("@")) {
        const scopeDir = join(nm, item);
        for (const sub of readdirSync(scopeDir)) {
          const pj = join(scopeDir, sub, "package.json");
          if (existsSync(pj)) {
            const pkg = readJson(pj);
            if (pkg.name && pkg.version) meta.set(`${pkg.name}@${pkg.version}`, pkg);
          }
        }
      } else {
        const pj = join(nm, item, "package.json");
        if (existsSync(pj)) {
          const pkg = readJson(pj);
          if (pkg.name && pkg.version) meta.set(`${pkg.name}@${pkg.version}`, pkg);
        }
      }
    }
  }
  return meta;
}

function sriToCdxHash(sri) {
  if (!sri) return [];
  const [alg, b64] = sri.split("-");
  if (!b64) return [];
  const map = { sha512: "SHA-512", sha384: "SHA-384", sha256: "SHA-256", sha1: "SHA-1" };
  const cdxAlg = map[alg];
  if (!cdxAlg) return [];
  return [{ alg: cdxAlg, content: Buffer.from(b64, "base64").toString("hex") }];
}

function toPurl(name, version) {
  if (name.startsWith("@")) {
    const [scope, pkg] = name.split("/");
    return `pkg:npm/${encodeURIComponent(scope)}/${pkg}@${version}`;
  }
  return `pkg:npm/${name}@${version}`;
}

function extractLicense(pkg) {
  if (!pkg) return [];
  const raw = typeof pkg.license === "string" ? pkg.license : typeof pkg.license?.type === "string" ? pkg.license.type : null;
  if (!raw) return [];
  // Simple SPDX identifier vs complex expression
  if (/^[A-Za-z0-9.-]+$/.test(raw)) return [{ license: { id: raw } }];
  return [{ expression: raw }];
}

const rootPkg = readJson(join(ROOT, "package.json"));
const lockText = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");
const { packages, graph } = parsePnpmLock(lockText);
const directRuntime = collectDirectRuntimeDeps();
const runtimeClosure = computeRuntimeClosure(directRuntime, graph);
const installedMeta = readInstalledMetadata();

const components = [];
const licenseCounts = new Map();
let runtimeCount = 0;
let devCount = 0;

for (const [key, info] of [...packages.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const pkg = installedMeta.get(key);
  const isRuntime = runtimeClosure.has(info.name);
  if (isRuntime) runtimeCount++;
  else devCount++;
  const licenses = extractLicense(pkg);
  const licLabel = licenses[0]?.license?.id ?? licenses[0]?.expression ?? "UNKNOWN";
  licenseCounts.set(licLabel, (licenseCounts.get(licLabel) ?? 0) + 1);

  const slash = info.name.startsWith("@") ? info.name.indexOf("/") : -1;
  const group = slash > 0 ? info.name.slice(0, slash) : undefined;
  const name = slash > 0 ? info.name.slice(slash + 1) : info.name;
  const purl = toPurl(info.name, info.version);
  const hashes = sriToCdxHash(info.integrity);

  components.push({
    type: "library",
    "bom-ref": purl,
    ...(group ? { group } : {}),
    name,
    version: info.version,
    purl,
    scope: isRuntime ? "required" : "excluded",
    ...(licenses.length ? { licenses } : {}),
    ...(hashes.length ? { hashes } : {}),
    properties: [{ name: "croco:dependency-class", value: isRuntime ? "runtime" : "development" }],
  });
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: {
      components: [
        {
          type: "application",
          name: "croco-sbom-generator",
          version: rootPkg.version,
        },
      ],
    },
    component: {
      type: "application",
      "bom-ref": `pkg:npm/${rootPkg.name}@${rootPkg.version}`,
      name: rootPkg.name,
      version: rootPkg.version,
      description: rootPkg.description,
    },
  },
  components,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");

console.log(`Generated CycloneDX 1.5 SBOM: ${OUT_PATH}`);
console.log(`  Total components: ${components.length} (${runtimeCount} runtime, ${devCount} dev)`);
console.log(
  `  Licenses: ${[...licenseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")}`,
);
