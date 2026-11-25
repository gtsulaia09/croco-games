import { useEffect, useState } from "react";
import { Flame, Info, Sparkles, Trophy } from "lucide-react";
import type { PokerVariant, PokerView } from "@croco/game-engine/games/poker";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { ChipIcon, opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

const VARIANT_META: Record<PokerVariant, { feltClass: string; ruleKey: string | null; badgeClass: string }> = {
  holdem: {
    feltClass: "felt-poker",
    ruleKey: null,
    badgeClass: "bg-primary/15 text-primary border border-primary/35",
  },
  shortdeck: {
    feltClass: "felt-shortdeck",
    ruleKey: "ui.shortDeckRule",
    badgeClass: "bg-[#e11d48]/20 text-[#fb7185] border border-[#e11d48]/40",
  },
  omaha: {
    feltClass: "felt-omaha",
    ruleKey: "ui.omahaRule",
    badgeClass: "bg-accent/15 text-accent border border-accent/35",
  },
  omaha_hilo: {
    feltClass: "felt-omaha-hilo",
    ruleKey: "ui.omahaHiLoRule",
    badgeClass: "bg-gold/15 text-gold border border-gold/40",
  },
};

function MiniHoleBacks({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center -space-x-1.5 ml-0.5" aria-hidden="true">
      {Array.from({ length: Math.min(count, 4) }, (_, i) => (
        <span key={i} className="inline-block w-3 h-4.5 rounded-[2px] bg-gradient-to-br from-[#12455d] to-[#081f2c] border border-gold/45" />
      ))}
    </span>
  );
}

function computeBlindSeats(view: PokerView): { sb: number | null; bb: number | null } {
  const active = view.players.filter((p) => !p.busted).map((p) => p.seat);
  if (active.length < 2) return { sb: null, bb: null };
  const idx = active.indexOf(view.dealer);
  const start = idx >= 0 ? idx : 0;
  if (active.length === 2) {
    return { sb: active[start]!, bb: active[(start + 1) % 2]! };
  }
  return {
    sb: active[(start + 1) % active.length]!,
    bb: active[(start + 2) % active.length]!,
  };
}

export default function PokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<PokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const you = view.you;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const [amount, setAmount] = useState(you?.raise?.min ?? 0);
  const [showRanks, setShowRanks] = useState(false);

  useEffect(() => {
    if (you?.raise) setAmount(you.raise.min);
  }, [you?.raise?.min, you?.raise]);

  const me = mySeat !== null ? view.players[mySeat] : undefined;
  const clamp = (v: number) => (you?.raise ? Math.max(you.raise.min, Math.min(you.raise.max, Math.round(v))) : v);
  const last = view.lastHand;
  const meta = VARIANT_META[view.variant];
  const blinds = computeBlindSeats(view);
  const winnerSeats = new Set((last?.awards ?? []).map((a) => a.seat));
  const isFourCard = view.variant === "omaha" || view.variant === "omaha_hilo";
  const opps = opponentsOrder(view.players.length, mySeat);

  function renderPokerSeat(s: number, compact = false) {
    const p = view.players[s]!;
    const shown = last?.revealed[s];
    const isWinner = winnerSeats.has(s) && view.board.length === 0;
    return (
      <div key={s} className="grid gap-1 min-w-0">
        <SeatTag seat={s} seats={seats} active={view.toAct === s} dealer={view.dealer === s} dimmed={p.folded || p.busted} compact={compact}>
          <span className="inline-flex items-center gap-1 font-bold text-white tabular-nums">
            <ChipIcon size={11} /> {p.chips.toLocaleString()}
          </span>
          {blinds.sb === s && !p.busted && <span className="blind-disc bg-accent/25 text-accent border border-accent/45">{t("ui.sb")}</span>}
          {blinds.bb === s && !p.busted && <span className="blind-disc bg-warning/25 text-warning border border-warning/45">{t("ui.bb")}</span>}
          {p.folded && !p.busted && <span className="chip bg-surface-3 text-muted h-4 px-1.5 text-[10px]">{t("poker.fold")}</span>}
          {p.allIn && <span className="chip bg-danger/25 text-danger border border-danger/45 h-4 px-1.5 text-[10px] font-bold">{t("poker.allin")}</span>}
          {p.busted && <span className="chip bg-surface-3 text-muted h-4 px-1.5 text-[10px]">{t("poker.busted")}</span>}
          {isWinner && <Trophy size={12} className="text-gold" />}
          {s !== mySeat && !p.folded && !p.busted && !shown && <MiniHoleBacks count={p.holeCount} />}
        </SeatTag>
        {p.street > 0 && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full bg-bg/85 border border-gold/40 px-2 py-0.5 text-[10px] font-bold text-gold tabular-nums">
              <ChipIcon size={10} /> {p.street.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`table-arena ${meta.feltClass}`}>
      {/* Top HUD Bar */}
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className={`chip ${meta.badgeClass}`}>{t(`games.${view.variant}.name`)}</span>
            <span className="chip bg-bg/80 border border-white/10 text-text-2">{t("poker.handOf", { n: view.handNumber, max: view.maxHands })}</span>
            <span className="chip bg-bg/80 border border-white/10 text-text-2">
              {t("poker.blinds", { sb: view.blinds.small, bb: view.blinds.big })}
              {view.blinds.ante > 0 ? ` · +${view.blinds.ante}` : ""}
            </span>
            <span className="chip bg-bg/80 border border-white/10 text-muted">{t(`poker.structures.${view.structure}`)}</span>
          </>
        }
      />

      {/* Variant Rule Distinction Strip (Short Deck / Omaha / Omaha Hi-Lo) */}
      {meta.ruleKey && (
        <div className="rounded-xl bg-bg/65 border border-white/10 px-3 py-1.5 text-[11px] sm:text-xs text-text-2 flex flex-wrap items-center justify-center gap-2 text-center">
          {view.variant === "omaha_hilo" ? (
            <>
              <span className="chip bg-gold text-[#1d1404] h-5 px-2 text-[10px] font-bold">{t("ui.highPot")}</span>
              <span className="chip bg-accent text-[#041922] h-5 px-2 text-[10px] font-bold">{t("ui.lowPot")}</span>
            </>
          ) : (
            <Sparkles size={13} className="text-gold shrink-0" />
          )}
          <span>{t(meta.ruleKey)}</span>
          {view.variant === "shortdeck" && (
            <button type="button" className="chip bg-white/10 text-white hover:bg-white/20" onClick={() => setShowRanks((v) => !v)}>
              <Info size={11} /> 6+
            </button>
          )}
        </div>
      )}
      {view.variant === "shortdeck" && showRanks && (
        <div className="rounded-lg bg-bg/80 border border-[#e11d48]/40 px-3 py-1.5 text-[11px] text-text-2 text-center fade-in">
          {t("poker.shortDeckRanks")}
        </div>
      )}

      {/* Opponent Seats Ring (compact multi-column even on mobile to avoid vertical bloat) */}
      <div className={`grid gap-2 items-start ${opps.length >= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
        {opps.map((s) => renderPokerSeat(s, true))}
      </div>

      {/* Center Poker Table Felt: #1 Community Cards, #3 Current Pot */}
      <div className="poker-oval bg-black/22 px-3 sm:px-7 py-3 sm:py-4 flex flex-col items-center justify-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="chip bg-bg/75 border border-white/10 text-text-2">{t(`poker.streets.${view.phase}`)}</span>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-bg/90 border border-gold/55 px-3.5 py-1">
            <ChipIcon size={15} />
            <span className="text-xs font-semibold text-muted">{t("poker.pot")}:</span>
            <span className="text-sm sm:text-base font-extrabold text-gold tabular-nums">{view.pot.toLocaleString()}</span>
          </div>
          {view.currentBet > 0 && (
            <span className="chip bg-bg/75 border border-primary/35 text-primary tabular-nums">
              {t("poker.currentBet", { n: view.currentBet.toLocaleString() })}
            </span>
          )}
          {you && you.toCall > 0 && myTurn && (
            <span className="chip bg-warning/20 border border-warning/40 text-warning tabular-nums">
              {t("poker.toCall", { n: you.toCall.toLocaleString() })}
            </span>
          )}
        </div>

        {/* 5 Community Card Slots */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 min-h-[4.9rem]" aria-label={t("ui.community")}>
            {view.board.map((c) => (
              <PlayingCard key={c} card={c} size="md" animate />
            ))}
            {Array.from({ length: 5 - view.board.length }, (_, i) => (
              <span key={i} className="pcard-slot" aria-hidden="true" />
            ))}
          </div>
          {isFourCard && <span className="text-[10px] font-semibold text-accent/90">{t("poker.useBoard")}</span>}
        </div>

        {/* Showdown Winner & Split-Pot Presentation */}
        {last && last.awards.length > 0 && (
          <div className="w-full max-w-xl rounded-xl bg-bg/85 border border-gold/40 px-3 py-2 text-xs grid gap-1.5 fade-in">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {last.awards.map((a, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold border ${
                    a.side === "low" ? "bg-accent/15 text-accent border-accent/40" : "bg-gold/15 text-gold border-gold/45"
                  }`}
                >
                  <Trophy size={12} />
                  {a.side === "low" && <span className="text-[10px] font-bold">{t("ui.lowPot")}</span>}
                  {a.side === "high" && view.variant === "omaha_hilo" && <span className="text-[10px] font-bold">{t("ui.highPot")}</span>}
                  <span>{t("poker.won", { name: name(a.seat), amount: a.amount })}</span>
                  {a.side === "low" && <span className="sr-only">({t("poker.low")})</span>}
                  {a.category && <span className="text-white/85 font-normal">· {t(`poker.hands.${a.category}`)}</span>}
                </span>
              ))}
            </div>
            {Object.keys(last.revealed).length > 0 && (
              <div className="flex flex-wrap gap-2.5 justify-center pt-1 border-t border-white/10">
                {Object.entries(last.revealed).map(([seat, cards]) => (
                  <span key={seat} className="inline-flex items-center gap-1.5 bg-surface-3/80 border border-white/10 rounded-lg px-2 py-1">
                    <span className="text-[11px] font-semibold text-text-2">{name(Number(seat))}:</span>
                    <span className="flex gap-0.5">
                      {cards.map((c) => (
                        <PlayingCard key={c} card={c} size="xs" />
                      ))}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* #2 Player's Own Cards + #5 Available Actions */}
      {me && you && (
        <div className="grid gap-2">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <div className="w-full sm:w-auto sm:min-w-60">{renderPokerSeat(mySeat!)}</div>
            <div className="flex flex-col items-center gap-1">
              <div className={`flex items-center justify-center ${isFourCard ? "gap-1.5 sm:gap-2" : "gap-2.5"}`} role="group" aria-label={t("game.yourHand")}>
                {you.hole.map((c) => (
                  <PlayingCard key={c} card={c} size="md" />
                ))}
              </div>
              {isFourCard && <span className="text-[10px] font-semibold text-accent/90">{t("poker.useHole")}</span>}
            </div>
          </div>

          {myTurn && (
            <div className="rounded-xl bg-bg/90 border border-primary/45 p-2.5 grid gap-2 fade-in">
              <div className="flex flex-wrap gap-2 justify-center">
                <button className="btn-danger min-w-22" onClick={() => onAction({ type: "fold" })}>
                  {t("poker.fold")}
                </button>
                {you.canCheck ? (
                  <button className="btn-secondary min-w-26" onClick={() => onAction({ type: "check" })}>
                    {t("poker.check")}
                  </button>
                ) : (
                  <button className="btn-secondary min-w-26 tabular-nums" onClick={() => onAction({ type: "call" })}>
                    {t("poker.call", { n: you.toCall })}
                  </button>
                )}
                {you.raise && (
                  <button className="btn-primary min-w-32 tabular-nums" onClick={() => onAction({ type: "raise", to: clamp(amount) })}>
                    {view.currentBet === 0 ? t("poker.bet") : t("poker.raise")} {clamp(amount)}
                  </button>
                )}
                {view.structure === "no_limit" && me.chips > 0 && (
                  <button className="btn-gold min-w-22" onClick={() => onAction({ type: "allin" })}>
                    <Flame size={14} /> {t("poker.allin")}
                  </button>
                )}
              </div>

              {you.raise && you.raise.max > you.raise.min && (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 justify-center pt-1.5 border-t border-line/80">
                  <div className="flex flex-wrap gap-1 justify-center">
                    <button type="button" className="btn-secondary btn-sm h-7 px-2" onClick={() => setAmount(you.raise!.min)}>
                      {t("ui.minBet")}
                    </button>
                    <button type="button" className="btn-secondary btn-sm h-7 px-2" onClick={() => setAmount(clamp(view.currentBet + view.pot * 0.5))}>
                      {t("ui.halfPot")}
                    </button>
                    <button type="button" className="btn-secondary btn-sm h-7 px-2" onClick={() => setAmount(clamp(view.currentBet + view.pot * 0.75))}>
                      {t("ui.threeQuarterPot")}
                    </button>
                    <button type="button" className="btn-secondary btn-sm h-7 px-2" onClick={() => setAmount(clamp(view.currentBet + view.pot))}>
                      {t("ui.fullPot")}
                    </button>
                    <button type="button" className="btn-secondary btn-sm h-7 px-2" onClick={() => setAmount(you.raise!.max)}>
                      {t("ui.maxBet")}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={you.raise.min}
                    max={you.raise.max}
                    value={clamp(amount)}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-36 sm:w-48 accent-[var(--color-primary)] cursor-pointer"
                    aria-label={t("poker.raise")}
                  />
                  <input
                    type="number"
                    className="input w-24 h-8 text-xs font-semibold tabular-nums text-center"
                    value={clamp(amount)}
                    min={you.raise.min}
                    max={you.raise.max}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
