import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { Bura5View } from "@croco/game-engine/games/bura5";
import { useT } from "../i18n";
import { CardHand } from "./cards";
import { sortHand } from "./cardOrder";
import { BuraTrick, CapturedPile, Meter, Stock } from "./buraParts";
import { GameTable, HudChip, MiniCardCount, opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** Five-card Bura on a petrol-teal felt, played to the last card, with penalty meters. */
export default function Bura5Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura5View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const maxLead = view.maxLead;
  const responding = view.phase === "respond";
  const need = responding ? (view.trick?.count ?? 0) : 0;
  const hand = sortHand(view.you?.hand ?? [], { order: "bura", trump: view.trump });

  const sameSuit = selected.length > 0 && selected.every((c) => c[1] === selected[0]![1]);

  const toggle = (c: string) => {
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (view.phase === "lead") {
        if (cur.length > 0 && cur[0]![1] !== c[1]) return [c];
        if (cur.length >= maxLead) return [...cur.slice(1), c];
        return [...cur, c];
      }
      if (responding && need > 0 && cur.length >= need) return [...cur.slice(1), c];
      return [...cur, c];
    });
  };

  const submit = (type: string) => {
    onAction({ type, cards: selected });
    setSelected([]);
  };

  const players = view.players.length;
  const lastMessage = useMemo(() => {
    if (!view.lastHand) return null;
    return `${t("bura.points")}: ${view.lastHand.points.map((p, i) => `${name(i)} ${p}`).join(" · ")}`;
  }, [view.lastHand, t, name]);

  const tone = (penalties: number) => {
    const ratio = penalties / Math.max(1, view.penaltyLimit);
    return ratio >= 0.75 ? "danger" : ratio >= 0.45 ? "warn" : "brand";
  };
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
            <HudChip tone="danger">{t("bura.limit", { n: view.penaltyLimit })}</HudChip>
          </>
        }
      />

      {lastMessage && (
        <div className="notice fade-in">
          <BarChart3 size={15} /> {lastMessage}
        </div>
      )}

      <GameTable rail="oak" felt="bura5" print={t("games.bura5.name")}>
        <div className="table-col">
          <div className="opp-row">
            {opponentsOrder(players, mySeat)
              .filter((s) => s !== meSeat || mySeat === null)
              .map((s) => {
                const pen = view.penalties[s] ?? 0;
                return (
                  <div key={s} className="opp-unit">
                    <SeatTag seat={s} seats={seats} active={view.toAct === s} compact>
                      <MiniCardCount count={view.players[s]!.handCount} />
                      <Meter value={pen} max={view.penaltyLimit} tone={tone(pen)} label={`${t("bura.penalties")}: ${pen}/${view.penaltyLimit}`} />
                    </SeatTag>
                    <CapturedPile count={view.players[s]!.capturedCount} />
                  </div>
                );
              })}
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
                <Meter
                  value={view.penalties[mySeat] ?? 0}
                  max={view.penaltyLimit}
                  tone={tone(view.penalties[mySeat] ?? 0)}
                  label={`${t("bura.penalties")}: ${view.penalties[mySeat] ?? 0}/${view.penaltyLimit}`}
                />
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
                    {selected.length > 0 && sameSuit ? ` · ${t("ui.selectedCount", { n: selected.length })} / ${maxLead}` : ""}
                  </span>
                  <button className="btn-primary btn-lg px-8" disabled={!sameSuit || selected.length > maxLead} onClick={() => submit("lead")}>
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
            </div>
          )}

          <CardHand
            label={t("game.yourHand")}
            size="md"
            spread="loose"
            cards={hand.map((c) => ({ card: c, selected: selected.includes(c), onClick: myTurn ? () => toggle(c) : undefined }))}
          />
        </div>
      )}
    </div>
  );
}
