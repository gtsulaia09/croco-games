import { useMemo, useState } from "react";
import { Award, Flame } from "lucide-react";
import type { Bura3View } from "@croco/game-engine/games/bura3";
import { useT } from "../i18n";
import { CardHand } from "./cards";
import { sortHand } from "./cardOrder";
import { BuraTrick, CapturedPile, Meter, Stock } from "./buraParts";
import { GameTable, HudChip, MiniCardCount, opponentsOrder, SeatStat, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** Three-card Bura on a wine-red felt: deck with turned trump, open answers, 31-point gauge. */
export default function Bura3Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura3View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const responding = view.phase === "respond";
  const need = responding ? (view.trick?.count ?? 0) : 0;
  const hand = sortHand(view.you?.hand ?? [], { order: "bura", trump: view.trump });

  const sameSuit = selected.length > 0 && selected.every((c) => c[1] === selected[0]![1]);

  const toggle = (c: string) => {
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (view.phase === "lead" && cur.length > 0 && cur[0]![1] !== c[1]) return [c];
      if (responding && need > 0 && cur.length >= need) return [...cur.slice(1), c];
      return [...cur, c];
    });
  };

  const submit = (type: string) => {
    onAction({ type, cards: selected });
    setSelected([]);
  };

  const players = view.players.length;
  const knownPts = view.you?.knownPoints ?? null;

  const lastMessage = useMemo(() => {
    if (!view.lastHand) return null;
    const lh = view.lastHand;
    if (lh.reason === "bura") return t("bura.bura", { name: name(lh.winner!) });
    if (lh.reason === "var") return t("bura.claimTrue", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 });
    if (lh.reason === "false_var") return t("bura.claimFalse", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 });
    if (lh.reason === "points" && lh.winner !== null) return t("bura.wonOnPoints", { name: name(lh.winner), points: lh.points[lh.winner] ?? 0 });
    return t("bura.draw");
  }, [view.lastHand, t, name]);

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
            <HudChip>{t("game.hand", { n: view.handNumber })}</HudChip>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <HudChip>{t("game.stock", { n: view.stockCount })}</HudChip>
            <HudChip tone="gold">{t("bura.target", { n: view.targetPoints })}</HudChip>
          </>
        }
      />

      {lastMessage && (
        <div className="notice fade-in">
          <Award size={15} /> {lastMessage}
        </div>
      )}

      <GameTable rail="mahogany" felt="bura3" print={t("games.bura3.name")}>
        <div className="table-col">
          <div className="opp-row">
            {opponentsOrder(players, mySeat)
              .filter((s) => s !== meSeat || mySeat === null)
              .map((s) => (
                <div key={s} className="opp-unit">
                  <SeatTag seat={s} seats={seats} active={view.toAct === s} compact>
                    <MiniCardCount count={view.players[s]!.handCount} />
                    <SeatStat value={`${view.scores[s]}/${view.targetPoints}`} tone="gold" />
                  </SeatTag>
                  <CapturedPile count={view.players[s]!.capturedCount} />
                </div>
              ))}
          </div>

          <div className="bura-mid">
            <Stock trumpCard={view.trumpCard} count={view.stockCount} />
            <div className="grid place-items-center">
              {view.trick?.plays.length ? (
                <BuraTrick plays={view.trick.plays} bestSeat={view.trick.bestSeat} mySeat={mySeat} name={name} />
              ) : (
                <span className="felt-label !normal-case !tracking-normal text-center">{t("bura.cardValues")}</span>
              )}
            </div>
          </div>

          {mySeat !== null && (
            <div className="opp-unit">
              <SeatTag seat={mySeat} seats={seats} active={myTurn} compact>
                <SeatStat value={`${view.scores[mySeat]}/${view.targetPoints}`} tone="gold" />
                {knownPts !== null && (
                  <Meter value={knownPts} max={31} tone={knownPts >= 31 ? "gold" : "brand"} label={`${t("ui.toward31")} · ${t("bura.knownPoints", { n: knownPts })}`} />
                )}
              </SeatTag>
              <CapturedPile count={view.players[mySeat]!.capturedCount} />
            </div>
          )}
        </div>
      </GameTable>

      {mySeat !== null && view.you && (
        <div className="dock">
          {myTurn && (
            <div className="action-bar fade-in">
              {view.phase === "lead" && (
                <>
                  <span className="action-hint w-full text-center">
                    {t("bura.select")}
                    {selected.length > 0 && sameSuit ? ` · ${t("ui.selectedCount", { n: selected.length })}` : ""}
                  </span>
                  <button className="btn-primary btn-lg px-8" disabled={!sameSuit || selected.length > 3} onClick={() => submit("lead")}>
                    {t("bura.lead")}
                  </button>
                </>
              )}
              {responding && (
                <>
                  <span className="action-hint w-full text-center">
                    {t("bura.selectRespond", { n: need })} ({t("ui.selectedCount", { n: selected.length })})
                  </span>
                  <button className="btn-primary btn-lg px-7" disabled={selected.length !== need} onClick={() => submit("beat")}>
                    {t("bura.beat")}
                  </button>
                  <button className="btn-secondary btn-lg px-6" disabled={selected.length !== need} onClick={() => submit("discard")}>
                    {t("bura.discard")}
                  </button>
                </>
              )}
              {view.phase === "var" && (
                <>
                  <span className="action-hint w-full text-center">{t("bura.varHint")}</span>
                  <button className="btn-gold btn-lg px-7" onClick={() => onAction({ type: "claim" })}>
                    <Flame size={16} /> {t("bura.claim")}
                  </button>
                  <button className="btn-primary btn-lg px-7" onClick={() => onAction({ type: "continue" })}>
                    {t("bura.continue")}
                  </button>
                </>
              )}
            </div>
          )}

          <CardHand
            label={t("game.yourHand")}
            size="lg"
            spread="loose"
            cards={hand.map((c) => ({ card: c, selected: selected.includes(c), onClick: myTurn && view.phase !== "var" ? () => toggle(c) : undefined }))}
          />
        </div>
      )}
    </div>
  );
}
