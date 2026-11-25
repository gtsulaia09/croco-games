import { useEffect, useMemo, useState } from "react";
import { Check, Dices, RotateCcw, Undo2 } from "lucide-react";
import type { BackgammonView, Move } from "@croco/game-engine/games/backgammon";
import { useT } from "../i18n";
import { SeatTag, TurnBar, type BoardProps } from "./common";

const absIndex = (player: number, rel: number) => (player === 0 ? rel - 1 : 24 - rel);

const W = 700;
const H = 420;
const PAD_L = 42;
const PAD_R = 54;
const BAR = 34;
const PW = (W - PAD_L - PAD_R - BAR) / 12;

const DIE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[18, 18]],
  2: [
    [10, 10],
    [26, 26],
  ],
  3: [
    [10, 10],
    [18, 18],
    [26, 26],
  ],
  4: [
    [10, 10],
    [26, 10],
    [10, 26],
    [26, 26],
  ],
  5: [
    [10, 10],
    [26, 10],
    [18, 18],
    [10, 26],
    [26, 26],
  ],
  6: [
    [10, 9],
    [26, 9],
    [10, 18],
    [26, 18],
    [10, 27],
    [26, 27],
  ],
};

function SvgDie({ value, x, y }: { value: number; x: number; y: number }) {
  const pips = DIE_PIPS[value] ?? [];
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={1.5} y={2.5} width={36} height={36} rx={8} fill="rgba(0,0,0,0.45)" />
      <rect width={36} height={36} rx={8} fill="url(#bg-ivory)" stroke="#cbd5e1" strokeWidth={1.5} />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3.1} fill={value === 1 ? "#dc2626" : "#0f172a"} />
      ))}
    </g>
  );
}

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
    if (from === rel) {
      setFrom(null);
      return;
    }
    setFrom(sources.has(rel) ? rel : null);
  }

  const pointPos = (rel: number) => {
    const top = rel >= 13;
    const k = top ? rel - 13 : 12 - rel;
    const x = PAD_L + k * PW + (k >= 6 ? BAR : 0);
    return { x, top };
  };

  const checkers = (rel: number) => preview.points[absIndex(me, rel)]!;
  const ownSign = me === 0 ? 1 : -1;
  const barX = PAD_L + 6 * PW;
  const trayX = W - PAD_R + 8;

  const cubeY = view.cube.owner === null ? H / 2 - 14 : view.cube.owner === me ? H - 56 : 26;
  const shownDice = view.dice.length === 4 ? [view.dice[0]!, view.dice[0]!] : view.dice;

  return (
    <div className="table-arena bg-gradient-to-b from-[#0e1724] via-[#09111b] to-[#060b11] !border-[#1c2c40]">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className="chip bg-white/8 border border-white/14 text-white">{t("backgammon.matchTo", { n: view.matchLength })}</span>
            <span className="chip bg-gold/20 border border-gold/45 text-gold font-extrabold tabular-nums">
              {view.scores[0]} – {view.scores[1]}
            </span>
            <span className="chip bg-white/8 border border-white/14 text-text-2">
              {t("backgammon.cube")}: {view.cube.value}
            </span>
            {view.crawfordGame && <span className="chip bg-accent/20 border border-accent/45 text-accent font-bold">{t("backgammon.crawford")}</span>}
          </>
        }
      />

      {/* Compact Player Header Capsules */}
      <div className="grid grid-cols-2 gap-2.5">
        <SeatTag seat={1 - me} seats={seats} active={view.toAct === 1 - me} compact>
          <span className="inline-block size-3 rounded-full bg-[#131d2b] border border-accent/80 shadow-sm" aria-hidden="true" />
          <span className="tabular-nums text-text-2 font-semibold">{t("backgammon.pips")}: {view.pips[1 - me]}</span>
          <span className="tabular-nums text-gold font-extrabold">{t("backgammon.off")}: {view.off[1 - me]}/15</span>
        </SeatTag>
        <SeatTag seat={me} seats={seats} active={myTurn} compact>
          <span className="inline-block size-3 rounded-full bg-[#ffffff] border border-gold shadow-sm" aria-hidden="true" />
          <span className="tabular-nums text-text-2 font-semibold">{t("backgammon.pips")}: {view.pips[me]}</span>
          <span className="tabular-nums text-primary font-extrabold">{t("backgammon.off")}: {preview.off[me]}/15</span>
        </SeatTag>
      </div>

      {/* Neo-Tournament Carbon-Slate & Emerald Backgammon Cabinet */}
      <div className="w-full max-w-[43rem] mx-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[48dvh] h-auto rounded-2xl select-none shadow-[0_14px_34px_rgba(0,0,0,0.55)]" role="img" aria-label="backgammon board">
          <defs>
            <linearGradient id="bg-cabinet" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1d2b3d" />
              <stop offset="100%" stopColor="#0f1722" />
            </linearGradient>
            <linearGradient id="bg-felt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d4233" />
              <stop offset="50%" stopColor="#082b21" />
              <stop offset="100%" stopColor="#0d4233" />
            </linearGradient>
            <linearGradient id="bg-pt-light" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5efe2" />
              <stop offset="100%" stopColor="#d4c5a9" />
            </linearGradient>
            <linearGradient id="bg-pt-dark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#be123c" />
              <stop offset="100%" stopColor="#7f102c" />
            </linearGradient>
            <radialGradient id="bg-chk-white" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="68%" stopColor="#f1ede2" />
              <stop offset="100%" stopColor="#c7bba4" />
            </radialGradient>
            <radialGradient id="bg-chk-black" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#334760" />
              <stop offset="58%" stopColor="#162231" />
              <stop offset="100%" stopColor="#090f17" />
            </radialGradient>
            <linearGradient id="bg-ivory" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ece6d8" />
            </linearGradient>
            <linearGradient id="bg-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffe38c" />
              <stop offset="100%" stopColor="#d49517" />
            </linearGradient>
          </defs>

          <rect x={0} y={0} width={W} height={H} rx={16} fill="url(#bg-cabinet)" />
          <rect x={2} y={2} width={W - 4} height={H - 4} rx={14} fill="none" stroke="rgba(255,200,69,0.3)" strokeWidth={1.3} />

          {/* Recessed Left & Right Quadrants */}
          <rect x={PAD_L - 6} y={15} width={6 * PW + 12} height={H - 30} rx={8} fill="url(#bg-felt)" stroke="#0b121b" strokeWidth={2} />
          <rect x={barX + BAR - 6} y={15} width={6 * PW + 12} height={H - 30} rx={8} fill="url(#bg-felt)" stroke="#0b121b" strokeWidth={2} />

          {/* Center Bar */}
          <rect x={barX} y={13} width={BAR} height={H - 26} rx={5} fill="#121c29" stroke="#2c3f57" strokeWidth={1.3} />
          <rect x={barX + 11} y={40} width={12} height={22} rx={2.5} fill="url(#bg-gold)" opacity={0.85} />
          <rect x={barX + 11} y={H - 62} width={12} height={22} rx={2.5} fill="url(#bg-gold)" opacity={0.85} />

          {/* Bear-Off Trays */}
          <rect x={trayX} y={18} width={38} height={H / 2 - 26} rx={7} fill="#091019" stroke="#283a50" strokeWidth={1.3} />
          <rect x={trayX} y={H / 2 + 8} width={38} height={H / 2 - 26} rx={7} fill="#091019" stroke="#283a50" strokeWidth={1.3} />
          {Array.from({ length: Math.min(preview.off[1 - me] ?? 0, 15) }, (_, k) => (
            <rect key={`opp-off-${k}`} x={trayX + 5} y={23 + k * 9.5} width={28} height={7} rx={3} fill="#1e2f44" stroke="#38bdf8" strokeWidth={0.8} />
          ))}
          {Array.from({ length: Math.min(preview.off[me] ?? 0, 15) }, (_, k) => (
            <rect key={`me-off-${k}`} x={trayX + 5} y={H - 28 - k * 9.5} width={28} height={7} rx={3} fill="#f8f4ea" stroke="#d49517" strokeWidth={0.8} />
          ))}

          {/* 24 Points + Checkers */}
          {Array.from({ length: 24 }, (_, i) => i + 1).map((rel) => {
            const { x, top } = pointPos(rel);
            const y0 = top ? 16 : H - 16;
            const y1 = top ? 178 : H - 178;
            const isSource = myTurn && sources.has(rel);
            const isTarget = from !== null && targets.has(rel);
            const isSelected = from === rel;
            const n = checkers(rel);
            const count = Math.abs(n);
            const mine = n * ownSign > 0;
            const cx = x + PW / 2;
            const radius = PW / 2 - 3.2;

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
                <polygon
                  points={`${x + 1},${y0} ${x + PW - 1},${y0} ${cx},${y1}`}
                  fill={rel % 2 ? "url(#bg-pt-light)" : "url(#bg-pt-dark)"}
                  stroke={isTarget ? "#00d95f" : isSelected ? "#ffc845" : "rgba(0,0,0,0.3)"}
                  strokeWidth={isTarget || isSelected ? 2.8 : 0.9}
                />

                {/* Numbered Target Landing Badge */}
                {isTarget && (
                  <g>
                    <circle cx={cx} cy={top ? 162 : H - 162} r={10} fill="#00d95f" stroke="#ffffff" strokeWidth={2} />
                    <text x={cx} y={(top ? 162 : H - 162) + 3.5} textAnchor="middle" fontSize={10} fontWeight={900} fill="#031a0b">
                      {from !== null ? from - rel : rel}
                    </text>
                  </g>
                )}

                {Array.from({ length: Math.min(count, 5) }, (_, k) => {
                  const cy = top ? 16 + radius + 2 + k * (radius * 1.82) : H - 16 - radius - 2 - k * (radius * 1.82);
                  const topChecker = k === Math.min(count, 5) - 1;
                  return (
                    <g key={k}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill={mine ? "url(#bg-chk-white)" : "url(#bg-chk-black)"}
                        stroke={
                          isSelected && topChecker
                            ? "#ffc845"
                            : isSource && topChecker
                              ? "#00d95f"
                              : mine
                                ? "#b5a689"
                                : "#526f8e"
                        }
                        strokeWidth={isSelected && topChecker ? 3.2 : isSource && topChecker ? 2.8 : 1.3}
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius * 0.62}
                        fill="none"
                        stroke={mine ? "rgba(180,155,110,0.45)" : "rgba(125,211,252,0.28)"}
                        strokeWidth={1}
                      />
                      {isSource && topChecker && !isSelected && <circle cx={cx} cy={cy} r={3.8} fill="#00d95f" />}
                    </g>
                  );
                })}

                {count > 5 && (
                  <text
                    x={cx}
                    y={(top ? 16 + radius + 2 + 4 * (radius * 1.82) : H - 16 - radius - 2 - 4 * (radius * 1.82)) + 4.5}
                    textAnchor="middle"
                    fontSize={12.5}
                    fontWeight={900}
                    fill={mine ? "#0f172a" : "#ffffff"}
                  >
                    {count}
                  </text>
                )}

                <text x={cx} y={top ? 11.5 : H - 4} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#94a9c0">
                  {rel}
                </text>
              </g>
            );
          })}

          {/* Bar Checkers */}
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
                <circle
                  cx={barX + BAR / 2}
                  cy={p === me ? H / 2 + 34 : H / 2 - 34}
                  r={14.5}
                  fill={p === me ? "url(#bg-chk-white)" : "url(#bg-chk-black)"}
                  stroke={p === me && sources.has(25) ? "#00d95f" : "#ffc845"}
                  strokeWidth={2.8}
                />
                <text x={barX + BAR / 2} y={p === me ? H / 2 + 39 : H / 2 - 29} textAnchor="middle" fontSize={12.5} fontWeight={900} fill={p === me ? "#0f172a" : "#ffffff"}>
                  {preview.bar[p]}
                </text>
              </g>
            ) : null,
          )}

          {/* Bear-Off Target */}
          {from !== null && targets.has(0) && (
            <g onClick={() => clickPoint(0)} className="cursor-pointer" data-point={0} data-target role="button" aria-label={t("backgammon.off")}>
              <rect x={trayX} y={H / 2 + 8} width={38} height={H / 2 - 26} rx={7} fill="#00d95f" fillOpacity={0.38} stroke="#00d95f" strokeWidth={2.6} />
              <text x={trayX + 19} y={H / 2 + 92} textAnchor="middle" fontSize={11} fontWeight={900} fill="#ffffff">
                {t("backgammon.off")}
              </text>
            </g>
          )}

          {/* Pipped 3D Ivory Dice */}
          {shownDice.map((d, i) => (
            <SvgDie key={i} value={d} x={barX + BAR + 84 + i * 46} y={H / 2 - 18} />
          ))}
          {view.dice.length === 4 && (
            <g transform={`translate(${barX + BAR + 180} ${H / 2 - 12})`}>
              <rect width={30} height={24} rx={12} fill="#ffc845" />
              <text x={15} y={16} textAnchor="middle" fontSize={12} fontWeight={900} fill="#1d1404">
                ×4
              </text>
            </g>
          )}

          {/* Doubling Cube */}
          <g transform={`translate(7 ${cubeY})`}>
            <rect width={27} height={27} rx={6} fill="url(#bg-gold)" stroke="#ffffff" strokeWidth={1.3} />
            <text x={13.5} y={18.5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#1d1404">
              {view.cube.value === 1 ? 64 : view.cube.value}
            </text>
          </g>
        </svg>
      </div>

      {/* Contextual Step Guidance + Action Dock */}
      {myTurn && (
        <div className="action-dock flex flex-wrap gap-2.5 justify-center items-center fade-in">
          {view.phase === "preroll" && (
            <>
              <button className="btn-primary btn-lg px-7" onClick={() => onAction({ type: "roll" })}>
                <Dices size={17} /> {t("backgammon.roll")}
              </button>
              {view.canDouble && (
                <button className="btn-gold btn-lg px-6" onClick={() => onAction({ type: "double" })}>
                  {t("backgammon.double")}
                </button>
              )}
            </>
          )}
          {view.phase === "doubled" && (
            <>
              <span className="text-sm font-extrabold text-gold">{t("backgammon.offered")}</span>
              <button className="btn-primary btn-lg px-6" onClick={() => onAction({ type: "take" })}>
                {t("backgammon.take")}
              </button>
              <button className="btn-danger btn-lg px-6" onClick={() => onAction({ type: "drop" })}>
                {t("backgammon.drop")}
              </button>
            </>
          )}
          {view.phase === "move" && (
            <>
              <span className={`text-xs font-bold w-full sm:w-auto text-center ${complete ? "text-primary" : "text-text-2"}`}>
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
                className="btn-primary btn-lg px-6"
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
