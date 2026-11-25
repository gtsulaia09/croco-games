import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Layers } from "lucide-react";
import type { DominoesView, End } from "@croco/game-engine/games/dominoes";
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

const ENDS: End[] = ["left", "right", "up", "down"];
const ARROW: Record<End, ReactNode> = {
  left: <ArrowLeft size={15} />,
  right: <ArrowRight size={15} />,
  up: <ArrowUp size={15} />,
  down: <ArrowDown size={15} />,
};
const GLYPH: Record<End, string> = { left: "←", right: "→", up: "↑", down: "↓" };

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
  const options = (tile: string): End[] => {
    if (!ends) return view.opening && view.opening !== tile ? [] : ["left"];
    return ENDS.filter((e) => ends[e] !== undefined && fits(tile, ends[e]!));
  };
  const anyPlayable = hand.some((tile) => options(tile).length > 0);

  function play(tile: string) {
    const opts = options(tile);
    if (opts.length === 1) onAction({ type: "play", tile, end: opts[0] });
    else if (opts.length > 1) setChoose(tile);
  }

  function placeAt(end: End) {
    if (!choose) return;
    onAction({ type: "play", tile: choose, end });
    setChoose(null);
  }

  // Size the tiles so the main line fits the table; very long lines scroll inside the table.
  const units = view.line.reduce((s, p) => s + (p.tile === view.spinner ? 1 : 2) + 0.15, 0);
  const dh = Math.max(15, Math.min(30, Math.floor(((chainWidth || 600) - 8) / Math.max(units, 8))));
  const spinnerCol = view.spinner ? view.line.findIndex((p) => p.tile === view.spinner) : -1;
  const upLen = view.up.length;
  const mainRow = upLen + 1;
  const lastIndex = view.line.length - 1;
  const chooseOptions = choose ? options(choose) : [];

  /** Open ends represented by a tile position. */
  const endsAt = (where: { line?: number; arm?: "up" | "down"; k?: number }): End[] => {
    if (!ends) return [];
    const out: End[] = [];
    if (where.line !== undefined) {
      if (where.line === 0) out.push("left");
      if (where.line === lastIndex) out.push("right");
      if (where.line === spinnerCol) {
        if (!view.up.length) out.push("up");
        if (!view.down.length) out.push("down");
      }
    } else if (where.arm === "up" && where.k === view.up.length - 1) out.push("up");
    else if (where.arm === "down" && where.k === view.down.length - 1) out.push("down");
    return out;
  };

  function placed(key: string, tile: ReactNode, here: End[], cell: CSSProperties, tileLabel: string) {
    const tags = here.map((e) => (
      <span key={e} className="end-tag" data-side={e}>
        {e === "right" || e === "down" ? `${ends![e]} ${GLYPH[e]}` : `${GLYPH[e]} ${ends![e]}`}
      </span>
    ));
    const targets = choose ? here.filter((e) => chooseOptions.includes(e)) : [];
    if (targets.length === 1) {
      return (
        <button key={key} type="button" className="chain-end is-target" style={cell} aria-label={`${tileLabel} · ${t(`dominoes.${targets[0]}`)}`} onClick={() => placeAt(targets[0]!)}>
          {tile}
          {tags}
        </button>
      );
    }
    return (
      <span key={key} className={here.length ? "chain-end" : "chain-cell"} style={cell}>
        {tile}
        {tags}
      </span>
    );
  }

  const meSeat = mySeat ?? 0;
  const lastScore = view.lastScore;

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
          {view.lastRound.blocked ? `${t("dominoes.blocked")} · ` : `${t("dominoes.domino")} · `}
          {view.lastRound.winner !== null ? `${name(view.lastRound.winner)} +${view.lastRound.points}` : t("bura.draw")}
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
              <div className="boneyard" title={`${t("dominoes.boneyard", { n: view.boneyardCount })} · ${t("dominoes.protectedTiles")}`}>
                <div className="boneyard-stack" aria-hidden="true">
                  {view.boneyardCount > 0 && <span className="domino-back" style={{ left: 14, top: -4 }} />}
                  {view.boneyardCount > 1 && <span className="domino-back" style={{ left: 18, top: 0 }} />}
                  {view.boneyardCount > 2 && <span className="domino-back" style={{ left: 22, top: 4 }} />}
                </div>
                <span className="amount-tag !h-6">{view.boneyardCount}</span>
              </div>
            )}
          </div>

          <div className="w-full grid gap-2 min-h-[150px] content-center">
            <div ref={chainRef} className="domino-scroll" role="group" aria-label={t("ui.openEnds")}>
              {view.line.length === 0 ? (
                <span className="felt-label block text-center !text-[#3a1f0c]/60">{t("games.dominoes.name")}</span>
              ) : (
                <div className="domino-cross" style={{ "--dh": `${dh}px` } as CSSProperties}>
                  {view.up.map((p, k) =>
                    placed(
                      `u-${p.tile}`,
                      <Domino a={p.outer} b={p.inner} vertical className="anim-in" />,
                      endsAt({ arm: "up", k }),
                      { gridColumn: spinnerCol + 1, gridRow: upLen - k },
                      p.tile,
                    ),
                  )}
                  {view.line.map((p, i) =>
                    placed(
                      `l-${p.tile}`,
                      <Domino
                        a={p.left}
                        b={p.right}
                        vertical={p.tile === view.spinner}
                        className={`anim-in ${p.tile === view.spinner ? "domino-stavka" : ""}`}
                        label={p.tile === view.spinner ? `${p.tile} · ${t("dominoes.stavka")}` : undefined}
                      />,
                      endsAt({ line: i }),
                      { gridColumn: i + 1, gridRow: mainRow },
                      p.tile,
                    ),
                  )}
                  {view.down.map((p, k) =>
                    placed(
                      `d-${p.tile}`,
                      <Domino a={p.inner} b={p.outer} vertical className="anim-in" />,
                      endsAt({ arm: "down", k }),
                      { gridColumn: spinnerCol + 1, gridRow: mainRow + 1 + k },
                      p.tile,
                    ),
                  )}
                </div>
              )}
            </div>
            {view.line.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                <span className="amount-tag">{t("dominoes.openSum", { n: view.openSum })}</span>
                {lastScore && (
                  <span key={`${lastScore.seat}-${view.scores.join(",")}`} className="win-tag anim-pop">
                    {t("dominoes.scored", { name: name(lastScore.seat), n: lastScore.points })}
                  </span>
                )}
              </div>
            )}
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
              {chooseOptions.map((end) => (
                <button key={end} type="button" className="btn-gold btn-lg px-5" onClick={() => placeAt(end)}>
                  {ARROW[end]}
                  {t(`dominoes.${end}`)} ({ends?.[end]})
                </button>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setChoose(null)}>
                {t("common.cancel")}
              </button>
            </div>
          )}

          {myTurn && !anyPlayable && (
            <div className="action-bar fade-in">
              {view.drawable > 0 ? (
                <button className="btn-primary btn-lg px-8" onClick={() => onAction({ type: "draw" })}>
                  <Layers size={16} /> {t("dominoes.draw")}
                </button>
              ) : (
                <>
                  {view.variant === "draw" && view.boneyardCount > 0 && <span className="action-hint w-full text-center">{t("dominoes.protectedTiles")}</span>}
                  <button className="btn-secondary btn-lg px-8" onClick={() => onAction({ type: "pass" })}>
                    {t("dominoes.pass")}
                  </button>
                </>
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
