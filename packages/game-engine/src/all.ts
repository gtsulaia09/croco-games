/** Eager registry for the server (Worker / Durable Objects). */
import type { GameType } from "@croco/shared";
import type { GameEngine } from "./core/engine";
import { backgammonEngine } from "./games/backgammon";
import { bura3Engine } from "./games/bura3";
import { bura5Engine } from "./games/bura5";
import { dominoesEngine } from "./games/dominoes";
import { japaneseJokerEngine } from "./games/japanese_joker";
import { jokerEngine } from "./games/joker";
import { holdemEngine, omahaEngine, omahaHiLoEngine, shortDeckEngine } from "./games/poker";

export const allEngines: Record<GameType, GameEngine> = {
  joker: jokerEngine as unknown as GameEngine,
  japanese_joker: japaneseJokerEngine as unknown as GameEngine,
  bura3: bura3Engine as unknown as GameEngine,
  bura5: bura5Engine as unknown as GameEngine,
  holdem: holdemEngine as unknown as GameEngine,
  shortdeck: shortDeckEngine as unknown as GameEngine,
  omaha: omahaEngine as unknown as GameEngine,
  omaha_hilo: omahaHiLoEngine as unknown as GameEngine,
  dominoes: dominoesEngine as unknown as GameEngine,
  backgammon: backgammonEngine as unknown as GameEngine,
};
