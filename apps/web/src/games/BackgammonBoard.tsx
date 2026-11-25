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
  1: [[17, 17]],
  2: [
    [10, 10],
    [24, 24],
  ],
  3: [
    [10, 10],
    [17, 17],
    [24, 24],
  ],
  4: [
    [10, 10],
    [24, 10],
    [10, 24],
    [24, 24],
  ],
  5: [
    [10, 10],
    [24, 10],
    [17, 17],
    [10, 24],
    [24, 24],
  ],
  6: [
    [10, 9],
    [24, 9],
    [10, 17],
    [24, 17],
    [10, 25],
    [24, 25],
  ],
};

function SvgDie({ value, x, y }: { value: number; x: number; y: number }) {
  const pips = DIE_PIPS[value] ?? [];
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={34} height={34} rx={7} fill="url(#bg-ivory)" stroke="#c7bfa8" strokeWidth={1.5} />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.8} fill={value === 1 ? "#b91c1c" : "#161b22"} />
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

  const cubeY = view.cube.owner === null ? H / 2 - 13 : view.cube.owner === me ? H - 54 : 26;
  const shownDice = view.dice.length === 4 ? [view.dice[0]!, view.dice[0]!] : view.dice;

  return (
    <div className="table-arena bg-gradient-to-b from-[#1c130d] to-[#110b08] !border-[#4a3322]">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className="chip bg-bg/80 border border-white/10 text-text-2">{t("backgammon.matchTo", { n: view.matchLength })}</span>
            <span className="chip bg-gold/15 border border-gold/35 text-gold font-bold tabular-nums">
              {view.scores[0]} – {view.scores[1]}
            </span>
            <span className="chip bg-bg/80 border border-white/10 text-text-2">
              {t("backgammon.cube")}: {view.cube.value}
            </span>
            {view.crawfordGame && <span className="chip bg-accent/15 border border-accent/35 text-accent">{t("backgammon.crawford")}</span>}
          </>
        }
      />

      {/* Compact Player Header Plates */}
      <div className="grid grid-cols-2 gap-2">
        <SeatTag seat={1 - me} seats={seats} active={view.toAct === 1 - me} compact>
          <span className="inline-block size-2.5 rounded-full bg-[#1a1f24] border border-gold/70" aria-hidden="true" />
          <span className="tabular-nums text-text-2">{t("backgammon.pips")}: {view.pips[1 - me]}</span>
          <span className="tabular-nums text-gold">{t("backgammon.off")}: {view.off[1 - me]}/15</span>
        </SeatTag>
        <SeatTag seat={me} seats={seats} active={myTurn} compact>
          <span className="inline-block size-2.5 rounded-full bg-[#f5efe0] border border-[#b8aa8c]" aria-hidden="true" />
          <span className="tabular-nums text-text-2">{t("backgammon.pips")}: {view.pips[me]}</span>
          <span className="tabular-nums text-primary font-bold">{t("backgammon.off")}: {preview.off[me]}/15</span>
        </SeatTag>
      </div>

      {/* Handcrafted Inlaid Wood Backgammon Board (viewport-constrained so controls stay visible) */}
      <div className="w-full max-w-[42rem] mx-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[48dvh] h-auto rounded-2xl select-none" role="img" aria-label="backgammon board">
          <defs>
            <linearGradient id="bg-wood" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#483020" />
              <stop offset="100%" stopColor="#26170f" />
            </linearGradient>
            <linearGradient id="bg-felt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0e3b2e" />
              <stop offset="50%" stopColor="#092920" />
              <stop offset="100%" stopColor="#0e3b2e" />
            </linearGradient>
            <linearGradient id="bg-pt-light" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dec89c" />
              <stop offset="100%" stopColor="#b89b67" />
            </linearGradient>
            <linearGradient id="bg-pt-dark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8c2d2d" />
              <stop offset="100%" stopColor="#5e1b1b" />
            </linearGradient>
            <radialGradient id="bg-chk-white" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="65%" stopColor="#ede6d5" />
              <stop offset="100%" stopColor="#bfb397" />
            </radialGradient>
            <radialGradient id="bg-chk-black" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#414b56" />
              <stop offset="55%" stopColor="#1e242b" />
              <stop offset="100%" stopColor="#0d1115" />
            </radialGradient>
            <linearGradient id="bg-ivory" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e8e0cc" />
            </linearGradient>
            <linearGradient id="bg-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fce28f" />
              <stop offset="100%" stopColor="#c78d1c" />
            </linearGradient>
          </defs>

          <rect x={0} y={0} width={W} height={H} rx={14} fill="url(#bg-wood)" />
          <rect x={2} y={2} width={W - 4} height={H - 4} rx={12} fill="none" stroke="rgba(243,194,79,0.25)" strokeWidth={1.2} />

          <rect x={PAD_L - 6} y={14} width={6 * PW + 12} height={H - 28} rx={7} fill="url(#bg-felt)" stroke="#1d120b" strokeWidth={2} />
          <rect x={barX + BAR - 6} y={14} width={6 * PW + 12} height={H - 28} rx={7} fill="url(#bg-felt)" stroke="#1d120b" strokeWidth={2} />

          {/* Center Bar */}
          <rect x={barX} y={12} width={BAR} height={H - 24} rx={4} fill="#2b1b11" stroke="#4f3523" strokeWidth={1.2} />
          <rect x={barX + 11} y={40} width={12} height={22} rx={2} fill="url(#bg-gold)" opacity={0.75} />
          <rect x={barX + 11} y={H - 62} width={12} height={22} rx={2} fill="url(#bg-gold)" opacity={0.75} />

          {/* Bear-Off Trays */}
          <rect x={trayX} y={18} width={38} height={H / 2 - 26} rx={6} fill="#18100a" stroke="#473020" strokeWidth={1.2} />
          <rect x={trayX} y={H / 2 + 8} width={38} height={H / 2 - 26} rx={6} fill="#18100a" stroke="#473020" strokeWidth={1.2} />
          {Array.from({ length: Math.min(preview.off[1 - me] ?? 0, 15) }, (_, k) => (
            <rect key={`opp-off-${k}`} x={trayX + 5} y={23 + k * 9.5} width={28} height={7} rx={3} fill="#232a32" stroke="#c89a38" strokeWidth={0.7} />
          ))}
          {Array.from({ length: Math.min(preview.off[me] ?? 0, 15) }, (_, k) => (
            <rect key={`me-off-${k}`} x={trayX + 5} y={H - 28 - k * 9.5} width={28} height={7} rx={3} fill="#f2ead6" stroke="#9e9072" strokeWidth={0.7} />
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
            const radius = PW / 2 - 3.5;

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
                  stroke={isTarget ? "#20cc5a" : isSelected ? "#f3c24f" : "rgba(0,0,0,0.28)"}
                  strokeWidth={isTarget || isSelected ? 2.6 : 0.9}
                />

                {/* Numbered Target Landing Badge (clear non-color-only destination cue) */}
                {isTarget && (
                  <g>
                    <circle cx={cx} cy={top ? 162 : H - 162} r={9.5} fill="#18b84e" stroke="#ffffff" strokeWidth={1.8} />
                    <text x={cx} y={(top ? 162 : H - 162) + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#04180b">
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
                        stroke={isSelected && topChecker ? "#f3c24f" : isSource && topChecker ? "#20cc5a" : mine ? "#a39475" : "#4a5562"}
                        strokeWidth={isSelected && topChecker ? 3 : isSource && topChecker ? 2.6 : 1.2}
                      />
                      {isSource && topChecker && !isSelected && (
                        <circle cx={cx} cy={cy} r={3.5} fill="#18b84e" />
                      )}
                    </g>
                  );
                })}

                {count > 5 && (
                  <text
                    x={cx}
                    y={(top ? 16 + radius + 2 + 4 * (radius * 1.82) : H - 16 - radius - 2 - 4 * (radius * 1.82)) + 4.5}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={800}
                    fill={mine ? "#161b22" : "#f7fafc"}
                  >
                    {count}
                  </text>
                )}

                <text x={cx} y={top ? 11 : H - 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#b59d82">
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
                  r={14}
                  fill={p === me ? "url(#bg-chk-white)" : "url(#bg-chk-black)"}
                  stroke={p === me && sources.has(25) ? "#20cc5a" : "#f3c24f"}
                  strokeWidth={2.5}
                />
                <text x={barX + BAR / 2} y={p === me ? H / 2 + 39 : H / 2 - 29} textAnchor="middle" fontSize={12} fontWeight={800} fill={p === me ? "#161b22" : "#ffffff"}>
                  {preview.bar[p]}
                </text>
              </g>
            ) : null,
          )}

          {/* Bear-Off Target */}
          {from !== null && targets.has(0) && (
            <g onClick={() => clickPoint(0)} className="cursor-pointer" data-point={0} data-target role="button" aria-label={t("backgammon.off")}>
              <rect x={trayX} y={H / 2 + 8} width={38} height={H / 2 - 26} rx={6} fill="#18b84e" fillOpacity={0.38} stroke="#20cc5a" strokeWidth={2.5} />
              <text x={trayX + 19} y={H / 2 + 92} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#ffffff">
                {t("backgammon.off")}
              </text>
            </g>
          )}

          {/* Pipped 3D Ivory Dice */}
          {shownDice.map((d, i) => (
            <SvgDie key={i} value={d} x={barX + BAR + 86 + i * 44} y={H / 2 - 17} />
          ))}
          {view.dice.length === 4 && (
            <g transform={`translate(${barX + BAR + 178} ${H / 2 - 12})`}>
              <rect width={28} height={24} rx={12} fill="#f3c24f" />
              <text x={14} y={16} textAnchor="middle" fontSize={12} fontWeight={800} fill="#1d1404">
                ×4
              </text>
            </g>
          )}

          {/* Doubling Cube */}
          <g transform={`translate(7 ${cubeY})`}>
            <rect width={26} height={26} rx={5} fill="url(#bg-gold)" stroke="#fff4cc" strokeWidth={1.2} />
            <text x={13} y={18} textAnchor="middle" fontSize={13} fontWeight={800} fill="#1d1404">
              {view.cube.value === 1 ? 64 : view.cube.value}
            </text>
          </g>
        </svg>
      </div>

      {/* Contextual Step Guidance + Action Bar */}
      {myTurn && (
        <div className="rounded-xl bg-bg/85 border border-primary/40 p-2.5 flex flex-wrap gap-2 justify-center items-center fade-in">
          {view.phase === "preroll" && (
            <>
              <button className="btn-primary px-6" onClick={() => onAction({ type: "roll" })}>
                <Dices size={16} /> {t("backgammon.roll")}
              </button>
              {view.canDouble && (
                <button className="btn-gold px-5" onClick={() => onAction({ type: "double" })}>
                  {t("backgammon.double")}
                </button>
              )}
            </>
          )}
          {view.phase === "doubled" && (
            <>
              <span className="text-sm font-semibold text-gold">{t("backgammon.offered")}</span>
              <button className="btn-primary px-5" onClick={() => onAction({ type: "take" })}>
                {t("backgammon.take")}
              </button>
              <button className="btn-danger px-5" onClick={() => onAction({ type: "drop" })}>
                {t("backgammon.drop")}
              </button>
            </>
          )}
          {view.phase === "move" && (
            <>
              <span className={`text-xs font-medium w-full sm:w-auto text-center ${complete ? "text-primary" : "text-text-2"}`}>
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
                  <Undo2 size={13} /> {t("backgammon.stepBack")}
                </button>
              )}
              <button className="btn-secondary btn-sm" disabled={partial.length === 0} onClick={() => (setPartial([]), setFrom(null))}>
                <RotateCcw size={13} /> {t("backgammon.undo")}
              </button>
              <button
                className="btn-primary px-5"
                disabled={!complete}
                onClick={() => {
                  onAction({ type: "move", moves: partial });
                  setPartial([]);
                  setFrom(null);
                }}
              >
                <Check size={15} /> {t("backgammon.confirm")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
