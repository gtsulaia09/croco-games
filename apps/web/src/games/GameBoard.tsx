import { lazy, Suspense } from "react";
import { GAME_CATALOG } from "@croco/shared/client";
import { Spinner } from "../components/ui";
import type { BoardProps } from "./common";
import "./table.css";

// Each game's UI is a separate lazy chunk: only the selected game is downloaded.
const JokerBoard = lazy(() => import("./JokerBoard"));
const JapaneseJokerBoard = lazy(() => import("./JapaneseJokerBoard"));
const Bura3Board = lazy(() => import("./Bura3Board"));
const Bura5Board = lazy(() => import("./Bura5Board"));
const PokerBoard = lazy(() => import("./PokerBoard"));
const DominoesBoard = lazy(() => import("./DominoesBoard"));
const BackgammonBoard = lazy(() => import("./BackgammonBoard"));

/**
 * The server (or the local practice engine) is the source of truth for the view shape of each
 * game type; boards trust that contract and never use the view to decide legality.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBoard = BoardProps<any>;

export function GameBoard(input: BoardProps) {
  const props = input as AnyBoard;
  const family = GAME_CATALOG[props.gameType].family;
  let board;
  if (props.gameType === "japanese_joker") board = <JapaneseJokerBoard {...props} />;
  else if (family === "joker") board = <JokerBoard {...props} />;
  else if (props.gameType === "bura3") board = <Bura3Board {...props} />;
  else if (props.gameType === "bura5") board = <Bura5Board {...props} />;
  else if (family === "poker") board = <PokerBoard {...props} />;
  else if (family === "dominoes") board = <DominoesBoard {...props} />;
  else board = <BackgammonBoard {...props} />;
  return <Suspense fallback={<Spinner />}>{board}</Suspense>;
}
