import { lazy, Suspense } from "react";
import { GAME_CATALOG } from "@croco/shared/client";
import { Spinner } from "../components/ui";
import type { BoardProps } from "./common";

// Each game family's UI is a separate chunk: only the selected game is downloaded.
const JokerBoard = lazy(() => import("./JokerBoard"));
const JapaneseJokerBoard = lazy(() => import("./JapaneseJokerBoard"));
const BuraBoard = lazy(() => import("./BuraBoard"));
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
  else if (family === "bura") board = <BuraBoard {...props} />;
  else if (family === "poker") board = <PokerBoard {...props} />;
  else if (family === "dominoes") board = <DominoesBoard {...props} />;
  else board = <BackgammonBoard {...props} />;
  return <Suspense fallback={<Spinner />}>{board}</Suspense>;
}
