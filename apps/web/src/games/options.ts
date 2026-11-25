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
    { key: "hist", kind: "select", options: ["classic", "none"], default: "classic" },
    { key: "setBonus", kind: "select", options: ["simple", "double", "none"], default: "simple" },
    { key: "nineTrump", kind: "select", options: ["lastCard", "choose"], default: "lastCard" },
    { key: "ledJokerTrumped", kind: "select", options: ["trumpWins", "jokerWins"], default: "trumpWins" },
  ],
  japanese_joker: [
    { key: "targetPoints", kind: "number", min: 5, max: 50, default: 20 },
    { key: "revealMode", kind: "select", options: ["toHand", "flip"], default: "toHand" },
    { key: "lastPileToHand", kind: "boolean", default: true },
  ],
  bura3: [
    { key: "targetPoints", kind: "number", min: 3, max: 21, default: 7 },
    { key: "deck", kind: "select", options: ["36", "32"], default: "36" },
    { key: "closedDiscards", kind: "boolean", default: true },
    { key: "combinations", kind: "boolean", default: false },
    { key: "threeAcesWin", kind: "boolean", default: false },
    { key: "memoryAid", kind: "boolean", default: false },
  ],
  bura5: [
    { key: "penaltyLimit", kind: "number", min: 6, max: 24, default: 12 },
    { key: "deck", kind: "select", options: ["36", "32"], default: "36" },
    { key: "maxLead", kind: "select", options: [3, 5], default: 3 },
    { key: "closedDiscards", kind: "boolean", default: true },
  ],
  holdem: poker,
  shortdeck: [...poker, { key: "tripsBeatStraight", kind: "boolean", default: true }],
  omaha: withDefault(poker, "bettingStructure", "pot_limit"),
  omaha_hilo: withDefault(poker, "bettingStructure", "pot_limit"),
  dominoes: [
    { key: "variant", kind: "select", options: ["draw", "block"], default: "draw" },
    { key: "scoreLimit", kind: "number", min: 50, max: 500, step: 10, default: 100 },
    { key: "handSize", kind: "number", min: 5, max: 7, default: 7 },
  ],
  backgammon: [
    { key: "matchLength", kind: "select", options: [1, 3, 5, 7, 9, 11], default: 5 },
    { key: "doublingCube", kind: "boolean", default: true },
    { key: "crawford", kind: "boolean", default: true },
  ],
};

export function defaultOptions(game: GameType): Record<string, unknown> {
  return Object.fromEntries(GAME_OPTIONS[game].map((o) => [o.key, o.default]));
}
