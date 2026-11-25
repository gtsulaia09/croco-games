import { useState } from "react";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";
import type { DominoesView } from "@croco/game-engine/games/dominoes";
import { useT } from "../i18n";
import { MiniCardCount, opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

/** Standard 3x3 grid coordinates for domino pips 0..6 inside a 32x32 half-face. */
const PIP_COORDS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[16, 16]],
  2: [
    [9, 9],
    [23, 23],
  ],
  3: [
    [9, 9],
    [16, 16],
    [23, 23],
  ],
  4: [
    [9, 9],
    [23, 9],
    [9, 23],
    [23, 23],
  ],
  5: [
    [9, 9],
    [23, 9],
    [16, 16],
    [9, 23],
    [23, 23],
  ],
  6: [
    [9, 8],
    [23, 8],
    [9, 16],
    [23, 16],
    [9, 24],
    [23, 24],
  ],
};

const PIP_COLORS: Record<number, string> = {
  1: "#c9252d",
  2: "#16507a",
  3: "#136938",
  4: "#94500c",
  5: "#1f2937",
  6: "#111827",
};

function PipFace({ n, size = 28 }: { n: number; size?: number }) {
  const pips = PIP_COORDS[n] ?? [];
  const fill = PIP_COLORS[n] ?? "#111827";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3.1} fill={fill} />
      ))}
    </svg>
  );
}

function DominoTile({
  a,
  b,
  vertical,
  onClick,
  active,
  playable = true,
  compact,
}: {
  a: number;
  b: number;
  vertical?: boolean;
  onClick?: () => void;
  active?: boolean;
  playable?: boolean;
  compact?: boolean;
}) {
  const faceSize = compact ? 24 : 30;
  const inner = (
    <>
      <PipFace n={a} size={faceSize} />
      <span className={`relative flex items-center justify-center shrink-0 ${vertical ? "w-4/5 h-[1.5px] my-0.5" : "h-4/5 w-[1.5px] mx-0.5"} bg-[#8b816e]`}>
        <span className="size-1.5 rounded-full bg-[#c59a38]" aria-hidden="true" />
      </span>
      <PipFace n={b} size={faceSize} />
    </>
  );

  const cls = `domino-tile inline-flex ${vertical ? "flex-col px-1 py-1.5" : "flex-row px-1.5 py-1"} items-center justify-center rounded-lg shrink-0 select-none`;

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        data-active={active ? "true" : "false"}
        data-playable={playable ? "true" : "false"}
        disabled={!playable}
        onClick={onClick}
        aria-label={`${a}-${b}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={cls} data-active={active ? "true" : "false"} data-playable={playable ? "true" : "false"} aria-label={`${a}-${b}`}>
      {inner}
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
    else if (opts.length === 2 && ends && ends.left === ends.right) onAction({ type: "play", tile, end: "left" });
    else if (opts.length === 2) setChoose(tile);
  }

  return (
    <div className="table-arena felt-dominoes">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className="chip bg-bg/75 border border-white/12 text-text-2">{t("game.round", { n: view.round })}</span>
            <span className="chip bg-bg/75 border border-white/12 text-text-2">
              <Layers size={11} /> {t("dominoes.boneyard", { n: view.boneyardCount })}
            </span>
            <span className="chip bg-gold/15 border border-gold/35 text-gold">{t("dominoes.limit", { n: view.scoreLimit })}</span>
          </>
        }
      />

      {view.lastRound && (
        <div className="rounded-xl bg-gold/15 border border-gold/40 px-3 py-1.5 text-xs font-bold text-gold text-center">
          {view.lastRound.blocked ? `${t("dominoes.blocked")} · ` : ""}
          {view.lastRound.winner !== null ? `${name(view.lastRound.winner)} +${view.lastRound.points}` : "—"}
        </div>
      )}

      {/* Opponents */}
      <div className="flex flex-wrap gap-2.5 justify-center">
        {opponentsOrder(view.handCounts.length, mySeat).map((s) => (
          <div key={s} className="min-w-48 flex-1 max-w-xs">
            <SeatTag seat={s} seats={seats} active={view.toAct === s}>
              <MiniCardCount count={view.handCounts[s] ?? 0} />
              <span className="text-gold font-extrabold tabular-nums">
                {view.scores[s]} / {view.scoreLimit}
              </span>
            </SeatTag>
          </div>
        ))}
      </div>

      {/* Dominoes Felt Chain Arena */}
      <div className="rounded-2xl border border-white/12 bg-black/24 p-3.5 sm:p-5 grid gap-3 shadow-[inset_0_4px_20px_rgba(0,0,0,0.4)]">
        {ends && (
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="chip bg-gold/15 border border-gold/35 text-gold">
              <ArrowLeft size={11} /> {t("dominoes.left")}: {ends.left}
            </span>
            <span className="text-muted uppercase tracking-wider text-[10px]">{t("ui.openEnds")}</span>
            <span className="chip bg-gold/15 border border-gold/35 text-gold">
              {t("dominoes.right")}: {ends.right} <ArrowRight size={11} />
            </span>
          </div>
        )}
        <div className="overflow-x-auto pb-1">
          <div className="flex items-center justify-center gap-1.5 min-h-24 w-max mx-auto px-2">
            {view.line.length === 0 ? (
              <span className="text-xs uppercase tracking-widest text-white/35 font-bold">DOMINOES · DOUBLE-SIX</span>
            ) : (
              view.line.map((p, i) => (
                <div key={`${p.tile}-${i}`} className="card-enter">
                  <DominoTile a={p.left} b={p.right} vertical={p.left === p.right} compact />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Player Hand Rack & Controls */}
      {mySeat !== null && (
        <div className="grid gap-3 pt-1">
          <div className="max-w-xs mx-auto w-full">
            <SeatTag seat={mySeat} seats={seats} active={myTurn}>
              <span className="text-gold font-extrabold tabular-nums">
                {view.scores[mySeat]} / {view.scoreLimit}
              </span>
            </SeatTag>
          </div>

          <div className="flex flex-wrap gap-2 justify-center py-1" role="group" aria-label={t("game.yourHand")}>
            {hand.map((tile) => {
              const [a, b] = values(tile);
              const can = myTurn && options(tile).length > 0;
              return (
                <DominoTile
                  key={tile}
                  a={a}
                  b={b}
                  vertical
                  playable={!myTurn || can}
                  onClick={can ? () => play(tile) : undefined}
                  active={choose === tile}
                />
              );
            })}
          </div>

          {myTurn && choose && (
            <div className="rounded-xl bg-bg/85 border border-gold/45 p-3 flex flex-wrap gap-2 justify-center items-center fade-in">
              <span className="text-sm font-bold text-white">{t("dominoes.chooseEnd")}</span>
              {(["left", "right"] as const).map((end) => (
                <button
                  key={end}
                  className="btn-gold btn-sm"
                  onClick={() => {
                    onAction({ type: "play", tile: choose, end });
                    setChoose(null);
                  }}
                >
                  {end === "left" ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
                  {t(`dominoes.${end}`)} ({end === "left" ? ends?.left : ends?.right})
                </button>
              ))}
            </div>
          )}

          {myTurn && !anyPlayable && (
            <div className="flex justify-center">
              {view.variant === "draw" && view.boneyardCount > 0 ? (
                <button className="btn-primary px-6" onClick={() => onAction({ type: "draw" })}>
                  <Layers size={15} /> {t("dominoes.draw")} ({view.boneyardCount})
                </button>
              ) : (
                <button className="btn-secondary px-6" onClick={() => onAction({ type: "pass" })}>
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
