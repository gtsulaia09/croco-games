import { describe, expect, it } from "vitest";
import { GAME_TYPES } from "@croco/shared";
import { allEngines } from "../all";
import { cryptoRng, rollDie, shuffle } from "./rng";
import { DECK_36_JOKERS, DECK_52 } from "./cards";
import { placementsFromScores } from "./engine";
import { loadEngine } from "../registry";

describe("cryptographic RNG", () => {
  it("produces integers within range", () => {
    const rng = cryptoRng();
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.int(1.5)).toThrow();
  });

  it("rolls fair dice (chi-square, 60 000 rolls, p≈0.001 critical value 20.5)", () => {
    const rng = cryptoRng();
    const counts = new Array<number>(6).fill(0);
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[rollDie(rng) - 1]! += 1;
    const expected = n / 6;
    const chi = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(20.5);
  });

  it("shuffles without bias: every card lands in every position roughly equally", () => {
    const rng = cryptoRng();
    const deck = ["a", "b", "c", "d", "e"];
    const counts: number[][] = deck.map(() => new Array<number>(5).fill(0));
    const n = 50_000;
    for (let i = 0; i < n; i++) shuffle(deck, rng).forEach((card, pos) => (counts[deck.indexOf(card)]![pos]! += 1));
    const expected = n / 5;
    let chi = 0;
    for (const row of counts) for (const c of row) chi += (c - expected) ** 2 / expected;
    // 16 degrees of freedom, p≈0.001 critical value ≈ 39.3
    expect(chi).toBeLessThan(39.3);
  });

  it("keeps decks intact", () => {
    const rng = cryptoRng();
    expect(shuffle(DECK_52, rng).sort()).toEqual([...DECK_52].sort());
    expect(DECK_36_JOKERS).toHaveLength(36);
  });
});

describe("engine registry", () => {
  it("has an independent engine for every game type", async () => {
    for (const type of GAME_TYPES) {
      expect(allEngines[type].type).toBe(type);
      expect((await loadEngine(type)).type).toBe(type);
    }
    // Every engine must be its own object (no renamed duplicates).
    expect(new Set(Object.values(allEngines)).size).toBe(GAME_TYPES.length);
  });

  it("every engine rejects unknown and malformed actions at the schema level", () => {
    for (const type of GAME_TYPES) {
      const e = allEngines[type];
      expect(e.actionSchema.safeParse({ type: "win_instantly" }).success).toBe(false);
      expect(e.actionSchema.safeParse({ type: "play", card: "ZZ" }).success).toBe(false);
      expect(e.actionSchema.safeParse(null).success).toBe(false);
    }
  });

  it("every engine rejects unexpected config fields", () => {
    for (const type of GAME_TYPES) {
      expect(allEngines[type].configSchema.safeParse({ scoreOverride: 9999 }).success).toBe(false);
    }
  });
});

describe("placements", () => {
  it("shares placements on ties", () => {
    expect(placementsFromScores([10, 30, 30, 5])).toEqual([3, 1, 1, 4]);
    expect(placementsFromScores([2, 6, 2], true)).toEqual([1, 3, 1]);
  });
});
