import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { ClipboardList, Crown, History, Sparkles, Trophy } from "lucide-react";
import type { JokerView } from "@croco/game-engine/games/joker";
import { useT } from "../i18n";
import { SuitIcon, suitSymbol } from "../components/ui";
import { PlayingCard } from "./cards";
import { sortHand } from "./cardOrder";
import { isRedSuit, opponentsOrder, SUITS, tiltFor, useSeatName, type BoardProps } from "./common";
import { CompactScoreboard, FullScoreboard } from "./JokerScoreboard";
import { ActionSheet } from "./ui/ActionSheet";
import { GameHud, HudFact, TrumpFact } from "./ui/GameHud";
import { GameNotification, type TableNotice } from "./ui/GameNotification";
import { GameTable } from "./ui/GameTable";
import { bidLabel, sheetTotal, signedPoints } from "./ui/labels";
import { flyIn, seatRect, sweepTo } from "./ui/motion";
import { PlayerHand } from "./ui/PlayerHand";
import { PlayerSeat, SeatNumber } from "./ui/PlayerSeat";
import { TRICK_SWEEP_MS, useTrickStage } from "./ui/useTrickStage";

type Pos = "n" | "w" | "e" | "s";
type Play = JokerView["trick"][number];

/** Tricks taken against the declaration: filled = taken, ring = still to take, red = over. */
function TrickPips({ bid, won }: { bid: number | null | undefined; won: number }) {
  if (bid === null || bid === undefined) return null;
  const total = Math.min(9, Math.max(bid, won));
  if (total === 0) return null;
  return (
    <span className="ppips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} data-won={i < won ? "true" : "false"} data-over={i >= bid ? "true" : "false"} />
      ))}
    </span>
  );
}

/**
 * ბოლო წაყვანილი კარტები: the last trick taken, in play order — who played which card, how a
 * joker was played, and who took it. Every player (and spectator) can open it at any time.
 */
function LastTrick({ trick, name, jokerLabel }: { trick: NonNullable<JokerView["lastTrick"]>; name(seat: number): string; jokerLabel(mode: "high" | "low", lead: boolean): string }) {
  const t = useT();
  return (
    <div className="plast">
      <ol className="plast-cards">
        {trick.plays.map((p, i) => (
          <li key={`${p.seat}-${p.card}`} className="plast-play" data-winner={p.seat === trick.winner ? "true" : "false"}>
            <span className="plast-order">{i === 0 ? t("joker.ledFirst") : i + 1}</span>
            <PlayingCard card={p.card} size="pile" highlight={p.seat === trick.winner ? "winner" : undefined} />
            <span className="plast-name">
              {p.seat === trick.winner && <Crown size={11} aria-hidden="true" />}
              <span className="truncate">{name(p.seat)}</span>
            </span>
            {p.joker && (
              <span className="plast-tag">
                {jokerLabel(p.joker.mode, i === 0)}
                {p.joker.suit ? ` ${suitSymbol(p.joker.suit)}` : ""}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="plast-winner">
        <Crown size={14} /> {t("table.takesTrick", { name: name(trick.winner) })}
      </p>
    </div>
  );
}

/** One card on the felt; it flies in from the hand or the seat that played it. */
function TrickCard({ play, pos, highlight, tag, scope, animate }: { play: Play; pos: Pos; highlight?: "winner" | "latest"; tag?: string; scope: RefObject<HTMLDivElement | null>; animate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (animate) flyIn(ref.current, play.card, seatRect(scope.current, play.seat));
    // Only when the card first lands on the felt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className="ptrick-card" data-pos={pos} data-trick-card="true">
      <PlayingCard card={play.card} size="trick" highlight={highlight} style={{ "--tilt": tiltFor(play.card, 5) } as CSSProperties} />
      {tag && <span className="ptrick-tag">{tag}</span>}
    </div>
  );
}

export default function JokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<JokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const boardRef = useRef<HTMLDivElement>(null);
  const [jokerCard, setJokerCard] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const myTurn = view.toAct === mySeat && mySeat !== null;
  const playable = new Set(view.you?.playable ?? []);
  const leading = view.trick.length === 0;
  const { stage, plays, winner } = useTrickStage(view.trick, view.lastTrick);

  /** Georgian table terms: a led joker is "high" or "let it take"; a following joker "jokers it" or goes low. */
  const jokerLabel = (mode: "high" | "low", lead: boolean) => (lead ? t(mode === "high" ? "joker.high" : "joker.take") : t(mode === "high" ? "joker.jokerIt" : "joker.low"));

  function play(card: string) {
    if (card.startsWith("X")) setJokerCard(card);
    else onAction({ type: "play", card });
  }

  const opps = opponentsOrder(4, mySeat);
  const westSeat = opps[0]!;
  const northSeat = opps[1]!;
  const eastSeat = opps[2]!;
  const southSeat = mySeat ?? opps[3]!;
  const posOf: Record<number, Pos> = { [westSeat]: "w", [northSeat]: "n", [eastSeat]: "e", [southSeat]: "s" };

  // Sweep a finished trick toward its winner.
  useEffect(() => {
    if (stage !== "collect" || winner === null) return;
    const els = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-trick-card]") ?? []);
    sweepTo(els, seatRect(boardRef.current, winner), TRICK_SWEEP_MS);
  }, [stage, winner]);

  const declared = view.bids.reduce<number>((s, b) => s + (b ?? 0), 0);
  const allDeclared = view.bids.every((b) => b !== null);
  const diff = declared - view.cards;

  // Table notifications: a finished deal (while the next one is being declared), else the last trick.
  const lastRec = view.history[view.history.length - 1];
  const handNotice: TableNotice | null =
    lastRec && (view.phase === "bid" || view.phase === "trump" || view.phase === "over")
      ? {
          id: `hand-${lastRec.hand}`,
          tone: "gold",
          icon: <Trophy size={15} />,
          text:
            mySeat !== null
              ? `${t("table.handDone", { n: lastRec.hand })} · ${t("common.you")} ${signedPoints(lastRec.scores[mySeat] ?? 0)}`
              : t("table.handDone", { n: lastRec.hand }),
        }
      : null;
  const trickNotice: TableNotice | null =
    stage === "won" && winner !== null ? { id: `trick-${plays.map((p) => p.card).join("")}`, tone: winner === mySeat ? "win" : "info", icon: <Crown size={15} />, text: t("table.takesTrick", { name: name(winner) }) } : null;
  // Nine-card deals: the player after the dealer declares trump; the table is told who and what.
  const trumpBy = view.trumpBy ?? null;
  const declaringTrump = view.phase === "trump";
  const byMe = trumpBy !== null && trumpBy === mySeat;
  const declaredText =
    trumpBy === null
      ? null
      : view.trump
        ? byMe
          ? t("joker.trumpDeclaredYou", { suit: suitSymbol(view.trump) })
          : t("joker.trumpDeclared", { name: name(trumpBy), suit: suitSymbol(view.trump) })
        : byMe
          ? t("joker.noTrumpDeclaredYou")
          : t("joker.noTrumpDeclared", { name: name(trumpBy) });
  const trumpNotice: TableNotice | null =
    declaredText && view.phase === "bid" && view.bids.every((b) => b === null) ? { id: `trump-${view.handNumber}`, tone: "gold", icon: <Sparkles size={15} />, text: declaredText } : null;
  const notice = trickNotice ?? trumpNotice ?? handNotice;

  const closeJoker = useCallback(() => setJokerCard(null), []);
  const closeSheet = useCallback(() => setSheet(false), []);
  const closeLast = useCallback(() => setLastOpen(false), []);

  function seatBadge(s: number) {
    const bid = view.bids[s];
    if (bid === null || bid === undefined) return null;
    return (
      <span key={`${view.handNumber}-${bid}`} className="pseat-bubble" data-pass={bid === 0 ? "true" : "false"} title={t("joker.bid")}>
        {bidLabel(t, bid)}
      </span>
    );
  }

  function renderSeat(s: number, layout: "row" | "column") {
    const bid = view.bids[s];
    const won = view.tricks[s] ?? 0;
    const tone = bid === null || bid === undefined ? "muted" : won > bid ? "bad" : won === bid ? "good" : undefined;
    return (
      <PlayerSeat
        seat={s}
        seats={seats}
        active={view.toAct === s}
        deadline={deadline}
        dealer={view.dealer === s}
        you={s === mySeat}
        layout={layout}
        badge={seatBadge(s)}
        cards={s !== mySeat ? (view.handCounts[s] ?? 0) : undefined}
      >
        <SeatNumber label={t("joker.tricks")} value={`${won}/${bid === null || bid === undefined ? "—" : bidLabel(t, bid)}`} tone={tone} />
        <TrickPips bid={bid} won={won} />
        <SeatNumber value={sheetTotal(view.totals[s] ?? 0)} tone="gold" />
      </PlayerSeat>
    );
  }

  const hand = view.you ? sortHand(view.you.hand, { trump: view.trump }) : [];
  const handActive = myTurn && view.phase === "play";

  // What the centre of the felt shows when no trick is on it.
  let centre;
  if (myTurn && view.phase === "trump" && view.you) {
    centre = (
      <div className="pdecide" role="group" aria-label={t("joker.declareTrump")}>
        <div className="pdecide-title">{t("joker.declareTrump")}</div>
        <div className="pdecide-meta">
          <span>{t("joker.declareTrumpHint")}</span>
        </div>
        <div className="pdecide-row">
          {SUITS.map((s) => (
            <button
              key={s}
              type="button"
              className="psuit psuit-named"
              data-red={isRedSuit(s) ? "true" : "false"}
              onClick={() => onAction({ type: "trump", suit: s })}
              aria-label={`${t(`joker.suitNames.${s}`)} ${suitSymbol(s)}`}
            >
              <SuitIcon suit={s} size={24} />
              <span>{t(`joker.suitNames.${s}`)}</span>
            </button>
          ))}
          <button type="button" className="psuit psuit-wide" onClick={() => onAction({ type: "trump", suit: "none" })}>
            {t("game.noTrump")}
          </button>
        </div>
      </div>
    );
  } else if (myTurn && view.phase === "bid" && view.you) {
    const forbidden = view.you.forbiddenBid;
    const left = view.cards - declared;
    centre = (
      <div className="pdecide" role="group" aria-label={t("joker.chooseBid")}>
        <div className="pdecide-title">{t("joker.chooseBid")}</div>
        <div className="pdecide-meta">
          <span>{t("table.declaredSoFar", { n: declared, cards: view.cards })}</span>
          <span data-tone={left < 0 ? "over" : "left"}>{left >= 0 ? t("table.toFill", { n: left }) : t("table.overBy", { n: -left })}</span>
        </div>
        <div className="pbid-grid" data-many={view.cards > 5 ? "true" : "false"}>
          {Array.from({ length: view.cards + 1 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              className="pbid"
              data-pass={n === 0 ? "true" : "false"}
              disabled={n === forbidden}
              onClick={() => onAction({ type: "bid", value: n })}
              aria-label={bidLabel(t, n)}
              title={n === forbidden ? t("joker.forbidden", { n: bidLabel(t, n) }) : undefined}
            >
              {bidLabel(t, n)}
            </button>
          ))}
        </div>
        {forbidden !== null && <div className="pdecide-warn">{t("joker.forbidden", { n: bidLabel(t, forbidden) })}</div>}
      </div>
    );
  } else if (view.phase !== "over" && view.toAct !== null) {
    if (myTurn && view.phase === "play") {
      centre = <div className="pstage-wait" data-tone="teal">{t("table.youLead")}</div>;
    } else {
      const key = view.phase === "bid" ? "table.isDeclaring" : view.phase === "trump" ? "table.isChoosingTrump" : "table.isLeading";
      centre = <div className="pstage-wait">{t(key, { name: name(view.toAct) })}</div>;
    }
  } else if (view.phase === "over") {
    centre = (
      <div className="pstage-wait" data-tone="gold">
        <Trophy size={16} /> {t("game.finished")}
      </div>
    );
  }

  const showTrick = stage !== "idle";

  return (
    <div className="pboard" data-game="joker" ref={boardRef}>
      <GameHud
        toAct={view.toAct}
        mySeat={mySeat}
        seats={seats}
        chips={
          <>
            {view.ruleset === "nines" && <HudFact value={t("joker.ninesShort")} tone="teal" optional />}
            <HudFact label={t("joker.set", { n: view.set })} value={t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })} />
            <HudFact label={t("table.cardsLabel")} value={view.cards} optional />
            <TrumpFact suit={view.trump} joker={Boolean(view.trumpCard?.startsWith("X"))} pending={declaringTrump} />
          </>
        }
        actions={
          <>
            <button
              type="button"
              className="phud-btn"
              onClick={() => setLastOpen(true)}
              disabled={!view.lastTrick}
              title={t("joker.lastTrickTitle")}
              aria-label={t("joker.lastTrickTitle")}
            >
              <History size={15} /> <span>{t("joker.lastTrick")}</span>
            </button>
            <button type="button" className="phud-btn" onClick={() => setSheet(true)}>
              <ClipboardList size={15} /> <span>{t("joker.sheet")}</span>
            </button>
          </>
        }
      />

      <div className="pj-layout">
        <CompactScoreboard view={view} seats={seats} mySeat={mySeat} onOpen={() => setSheet(true)} />

        <GameTable shape="oval" label={t("games.joker.name")} overlay={<GameNotification notice={notice} />}>
          <div className="pj-grid">
            <div data-area="n">{renderSeat(northSeat, "row")}</div>
            <div data-area="w">{renderSeat(westSeat, "column")}</div>
            <div data-area="e">{renderSeat(eastSeat, "column")}</div>
            <div data-area="c" className="pj-center">
              <div className="pj-trump" aria-label={declaredText ?? t("game.trump")}>
                {view.trumpCard ? (
                  <PlayingCard key={`${view.handNumber}-${view.trumpCard}`} card={view.trumpCard} size="pile" animate={mounted ? "flip" : false} />
                ) : trumpBy !== null ? (
                  // A declared trump: the suit (or ბეზი) and who declared it.
                  <span key={`${view.handNumber}-declared`} className="pj-declared-trump" data-red={view.trump && isRedSuit(view.trump) ? "true" : "false"}>
                    {view.trump ? <SuitIcon suit={view.trump} size={34} /> : <b>{t("game.noTrump")}</b>}
                  </span>
                ) : declaringTrump ? (
                  <span className="pj-declared-trump" data-pending="true">
                    ?
                  </span>
                ) : (
                  <span className="pc-slot" data-size="pile" />
                )}
                <span className="pj-plaque-label">
                  {trumpBy !== null
                    ? t("joker.declaredBy", { name: name(trumpBy) })
                    : declaringTrump && view.toAct !== null
                      ? view.toAct === mySeat
                        ? t("joker.declaringYou")
                        : t("joker.declaring", { name: name(view.toAct) })
                      : t("game.trump")}
                </span>
              </div>

              <div className="pj-stage">
                {showTrick ? (
                  <div className="ptrick-cross" data-stage={stage}>
                    {plays.map((p, i) => {
                      const isWinner = stage !== "live" && p.seat === winner;
                      const latest = stage === "live" && i === plays.length - 1;
                      const tag = p.joker ? `${jokerLabel(p.joker.mode, i === 0)}${p.joker.suit ? ` ${suitSymbol(p.joker.suit)}` : ""}` : undefined;
                      return (
                        <TrickCard
                          key={`${p.seat}-${p.card}`}
                          play={p}
                          pos={posOf[p.seat] ?? "s"}
                          highlight={isWinner ? "winner" : latest ? "latest" : undefined}
                          tag={tag}
                          scope={boardRef}
                          animate={mounted}
                        />
                      );
                    })}
                  </div>
                ) : (
                  centre
                )}
              </div>

              <div className="pj-declared" data-tone={!allDeclared ? "open" : diff > 0 ? "over" : "under"} aria-label={t("table.declaredTitle")}>
                <span className="pj-plaque-label">{t("table.declaredTitle")}</span>
                <b>
                  {declared}
                  <small>/{view.cards}</small>
                </b>
                <span className="pj-declared-state">{!allDeclared ? t("table.declaring") : diff > 0 ? t("table.overShort", { n: diff }) : t("table.underShort", { n: -diff })}</span>
              </div>
            </div>
            <div data-area="s">{renderSeat(southSeat, "row")}</div>
          </div>
        </GameTable>
      </div>

      {mySeat !== null && view.you && (
        <div className="pdock">
          <div className="pdock-hint" data-on={handActive || (myTurn && view.phase === "bid") ? "true" : "false"}>
            {handActive ? t("joker.playHint") : t("table.declareHint")}
          </div>
          <PlayerHand
            label={t("game.yourHand")}
            dealKey={view.handNumber}
            active={handActive}
            onPick={play}
            cards={hand.map((c) => ({ card: c, playable: playable.has(c) }))}
          />
        </div>
      )}

      {/* Joker: lead "high" or "let it take" (with a suit); follow "joker it" or low */}
      <ActionSheet open={jokerCard !== null} onClose={closeJoker} title={leading ? t("joker.jokerLead") : t("joker.jokerFollow")} subtitle={t("table.jokerSubtitle")}>
        {leading ? (
          <div className="pjoker-lead">
            {(["high", "low"] as const).map((mode) => (
              <div key={mode} className="pjoker-option" data-mode={mode}>
                <div className="pjoker-option-head">
                  <Sparkles size={15} />
                  <b>{jokerLabel(mode, true)}</b>
                </div>
                <p>{t(mode === "high" ? "joker.highHint" : "joker.takeHint")}</p>
                <div className="pdecide-row">
                  {SUITS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="psuit"
                      data-red={isRedSuit(s) ? "true" : "false"}
                      aria-label={`${jokerLabel(mode, true)} ${suitSymbol(s)}`}
                      onClick={() => {
                        onAction({ type: "play", card: jokerCard, joker: { mode, suit: s } });
                        setJokerCard(null);
                      }}
                    >
                      <SuitIcon suit={s} size={24} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pjoker-follow">
            {(["high", "low"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="pjoker-choice"
                data-mode={mode}
                onClick={() => {
                  onAction({ type: "play", card: jokerCard, joker: { mode } });
                  setJokerCard(null);
                }}
              >
                <b>{jokerLabel(mode, false)}</b>
                <span>{t(mode === "high" ? "joker.jokerItHint" : "joker.lowHint")}</span>
              </button>
            ))}
          </div>
        )}
      </ActionSheet>

      <ActionSheet open={lastOpen && Boolean(view.lastTrick)} onClose={closeLast} title={t("joker.lastTrickTitle")} subtitle={t("joker.lastTrickHint")}>
        {view.lastTrick && <LastTrick trick={view.lastTrick} name={name} jokerLabel={jokerLabel} />}
      </ActionSheet>

      <FullScoreboard open={sheet} onClose={closeSheet} view={view} seats={seats} mySeat={mySeat} />
    </div>
  );
}
