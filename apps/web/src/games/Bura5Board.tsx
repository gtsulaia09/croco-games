import { useState } from "react";
import { Award, Flame, Swords } from "lucide-react";
import type { Bura5View } from "@croco/game-engine/games/bura5";
import { useT } from "../i18n";
import { CardHand } from "./cards";
import { sortHand } from "./cardOrder";
import { BuraTrick, Stock } from "./buraParts";
import { GameTable, HudChip, MiniCardCount, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

const MAX_VALUE = 6;

/** Five-card team Bura: partner opposite, opponents left and right, raises davi … shashi. */
export default function Bura5Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura5View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const responding = view.phase === "respond";
  const need = responding ? (view.trick?.count ?? 0) : 0;
  const hand = sortHand(view.you?.hand ?? [], { order: "bura", trump: view.trump });
  const me = mySeat ?? 0;
  const myTeam = me % 2;
  const raiseName = (v: number) => t(`bura.raises.${v}`);
  const teamName = (team: number) => (mySeat === null ? `${name(team)} + ${name(team + 2)}` : team === myTeam ? t("bura.us") : t("bura.them"));

  const sameSuit = selected.length > 0 && selected.every((c) => c[1] === selected[0]![1]);
  const minHand = Math.min(...view.players.map((p) => p.handCount));

  const toggle = (c: string) => {
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (view.phase === "lead") {
        if (cur.length > 0 && cur[0]![1] !== c[1]) return [c];
        if (cur.length >= minHand) return [...cur.slice(1), c];
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

  const lastMessage = (() => {
    const lh = view.lastHand;
    if (!lh) return null;
    if (lh.winnerTeam === null) return t("bura.draw");
    const team = teamName(lh.winnerTeam);
    if (lh.reason === "fold") return t("bura.folded", { name: name(lh.by!), team, n: lh.value });
    if (lh.reason === "bura") return `${t("bura.bura", { name: name(lh.by!) })} ${t("bura.teamWins", { team, n: lh.value })}`;
    return `${t("bura.points")} ${lh.points![lh.winnerTeam]} — ${t("bura.teamWins", { team, n: lh.value })}`;
  })();

  // Seats around the table, from my point of view: partner opposite.
  const west = (me + 1) % 4;
  const north = (me + 2) % 4;
  const east = (me + 3) % 4;

  function renderSeat(s: number, compact = true) {
    const p = view.players[s]!;
    const ours = s % 2 === myTeam && mySeat !== null;
    return (
      <SeatTag seat={s} seats={seats} active={view.toAct === s} compact={compact}>
        {!(s === me && mySeat !== null) && (
          <span className="seat-flag" data-tone={ours ? undefined : "info"} style={ours ? { background: "rgba(226,194,122,0.18)", color: "#e2c27a" } : undefined}>
            {ours ? t("bura.partner") : t("bura.them")}
          </span>
        )}
        {s !== mySeat && <MiniCardCount count={p.handCount} />}
        {p.capturedCount > 0 && <span className="seat-stat">{t("bura.pile", { n: p.capturedCount })}</span>}
      </SeatTag>
    );
  }

  const raise = view.raise;
  const youCanRaise = view.you?.canRaise ?? false;

  return (
    <div className="board">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <HudChip tone="gold">
              {teamName(0)} {view.scores[0]} : {view.scores[1]} {teamName(1)}
            </HudChip>
            <HudChip tone={view.value > 1 ? "danger" : undefined}>
              {t("bura.value")}: ×{view.value} · {raiseName(view.value)}
            </HudChip>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <HudChip>{t("bura.target", { n: view.targetPoints })}</HudChip>
          </>
        }
      />

      {lastMessage && (
        <div className="notice fade-in">
          <Award size={15} /> {lastMessage}
        </div>
      )}

      <GameTable rail="oak" felt="bura5" print={t("games.bura5.name")}>
        <div className="seat-ring">
          <div data-area="n">{renderSeat(north)}</div>
          <div data-area="w">{renderSeat(west)}</div>
          <div data-area="e">{renderSeat(east)}</div>
          <div data-area="c" className="w-full">
            <div className="bura-mid">
              <Stock trumpCard={view.trumpCard} count={view.stockCount} />
              <div className="grid place-items-center gap-2">
                {raise && (
                  <span className="amount-tag !h-auto py-1" data-tone="pot">
                    <Swords size={14} /> {t("bura.raiseOffered", { name: name(raise.by), raise: raiseName(raise.to), n: raise.to })}
                  </span>
                )}
                {view.trick?.plays.length ? (
                  <BuraTrick plays={view.trick.plays} bestSeat={view.trick.bestSeat} mySeat={mySeat} name={name} />
                ) : (
                  !raise && <span className="felt-label !normal-case !tracking-normal text-center">{t("bura.cardValues")}</span>
                )}
              </div>
            </div>
          </div>
          <div data-area="s">{renderSeat(me, false)}</div>
        </div>
      </GameTable>

      {mySeat !== null && view.you && (
        <div className="dock">
          {myTurn && view.phase === "raise" && raise && (
            <div className="action-bar fade-in">
              <span className="action-title w-full text-center">{t("bura.raiseOffered", { name: name(raise.by), raise: raiseName(raise.to), n: raise.to })}</span>
              <button className="btn-primary btn-lg px-7" onClick={() => onAction({ type: "accept" })}>
                {t("bura.accept")}
              </button>
              {raise.to < MAX_VALUE && (
                <button className="btn-gold btn-lg px-6" onClick={() => onAction({ type: "raise" })}>
                  {t("bura.reraise", { raise: raiseName(raise.to + 1), n: raise.to + 1 })}
                </button>
              )}
              <button className="btn-danger btn-lg px-6" onClick={() => onAction({ type: "fold" })}>
                {t("bura.fold")}
              </button>
            </div>
          )}

          {myTurn && view.phase !== "raise" && (
            <div className="action-bar fade-in">
              {view.phase === "lead" && (
                <>
                  <span className="action-hint w-full text-center">
                    {t("bura.select")}
                    {selected.length > 0 && sameSuit ? ` · ${t("ui.selectedCount", { n: selected.length })}` : ""}
                  </span>
                  <button className="btn-primary btn-lg px-8" disabled={!sameSuit || selected.length > minHand} onClick={() => submit("lead")}>
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
                  {view.you.malutka && (
                    <button className="btn-gold btn-lg px-6" onClick={() => onAction({ type: "malutka", cards: view.you!.malutka })}>
                      {t("bura.malutka")}
                    </button>
                  )}
                </>
              )}
              {view.you.canBura && (
                <button className="btn-gold btn-lg px-6" onClick={() => onAction({ type: "bura" })}>
                  <Flame size={16} /> {t("bura.showBura")}
                </button>
              )}
              {youCanRaise && (
                <button className="btn-secondary btn-lg px-6" onClick={() => onAction({ type: "raise" })}>
                  {t("bura.raiseTo", { raise: raiseName(view.value + 1), n: view.value + 1 })}
                </button>
              )}
            </div>
          )}

          <CardHand
            label={t("game.yourHand")}
            size="md"
            spread="loose"
            cards={hand.map((c) => ({ card: c, selected: selected.includes(c), onClick: myTurn && view.phase !== "raise" ? () => toggle(c) : undefined }))}
          />
        </div>
      )}
    </div>
  );
}
