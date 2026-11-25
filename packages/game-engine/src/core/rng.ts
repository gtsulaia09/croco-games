/**
 * Randomness for game-critical outcomes (shuffles, dice, dealing).
 * Production code must use `cryptoRng()`. Seeded generators live in `../testing` only.
 */
export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

const UINT32_RANGE = 0x1_0000_0000;

/** CSPRNG-backed RNG using rejection sampling to avoid modulo bias. */
export function cryptoRng(): Rng {
  const buffer = new Uint32Array(64);
  let index = buffer.length;
  const next = (): number => {
    if (index >= buffer.length) {
      crypto.getRandomValues(buffer);
      index = 0;
    }
    return buffer[index++]!;
  };
  return {
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
        throw new RangeError("maxExclusive must be an integer in (0, 2^32]");
      }
      const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
      for (;;) {
        const value = next();
        if (value < limit) return value % maxExclusive;
      }
    },
  };
}

/** Unbiased Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function rollDie(rng: Rng): number {
  return rng.int(6) + 1;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new RangeError("Cannot pick from an empty list");
  return items[rng.int(items.length)]!;
}
