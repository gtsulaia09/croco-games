import { useEffect, useMemo, useState } from "react";
import type { BackgammonView, Move } from "@croco/game-engine/games/backgammon";
import { useT } from "../i18n";
import { SeatTag, TurnBar, type BoardProps } from "./common";

/** Absolute index of a relative point for a player (mirrors the engine). */
const absIndex = (player: number, rel: number) => (player === 0 ? rel - 1 : 24 - rel);

const W = 640;
const H = 400;
const BAR = 30;
const PW = (W - BAR - 2 * 40) / 12;

export default function BackgammonBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<BackgammonView>) {
  const t = useT();
  const me = mySeat ?? 0;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const sequences = useMemo(() => view.you?.sequences ?? [], [view.you?.sequences]);
  const [partial, setPartial] = useState<Move[]>([]);
  const [from, setFrom] = useState<number | null>(null);
  const turnKey = `${view.game}:${view.toAct}:${view.dice.join(",")}:${view.phase}`;
  useEffect(() => {
    setPartial([]);
    setFrom(null);
  }, [turnKey]);

  const prefixMatches = sequences.filter((seq) => partial.every((m, i) => seq[i]?.from === m.from && seq[i]?.to === m.to));
  const nextMoves = prefixMatches.map((seq) => seq[partial.length]).filter((m): m is Move => Boolean(m));
  const required = sequences[0]?.length ?? 0;
  const complete = partial.length === required && prefixMatches.some((s) => s.length === partial.length);
  const sources = new Set(nextMoves.map((m) => m.from));
  const targets = new Set(nextMoves.filter((m) => m.from === from).map((m) => m.to));

  // Local preview: apply partial moves to a copy of the board for display.
  const preview = useMemo(() => {
    const points = [...view.points];
    const bar = [...view.bar];
    const off = [...view.off];
    const sign = me === 0 ? 1 : -1;
    const add = (arr: number[], i: number, d: number) => (arr[i] = (arr[i] ?? 0) + d);
    for (const m of partial) {
      if (m.from === 25) add(bar, me, -1);
      else add(points, absIndex(me, m.from), -sign);
      if (m.to === 0) add(off, me, 1);
      else {
        const idx = absIndex(me, m.to);
        if ((points[idx] ?? 0) * sign === -1) {
          points[idx] = 0;
          add(bar, 1 - me, 1);
        }
        add(points, idx, sign);
      }
    }
    return { points, bar, off };
  }, [view.points, view.bar, view.off, partial, me]);

  function clickPoint(rel: number) {
    if (!myTurn || view.phase !== "move") return;
    if (from !== null && targets.has(rel)) {
      setPartial((p) => [...p, { from, to: rel }]);
      setFrom(null);
      return;
    }
    setFrom(sources.has(rel) ? rel : null);
  }

  // Layout from my perspective: my home board bottom-right (relative points 1..6).
  const pointPos = (rel: number) => {
    const top = rel >= 13;
    const k = top ? rel - 13 : 12 - rel; // 0..11 left→right
    const x = 40 + k * PW + (k >= 6 ? BAR : 0);
    return { x, top };
  };

  const checkers = (rel: number) => preview.points[absIndex(me, rel)]!;
  const ownSign = me === 0 ? 1 : -1;

  return (
    <div className="grid gap-3">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span>{t("backgammon.matchTo", { n: view.matchLength })}</span>
            <span>
              {view.scores[0]} – {view.scores[1]}
            </span>
            <span>
              {t("backgammon.cube")}: {view.cube.value}
            </span>
            {view.crawfordGame && <span>{t("backgammon.crawford")}</span>}
          </>
        }
      />
      <div className="flex flex-wrap gap-2 justify-between">
        <SeatTag seat={1 - me} seats={seats} active={view.toAct === 1 - me}>
          <span>
            {t("backgammon.pips")}: {view.pips[1 - me]}
          </span>
          <span>
            {t("backgammon.off")}: {view.off[1 - me]}
          </span>
        </SeatTag>
        <SeatTag seat={me} seats={seats} active={myTurn}>
          <span>
            {t("backgammon.pips")}: {view.pips[me]}
          </span>
          <span>
            {t("backgammon.off")}: {preview.off[me]}
          </span>
        </SeatTag>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-[#3b2a1a] select-none" role="img" aria-label="backgammon board">
        <rect x={30} y={10} width={W - 60} height={H - 20} rx={8} fill="#0b3b35" />
        <rect x={40 + 6 * PW} y={10} width={BAR} height={H - 20} fill="#2b1d12" />
        {Array.from({ length: 24 }, (_, i) => i + 1).map((rel) => {
          const { x, top } = pointPos(rel);
          const y0 = top ? 10 : H - 10;
          const y1 = top ? 170 : H - 170;
          const isSource = myTurn && sources.has(rel);
          const isTarget = from !== null && targets.has(rel);
          const n = checkers(rel);
          const count = Math.abs(n);
          const mine = n * ownSign > 0;
          return (
            <g
              key={rel}
              onClick={() => clickPoint(rel)}
              className={isSource || isTarget ? "cursor-pointer" : undefined}
              data-point={rel}
              data-source={isSource || undefined}
              data-target={isTarget || undefined}
              role={isSource || isTarget ? "button" : undefined}
              aria-label={`${t("backgammon.point")} ${rel}`}
            >
              <polygon points={`${x},${y0} ${x + PW},${y0} ${x + PW / 2},${y1}`} fill={rel % 2 ? "#c9b48a" : "#7a2e2e"} opacity={isTarget ? 1 : 0.9} stroke={isTarget ? "#1caf4b" : from === rel ? "#f2df8b" : "none"} strokeWidth={3} />
              {Array.from({ length: Math.min(count, 5) }, (_, k) => {
                const cy = top ? 10 + PW / 2 + k * (PW - 2) : H - 10 - PW / 2 - k * (PW - 2);
                return <circle key={k} cx={x + PW / 2} cy={cy} r={PW / 2 - 3} fill={mine ? "#f7f5ee" : "#1a1e23"} stroke={isSource && k === Math.min(count, 5) - 1 ? "#1caf4b" : "#00000066"} strokeWidth={2} />;
              })}
              {count > 5 && (
                <text x={x + PW / 2} y={top ? 10 + PW / 2 + 4 * (PW - 2) + 5 : H - 10 - PW / 2 - 4 * (PW - 2) + 5} textAnchor="middle" fontSize={14} fill={mine ? "#1a1e23" : "#fff"}>
                  {count}
                </text>
              )}
              <text x={x + PW / 2} y={top ? 196 : H - 186} textAnchor="middle" fontSize={10} fill="#a3acb7">
                {rel}
              </text>
            </g>
          );
        })}
        {/* Bar */}
        {[me, 1 - me].map((p) =>
          preview.bar[p]! > 0 ? (
            <g
              key={p}
              onClick={() => p === me && clickPoint(25)}
              className={p === me && sources.has(25) ? "cursor-pointer" : undefined}
              data-point={p === me ? 25 : undefined}
              data-source={(p === me && myTurn && sources.has(25)) || undefined}
              role={p === me && sources.has(25) ? "button" : undefined}
              aria-label={t("backgammon.bar")}
            >
              <circle cx={40 + 6 * PW + BAR / 2} cy={p === me ? H / 2 + 30 : H / 2 - 30} r={13} fill={p === me ? "#f7f5ee" : "#1a1e23"} stroke={p === me && sources.has(25) ? "#1caf4b" : "#000"} strokeWidth={2} />
              <text x={40 + 6 * PW + BAR / 2} y={p === me ? H / 2 + 35 : H / 2 - 25} textAnchor="middle" fontSize={12} fill={p === me ? "#000" : "#fff"}>
                {preview.bar[p]}
              </text>
            </g>
          ) : null,
        )}
        {/* Bear-off target */}
        {from !== null && targets.has(0) && (
          <g onClick={() => clickPoint(0)} className="cursor-pointer" data-point={0} data-target role="button" aria-label={t("backgammon.off")}>
            <rect x={W - 28} y={H / 2} width={24} height={H / 2 - 12} rx={4} fill="#1caf4b" opacity={0.6} />
            <text x={W - 16} y={H - 20} textAnchor="middle" fontSize={10} fill="#fff">
              {t("backgammon.off")}
            </text>
          </g>
        )}
        {/* Dice */}
        {view.dice.length > 0 &&
          [...new Set(view.dice.length === 4 ? [view.dice[0]] : view.dice)].map((d, i) => (
            <g key={i}>
              <rect x={W / 2 + 70 + i * 40} y={H / 2 - 16} width={32} height={32} rx={6} fill="#f7f5ee" />
              <text x={W / 2 + 86 + i * 40} y={H / 2 + 6} textAnchor="middle" fontSize={18} fontWeight={700} fill="#1a1e23">
                {d}
              </text>
            </g>
          ))}
        {view.dice.length === 4 && (
          <text x={W / 2 + 130} y={H / 2 + 6} fontSize={14} fill="#f2df8b">
            ×4
          </text>
        )}
        {/* Cube */}
        <rect x={4} y={view.cube.owner === null ? H / 2 - 13 : view.cube.owner === me ? H - 50 : 24} width={24} height={24} rx={4} fill="#f2df8b" />
        <text x={16} y={(view.cube.owner === null ? H / 2 - 13 : view.cube.owner === me ? H - 50 : 24) + 17} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1a1e23">
          {view.cube.value === 1 ? 64 : view.cube.value}
        </text>
      </svg>
      {myTurn && (
        <div className="flex flex-wrap gap-2 justify-center">
          {view.phase === "preroll" && (
            <>
              <button className="btn-primary" onClick={() => onAction({ type: "roll" })}>
                {t("backgammon.roll")}
              </button>
              {view.canDouble && (
                <button className="btn-secondary" onClick={() => onAction({ type: "double" })}>
                  {t("backgammon.double")}
                </button>
              )}
            </>
          )}
          {view.phase === "doubled" && (
            <>
              <span className="text-sm self-center">{t("backgammon.offered")}</span>
              <button className="btn-primary" onClick={() => onAction({ type: "take" })}>
                {t("backgammon.take")}
              </button>
              <button className="btn-danger" onClick={() => onAction({ type: "drop" })}>
                {t("backgammon.drop")}
              </button>
            </>
          )}
          {view.phase === "move" && (
            <>
              <button className="btn-ghost" disabled={partial.length === 0} onClick={() => (setPartial([]), setFrom(null))}>
                {t("backgammon.undo")}
              </button>
              <button
                className="btn-primary"
                disabled={!complete}
                onClick={() => {
                  onAction({ type: "move", moves: partial });
                  setPartial([]);
                  setFrom(null);
                }}
              >
                {t("backgammon.confirm")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
