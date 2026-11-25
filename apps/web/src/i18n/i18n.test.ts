import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ka } from "./ka";

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = ""): Array<[string, string]> => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const sources: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !f.endsWith(".test.ts")) sources.push(readFileSync(p, "utf8"));
  }
};
walk(join(import.meta.dirname, ".."));

const ALLOWED_NON_GEORGIAN_KEYS = new Set(["app.name", "common.admin", "leaderboard.rank", "ui.sb", "ui.bb", "opt.values.classic", "opt.values.none"]);

describe("translations", () => {
  const enKeys = new Map(flat(en as unknown as Tree));
  const kaKeys = new Map(flat(ka as unknown as Tree));

  it("Georgian and English have exactly the same keys", () => {
    expect([...kaKeys.keys()].sort()).toEqual([...enKeys.keys()].sort());
  });

  it("use the same {placeholders} in both languages", () => {
    for (const [key, value] of enKeys) expect(params(kaKeys.get(key) ?? ""), key).toEqual(params(value));
  });

  it("contain no empty strings or markup", () => {
    for (const [key, value] of [...enKeys, ...kaKeys]) {
      expect(value.trim(), key).not.toBe("");
      expect(value, key).not.toMatch(/<[a-z]/i);
    }
  });

  it("Georgian dictionary uses Georgian script and avoids broken {name}-suffix morphology", () => {
    for (const [key, value] of kaKeys) {
      if (!ALLOWED_NON_GEORGIAN_KEYS.has(key)) {
        expect(value, `${key} should contain Georgian script`).toMatch(/[\u10D0-\u10FF]/);
      }
      expect(value, `${key} must not attach raw case suffixes to {name}`).not.toMatch(/\{name\}-(მა|ის|ს)\b/);
    }
  });

  it("define every literal key used by the UI", () => {
    const used = new Set(sources.flatMap((s) => [...s.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]!)));
    expect(used.size).toBeGreaterThan(100);
    const missing = [...used].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });
});
