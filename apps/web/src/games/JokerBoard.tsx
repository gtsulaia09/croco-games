import { useState } from "react";
import { ClipboardList, Crown, Sparkles } from "lucide-react";
import type { JokerView } from "@croco/game-engine/games/joker";
import { useT } from "../i18n";
import { Modal, PlayingCard, SuitIcon, suitSymbol } from "../components/ui";
import { MiniCardCount, opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

const SUITS = ["S", "H", "D", "C"] as const;

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

  const trickBySeat = new Map(view.trick.map((p) => [p.seat, p]));

  function renderSeat(s: number, compact = false) {
    const bid = view.bids[s];
    const won = view.tricks[s] ?? 0;
    const matched = bid !== null && bid !== undefined && won === bid;
    const exceeded = bid !== null && bid !== undefined && won > bid;
    const statusCls = exceeded ? "text-danger" : matched ? "text-primary" : "text-text-2";
    return (
      <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s} dealer={view.dealer === s} compact={compact}>
        <span className={`font-semibold tabular-nums ${statusCls}`}>
          {compact ? `${won}/${bid ?? "—"}` : `${t("joker.bid")}: ${bid ?? "—"} · ${t("joker.tricks")}: ${won}`}
        </span>
        {s !== mySeat && <MiniCardCount count={view.handCounts[s] ?? 0} />}
        <span className="text-gold font-bold tabular-nums">{view.totals[s]}</span>
      </SeatTag>
    );
  }

  function renderTrickCard(s: number) {
    const p = trickBySeat.get(s);
    if (!p) return <span className="pcard-slot opacity-30" aria-hidden="true" />;
    return (
      <div className="flex flex-col items-center gap-1 card-enter">
        <PlayingCard card={p.card} size="sm" />
        <span className="text-[10px] font-semibold text-white bg-bg/85 rounded-md px-1.5 py-0.5 max-w-22 truncate">{name(s)}</span>
        {p.joker && (
          <span className="chip bg-gold/20 text-gold border border-gold/40 h-5 px-1.5 text-[10px]">
            {t(`joker.${p.joker.mode}`)} {p.joker.suit ? suitSymbol(p.joker.suit) : ""}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="table-arena felt-emerald">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className="chip bg-bg/75 border border-white/10 text-text-2">{t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}</span>
            <span className="chip bg-bg/75 border border-white/10 text-text-2">{t("joker.set", { n: view.set })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <button className="btn-secondary btn-sm h-6 px-2.5 text-[11px]" onClick={() => setSheet(true)}>
              <ClipboardList size={12} /> {t("joker.sheet")}
            </button>
          </>
        }
      />

      {/* Compact 3-column mobile opponent bar (keeps entire table visible without scrolling) */}
      <div className="grid grid-cols-3 gap-1.5 sm:hidden">
        {opps.slice(0, 3).map((s) => renderSeat(s, true))}
      </div>

      {/* Desktop / Tablet Compass Card Table */}
      <div className="hidden sm:flex justify-center">
        <div className="w-64">{renderSeat(northSeat)}</div>
      </div>

      <div className="grid sm:grid-cols-[175px_1fr_175px] gap-2.5 items-center">
        <div className="hidden sm:block">{renderSeat(westSeat)}</div>

        {/* Center Trick Arena */}
        <div className="relative rounded-2xl border border-white/12 bg-black/22 px-3 py-3.5 min-h-40 sm:min-h-44 flex flex-col items-center justify-center">
          {/* Desktop Compass Trick Grid */}
          <div className="hidden sm:grid grid-cols-3 grid-rows-[auto_auto_auto] items-center justify-items-center gap-2 w-full max-w-sm">
            <div className="col-start-2 row-start-1">{trickBySeat.has(northSeat) ? renderTrickCard(northSeat) : null}</div>
            <div className="col-start-1 row-start-2">{trickBySeat.has(westSeat) ? renderTrickCard(westSeat) : null}</div>
            <div className="col-start-2 row-start-2 flex flex-col items-center justify-center min-h-12">
              {view.trick.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  {view.trumpCard && <PlayingCard card={view.trumpCard} size="xs" />}
                  {view.lastTrick ? (
                    <span className="chip bg-bg/80 border border-gold/30 text-gold">
                      <Crown size={11} /> {t("game.lastTrick")}: {name(view.lastTrick.winner)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/35 font-semibold">{t("games.joker.name")}</span>
                  )}
                </div>
              )}
            </div>
            <div className="col-start-3 row-start-2">{trickBySeat.has(eastSeat) ? renderTrickCard(eastSeat) : null}</div>
            <div className="col-start-2 row-start-3">{trickBySeat.has(southSeat) ? renderTrickCard(southSeat) : null}</div>
          </div>

          {/* Mobile Trick Row */}
          <div className="flex sm:hidden flex-wrap items-center justify-center gap-2">
            {view.trick.length > 0 ? (
              view.trick.map((p) => (
                <div key={p.seat} className="flex flex-col items-center gap-1 card-enter">
                  <PlayingCard card={p.card} size="sm" />
                  <span className="text-[10px] font-semibold text-white bg-bg/85 rounded px-1.5 max-w-20 truncate">{name(p.seat)}</span>
                  {p.joker && (
                    <span className="text-[10px] text-gold font-semibold">
                      {t(`joker.${p.joker.mode}`)} {p.joker.suit ? suitSymbol(p.joker.suit) : ""}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-center">
                {view.trumpCard && <PlayingCard card={view.trumpCard} size="xs" />}
                {view.lastTrick ? (
                  <span className="text-xs text-gold font-medium">
                    {t("game.lastTrick")}: {name(view.lastTrick.winner)}
                  </span>
                ) : (
                  <span className="text-xs text-white/35 font-medium">{t("games.joker.name")}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="hidden sm:block">{renderSeat(eastSeat)}</div>
      </div>

      {/* Player Hand & Contextual Action Console */}
      {mySeat !== null && view.you && (
        <div className="grid gap-2.5">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <div className="w-full sm:w-auto sm:min-w-68">{renderSeat(mySeat)}</div>
            {myTurn && view.phase === "play" && (
              <span className="text-xs text-primary font-medium">{t("joker.playHint")}</span>
            )}
          </div>

          {/* Choose Trump Controls */}
          {myTurn && view.phase === "trump" && (
            <div className="rounded-xl bg-bg/85 border border-primary/45 p-2.5 flex flex-wrap gap-2 items-center justify-center fade-in" role="group" aria-label={t("joker.chooseTrump")}>
              <span className="text-xs sm:text-sm font-semibold text-white mr-1">{t("joker.chooseTrump")}:</span>
              {SUITS.map((s) => {
                const red = s === "H" || s === "D";
                return (
                  <button
                    key={s}
                    className={`btn-secondary btn-sm min-w-11 h-10 ${red ? "text-[#ff6b6b]" : "text-white"}`}
                    onClick={() => onAction({ type: "trump", suit: s })}
                  >
                    <SuitIcon suit={s} size={18} />
                    <span className="sr-only">{suitSymbol(s)}</span>
                  </button>
                );
              })}
              <button className="btn-gold btn-sm h-10" onClick={() => onAction({ type: "trump", suit: "none" })}>
                {t("game.noTrump")}
              </button>
            </div>
          )}

          {/* Bidding Strip */}
          {myTurn && view.phase === "bid" && (
            <div className="rounded-xl bg-bg/85 border border-primary/45 p-2.5 flex flex-wrap gap-2 items-center justify-center fade-in" role="group" aria-label={t("joker.chooseBid")}>
              <span className="text-xs sm:text-sm font-semibold text-white w-full sm:w-auto text-center">{t("joker.chooseBid")}</span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {Array.from({ length: view.cards + 1 }, (_, n) => n).map((n) => {
                  const forbidden = n === view.you!.forbiddenBid;
                  return (
                    <button
                      key={n}
                      className={`h-10 min-w-10 px-3 rounded-xl font-bold text-sm transition-colors ${
                        forbidden ? "bg-surface-3 border border-danger/35 text-muted/40 line-through" : "btn-primary"
                      }`}
                      disabled={forbidden}
                      onClick={() => onAction({ type: "bid", value: n })}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {view.you.forbiddenBid !== null && (
                <span className="chip bg-danger/15 text-danger border border-danger/35 w-full sm:w-auto justify-center">
                  {t("joker.forbidden", { n: view.you.forbiddenBid })}
                </span>
              )}
            </div>
          )}

          {/* Prominent Player Hand */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center pt-1 pb-0.5" role="group" aria-label={t("game.yourHand")}>
            {view.you.hand.map((c) => {
              const canPlay = myTurn && view.phase === "play" && playable.has(c);
              return (
                <PlayingCard
                  key={c}
                  card={c}
                  playable={!myTurn || view.phase !== "play" || playable.has(c)}
                  onClick={canPlay ? () => play(c) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Joker High/Low Modal */}
      <Modal open={jokerCard !== null} onClose={() => setJokerCard(null)} title={leading ? t("joker.jokerLead") : t("joker.jokerFollow")}>
        <div className="grid gap-3">
          {(["high", "low"] as const).map((mode) => (
            <div key={mode} className="panel-inset p-3 flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm font-semibold text-gold flex items-center gap-1.5">
                <Sparkles size={14} /> {t(`joker.${mode}`)}
              </span>
              {leading ? (
                SUITS.map((s) => {
                  const red = s === "H" || s === "D";
                  return (
                    <button
                      key={s}
                      className={`btn-secondary btn-sm min-w-11 h-9 ${red ? "text-[#ff6b6b]" : "text-white"}`}
                      onClick={() => {
                        onAction({ type: "play", card: jokerCard, joker: { mode, suit: s } });
                        setJokerCard(null);
                      }}
                    >
                      <SuitIcon suit={s} size={16} />
                      <span className="sr-only">{suitSymbol(s)}</span>
                    </button>
                  );
                })
              ) : (
                <button
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

      {/* Score Sheet Modal */}
      <Modal open={sheet} onClose={() => setSheet(false)} title={t("joker.sheet")} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted bg-surface-2 border-b border-line">
              <tr>
                <th className="text-left p-2">#</th>
                {[0, 1, 2, 3].map((s) => (
                  <th key={s} className="text-right p-2 font-semibold text-white">{name(s)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.history.map((h) => (
                <tr key={h.hand} className="table-row hover:bg-surface-hover/40">
                  <td className="p-2 text-muted font-medium">
                    {h.hand} ({h.cards})
                  </td>
                  {[0, 1, 2, 3].map((s) => (
                    <td key={s} className={`p-2 text-right font-medium ${h.bids[s] === h.tricks[s] ? "text-primary" : h.scores[s]! < 0 ? "text-danger" : "text-text-2"}`}>
                      {h.bids[s]}/{h.tricks[s]} · {h.scores[s]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-bold text-sm bg-surface-2 border-t border-line-strong">
                <td className="p-2.5 text-gold">{t("joker.total")}</td>
                {view.totals.map((v, s) => (
                  <td key={s} className="p-2.5 text-right text-white">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
