import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { Crown, Eye, EyeOff, Hand, Sparkles, Trophy } from "lucide-react";
import type { JapaneseJokerView } from "@croco/game-engine/games/japanese_joker";
import { useT } from "../i18n";
import { SuitIcon, suitSymbol } from "../components/ui";
import { CardSlot, PlayingCard } from "./cards";
import { sortHand } from "./cardOrder";
import { isRedSuit, SUITS, tiltFor, useSeatName, type BoardProps } from "./common";
import { ActionSheet } from "./ui/ActionSheet";
import { GameHud, HudFact, TrumpFact } from "./ui/GameHud";
import { GameNotification, type TableNotice } from "./ui/GameNotification";
import { GameTable } from "./ui/GameTable";
import { flyIn, rememberCardRect, seatRect, sweepTo } from "./ui/motion";
import { PlayerHand } from "./ui/PlayerHand";
import { PlayerSeat, SeatNumber } from "./ui/PlayerSeat";
import { TRICK_SWEEP_MS, useTrickStage } from "./ui/useTrickStage";

type Play = JapaneseJokerView["trick"][number];
type Pile = JapaneseJokerView["table"][number][number];

/**
 * One player's five table stacks. Each stack is a face-down card under an open card; when the
 * open card is played the card beneath is turned up ("revealed"). Playable open cards are lifted
 * with a teal edge and can be played directly from the table.
 */
function TableStacks({ piles, label, playable, onPlay, mine }: { piles: Pile[]; label: string; playable: Set<string>; onPlay?: (card: string, e: MouseEvent<HTMLButtonElement>) => void; mine: boolean }) {
  const t = useT();
  return (
    <div className="pjj-stacks" role="group" aria-label={label} data-mine={mine ? "true" : "false"}>
      {piles.map((p, i) => {
        const live = Boolean(onPlay && p.up && playable.has(p.up));
        const revealed = Boolean(p.up && !p.hasDown);
        return (
          <div key={i} className="pjj-stack" data-state={p.up ? (live ? "live" : "open") : p.hasDown ? "hidden" : "empty"}>
            {p.hasDown && <PlayingCard back size="pile" className="pjj-under" />}
            {p.up ? (
              <PlayingCard
                card={p.up}
                size="pile"
                className="pjj-top"
                playable={!onPlay || live}
                onClick={live ? (e) => onPlay!(p.up!, e) : undefined}
                title={revealed ? `${t("table.open")} · ${t("table.revealed")}` : undefined}
              />
            ) : p.hasDown ? null : (
              <CardSlot size="pile" />
            )}
            {revealed && <span className="pjj-flag" title={t("table.revealed")} aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

function TrickCard({ play, pos, highlight, tags, scope, animate }: { play: Play; pos: "n" | "s"; highlight?: "winner" | "latest"; tags: string[]; scope: RefObject<HTMLDivElement | null>; animate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (animate) flyIn(ref.current, play.card, seatRect(scope.current, play.seat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className="ptrick-card" data-pos={pos} data-trick-card="true">
      <PlayingCard card={play.card} size="trick" highlight={highlight} style={{ "--tilt": tiltFor(play.card, 4) } as CSSProperties} />
      {tags.length > 0 && <span className="ptrick-tag">{tags.join(" · ")}</span>}
    </div>
  );
}

export default function JapaneseJokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<JapaneseJokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const boardRef = useRef<HTMLDivElement>(null);
  const [joker, setJoker] = useState<string | null>(null);
  /** A joker played on the opponent's card: take the trick (მოჯოკვრა) or go low. */
  const [followJoker, setFollowJoker] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const me = mySeat ?? 0;
  const opp = 1 - me;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const playable = new Set(view.you?.playable ?? []);
  const leading = view.trick.length === 0;
  const { stage, plays, winner } = useTrickStage(view.trick, view.lastTrick);

  function play(card: string) {
    if (card.startsWith("X") && leading) setJoker(card);
    else if (card.startsWith("X") && view.jokerLow) setFollowJoker(card);
    else onAction({ type: "play", card });
  }

  function playFromTable(card: string, e: MouseEvent<HTMLButtonElement>) {
    rememberCardRect(card, e.currentTarget);
    play(card);
  }

  useEffect(() => {
    if (stage !== "collect" || winner === null) return;
    const els = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-trick-card]") ?? []);
    sweepTo(els, seatRect(boardRef.current, winner), TRICK_SWEEP_MS);
  }, [stage, winner]);

  const closeJoker = useCallback(() => setJoker(null), []);
  const closeFollow = useCallback(() => setFollowJoker(null), []);

  const hand = view.you ? sortHand(view.you.hand, { trump: view.trump }) : [];
  const handActive = myTurn && view.phase === "play";

  const roundNotice: TableNotice | null = view.lastRound
    ? {
        id: `round-${view.lastRound.round}`,
        tone: "gold",
        icon: <Trophy size={15} />,
        text: `${t("game.round", { n: view.lastRound.round })} · ${view.lastRound.won[me]} : ${view.lastRound.won[opp]}${view.lastRound.points[me] ? ` · +${view.lastRound.points[me]}` : ""}`,
      }
    : null;
  const trickNotice: TableNotice | null =
    stage !== "live" && stage !== "idle" && winner !== null
      ? { id: `trick-${plays.map((p) => p.card).join("")}`, tone: winner === mySeat ? "win" : "info", icon: <Crown size={15} />, text: t("table.takesTrick", { name: name(winner) }) }
      : null;
  const notice = view.phase === "trump" || view.phase === "over" ? (roundNotice ?? trickNotice) : (trickNotice ?? null);

  const tagsFor = (p: Play) => {
    const tags: string[] = [];
    if (p.demand) tags.push(t("jj.demandHighest", { suit: suitSymbol(p.demand.suit) }));
    if (p.joker) tags.push(t(p.joker.mode === "low" ? "joker.low" : "joker.jokerIt"));
    if (p.from === "table" && !p.demand && !p.joker) tags.push(t("jj.table"));
    return tags;
  };

  function seat(s: number) {
    return (
      <PlayerSeat
        seat={s}
        seats={seats}
        active={view.toAct === s}
        deadline={deadline}
        dealer={view.dealer === s}
        you={s === mySeat}
        cards={s !== mySeat ? (view.handCounts[s] ?? 0) : undefined}
      >
        <SeatNumber label={t("jj.cardsWon")} value={view.won[s] ?? 0} tone="muted" />
        <SeatNumber value={`${view.scores[s]}/${view.targetPoints}`} tone="gold" />
      </PlayerSeat>
    );
  }

  let centre;
  if (myTurn && view.phase === "trump") {
    centre = (
      <div className="pdecide" role="group" aria-label={t("joker.chooseTrump")}>
        <div className="pdecide-title">{t("joker.chooseTrump")}</div>
        <div className="pdecide-row">
          {SUITS.map((s) => (
            <button key={s} type="button" className="psuit" data-red={isRedSuit(s) ? "true" : "false"} onClick={() => onAction({ type: "trump", suit: s })} aria-label={suitSymbol(s)}>
              <SuitIcon suit={s} size={26} />
            </button>
          ))}
          <button type="button" className="psuit psuit-wide" onClick={() => onAction({ type: "trump", suit: "none" })}>
            {t("game.noTrump")}
          </button>
        </div>
      </div>
    );
  } else if (view.phase === "over") {
    const champ = view.scores[0]! > view.scores[1]! ? 0 : 1;
    centre = (
      <div className="pstage-wait" data-tone="gold">
        <Trophy size={16} /> {t("table.wins", { name: name(champ) })}
      </div>
    );
  } else if (view.toAct !== null) {
    centre = myTurn ? (
      <div className="pstage-wait" data-tone="teal">
        {view.you?.firstFromHand ? t("jj.firstFromHand") : t("table.yourMove")}
      </div>
    ) : (
      <div className="pstage-wait">{view.phase === "trump" ? t("table.isChoosingTrump", { name: name(view.toAct) }) : t("table.isLeading", { name: name(view.toAct) })}</div>
    );
  }

  const posOf = (s: number): "n" | "s" => (s === opp ? "n" : "s");
  const myPiles = view.table[me] ?? [];
  const oppPiles = view.table[opp] ?? [];
  const showPiles = view.phase !== "trump";

  return (
    <div className="pboard" data-game="japanese_joker" ref={boardRef}>
      <GameHud
        toAct={view.toAct}
        mySeat={mySeat}
        seats={seats}
        chips={
          <>
            <HudFact value={t("game.round", { n: view.round })} />
            <HudFact label={t("table.target", { n: view.targetPoints })} value={`${view.scores[me]} : ${view.scores[opp]}`} tone="gold" />
            {view.trumpChosen && <TrumpFact suit={view.trump} />}
          </>
        }
      />

      <GameTable shape="duel" label={t("games.japanese_joker.name")} overlay={<GameNotification notice={notice} />}>
        <div className="pjj-grid">
          <div className="pjj-side" data-side="top">
            <div className="pjj-seat">{seat(opp)}</div>
            {showPiles && <TableStacks piles={oppPiles} label={t("table.theirStacks")} playable={new Set()} mine={false} />}
          </div>

          <div className="pjj-center">
            <div className="pjj-plaque">
              <span className="pj-plaque-label">{t("game.trump")}</span>
              {view.trumpChosen ? (
                view.trump ? (
                  <span className="pjj-trump" data-red={isRedSuit(view.trump) ? "true" : "false"}>
                    <SuitIcon suit={view.trump} size={30} />
                  </span>
                ) : (
                  <b className="pjj-bez">{t("game.noTrump")}</b>
                )
              ) : (
                <span className="pjj-trump" data-pending="true">?</span>
              )}
            </div>

            <div className="pj-stage pjj-stage">
              {stage !== "idle" ? (
                <div className="ptrick-duel" data-stage={stage}>
                  {plays.map((p, i) => (
                    <TrickCard
                      key={`${p.seat}-${p.card}`}
                      play={p}
                      pos={posOf(p.seat)}
                      highlight={stage !== "live" && p.seat === winner ? "winner" : stage === "live" && i === plays.length - 1 ? "latest" : undefined}
                      tags={tagsFor(p)}
                      scope={boardRef}
                      animate={mounted}
                    />
                  ))}
                </div>
              ) : (
                centre
              )}
            </div>

            <div className="pjj-plaque" aria-label={t("table.roundScore")}>
              <span className="pj-plaque-label">{t("jj.cardsWon")}</span>
              <b className="pjj-tricks">
                <span data-you="true">{view.won[me] ?? 0}</span>
                <i>:</i>
                <span>{view.won[opp] ?? 0}</span>
              </b>
              <span className="pjj-of">/ 18</span>
            </div>
          </div>

          <div className="pjj-side" data-side="bottom">
            <div className="pjj-seat">{seat(me)}</div>
            {showPiles && <TableStacks piles={myPiles} label={t("jj.myTable")} playable={myTurn ? playable : new Set()} onPlay={myTurn && view.phase === "play" ? playFromTable : undefined} mine />}
            <ul className="pjj-legend" aria-label={t("table.legend")}>
              <li>
                <Eye size={12} /> {t("table.open")}
              </li>
              <li>
                <EyeOff size={12} /> {t("table.hidden")}
              </li>
              <li data-tone="teal">
                <Hand size={12} /> {t("table.playableNow")}
              </li>
              <li data-tone="gold">
                <i className="pjj-flag-dot" /> {t("table.revealed")}
              </li>
            </ul>
          </div>
        </div>
      </GameTable>

      {mySeat !== null && view.you && (
        <div className="pdock">
          <div className="pdock-hint" data-on={handActive ? "true" : "false"}>
            {view.you.firstFromHand ? t("jj.firstFromHand") : t("jj.playHint")}
          </div>
          <PlayerHand label={t("game.yourHand")} dealKey={view.round} active={handActive} onPick={play} cards={hand.map((c) => ({ card: c, playable: playable.has(c) }))} />
        </div>
      )}

      {/* Joker on the opponent's card: take the trick or go low */}
      <ActionSheet open={followJoker !== null} onClose={closeFollow} title={t("joker.jokerFollow")} subtitle={t("table.jokerSubtitle")}>
        <div className="pjoker-follow">
          {(["high", "low"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="pjoker-choice"
              data-mode={mode}
              onClick={() => {
                onAction({ type: "play", card: followJoker, joker: { mode } });
                setFollowJoker(null);
              }}
            >
              <b>{t(mode === "high" ? "joker.jokerIt" : "joker.low")}</b>
              <span>{t(mode === "high" ? "joker.jokerItHint" : "joker.lowHint")}</span>
            </button>
          ))}
        </div>
      </ActionSheet>

      {/* Led joker: demand the highest card of a suit */}
      <ActionSheet open={joker !== null} onClose={closeJoker} title={t("jj.demand")} subtitle={t("table.jokerSubtitle")}>
        <div className="pjoker-option">
          <div className="pjoker-option-head">
            <Sparkles size={15} />
            <b>{t("jj.demand")}</b>
          </div>
          <div className="pdecide-row">
            {SUITS.map((s) => (
              <button
                key={s}
                type="button"
                className="psuit"
                data-red={isRedSuit(s) ? "true" : "false"}
                aria-label={t("jj.demandHighest", { suit: suitSymbol(s) })}
                onClick={() => {
                  onAction({ type: "play", card: joker, demand: { kind: "highest", suit: s } });
                  setJoker(null);
                }}
              >
                <SuitIcon suit={s} size={22} />
                <span>{t("jj.demandHighest", { suit: suitSymbol(s) })}</span>
              </button>
            ))}
          </div>
        </div>
      </ActionSheet>
    </div>
  );
}
