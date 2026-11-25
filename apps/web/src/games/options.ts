import type { GameType } from "@croco/shared/client";

/** Declarative per-game room options. Values are validated again by the engine schema on the server. */
export type OptionSpec =
  | { key: string; kind: "select"; options: Array<string | number>; default: string | number; labels?: Record<string, string> }
  | { key: string; kind: "number"; min: number; max: number; step?: number; default: number }
  | { key: string; kind: "boolean"; default: boolean };

const poker: OptionSpec[] = [
  { key: "startingChips", kind: "number", min: 100, max: 100000, step: 100, default: 1000 },
  { key: "smallBlind", kind: "number", min: 0, max: 10000, default: 5 },
  { key: "bigBlind", kind: "number", min: 1, max: 20000, default: 10 },
  { key: "ante", kind: "number", min: 0, max: 10000, default: 0 },
  { key: "bettingStructure", kind: "select", options: ["no_limit", "pot_limit", "fixed_limit"], default: "no_limit" },
  { key: "maxHands", kind: "number", min: 5, max: 500, default: 100 },
  { key: "blindLevelHands", kind: "number", min: 0, max: 100, default: 0 },
];

function withDefault(specs: OptionSpec[], key: string, value: string): OptionSpec[] {
  return specs.map((o) => (o.key === key && o.kind === "select" ? { ...o, default: value } : o));
}

export const GAME_OPTIONS: Record<GameType, OptionSpec[]> = {
  joker: [
    { key: "ruleset", kind: "select", options: ["standard", "nines"], default: "standard" },
    { key: "hist", kind: "select", options: ["none", "classic"], default: "none" },
    { key: "setBonus", kind: "select", options: ["simple", "double", "none"], default: "simple" },
    { key: "nineTrump", kind: "select", options: ["lastCard", "choose"], default: "lastCard" },
    { key: "ledJokerTrumped", kind: "select", options: ["trumpWins", "jokerWins"], default: "trumpWins" },
  ],
  japanese_joker: [
    { key: "targetPoints", kind: "select", options: [1, 3, 7, 11, 21], default: 11 },
    { key: "revealMode", kind: "select", options: ["flip", "toHand"], default: "flip" },
    { key: "lastPileToHand", kind: "boolean", default: false },
    { key: "jokerLow", kind: "boolean", default: true },
  ],
  bura3: [
    { key: "targetPoints", kind: "select", options: [6, 11, 21], default: 11 },
    { key: "deck", kind: "select", options: ["20", "32", "36"], default: "20" },
    { key: "closedDiscards", kind: "boolean", default: true },
    { key: "memoryAid", kind: "boolean", default: false },
  ],
  bura5: [
    { key: "targetPoints", kind: "select", options: [6, 11, 21], default: 11 },
    { key: "raises", kind: "boolean", default: true },
    { key: "malutka", kind: "boolean", default: true },
    { key: "closedDiscards", kind: "boolean", default: true },
  ],
  holdem: poker,
  shortdeck: [
    ...poker,
    { key: "shortDeckBlinds", kind: "select", options: ["button", "blinds"], default: "button" },
    { key: "tripsBeatStraight", kind: "boolean", default: false },
  ],
  omaha: withDefault(poker, "bettingStructure", "pot_limit"),
  omaha_hilo: withDefault(poker, "bettingStructure", "pot_limit"),
  dominoes: [
    { key: "variant", kind: "select", options: ["draw", "block"], default: "draw" },
    { key: "scoreLimit", kind: "number", min: 50, max: 500, step: 5, default: 100 },
  ],
  backgammon: [{ key: "matchLength", kind: "select", options: [1, 3, 5, 7], default: 3 }],
};

export function defaultOptions(game: GameType): Record<string, unknown> {
  return Object.fromEntries(GAME_OPTIONS[game].map((o) => [o.key, o.default]));
}
