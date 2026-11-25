/**
 * Game catalog shared by the frontend, the Worker and the engines.
 * Every game type has its own engine, leaderboard and statistics.
 */
export const GAME_TYPES = [
  "joker",
  "japanese_joker",
  "bura3",
  "bura5",
  "holdem",
  "shortdeck",
  "omaha",
  "omaha_hilo",
  "dominoes",
  "backgammon",
] as const;

export type GameType = (typeof GAME_TYPES)[number];

export type GameFamily = "joker" | "bura" | "poker" | "dominoes" | "backgammon";

export interface GameInfo {
  readonly type: GameType;
  readonly family: GameFamily;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly defaultPlayers: number;
  /** i18n key prefix, e.g. `games.joker.name` */
  readonly i18nKey: string;
}

export const GAME_CATALOG: Readonly<Record<GameType, GameInfo>> = {
  joker: { type: "joker", family: "joker", minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, i18nKey: "games.joker" },
  japanese_joker: {
    type: "japanese_joker",
    family: "joker",
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    i18nKey: "games.japanese_joker",
  },
  bura3: { type: "bura3", family: "bura", minPlayers: 2, maxPlayers: 2, defaultPlayers: 2, i18nKey: "games.bura3" },
  /** Team game: seats 0+2 against 1+3. */
  bura5: { type: "bura5", family: "bura", minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, i18nKey: "games.bura5" },
  holdem: { type: "holdem", family: "poker", minPlayers: 2, maxPlayers: 10, defaultPlayers: 6, i18nKey: "games.holdem" },
  shortdeck: { type: "shortdeck", family: "poker", minPlayers: 2, maxPlayers: 6, defaultPlayers: 6, i18nKey: "games.shortdeck" },
  omaha: { type: "omaha", family: "poker", minPlayers: 2, maxPlayers: 10, defaultPlayers: 6, i18nKey: "games.omaha" },
  omaha_hilo: { type: "omaha_hilo", family: "poker", minPlayers: 2, maxPlayers: 10, defaultPlayers: 6, i18nKey: "games.omaha_hilo" },
  dominoes: { type: "dominoes", family: "dominoes", minPlayers: 2, maxPlayers: 2, defaultPlayers: 2, i18nKey: "games.dominoes" },
  backgammon: {
    type: "backgammon",
    family: "backgammon",
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    i18nKey: "games.backgammon",
  },
};

export function isGameType(value: unknown): value is GameType {
  return typeof value === "string" && (GAME_TYPES as readonly string[]).includes(value);
}

export const BOT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];
