import { useEffect, useState } from "react";
import type { PokerView } from "@croco/game-engine/games/poker";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

export default function PokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<PokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const you = view.you;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const [amount, setAmount] = useState(you?.raise?.min ?? 0);
  useEffect(() => {
    if (you?.raise) setAmount(you.raise.min);
  }, [you?.raise?.min, you?.raise]);

  const me = mySeat !== null ? view.players[mySeat] : undefined;
  const clamp = (v: number) => (you?.raise ? Math.max(you.raise.min, Math.min(you.raise.max, Math.round(v))) : v);
  const last = view.lastHand;

  return (
    <div className="felt rounded-xl p-3 sm:p-4 grid gap-3">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span>{t("poker.handOf", { n: view.handNumber, max: view.maxHands })}</span>
            <span>{t("poker.blinds", { sb: view.blinds.small, bb: view.blinds.big })}</span>
            <span className="uppercase">{view.structure.replace("_", " ")}</span>
          </>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {opponentsOrder(view.players.length, mySeat).map((s) => {
          const p = view.players[s]!;
          const shown = last?.revealed[s];
          return (
            <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s}>
              <span className="text-white tabular-nums">{p.chips}</span>
              {p.street > 0 && <span className="text-gold">→ {p.street}</span>}
              {p.folded && !p.busted && <span>{t("poker.fold")}</span>}
              {p.allIn && <span className="text-danger">{t("poker.allin")}</span>}
              {p.busted && <span>{t("poker.busted")}</span>}
              {view.dealer === s && <span className="text-gold">D</span>}
              {!p.folded && !p.busted && !shown && <span>🂠×{p.holeCount}</span>}
            </SeatTag>
          );
        })}
      </div>
      <div className="rounded-lg bg-black/15 p-3 grid gap-2 justify-items-center">
        <div className="flex gap-1.5 min-h-[4.6rem]">
          {view.board.map((c) => (
            <PlayingCard key={c} card={c} />
          ))}
          {Array.from({ length: 5 - view.board.length }, (_, i) => (
            <span key={i} className="pcard opacity-20 bg-transparent border-dashed" />
          ))}
        </div>
        <div className="text-sm">
          {t("poker.pot")}: <span className="font-bold text-gold tabular-nums">{view.pot}</span>
        </div>
        {last && last.awards.length > 0 && (
          <div className="text-xs text-text-2 text-center grid gap-1">
            {last.awards.map((a, i) => (
              <span key={i}>
                {t("poker.won", { name: name(a.seat), amount: a.amount })}
                {a.side === "low" ? ` (${t("poker.low")})` : ""}
                {a.category ? ` · ${a.category.replace("_", " ")}` : ""}
              </span>
            ))}
            {Object.keys(last.revealed).length > 0 && (
              <div className="flex flex-wrap gap-3 justify-center mt-1">
                {Object.entries(last.revealed).map(([seat, cards]) => (
                  <span key={seat} className="flex items-center gap-1">
                    <span className="text-muted">{name(Number(seat))}:</span>
                    {cards.map((c) => (
                      <PlayingCard key={c} card={c} small />
                    ))}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {me && you && (
        <div className="grid gap-2">
          <SeatTag seat={mySeat!} seats={seats} active={myTurn}>
            <span className="text-white tabular-nums">{me.chips}</span>
            {me.street > 0 && <span className="text-gold">→ {me.street}</span>}
            {view.dealer === mySeat && <span className="text-gold">D</span>}
          </SeatTag>
          <div className="flex gap-1.5 justify-center">
            {you.hole.map((c) => (
              <PlayingCard key={c} card={c} />
            ))}
          </div>
          {myTurn && (
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2 justify-center">
                <button className="btn-danger" onClick={() => onAction({ type: "fold" })}>
                  {t("poker.fold")}
                </button>
                {you.canCheck ? (
                  <button className="btn-secondary" onClick={() => onAction({ type: "check" })}>
                    {t("poker.check")}
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={() => onAction({ type: "call" })}>
                    {t("poker.call", { n: you.toCall })}
                  </button>
                )}
                {you.raise && (
                  <button className="btn-primary" onClick={() => onAction({ type: "raise", to: clamp(amount) })}>
                    {view.currentBet === 0 ? t("poker.bet") : t("poker.raise")} {clamp(amount)}
                  </button>
                )}
                {view.structure === "no_limit" && me.chips > 0 && (
                  <button className="btn-ghost" onClick={() => onAction({ type: "allin" })}>
                    {t("poker.allin")}
                  </button>
                )}
              </div>
              {you.raise && you.raise.max > you.raise.min && (
                <div className="flex flex-wrap items-center gap-2 justify-center">
                  <input
                    type="range"
                    min={you.raise.min}
                    max={you.raise.max}
                    value={clamp(amount)}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-56 accent-[var(--color-primary)]"
                    aria-label={t("poker.raise")}
                  />
                  {[0.5, 1].map((f) => (
                    <button key={f} className="btn-ghost btn-sm" onClick={() => setAmount(clamp(view.currentBet + view.pot * f))}>
                      {f === 1 ? t("poker.pot") : "½"}
                    </button>
                  ))}
                  <input type="number" className="input w-24 h-8" value={clamp(amount)} min={you.raise.min} max={you.raise.max} onChange={(e) => setAmount(Number(e.target.value))} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
