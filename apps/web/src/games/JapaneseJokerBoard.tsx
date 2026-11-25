import { useState } from "react";
import type { JapaneseJokerView } from "@croco/game-engine/games/japanese_joker";
import { useT } from "../i18n";
import { cardLabel, Modal, PlayingCard, suitSymbol } from "../components/ui";
import { SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

const SUITS = ["S", "H", "D", "C"] as const;

function TableRow({ piles, onPlay, playable, label }: { piles: JapaneseJokerView["table"][number]; onPlay?: (card: string) => void; playable: Set<string>; label: string }) {
  return (
    <div className="flex gap-2 justify-center" role="group" aria-label={label}>
      {piles.map((p, i) => (
        <div key={i} className="relative w-[3.25rem] h-[4.55rem]">
          {p.hasDown && <span className="absolute inset-0 translate-x-1 translate-y-1">
            <PlayingCard back />
          </span>}
          {p.up && (
            <span className="absolute inset-0">
              <PlayingCard card={p.up} playable={!onPlay || playable.has(p.up)} onClick={onPlay && playable.has(p.up) ? () => onPlay(p.up!) : undefined} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function JapaneseJokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<JapaneseJokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const [joker, setJoker] = useState<string | null>(null);
  const me = mySeat ?? 0;
  const opp = 1 - me;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const playable = new Set(view.you?.playable ?? []);
  const leading = view.trick.length === 0;

  function play(card: string) {
    if (card.startsWith("X") && leading) setJoker(card);
    else onAction({ type: "play", card });
  }

  const oppUp = view.table[opp]?.map((p) => p.up).filter((c): c is string => Boolean(c) && !c!.startsWith("X")) ?? [];
  return (
    <div className="felt rounded-xl p-3 sm:p-4 grid gap-3">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span>{t("game.round", { n: view.round })}</span>
            {view.trumpChosen && <TrumpBadge suit={view.trump} />}
            <span>
              {view.scores[0]} – {view.scores[1]} / {view.targetPoints}
            </span>
          </>
        }
      />
      <SeatTag seat={opp} seats={seats} active={view.toAct === opp}>
        <span>🂠 {view.handCounts[opp]}</span>
        <span>
          {t("jj.cardsWon")}: {view.won[opp]}
        </span>
        <span>Σ {view.scores[opp]}</span>
      </SeatTag>
      {view.phase !== "trump" && <TableRow piles={view.table[opp] ?? []} playable={new Set()} label={`${t("jj.table")}: ${name(opp)}`} />}
      <div className="min-h-28 rounded-lg bg-black/15 flex items-center justify-center gap-4 p-3">
        {view.trick.map((p) => (
          <div key={p.seat} className="flex flex-col items-center gap-1">
            <PlayingCard card={p.card} />
            <span className="text-[11px] text-text-2">{name(p.seat)}</span>
            {p.demand && (
              <span className="text-[10px] text-gold">
                {p.demand.kind === "card" ? t("jj.demandCard", { card: cardLabel(p.demand.card) }) : t("jj.demandHighest", { suit: suitSymbol(p.demand.suit) })}
              </span>
            )}
          </div>
        ))}
        {view.trick.length === 0 && view.lastRound && (
          <span className="text-xs text-gold">
            {name(0)} {view.lastRound.won[0]} – {view.lastRound.won[1]} {name(1)}
          </span>
        )}
      </div>
      {view.phase !== "trump" && <TableRow piles={view.table[me] ?? []} playable={myTurn ? playable : new Set()} onPlay={myTurn ? play : undefined} label={t("jj.myTable")} />}
      {mySeat !== null && view.you && (
        <div className="grid gap-2">
          <SeatTag seat={me} seats={seats} active={myTurn}>
            <span>
              {t("jj.cardsWon")}: {view.won[me]}
            </span>
            <span>Σ {view.scores[me]}</span>
          </SeatTag>
          {myTurn && view.phase === "trump" && (
            <div className="flex flex-wrap gap-2 items-center justify-center" role="group" aria-label={t("joker.chooseTrump")}>
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
          <div className="flex flex-wrap gap-1.5 justify-center" role="group" aria-label={t("game.yourHand")}>
            {view.you.hand.map((c) => (
              <PlayingCard key={c} card={c} playable={!myTurn || view.phase !== "play" || playable.has(c)} onClick={myTurn && view.phase === "play" && playable.has(c) ? () => play(c) : undefined} />
            ))}
          </div>
        </div>
      )}
      <Modal open={joker !== null} onClose={() => setJoker(null)} title={t("jj.demand")}>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {oppUp.map((c) => (
              <button
                key={c}
                className="btn-secondary btn-sm"
                onClick={() => {
                  onAction({ type: "play", card: joker, demand: { kind: "card", card: c } });
                  setJoker(null);
                }}
              >
                {t("jj.demandCard", { card: cardLabel(c) })}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SUITS.map((s) => (
              <button
                key={s}
                className="btn-ghost btn-sm"
                onClick={() => {
                  onAction({ type: "play", card: joker, demand: { kind: "highest", suit: s } });
                  setJoker(null);
                }}
              >
                {t("jj.demandHighest", { suit: suitSymbol(s) })}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
