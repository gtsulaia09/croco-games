import { useState } from "react";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";
import type { DominoesView } from "@croco/game-engine/games/dominoes";
import { useT } from "../i18n";
import { MiniCardCount, opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

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
  1: "#dc2626",
  2: "#0369a1",
  3: "#15803d",
  4: "#b45309",
  5: "#1e293b",
  6: "#0f172a",
};

function PipFace({ n, size = 30 }: { n: number; size?: number }) {
  const pips = PIP_COORDS[n] ?? [];
  const fill = PIP_COLORS[n] ?? "#0f172a";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3.35} fill={fill} />
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
  const faceSize = compact ? 27 : 34;
  const inner = (
    <>
      <PipFace n={a} size={faceSize} />
      <span className={`relative flex items-center justify-center shrink-0 ${vertical ? "w-4/5 h-[1.5px] my-0.5" : "h-4/5 w-[1.5px] mx-0.5"} bg-[#7c7362]`}>
        <span className="size-1.5 rounded-full bg-[#d4a02c]" aria-hidden="true" />
      </span>
      <PipFace n={b} size={faceSize} />
    </>
  );

  const cls = `domino-tile inline-flex ${vertical ? "flex-col px-1.5 py-1.5" : "flex-row px-1.5 py-1"} items-center justify-center rounded-xl shrink-0 select-none`;

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
            <span className="chip bg-white/8 border border-white/14 text-white">{t("game.round", { n: view.round })}</span>
            <span className="chip bg-white/8 border border-white/14 text-text-2">
              <Layers size={12} /> {t("dominoes.boneyard", { n: view.boneyardCount })}
            </span>
            <span className="chip bg-gold/20 border border-gold/45 text-gold font-bold">{t("dominoes.limit", { n: view.scoreLimit })}</span>
          </>
        }
      />

      {view.lastRound && (
        <div className="rounded-2xl bg-gold/18 border border-gold/45 px-3.5 py-2 text-xs font-extrabold text-gold text-center">
          {view.lastRound.blocked ? `${t("dominoes.blocked")} · ` : ""}
          {view.lastRound.winner !== null ? `${name(view.lastRound.winner)} +${view.lastRound.points}` : "—"}
        </div>
      )}

      {/* Opponents */}
      <div className="flex flex-wrap gap-2.5 justify-center">
        {opponentsOrder(view.handCounts.length, mySeat).map((s) => (
          <div key={s} className="min-w-48 flex-1 max-w-xs">
            <SeatTag seat={s} seats={seats} active={view.toAct === s} compact>
              <MiniCardCount count={view.handCounts[s] ?? 0} />
              <span className="text-gold font-extrabold tabular-nums">
                {view.scores[s]} / {view.scoreLimit}
              </span>
            </SeatTag>
          </div>
        ))}
      </div>

      {/* Sculpted Domino Chain Well */}
      <div className="table-well grid gap-3 min-h-40">
        {ends && (
          <div className="flex items-center justify-between gap-2 text-xs font-extrabold">
            <span className="chip bg-[#070e17]/90 border border-gold/50 text-gold h-7 px-3">
              <ArrowLeft size={12} /> {t("dominoes.left")}: {ends.left}
            </span>
            <span className="text-white/45 text-[11px] uppercase tracking-wider">{t("ui.openEnds")}</span>
            <span className="chip bg-[#070e17]/90 border border-gold/50 text-gold h-7 px-3">
              {t("dominoes.right")}: {ends.right} <ArrowRight size={12} />
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          {view.line.length === 0 ? (
            <span className="text-sm font-extrabold uppercase tracking-wider text-white/40">{t("games.dominoes.name")}</span>
          ) : (
            view.line.map((p, i) => (
              <div key={`${p.tile}-${i}`} className="card-enter">
                <DominoTile a={p.left} b={p.right} vertical={p.left === p.right} compact />
              </div>
            ))
          )}
        </div>
      </div>

      {/* High-Contrast Hero Domino Rack & Action Dock */}
      {mySeat !== null && (
        <div className="hero-hand-tray" data-my-turn={myTurn ? "true" : "false"}>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="w-full sm:w-auto sm:min-w-64">
              <SeatTag seat={mySeat} seats={seats} active={myTurn} compact>
                <span className="text-gold font-extrabold tabular-nums">
                  {view.scores[mySeat]} / {view.scoreLimit}
                </span>
              </SeatTag>
            </div>
            {myTurn && anyPlayable && !choose && (
              <span className="chip bg-primary/18 text-primary border border-primary/40 font-bold">{t("dominoes.playHint")}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-center py-1.5" role="group" aria-label={t("game.yourHand")}>
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
            <div className="action-dock flex flex-wrap gap-2.5 justify-center items-center fade-in">
              <span className="text-sm font-extrabold text-white">{t("dominoes.chooseEnd")}</span>
              {(["left", "right"] as const).map((end) => (
                <button
                  key={end}
                  type="button"
                  className="btn-gold btn-lg px-5"
                  onClick={() => {
                    onAction({ type: "play", tile: choose, end });
                    setChoose(null);
                  }}
                >
                  {end === "left" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
                  {t(`dominoes.${end}`)} ({end === "left" ? ends?.left : ends?.right})
                </button>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setChoose(null)}>
                {t("common.cancel")}
              </button>
            </div>
          )}

          {myTurn && !anyPlayable && (
            <div className="action-dock flex justify-center fade-in">
              {view.variant === "draw" && view.boneyardCount > 0 ? (
                <button className="btn-primary btn-lg px-7" onClick={() => onAction({ type: "draw" })}>
                  <Layers size={16} /> {t("dominoes.draw")}
                </button>
              ) : (
                <button className="btn-secondary btn-lg px-7" onClick={() => onAction({ type: "pass" })}>
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
