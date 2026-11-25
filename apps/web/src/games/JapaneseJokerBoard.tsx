import { useState, type CSSProperties } from "react";
import { Swords } from "lucide-react";
import type { JapaneseJokerView } from "@croco/game-engine/games/japanese_joker";
import { useT } from "../i18n";
import { cardLabel, Modal, SuitIcon, suitSymbol } from "../components/ui";
import { CardHand, CardSlot, PlayingCard } from "./cards";
import { sortHand } from "./cardOrder";
import { GameTable, HudChip, isRedSuit, MiniCardCount, SeatStat, SeatTag, SuitPicker, SUITS, tiltFor, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** One player's five table stacks: a face-down card with an open card on top. */
function TablePiles({
  piles,
  onPlay,
  playable,
  label,
}: {
  piles: JapaneseJokerView["table"][number];
  onPlay?: (card: string) => void;
  playable: Set<string>;
  label: string;
}) {
  return (
    <div className="jj-piles" role="group" aria-label={label}>
      {piles.map((p, i) => (
        <div key={i} className="jj-pile">
          {p.hasDown && p.up && (
            <span className="jj-down">
              <PlayingCard back size="sm" />
            </span>
          )}
          {p.up ? (
            <span className="jj-up">
              <PlayingCard
                card={p.up}
                size="sm"
                playable={!onPlay || playable.has(p.up)}
                onClick={onPlay && playable.has(p.up) ? () => onPlay(p.up!) : undefined}
                style={{ "--tilt": "0deg" } as CSSProperties}
              />
            </span>
          ) : p.hasDown ? (
            <PlayingCard back size="sm" />
          ) : (
            <CardSlot size="sm" />
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
  const hand = view.you ? sortHand(view.you.hand, { trump: view.trump }) : [];
  const handActive = myTurn && view.phase === "play";

  return (
    <div className="board">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <HudChip>{t("game.round", { n: view.round })}</HudChip>
            {view.trumpChosen && <TrumpBadge suit={view.trump} />}
            <HudChip tone="gold">
              {view.scores[me]} – {view.scores[opp]} / {view.targetPoints}
            </HudChip>
          </>
        }
      />

      <GameTable rail="lacquer" felt="jj" print={t("games.japanese_joker.name")}>
        <div className="table-col">
          <div className="jj-side">
            <SeatTag seat={opp} seats={seats} active={view.toAct === opp} compact>
              <MiniCardCount count={view.handCounts[opp] ?? 0} />
              <SeatStat label={t("jj.cardsWon")} value={view.won[opp] ?? 0} />
              <SeatStat value={view.scores[opp]} tone="gold" />
            </SeatTag>
            {view.phase !== "trump" && <TablePiles piles={view.table[opp] ?? []} playable={new Set()} label={`${t("jj.table")}: ${name(opp)}`} />}
          </div>

          <div className="grid place-items-center min-h-[110px] w-full">
            {view.trick.length > 0 ? (
              <div className="flex items-center justify-center gap-[clamp(14px,4cqi,40px)]">
                {view.trick.map((p) => (
                  <div key={`${p.seat}-${p.card}`} className="trick-card">
                    <PlayingCard
                      card={p.card}
                      size="sm"
                      animate="play"
                      style={{ "--from-y": p.seat === opp ? "-70px" : "70px", "--tilt": tiltFor(p.card, 5) } as CSSProperties}
                    />
                    {p.demand && (
                      <span className="trick-tag" data-tone="gold">
                        {p.demand.kind === "card" ? t("jj.demandCard", { card: cardLabel(p.demand.card) }) : t("jj.demandHighest", { suit: suitSymbol(p.demand.suit) })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : myTurn && view.phase === "trump" ? (
              <div className="action-bar fade-in" role="group" aria-label={t("joker.chooseTrump")}>
                <span className="action-title w-full text-center">{t("joker.chooseTrump")}</span>
                <SuitPicker onPick={(s) => onAction({ type: "trump", suit: s })} />
                <button type="button" className="btn-gold h-[50px] px-5" onClick={() => onAction({ type: "trump", suit: "none" })}>
                  {t("game.noTrump")}
                </button>
              </div>
            ) : (
              <div className="grid justify-items-center gap-2 text-center">
                <Swords size={20} className="text-white/40" />
                {view.lastRound && (
                  <span className="amount-tag">
                    {name(0)} {view.lastRound.won[0]} – {view.lastRound.won[1]} {name(1)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="jj-side">
            <SeatTag seat={me} seats={seats} active={view.toAct === me} compact>
              {mySeat === null && <MiniCardCount count={view.handCounts[me] ?? 0} />}
              <SeatStat label={t("jj.cardsWon")} value={view.won[me] ?? 0} />
              <SeatStat value={view.scores[me]} tone="gold" />
            </SeatTag>
            {view.phase !== "trump" && <TablePiles piles={view.table[me] ?? []} playable={myTurn ? playable : new Set()} onPlay={myTurn ? play : undefined} label={t("jj.myTable")} />}
          </div>
        </div>
      </GameTable>

      {mySeat !== null && view.you && (
        <div className="dock">
          {handActive && (
            <div className="flex justify-center">
              <span className="hint-pill">{t("jj.playHint")}</span>
            </div>
          )}
          <CardHand
            label={t("game.yourHand")}
            size="md"
            dealKey={view.round}
            cards={hand.map((c) => {
              const canPlay = handActive && playable.has(c);
              return { card: c, playable: !handActive || canPlay, onClick: canPlay ? () => play(c) : undefined };
            })}
          />
        </div>
      )}

      {/* Joker demand */}
      <Modal open={joker !== null} onClose={() => setJoker(null)} title={t("jj.demand")}>
        <div className="grid gap-4">
          {oppUp.length > 0 && (
            <div className="grid gap-2">
              <span className="label">{t("ui.oppTable")}</span>
              <div className="flex flex-wrap gap-2">
                {oppUp.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="btn-secondary btn-sm h-auto py-1.5 px-2.5 gap-2"
                    onClick={() => {
                      onAction({ type: "play", card: joker, demand: { kind: "card", card: c } });
                      setJoker(null);
                    }}
                  >
                    <PlayingCard card={c} size="xs" />
                    <span>{t("jj.demandCard", { card: cardLabel(c) })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <span className="label">{t("jj.demand")}</span>
            <div className="flex flex-wrap gap-2">
              {SUITS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="suit-tile !h-11 text-xs"
                  data-red={isRedSuit(s) ? "true" : "false"}
                  onClick={() => {
                    onAction({ type: "play", card: joker, demand: { kind: "highest", suit: s } });
                    setJoker(null);
                  }}
                >
                  <SuitIcon suit={s} size={16} />
                  <span>{t("jj.demandHighest", { suit: suitSymbol(s) })}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
