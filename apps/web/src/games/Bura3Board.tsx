import { useEffect, useRef, useState } from "react";
import { Award, Crown, Flame, Swords, Trophy } from "lucide-react";
import type { Bura3View } from "@croco/game-engine/games/bura3";
import { useT } from "../i18n";
import { sortHand } from "./cardOrder";
import { BuraTrick, CapturedPile, Meter, OpponentHand, owedCards, rememberSelection, Stock } from "./buraParts";
import { useSeatName, type BoardProps } from "./common";
import { GameHud, HudFact, TrumpFact } from "./ui/GameHud";
import { GameNotification, type TableNotice } from "./ui/GameNotification";
import { GameTable } from "./ui/GameTable";
import { seatRect, sweepTo } from "./ui/motion";
import { PlayerHand } from "./ui/PlayerHand";
import { PlayerSeat, SeatNumber } from "./ui/PlayerSeat";
import { TRICK_SWEEP_MS, useTrickStage } from "./ui/useTrickStage";

type Play = NonNullable<Bura3View["trick"]>["plays"][number];

const MAX_VALUE = 6;

/**
 * Three-card Bura, one against one: deck with the turned trump, open answers, var at 31, raises
 * davi … shashi and the three-card malutka of any suit.
 */
export default function Bura3Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura3View>) {
  const t = useT();
  const name = useSeatName(seats);
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const me = mySeat ?? 0;
  const opp = 1 - me;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const responding = view.phase === "respond";
  const hand = sortHand(view.you?.hand ?? [], { order: "bura", trump: view.trump });
  // Against a malutka the leader tops up to three: only the missing cards are chosen.
  const need = responding ? owedCards(view.trick, me, hand.length) : 0;
  const toppingUp = responding && (view.trick?.plays.some((p) => p.seat === me) ?? false);
  const value = view.value ?? 1;
  const raiseName = (v: number) => t(`bura.raises.${v}`);
  const raise = view.raise ?? null;
  const selection = selected.filter((c) => hand.includes(c));
  const sameSuit = selection.length > 0 && selection.every((c) => c[1] === selection[0]![1]);
  const maxLead = Math.min(3, view.players[opp]?.handCount ?? 3);

  // Bura tricks: plays carry the cards on the felt; a "card" key lets the shared trick logic track them.
  const livePlays = (view.trick?.plays ?? []).map((p) => ({ ...p, card: `${p.seat}:${p.faceUp?.join("") ?? p.count}` }));
  const last = view.lastTrick ? { winner: view.lastTrick.winner, plays: view.lastTrick.plays.map((p) => ({ ...p, card: `${p.seat}:${p.faceUp?.join("") ?? p.count}` })) } : null;
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
      if (view.phase === "lead" && now.length > 0 && now[0]![1] !== c[1]) return [c];
      if (view.phase === "lead" && now.length >= maxLead) return [...now.slice(1), c];
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
  const won = lh && lh.winner !== null && (lh.value ?? 1) > 1 ? ` · ${t("bura.teamWins", { team: name(lh.winner), n: lh.value ?? 1 })}` : "";
  const lastMessage = !lh
    ? null
    : lh.reason === "fold"
      ? t("bura.folded", { name: name(lh.by ?? 1 - lh.winner!), team: name(lh.winner!), n: lh.value ?? 1 })
      : lh.reason === "bura"
        ? t("bura.bura", { name: name(lh.winner!) }) + won
        : lh.reason === "var"
          ? t("bura.claimTrue", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 }) + won
          : lh.reason === "false_var"
            ? t("bura.claimFalse", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 }) + won
            : lh.reason === "points" && lh.winner !== null
              ? t("bura.wonOnPoints", { name: name(lh.winner), points: lh.points[lh.winner] ?? 0 }) + won
              : t("bura.draw");
  const freshDeal = view.players.every((p) => p.capturedCount === 0) && !view.trick;
  const handNotice: TableNotice | null = lh && lastMessage ? { id: `hand-${lh.handNumber}`, tone: "gold", icon: <Award size={15} />, text: lastMessage } : null;
  const trickNotice: TableNotice | null =
    stage === "won" && winner !== null ? { id: `trick-${plays.map((p) => p.card).join("|")}`, tone: winner === mySeat ? "win" : "info", icon: <Crown size={15} />, text: t("table.takesTrick", { name: name(winner) }) } : null;
  const notice = freshDeal || view.phase === "over" ? (handNotice ?? trickNotice) : (trickNotice ?? null);

  const knownPts = view.you?.knownPoints ?? null;

  function seat(s: number) {
    const p = view.players[s]!;
    return (
      <PlayerSeat seat={s} seats={seats} active={view.toAct === s} deadline={deadline} you={s === mySeat} cards={s !== mySeat ? p.handCount : undefined}>
        <SeatNumber value={`${view.scores[s]}/${view.targetPoints}`} tone="gold" />
        <CapturedPile count={p.capturedCount} label={t("bura.pile", { n: p.capturedCount })} />
      </PlayerSeat>
    );
  }

  let centre;
  if (view.phase === "over") {
    const champ = view.scores[0]! > view.scores[1]! ? 0 : 1;
    centre = (
      <div className="pstage-wait" data-tone="gold">
        <Trophy size={16} /> {t("table.wins", { name: name(champ) })}
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
        {view.phase === "var" ? t("bura.varHint") : t("table.yourMove")}
      </div>
    ) : (
      <div className="pstage-wait">{t("table.isPlaying", { name: name(view.toAct) })}</div>
    );
  }

  return (
    <div className="pboard" data-game="bura3" ref={boardRef}>
      <GameHud
        toAct={view.toAct}
        mySeat={mySeat}
        seats={seats}
        chips={
          <>
            <HudFact value={t("game.hand", { n: view.handNumber })} optional />
            <HudFact label={t("table.target", { n: view.targetPoints })} value={`${view.scores[me]} : ${view.scores[opp]}`} tone="gold" />
            <HudFact label={t("bura.value")} value={`×${value} · ${raiseName(value)}`} tone={value > 1 ? "warn" : undefined} optional={value === 1} />
            <TrumpFact suit={view.trump} />
          </>
        }
      />

      <GameTable shape="duel" label={t("games.bura3.name")} overlay={<GameNotification notice={notice} />}>
        <div className="pbura-grid" data-players="2">
          <div className="pbura-seat" data-pos="n">
            {seat(opp)}
            <OpponentHand count={view.players[opp]?.handCount ?? 0} label={t("table.cardsInHand", { n: view.players[opp]?.handCount ?? 0 })} />
          </div>
          <div className="pbura-center">
            <Stock trumpCard={view.trumpCard} count={view.stockCount} />
            <div className="pbura-stage">
              {stage !== "idle" ? (
                <BuraTrick
                  plays={plays as Play[]}
                  bestSeat={stage === "live" ? (view.trick?.bestSeat ?? null) : winner}
                  stage={stage}
                  posOf={(s) => (s === opp ? "n" : "s")}
                  labelOf={(s) => name(s)}
                  scope={boardRef}
                  animate={mounted}
                  layout="duel"
                />
              ) : (
                centre
              )}
            </div>
            <div className="pbura-info">
              <span className="pj-plaque-label">{t("bura.points")}</span>
              <span className="pbura-values">{t("bura.cardValues")}</span>
              {knownPts !== null && <Meter value={knownPts} max={31} tone={knownPts >= 31 ? "gold" : "brand"} label={`${t("ui.toward31")} · ${t("bura.knownPoints", { n: knownPts })}`} />}
            </div>
          </div>
          <div className="pbura-seat" data-pos="s">
            {seat(me)}
          </div>
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
                  <button className="btn-primary btn-lg px-8" disabled={!sameSuit || selection.length > maxLead} onClick={() => submit("lead")}>
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
                      title={t("bura.malutkaHint3")}
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
              {view.you.canRaise && view.phase !== "var" && (
                <button className="btn-secondary btn-lg px-6" onClick={() => onAction({ type: "raise" })}>
                  {t("bura.raiseTo", { raise: raiseName(value + 1), n: value + 1 })}
                </button>
              )}
              {view.phase === "var" && (
                <>
                  <span className="pactions-hint">{t("bura.varHint")}</span>
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

          <PlayerHand
            label={t("game.yourHand")}
            mode="select"
            dealKey={view.handNumber}
            active={myTurn && view.phase !== "var" && view.phase !== "raise"}
            onPick={toggle}
            cards={hand.map((c) => ({ card: c, selected: selection.includes(c) }))}
          />
        </div>
      )}
    </div>
  );
}
