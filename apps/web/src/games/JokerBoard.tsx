import { useState, type CSSProperties } from "react";
import { ClipboardList, Crown, Sparkles } from "lucide-react";
import type { JokerView } from "@croco/game-engine/games/joker";
import { useT } from "../i18n";
import { Modal, SuitIcon, suitSymbol } from "../components/ui";
import { CardHand, PlayingCard } from "./cards";
import { sortHand } from "./cardOrder";
import { GameTable, HudChip, isRedSuit, MiniCardCount, opponentsOrder, SeatStat, SeatTag, SuitPicker, SUITS, tiltFor, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

type Pos = "n" | "w" | "e" | "s";
const FROM: Record<Pos, CSSProperties> = {
  n: { "--from-x": "0px", "--from-y": "-70px" } as CSSProperties,
  s: { "--from-x": "0px", "--from-y": "70px" } as CSSProperties,
  w: { "--from-x": "-70px", "--from-y": "0px" } as CSSProperties,
  e: { "--from-x": "70px", "--from-y": "0px" } as CSSProperties,
};

/** Bid as rings, tricks taken as filled pips; tricks over the bid turn red. */
function BidPips({ bid, won }: { bid: number | null | undefined; won: number }) {
  if (bid === null || bid === undefined) return null;
  const total = Math.max(bid, won);
  if (total === 0) return null;
  return (
    <span className="bid-pips" aria-hidden="true">
      {Array.from({ length: Math.min(total, 9) }, (_, i) => (
        <span key={i} className="bid-pip" data-won={i < won ? "true" : "false"} data-over={i >= bid ? "true" : "false"} />
      ))}
    </span>
  );
}

export default function JokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<JokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const [jokerCard, setJokerCard] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const myTurn = view.toAct === mySeat && mySeat !== null;
  const playable = new Set(view.you?.playable ?? []);
  const leading = view.trick.length === 0;

  function play(card: string) {
    if (card.startsWith("X")) setJokerCard(card);
    else onAction({ type: "play", card });
  }

  const opps = opponentsOrder(4, mySeat);
  const westSeat = opps[0]!;
  const northSeat = opps[1]!;
  const eastSeat = opps[2]!;
  const southSeat = mySeat ?? opps[3]!;
  const posOf: Record<number, Pos> = { [westSeat]: "w", [northSeat]: "n", [eastSeat]: "e", [southSeat]: "s" };

  function renderSeat(s: number, compact = true) {
    const bid = view.bids[s];
    const won = view.tricks[s] ?? 0;
    const tone = bid === null || bid === undefined ? undefined : won > bid ? "bad" : won === bid ? "good" : undefined;
    return (
      <SeatTag seat={s} seats={seats} active={view.toAct === s} dealer={view.dealer === s} compact={compact}>
        <SeatStat label={t("joker.bid")} value={`${won}/${bid ?? "—"}`} tone={tone} />
        <BidPips bid={bid} won={won} />
        {s !== mySeat && <MiniCardCount count={view.handCounts[s] ?? 0} />}
        <SeatStat value={view.totals[s]} tone="gold" />
      </SeatTag>
    );
  }

  const hand = view.you ? sortHand(view.you.hand, { trump: view.trump }) : [];

  // Trump and bid choices sit on the felt in the empty centre, right next to the turned trump card.
  const actionPanel =
    mySeat !== null && view.you ? (
      <>
      {myTurn && view.phase === "trump" && (
        <div className="action-bar fade-in" role="group" aria-label={t("joker.chooseTrump")}>
          <span className="action-title w-full sm:w-auto text-center">{t("joker.chooseTrump")}</span>
          <SuitPicker onPick={(s) => onAction({ type: "trump", suit: s })} />
          <button type="button" className="btn-gold h-[50px] px-5" onClick={() => onAction({ type: "trump", suit: "none" })}>
            {t("game.noTrump")}
          </button>
        </div>
      )}

      {myTurn && view.phase === "bid" && (
        <div className="action-bar fade-in" role="group" aria-label={t("joker.chooseBid")}>
          <span className="action-title w-full text-center">{t("joker.chooseBid")}</span>
          <div className="flex flex-wrap gap-2 justify-center">
            {Array.from({ length: view.cards + 1 }, (_, n) => n).map((n) => {
              const forbidden = n === view.you!.forbiddenBid;
              return (
                <button key={n} type="button" className="bid-btn" disabled={forbidden} onClick={() => onAction({ type: "bid", value: n })} aria-label={String(n)}>
                  {n}
                </button>
              );
            })}
          </div>
          {view.you.forbiddenBid !== null && <span className="action-hint w-full text-center text-[#ff9c97]">{t("joker.forbidden", { n: view.you.forbiddenBid })}</span>}
        </div>
      )}
      </>
    ) : null;

  return (
    <div className="board">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            {view.ruleset === "nines" && <HudChip tone="brand">{t("joker.ninesShort")}</HudChip>}
            <HudChip>{t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}</HudChip>
            <HudChip>{t("joker.set", { n: view.set })}</HudChip>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <button type="button" className="hud-chip" onClick={() => setSheet(true)}>
              <ClipboardList size={13} /> {t("joker.sheet")}
            </button>
          </>
        }
      />

      <GameTable rail="walnut" felt="joker" print={t("games.joker.name")}>
        {view.trumpCard && view.trick.length > 0 && (
          <div className="corner-tl grid justify-items-center gap-1">
            <PlayingCard card={view.trumpCard} size="xs" />
            <span className="felt-label">{t("game.trump")}</span>
          </div>
        )}
        <div className="seat-ring">
          <div data-area="n">{renderSeat(northSeat)}</div>
          <div data-area="w">{renderSeat(westSeat)}</div>
          <div data-area="e">{renderSeat(eastSeat)}</div>

          <div data-area="c" className="grid place-items-center min-h-[150px] w-full">
            {view.trick.length > 0 ? (
              <div className="trick-cross" style={{ "--cw": "clamp(48px, 4.2vw + 20px, 72px)" } as CSSProperties}>
                {view.trick.map((p) => {
                  const pos = posOf[p.seat] ?? "s";
                  return (
                    <div key={`${p.seat}-${p.card}`} className="trick-card" data-pos={pos}>
                      <PlayingCard card={p.card} size="sm" animate="play" style={{ ...FROM[pos], "--tilt": tiltFor(p.card) } as CSSProperties} />
                      {p.joker ? (
                        <span className="trick-tag" data-tone="gold">
                          {t(`joker.${p.joker.mode}`)} {p.joker.suit ? suitSymbol(p.joker.suit) : ""}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                <span className="trick-spacer" aria-hidden="true" />
              </div>
            ) : (
              <div className="row-center">
                {view.trumpCard && (
                  <div className="grid justify-items-center gap-1.5">
                    <PlayingCard card={view.trumpCard} size="sm" animate="flip" />
                    <span className="felt-label">{t("game.trump")}</span>
                  </div>
                )}
                {actionPanel}
                <div className="grid justify-items-center gap-2 text-center">
                  {view.lastTrick && (
                    <span className="amount-tag">
                      <Crown size={13} className="text-[#e2c27a]" /> {t("game.lastTrick")}: {name(view.lastTrick.winner)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div data-area="s">{renderSeat(southSeat, false)}</div>
        </div>
      </GameTable>

      {mySeat !== null && view.you && (
        <div className="dock">
          {myTurn && view.phase === "play" && (
            <div className="flex justify-center">
              <span className="hint-pill">{t("joker.playHint")}</span>
            </div>
          )}

          <CardHand
            label={t("game.yourHand")}
            size="md"
            dealKey={view.handNumber}
            cards={hand.map((c) => {
              const active = myTurn && view.phase === "play";
              const canPlay = active && playable.has(c);
              return { card: c, playable: !active || canPlay, onClick: canPlay ? () => play(c) : undefined };
            })}
          />
        </div>
      )}

      {/* Joker: high or low (and the suit when leading) */}
      <Modal open={jokerCard !== null} onClose={() => setJokerCard(null)} title={leading ? t("joker.jokerLead") : t("joker.jokerFollow")}>
        <div className="grid gap-3">
          {(["high", "low"] as const).map((mode) => (
            <div key={mode} className="panel-inset p-3.5 flex flex-wrap items-center gap-2.5">
              <span className="w-24 text-sm font-extrabold text-[#e2c27a] flex items-center gap-1.5">
                <Sparkles size={15} /> {t(`joker.${mode}`)}
              </span>
              {leading ? (
                SUITS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="suit-tile !h-11 !min-w-11"
                    data-red={isRedSuit(s) ? "true" : "false"}
                    onClick={() => {
                      onAction({ type: "play", card: jokerCard, joker: { mode, suit: s } });
                      setJokerCard(null);
                    }}
                  >
                    <SuitIcon suit={s} size={20} />
                    <span className="sr-only">{suitSymbol(s)}</span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => {
                    onAction({ type: "play", card: jokerCard, joker: { mode } });
                    setJokerCard(null);
                  }}
                >
                  {t(`joker.${mode}`)}
                </button>
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* Score sheet */}
      <Modal open={sheet} onClose={() => setSheet(false)} title={t("joker.sheet")} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted bg-surface-2 border-b border-line">
              <tr>
                <th className="text-left p-2.5">#</th>
                {[0, 1, 2, 3].map((s) => (
                  <th key={s} className="text-right p-2.5 font-bold text-white">
                    {name(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.history.map((h) => (
                <tr key={h.hand} className="table-row hover:bg-surface-hover/40">
                  <td className="p-2.5 text-muted font-semibold">
                    {h.hand} ({h.cards})
                  </td>
                  {[0, 1, 2, 3].map((s) => (
                    <td key={s} className={`p-2.5 text-right font-semibold ${h.bids[s] === h.tricks[s] ? "text-primary" : h.scores[s]! < 0 ? "text-danger" : "text-text-2"}`}>
                      {h.bids[s]}/{h.tricks[s]} · {h.scores[s]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-extrabold text-sm bg-surface-2 border-t border-line-strong">
                <td className="p-2.5 text-gold">{t("joker.total")}</td>
                {view.totals.map((v, s) => (
                  <td key={s} className="p-2.5 text-right text-white">
                    {v}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
