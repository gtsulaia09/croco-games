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
  const tableOrder = [westSeat, northSeat, eastSeat, southSeat];

  const trickBySeat = new Map(view.trick.map((p) => [p.seat, p]));

  function renderSeat(s: number, compact = false) {
    const bid = view.bids[s];
    const won = view.tricks[s] ?? 0;
    const matched = bid !== null && bid !== undefined && won === bid;
    const exceeded = bid !== null && bid !== undefined && won > bid;
    const statusCls = exceeded
      ? "bg-danger/20 text-danger border border-danger/40"
      : matched
        ? "bg-primary/20 text-primary border border-primary/40"
        : "bg-white/8 text-text-2 border border-white/12";
    return (
      <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s} dealer={view.dealer === s} compact={compact}>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${statusCls}`}>
          {compact ? `${won}/${bid ?? "—"}` : `${t("joker.tricks")} ${won} / ${bid ?? "—"}`}
        </span>
        {s !== mySeat && <MiniCardCount count={view.handCounts[s] ?? 0} />}
        <span className="text-gold font-extrabold tabular-nums">{view.totals[s]}</span>
      </SeatTag>
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
            <span className="chip bg-white/8 border border-white/14 text-white">{t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}</span>
            <span className="chip bg-white/8 border border-white/14 text-text-2">{t("joker.set", { n: view.set })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <button className="btn-secondary btn-sm h-7 px-2.5 text-[11px]" onClick={() => setSheet(true)}>
              <ClipboardList size={12} /> {t("joker.sheet")}
            </button>
          </>
        }
      />

      {/* Curved 3-Opponent Arena Arc (North top + West/East on mobile; West — North — East arc on >=640px) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-3 items-start pt-0.5 min-w-0">
        <div className="min-w-0 sm:translate-y-2">{renderSeat(westSeat, true)}</div>
        <div className="min-w-0 col-span-2 order-first sm:col-span-1 sm:order-none sm:-translate-y-0.5">{renderSeat(northSeat, true)}</div>
        <div className="min-w-0 sm:translate-y-2">{renderSeat(eastSeat, true)}</div>
      </div>

      {/* Sculpted Stadium Center Trick Stage — Full-Size High-Visibility Cards */}
      <div className="table-well min-h-40 sm:min-h-44 flex flex-col items-center justify-center gap-2.5">
        {view.trick.length > 0 ? (
          <div className="flex flex-wrap items-end justify-center gap-2.5 sm:gap-5">
            {tableOrder.map((s) => {
              const p = trickBySeat.get(s);
              if (!p) {
                return (
                  <div key={s} className="hidden sm:flex flex-col items-center gap-1.5 opacity-45">
                    <span className="pcard-slot" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-white/55 truncate max-w-22">{name(s)}</span>
                  </div>
                );
              }
              return (
                <div key={s} className="flex flex-col items-center gap-1.5 card-enter">
                  <PlayingCard card={p.card} size="md" />
                  <span className="text-[11px] font-bold text-white bg-[#070e17]/90 border border-white/15 rounded-full px-2.5 py-0.5 max-w-26 truncate">
                    {name(s)}
                  </span>
                  {p.joker && (
                    <span className="chip bg-gold/25 text-gold border border-gold/50 h-5 px-2 text-[10px] font-extrabold">
                      {t(`joker.${p.joker.mode}`)} {p.joker.suit ? suitSymbol(p.joker.suit) : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-1">
            {view.trumpCard && (
              <div className="flex flex-col items-center gap-1">
                <PlayingCard card={view.trumpCard} size="sm" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-gold/90">{t("game.trump")}</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-1.5 text-center">
              {view.lastTrick ? (
                <span className="chip bg-[#070e17]/90 border border-gold/45 text-gold h-7 px-3 text-xs font-bold">
                  <Crown size={13} /> {t("game.lastTrick")}: {name(view.lastTrick.winner)}
                </span>
              ) : (
                <span className="text-sm font-extrabold tracking-wide text-white/40 uppercase">{t("games.joker.name")}</span>
              )}
              {myTurn && view.phase === "play" && (
                <span className="text-xs text-primary font-bold">{t("joker.playHint")}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* High-Contrast Hero Player Station & Jumbo Hand */}
      {mySeat !== null && view.you && (
        <div className="hero-hand-tray" data-my-turn={myTurn ? "true" : "false"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="w-full sm:w-auto sm:min-w-68">{renderSeat(mySeat)}</div>
            {myTurn && view.phase === "play" && (
              <span className="chip bg-primary/18 text-primary border border-primary/40 font-bold">{t("joker.playHint")}</span>
            )}
          </div>

          {/* Choose Trump Controls (White Card-Stock Suit Tiles) */}
          {myTurn && view.phase === "trump" && (
            <div className="action-dock flex flex-wrap gap-2.5 items-center justify-center fade-in" role="group" aria-label={t("joker.chooseTrump")}>
              <span className="text-xs sm:text-sm font-extrabold text-white mr-1">{t("joker.chooseTrump")}:</span>
              {SUITS.map((s) => {
                const red = s === "H" || s === "D";
                return (
                  <button
                    key={s}
                    type="button"
                    className={`suit-card-btn ${red ? "text-[#e11d48]" : "text-[#0f172a]"}`}
                    onClick={() => onAction({ type: "trump", suit: s })}
                  >
                    <SuitIcon suit={s} size={22} />
                    <span className="sr-only">{suitSymbol(s)}</span>
                  </button>
                );
              })}
              <button type="button" className="btn-gold h-11 px-4" onClick={() => onAction({ type: "trump", suit: "none" })}>
                {t("game.noTrump")}
              </button>
            </div>
          )}

          {/* Bidding Strip */}
          {myTurn && view.phase === "bid" && (
            <div className="action-dock flex flex-wrap gap-2 items-center justify-center fade-in" role="group" aria-label={t("joker.chooseBid")}>
              <span className="text-xs sm:text-sm font-extrabold text-white w-full sm:w-auto text-center">{t("joker.chooseBid")}</span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {Array.from({ length: view.cards + 1 }, (_, n) => n).map((n) => {
                  const forbidden = n === view.you!.forbiddenBid;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`h-10 min-w-10 px-3 rounded-xl font-black text-sm transition-all ${
                        forbidden ? "bg-surface-3 border border-danger/45 text-muted/45 line-through" : "btn-primary"
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
                <span className="chip bg-danger/20 text-danger border border-danger/45 w-full sm:w-auto justify-center font-bold">
                  {t("joker.forbidden", { n: view.you.forbiddenBid })}
                </span>
              )}
            </div>
          )}

          {/* Jumbo High-Visibility Player Hand */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2.5 justify-center pt-1 pb-0.5" role="group" aria-label={t("game.yourHand")}>
            {view.you.hand.map((c) => {
              const canPlay = myTurn && view.phase === "play" && playable.has(c);
              return (
                <PlayingCard
                  key={c}
                  card={c}
                  size="md"
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
            <div key={mode} className="panel-inset p-3.5 flex flex-wrap items-center gap-2.5">
              <span className="w-24 text-sm font-extrabold text-gold flex items-center gap-1.5">
                <Sparkles size={15} /> {t(`joker.${mode}`)}
              </span>
              {leading ? (
                SUITS.map((s) => {
                  const red = s === "H" || s === "D";
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`suit-card-btn !h-10 !min-w-11 ${red ? "text-[#e11d48]" : "text-[#0f172a]"}`}
                      onClick={() => {
                        onAction({ type: "play", card: jokerCard, joker: { mode, suit: s } });
                        setJokerCard(null);
                      }}
                    >
                      <SuitIcon suit={s} size={19} />
                      <span className="sr-only">{suitSymbol(s)}</span>
                    </button>
                  );
                })
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

      {/* Score Sheet Modal */}
      <Modal open={sheet} onClose={() => setSheet(false)} title={t("joker.sheet")} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted bg-surface-2 border-b border-line">
              <tr>
                <th className="text-left p-2.5">#</th>
                {[0, 1, 2, 3].map((s) => (
                  <th key={s} className="text-right p-2.5 font-bold text-white">{name(s)}</th>
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
