#!/usr/bin/env node
/**
 * Measures the initial download of the built web app (entry script + modulepreloads + CSS
 * referenced by index.html) and every lazy chunk, gzip level 9. Fails when the initial JS
 * exceeds the budget documented in docs/PERFORMANCE.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const dist = process.argv[2] ?? "apps/web/dist";
const BUDGET_INITIAL_JS_GZ = 200 * 1024;
const BUDGET_CHUNK_GZ = 60 * 1024;

const html = readFileSync(join(dist, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1].replace(/^.*?assets\//, "assets/"));
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let initialJs = 0;
let initialCss = 0;
console.log("Initial load:");
for (const ref of refs) {
  const size = gz(ref);
  if (ref.endsWith(".js")) initialJs += size;
  else initialCss += size;
  console.log(`  ${ref.padEnd(44)} ${kb(size)}`);
}
console.log(`  JS total: ${kb(initialJs)} gz (budget ${kb(BUDGET_INITIAL_JS_GZ)}), CSS: ${kb(initialCss)} gz`);

const chunks = readdirSync(join(dist, "assets"))
  .filter((f) => f.endsWith(".js") && !refs.includes(`assets/${f}`))
  .map((f) => ({ f, size: gz(`assets/${f}`), raw: statSync(join(dist, "assets", f)).size }))
  .sort((a, b) => b.size - a.size);
console.log(`\nLazy chunks (${chunks.length}), largest first:`);
for (const c of chunks.slice(0, 15)) console.log(`  ${c.f.padEnd(44)} ${kb(c.size)} gz (${kb(c.raw)} raw)`);

let failed = false;
if (initialJs > BUDGET_INITIAL_JS_GZ) {
  console.error(`\n✗ Initial JS ${kb(initialJs)} exceeds budget ${kb(BUDGET_INITIAL_JS_GZ)}`);
  failed = true;
}
const big = chunks.filter((c) => c.size > BUDGET_CHUNK_GZ && !/^esm-|^index\.esm-/.test(c.f));
for (const c of big) {
  console.error(`✗ Lazy chunk ${c.f} is ${kb(c.size)} gz (budget ${kb(BUDGET_CHUNK_GZ)})`);
  failed = true;
}
if (failed) process.exit(1);
console.log("\n✓ Bundle budget met.");
