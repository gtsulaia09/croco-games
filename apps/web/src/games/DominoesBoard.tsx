import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";
import type { DominoesView } from "@croco/game-engine/games/dominoes";
import { useT } from "../i18n";
import { GameTable, HudChip, opponentsOrder, SeatStat, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

/** Pip positions in a 32×32 half (classic layout). */
const PIPS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[16, 16]],
  2: [[8.5, 8.5], [23.5, 23.5]],
  3: [[8.5, 8.5], [16, 16], [23.5, 23.5]],
  4: [[8.5, 8.5], [23.5, 8.5], [8.5, 23.5], [23.5, 23.5]],
  5: [[8.5, 8.5], [23.5, 8.5], [16, 16], [8.5, 23.5], [23.5, 23.5]],
  6: [[8.5, 7.5], [23.5, 7.5], [8.5, 16], [23.5, 16], [8.5, 24.5], [23.5, 24.5]],
};

function Half({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 32 32" className="domino-half" aria-hidden="true">
      {(PIPS[n] ?? []).map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy + 0.5} r={3.3} fill="rgba(255,255,255,0.8)" />
          <circle cx={cx} cy={cy} r={3.3} fill="#17191d" />
        </g>
      ))}
    </svg>
  );
}

function Domino({
  a,
  b,
  vertical,
  onClick,
  active,
  playable = true,
  label,
  style,
  className = "",
}: {
  a: number;
  b: number;
  vertical?: boolean;
  onClick?: () => void;
  active?: boolean;
  playable?: boolean;
  label?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const inner = (
    <>
      <Half n={a} />
      <span className="domino-bar" aria-hidden="true" />
      <Half n={b} />
    </>
  );
  const common = {
    className: `domino ${className}`,
    "data-vertical": vertical ? "true" : "false",
    "data-active": active ? "true" : "false",
    "data-playable": playable ? "true" : "false",
    "aria-label": label ?? `${a}-${b}`,
    style,
  };
  if (onClick) {
    return (
      <button type="button" {...common} disabled={!playable} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <span role="img" {...common}>
      {inner}
    </span>
  );
}

const values = (tile: string) => tile.split("-").map(Number) as [number, number];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function DominoesBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<DominoesView>) {
  const t = useT();
  const name = useSeatName(seats);
  const [choose, setChoose] = useState<string | null>(null);
  const [chainRef, chainWidth] = useWidth<HTMLDivElement>();
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

  function placeAt(end: "left" | "right") {
    if (!choose) return;
    onAction({ type: "play", tile: choose, end });
    setChoose(null);
  }

  // Lay the chain out like on a real table: rows that snake back and forth.
  const dh = Math.max(18, Math.min(30, Math.floor((chainWidth || 600) / 26)));
  const gap = 3;
  const rows: Array<Array<{ p: DominoesView["line"][number]; index: number }>> = [];
  let row: Array<{ p: DominoesView["line"][number]; index: number }> = [];
  let used = 0;
  view.line.forEach((p, index) => {
    const w = (p.left === p.right ? dh : dh * 2) + gap;
    if (row.length > 0 && used + w > (chainWidth || 600)) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ p, index });
    used += w;
  });
  if (row.length) rows.push(row);
  const lastIndex = view.line.length - 1;

  const meSeat = mySeat ?? 0;

  return (
    <div className="board">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <HudChip>{t("game.round", { n: view.round })}</HudChip>
            <HudChip>
              <Layers size={12} /> {t("dominoes.boneyard", { n: view.boneyardCount })}
            </HudChip>
            <HudChip tone="gold">{t("dominoes.limit", { n: view.scoreLimit })}</HudChip>
          </>
        }
      />

      {view.lastRound && (
        <div className="notice fade-in">
          {view.lastRound.blocked ? `${t("dominoes.blocked")} · ` : ""}
          {view.lastRound.winner !== null ? `${name(view.lastRound.winner)} +${view.lastRound.points}` : "—"}
        </div>
      )}

      <GameTable rail="walnut" felt="tabletop">
        <div className="table-col">
          <div className="opp-row">
            {opponentsOrder(view.handCounts.length, mySeat)
              .filter((s) => s !== meSeat || mySeat === null)
              .map((s) => (
                <div key={s} className="opp-unit">
                  <SeatTag seat={s} seats={seats} active={view.toAct === s} compact>
                    <SeatStat value={`${view.scores[s]} / ${view.scoreLimit}`} tone="gold" />
                  </SeatTag>
                  <span className="inline-flex gap-[3px]" aria-label={String(view.handCounts[s] ?? 0)}>
                    {Array.from({ length: Math.min(view.handCounts[s] ?? 0, 8) }, (_, i) => (
                      <span key={i} className="domino-back" />
                    ))}
                    {(view.handCounts[s] ?? 0) > 8 && <span className="amount-tag !h-6">+{(view.handCounts[s] ?? 0) - 8}</span>}
                  </span>
                </div>
              ))}
            {view.variant === "draw" && (
              <div className="boneyard" title={t("dominoes.boneyard", { n: view.boneyardCount })}>
                <div className="boneyard-stack" aria-hidden="true">
                  {view.boneyardCount > 0 && <span className="domino-back" style={{ left: 14, top: -4 }} />}
                  {view.boneyardCount > 1 && <span className="domino-back" style={{ left: 18, top: 0 }} />}
                  {view.boneyardCount > 2 && <span className="domino-back" style={{ left: 22, top: 4 }} />}
                </div>
                <span className="amount-tag !h-6">{view.boneyardCount}</span>
              </div>
            )}
          </div>

          <div className="relative w-full grid gap-2 min-h-[150px] content-center">
            <div ref={chainRef} className="domino-chain" style={{ "--dh": `${dh}px` } as CSSProperties} role="group" aria-label={t("ui.openEnds")}>
              {view.line.length === 0 ? (
                <span className="felt-label text-center !text-[#3a1f0c]/60">{t("games.dominoes.name")}</span>
              ) : (
                rows.map((r, ri) => {
                  const rtl = ri % 2 === 1;
                  const items = rtl ? [...r].reverse() : r;
                  return (
                    <div key={ri} className="domino-row" data-dir={rows.length === 1 ? "center" : rtl ? "rtl" : "ltr"}>
                      {items.map(({ p, index }) => {
                        const isLeft = index === 0;
                        const isRight = index === lastIndex;
                        const a = rtl ? p.right : p.left;
                        const b = rtl ? p.left : p.right;
                        const tile = <Domino a={a} b={b} vertical={p.left === p.right} className="anim-in" />;
                        const endLabel =
                          isLeft && ends ? `← ${ends.left}` : isRight && ends ? `${ends.right} →` : undefined;
                        const target = choose && endLabel ? (isLeft ? "left" : "right") : null;
                        if (target) {
                          return (
                            <button key={p.tile} type="button" className="chain-end" data-label={endLabel} aria-label={`${p.left}-${p.right} · ${t(isLeft ? "dominoes.left" : "dominoes.right")}`} onClick={() => placeAt(target)}>
                              {tile}
                            </button>
                          );
                        }
                        return (
                          <span key={p.tile} className={endLabel ? "chain-end" : undefined} data-label={endLabel}>
                            {tile}
                          </span>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {mySeat !== null && (
            <SeatTag seat={mySeat} seats={seats} active={myTurn} compact>
              <SeatStat value={`${view.scores[mySeat]} / ${view.scoreLimit}`} tone="gold" />
            </SeatTag>
          )}
        </div>
      </GameTable>

      {mySeat !== null && (
        <div className="dock">
          {myTurn && choose && (
            <div className="action-bar fade-in">
              <span className="action-title w-full text-center">{t("dominoes.chooseEnd")}</span>
              {(["left", "right"] as const).map((end) => (
                <button key={end} type="button" className="btn-gold btn-lg px-5" onClick={() => placeAt(end)}>
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
            <div className="action-bar fade-in">
              {view.variant === "draw" && view.boneyardCount > 0 ? (
                <button className="btn-primary btn-lg px-8" onClick={() => onAction({ type: "draw" })}>
                  <Layers size={16} /> {t("dominoes.draw")}
                </button>
              ) : (
                <button className="btn-secondary btn-lg px-8" onClick={() => onAction({ type: "pass" })}>
                  {t("dominoes.pass")}
                </button>
              )}
            </div>
          )}

          {myTurn && anyPlayable && !choose && (
            <div className="flex justify-center">
              <span className="hint-pill">{t("dominoes.playHint")}</span>
            </div>
          )}

          <div className="domino-rack" role="group" aria-label={t("game.yourHand")}>
            {hand.map((tile, i) => {
              const [a, b] = values(tile);
              const can = myTurn && options(tile).length > 0;
              return (
                <Domino
                  key={tile}
                  a={a}
                  b={b}
                  vertical
                  playable={!myTurn || can}
                  onClick={can ? () => play(tile) : undefined}
                  active={choose === tile}
                  className="pc-anim-deal"
                  style={{ "--deal-i": i } as CSSProperties}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
