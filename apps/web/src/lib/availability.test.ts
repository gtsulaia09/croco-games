import { describe, expect, it } from "vitest";
import { GAME_TYPES } from "@croco/shared/client";
import { isVisibleGame, LOBBY_ENTRIES, VISIBLE_GAMES } from "./availability";

describe("public game availability", () => {
  it("offers only Joker, Japanese Joker and Bura", () => {
    expect([...VISIBLE_GAMES].sort()).toEqual(["bura3", "bura5", "japanese_joker", "joker"]);
    expect(LOBBY_ENTRIES.map((e) => e.id)).toEqual(["joker", "japanese_joker", "bura"]);
  });

  it("hides the other games without removing them from the catalog", () => {
    for (const g of ["holdem", "shortdeck", "omaha", "omaha_hilo", "dominoes", "backgammon"] as const) {
      expect(GAME_TYPES).toContain(g);
      expect(isVisibleGame(g)).toBe(false);
    }
  });

  it("lobby entries cover exactly the visible games", () => {
    expect(LOBBY_ENTRIES.flatMap((e) => e.games).sort()).toEqual([...VISIBLE_GAMES].sort());
  });
});
