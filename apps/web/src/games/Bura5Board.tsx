import { useEffect, useRef, useState } from "react";
import { Award, Crown, Flame, Swords, Trophy } from "lucide-react";
import type { Bura5View } from "@croco/game-engine/games/bura5";
import { useT } from "../i18n";
import { sortHand } from "./cardOrder";
import { BuraTrick, CapturedPile, owedCards, rememberSelection, Stock, type BuraPos } from "./buraParts";
import { useSeatName, type BoardProps } from "./common";
import { GameHud, HudFact, TrumpFact } from "./ui/GameHud";
import { GameNotification, type TableNotice } from "./ui/GameNotification";
import { GameTable } from "./ui/GameTable";
import { seatRect, sweepTo } from "./ui/motion";
import { PlayerHand } from "./ui/PlayerHand";
import { PlayerSeat } from "./ui/PlayerSeat";
import { TRICK_SWEEP_MS, useTrickStage } from "./ui/useTrickStage";

const MAX_VALUE = 6;
type Play = NonNullable<Bura5View["trick"]>["plays"][number];

/** Five-card team Bura: partner opposite, opponents left and right, raises davi … shashi. */
export default function Bura5Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura5View>) {
  const t = useT();
  const name = useSeatName(seats);
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const responding = view.phase === "respond";
  const hand = sortHand(view.you?.hand ?? [], { order: "bura", trump: view.trump });
  const me = mySeat ?? 0;
  // Against a malutka a player who already played tops up to five: only the missing cards are chosen.
  const need = responding ? owedCards(view.trick, me, hand.length) : 0;
  const toppingUp = responding && (view.trick?.plays.some((p) => p.seat === me) ?? false);
  const selection = selected.filter((c) => hand.includes(c));
  const myTeam = me % 2;
  const raiseName = (v: number) => t(`bura.raises.${v}`);
  const teamName = (team: number) => (mySeat === null ? `${name(team)} + ${name(team + 2)}` : team === myTeam ? t("bura.us") : t("bura.them"));

  const sameSuit = selection.length > 0 && selection.every((c) => c[1] === selection[0]![1]);
  const minHand = Math.min(...view.players.map((p) => p.handCount));

  const key = (p: Play) => `${p.seat}:${p.faceUp?.join("") ?? p.count}`;
  const livePlays = (view.trick?.plays ?? []).map((p) => ({ ...p, card: key(p) }));
  const last = view.lastTrick ? { winner: view.lastTrick.winner, plays: view.lastTrick.plays.map((p) => ({ ...p, card: key(p) })) } : null;
  const { stage, plays, winner } = useTrickStage(livePlays, last);

  useEffect(() => {
    if (stage !== "collect" || winner === null) return;
    const els = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-trick-card]") ?? []);
    sweepTo(els, seatRect(boardRef.current, winner), TRICK_SWEEP_MS);
  }, [stage, winner]);

  const toggle = (c: string) => {
    setSelected((cur) => {
      const now = cur.filter((x) => hand.includes(x));
      if (now.includes(c)) return now.filter((x) => x !== c);
      if (view.phase === "lead") {
        if (now.length > 0 && now[0]![1] !== c[1]) return [c];
        if (now.length >= minHand) return [...now.slice(1), c];
        return [...now, c];
      }
      if (responding && need > 0 && now.length >= need) return [...now.slice(1), c];
      return [...now, c];
    });
  };

  const submit = (type: "lead" | "beat" | "discard") => {
    rememberSelection(boardRef.current, selection);
    onAction({ type, cards: selection });
    setSelected([]);
  };

  const lh = view.lastHand;
  const lastMessage = (() => {
    if (!lh) return null;
    if (lh.winnerTeam === null) return t("bura.draw");
    const team = teamName(lh.winnerTeam);
    if (lh.reason === "fold") return t("bura.folded", { name: name(lh.by!), team, n: lh.value });
    if (lh.reason === "bura") return `${t("bura.bura", { name: name(lh.by!) })} ${t("bura.teamWins", { team, n: lh.value })}`;
    return `${t("bura.points")} ${lh.points![lh.winnerTeam]} — ${t("bura.teamWins", { team, n: lh.value })}`;
  })();

  const freshDeal = view.players.every((p) => p.capturedCount === 0) && !view.trick;
  const handNotice: TableNotice | null = lh && lastMessage ? { id: `hand-${lh.handNumber}`, tone: "gold", icon: <Award size={15} />, text: lastMessage } : null;
  const trickNotice: TableNotice | null =
    stage === "won" && winner !== null ? { id: `trick-${plays.map((p) => p.card).join("|")}`, tone: winner % 2 === myTeam && mySeat !== null ? "win" : "info", icon: <Crown size={15} />, text: t("table.takesTrick", { name: name(winner) }) } : null;
  const notice = freshDeal || view.phase === "over" ? (handNotice ?? trickNotice) : (trickNotice ?? null);

  // Seats around the table, from my point of view: partner opposite.
  const west = (me + 1) % 4;
  const north = (me + 2) % 4;
  const east = (me + 3) % 4;
  const posOf = (s: number): BuraPos => (s === north ? "n" : s === west ? "w" : s === east ? "e" : "s");

  function renderSeat(s: number, layout: "row" | "column") {
    const p = view.players[s]!;
    const ours = s % 2 === myTeam && mySeat !== null;
    return (
      <PlayerSeat seat={s} seats={seats} active={view.toAct === s} deadline={deadline} you={s === mySeat} layout={layout} cards={s !== mySeat ? p.handCount : undefined}>
        {!(s === me && mySeat !== null) && (
          <span className="pseat-flag" data-tone={ours ? "team" : "info"}>
            {ours ? t("bura.partner") : t("bura.them")}
          </span>
        )}
        <CapturedPile count={p.capturedCount} label={t("bura.pile", { n: p.capturedCount })} />
      </PlayerSeat>
    );
  }

  const raise = view.raise;
  const youCanRaise = view.you?.canRaise ?? false;

  let centre;
  if (view.phase === "over") {
    const champTeam = view.scores[0] > view.scores[1] ? 0 : 1;
    centre = (
      <div className="pstage-wait" data-tone="gold">
        <Trophy size={16} /> {teamName(champTeam)}
      </div>
    );
  } else if (raise) {
    centre = (
      <div className="pstage-wait" data-tone="gold">
        <Swords size={15} /> {t("bura.raiseOffered", { name: name(raise.by), raise: raiseName(raise.to), n: raise.to })}
      </div>
    );
  } else if (freshDeal && lastMessage) {
    centre = (
      <div className="pstage-wait" data-tone="gold">
        <Award size={15} /> {lastMessage}
      </div>
    );
  } else if (view.toAct !== null) {
    centre = myTurn ? (
      <div className="pstage-wait" data-tone="teal">
        {t("table.yourMove")}
      </div>
    ) : (
      <div className="pstage-wait">{t("table.isPlaying", { name: name(view.toAct) })}</div>
    );
  }

  return (
    <div className="pboard" data-game="bura5" ref={boardRef}>
      <GameHud
        toAct={view.toAct}
        mySeat={mySeat}
        seats={seats}
        chips={
          <>
            <HudFact label={t("table.target", { n: view.targetPoints })} value={`${view.scores[myTeam]} : ${view.scores[1 - myTeam]}`} tone="gold" title={`${teamName(myTeam)} : ${teamName(1 - myTeam)}`} />
            <HudFact label={t("bura.value")} value={`×${view.value} · ${raiseName(view.value)}`} tone={view.value > 1 ? "warn" : undefined} />
            <TrumpFact suit={view.trump} />
          </>
        }
      />

      <GameTable shape="oval" label={t("games.bura5.name")} overlay={<GameNotification notice={notice} />}>
        <div className="pj-grid pbura5-grid">
          <div data-area="n">{renderSeat(north, "row")}</div>
          <div data-area="w">{renderSeat(west, "column")}</div>
          <div data-area="e">{renderSeat(east, "column")}</div>
          <div data-area="c" className="pbura-center" data-players="4">
            <Stock trumpCard={view.trumpCard} count={view.stockCount} />
            <div className="pbura-stage">
              {stage !== "idle" ? (
                <BuraTrick
                  plays={plays as Play[]}
                  bestSeat={stage === "live" ? (view.trick?.bestSeat ?? null) : winner}
                  stage={stage}
                  posOf={posOf}
                  labelOf={(s) => name(s)}
                  scope={boardRef}
                  animate={mounted}
                  layout="cross"
                />
              ) : (
                centre
              )}
            </div>
            <div className="pbura-teams" aria-label={t("table.teamScore")}>
              <span className="pj-plaque-label">{t("table.teamScore")}</span>
              <div className="pbura-team" data-ours="true">
                <span>{teamName(myTeam)}</span>
                <b>{view.scores[myTeam]}</b>
              </div>
              <div className="pbura-team">
                <span>{teamName(1 - myTeam)}</span>
                <b>{view.scores[1 - myTeam]}</b>
              </div>
            </div>
          </div>
          <div data-area="s">{renderSeat(me, "row")}</div>
        </div>
      </GameTable>

      {mySeat !== null && view.you && (
        <div className="pdock">
          {myTurn && view.phase === "raise" && raise && (
            <div className="pactions" role="group" aria-label={t("bura.raiseOffered", { name: name(raise.by), raise: raiseName(raise.to), n: raise.to })}>
              <span className="pactions-hint">{t("bura.raiseOffered", { name: name(raise.by), raise: raiseName(raise.to), n: raise.to })}</span>
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
            <div className="pactions" role="group" aria-label={t("table.selectHint")}>
              {view.phase === "lead" && (
                <>
                  <span className="pactions-hint">
                    {t("bura.select")}
                    {selection.length > 0 && sameSuit ? ` · ${t("ui.selectedCount", { n: selection.length })}` : ""}
                  </span>
                  <button className="btn-primary btn-lg px-8" disabled={!sameSuit || selection.length > minHand} onClick={() => submit("lead")}>
                    <Swords size={16} /> {t("bura.lead")}
                  </button>
                </>
              )}
              {responding && (
                <>
                  <span className="pactions-hint">
                    {toppingUp ? t("bura.topUp", { n: need, total: view.trick?.count ?? need }) : t("bura.selectRespond", { n: need })} ({t("ui.selectedCount", { n: selection.length })})
                  </span>
                  <button className="btn-primary btn-lg px-7" disabled={selection.length !== need} onClick={() => submit("beat")}>
                    {t("bura.beat")}
                  </button>
                  <button className="btn-secondary btn-lg px-6" disabled={selection.length !== need} onClick={() => submit("discard")}>
                    {t("bura.discard")}
                  </button>
                  {view.you.malutka && (
                    <button
                      className="btn-gold btn-lg px-6"
                      onClick={() => {
                        rememberSelection(boardRef.current, view.you!.malutka!);
                        onAction({ type: "malutka", cards: view.you!.malutka });
                      }}
                    >
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

          <PlayerHand
            label={t("game.yourHand")}
            mode="select"
            dealKey={view.handNumber}
            active={myTurn && view.phase !== "raise"}
            onPick={toggle}
            cards={hand.map((c) => ({ card: c, selected: selection.includes(c) }))}
          />
        </div>
      )}
    </div>
  );
}
