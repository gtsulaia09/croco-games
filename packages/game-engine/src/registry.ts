import type { GameType } from "@croco/shared";
import type { GameEngine } from "./core/engine";

/**
 * Lazy engine loaders. The web app imports only the engine of the selected game (code
 * splitting); the Worker imports `allEngines` eagerly.
 */
export const engineLoaders: Record<GameType, () => Promise<GameEngine>> = {
  joker: () => import("./games/joker").then((m) => m.jokerEngine as unknown as GameEngine),
  japanese_joker: () => import("./games/japanese_joker").then((m) => m.japaneseJokerEngine as unknown as GameEngine),
  bura3: () => import("./games/bura3").then((m) => m.bura3Engine as unknown as GameEngine),
  bura5: () => import("./games/bura5").then((m) => m.bura5Engine as unknown as GameEngine),
  holdem: () => import("./games/poker").then((m) => m.holdemEngine as unknown as GameEngine),
  shortdeck: () => import("./games/poker").then((m) => m.shortDeckEngine as unknown as GameEngine),
  omaha: () => import("./games/poker").then((m) => m.omahaEngine as unknown as GameEngine),
  omaha_hilo: () => import("./games/poker").then((m) => m.omahaHiLoEngine as unknown as GameEngine),
  dominoes: () => import("./games/dominoes").then((m) => m.dominoesEngine as unknown as GameEngine),
  backgammon: () => import("./games/backgammon").then((m) => m.backgammonEngine as unknown as GameEngine),
};

export function loadEngine(type: GameType): Promise<GameEngine> {
  return engineLoaders[type]();
}
