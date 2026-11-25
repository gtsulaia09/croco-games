import { useState } from "react";
import type { DominoesView } from "@croco/game-engine/games/dominoes";
import { useT } from "../i18n";
import { opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

function Tile({ a, b, vertical, onClick, active }: { a: number; b: number; vertical?: boolean; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <span>{a}</span>
      <span className={vertical ? "h-px w-5 bg-black/40" : "w-px h-5 bg-black/40"} />
      <span>{b}</span>
    </>
  );
  const cls = `inline-flex ${vertical ? "flex-col" : ""} items-center justify-center gap-1 rounded-md bg-[#f7f5ee] text-[#1a1e23] font-bold text-sm border border-[#cfcac0] ${
    vertical ? "w-8 h-14" : "h-8 px-2"
  } ${active ? "ring-2 ring-primary" : ""}`;
  return onClick ? (
    <button type="button" className={`${cls} hover:-translate-y-1 transition-transform`} onClick={onClick} aria-label={`${a}-${b}`}>
      {body}
    </button>
  ) : (
    <span className={cls} aria-label={`${a}-${b}`}>
      {body}
    </span>
  );
}

const values = (tile: string) => tile.split("-").map(Number) as [number, number];

export default function DominoesBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<DominoesView>) {
  const t = useT();
  const name = useSeatName(seats);
  const [choose, setChoose] = useState<string | null>(null);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const hand = view.you?.hand ?? [];
  const ends = view.ends;
  const fits = (tile: string, end: number) => values(tile).includes(end);
  const options = (tile: string): Array<"left" | "right"> => {
    if (!ends) return view.opening && view.opening !== tile ? [] : ["left"];
    const out: Array<"left" | "right"> = [];
    if (fits(tile, ends.left)) out.push("left");
    if (fits(tile, ends.right)) out.push("right");
    return out;
  };
  const anyPlayable = hand.some((tile) => options(tile).length > 0);

  function play(tile: string) {
    const opts = options(tile);
    if (opts.length === 1) onAction({ type: "play", tile, end: opts[0] });
    // Both ends show the same number: the choice makes no difference.
    else if (opts.length === 2 && ends && ends.left === ends.right) onAction({ type: "play", tile, end: "left" });
    else if (opts.length === 2) setChoose(tile);
  }

  return (
    <div className="felt rounded-xl p-3 sm:p-4 grid gap-3">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span>{t("game.round", { n: view.round })}</span>
            <span>{t("dominoes.boneyard", { n: view.boneyardCount })}</span>
            <span>{t("dominoes.limit", { n: view.scoreLimit })}</span>
          </>
        }
      />
      {view.lastRound && (
        <p className="text-xs text-gold text-center">
          {view.lastRound.blocked ? `${t("dominoes.blocked")} · ` : ""}
          {view.lastRound.winner !== null ? `${name(view.lastRound.winner)} +${view.lastRound.points}` : "—"}
        </p>
      )}
      <div className="flex flex-wrap gap-2 justify-center">
        {opponentsOrder(view.handCounts.length, mySeat).map((s) => (
          <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s}>
            <span>🁣 {view.handCounts[s]}</span>
            <span>Σ {view.scores[s]}</span>
          </SeatTag>
        ))}
      </div>
      <div className="rounded-lg bg-black/15 p-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-h-14 w-max mx-auto">
          {view.line.length === 0 ? (
            <span className="text-sm text-muted">—</span>
          ) : (
            view.line.map((p, i) => <Tile key={`${p.tile}-${i}`} a={p.left} b={p.right} vertical={p.left === p.right} />)
          )}
        </div>
      </div>
      {mySeat !== null && (
        <div className="grid gap-2">
          <SeatTag seat={mySeat} seats={seats} active={myTurn}>
            <span>Σ {view.scores[mySeat]}</span>
          </SeatTag>
          <div className="flex flex-wrap gap-1.5 justify-center" role="group" aria-label={t("game.yourHand")}>
            {hand.map((tile) => {
              const [a, b] = values(tile);
              const can = myTurn && options(tile).length > 0;
              return <Tile key={tile} a={a} b={b} vertical onClick={can ? () => play(tile) : undefined} active={choose === tile} />;
            })}
          </div>
          {myTurn && choose && (
            <div className="flex gap-2 justify-center items-center">
              <span className="text-sm">{t("dominoes.chooseEnd")}</span>
              {(["left", "right"] as const).map((end) => (
                <button
                  key={end}
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    onAction({ type: "play", tile: choose, end });
                    setChoose(null);
                  }}
                >
                  {t(`dominoes.${end}`)} ({end === "left" ? ends?.left : ends?.right})
                </button>
              ))}
            </div>
          )}
          {myTurn && !anyPlayable && (
            <div className="flex justify-center">
              {view.variant === "draw" && view.boneyardCount > 0 ? (
                <button className="btn-primary" onClick={() => onAction({ type: "draw" })}>
                  {t("dominoes.draw")}
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => onAction({ type: "pass" })}>
                  {t("dominoes.pass")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
