import { useEffect, useMemo, useState } from "react";
import { Check, Dices, RotateCcw, Undo2 } from "lucide-react";
import type { BackgammonView, Move } from "@croco/game-engine/games/backgammon";
import { useT } from "../i18n";
import { HudChip, SeatStat, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

/** Long nardi coordinates: each player counts 24 (head) → 1; heads are diagonally opposite. */
const absIndex = (player: number, rel: number) => (player === 0 ? rel - 1 : (rel + 11) % 24);
const HEAD = 24;

/* Board geometry (SVG user units) */
const W = 700;
const H = 440;
const FR = 16; // walnut frame
const BAR = 36;
const MIDF = 10; // frame strip between the field and the tray
const TRAY = 40;
const PW = (W - FR * 2 - MIDF - TRAY - BAR) / 12;
const X0 = FR;
const BAR_X = X0 + 6 * PW;
const RIGHT_END = BAR_X + BAR + 6 * PW;
const TRAY_X = RIGHT_END + MIDF;
const FIELD_H = H - FR * 2;
const HALF = FIELD_H / 2;
const PL = 172; // point length
const R = PW / 2 - 2.6; // stone radius

const DIE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[19, 19]],
  2: [[11, 11], [27, 27]],
  3: [[11, 11], [19, 19], [27, 27]],
  4: [[11, 11], [27, 11], [11, 27], [27, 27]],
  5: [[11, 11], [27, 11], [19, 19], [11, 27], [27, 27]],
  6: [[11, 10], [27, 10], [11, 19], [27, 19], [11, 28], [27, 28]],
};

function Die({ value, x, y }: { value: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="bg-die">
        <rect x={2} y={3.5} width={38} height={38} rx={8} fill="rgba(0,0,0,0.45)" />
        <rect width={38} height={38} rx={8} fill="url(#bg-ivory)" stroke="#b9ab8c" strokeWidth={1} />
        <rect x={2} y={2} width={34} height={34} rx={6.5} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1} />
        {(DIE_PIPS[value] ?? []).map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={3.4} fill="#1a1715" />
        ))}
      </g>
    </g>
  );
}

function Stone({ cx, cy, mine, ring }: { cx: number; cy: number; mine: boolean; ring?: "source" | "selected" }) {
  return (
    <g className="bg-land">
      <circle cx={cx + 1.2} cy={cy + 2.4} r={R} fill="rgba(0,0,0,0.4)" />
      <circle cx={cx} cy={cy} r={R} fill={mine ? "url(#chk-ivory)" : "url(#chk-ebony)"} stroke={mine ? "#a8987a" : "#050404"} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={R * 0.78} fill="none" stroke={mine ? "rgba(120,100,70,0.45)" : "rgba(255,255,255,0.14)"} strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={R * 0.5} fill="none" stroke={mine ? "rgba(120,100,70,0.35)" : "rgba(255,255,255,0.1)"} strokeWidth={1} />
      {ring === "source" && (
        <>
          <circle cx={cx} cy={cy} r={R + 3.5} fill="none" stroke="rgba(39,182,84,0.35)" strokeWidth={5} />
          <circle cx={cx} cy={cy} r={R + 1} fill="none" stroke="#27b654" strokeWidth={2.6} />
        </>
      )}
      {ring === "selected" && <circle cx={cx} cy={cy} r={R + 1.2} fill="none" stroke="#f2c94c" strokeWidth={3.4} />}
    </g>
  );
}

export default function BackgammonBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<BackgammonView>) {
  const t = useT();
  const name = useSeatName(seats);
  const me = mySeat ?? 0;
  const opp = 1 - me;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const sequences = useMemo(() => view.you?.sequences ?? [], [view.you?.sequences]);
  const [partial, setPartial] = useState<Move[]>([]);
  const [from, setFrom] = useState<number | null>(null);
  const turnKey = `${view.game}:${view.toAct}:${view.dice.join(",")}:${view.phase}`;
  useEffect(() => {
    setPartial([]);
    setFrom(null);
  }, [turnKey]);

  const preview = useMemo(() => {
    const points = [...view.points];
    const off = [...view.off];
    const sign = me === 0 ? 1 : -1;
    for (const m of partial) {
      points[absIndex(me, m.from)]! -= sign;
      if (m.to === 0) off[me]! += 1;
      else points[absIndex(me, m.to)]! += sign;
    }
    return { points, off };
  }, [view.points, view.off, partial, me]);

  const ownSign = me === 0 ? 1 : -1;
  const stonesAt = (rel: number) => preview.points[absIndex(me, rel)]!;

  // Order-independent matching: the moves made so far must all appear in a legal sequence.
  const remaining = sequences
    .map((seq) => {
      const rest = [...seq];
      for (const m of partial) {
        const i = rest.findIndex((x) => x.from === m.from && x.to === m.to);
        if (i < 0) return null;
        rest.splice(i, 1);
      }
      return rest;
    })
    .filter((r): r is Move[] => r !== null);
  const nextMoves = remaining.flat().filter((m) => stonesAt(m.from) * ownSign > 0 && (m.to === 0 || stonesAt(m.to) * ownSign >= 0));
  const required = sequences[0]?.length ?? 0;
  const complete = partial.length === required && remaining.some((r) => r.length === 0);
  const sources = new Set(nextMoves.map((m) => m.from));
  const targets = new Set(nextMoves.filter((m) => m.from === from).map((m) => m.to));

  function clickPoint(rel: number) {
    if (!myTurn || view.phase !== "move") return;
    if (from !== null && targets.has(rel)) {
      setPartial((p) => [...p, { from, to: rel }]);
      setFrom(null);
      return;
    }
    if (from === rel) {
      setFrom(null);
      return;
    }
    setFrom(sources.has(rel) ? rel : null);
  }

  const pointX = (rel: number) => {
    const top = rel >= 13;
    const k = top ? rel - 13 : 12 - rel;
    return { x: X0 + k * PW + (k >= 6 ? BAR : 0), top };
  };
  const stackY = (top: boolean, k: number, count: number) => {
    const step = count >= 5 ? (HALF - R * 2 - 6) / 4 : R * 2;
    return top ? FR + R + 1.5 + k * step : H - FR - R - 1.5 - k * step;
  };

  const shownDice = view.dice.length === 4 ? [view.dice[0]!, view.dice[0]!] : view.dice;
  const diceCx = BAR_X + BAR + 3 * PW;
  // The opponent's head sits on my point 12.
  const oppHeadRel = 12;
  const showOpening = view.openingRoll && !view.lastMove && view.phase !== "over";

  return (
    <div className="board">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <HudChip>{t("backgammon.matchTo", { n: view.matchLength })}</HudChip>
            <HudChip tone="gold">
              {view.scores[me]} – {view.scores[opp]}
            </HudChip>
          </>
        }
      />

      {showOpening && (
        <div className="notice fade-in">
          {t("backgammon.starts", { name: name(view.toAct ?? 0), a: view.openingRoll![me]!, b: view.openingRoll![opp]! })}
        </div>
      )}
      {view.lastGame && view.lastGame.game === view.game - 1 && !view.lastMove && (
        <div className="notice fade-in">
          {view.lastGame.kind === "mars" ? `${t("backgammon.mars")} ` : ""}
          {t("backgammon.gameWon", { name: name(view.lastGame.winner), n: view.lastGame.points })}
        </div>
      )}

      <div className="bg-layout">
        <div className="bg-opp">
          <SeatTag seat={opp} seats={seats} active={view.toAct === opp} compact>
            <span className="inline-block size-3 rounded-full bg-[#1b1512] border border-white/40" aria-hidden="true" />
            <SeatStat label={t("backgammon.pips")} value={view.pips[opp]} />
            <SeatStat label={t("backgammon.off")} value={`${view.off[opp]}/15`} tone="gold" />
          </SeatTag>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="bg-board" role="img" aria-label={t("games.backgammon.name")}>
          <defs>
            <linearGradient id="walnut" x1="0" y1="0" x2="1" y2="0.15">
              <stop offset="0%" stopColor="#3d2314" />
              <stop offset="22%" stopColor="#5a341e" />
              <stop offset="45%" stopColor="#4a2a18" />
              <stop offset="70%" stopColor="#613a22" />
              <stop offset="100%" stopColor="#3d2314" />
            </linearGradient>
            <pattern id="grain" patternUnits="userSpaceOnUse" width="260" height="34">
              <path d="M0 5 Q65 2 130 6 T260 5" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="0.9" />
              <path d="M0 13 Q70 16 140 12 T260 14" fill="none" stroke="rgba(255,220,180,0.07)" strokeWidth="1.2" />
              <path d="M0 21 Q60 18 120 22 T260 20" fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth="0.8" />
              <path d="M0 29 Q80 31 150 28 T260 29" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
            </pattern>
            <radialGradient id="leather" cx="50%" cy="45%" r="75%">
              <stop offset="0%" stopColor="#285a3c" />
              <stop offset="65%" stopColor="#1b4129" />
              <stop offset="100%" stopColor="#11291a" />
            </radialGradient>
            <linearGradient id="pt-ivory" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#efe3c6" />
              <stop offset="100%" stopColor="#cdb88f" />
            </linearGradient>
            <linearGradient id="pt-wine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8e2333" />
              <stop offset="100%" stopColor="#5b111d" />
            </linearGradient>
            <radialGradient id="chk-ivory" cx="38%" cy="32%" r="72%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#f1e8d6" />
              <stop offset="100%" stopColor="#c9b894" />
            </radialGradient>
            <radialGradient id="chk-ebony" cx="38%" cy="32%" r="72%">
              <stop offset="0%" stopColor="#5a4a40" />
              <stop offset="50%" stopColor="#2a211c" />
              <stop offset="100%" stopColor="#0c0907" />
            </radialGradient>
            <linearGradient id="bg-ivory" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e9e0cb" />
            </linearGradient>
            <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffe6a3" />
              <stop offset="55%" stopColor="#c9962f" />
              <stop offset="100%" stopColor="#7d5a14" />
            </linearGradient>
          </defs>

          {/* Walnut case */}
          <rect x={0} y={0} width={W} height={H} rx={16} fill="url(#walnut)" />
          <rect x={0} y={0} width={W} height={H} rx={16} fill="url(#grain)" />
          <rect x={1} y={1} width={W - 2} height={H - 2} rx={15} fill="none" stroke="rgba(255,235,200,0.18)" strokeWidth={1.2} />

          {/* Leather field (two halves), recessed */}
          {[X0, BAR_X + BAR].map((x) => (
            <g key={x}>
              <rect x={x} y={FR} width={6 * PW} height={FIELD_H} rx={3} fill="url(#leather)" />
              <rect x={x} y={FR} width={6 * PW} height={FIELD_H} rx={3} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={2.4} />
              <rect x={x - 1.2} y={FR - 1.2} width={6 * PW + 2.4} height={FIELD_H + 2.4} rx={4} fill="none" stroke="rgba(255,235,200,0.16)" strokeWidth={1} />
            </g>
          ))}

          {/* Centre bar with brass hinges */}
          <rect x={BAR_X + BAR / 2 - 1} y={FR} width={2} height={FIELD_H} fill="rgba(0,0,0,0.45)" />
          {[FR + 44, H - FR - 74].map((y) => (
            <g key={y}>
              <rect x={BAR_X + BAR / 2 - 7} y={y} width={14} height={30} rx={2} fill="url(#brass)" stroke="#6b4c10" strokeWidth={0.8} />
              <line x1={BAR_X + BAR / 2} y1={y + 2} x2={BAR_X + BAR / 2} y2={y + 28} stroke="#6b4c10" strokeWidth={0.8} />
            </g>
          ))}

          {/* Bear-off tray */}
          <rect x={TRAY_X} y={FR} width={TRAY} height={FIELD_H} rx={4} fill="#24150c" stroke="rgba(0,0,0,0.6)" strokeWidth={2} />
          <line x1={TRAY_X} y1={H / 2} x2={TRAY_X + TRAY} y2={H / 2} stroke="#4a2a18" strokeWidth={4} />
          {Array.from({ length: Math.min(preview.off[opp] ?? 0, 15) }, (_, k) => (
            <rect key={`o${k}`} x={TRAY_X + 5} y={FR + 6 + k * 11} width={TRAY - 10} height={8.5} rx={3} fill="url(#chk-ebony)" stroke="#000" strokeWidth={0.6} />
          ))}
          {Array.from({ length: Math.min(preview.off[me] ?? 0, 15) }, (_, k) => (
            <rect key={`m${k}`} x={TRAY_X + 5} y={H - FR - 14.5 - k * 11} width={TRAY - 10} height={8.5} rx={3} fill="url(#chk-ivory)" stroke="#a8987a" strokeWidth={0.6} />
          ))}

          {/* 24 points with their stones */}
          {Array.from({ length: 24 }, (_, i) => i + 1).map((rel) => {
            const { x, top } = pointX(rel);
            const y0 = top ? FR : H - FR;
            const y1 = top ? FR + PL : H - FR - PL;
            const isSource = myTurn && sources.has(rel);
            const isTarget = from !== null && targets.has(rel);
            const isSelected = from === rel;
            const n = stonesAt(rel);
            const count = Math.abs(n);
            const mine = n * ownSign > 0;
            const cx = x + PW / 2;
            const shown = Math.min(count, 5);
            const landY = stackY(top, Math.min(count, 4), count + 1);
            return (
              <g
                key={rel}
                onClick={() => clickPoint(rel)}
                data-point={rel}
                data-source={isSource || undefined}
                data-target={isTarget || undefined}
                role={isSource || isTarget ? "button" : undefined}
                aria-label={`${t("backgammon.point")} ${rel}`}
              >
                <rect x={x} y={top ? FR : H / 2} width={PW} height={HALF} fill="transparent" />
                <polygon points={`${x + 1.5},${y0} ${x + PW - 1.5},${y0} ${cx},${y1}`} fill={rel % 2 ? "url(#pt-ivory)" : "url(#pt-wine)"} />
                <polygon points={`${x + 5},${y0} ${x + PW - 5},${y0} ${cx},${top ? y1 - 14 : y1 + 14}`} fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth={1} />
                {isTarget && <polygon points={`${x + 1.5},${y0} ${x + PW - 1.5},${y0} ${cx},${y1}`} fill="rgba(39,182,84,0.32)" stroke="#27b654" strokeWidth={2.2} />}
                {isSelected && <polygon points={`${x + 1.5},${y0} ${x + PW - 1.5},${y0} ${cx},${y1}`} fill="rgba(242,201,76,0.16)" stroke="#f2c94c" strokeWidth={2} />}

                {Array.from({ length: shown }, (_, k) => {
                  const topStone = k === shown - 1;
                  return (
                    <Stone key={k} cx={cx} cy={stackY(top, k, count)} mine={mine} ring={topStone ? (isSelected ? "selected" : isSource ? "source" : undefined) : undefined} />
                  );
                })}
                {count > 5 && (
                  <text x={cx} y={stackY(top, 4, count) + 5} textAnchor="middle" fontSize={14} fontWeight={900} fill={mine ? "#2a211c" : "#f1e8d6"}>
                    {count}
                  </text>
                )}

                {isTarget && (
                  <g>
                    <circle cx={cx} cy={landY} r={R - 1} fill="rgba(39,182,84,0.25)" stroke="#27b654" strokeWidth={2} strokeDasharray="4 3" />
                    <text x={cx} y={landY + 4.5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#ffffff">
                      {from !== null ? from - rel : rel}
                    </text>
                  </g>
                )}

                <text x={cx} y={top ? FR - 4.5 : H - 4.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={rel === HEAD || rel === oppHeadRel ? "#e2c27a" : "rgba(255,235,200,0.6)"}>
                  {rel === HEAD || rel === oppHeadRel ? `${t("backgammon.head")} · ${rel}` : rel}
                </text>
              </g>
            );
          })}

          {/* Bear-off target */}
          {from !== null && targets.has(0) && (
            <g onClick={() => clickPoint(0)} data-point={0} data-target role="button" aria-label={t("backgammon.off")}>
              <rect x={TRAY_X + 1} y={H / 2 + 3} width={TRAY - 2} height={HALF - 4} rx={4} fill="rgba(39,182,84,0.35)" stroke="#27b654" strokeWidth={2.4} />
              <text x={TRAY_X + TRAY / 2} y={H / 2 + HALF / 2} textAnchor="middle" fontSize={12} fontWeight={900} fill="#ffffff">
                ↓
              </text>
            </g>
          )}

          {/* Dice (tumble in when rolled) */}
          <g key={turnKey}>
            {shownDice.map((d, i) => (
              <Die key={i} value={d} x={diceCx - 46 + i * 54} y={H / 2 - 19} />
            ))}
            {view.dice.length === 4 && (
              <g transform={`translate(${diceCx + 64} ${H / 2 - 11})`}>
                <rect width={30} height={22} rx={11} fill="#e2c27a" />
                <text x={15} y={15.5} textAnchor="middle" fontSize={12} fontWeight={900} fill="#1b1405">
                  ×4
                </text>
              </g>
            )}
          </g>
        </svg>

        <div className="bg-me">
          <SeatTag seat={me} seats={seats} active={view.toAct === me}>
            <span className="inline-block size-3 rounded-full bg-[#f1e8d6] border border-[#a8987a]" aria-hidden="true" />
            <SeatStat label={t("backgammon.pips")} value={view.pips[me]} />
            <SeatStat label={t("backgammon.off")} value={`${preview.off[me]}/15`} tone="gold" />
          </SeatTag>
        </div>
      </div>

      {myTurn && (
        <div className="action-bar fade-in">
          {view.phase === "preroll" && (
            <button className="btn-primary btn-lg px-8" onClick={() => onAction({ type: "roll" })}>
              <Dices size={17} /> {t("backgammon.roll")}
            </button>
          )}
          {view.phase === "move" && (
            <>
              <span className={`action-hint w-full sm:w-auto text-center ${complete ? "!text-[#7fe0a0]" : ""}`}>
                {complete ? t("ui.movesReady") : from !== null ? t("ui.selectDestination") : t("ui.selectChecker")}
              </span>
              {partial.length > 1 && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setPartial((p) => p.slice(0, -1));
                    setFrom(null);
                  }}
                >
                  <Undo2 size={14} /> {t("backgammon.stepBack")}
                </button>
              )}
              <button className="btn-secondary btn-sm" disabled={partial.length === 0} onClick={() => (setPartial([]), setFrom(null))}>
                <RotateCcw size={14} /> {t("backgammon.undo")}
              </button>
              <button
                className="btn-primary btn-lg px-7"
                disabled={!complete}
                onClick={() => {
                  onAction({ type: "move", moves: partial });
                  setPartial([]);
                  setFrom(null);
                }}
              >
                <Check size={16} /> {t("backgammon.confirm")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
