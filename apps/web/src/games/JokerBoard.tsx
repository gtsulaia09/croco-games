import { useState } from "react";
import type { JokerView } from "@croco/game-engine/games/joker";
import { useT } from "../i18n";
import { Modal, PlayingCard, suitSymbol } from "../components/ui";
import { opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

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

  const trickBySeat = new Map(view.trick.map((p) => [p.seat, p]));
  return (
    <div className="felt rounded-xl p-3 sm:p-4 grid gap-3">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span>{t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}</span>
            <span>{t("joker.set", { n: view.set })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <button className="btn-ghost btn-sm" onClick={() => setSheet(true)}>
              {t("joker.sheet")}
            </button>
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {opponentsOrder(4, mySeat).map((s) => (
          <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s}>
            <span>
              {t("joker.bid")}: {view.bids[s] ?? "—"} · {t("joker.tricks")}: {view.tricks[s]}
            </span>
            <span>🂠 {view.handCounts[s]}</span>
            <span>Σ {view.totals[s]}</span>
            {view.dealer === s && <span className="text-gold">D</span>}
          </SeatTag>
        ))}
      </div>
      <div className="min-h-36 rounded-lg bg-black/15 flex flex-wrap items-center justify-center gap-3 p-3">
        {[0, 1, 2, 3].map((s) => {
          const p = trickBySeat.get(s);
          return p ? (
            <div key={s} className="flex flex-col items-center gap-1">
              <PlayingCard card={p.card} />
              <span className="text-[11px] text-text-2 max-w-20 truncate">{name(s)}</span>
              {p.joker && (
                <span className="text-[10px] text-gold">
                  {t(`joker.${p.joker.mode}`)} {p.joker.suit ? suitSymbol(p.joker.suit) : ""}
                </span>
              )}
            </div>
          ) : null;
        })}
        {view.trick.length === 0 && view.lastTrick && (
          <div className="text-xs text-muted text-center">
            {t("game.lastTrick")}: {name(view.lastTrick.winner)}
          </div>
        )}
      </div>
      {mySeat !== null && view.you && (
        <div className="grid gap-2">
          <SeatTag seat={mySeat} seats={seats} active={myTurn}>
            <span>
              {t("joker.bid")}: {view.bids[mySeat] ?? "—"} · {t("joker.tricks")}: {view.tricks[mySeat]}
            </span>
            <span>Σ {view.totals[mySeat]}</span>
            {view.dealer === mySeat && <span className="text-gold">D</span>}
          </SeatTag>
          {myTurn && view.phase === "trump" && (
            <div className="flex flex-wrap gap-2 items-center" role="group" aria-label={t("joker.chooseTrump")}>
              <span className="text-sm">{t("joker.chooseTrump")}:</span>
              {SUITS.map((s) => (
                <button key={s} className="btn-secondary btn-sm text-base" onClick={() => onAction({ type: "trump", suit: s })}>
                  {suitSymbol(s)}
                </button>
              ))}
              <button className="btn-ghost btn-sm" onClick={() => onAction({ type: "trump", suit: "none" })}>
                {t("game.noTrump")}
              </button>
            </div>
          )}
          {myTurn && view.phase === "bid" && (
            <div className="flex flex-wrap gap-2 items-center" role="group" aria-label={t("joker.chooseBid")}>
              <span className="text-sm">{t("joker.chooseBid")}</span>
              {Array.from({ length: view.cards + 1 }, (_, n) => n).map((n) => (
                <button key={n} className="btn-secondary btn-sm min-w-9" disabled={n === view.you!.forbiddenBid} onClick={() => onAction({ type: "bid", value: n })}>
                  {n}
                </button>
              ))}
              {view.you.forbiddenBid !== null && <span className="text-xs text-muted">{t("joker.forbidden", { n: view.you.forbiddenBid })}</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 justify-center pb-2" role="group" aria-label={t("game.yourHand")}>
            {view.you.hand.map((c) => (
              <PlayingCard key={c} card={c} playable={!myTurn || view.phase !== "play" || playable.has(c)} onClick={myTurn && view.phase === "play" && playable.has(c) ? () => play(c) : undefined} />
            ))}
          </div>
        </div>
      )}
      <Modal open={jokerCard !== null} onClose={() => setJokerCard(null)} title={leading ? t("joker.jokerLead") : t("joker.jokerFollow")}>
        <div className="grid gap-3">
          {(["high", "low"] as const).map((mode) => (
            <div key={mode} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-sm">{t(`joker.${mode}`)}</span>
              {leading ? (
                SUITS.map((s) => (
                  <button
                    key={s}
                    className="btn-secondary btn-sm text-base"
                    onClick={() => {
                      onAction({ type: "play", card: jokerCard, joker: { mode, suit: s } });
                      setJokerCard(null);
                    }}
                  >
                    {suitSymbol(s)}
                  </button>
                ))
              ) : (
                <button
                  className="btn-secondary btn-sm"
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
      <Modal open={sheet} onClose={() => setSheet(false)} title={t("joker.sheet")} wide>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="text-left p-1">#</th>
                {[0, 1, 2, 3].map((s) => (
                  <th key={s} className="text-right p-1">{name(s)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.history.map((h) => (
                <tr key={h.hand} className="table-row">
                  <td className="p-1 text-muted">
                    {h.hand} ({h.cards})
                  </td>
                  {[0, 1, 2, 3].map((s) => (
                    <td key={s} className={`p-1 text-right ${h.bids[s] === h.tricks[s] ? "text-primary" : h.scores[s]! < 0 ? "text-danger" : ""}`}>
                      {h.bids[s]}/{h.tricks[s]} · {h.scores[s]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-1">{t("joker.total")}</td>
                {view.totals.map((v, s) => (
                  <td key={s} className="p-1 text-right">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
