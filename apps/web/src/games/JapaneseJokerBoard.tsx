import { useState } from "react";
import { Sparkles, Swords } from "lucide-react";
import type { JapaneseJokerView } from "@croco/game-engine/games/japanese_joker";
import { useT } from "../i18n";
import { cardLabel, Modal, PlayingCard, SuitIcon, suitSymbol } from "../components/ui";
import { MiniCardCount, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

const SUITS = ["S", "H", "D", "C"] as const;

function DuelTableRow({
  piles,
  onPlay,
  playable,
  label,
  caption,
}: {
  piles: JapaneseJokerView["table"][number];
  onPlay?: (card: string) => void;
  playable: Set<string>;
  label: string;
  caption: string;
}) {
  return (
    <div className="grid gap-1.5 justify-items-center">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-2/85">{caption}</span>
      <div className="flex flex-wrap gap-1.5 sm:gap-3 justify-center" role="group" aria-label={label}>
        {piles.map((p, i) => (
          <div key={i} className="relative pcard-slot pcard-slot-sm flex items-center justify-center">
            {p.hasDown && (
              <span className="absolute inset-0 translate-x-1 translate-y-1 pointer-events-none">
                <PlayingCard back size="sm" />
              </span>
            )}
            {p.up ? (
              <span className="relative z-[1] flex items-center justify-center">
                <PlayingCard
                  card={p.up}
                  size="sm"
                  playable={!onPlay || playable.has(p.up)}
                  onClick={onPlay && playable.has(p.up) ? () => onPlay(p.up!) : undefined}
                />
              </span>
            ) : !p.hasDown ? (
              <span className="text-xs font-bold text-white/25">—</span>
            ) : null}
          </div>
        ))}
      </div>
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

  return (
    <div className="table-arena felt-jade">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className="chip bg-white/8 border border-white/14 text-white">{t("game.round", { n: view.round })}</span>
            {view.trumpChosen && <TrumpBadge suit={view.trump} />}
            <span className="chip bg-gold/20 border border-gold/45 text-gold font-extrabold tabular-nums">
              {view.scores[0]} – {view.scores[1]} / {view.targetPoints}
            </span>
          </>
        }
      />

      {/* Opponent Capsule & 5 Open/Hidden Duel Stacks */}
      <div className="grid gap-2.5">
        <div className="max-w-md mx-auto w-full">
          <SeatTag seat={opp} seats={seats} active={view.toAct === opp} compact>
            <MiniCardCount count={view.handCounts[opp] ?? 0} />
            <span className="text-text-2 font-semibold tabular-nums">
              {t("jj.cardsWon")}: {view.won[opp]}
            </span>
            <span className="text-gold font-extrabold tabular-nums">{view.scores[opp]}</span>
          </SeatTag>
        </div>

        {view.phase !== "trump" && (
          <DuelTableRow
            piles={view.table[opp] ?? []}
            playable={new Set()}
            label={`${t("jj.table")}: ${name(opp)}`}
            caption={t("ui.oppTable")}
          />
        )}
      </div>

      {/* Central Head-to-Head Clash Well — Full-Size Cards */}
      <div className="table-well min-h-32 sm:min-h-36 flex flex-col items-center justify-center gap-2">
        {view.trick.length > 0 ? (
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            {view.trick.map((p) => (
              <div key={p.seat} className="flex flex-col items-center gap-1.5 card-enter">
                <PlayingCard card={p.card} size="md" />
                <span className="text-[11px] font-bold text-white bg-[#070e17]/90 border border-white/15 rounded-full px-2.5 py-0.5">{name(p.seat)}</span>
                {p.demand && (
                  <span className="chip bg-gold/25 text-gold border border-gold/50 font-extrabold">
                    <Sparkles size={11} />
                    {p.demand.kind === "card" ? t("jj.demandCard", { card: cardLabel(p.demand.card) }) : t("jj.demandHighest", { suit: suitSymbol(p.demand.suit) })}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <Swords size={20} className="text-accent/65" />
            {view.lastRound ? (
              <span className="chip bg-gold/20 border border-gold/45 text-gold font-bold">
                {name(0)} {view.lastRound.won[0]} – {view.lastRound.won[1]} {name(1)}
              </span>
            ) : (
              <span className="text-xs font-extrabold uppercase tracking-wider text-white/40">{t("games.japanese_joker.name")}</span>
            )}
          </div>
        )}
      </div>

      {/* Your 5 Open/Hidden Table Stacks */}
      {view.phase !== "trump" && (
        <DuelTableRow
          piles={view.table[me] ?? []}
          playable={myTurn ? playable : new Set()}
          onPlay={myTurn ? play : undefined}
          label={t("jj.myTable")}
          caption={t("ui.yourTable")}
        />
      )}

      {/* High-Contrast Hero Station & Jumbo Private Hand */}
      {mySeat !== null && view.you && (
        <div className="hero-hand-tray" data-my-turn={myTurn ? "true" : "false"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="w-full sm:w-auto sm:min-w-68">
              <SeatTag seat={me} seats={seats} active={myTurn} compact>
                <span className="text-text-2 font-semibold tabular-nums">
                  {t("jj.cardsWon")}: {view.won[me]}
                </span>
                <span className="text-gold font-extrabold tabular-nums">{view.scores[me]}</span>
              </SeatTag>
            </div>
            {myTurn && view.phase === "play" && (
              <span className="chip bg-primary/18 text-primary border border-primary/40 font-bold">{t("jj.playHint")}</span>
            )}
          </div>

          {myTurn && view.phase === "trump" && (
            <div className="action-dock flex flex-wrap gap-2.5 items-center justify-center fade-in" role="group" aria-label={t("joker.chooseTrump")}>
              <span className="text-xs sm:text-sm font-extrabold text-white mr-1">{t("joker.chooseTrump")}:</span>
              {SUITS.map((s) => {
                const red = s === "H" || s === "D";
                return (
                  <button
                    key={s}
                    type="button"
                    className={`suit-card-btn ${red ? "text-[#e11d48]" : "text-[#0f172a]"}`}
                    onClick={() => onAction({ type: "trump", suit: s })}
                  >
                    <SuitIcon suit={s} size={22} />
                    <span className="sr-only">{suitSymbol(s)}</span>
                  </button>
                );
              })}
              <button type="button" className="btn-gold h-11 px-4" onClick={() => onAction({ type: "trump", suit: "none" })}>
                {t("game.noTrump")}
              </button>
            </div>
          )}

          <div className="grid gap-1.5 justify-items-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-2/80">{t("game.yourHand")}</span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2.5 justify-center pb-0.5" role="group" aria-label={t("game.yourHand")}>
              {view.you.hand.map((c) => {
                const canPlay = myTurn && view.phase === "play" && playable.has(c);
                return (
                  <PlayingCard
                    key={c}
                    card={c}
                    size="md"
                    playable={!myTurn || view.phase !== "play" || playable.has(c)}
                    onClick={canPlay ? () => play(c) : undefined}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Joker Demand Picker Modal */}
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
              {SUITS.map((s) => {
                const red = s === "H" || s === "D";
                return (
                  <button
                    key={s}
                    type="button"
                    className={`suit-card-btn !h-10 px-3 gap-1.5 text-xs ${red ? "text-[#e11d48]" : "text-[#0f172a]"}`}
                    onClick={() => {
                      onAction({ type: "play", card: joker, demand: { kind: "highest", suit: s } });
                      setJoker(null);
                    }}
                  >
                    <SuitIcon suit={s} size={16} />
                    <span>{t("jj.demandHighest", { suit: suitSymbol(s) })}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
