import { useMemo, useState } from "react";
import type { Bura3View } from "@croco/game-engine/games/bura3";
import type { Bura5View } from "@croco/game-engine/games/bura5";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

type View = Bura3View | Bura5View;
const isThree = (v: View): v is Bura3View => "scores" in v;

export default function BuraBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const three = isThree(view);
  const maxLead = three ? 3 : view.maxLead;
  const responding = view.phase === "respond";
  const need = responding ? (view.trick?.count ?? 0) : 0;
  const hand = view.you?.hand ?? [];

  const sameSuit = selected.length > 0 && selected.every((c) => c[1] === selected[0]![1]);
  const toggle = (c: string) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const submit = (type: string) => {
    onAction({ type, cards: selected });
    setSelected([]);
  };

  const players = view.players.length;
  const score = (s: number) => (three ? `${view.scores[s]}/${view.targetPoints}` : `${(view as Bura5View).penalties[s]}/${(view as Bura5View).penaltyLimit}`);
  const lastMessage = useMemo(() => {
    if (!view.lastHand) return null;
    if (three) {
      const lh = (view as Bura3View).lastHand!;
      if (lh.reason === "bura" || lh.reason === "three_aces") return t("bura.bura", { name: name(lh.winner!) });
      if (lh.reason === "claim") return t("bura.claimTrue", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 });
      if (lh.reason === "false_claim") return t("bura.claimFalse", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 });
      return t("bura.draw");
    }
    const lh = (view as Bura5View).lastHand!;
    return `${t("bura.points")}: ${lh.points.map((p, i) => `${name(i)} ${p}`).join(" · ")}`;
  }, [view, three, t, name]);

  return (
    <div className="felt rounded-xl p-3 sm:p-4 grid gap-3">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span>{t("game.hand", { n: view.handNumber })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <span>{t("game.stock", { n: view.stockCount })}</span>
            <span>{three ? t("bura.target", { n: (view as Bura3View).targetPoints }) : t("bura.limit", { n: (view as Bura5View).penaltyLimit })}</span>
          </>
        }
      />
      {lastMessage && <p className="text-xs text-gold text-center">{lastMessage}</p>}
      <div className="flex flex-wrap gap-2 justify-center">
        {opponentsOrder(players, mySeat).map((s) => (
          <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s}>
            <span>🂠 {view.players[s]!.handCount}</span>
            <span>{t("bura.pile", { n: view.players[s]!.capturedCount })}</span>
            <span>
              {three ? t("bura.points") : t("bura.penalties")}: {score(s)}
            </span>
          </SeatTag>
        ))}
      </div>
      <div className="flex items-center justify-center gap-6 min-h-32 rounded-lg bg-black/15 p-3">
        <div className="flex flex-col items-center gap-1">
          <PlayingCard card={view.trumpCard} small />
          <span className="text-[10px] text-muted">{t("game.stock", { n: view.stockCount })}</span>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
          {view.trick?.plays.map((p) => (
            <div key={p.seat} className="flex flex-col items-center gap-1">
              <div className="flex gap-1">
                {p.faceUp ? p.faceUp.map((c) => <PlayingCard key={c} card={c} small />) : Array.from({ length: p.count }, (_, i) => <PlayingCard key={i} back small />)}
              </div>
              <span className={`text-[11px] ${view.trick!.bestSeat === p.seat ? "text-primary font-semibold" : "text-text-2"}`}>{name(p.seat)}</span>
            </div>
          ))}
        </div>
      </div>
      {mySeat !== null && view.you && (
        <div className="grid gap-2">
          <SeatTag seat={mySeat} seats={seats} active={myTurn}>
            <span>{t("bura.pile", { n: view.players[mySeat]!.capturedCount })}</span>
            <span>
              {three ? t("bura.points") : t("bura.penalties")}: {score(mySeat)}
            </span>
            {three && (view as Bura3View).you?.knownPoints !== null && <span>{t("bura.knownPoints", { n: (view as Bura3View).you!.knownPoints ?? 0 })}</span>}
          </SeatTag>
          <div className="flex flex-wrap gap-1.5 justify-center" role="group" aria-label={t("game.yourHand")}>
            {hand.map((c) => (
              <PlayingCard key={c} card={c} selected={selected.includes(c)} onClick={myTurn ? () => toggle(c) : undefined} />
            ))}
          </div>
          {myTurn && (
            <div className="flex flex-wrap gap-2 justify-center items-center">
              {view.phase === "lead" && (
                <>
                  <span className="text-xs text-muted w-full text-center">{t("bura.select")}</span>
                  <button className="btn-primary" disabled={!sameSuit || selected.length > maxLead} onClick={() => submit("lead")}>
                    {t("bura.lead")}
                  </button>
                </>
              )}
              {responding && (
                <>
                  <span className="text-xs text-muted w-full text-center">{t("bura.selectRespond", { n: need })}</span>
                  <button className="btn-primary" disabled={selected.length !== need} onClick={() => submit("beat")}>
                    {t("bura.beat")}
                  </button>
                  <button className="btn-secondary" disabled={selected.length !== need} onClick={() => submit("discard")}>
                    {t("bura.discard")}
                  </button>
                </>
              )}
              {three && (view.phase === "lead" || view.phase === "final") && (view.players[mySeat]?.tricksWon ?? 0) > 0 && (
                <button className="btn-secondary" onClick={() => onAction({ type: "claim" })}>
                  {t("bura.claim")}
                </button>
              )}
              {three && view.phase === "final" && (
                <button className="btn-ghost" onClick={() => onAction({ type: "pass" })}>
                  {t("bura.pass")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
