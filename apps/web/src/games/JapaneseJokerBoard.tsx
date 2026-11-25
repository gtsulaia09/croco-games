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
      <span className="text-[11px] font-medium text-text-2/85">{caption}</span>
      <div className="flex flex-wrap gap-2 sm:gap-3 justify-center" role="group" aria-label={label}>
        {piles.map((p, i) => (
          <div
            key={i}
            className="relative w-[2.95rem] h-[4.2rem] sm:w-[3.85rem] sm:h-[5.45rem] rounded-lg border border-white/12 bg-black/20 flex items-center justify-center"
          >
            {p.hasDown && (
              <span className="absolute inset-0 translate-x-1 translate-y-1 pointer-events-none opacity-90">
                <PlayingCard back size="sm" />
              </span>
            )}
            {p.up ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <PlayingCard
                  card={p.up}
                  playable={!onPlay || playable.has(p.up)}
                  onClick={onPlay && playable.has(p.up) ? () => onPlay(p.up!) : undefined}
                />
              </span>
            ) : !p.hasDown ? (
              <span className="text-[10px] text-white/25">—</span>
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
            <span className="chip bg-bg/75 border border-white/10 text-text-2">{t("game.round", { n: view.round })}</span>
            {view.trumpChosen && <TrumpBadge suit={view.trump} />}
            <span className="chip bg-gold/15 border border-gold/35 text-gold font-semibold tabular-nums">
              {view.scores[0]} – {view.scores[1]} / {view.targetPoints}
            </span>
          </>
        }
      />

      {/* Opponent Seat & 5 Open/Hidden Stacks */}
      <div className="grid gap-2">
        <div className="max-w-md mx-auto w-full">
          <SeatTag seat={opp} seats={seats} active={view.toAct === opp} compact>
            <MiniCardCount count={view.handCounts[opp] ?? 0} />
            <span className="text-text-2 font-medium tabular-nums">
              {t("jj.cardsWon")}: {view.won[opp]}
            </span>
            <span className="text-gold font-bold tabular-nums">{view.scores[opp]}</span>
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

      {/* Central Head-to-Head Clash Tray */}
      <div className="rounded-2xl border border-white/12 bg-black/22 px-3 py-3 min-h-28 sm:min-h-32 flex flex-col items-center justify-center gap-2">
        {view.trick.length > 0 ? (
          <div className="flex items-center justify-center gap-5 sm:gap-8">
            {view.trick.map((p) => (
              <div key={p.seat} className="flex flex-col items-center gap-1 card-enter">
                <PlayingCard card={p.card} size="sm" />
                <span className="text-[11px] font-semibold text-white bg-bg/80 rounded-md px-2 py-0.5">{name(p.seat)}</span>
                {p.demand && (
                  <span className="chip bg-gold/20 text-gold border border-gold/40">
                    <Sparkles size={11} />
                    {p.demand.kind === "card" ? t("jj.demandCard", { card: cardLabel(p.demand.card) }) : t("jj.demandHighest", { suit: suitSymbol(p.demand.suit) })}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center">
            <Swords size={18} className="text-accent/50" />
            {view.lastRound ? (
              <span className="chip bg-gold/15 border border-gold/35 text-gold font-semibold">
                {name(0)} {view.lastRound.won[0]} – {view.lastRound.won[1]} {name(1)}
              </span>
            ) : (
              <span className="text-xs text-white/35 font-medium">{t("games.japanese_joker.name")}</span>
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

      {/* Your Seat, Trump Selection & Private Hand */}
      {mySeat !== null && view.you && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <div className="w-full sm:w-auto sm:min-w-68">
              <SeatTag seat={me} seats={seats} active={myTurn} compact>
                <span className="text-text-2 font-medium tabular-nums">
                  {t("jj.cardsWon")}: {view.won[me]}
                </span>
                <span className="text-gold font-bold tabular-nums">{view.scores[me]}</span>
              </SeatTag>
            </div>
            {myTurn && view.phase === "play" && (
              <span className="text-xs text-primary font-medium">{t("jj.playHint")}</span>
            )}
          </div>

          {myTurn && view.phase === "trump" && (
            <div className="rounded-xl bg-bg/85 border border-primary/45 p-2.5 flex flex-wrap gap-2 items-center justify-center fade-in" role="group" aria-label={t("joker.chooseTrump")}>
              <span className="text-xs sm:text-sm font-semibold text-white mr-1">{t("joker.chooseTrump")}:</span>
              {SUITS.map((s) => {
                const red = s === "H" || s === "D";
                return (
                  <button
                    key={s}
                    className={`btn-secondary btn-sm min-w-11 h-10 ${red ? "text-[#ff6b6b]" : "text-white"}`}
                    onClick={() => onAction({ type: "trump", suit: s })}
                  >
                    <SuitIcon suit={s} size={18} />
                    <span className="sr-only">{suitSymbol(s)}</span>
                  </button>
                );
              })}
              <button className="btn-gold btn-sm h-10" onClick={() => onAction({ type: "trump", suit: "none" })}>
                {t("game.noTrump")}
              </button>
            </div>
          )}

          <div className="grid gap-1 justify-items-center">
            <span className="text-[11px] font-medium text-text-2/80">{t("game.yourHand")}</span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center pb-0.5" role="group" aria-label={t("game.yourHand")}>
              {view.you.hand.map((c) => {
                const canPlay = myTurn && view.phase === "play" && playable.has(c);
                return (
                  <PlayingCard
                    key={c}
                    card={c}
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
                    className={`btn-secondary btn-sm ${red ? "text-[#ff6b6b]" : "text-white"}`}
                    onClick={() => {
                      onAction({ type: "play", card: joker, demand: { kind: "highest", suit: s } });
                      setJoker(null);
                    }}
                  >
                    <SuitIcon suit={s} size={14} /> {t("jj.demandHighest", { suit: suitSymbol(s) })}
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
