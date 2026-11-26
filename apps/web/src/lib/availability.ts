import type { GameType } from "@croco/shared/client";

/**
 * Games offered in the public interface during this development phase.
 *
 * The other games stay fully implemented — engines, API, rooms, ratings, routes and history
 * all keep working — they are only left out of navigation, the lobby, the practice list and the
 * leaderboard tabs. Restore a game by adding it back to this list.
 */
export const VISIBLE_GAMES: readonly GameType[] = ["joker", "japanese_joker", "bura3", "bura5"];

export function isVisibleGame(game: GameType): boolean {
  return VISIBLE_GAMES.includes(game);
}

/** Lobby entries: Bura shows its two variants (three-card and five-card) as modes of one game. */
export interface LobbyEntry {
  id: "joker" | "japanese_joker" | "bura";
  games: readonly GameType[];
}

export const LOBBY_ENTRIES: readonly LobbyEntry[] = [
  { id: "joker", games: ["joker"] },
  { id: "japanese_joker", games: ["japanese_joker"] },
  { id: "bura", games: ["bura3", "bura5"] },
];
